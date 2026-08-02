package com.mfg.common.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.Collections;
import java.util.List;

/**
 * Redis 封装。
 *
 * <p><b>★ 只缓存 DTO，永不缓存 JPA 实体</b>（CLAUDE.md §8）。
 *
 * <p>缓存命中返回的是 Jackson 反序列化出来的对象，{@code @ManyToOne(LAZY)} 关联全是 null。
 * 拿它去 {@code repository.save()} 会走 merge，把关联外键写成 NULL，撞 NOT NULL 约束。
 * 最恶心的是这个 bug <b>只在实体被读过一次进了缓存之后才复现</b> ——
 * 单测全绿、本地手测也正常，上线后用户点开详情页再保存才炸。
 *
 * <p>用 {@link StringRedisTemplate} + 手动 Jackson，而不是 {@code RedisTemplate<String,Object>}
 * + 默认序列化器：默认的 JDK 序列化会把 Java 类名写进值里，重构改包名就全部读不出来，
 * 而且是反序列化异常而不是 miss。
 */
@Service
public class RedisService {

    private static final Logger log = LoggerFactory.getLogger(RedisService.class);

    /** 比对 fence 再删 —— 防止删掉别人（TTL 过期后）新拿到的锁。 */
    private static final DefaultRedisScript<Long> RELEASE_LOCK = new DefaultRedisScript<>(
            "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) "
            + "else return 0 end", Long.class);

    private final StringRedisTemplate redis;
    private final ObjectMapper objectMapper;
    private final String keyPrefix;
    private final int defaultTtlSeconds;

    public RedisService(StringRedisTemplate redis,
                        ObjectMapper objectMapper,
                        @Value("${app.cache.key-prefix:mfg:}") String keyPrefix,
                        @Value("${app.cache.default-ttl-seconds:300}") int defaultTtlSeconds) {
        this.redis = redis;
        this.objectMapper = objectMapper;
        this.keyPrefix = keyPrefix;
        this.defaultTtlSeconds = defaultTtlSeconds;
    }

    // ---------- 读 ----------

    /**
     * @return 缓存值；miss 或反序列化失败时返回 null（<b>降级为 miss，不抛异常</b> ——
     *         缓存故障不该让业务请求失败）
     */
    public <T> T get(String key, Class<T> type) {
        return readAndParse(key, raw -> objectMapper.readValue(raw, type));
    }

    /** 泛型集合用，如 {@code new TypeReference<List<QuoteSummary>>() {}}。 */
    public <T> T get(String key, TypeReference<T> typeRef) {
        return readAndParse(key, raw -> objectMapper.readValue(raw, typeRef));
    }

    private <T> T readAndParse(String key, JsonParser<T> parser) {
        try {
            String raw = redis.opsForValue().get(prefixed(key));
            return raw == null ? null : parser.parse(raw);
        } catch (Exception e) {
            // 坏数据（改过 DTO 结构）不该让请求 500 —— 删掉当 miss 处理，下次重建
            log.warn("cache read failed, treating as miss: key={}", key);
            safeDelete(key);
            return null;
        }
    }

    @FunctionalInterface
    private interface JsonParser<T> {
        T parse(String raw) throws Exception;
    }

    // ---------- 写 ----------

    public void set(String key, Object value) {
        set(key, value, defaultTtlSeconds);
    }

    public void set(String key, Object value, int ttlSeconds) {
        try {
            redis.opsForValue().set(
                    prefixed(key), objectMapper.writeValueAsString(value), Duration.ofSeconds(ttlSeconds));
        } catch (Exception e) {
            // 写缓存失败不该让业务失败
            log.warn("cache write failed: key={}", key);
        }
    }

    public void delete(String key) {
        safeDelete(key);
    }

    private void safeDelete(String key) {
        try {
            redis.delete(prefixed(key));
        } catch (Exception e) {
            log.warn("cache delete failed: key={}", key);
        }
    }

    /**
     * 按模式批量删。
     *
     * <p>用 SCAN 而不是 KEYS —— KEYS 在大 key 空间下会阻塞整个 Redis。
     */
    public void deleteByPattern(String pattern) {
        try (var cursor = redis.scan(org.springframework.data.redis.core.ScanOptions
                .scanOptions().match(prefixed(pattern)).count(500).build())) {
            List<String> batch = new java.util.ArrayList<>(500);
            while (cursor.hasNext()) {
                batch.add(cursor.next());
                if (batch.size() >= 500) {
                    redis.delete(batch);
                    batch.clear();
                }
            }
            if (!batch.isEmpty()) {
                redis.delete(batch);
            }
        } catch (Exception e) {
            log.warn("cache pattern delete failed: pattern={}", pattern);
        }
    }

    // ---------- 分布式锁（定时任务用）----------

    /**
     * 尝试拿锁。{@code SET key fence NX EX ttl}。
     *
     * <p>用法见 CLAUDE.md §9 —— <b>每个 {@code @Scheduled} 都必须加</b>：
     * <pre>
     * String key = "lock:scheduler:quote-expiry:" + quoteId;
     * String fence = UUID.randomUUID().toString();
     * if (!redisService.tryLock(key, fence, 120)) return;   // 别的 pod 在处理
     * try { doWork(quoteId); } finally { redisService.releaseLock(key, fence); }
     * </pre>
     *
     * @param fence 唯一值（用 UUID）。释放时比对，确保只删自己的锁 ——
     *              否则 A 的锁 TTL 过期后 B 拿到锁，A 干完活把 B 的锁删了，
     *              C 立刻又能拿锁，等于没锁。
     * @return true = 拿到锁
     */
    public boolean tryLock(String key, String fence, int ttlSeconds) {
        try {
            Boolean ok = redis.opsForValue()
                    .setIfAbsent(prefixed(key), fence, Duration.ofSeconds(ttlSeconds));
            return Boolean.TRUE.equals(ok);
        } catch (Exception e) {
            // ★ 拿锁失败时返回 false（不执行），而不是 true（执行）——
            //   Redis 挂了宁可这一轮不跑，也不能多个 pod 同时跑
            log.error("lock acquisition failed, skipping work: key={}", key);
            return false;
        }
    }

    /** 比对 fence 后释放锁。fence 不匹配时什么也不做。 */
    public boolean releaseLock(String key, String fence) {
        try {
            Long deleted = redis.execute(
                    RELEASE_LOCK, Collections.singletonList(prefixed(key)), fence);
            return deleted != null && deleted > 0;
        } catch (Exception e) {
            log.warn("lock release failed: key={}", key);
            return false;
        }
    }

    /** 计数器，用于限流。返回自增后的值。 */
    public long increment(String key, int ttlSeconds) {
        String k = prefixed(key);
        Long value = redis.opsForValue().increment(k);
        if (value != null && value == 1L) {
            redis.expire(k, Duration.ofSeconds(ttlSeconds));
        }
        return value == null ? 0L : value;
    }

    private String prefixed(String key) {
        return keyPrefix + key;
    }
}
