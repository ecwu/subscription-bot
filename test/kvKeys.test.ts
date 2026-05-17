import { describe, it, expect } from "vitest";
import {
  userProfile,
  userSubscriptionsIndex,
  subscription,
  reminderDate,
  reminderSent,
} from "../src/utils/kvKeys.js";

describe("kvKeys", () => {
  it("userProfile returns correct key", () => {
    expect(userProfile("abc")).toBe("user:abc:profile");
  });

  it("userSubscriptionsIndex returns correct key", () => {
    expect(userSubscriptionsIndex("abc")).toBe("user:abc:subs");
  });

  it("subscription returns correct key", () => {
    expect(subscription("abc", "sub_123")).toBe("user:abc:sub:sub_123");
  });

  it("reminderDate returns correct key", () => {
    expect(reminderDate("2026-06-01")).toBe("reminders:date:2026-06-01");
  });

  it("reminderSent returns correct key", () => {
    expect(reminderSent("user1", "sub1", "2026-06-01")).toBe(
      "reminder:sent:user1:sub1:2026-06-01",
    );
  });
});
