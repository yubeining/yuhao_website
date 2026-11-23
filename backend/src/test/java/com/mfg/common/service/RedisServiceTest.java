package com.mfg.common.service;

import org.junit.jupiter.api.Test;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThatNoException;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 缓存操作出错降级成 miss；认证状态操作出错必须让调用方知道。
 *
 * <p>★ 以前作废验证码、吊销 refresh token 都走吞异常的 {@code delete}：
 * Redis 一抖，旧 token / 旧码还活着，用户却看到「成功」。
 */
class RedisServiceTest {

    private final StringRedisTemplate template = mock(StringRedisTemplate.class);
    @SuppressWarnings("unchecked")
    private final ValueOperations<String, String> ops = mock(ValueOperations.class);
    private final RedisService redis = new RedisService(template, JsonMapper.builder().build(), "t:", 300);

    @Test
    void cacheDeleteStillSwallowsFailures() {
        when(template.delete("t:k")).thenThrow(new RedisConnectionFailureException("down"));
        assertThatNoException().isThrownBy(() -> redis.delete("k"));
    }

    @Test
    void strictDeleteSurfacesFailures() {
        when(template.delete("t:k")).thenThrow(new RedisConnectionFailureException("down"));
        assertThatThrownBy(() -> redis.deleteStrict("k")).isInstanceOf(RedisConnectionFailureException.class);
    }

    @Test
    void getAndDeleteSurfacesFailures() {
        when(template.opsForValue()).thenReturn(ops);
        when(ops.getAndDelete("t:k")).thenThrow(new RedisConnectionFailureException("down"));
        assertThatThrownBy(() -> redis.getAndDelete("k", String.class)).isInstanceOf(RedisConnectionFailureException.class);
    }
}
