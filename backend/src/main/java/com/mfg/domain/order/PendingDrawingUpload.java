package com.mfg.domain.order;

import java.util.UUID;

/**
 * 一张上传凭证在 Redis 里存的内容：这次上传发给了谁、挂在哪个零件版本、传到哪个地址。
 * complete 时靠它确认「这个上传地址确实是发给这个客户、这个版本的」—— 以前这件事靠 PENDING 行。
 *
 * <p>客户组织不存在值里：它在 key 上（{@code CacheKeys#drawingUpload}），别的客户拿着凭证 id 也查不到。
 */
record PendingDrawingUpload(UUID partId, UUID revisionId, UUID userId, String uploadKey,
                            String filename, String contentType) {
}
