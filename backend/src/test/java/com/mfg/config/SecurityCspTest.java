package com.mfg.config;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * CSP 里那个「额外放行的对象存储 origin」是怎么算出来的。
 *
 * <p>★ 这组断言钉住的是一条容易被好心改回去的规则:<b>集群内网地址绝不进 CSP</b>。
 * CSP 约束的是浏览器,而内网域名浏览器连解析都解析不了 —— 放进去不但没用,
 * 还会让「真正该放行的外网地址没配」这件事看起来像已经配好了。
 * 真出问题时只有浏览器控制台报一行 CSP 拦截,后端日志干干净净,极难定位。
 */
class SecurityCspTest {

    @Test
    void clusterInternalEndpointIsNotAllowedIntoCsp() {
        assertThat(SecurityConfig.originOf("http://object-storage.objectstorage-system.svc.cluster.local"))
                .isNull();
        assertThat(SecurityConfig.originOf("http://minio.default.svc")).isNull();
        assertThat(SecurityConfig.originOf("http://storage.local:9000")).isNull();
    }

    @Test
    void publicEndpointBecomesSchemeHostPort() {
        assertThat(SecurityConfig.originOf("https://objectstorageapi.bja.sealos.run"))
                .isEqualTo("https://objectstorageapi.bja.sealos.run");
        // 路径被丢掉 —— CSP 的 source 是 origin,不是 URL
        assertThat(SecurityConfig.originOf("https://oss.example.com/bucket/key"))
                .isEqualTo("https://oss.example.com");
        // 非默认端口要保留,否则浏览器按不同 origin 处理,照样拦
        assertThat(SecurityConfig.originOf("http://localhost:9000")).isEqualTo("http://localhost:9000");
    }

    @Test
    void blankOrMalformedYieldsNoExtraOrigin() {
        assertThat(SecurityConfig.originOf(null)).isNull();
        assertThat(SecurityConfig.originOf("   ")).isNull();
        assertThat(SecurityConfig.originOf("not a url")).isNull();
    }

    @Test
    void cspWithoutExtraOriginStaysSelfOnly() {
        String csp = SecurityConfig.buildCsp(null);
        assertThat(csp).contains("img-src 'self' data: blob:;");
        assertThat(csp).contains("connect-src 'self';");
        assertThat(csp).contains("object-src 'none'");
        assertThat(csp).contains("frame-ancestors 'none'");
    }

    @Test
    void cspWithPublicOriginAllowsItOnImgAndConnectOnly() {
        String origin = "https://objectstorageapi.bja.sealos.run";
        String csp = SecurityConfig.buildCsp(origin);
        assertThat(csp).contains("img-src 'self' data: blob: " + origin + ";");
        assertThat(csp).contains("connect-src 'self' " + origin + ";");
        // 脚本永远只信同源 —— 对象存储放的是客户上传的文件,绝不能当脚本源
        assertThat(csp).contains("script-src 'self';");
        assertThat(csp).doesNotContain("script-src 'self' " + origin);
    }

    @Test
    void isClusterInternalRecognisesTheSuffixesWeActuallySee() {
        assertThat(StorageConfig.isClusterInternal("http://svc.cluster.local")).isTrue();
        assertThat(StorageConfig.isClusterInternal("https://objectstorageapi.bja.sealos.run")).isFalse();
        assertThat(StorageConfig.isClusterInternal("")).isFalse();
        assertThat(StorageConfig.isClusterInternal(null)).isFalse();
    }
}
