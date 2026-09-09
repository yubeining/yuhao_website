package com.mfg.arch;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.library.dependencies.SlicesRuleDefinition;
import jakarta.persistence.Entity;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OneToOne;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noFields;
import static com.tngtech.archunit.library.GeneralCodingRules.NO_CLASSES_SHOULD_ACCESS_STANDARD_STREAMS;
import static com.tngtech.archunit.library.GeneralCodingRules.NO_CLASSES_SHOULD_USE_JAVA_UTIL_LOGGING;

/**
 * 把 CLAUDE.md 的架构铁律写成会失败的测试 —— 让"靠 reviewer 记得"变成"CI 挡住"。
 * 违反哪条，测试直接红，PR 进不去。
 *
 * <p>用显式 {@code @Test} + {@code rule.check(...)}（不用 @ArchTest 引擎）—— 保证被 surefire
 * 稳定发现和计数。只分析主代码，不含测试（测试里用字段 @Autowired 是允许的）。
 */
class ArchitectureTest {

    private static JavaClasses mainClasses;

    @BeforeAll
    static void importMainClasses() {
        mainClasses = new ClassFileImporter()
                .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
                .importPackages("com.mfg");
    }

    /** §4：关联用裸 uuid 列，禁止一切 JPA 关联注解（防 N+1 / LAZY 代理炸 / 拖整棵对象树）。 */
    @Test
    void noJpaRelationMappings() {
        ArchRule rule = noFields()
                .should().beAnnotatedWith(ManyToOne.class)
                .orShould().beAnnotatedWith(OneToMany.class)
                .orShould().beAnnotatedWith(OneToOne.class)
                .orShould().beAnnotatedWith(ManyToMany.class)
                .orShould().beAnnotatedWith(JoinColumn.class)
                .because("CLAUDE.md 4: relations are bare uuid columns, never JPA associations");
        rule.check(mainClasses);
    }

    /** 全项目构造器注入，禁止字段 @Autowired。 */
    @Test
    void noFieldInjection() {
        noFields().should().beAnnotatedWith(Autowired.class)
                .because("constructor injection only")
                .check(mainClasses);
    }

    /** 用 slf4j，不用 System.out/err。 */
    @Test
    void noStandardStreams() {
        NO_CLASSES_SHOULD_ACCESS_STANDARD_STREAMS.check(mainClasses);
    }

    /** 不用 java.util.logging。 */
    @Test
    void noJavaUtilLogging() {
        NO_CLASSES_SHOULD_USE_JAVA_UTIL_LOGGING.check(mainClasses);
    }

    /** §4：时间一律用 Instant，不用 LocalDateTime（JVM 时区静默漂移）/ OffsetDateTime。 */
    @Test
    void useInstantNotLocalOrOffsetDateTime() {
        noFields()
                .should().haveRawType(LocalDateTime.class)
                .orShould().haveRawType(OffsetDateTime.class)
                .because("CLAUDE.md 4: timestamps use Instant, not LocalDateTime/OffsetDateTime")
                .check(mainClasses);
    }

    /** 分层：controller 不直接依赖 repository（域四层就位后生效；现在还没 controller 包，故允许空）。 */
    @Test
    void controllersDoNotTouchRepositories() {
        noClasses().that().resideInAPackage("..controller..")
                .should().dependOnClassesThat().resideInAPackage("..repository..")
                .because("controllers go through services, not repositories directly")
                .allowEmptyShould(true)
                .check(mainClasses);
    }

    // ---------- 模块化单体：业务域之间的边界（CLAUDE.md §2「业务域划分」）----------

    /**
     * 业务域之间不得循环依赖。
     *
     * <p>一旦出现环，这两个域就再也拆不开了 —— 拆的时候必须同时改两边，
     * 而「同时改两边」正是单体退化成大泥球的那一步。环还会顺带毁掉启动顺序
     * 和事务边界的可推理性。方向必须是单向的：谁的数据谁来判。
     */
    @Test
    void businessDomainsHaveNoCycles() {
        SlicesRuleDefinition.slices()
                .matching("com.mfg.domain.(*)..")
                .should().beFreeOfCycles()
                .because("a cycle between two domains means they can never be split apart again")
                .check(mainClasses);
    }

    /**
     * Entity 绝不出域 —— 域内的 {@code @Entity} 必须是包级私有。
     *
     * <p>这是 CLAUDE.md 里那条「真正拦住人的是编译器」的落点：Entity 一旦 public，
     * 别的域就能直接拿它当数据结构传来传去，于是两个域共享了同一份可变映射状态，
     * schema 一改两边一起炸，而编译器什么都不会说。跨域要数据就发布契约或 DTO。
     *
     * <p>只管 {@code domain}：{@code platform} 是基础设施，它的实体（组织、用户）
     * 本来就是给所有域共用的公共身份，不适用这条。
     */
    @Test
    void domainEntitiesAreNotPublic() {
        noClasses().that().resideInAPackage("com.mfg.domain..")
                .and().areAnnotatedWith(Entity.class)
                .should().bePublic()
                .because("entities must not leave their domain; publish a contract or DTO instead")
                .allowEmptyShould(true)
                .check(mainClasses);
    }

    /**
     * Repository 同理:域内的 repository 接口一律包级私有。
     *
     * <p>public repository 等于把别的域的表直接开放给任何人查 ——
     * 跨域 join 就是这么长出来的,而跨域 join 会让「改自己的表」变成「改别人的代码」。
     */
    @Test
    void domainRepositoriesAreNotPublic() {
        noClasses().that().resideInAPackage("com.mfg.domain..")
                .and().haveSimpleNameEndingWith("Repository")
                .should().bePublic()
                .because("another domain must never query this domain's tables directly")
                .allowEmptyShould(true)
                .check(mainClasses);
    }

    /**
     * 域不许反向依赖 {@code config} —— 装配是外层的事,域只被装配,不认识装配它的人。
     * 反过来 config 依赖域是正常的。
     */
    @Test
    void domainsDoNotDependOnWiring() {
        noClasses().that().resideInAPackage("com.mfg.domain..")
                .should().dependOnClassesThat().resideInAPackage("com.mfg.config..")
                .because("domains are wired by the outer layer, they do not know about it")
                .allowEmptyShould(true)
                .check(mainClasses);
    }

    /**
     * 兜底:上面几条只有在域里真有东西时才有意义。
     * 域包被清空过一次(2026-09-08 全表重建),这条保证「规则形同虚设」不会静悄悄发生。
     */
    @Test
    void thereIsAtLeastOneDomainEntityToGuard() {
        classes().that().resideInAPackage("com.mfg.domain..")
                .and().areAnnotatedWith(Entity.class)
                .should().resideOutsideOfPackage("com.mfg.nonexistent..")
                .because("if no domain entity exists, the boundary rules above are silently inert")
                .check(mainClasses);
    }
}
