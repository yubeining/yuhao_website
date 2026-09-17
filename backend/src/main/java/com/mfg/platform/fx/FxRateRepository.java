package com.mfg.platform.fx;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

interface FxRateRepository extends JpaRepository<FxRate, Long> {

    /**
     * 同一数据源、同一天、同一币种对已经有了就跳过，返回实际插入的行数（0 或 1）。
     * 这是 CLAUDE.md §8 要求的 DB 兜底：锁过期后两个实例都跑了，也不会重复写。
     */
    @Modifying
    @Query(value = "insert into fx_rate (source, rate_date, base_currency, quote_currency, rate, fetched_at)"
            + " values (:source, :rateDate, :base, :quote, :rate, :fetchedAt)"
            + " on conflict (source, rate_date, base_currency, quote_currency) do nothing", nativeQuery = true)
    int insertIfAbsent(@Param("source") String source,
                       @Param("rateDate") LocalDate rateDate,
                       @Param("base") String baseCurrency,
                       @Param("quote") String quoteCurrency,
                       @Param("rate") BigDecimal rate,
                       @Param("fetchedAt") Instant fetchedAt);

    /** 某数据源最近一天公布的全部汇率。 */
    @Query("select r from FxRate r where r.source = :source"
            + " and r.rateDate = (select max(x.rateDate) from FxRate x where x.source = :source)"
            + " order by r.baseCurrency, r.quoteCurrency")
    List<FxRate> findLatestBatch(@Param("source") String source);
}
