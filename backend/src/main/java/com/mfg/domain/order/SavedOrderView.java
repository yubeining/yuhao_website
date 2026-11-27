package com.mfg.domain.order;

import java.util.List;
import java.util.UUID;

/**
 * 整张保存的结果：保存后的订单 + 这次新建的行 id（顺序和请求里新行的顺序一致）。
 * 前端靠它把还没传的图纸对到新行上 —— 新行在请求里还没有 id。
 */
public record SavedOrderView(OrderView order, List<UUID> createdLineIds) {
}
