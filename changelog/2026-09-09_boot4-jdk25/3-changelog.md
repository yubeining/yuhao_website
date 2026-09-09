# 变更记录 —— 升级 Spring Boot 3.5.4 → 4.1.1、JDK 21 → 25

> 2026-09-09 ｜ 破坏性依赖升级 ｜ 无 schema 变更

## 为什么现在升

后端此刻只有 ~40 个文件、7 个域实体、零业务逻辑。等报价/合同/结算堆上去再升，工作量差一个数量级。
依赖侧也已就绪（Spring AI 2.0.1 GA 跟 Boot 4 线；jackson-datatype-hibernate7 有 Jackson 3 版）。

版本落点：**Boot 4.1.1 + JDK 25**（Boot 4.1 的 Java 基线其实是 17，25 是主动选的 LTS）。

## 实际踩到的坑（全部已修）

| # | 问题 | 修法 |
|---|---|---|
| 1 | `spring-boot-starter-aop` 在 Boot 4 没了 | 改名为 `spring-boot-starter-aspectj`（`@Idempotent`/`@RateLimit` 靠它） |
| 2 | `MeterRegistryCustomizer` 包搬家 | → `org.springframework.boot.micrometer.metrics.autoconfigure` |
| 3 | `EntityManagerFactoryDependsOnPostProcessor` 包搬家 | → `org.springframework.boot.jpa.autoconfigure` |
| 4 | `TestRestTemplate` 从 `spring-boot-test` 拆出 | 加 `spring-boot-resttestclient` 依赖，包名 → `org.springframework.boot.resttestclient` |
| 5 | `TestRestTemplate` bean 不再自动注册 | 三个 HTTP IT 加 `@AutoConfigureTestRestTemplate` |
| 6 | ArchUnit 1.3.0 读不了 JDK 25 字节码（major 69）——**一个类都没导入，5 条规则静默"通过检查失败"** | 升到 1.5.0 |
| 7 | **Boot 4 默认 JSON 换成 Jackson 3**（`tools.jackson`），我们全用 Jackson 2 `com.fasterxml` → 没有 `ObjectMapper` bean | 加 `spring-boot-starter-jackson`；3 个文件（RedisService / AppSetting / AuthFlowIT）迁到 `tools.jackson`；`jackson-datatype-hibernate7` 换 `tools.jackson` groupId |
| 8 | `spring.jackson.serialization.write-dates-as-timestamps` 启动即失败 | Jackson 3 里这个开关**已取消**，日期默认就是 ISO-8601（正是 §4 要的）。删掉该行 |
| 9 | 部署脚本版本检查正则 `javac 2[1-9]` 会把已装的 **javac 21 判为合格**、永不升级 | 收紧为 `2[5-9]`；且 apt 装不到 openjdk-25 时**大声失败**，不静默退回 21 |

## 改了什么

- `pom.xml`：parent 4.1.1、`java.version` 25、Spring AI 2.0.1、ArchUnit 1.5.0、starter-aspectj、starter-jackson、resttestclient、jackson-datatype-hibernate7 换 groupId
- 主代码 4 个文件（2 个 import 搬家 + RedisService/AppSetting 迁 Jackson 3）
- 测试 3 个文件（import + `@AutoConfigureTestRestTemplate`）
- `application.yml`：删掉 Jackson 3 已取消的那个开关
- CI `java-version` 21 → 25（2 处）；`deploy/devbox/bootstrap.sh`、`deploy/README.md`、根 `README.md`、`CLAUDE.md` §1/§12

## 验证（跑过）

- `mvn clean verify`：单测 21 + 集成 23（S3/AI 4 例无凭证 skip），**BUILD SUCCESS**
- **真库 validate 启动**：空库跑全部迁移 → JPA validate 通过 → `Started MfgApplication`。
  这一关专门盯 Hibernate 6→7 的 UUID/JSON 绑定（§4 那个 `operator does not exist: uuid = character varying`），**没有漂移**
- `/api/v1/public/ping` 返回 `"serverTime":"2026-09-09T03:38:57.797644Z"` —— 删掉 Jackson 配置后日期仍是 ISO-8601

## 遗留 / 风险

- ⚠ **DevBox 的 Ubuntu 仓库不一定有 `openjdk-25-jdk-headless`**。脚本现在会明确失败并给出两条出路（换源 / 装 Temurin tarball），不会静默用 21 编不了。**下次部署前需要在真机上确认。**
- `docs/design/` 里的历史文档仍写着 Java 21 / Boot 3.5（也仍写着 Next.js）——按该目录"原文档不改"的约定未动。
