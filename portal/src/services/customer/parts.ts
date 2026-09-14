/**
 * 客户端：零件、图纸版本、图纸文件（后端 CustomerPartController）。
 *
 * ★ 类型只描述后端白名单序列化出来的字段（XxxView），不多一个 ——
 *   界面上每个值都要答得出「从哪个字段来」（CLAUDE.md §10 C5）。
 *
 * ★ 后端不输出值为 null 的字段（spring.jackson.default-property-inclusion: non_null），
 *   所以可能为空的字段一律标成可选：拿到的是 undefined 而不是 null。判空用 `== null`，别用 `=== null`。
 */

import { http, putToSignedUrl } from '../core/http'

export type UploadStatus = 'PENDING' | 'COMPLETED' | 'REJECTED' | 'REMOVED'

export interface FileView {
    id: string
    originalFilename: string
    uploadStatus: UploadStatus
    sizeBytes?: number | null
}

export interface RevisionView {
    id: string
    /** 我方编号，每个零件从 1 开始 */
    revNo: number
    /** 客户自己的 A/B/C，只展示 */
    customerRev?: string | null
    /** 已被提交的订单锁定：不能再加 / 删文件，要换图纸就开新版本 */
    locked: boolean
    /** 只含传完并校验通过的文件 */
    files: FileView[]
}

export interface PartView {
    id: string
    code: string
    name: string
    revisions: RevisionView[]
}

export interface UploadTicket {
    fileId: string
    uploadUrl: string
    /** PUT 时必须带的 Content-Type，一字不差 */
    contentType: string
    expiresAt: string
}

export interface ViewUrl {
    url: string
    expiresAt: string
}

/** 按图号查本客户已有的零件。没有时后端回 404 part.not_found。 */
export function findPartByCode(code: string): Promise<PartView> {
    return http.get<PartView>(`/customer/parts?code=${encodeURIComponent(code)}`)
}

export function getPart(partId: string): Promise<PartView> {
    return http.get<PartView>(`/customer/parts/${partId}`)
}

export function removeFile(fileId: string): Promise<FileView> {
    return http.delete<FileView>(`/customer/files/${fileId}`)
}

/**
 * 传一个图纸文件到某个版本：申请上传 → 浏览器直传对象存储 → 通知后端校验。
 * 后端按文件内容判真实类型，对不上会拒（400 part.file_type_not_allowed）。
 */
export async function uploadDrawing(
    partId: string,
    revisionId: string,
    file: File,
    onProgress?: (loaded: number, total: number) => void,
): Promise<FileView> {
    const ticket = await http.post<UploadTicket>(
        `/customer/parts/${partId}/revisions/${revisionId}/files`,
        { filename: file.name, contentType: file.type },
    )
    await putToSignedUrl(ticket.uploadUrl, file, ticket.contentType, onProgress)
    return http.post<FileView>(`/customer/files/${ticket.fileId}/complete`)
}
