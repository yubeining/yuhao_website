package com.mfg.domain.quote;

import com.mfg.common.dto.PagedResponse;
import com.mfg.common.exception.BusinessException;
import com.mfg.domain.order.OrderQuoting;
import com.mfg.domain.order.QuotableLine;
import com.mfg.domain.order.QuotableOrder;
import com.mfg.platform.fx.FxRateService;
import com.mfg.platform.fx.FxRateView;
import com.mfg.platform.identity.Organization;
import com.mfg.platform.config.AppConfigService;
import com.mfg.platform.identity.ExternalUserRepository;
import com.mfg.platform.identity.OrganizationRepository;
import com.mfg.platform.notification.NotificationRequest;
import com.mfg.platform.notification.NotificationService;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 人工报价：运营设客户加成率、逐行填原价、发出；客户看价、确认或拒绝（设计文档 13，2026-09-17 拍板）。
 *
 * <p>对客价 = 原价 × 汇率 × 客户加成率（{@link PriceCalculator}）。汇率取 ECB 最新一批，客户确认那一刻才锁。
 *
 * <p><b>并发</b>：发出、确认、拒绝都先通过 {@link OrderQuoting} 锁住订单行，同一张订单的这几件事只能排队，
 * 于是「客户确认旧版」和「运营重报新版」不会都成功。加锁顺序固定为「订单 → 报价」。
 *
 * <p>客户端方法都显式收 {@code customerOrgId}（§3 铁律 1），查询都带这个条件（铁律 2）；别人的一律 404。
 */
@Service
class QuoteService {

    /** 客户报价列表只列这两种。 */
    private static final Set<Quote.Status> CUSTOMER_VISIBLE = Set.of(Quote.Status.SENT, Quote.Status.CONFIRMED);
    /** 订单详情里「当前报价」：还包括刚被自己拒绝的那一版，好让客户知道在等重报，而不是显示「暂无报价」。 */
    private static final Set<Quote.Status> CUSTOMER_CURRENT =
            Set.of(Quote.Status.SENT, Quote.Status.CONFIRMED, Quote.Status.REJECTED);
    /** 一次最多查多少张单的报价标记（运营列表一页的量级）。 */
    static final int MAX_SUMMARY_ORDERS = 200;

    private final QuoteRepository quotes;
    private final QuoteLineRepository quoteLines;
    private final CustomerMarkupRepository markups;
    private final OrderQuoting orders;
    private final FxRateService fxRates;
    private final OrganizationRepository organizations;
    private final ExternalUserRepository externalUsers;
    private final NotificationService notifications;
    private final QuoteEmailTemplate emailTemplate;
    private final AppConfigService appConfig;

    QuoteService(QuoteRepository quotes, QuoteLineRepository quoteLines, CustomerMarkupRepository markups,
                 OrderQuoting orders, FxRateService fxRates, OrganizationRepository organizations,
                 ExternalUserRepository externalUsers, NotificationService notifications,
                 QuoteEmailTemplate emailTemplate, AppConfigService appConfig) {
        this.quotes = quotes;
        this.quoteLines = quoteLines;
        this.markups = markups;
        this.orders = orders;
        this.fxRates = fxRates;
        this.organizations = organizations;
        this.externalUsers = externalUsers;
        this.notifications = notifications;
        this.emailTemplate = emailTemplate;
        this.appConfig = appConfig;
    }

    /** 运营填的一行原价。 */
    record LineInput(UUID lineId, BigDecimal unitPriceCny) {
    }

    // ---------- 运营：客户加成率 ----------

    @Transactional(readOnly = true)
    public MarkupView getMarkup(UUID customerOrgId) {
        requireCustomer(customerOrgId);
        return markupView(customerOrgId);
    }

    @Transactional
    public MarkupView setMarkup(UUID customerOrgId, BigDecimal markupRate) {
        requireCustomer(customerOrgId);
        markups.upsert(UUID.randomUUID(), customerOrgId, markupRate, Instant.now());
        return markupView(customerOrgId);
    }

    /** 清掉公司自己的系数 → 回落到全局默认。 */
    @Transactional
    public MarkupView clearMarkup(UUID customerOrgId) {
        requireCustomer(customerOrgId);
        markups.deleteByCustomerOrgId(customerOrgId);
        return markupView(customerOrgId);
    }

    // ---------- 运营：报价设置（全局默认 + 公司概览）----------

    @Transactional(readOnly = true)
    public QuoteSettingsView settings(Pageable pageable) {
        BigDecimal defaultRate = appConfig.quoteDefaultMarkupRate().orElse(null);
        Page<Organization> page = organizations.findByTypeOrderByCreatedAtDesc(Organization.Type.CUSTOMER, pageable);
        Map<UUID, BigDecimal> own = markups.findAll().stream()
                .collect(Collectors.toMap(CustomerMarkup::getCustomerOrgId, CustomerMarkup::getMarkupRate));
        return new QuoteSettingsView(defaultRate, PagedResponse.of(page, org -> {
            BigDecimal rate = own.get(org.getId());
            return new QuoteCompanyRate(org.getId(), org.getName(), rate,
                    rate != null ? rate : defaultRate);
        }));
    }

    @Transactional
    public BigDecimal setDefaultMarkup(BigDecimal markupRate) {
        return appConfig.setQuoteDefaultMarkupRate(markupRate);
    }

    private MarkupView markupView(UUID customerOrgId) {
        BigDecimal defaultRate = appConfig.quoteDefaultMarkupRate().orElse(null);
        return markups.findByCustomerOrgId(customerOrgId)
                .map(m -> new MarkupView(customerOrgId, m.getMarkupRate(), m.getUpdatedAt(), defaultRate,
                        m.getMarkupRate()))
                .orElseGet(() -> new MarkupView(customerOrgId, null, null, defaultRate, defaultRate));
    }

    // ---------- 运营：报价 ----------

    /**
     * 锁单 → 行必须和订单行一一对应 → 客户必须已有加成率 → 旧的有效版作废 → 存新版 → 订单改成已报价。
     *
     * <p>★ 旧版先作废并 flush，再插新版：库里「每单最多一条 SENT」的唯一索引按语句检查。
     */
    @Transactional
    public OpsQuoteView send(UUID opsUserId, UUID orderId, Quote.Currency currency, LocalDate commitDate,
                             List<LineInput> inputs) {
        QuotableOrder order = orders.lockForQuoting(orderId);
        List<LineInput> ordered = matchLines(order, inputs);
        BigDecimal markupRate = effectiveMarkup(order.customerOrgId());
        // 承诺交期必须晚于今天；lead_days 由它反推（旧列仍非空且 >0，下个版本再删）
        LocalDate sentDate = LocalDate.now(java.time.ZoneOffset.UTC);
        if (commitDate == null || !commitDate.isAfter(sentDate)) {
            throw BusinessException.badRequest("quote.commit_date_invalid");
        }
        int leadDays = (int) java.time.temporal.ChronoUnit.DAYS.between(sentDate, commitDate);

        quotes.findByCustomerOrderIdAndStatus(orderId, Quote.Status.SENT).ifPresent(previous -> {
            previous.supersede();
            quotes.saveAndFlush(previous);
        });
        Instant now = Instant.now();
        Quote quote = quotes.saveAndFlush(new Quote(orderId, order.customerOrgId(),
                quotes.maxVersionNo(orderId) + 1, currency, commitDate, leadDays, markupRate, opsUserId, now));
        List<QuoteLine> lines = new ArrayList<>();
        for (int i = 0; i < order.lines().size(); i++) {
            QuotableLine line = order.lines().get(i);
            lines.add(new QuoteLine(quote.getId(), line.id(), order.customerOrgId(), i + 1, line.code(),
                    line.partName(), line.quantity(), ordered.get(i).unitPriceCny()));
        }
        quoteLines.saveAllAndFlush(lines);
        orders.markQuoted(order.customerOrgId(), orderId);
        notifyQuoteSent(order.customerOrgId(), orderId, commitDate, currency);
        return opsView(quote, lines, latestFx().orElse(null));
    }

    /**
     * 报价发出后给客户发邮件。
     *
     * <p>★ 走 {@code notifications.notify}（事务提交后异步发）：发信失败不该让运营的报价失败，
     * 也不该在事务里等外部服务。收件人取该组织第一个可用成员 —— 现在没有"主联系人"这个概念。
     * ★ 金额这里不写死：SENT 状态的价是按最新汇率现算的，邮件里就写当时的试算价，正文里注明以门户为准。
     */
    private void notifyQuoteSent(UUID customerOrgId, UUID orderId, LocalDate commitDate, Quote.Currency currency) {
        externalUsers.findByOrgId(customerOrgId, PageRequest.of(0, 1)).stream()
                .filter(u -> u.getStatus() == com.mfg.platform.identity.ExternalUser.Status.ACTIVE)
                .findFirst()
                .ifPresent(user -> {
                    String amount = customerViewAmount(orderId, currency);
                    String orderTitle = orderTitleOf(customerOrgId, orderId);
                    String[] mail = emailTemplate.render(user.getLocale(), orderTitle, amount,
                            currency.name(), commitDate.toString());
                    notifications.notify(NotificationRequest.email(user.getEmail(), mail[0], mail[1]));
                });
    }

    private String customerViewAmount(UUID orderId, Quote.Currency currency) {
        return quotes.findByCustomerOrderIdAndStatus(orderId, Quote.Status.SENT)
                .map(q -> customerView(q, linesOf(q), null))
                .map(v -> v.total() == null ? "-" : v.total().toPlainString())
                .orElse("-");
    }

    private String orderTitleOf(UUID customerOrgId, UUID orderId) {
        return orders.titles(customerOrgId, java.util.List.of(orderId)).getOrDefault(orderId, "-");
    }

    /** 发出前试算：同样的校验，用当前加成率和最新汇率算，不落库。 */
    @Transactional(readOnly = true)
    public QuotePreviewView preview(UUID orderId, Quote.Currency currency, List<LineInput> inputs) {
        QuotableOrder order = orders.findSubmitted(orderId);
        List<LineInput> ordered = matchLines(order, inputs);
        BigDecimal markupRate = effectiveMarkup(order.customerOrgId());
        LatestFx fx = requireFx();
        PriceCalculator.Rates rates = fx.ratesFor(currency).orElseThrow(QuoteService::fxUnavailable);
        List<PriceCalculator.Line> calcLines = new ArrayList<>();
        for (int i = 0; i < order.lines().size(); i++) {
            calcLines.add(new PriceCalculator.Line(ordered.get(i).unitPriceCny(), order.lines().get(i).quantity()));
        }
        PriceCalculator.Priced priced = PriceCalculator.price(calcLines, markupRate, rates);
        List<OpsQuoteLineView> views = new ArrayList<>();
        for (int i = 0; i < order.lines().size(); i++) {
            QuotableLine line = order.lines().get(i);
            PriceCalculator.PricedLine p = priced.lines().get(i);
            views.add(new OpsQuoteLineView(line.id(), line.code(), line.partName(), line.quantity(),
                    calcLines.get(i).unitPriceCny(), p.unitPrice(), p.lineTotal()));
        }
        return new QuotePreviewView(currency.name(), markupRate, fx.rateDate(), rates.eurCny(), rates.eurQuote(),
                priced.total(), views);
    }

    /** 这张单的全部报价版本，新的在前。没有汇率数据时，未确认版本的对客价为空，不报错。 */
    @Transactional(readOnly = true)
    public List<OpsQuoteView> listForOps(UUID orderId) {
        QuotableOrder order = orders.findSubmitted(orderId);
        List<Quote> versions = quotes.findByCustomerOrderIdOrderByVersionNoDesc(orderId);
        Map<UUID, List<QuoteLine>> linesByQuote = linesByQuote(order.customerOrgId(), versions);
        LatestFx fx = latestFx().orElse(null);
        return versions.stream()
                .map(q -> opsView(q, linesByQuote.getOrDefault(q.getId(), List.of()), fx))
                .toList();
    }

    /** 运营列表用：这些订单各自最新一版报价的状态（比如看出哪张「待报价」的单是被客户拒过的）。 */
    @Transactional(readOnly = true)
    public List<OpsQuoteSummaryView> summaries(List<UUID> orderIds) {
        if (orderIds.size() > MAX_SUMMARY_ORDERS) {
            throw BusinessException.badRequest("common.bad_request");
        }
        if (orderIds.isEmpty()) {
            return List.of();
        }
        return quotes.findLatestByCustomerOrderIdIn(orderIds).stream()
                .map(q -> new OpsQuoteSummaryView(q.getCustomerOrderId(), q.getVersionNo(), q.getStatus().name()))
                .toList();
    }

    // ---------- 客户 ----------

    /**
     * 当前报价：待确认的（按最新汇率算）、已确认的（快照）或刚拒绝的（没有价格）里版本最新的一条。都没有 → 404。
     * 待确认的算不出价（没有汇率）→ 503，不给一个没有价格的待确认报价。
     */
    @Transactional(readOnly = true)
    public CustomerQuoteView current(UUID customerOrgId, UUID orderId) {
        Quote quote = quotes.findFirstByCustomerOrderIdAndCustomerOrgIdAndStatusInOrderByVersionNoDesc(
                        orderId, customerOrgId, CUSTOMER_CURRENT)
                .orElseThrow(() -> BusinessException.notFound("quote.not_found"));
        CustomerQuoteView view = customerView(quote, linesOf(quote),
                quote.getStatus() == Quote.Status.SENT ? requireFx() : null);
        if (quote.getStatus() == Quote.Status.SENT && view.total() == null) {
            throw fxUnavailable();
        }
        return view;
    }

    @Transactional(readOnly = true)
    public PagedResponse<CustomerQuoteSummaryView> listForCustomer(UUID customerOrgId, Pageable pageable) {
        Page<Quote> page = quotes.findByCustomerOrgIdAndStatusIn(customerOrgId, CUSTOMER_VISIBLE, pageable);
        List<Quote> content = page.getContent();
        Map<UUID, List<QuoteLine>> linesByQuote = linesByQuote(customerOrgId, content);
        Map<UUID, String> titles = orders.titles(customerOrgId,
                content.stream().map(Quote::getCustomerOrderId).collect(Collectors.toSet()));
        // 没有汇率时待确认的那几条没有价格，列表照样返回（不因为一条算不出来整页失败）
        LatestFx fx = latestFx().orElse(null);
        return PagedResponse.of(page, q -> {
            CustomerQuoteView v = customerView(q, linesByQuote.getOrDefault(q.getId(), List.of()), fx);
            return new CustomerQuoteSummaryView(v.id(), v.orderId(), titles.get(v.orderId()), v.status(),
                    v.currency(), v.commitDate(), v.priceLocked(), v.rateDate(), v.total(), v.sentAt(),
                    v.confirmedAt());
        });
    }

    /**
     * 锁单 → 报价必须是这个客户这张单的、还在待确认 → 取最新汇率，日期必须和客户看到的一致 → 算价、写快照 → 订单改成已确认。
     */
    @Transactional
    public CustomerQuoteView confirm(UUID customerOrgId, UUID userId, UUID orderId, UUID quoteId,
                                     LocalDate seenRateDate) {
        orders.lockForCustomer(customerOrgId, orderId);
        Quote quote = requireOpen(customerOrgId, orderId, quoteId);
        LatestFx fx = requireFx();
        if (!fx.rateDate().equals(seenRateDate)) {
            throw BusinessException.conflict("quote.price_changed");
        }
        PriceCalculator.Rates rates = fx.ratesFor(quote.getCurrency()).orElseThrow(QuoteService::fxUnavailable);
        List<QuoteLine> lines = linesOf(quote);
        PriceCalculator.Priced priced = PriceCalculator.price(
                lines.stream().map(QuoteLine::toCalculatorLine).toList(), quote.getMarkupRate(), rates);
        for (int i = 0; i < lines.size(); i++) {
            lines.get(i).lockPrice(priced.lines().get(i));
        }
        quote.confirm(userId, Instant.now(), fx.rateDate(), rates, priced.total());
        quoteLines.saveAllAndFlush(lines);
        quotes.saveAndFlush(quote);
        orders.markConfirmed(customerOrgId, orderId);
        return customerView(quote, lines, null);
    }

    /** 客户拒绝：报价作废，订单回到已提交，等运营重报。 */
    @Transactional
    public CustomerQuoteView reject(UUID customerOrgId, UUID userId, UUID orderId, UUID quoteId) {
        orders.lockForCustomer(customerOrgId, orderId);
        Quote quote = requireOpen(customerOrgId, orderId, quoteId);
        quote.reject(userId, Instant.now());
        quotes.saveAndFlush(quote);
        List<QuoteLine> lines = linesOf(quote);
        orders.markRejected(customerOrgId, orderId);
        return customerView(quote, lines, null);
    }

    // ---------- helpers ----------

    /** 请求里的行必须和订单行一一对应（不多、不少、不重复），返回按订单行顺序排好的输入。 */
    private static List<LineInput> matchLines(QuotableOrder order, List<LineInput> inputs) {
        Map<UUID, LineInput> byId = inputs.stream()
                .collect(Collectors.toMap(LineInput::lineId, Function.identity(), (a, b) -> a));
        Set<UUID> orderLineIds = order.lines().stream().map(QuotableLine::id).collect(Collectors.toSet());
        if (byId.size() != inputs.size() || !byId.keySet().equals(orderLineIds)) {
            throw BusinessException.badRequest("quote.lines_mismatch");
        }
        return order.lines().stream().map(l -> byId.get(l.id())).toList();
    }

    /**
     * 实际生效的报价系数：公司有自己的值就用它，否则用全局默认；两者都没有 → 明确报错，
     * 不自己编一个数（CLAUDE.md §10 C5）。
     */
    private BigDecimal effectiveMarkup(UUID customerOrgId) {
        return markups.findByCustomerOrgId(customerOrgId)
                .map(CustomerMarkup::getMarkupRate)
                .or(() -> appConfig.quoteDefaultMarkupRate())
                .orElseThrow(() -> BusinessException.conflict("quote.default_markup_missing"));
    }

    private void requireCustomer(UUID orgId) {
        organizations.findById(orgId)
                .filter(o -> o.getType() == Organization.Type.CUSTOMER)
                .orElseThrow(() -> BusinessException.notFound("organization.not_found"));
    }

    private Quote requireOpen(UUID customerOrgId, UUID orderId, UUID quoteId) {
        Quote quote = quotes.findByIdAndCustomerOrderIdAndCustomerOrgId(quoteId, orderId, customerOrgId)
                .orElseThrow(() -> BusinessException.notFound("quote.not_found"));
        if (quote.getStatus() != Quote.Status.SENT) {
            throw BusinessException.conflict("quote.not_open");
        }
        return quote;
    }

    private List<QuoteLine> linesOf(Quote quote) {
        return quoteLines.findByQuoteIdInAndCustomerOrgIdOrderByLineNoAsc(List.of(quote.getId()),
                quote.getCustomerOrgId());
    }

    private Map<UUID, List<QuoteLine>> linesByQuote(UUID customerOrgId, List<Quote> list) {
        if (list.isEmpty()) {
            return Map.of();
        }
        return quoteLines.findByQuoteIdInAndCustomerOrgIdOrderByLineNoAsc(
                        list.stream().map(Quote::getId).toList(), customerOrgId).stream()
                .collect(Collectors.groupingBy(QuoteLine::getQuoteId));
    }

    /** 当前对客价：已确认的读快照；待确认的用 {@code fx} 现算（{@code fx} 为空或缺币种则算不出）；其余不算。 */
    private static Optional<Pricing> pricing(Quote quote, List<QuoteLine> lines, LatestFx fx) {
        if (quote.getStatus() == Quote.Status.CONFIRMED) {
            return Optional.of(new Pricing(true, quote.getFxRateDate(), quote.lockedRates(),
                    new PriceCalculator.Priced(lines.stream().map(QuoteLine::lockedPrice).toList(),
                            quote.getTotalAmount())));
        }
        if (quote.getStatus() != Quote.Status.SENT || fx == null) {
            return Optional.empty();
        }
        return fx.ratesFor(quote.getCurrency()).map(rates -> new Pricing(false, fx.rateDate(), rates,
                PriceCalculator.price(lines.stream().map(QuoteLine::toCalculatorLine).toList(),
                        quote.getMarkupRate(), rates)));
    }

    private static OpsQuoteView opsView(Quote quote, List<QuoteLine> lines, LatestFx fx) {
        Pricing p = pricing(quote, lines, fx).orElse(null);
        List<OpsQuoteLineView> views = new ArrayList<>();
        for (int i = 0; i < lines.size(); i++) {
            QuoteLine l = lines.get(i);
            PriceCalculator.PricedLine pl = p == null ? null : p.priced().lines().get(i);
            views.add(new OpsQuoteLineView(l.getCustomerOrderPartId(), l.getPartCode(), l.getPartName(),
                    l.getQuantity(), l.getUnitPriceCny(),
                    pl == null ? null : pl.unitPrice(), pl == null ? null : pl.lineTotal()));
        }
        return new OpsQuoteView(quote.getId(), quote.getVersionNo(), quote.getStatus().name(),
                quote.getCurrency().name(), quote.getCommitDate(), quote.getMarkupRate(), quote.getSentAt(),
                quote.getConfirmedAt(), quote.getRejectedAt(), p != null && p.locked(),
                p == null ? null : p.rateDate(),
                p == null ? null : p.rates().eurCny(), p == null ? null : p.rates().eurQuote(),
                p == null ? null : p.priced().total(), views);
    }

    /** 算不出价（待确认但没有汇率 / 作废 / 被拒）时价格字段为空，由调用方决定要不要报错。 */
    private static CustomerQuoteView customerView(Quote quote, List<QuoteLine> lines, LatestFx fx) {
        Pricing p = pricing(quote, lines, fx).orElse(null);
        List<CustomerQuoteLineView> views = new ArrayList<>();
        for (int i = 0; i < lines.size(); i++) {
            QuoteLine l = lines.get(i);
            PriceCalculator.PricedLine pl = p == null ? null : p.priced().lines().get(i);
            views.add(new CustomerQuoteLineView(l.getCustomerOrderPartId(), l.getPartCode(), l.getPartName(),
                    l.getQuantity(), pl == null ? null : pl.unitPrice(), pl == null ? null : pl.lineTotal()));
        }
        return new CustomerQuoteView(quote.getId(), quote.getCustomerOrderId(), quote.getStatus().name(),
                quote.getCurrency().name(), quote.getCommitDate(), p != null && p.locked(),
                p == null ? null : p.rateDate(), p == null ? null : p.priced().total(),
                quote.getSentAt(), quote.getConfirmedAt(), views);
    }

    private record Pricing(boolean locked, LocalDate rateDate, PriceCalculator.Rates rates,
                           PriceCalculator.Priced priced) {
    }

    /** ECB 最新一批：日期 + 1 EUR 兑各币种。 */
    private record LatestFx(LocalDate rateDate, Map<String, BigDecimal> eurTo) {

        Optional<PriceCalculator.Rates> ratesFor(Quote.Currency currency) {
            BigDecimal eurCny = eurTo.get(Quote.Currency.CNY.name());
            BigDecimal eurQuote = currency == Quote.Currency.EUR ? BigDecimal.ONE : eurTo.get(currency.name());
            if (eurCny == null || eurQuote == null) {
                return Optional.empty();
            }
            return Optional.of(new PriceCalculator.Rates(eurCny, eurQuote));
        }
    }

    private Optional<LatestFx> latestFx() {
        List<FxRateView> batch = fxRates.latestEcbRates();
        if (batch.isEmpty()) {
            return Optional.empty();
        }
        return Optional.of(new LatestFx(batch.getFirst().rateDate(), batch.stream()
                .filter(r -> "EUR".equals(r.baseCurrency()))
                .collect(Collectors.toMap(FxRateView::quoteCurrency, FxRateView::rate, (a, b) -> a))));
    }

    private LatestFx requireFx() {
        return latestFx().orElseThrow(QuoteService::fxUnavailable);
    }

    private static BusinessException fxUnavailable() {
        return new BusinessException(503, "quote.fx_unavailable");
    }
}
