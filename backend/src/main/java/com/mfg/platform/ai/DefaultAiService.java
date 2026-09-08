package com.mfg.platform.ai;

import org.springframework.stereotype.Service;

/**
 * {@link AiService} 的默认实现 —— 门面：按请求里的 provider（或默认）路由到对应
 * {@link AiProvider}。业务只注入 AiService，看不到 provider 层。
 */
@Service
public class DefaultAiService implements AiService {

    private final AiModelRegistry registry;

    public DefaultAiService(AiModelRegistry registry) {
        this.registry = registry;
    }

    @Override
    public AiResult chat(AiRequest request) {
        return registry.resolve(request.provider()).call(request);
    }
}
