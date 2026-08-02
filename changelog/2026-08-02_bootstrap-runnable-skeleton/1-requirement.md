# 需求 —— 让骨架真的能跑起来

## 原话

> 这个demo项目能否启动？我打算把他作为前后端在一起的项目 然后部署在云平台上
>
> 你看一下该demo有不合理的东西就去掉 前端必须是react 你先在本地加文件看看能否启动
> 然后jdk是21 依赖配置要按照项目的来

## 背景

改动前的仓库是一份**设计稿 + 少量参考实现**，不是能运行的程序：

- 没有 `@SpringBootApplication` 启动类
- `PortalGuardInterceptor` / `RouteAccessRegistry` 写好了，但没有任何地方注册它们
- `@CurrentUser` / `@CurrentParty` 注解定义了，但没有对应的参数解析器
- `SchemaMigrationRunner` 的注释说「用 `EntityManagerFactoryDependsOnPostProcessor`
  建立依赖关系（见同包下的配置类）」—— 那个配置类不存在
- `portal/` 只有 `middleware.ts` 和 `services/core/http.ts` 两个文件，
  没有 `package.json`，跑不了任何命令
- `domain/` 下 14 个业务包全是空目录

## 两个已确认的决策

**D-A：前端用 Vite + React SPA，放弃 Next.js。**
理由见 CLAUDE.md §2。核心是：三个端全都要登录才能看，没有一个页面需要 SSR，
而 Next.js 的代价是必须独立跑 Node 进程 —— 和「前后端一个部署单元」直接冲突。
需要 SEO 的官网本来就是独立的 `site/`。

**D-B：前端构建产物由 Spring Boot 托管，一个 jar 一个容器。**

## 验收

1. `mvn spring-boot:run` 能起来，4 个迁移自动应用，31 张表建出来
2. 拿一个端的 token 敲另外两个端，返回 403 `common.wrong_portal`
3. 浏览器打开 `http://localhost:3001` 能看到 React 页面，刷新任意子路由不 404
4. `npm run build` 类型检查通过
5. 依赖按 `pom.xml` 既有配置来，不擅自换框架/换版本

## 不在本次范围

- 任何业务功能（`domain/` 保持为空）
- 真实登录
- Dockerfile 与部署配置
- 测试
