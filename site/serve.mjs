// 官网静态服务器。零依赖，Node 18+ 自带的模块就够。
//
// ★ 为什么不用 nginx / express
//   这个站是纯静态的，需求只有"按路径吐文件 + 正确的 MIME + 缓存头"。
//   装 nginx 要多一套配置和一个开机自启；express 要拉依赖树。
//   四十行标准库解决的事，不值得引入其中任何一个。
//
// ★ 为什么和后端分开跑
//   官网和交易平台的发版节奏完全不同：官网内容市场同事随时要改，
//   平台发版要走健康检查和回滚。绑在一起意味着改一句文案就要重启整个后端。
//
// 用法：PORT=8081 node serve.mjs

import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)))
const PORT = Number(process.env.PORT || 8081)

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.txt': 'text/plain; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
}

const server = createServer(async (req, res) => {
    try {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            res.writeHead(405, { Allow: 'GET, HEAD' }).end('Method Not Allowed')
            return
        }

        const url = new URL(req.url, 'http://localhost')
        let pathname = decodeURIComponent(url.pathname)
        if (pathname.endsWith('/')) pathname += 'index.html'

        // ★ 目录穿越防护。normalize 把 ../ 折叠掉，再确认结果仍在 ROOT 之内。
        //   少了这一步，GET /../../home/devbox/app/.env 就能把数据库口令读走。
        const filePath = join(ROOT, normalize(pathname))
        if (!filePath.startsWith(ROOT + '/') && filePath !== join(ROOT, 'index.html')) {
            res.writeHead(403).end('Forbidden')
            return
        }

        const info = await stat(filePath).catch(() => null)
        if (!info || !info.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' })
                .end('<h1>404</h1><p><a href="/">Back to home</a></p>')
            return
        }

        const ext = extname(filePath).toLowerCase()
        // HTML 不缓存（内容随时在改），静态资源长缓存 —— 文件名变了才会重新拉
        const cache = ext === '.html'
            ? 'no-cache'
            : 'public, max-age=86400'

        res.writeHead(200, {
            'Content-Type': TYPES[ext] || 'application/octet-stream',
            'Content-Length': info.size,
            'Cache-Control': cache,
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'strict-origin-when-cross-origin',
        })
        if (req.method === 'HEAD') { res.end(); return }
        res.end(await readFile(filePath))
    } catch (err) {
        console.error('[site] request failed:', err.message)
        res.writeHead(500).end('Internal Server Error')
    }
})

server.listen(PORT, '0.0.0.0', () => {
    console.log(`[site] serving ${ROOT} on :${PORT}`)
})
