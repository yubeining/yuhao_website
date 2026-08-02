package com.mfg.common.security;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 注入当前登录用户 {@link UserPrincipal}。
 *
 * <pre>
 * &#64;PostMapping("/rfqs")
 * public RfqResponse create(&#64;CurrentUser UserPrincipal user,
 *                           &#64;RequestBody &#64;Valid CreateRfqRequest req) {
 *     return rfqService.create(user.partyId(), user.id(), req);
 * }
 * </pre>
 *
 * <p>只需要 partyId 时用 {@link CurrentParty}，更明确。
 */
@Target(ElementType.PARAMETER)
@Retention(RetentionPolicy.RUNTIME)
public @interface CurrentUser {
}
