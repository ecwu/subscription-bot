import { describe, it, expect } from "vitest";
import {
  formatDate,
  addDays,
  addMonths,
  addYears,
  addWeeks,
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
});
