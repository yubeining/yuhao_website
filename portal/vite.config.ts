import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

/**
 * 前端构建配置。
 *
 * ★ build.outDir 直接指向后端的 static/ —— 前后端一个部署单元、一个容器。
 *
 *   npm run build  →  产物落进 backend/src/main/resources/static/
 *   mvn package    →  连同 jar 一起打包
 *   docker build   →  一个镜像
 *
 *   代价是前端构建必须在后端打包之前跑（Dockerfile 里已经保证了顺序）。
 *   收益是省掉一个容器、一个网关分流规则、一套跨域配置 ——
 *   对个位数供应商 + 少量客户的业务量来说，这个取舍是明显划算的。
 *
 * ★ emptyOutDir 必须显式为 true。
 *   outDir 在 root 之外时 Vite 默认不清空（怕误删），结果是上一次 build
 *   的 assets/index-<hash>.js 会永远留在 static/ 里，攒几十个文件后
 *   没人分得清哪个是当前版本。
 */
export default defineConfig({
    plugins: [react()],

    build: {
        outDir: path.resolve(__dirname, '../backend/src/main/resources/static'),
        emptyOutDir: true,
        sourcemap: true,
    },

    server: {
        port: 5173,
        proxy: {
            /**
             * 开发时把 API 转发到后端，保持同源 ——
             * 这样开发环境和生产环境（Spring Boot 同时托管静态资源和 API）
             * 的请求形状完全一致，不需要为 dev 单独配 CORS。
             *
             * ★ 路径写死 /api/v1 只在这里可以接受：这是构建工具配置，不是业务代码。
             *   后端改前缀时这里要跟着改，README 有记。
             */
            '/api/v1': {
                target: 'http://localhost:3001',
                changeOrigin: false,
            },
        },
    },
})
