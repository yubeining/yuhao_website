package com.mfg.platform.fx;

import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import org.xml.sax.ErrorHandler;
import org.xml.sax.SAXException;
import org.xml.sax.SAXParseException;

import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 解析 ECB 每日参考汇率 XML（{@code eurofxref-daily.xml}）。
 *
 * <p>文件结构：{@code <Cube><Cube time='YYYY-MM-DD'><Cube currency='USD' rate='1.1551'/>…</Cube></Cube>}，
 * 所有 {@code Cube} 在 ECB 的命名空间下。
 *
 * <p><b>格式不对就整份拒绝</b>（抛 {@link EcbRatesFormatException}），绝不返回半截数据：
 * 缺日期、多于一天、没有汇率、某个币种代码或汇率不合格，都算整份不合格。
 *
 * <p><b>安全</b>：内容来自外网，禁止 DOCTYPE（ECB 的文件里本来就没有），从根上堵住外部实体（XXE）——
 * 否则一份被篡改的响应能让解析器去读本机文件或向内网发请求。
 */
final class EcbDailyRatesParser {

    private static final String ECB_NS = "http://www.ecb.int/vocabulary/2002-08-01/eurofxref";

    /** 解析失败不要往 stderr 打「[Fatal Error]」，直接抛出由调用方决定怎么记。 */
    private static final ErrorHandler THROW_ON_ANY_PROBLEM = new ErrorHandler() {
        @Override
        public void warning(SAXParseException e) {
            // 警告不影响结果
        }

        @Override
        public void error(SAXParseException e) throws SAXException {
            throw e;
        }

        @Override
        public void fatalError(SAXParseException e) throws SAXException {
            throw e;
        }
    };

    private EcbDailyRatesParser() {
    }

    static EcbDailyRates parse(byte[] xml) {
        Element day = singleDay(read(xml));
        LocalDate date;
        try {
            date = LocalDate.parse(day.getAttribute("time"));
        } catch (DateTimeParseException e) {
            throw new EcbRatesFormatException("unparseable rate date: " + day.getAttribute("time"), e);
        }

        Map<String, BigDecimal> rates = new LinkedHashMap<>();
        for (Node n = day.getFirstChild(); n != null; n = n.getNextSibling()) {
            if (!(n instanceof Element cube) || !isCube(cube)) {
                continue;
            }
            String currency = cube.getAttribute("currency");
            if (!isCurrencyCode(currency)) {
                throw new EcbRatesFormatException("malformed currency code: " + currency);
            }
            BigDecimal rate;
            try {
                rate = new BigDecimal(cube.getAttribute("rate"));
            } catch (NumberFormatException e) {
                throw new EcbRatesFormatException("rate is not a number for " + currency, e);
            }
            if (rate.signum() <= 0) {
                throw new EcbRatesFormatException("rate is not positive for " + currency);
            }
            if (rates.put(currency, rate) != null) {
                throw new EcbRatesFormatException("duplicate currency: " + currency);
            }
        }
        if (rates.isEmpty()) {
            throw new EcbRatesFormatException("no rates for " + date);
        }
        return new EcbDailyRates(date, Map.copyOf(rates));
    }

    private static Document read(byte[] xml) {
        try {
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setNamespaceAware(true);
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
            factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
            factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
            factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
            factory.setXIncludeAware(false);
            factory.setExpandEntityReferences(false);
            DocumentBuilder builder = factory.newDocumentBuilder();
            builder.setErrorHandler(THROW_ON_ANY_PROBLEM);
            return builder.parse(new ByteArrayInputStream(xml));
        } catch (ParserConfigurationException | SAXException | IOException e) {
            throw new EcbRatesFormatException("not a parseable ECB rates document", e);
        }
    }

    /** 带 time 属性的 Cube 恰好一个 —— 每日文件只有一天。 */
    private static Element singleDay(Document doc) {
        NodeList cubes = doc.getElementsByTagNameNS(ECB_NS, "Cube");
        Element day = null;
        for (int i = 0; i < cubes.getLength(); i++) {
            Element cube = (Element) cubes.item(i);
            if (cube.hasAttribute("time")) {
                if (day != null) {
                    throw new EcbRatesFormatException("more than one day in a daily rates document");
                }
                day = cube;
            }
        }
        if (day == null) {
            throw new EcbRatesFormatException("no rate date in document");
        }
        return day;
    }

    private static boolean isCube(Element e) {
        return ECB_NS.equals(e.getNamespaceURI()) && "Cube".equals(e.getLocalName());
    }

    private static boolean isCurrencyCode(String s) {
        if (s == null || s.length() != 3) {
            return false;
        }
        for (int i = 0; i < 3; i++) {
            char c = s.charAt(i);
            if (c < 'A' || c > 'Z') {
                return false;
            }
        }
        return true;
    }
}
