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
     * {@code /site} 和 {@code /site/} 转到首页。
     *
     * <p>静态资源处理器把目录路径当成"找不到这个文件"，不会自动找 index.html ——
     * 少了这一步，分享出去的链接必须精确写成 {@code /site/index.html} 才打得开，
     * 而所有人都会去掉那一截。
     */
    @Controller
    static class SiteIndexController {

        @RequestMapping({"/site", "/site/"})
        public String index() {
            return "forward:/site/index.html";
        }
    }
}
