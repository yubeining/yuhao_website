package com.mfg.platform.ai;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * AI provider 注册表 —— 把所有 {@link AiProvider} 按名字收好，按请求路由。
 *
 * <p>加 provider 就是加一个 {@code @Component implements AiProvider}，这里自动收进来，不用改。
 */
@Component
public class AiModelRegistry {

    private final Map<String, AiProvider> byName;
    private final String defaultProvider;

    public AiModelRegistry(List<AiProvider> providers,
                           @Value("${app.ai.default-provider:sealos}") String defaultProvider) {
        Map<String, AiProvider> map = new HashMap<>();
        for (AiProvider provider : providers) {
            AiProvider existing = map.put(provider.name(), provider);
            if (existing != null) {
                throw new IllegalStateException("two AI providers named '" + provider.name() + "'");
            }
        }
        this.byName = map;
        this.defaultProvider = defaultProvider;
    }

    /** 按名字取 provider；name 为空用默认。找不到抛清晰错误。 */
    public AiProvider resolve(String name) {
        String target = (name == null || name.isBlank()) ? defaultProvider : name;
        AiProvider provider = byName.get(target);
        if (provider == null) {
            throw new AiException("no AI provider named '" + target + "'; registered: " + byName.keySet(), null);
        }
        return provider;
    }
}
