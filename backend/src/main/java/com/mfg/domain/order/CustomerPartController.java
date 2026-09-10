package com.mfg.domain.order;

import com.mfg.common.security.CurrentUser;
import com.mfg.common.security.UserPrincipal;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * 客户端：零件、图纸版本、图纸文件。
 *
 * <p>全部在 {@code /customer/**} 下 —— 端级闸门按路径前缀只放 CUSTOMER 进来，不需要另外登记。
 * 租户 id 一律取自 principal，不从路径或请求体收（§3 铁律 3）。
 */
@RestController
class CustomerPartController {

    private final PartDrawingService service;

    CustomerPartController(PartDrawingService service) {
        this.service = service;
    }

    public record CreatePartRequest(@NotBlank String code, @NotBlank String name) {
    }

    public record CreateRevisionRequest(String customerRev) {
    }

    public record RequestUploadRequest(@NotBlank String filename, String contentType) {
    }

    @PostMapping("/customer/parts")
    PartView createPart(@CurrentUser UserPrincipal user, @Valid @RequestBody CreatePartRequest request) {
        return service.createPart(user.partyId(), request.code().trim(), request.name().trim());
    }

    @GetMapping("/customer/parts/{partId}")
    PartView getPart(@CurrentUser UserPrincipal user, @PathVariable UUID partId) {
        return service.getPart(user.partyId(), partId);
    }

    @PostMapping("/customer/parts/{partId}/revisions")
    RevisionView createRevision(@CurrentUser UserPrincipal user, @PathVariable UUID partId,
                                @Valid @RequestBody CreateRevisionRequest request) {
        return service.createRevision(user.partyId(), user.id(), partId, request.customerRev());
    }

    @PostMapping("/customer/parts/{partId}/revisions/{revisionId}/files")
    UploadTicket requestUpload(@CurrentUser UserPrincipal user, @PathVariable UUID partId,
                               @PathVariable UUID revisionId, @Valid @RequestBody RequestUploadRequest request) {
        return service.requestUpload(user.partyId(), user.id(), partId, revisionId,
                request.filename(), request.contentType());
    }

    @PostMapping("/customer/files/{fileId}/complete")
    FileView complete(@CurrentUser UserPrincipal user, @PathVariable UUID fileId) {
        return service.complete(user.partyId(), fileId);
    }

    @GetMapping("/customer/files/{fileId}/view-url")
    ViewUrl viewUrl(@CurrentUser UserPrincipal user, @PathVariable UUID fileId) {
        return service.issueViewUrl(user.partyId(), user.id(), user.partyType(), fileId);
    }
}
