package com.mfg.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.nio.file.Files;
import java.nio.file.Path;

/**
 * 把官网静态站挂在 {@code /site/**} 下，供预览分享用。
 *
 * <h3>★ 这是一座临时的桥，不是架构决定</h3>
 *
 * <p>官网本来是<b>独立部署单元</b>（{@code site/} + 自己的静态服务器 + 自己的端口），
 * 理由见 CLAUDE.md §2：它的发版节奏、受众、SEO 需求都和交易平台不同，
 * 绑在一起意味着改一句文案就要重启平台。
 *
 * <p>但 Sealos DevBox 每开一个对外端口都要在控制台手工加一次，
 * 在拿到官网自己的公网地址之前，需要一个能直接分享出去、不用登录的链接。
 * 于是先从平台这边开一个只读的挂载点。
 *
 * <p><b>拿到官网独立域名之后，删掉本文件。</b>留着它的代价是：
 * 官网内容会通过平台的域名被搜索引擎索引，形成重复内容，
 * 反过来伤害官网自己的排名 —— 而 SEO 正是官网存在的唯一理由。
 *
 * <h3>为什么读文件系统而不是打进 jar</h3>
 *
 * <p>官网由 {@code deploy/devbox/deploy-site.sh} 独立发布，不重新打包后端。
 * 如果把站点放进 {@code resources/static/}，两个问题：
 * 一是改文案要重新构建整个后端；二是 vite 的 {@code emptyOutDir}
 * 会在下次前端构建时把整个 static 目录清空，连带删掉官网。
 */
@Configuration
public class SitePreviewConfig implements WebMvcConfigurer {

    private static final Logger log = LoggerFactory.getLogger(SitePreviewConfig.class);

    private final String siteDir;

    public SitePreviewConfig(@Value("${app.site.dir:/home/devbox/app/site}") String siteDir) {
        this.siteDir = siteDir;
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        Path dir = Path.of(siteDir);
        if (!Files.isDirectory(dir)) {
            // 本地开发时这个目录通常不存在，不是错误
            log.info("site preview not mounted, directory absent: {}", siteDir);
            return;
        }
        // 末尾的斜杠不能少 —— 没有它 Spring 会把 location 当成文件名前缀去拼，
        // 结果是 /site/assets/x.jpg 被解析成 <dir>assets/x.jpg，全部 404
        String location = dir.toUri().toString();
        if (!location.endsWith("/")) {
            location = location + "/";
        }
        registry.addResourceHandler("/site/**")
                .addResourceLocations(location);
        log.info("site preview mounted at /site/** from {}", siteDir);
    }

    /**
     * {@code /site} 重定向到 {@code /site/}，{@code /site/} 转到首页。
     *
     * <p><b>★ 少了那个斜杠，图片全部裂开。</b>
     *
     * <p>最初两个路径都用 forward 到 index.html，页面能出来，但
     * <b>浏览器地址栏仍然是 {@code /site}（没有斜杠）</b>，
     * 而 HTML 里的资源写的是相对路径 {@code ./assets/hero.jpg}。
     * 浏览器按当前 URL 的目录解析相对路径：
     * <pre>
     *   /site   →  ./assets/hero.jpg  解析成  /assets/hero.jpg   404
     *   /site/  →  ./assets/hero.jpg  解析成  /site/assets/hero.jpg   200
     * </pre>
     * 结果是文字正常、图片全裂 —— 而服务端日志里只有几条 404，
     * 看不出和访问入口有关。
     *
     * <p>所以 {@code /site} 必须<b>重定向</b>（让地址栏真的变成 {@code /site/}），
     * 不能 forward（地址栏不变）。
     *
     * <p>没有改成绝对路径 {@code /site/assets/...}，是因为这个站同时还要能
     * 在自己的端口上以根路径提供服务（见 {@code site/serve.mjs}），
     * 那种情况下绝对路径反而是错的。相对路径两边都对，前提是有那个斜杠。
     */
    @Controller
    static class SiteIndexController {

        @RequestMapping("/site")
        public String redirectToSlash() {
            return "redirect:/site/";
        }

        @RequestMapping("/site/")
        public String index() {
            return "forward:/site/index.html";
        }
    }
}
