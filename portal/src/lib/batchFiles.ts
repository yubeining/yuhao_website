/**
 * 批量添加零件：在浏览器里读文件 —— 展开文件夹、解压压缩包、读 Excel / CSV 清单。
 *
 * ★ 全部在本地做，保存到订单之前一个字节都不发服务端（2026-11-26 拍板）。
 * ★ 压缩包本身不限大小，只限解开后的每个文件 20MB（2026-11-26 拍板）。
 */

import JSZip from 'jszip'
import { MAX_FILE_BYTES } from './batchImport'

export interface Collected {
    files: File[]
    /** 超过 20MB 没收的文件名 */
    tooLarge: string[]
    /** 读不出来的压缩包 */
    unreadable: string[]
}

const ext = (name: string) => (name.split('.').pop() || '').toLowerCase()
const baseName = (path: string) => path.split('/').pop() || path

export const isSpreadsheet = (name: string) => ['xlsx', 'xls', 'csv'].includes(ext(name))

/**
 * 压缩包里的文件名：带 UTF-8 标记的 JSZip 自己解；没带的多半是 Windows 中文系统打的包（GBK），
 * 先按 UTF-8 严格解，失败再按 GB18030（GBK 的超集）解。
 */
function decodeZipName(bytes: string[] | Uint8Array | ArrayLike<number>): string {
    const u8 = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes as ArrayLike<number>)
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(u8)
    } catch {
        return new TextDecoder('gb18030').decode(u8)
    }
}

/** 系统自己塞进压缩包的东西（macOS 的资源分叉、隐藏文件），不是客户的文件。 */
const isJunk = (path: string) => path.startsWith('__MACOSX/') || baseName(path).startsWith('.')

/** 把选中 / 拖进来的文件展开：压缩包解开（只解一层），超过 20MB 的挑出来不收。 */
export async function collectFiles(input: File[]): Promise<Collected> {
    const out: Collected = { files: [], tooLarge: [], unreadable: [] }
    const take = (f: File) => {
        if (f.size > MAX_FILE_BYTES) out.tooLarge.push(f.name)
        else out.files.push(f)
    }
    for (const f of input) {
        if (isJunk(f.name)) continue
        if (ext(f.name) !== 'zip') {
            take(f)
            continue
        }
        let zip: JSZip
        try {
            // 喂 ArrayBuffer 而不是 File：JSZip 读 Blob 要用 FileReader，只有浏览器有
            zip = await JSZip.loadAsync(await f.arrayBuffer(), { decodeFileName: decodeZipName })
        } catch {
            out.unreadable.push(f.name)
            continue
        }
        for (const entry of Object.values(zip.files)) {
            if (entry.dir || isJunk(entry.name)) continue
            take(new File([await entry.async('arraybuffer')], baseName(entry.name)))
        }
    }
    return out
}

/** 拖进来的东西里可能有文件夹：逐层读出所有文件。浏览器不给文件夹时退回 dataTransfer.files。 */
export async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
    const entries = Array.from(dt.items)
        .map((it) => (it.kind === 'file' ? it.webkitGetAsEntry?.() : null))
        .filter((e): e is FileSystemEntry => !!e)
    if (!entries.length) return Array.from(dt.files)

    const out: File[] = []
    const walk = async (entry: FileSystemEntry): Promise<void> => {
        if (entry.isFile) {
            out.push(await new Promise<File>((ok, fail) => (entry as FileSystemFileEntry).file(ok, fail)))
            return
        }
        const reader = (entry as FileSystemDirectoryEntry).createReader()
        // readEntries 一次最多给 100 个，读到空为止
        for (;;) {
            const batch = await new Promise<FileSystemEntry[]>((ok, fail) => reader.readEntries(ok, fail))
            if (!batch.length) break
            for (const child of batch) await walk(child)
        }
    }
    for (const e of entries) await walk(e)
    return out
}

export interface Sheet {
    name: string
    rows: string[][]
}

/**
 * 读清单。CSV 先按 UTF-8 严格解，失败按 GB18030 解（中文 Excel 另存的 CSV 多半是 GBK）。
 * 单元格取显示出来的文字（raw: false），和客户在 Excel 里看到的一致。
 * 读表库按需加载：它比整个前端其余部分加起来还大，不导入清单的客户不该为它付下载时间。
 */
export async function readSheets(file: File): Promise<Sheet[]> {
    const XLSX = await import('xlsx')
    const buf = new Uint8Array(await file.arrayBuffer())
    let book: import('xlsx').WorkBook
    if (ext(file.name) === 'csv') {
        let text: string
        try {
            text = new TextDecoder('utf-8', { fatal: true }).decode(buf)
        } catch {
            text = new TextDecoder('gb18030').decode(buf)
        }
        book = XLSX.read(text, { type: 'string' })
    } else {
        book = XLSX.read(buf, { type: 'array' })
    }
    return book.SheetNames.map((name) => ({
        name,
        rows: XLSX.utils.sheet_to_json<string[]>(book.Sheets[name], { header: 1, raw: false, defval: '' }),
    }))
}
