package com.mfg.arch;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.lang.ArchRule;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OneToOne;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

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

    /** 分层：controller 不直接依赖 repository（域四层就位后生效；现在还没 controller 包，故允许空）。 */
    @Test
    void controllersDoNotTouchRepositories() {
        noClasses().that().resideInAPackage("..controller..")
                .should().dependOnClassesThat().resideInAPackage("..repository..")
                .because("controllers go through services, not repositories directly")
                .allowEmptyShould(true)
                .check(mainClasses);
    }
}
