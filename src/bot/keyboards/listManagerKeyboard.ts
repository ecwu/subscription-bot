import { InlineKeyboard } from "grammy";
import type {
  Subscription,
  SubscriptionStatus,
} from "../../models/subscription.js";
import { formatBillingCycle, formatStatus } from "../../utils/labels.js";

export const LIST_PAGE_SIZE = 8;

export function truncateName(name: string, maxLen: number = 20): string {
  if (name.length <= maxLen) return name;
  return name.slice(0, maxLen - 1) + "…";
}

export function getTotalPages(subs: Subscription[]): number {
  return Math.max(1, Math.ceil(subs.length / LIST_PAGE_SIZE));
}

export function buildListPageText(page: number, totalPages: number): string {
  return `你的订阅 — 第 ${page + 1}/${totalPages} 页\n\n点击订阅查看详情。`;
}

export function buildListPageKeyboard(
  subs: Subscription[],
  page: number,
): InlineKeyboard {
  const start = page * LIST_PAGE_SIZE;
  const pageSubs = subs.slice(start, start + LIST_PAGE_SIZE);
  const kb = new InlineKeyboard();

  for (let i = 0; i < pageSubs.length; i++) {
    const sub = pageSubs[i];
    const label =
      sub.status === "paused"
        ? `⏸ ${truncateName(sub.name)}`
        : truncateName(sub.name);
    kb.text(label, `list:select:${sub.id}:${page}`);
    if (i % 2 === 1) {
      kb.row();
    }
  }
  if (pageSubs.length % 2 === 1) {
    kb.row();
  }

  const tp = getTotalPages(subs);
  if (tp > 1) {
    if (page > 0) {
      kb.text("← 上一页", `list:page:${page - 1}`);
    }
    if (page < tp - 1) {
      kb.text("下一页 →", `list:page:${page + 1}`);
    }
  }

  return kb;
}

export function formatDetailText(sub: Subscription): string {
  const lines: string[] = [sub.name];
  if (sub.price !== undefined) {
    lines.push(`价格：${sub.price} ${sub.currency ?? ""}`.trim());
  }
  lines.push(
    `周期：${formatBillingCycle(sub.billingCycle, sub.billingInterval)}`,
  );
  lines.push(`下次扣款：${sub.nextBillingDate}`);
  lines.push(`状态：${formatStatus(sub.status)}`);
  if (sub.category) lines.push(`分类：${sub.category}`);
  if (sub.note) lines.push(`备注：${sub.note}`);
  return lines.join("\n");
}

export function buildDetailKeyboard(
  subId: string,
  page: number,
  status: SubscriptionStatus,
): InlineKeyboard {
  const statusButton =
    status === "paused"
      ? InlineKeyboard.text("▶️ 恢复", `list:resume:${subId}:${page}`)
      : InlineKeyboard.text("⏸ 暂停", `list:pause:${subId}:${page}`);

  return new InlineKeyboard()
    .text("✏️ 编辑", `list:edit:${subId}:${page}`)
    .text("🗑 删除", `list:del:${subId}:${page}`)
    .row()
    .add(statusButton)
    .row()
    .text("← 返回列表", `list:back:${page}`);
}

export function buildEditFieldKeyboard(
  subId: string,
  page: number,
): InlineKeyboard {
  return new InlineKeyboard()
    .text("名称", `list:ef:name:${subId}:${page}`)
    .text("价格", `list:ef:price:${subId}:${page}`)
    .row()
    .text("币种", `list:ef:currency:${subId}:${page}`)
    .text("周期", `list:ef:cycle:${subId}:${page}`)
    .row()
    .text("下次扣款日期", `list:ef:date:${subId}:${page}`)
    .row()
    .text("← 返回详情", `list:detail:${subId}:${page}`);
}

export function buildDeleteConfirmKeyboard(
  subId: string,
  page: number,
): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ 确认删除", `list:delok:${subId}:${page}`)
    .text("❌ 取消", `list:delno:${subId}:${page}`);
}
