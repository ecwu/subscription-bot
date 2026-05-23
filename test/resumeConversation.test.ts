import { describe, expect, it } from "vitest";
import {
  buildResumePrompt,
  buildResumeSuccessMessage,
} from "../src/bot/conversations/resumeConversation.js";
import type { Subscription } from "../src/models/subscription.js";

function createSub(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: "sub-1",
    name: "Netflix",
    price: 12.99,
    currency: "EUR",
    billingCycle: "monthly",
    nextBillingDate: "2026-06-01",
    status: "paused",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("resumeConversation text", () => {
  it("uses button-oriented prompt without asking for typed confirmation", () => {
    const prompt = buildResumePrompt(createSub());

    expect(prompt).toContain("请选择按当前日期恢复，或选择日期后恢复：");
    expect(prompt).not.toContain("发送“确认”");
  });

  it("explains retained trial and non-renewing flags", () => {
    const prompt = buildResumePrompt(
      createSub({ isTrial: true, autoRenew: false }),
    );

    expect(prompt).toContain("仍标记为体验");
    expect(prompt).toContain("仍为停止续费");
  });

  it("shows retained status after resume", () => {
    const message = buildResumeSuccessMessage(
      createSub({ status: "active", isTrial: true, autoRenew: false }),
    );

    expect(message).toContain("保留状态：体验、停止续费");
  });
});
