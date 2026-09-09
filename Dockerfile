# 机加工跨境定制平台 —— 前后端单一镜像
#
# portal（Vite + React）的构建产物进 backend 的 static/，
# 由 Spring Boot 一并托管 —— 一个镜像、一个容器、一个端口。
#
# 构建：docker build -t yuhao .
# 运行：docker run -p 8080:8080 --env-file .env yuhao

# ============================================================
# 阶段 1 —— 前端
# ============================================================
FROM node:22-alpine AS portal-build

WORKDIR /src/portal

# ★ 先只拷 lock 文件再 npm ci，然后才拷源码。
#   顺序反过来的话，改一行 tsx 就会让依赖层缓存失效，每次构建重装 300 个包。
COPY portal/package.json portal/package-lock.json ./
RUN npm ci

COPY portal/ ./

# vite.config.ts 的 outDir 指向 ../backend/src/main/resources/static，
# 所以产物落在 /src/backend/src/main/resources/static
# npm run build = tsc -b && vite build —— ★ 类型检查是构建的一部分，不要绕过
RUN npm run build


# ============================================================
# 阶段 2 —— 后端
# ============================================================
FROM maven:3.9-eclipse-temurin-25 AS backend-build

WORKDIR /src

# 同样的道理：先拿 pom 预热依赖缓存，再拷源码
COPY backend/pom.xml backend/pom.xml
RUN mvn -B -f backend/pom.xml dependency:go-offline -DskipTests

COPY backend/src backend/src
# ★ 必须拷。pom.xml 的 copy-migrations 从 ${basedir}/../database/migrations 取文件，
#   少了它 jar 里没有迁移文件，启动时 SchemaMigrationRunner 一条也不执行 ——
#   然后 ddl-auto: validate 在空库上失败，报错指向表结构，跟真实原因毫无关系。
COPY database database

# 前端产物。放在最后拷，前端改动不会让上面的 maven 依赖层失效
COPY --from=portal-build /src/backend/src/main/resources/static \
                         /src/backend/src/main/resources/static

# ★ 跳过测试是刻意的：镜像构建不是跑测试的地方。
#   测试需要真实 PostgreSQL + 真实 Redis（CLAUDE.md §10 禁止 mock 掉 Redis），
#   在 docker build 里没有它们。测试由 CI 的独立 job 跑，绿了才轮到构建镜像。
RUN mvn -B -f backend/pom.xml clean package -DskipTests \
 && mv backend/target/*.jar /app.jar


# ============================================================
# 阶段 3 —— 运行时
# ============================================================
FROM eclipse-temurin:25-jre

# ★ 运行时阶段【不装任何包】。
#
#   原本这里 apt-get install curl tzdata，两个都不必要，而代价很实在：
#   apt 依赖构建机能访问 ubuntu 源，一旦有代理/墙/镜像站抽风就整条构建挂掉
#   （本机第一次构建就是栽在这，报的是 "400 Bad Request"，
#    和应用毫无关系，但足以让人以为是 Dockerfile 写错了）。
#
#   curl  → 只被 Docker HEALTHCHECK 用，而 HEALTHCHECK 在 Kubernetes 下
#           【完全被忽略】。Sealos 底层是 k8s，探针配在 k8s 那侧（见 deploy/）。
#   tzdata → JRE 自带完整 tzdb，-Duser.timezone 就够了，不需要系统时区文件。
#
#   少装一个包 = 少一个 CVE 来源 + 少一个构建失败点。

# ★ 非 root 运行。容器逃逸时 root 和普通用户的后果差一个数量级，
#   而这个应用不需要任何特权 —— 它只监听一个端口、连两个外部服务。
RUN groupadd --system --gid 1001 app \
 && useradd --system --uid 1001 --gid app --create-home app
USER app

WORKDIR /home/app
COPY --from=backend-build --chown=app:app /app.jar app.jar

# ★ Sealos DevBox 的网络配置里对外暴露的是 8080，不是应用默认的 3001。
#   Spring Boot 的 relaxed binding 会把 SERVER_PORT 映射到 server.port。
ENV SERVER_PORT=8080
EXPOSE 8080

# ★ MaxRAMPercentage 而不是固定 -Xmx：
#   容器内存上限是部署时才定的（这台 DevBox 是 4 GiB，换个规格就变）。
#   写死 -Xmx 要么浪费内存，要么在小规格上被 OOMKilled，
#   而 OOMKill 表现为容器无日志重启，最难查的一类问题。
ENV JAVA_OPTS="-XX:MaxRAMPercentage=70 -XX:+ExitOnOutOfMemoryError -Duser.timezone=Asia/Shanghai"

# ★ 没有 HEALTHCHECK 指令是刻意的 —— Kubernetes 会忽略它。
#   健康检查配在 k8s 的 liveness/readiness 上，路径 /actuator/health。
#   注意 readiness 的 initialDelay 要留够：应用启动时 SchemaMigrationRunner
#   会先跑迁移，迁移期间端口还没开。见 deploy/README.md。

# exec 形式 + sh -c：需要 shell 展开 $JAVA_OPTS，
# 同时 exec 让 java 成为 PID 1，直接收到 SIGTERM 而不是等 30 秒被 SIGKILL
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar app.jar"]
