import { describe, it, expect } from "vitest";
import {
  formatDate,
  addDays,
  addMonths,
  addYears,
  addWeeks,
  getNextBillingDate,
} from "../src/utils/date.js";

describe("date utils", () => {
  it("formatDate returns YYYY-MM-DD", () => {
    expect(formatDate(new Date("2026-05-17T00:00:00Z"))).toBe("2026-05-17");
  });

  it("addDays adds days correctly", () => {
    expect(addDays("2026-05-17", 1)).toBe("2026-05-18");
    expect(addDays("2026-05-17", 10)).toBe("2026-05-27");
  });

  it("addMonths adds months correctly", () => {
    expect(addMonths("2026-05-17", 1)).toBe("2026-06-17");
    expect(addMonths("2026-05-17", 12)).toBe("2027-05-17");
  });

  it("addYears adds years correctly", () => {
    expect(addYears("2026-05-17", 1)).toBe("2027-05-17");
  });

  it("addWeeks adds weeks correctly", () => {
    expect(addWeeks("2026-05-17", 1)).toBe("2026-05-24");
    expect(addWeeks("2026-05-17", 2)).toBe("2026-05-31");
  });

  it("gets the next monthly billing date", () => {
    expect(getNextBillingDate("2026-05-18", "monthly", 18)).toBe("2026-06-18");
  });

  it("keeps the original anchor day across short months", () => {
    expect(getNextBillingDate("2026-01-31", "monthly", 31)).toBe("2026-02-28");
    expect(getNextBillingDate("2026-02-28", "monthly", 31)).toBe("2026-03-31");
  });

  it("handles leap day yearly billing with an anchor day", () => {
    expect(getNextBillingDate("2024-02-29", "yearly", 29)).toBe("2025-02-28");
    expect(getNextBillingDate("2027-02-28", "yearly", 29)).toBe("2028-02-29");
  });

  it("clamps quarterly billing to the target month end", () => {
    expect(getNextBillingDate("2026-10-31", "quarterly", 31)).toBe(
      "2027-01-31",
    );
    expect(getNextBillingDate("2026-11-30", "quarterly", 31)).toBe(
      "2027-02-28",
    );
  });

  it("does not advance custom billing cycles", () => {
    expect(getNextBillingDate("2026-05-18", "custom", 18)).toBeNull();
  });
});
