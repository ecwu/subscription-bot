import { describe, it, expect } from "vitest";
import {
  buildReportData,
  buildTextReportData,
  formatReportText,
  formatTextReport,
  parseExchangeRateConfig,
} from "../src/services/reportService.js";
import type { Subscription } from "../src/models/subscription.js";

function sub(
  overrides: Partial<Subscription> & Pick<Subscription, "id">,
): Subscription {
  return {
    id: overrides.id,
    name: "Service",
    price: 12,
    currency: "USD",
    billingCycle: "monthly",
    nextBillingDate: "2026-06-15",
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("parseExchangeRateConfig", () => {
  it("parses a valid CNY exchange-rate config", () => {
    const config = parseExchangeRateConfig(
      JSON.stringify({ base: "CNY", rates: { CNY: 1, USD: 7.2, eur: 7.8 } }),
    );

    expect(config).toEqual({
      base: "CNY",
      rates: { CNY: 1, USD: 7.2, EUR: 7.8 },
    });
  });

  it("returns null for missing or invalid JSON", () => {
    expect(parseExchangeRateConfig(null)).toBeNull();
    expect(parseExchangeRateConfig("{nope")).toBeNull();
  });

  it("returns null for unsupported base currency", () => {
    const config = parseExchangeRateConfig(
      JSON.stringify({ base: "USD", rates: { CNY: 1, USD: 1 } }),
    );

    expect(config).toBeNull();
  });

  it("returns null when CNY is not exactly 1", () => {
    const config = parseExchangeRateConfig(
      JSON.stringify({ base: "CNY", rates: { CNY: 7.2, USD: 7.2 } }),
    );

    expect(config).toBeNull();
  });

  it("returns null for invalid rates", () => {
    expect(
      parseExchangeRateConfig(
        JSON.stringify({ base: "CNY", rates: { CNY: 1, USD: 0 } }),
      ),
    ).toBeNull();
    expect(
      parseExchangeRateConfig(
        JSON.stringify({ base: "CNY", rates: { CNY: 1, US: 7.2 } }),
      ),
    ).toBeNull();
  });
});

describe("buildReportData", () => {
  const rates = {
    base: "CNY" as const,
    rates: { CNY: 1, USD: 7, EUR: 8 },
  };

  it("normalizes currently active supported billing cycles to monthly run-rate", () => {
    const report = buildReportData(
      [
        sub({
          id: "monthly",
          price: 10,
          billingCycle: "monthly",
          nextBillingDate: "2026-06-17",
        }),
        sub({
          id: "yearly",
          price: 120,
          billingCycle: "yearly",
          nextBillingDate: "2027-05-17",
        }),
        sub({
          id: "quarterly",
          price: 30,
          billingCycle: "quarterly",
          nextBillingDate: "2026-08-17",
        }),
        sub({
          id: "weekly",
          price: 12,
          billingCycle: "weekly",
          nextBillingDate: "2026-05-24",
        }),
      ],
      rates,
      new Date("2026-05-17T00:00:00.000Z"),
    );

    expect(report.currentMonthly.includedCount).toBe(4);
    expect(report.currentMonthly.totalBase).toBeCloseTo(
      (10 + 10 + 10 + 52) * 7,
    );
    expect(report.currentMonthly.byCurrency[0]).toMatchObject({
      currency: "USD",
      subscriptionCount: 4,
    });
    expect(report.currentMonthly.byCurrency[0].total).toBeCloseTo(82);
  });

  it("normalizes interval cycles and uses their interval as active window", () => {
    const report = buildReportData(
      [
        sub({
          id: "every-30-days",
          price: 12,
          billingCycle: "interval",
          billingInterval: { unit: "day", count: 30 },
          nextBillingDate: "2026-06-16",
        }),
        sub({
          id: "every-4-weeks",
          price: 12,
          billingCycle: "interval",
          billingInterval: { unit: "week", count: 4 },
          nextBillingDate: "2026-06-14",
        }),
        sub({
          id: "outside-window",
          price: 12,
          billingCycle: "interval",
          billingInterval: { unit: "week", count: 4 },
          nextBillingDate: "2026-06-15",
        }),
      ],
      rates,
      new Date("2026-05-17T00:00:00.000Z"),
    );

    expect(report.currentMonthly.includedCount).toBe(2);
    expect(report.currentMonthly.byCurrency[0].total).toBeCloseTo(
      (12 * 365) / 30 / 12 + (12 * 52) / 4 / 12,
    );
  });

  it("excludes far-future prepaid subscriptions from current monthly run-rate", () => {
    const report = buildReportData(
      [
        sub({
          id: "active-yearly",
          price: 120,
          billingCycle: "yearly",
          nextBillingDate: "2027-05-17",
        }),
        sub({
          id: "far-future-yearly",
          price: 120,
          billingCycle: "yearly",
          nextBillingDate: "2029-01-01",
        }),
      ],
      rates,
      new Date("2026-05-17T00:00:00.000Z"),
    );

    expect(report.currentMonthly.includedCount).toBe(1);
    expect(report.currentMonthly.totalBase).toBeCloseTo(70);
  });

  it("excludes custom cycle and subscriptions without price or currency", () => {
    const report = buildReportData(
      [
        sub({ id: "no-price", price: undefined }),
        sub({ id: "no-currency", currency: undefined }),
        sub({ id: "custom", billingCycle: "custom" }),
        sub({ id: "valid", price: 10, currency: "CNY" }),
      ],
      rates,
      new Date("2026-05-17T00:00:00.000Z"),
    );

    expect(report.currentMonthly.includedCount).toBe(1);
    expect(report.currentMonthly.excluded).toEqual({
      noPrice: 1,
      noCurrency: 1,
      customCycle: 1,
    });
    expect(report.currentMonthly.totalBase).toBe(10);
  });

  it("groups by currency and reports missing exchange rates", () => {
    const report = buildReportData(
      [
        sub({ id: "usd", price: 10, currency: "USD" }),
        sub({ id: "eur", price: 10, currency: "EUR" }),
        sub({ id: "gbp", price: 10, currency: "GBP" }),
      ],
      rates,
      new Date("2026-05-17T00:00:00.000Z"),
    );

    expect(report.currentMonthly.byCurrency).toHaveLength(3);
    expect(report.currentMonthly.totalBase).toBe(150);
    expect(report.currentMonthly.convertedCount).toBe(2);
    expect(report.currentMonthly.missingRateCurrencies).toEqual(["GBP"]);
    expect(
      report.currentMonthly.byCurrency.find((item) => item.currency === "GBP"),
    ).toMatchObject({
      total: 10,
      convertedTotal: undefined,
    });
  });

  it("builds a full current-month day distribution with both totals", () => {
    const report = buildReportData(
      [
        sub({
          id: "a",
          price: 10,
          currency: "USD",
          nextBillingDate: "2026-06-01",
        }),
        sub({
          id: "b",
          price: 20,
          currency: "USD",
          nextBillingDate: "2026-06-01",
        }),
        sub({
          id: "c",
          price: 5,
          currency: "EUR",
          nextBillingDate: "2026-06-15",
        }),
        sub({
          id: "d",
          price: 5,
          currency: "GBP",
          nextBillingDate: "2026-06-15",
        }),
      ],
      rates,
      new Date("2026-05-17T00:00:00.000Z"),
    );

    // May has 31 days
    expect(report.currentMonthly.dayDistribution).toHaveLength(31);
    expect(report.currentMonthDue.dayDistribution).toHaveLength(31);

    // Both views share the same full-month distribution
    expect(report.currentMonthly.dayDistribution).toEqual(
      report.currentMonthDue.dayDistribution,
    );

    const day1 = report.currentMonthly.dayDistribution.find(
      (item) => item.day === 1,
    )!;
    expect(day1.monthlyEquivalentTotal).toBeCloseTo(210);
    expect(day1.actualTotal).toBe(0);

    const day15 = report.currentMonthly.dayDistribution.find(
      (item) => item.day === 15,
    )!;
    expect(day15.monthlyEquivalentTotal).toBeCloseTo(40);
    expect(day15.actualTotal).toBe(0);

    // Zero-total days exist
    const day10 = report.currentMonthly.dayDistribution.find(
      (item) => item.day === 10,
    )!;
    expect(day10.monthlyEquivalentTotal).toBe(0);
    expect(day10.actualTotal).toBe(0);
  });

  it("handles February month length correctly", () => {
    const report = buildReportData(
      [
        sub({
          id: "feb",
          price: 10,
          currency: "USD",
          nextBillingDate: "2026-02-20",
        }),
      ],
      rates,
      new Date("2026-02-15T00:00:00.000Z"),
    );

    expect(report.currentMonthly.dayDistribution).toHaveLength(28);
    const day20 = report.currentMonthly.dayDistribution.find(
      (item) => item.day === 20,
    )!;
    expect(day20.monthlyEquivalentTotal).toBeCloseTo(70);
  });

  it("allows actual and monthly-equivalent totals to coexist on the same day", () => {
    const report = buildReportData(
      [
        sub({
          id: "yearly",
          price: 120,
          currency: "USD",
          billingCycle: "yearly",
          nextBillingDate: "2026-05-20",
        }),
        sub({
          id: "quarterly",
          price: 30,
          currency: "EUR",
          billingCycle: "quarterly",
          nextBillingDate: "2026-05-31",
        }),
        sub({
          id: "next-month",
          price: 10,
          currency: "USD",
          billingCycle: "monthly",
          nextBillingDate: "2026-06-01",
        }),
      ],
      rates,
      new Date("2026-05-17T00:00:00.000Z"),
    );

    // May has 31 days
    expect(report.currentMonthly.dayDistribution).toHaveLength(31);
    expect(report.currentMonthDue.dayDistribution).toHaveLength(31);

    // Day 20: yearly due in May + active
    const day20 = report.currentMonthDue.dayDistribution.find(
      (item) => item.day === 20,
    )!;
    expect(day20.actualTotal).toBeCloseTo(120 * 7);
    expect(day20.monthlyEquivalentTotal).toBeCloseTo(10 * 7);

    // Day 31: quarterly due in May + active
    const day31 = report.currentMonthDue.dayDistribution.find(
      (item) => item.day === 31,
    )!;
    expect(day31.actualTotal).toBeCloseTo(30 * 8);
    expect(day31.monthlyEquivalentTotal).toBeCloseTo(10 * 8);

    // Day 1: next-month subscription is active but not due in May
    const day1 = report.currentMonthDue.dayDistribution.find(
      (item) => item.day === 1,
    )!;
    expect(day1.actualTotal).toBe(0);
    expect(day1.monthlyEquivalentTotal).toBeCloseTo(10 * 7);

    // Current report totals remain unchanged
    expect(report.currentMonthDue.includedCount).toBe(2);
    expect(report.currentMonthDue.totalBase).toBe(120 * 7 + 30 * 8);
    expect(report.currentMonthDue.byCurrency).toEqual([
      {
        currency: "EUR",
        total: 30,
        convertedTotal: 240,
        subscriptionCount: 1,
      },
      {
        currency: "USD",
        total: 120,
        convertedTotal: 840,
        subscriptionCount: 1,
      },
    ]);
  });

  it("lookback includes already-paid monthly subscription in current month due", () => {
    const report = buildReportData(
      [
        sub({
          id: "monthly-paid",
          price: 10,
          currency: "USD",
          billingCycle: "monthly",
          nextBillingDate: "2026-06-03", // advanced from 2026-05-03
          createdAt: "2026-04-01T00:00:00.000Z",
        }),
      ],
      rates,
      new Date("2026-05-17T00:00:00.000Z"),
    );

    expect(report.currentMonthDue.includedCount).toBe(1);
    expect(report.currentMonthDue.totalBase).toBeCloseTo(70); // 10 * 7

    const day3 = report.currentMonthDue.dayDistribution.find(
      (item) => item.day === 3,
    )!;
    expect(day3.actualTotal).toBeCloseTo(70);
  });

  it("lookback includes already-paid quarterly subscription in current month due", () => {
    const report = buildReportData(
      [
        sub({
          id: "quarterly-paid",
          price: 30,
          currency: "USD",
          billingCycle: "quarterly",
          nextBillingDate: "2026-08-15", // advanced from 2026-05-15
          createdAt: "2026-01-01T00:00:00.000Z",
        }),
      ],
      rates,
      new Date("2026-05-17T00:00:00.000Z"),
    );

    expect(report.currentMonthDue.includedCount).toBe(1);
    expect(report.currentMonthDue.totalBase).toBeCloseTo(210); // 30 * 7

    const day15 = report.currentMonthDue.dayDistribution.find(
      (item) => item.day === 15,
    )!;
    expect(day15.actualTotal).toBeCloseTo(210);
  });

  it("lookback includes already-paid yearly subscription in current month due", () => {
    const report = buildReportData(
      [
        sub({
          id: "yearly-paid",
          price: 120,
          currency: "USD",
          billingCycle: "yearly",
          nextBillingDate: "2027-05-10", // advanced from 2026-05-10
          createdAt: "2025-01-01T00:00:00.000Z",
        }),
      ],
      rates,
      new Date("2026-05-17T00:00:00.000Z"),
    );

    expect(report.currentMonthDue.includedCount).toBe(1);
    expect(report.currentMonthDue.totalBase).toBeCloseTo(840); // 120 * 7

    const day10 = report.currentMonthDue.dayDistribution.find(
      (item) => item.day === 10,
    )!;
    expect(day10.actualTotal).toBeCloseTo(840);
  });

  it("lookback excludes newly created subscription with phantom past date", () => {
    const report = buildReportData(
      [
        sub({
          id: "new-sub",
          price: 10,
          currency: "USD",
          billingCycle: "monthly",
          nextBillingDate: "2026-06-15",
          createdAt: "2026-05-20T00:00:00.000Z", // created after would-be prevDate 2026-05-15
        }),
      ],
      rates,
      new Date("2026-05-17T00:00:00.000Z"),
    );

    expect(report.currentMonthDue.includedCount).toBe(0);
  });

  it("monthly run-rate includes past-due subscription after advancing", () => {
    const report = buildReportData(
      [
        sub({
          id: "past-due-monthly",
          price: 10,
          currency: "USD",
          billingCycle: "monthly",
          nextBillingDate: "2026-05-03", // past due, should be advanced
          createdAt: "2026-01-01T00:00:00.000Z",
        }),
      ],
      rates,
      new Date("2026-05-17T00:00:00.000Z"),
    );

    expect(report.currentMonthly.includedCount).toBe(1);
    expect(report.currentMonthly.totalBase).toBeCloseTo(70); // 10 * 7
  });

  it("formats a text fallback without subscription names", () => {
    const report = buildReportData(
      [
        sub({ id: "a", name: "Private Service", price: 10, currency: "USD" }),
        sub({ id: "b", price: 10, currency: "GBP" }),
      ],
      rates,
      new Date("2026-05-17T00:00:00.000Z"),
    );

    const text = formatReportText(report);
    expect(text).toContain("订阅支出报告");
    expect(text).toContain("月度摊平支出");
    expect(text).toContain("当月支出");
    expect(text).toContain("年度预期支出");
    expect(text).not.toContain("Private Service");
  });

  it("projects monthly subscription across 12 months", () => {
    const report = buildReportData(
      [
        sub({
          id: "monthly",
          price: 10,
          currency: "USD",
          billingCycle: "monthly",
          nextBillingDate: "2026-05-20",
        }),
      ],
      rates,
      new Date("2026-05-17T00:00:00.000Z"),
    );

    expect(report.yearlyProjection.includedCount).toBe(1);
    expect(report.yearlyProjection.totalBase).toBeCloseTo(840); // 12 * 10 * 7
    expect(report.yearlyProjection.monthDistribution).toHaveLength(12);
    for (const item of report.yearlyProjection.monthDistribution!) {
      expect(item.actualTotal).toBeCloseTo(70); // 10 * 7 per month
    }
  });

  it("lookback includes current-month already-paid subscription", () => {
    const report = buildReportData(
      [
        sub({
          id: "monthly-paid",
          price: 10,
          currency: "USD",
          billingCycle: "monthly",
          nextBillingDate: "2026-06-03", // advanced from 2026-05-03
          createdAt: "2026-04-01T00:00:00.000Z",
        }),
      ],
      rates,
      new Date("2026-05-17T00:00:00.000Z"),
    );

    expect(report.yearlyProjection.includedCount).toBe(1);
    const may = report.yearlyProjection.monthDistribution!.find(
      (item) => item.monthKey === "2026-05",
    )!;
    const jun = report.yearlyProjection.monthDistribution!.find(
      (item) => item.monthKey === "2026-06",
    )!;
    expect(may.actualTotal).toBeCloseTo(70); // lookback
    expect(jun.actualTotal).toBeCloseTo(70);
  });

  it("lookback excludes newly created subscription with phantom date", () => {
    const report = buildReportData(
      [
        sub({
          id: "new-sub",
          price: 10,
          currency: "USD",
          billingCycle: "monthly",
          nextBillingDate: "2026-06-15",
          createdAt: "2026-05-20T00:00:00.000Z", // created after would-be prevDate 2026-05-15
        }),
      ],
      rates,
      new Date("2026-05-17T00:00:00.000Z"),
    );

    const may = report.yearlyProjection.monthDistribution!.find(
      (item) => item.monthKey === "2026-05",
    )!;
    expect(may.actualTotal).toBe(0);
  });

  it("excludes subscription with nextBillingDate beyond one year", () => {
    const report = buildReportData(
      [
        sub({
          id: "far-future",
          price: 100,
          currency: "USD",
          billingCycle: "yearly",
          nextBillingDate: "2028-01-01",
        }),
      ],
      rates,
      new Date("2026-05-17T00:00:00.000Z"),
    );

    expect(report.yearlyProjection.includedCount).toBe(0);
    expect(report.yearlyProjection.totalBase).toBe(0);
  });

  it("yearly subscription only appears in its billing month", () => {
    const report = buildReportData(
      [
        sub({
          id: "yearly",
          price: 120,
          currency: "USD",
          billingCycle: "yearly",
          nextBillingDate: "2027-03-15",
        }),
      ],
      rates,
      new Date("2026-05-17T00:00:00.000Z"),
    );

    expect(report.yearlyProjection.includedCount).toBe(1);
    const mar = report.yearlyProjection.monthDistribution!.find(
      (item) => item.monthKey === "2027-03",
    )!;
    expect(mar.actualTotal).toBeCloseTo(840); // 120 * 7
  });

  it("handles weekly subscription distributed across months", () => {
    const report = buildReportData(
      [
        sub({
          id: "weekly",
          price: 12,
          currency: "USD",
          billingCycle: "weekly",
          nextBillingDate: "2026-05-20",
        }),
      ],
      rates,
      new Date("2026-05-17T00:00:00.000Z"),
    );

    expect(report.yearlyProjection.includedCount).toBe(1);
    // Some months will have 4 payments, some 5
    const totalSum = report.yearlyProjection.monthDistribution!.reduce(
      (sum, item) => sum + item.actualTotal,
      0,
    );
    expect(totalSum).toBeGreaterThan(0);
  });
});

describe("buildTextReportData", () => {
  const rates = {
    base: "CNY" as const,
    rates: { CNY: 1, USD: 7, EUR: 8 },
  };

  it("collects current month items with billing day", () => {
    const data = buildTextReportData(
      [
        sub({
          id: "a",
          name: "Netflix",
          price: 10,
          currency: "USD",
          nextBillingDate: "2026-05-20",
        }),
        sub({
          id: "b",
          name: "Spotify",
          price: 15,
          currency: "CNY",
          nextBillingDate: "2026-05-10",
        }),
      ],
      rates,
      new Date("2026-05-17T00:00:00.000Z"),
    );

    expect(data.currentMonthKey).toBe("2026-05");
    expect(data.currentMonthItems).toHaveLength(2);
    expect(data.currentMonthItems[0]).toMatchObject({
      name: "Spotify",
      billingDay: 10,
    });
    expect(data.currentMonthItems[1]).toMatchObject({
      name: "Netflix",
      billingDay: 20,
    });
    expect(data.currentMonthTotal).toBeCloseTo(15 + 10 * 7);
  });

  it("collects year month items for each subscription", () => {
    const data = buildTextReportData(
      [
        sub({
          id: "a",
          name: "Netflix",
          price: 10,
          currency: "USD",
          billingCycle: "monthly",
          nextBillingDate: "2026-05-20",
        }),
      ],
      rates,
      new Date("2026-05-17T00:00:00.000Z"),
    );

    expect(data.yearMonthItems).toHaveLength(12);
    const nonEmpty = data.yearMonthItems.filter((m) => m.items.length > 0);
    expect(nonEmpty).toHaveLength(12);
    for (const month of nonEmpty) {
      expect(month.items).toHaveLength(1);
      expect(month.items[0].name).toBe("Netflix");
    }
    expect(data.yearTotal).toBeCloseTo(12 * 10 * 7);
  });

  it("yearly subscription only appears in its billing month", () => {
    const data = buildTextReportData(
      [
        sub({
          id: "yearly",
          name: "AWS",
          price: 120,
          currency: "USD",
          billingCycle: "yearly",
          nextBillingDate: "2027-03-15",
        }),
      ],
      rates,
      new Date("2026-05-17T00:00:00.000Z"),
    );

    const nonEmpty = data.yearMonthItems.filter((m) => m.items.length > 0);
    expect(nonEmpty).toHaveLength(1);
    expect(nonEmpty[0].monthKey).toBe("2027-03");
  });

  it("excludes paused and custom-cycle subscriptions", () => {
    const data = buildTextReportData(
      [
        sub({ id: "paused", name: "Paused", status: "paused" }),
        sub({ id: "custom", name: "Custom", billingCycle: "custom" }),
        sub({
          id: "valid",
          name: "Valid",
          price: 10,
          currency: "CNY",
          nextBillingDate: "2026-05-20",
        }),
      ],
      rates,
      new Date("2026-05-17T00:00:00.000Z"),
    );

    expect(data.currentMonthItems).toHaveLength(1);
    expect(data.currentMonthItems[0].name).toBe("Valid");
  });

  it("includes lookback items in current month", () => {
    const data = buildTextReportData(
      [
        sub({
          id: "monthly-paid",
          name: "Paid",
          price: 10,
          currency: "USD",
          billingCycle: "monthly",
          nextBillingDate: "2026-06-03",
          createdAt: "2026-04-01T00:00:00.000Z",
        }),
      ],
      rates,
      new Date("2026-05-17T00:00:00.000Z"),
    );

    expect(data.currentMonthItems).toHaveLength(1);
    expect(data.currentMonthItems[0].billingDay).toBe(3);
  });

  it("sorts current month items by billing day", () => {
    const data = buildTextReportData(
      [
        sub({
          id: "a",
          name: "Z-Service",
          price: 10,
          currency: "CNY",
          nextBillingDate: "2026-05-25",
        }),
        sub({
          id: "b",
          name: "A-Service",
          price: 10,
          currency: "CNY",
          nextBillingDate: "2026-05-05",
        }),
      ],
      rates,
      new Date("2026-05-17T00:00:00.000Z"),
    );

    expect(data.currentMonthItems[0].billingDay).toBe(5);
    expect(data.currentMonthItems[1].billingDay).toBe(25);
  });

  it("sorts year items by converted amount descending", () => {
    const data = buildTextReportData(
      [
        sub({
          id: "cheap",
          name: "Cheap",
          price: 1,
          currency: "USD",
          billingCycle: "monthly",
          nextBillingDate: "2026-05-20",
        }),
        sub({
          id: "expensive",
          name: "Expensive",
          price: 100,
          currency: "CNY",
          billingCycle: "monthly",
          nextBillingDate: "2026-05-15",
        }),
      ],
      rates,
      new Date("2026-05-17T00:00:00.000Z"),
    );

    const may = data.yearMonthItems.find((m) => m.monthKey === "2026-05")!;
    expect(may.items[0].name).toBe("Expensive");
    expect(may.items[1].name).toBe("Cheap");
  });
});

describe("formatTextReport", () => {
  const rates = {
    base: "CNY" as const,
    rates: { CNY: 1, USD: 7 },
  };

  it("formats current month and year items as text", () => {
    const data = buildTextReportData(
      [
        sub({
          id: "a",
          name: "Netflix",
          price: 10,
          currency: "USD",
          nextBillingDate: "2026-05-20",
        }),
        sub({
          id: "b",
          name: "Spotify",
          price: 15,
          currency: "CNY",
          nextBillingDate: "2026-05-10",
        }),
      ],
      rates,
      new Date("2026-05-17T00:00:00.000Z"),
    );

    const chunks = formatTextReport(data);
    const text = chunks.join("\n");

    expect(text).toContain("当月支出 · 2026-05");
    expect(text).toContain("Spotify");
    expect(text).toContain("Netflix");
    expect(text).toContain("10日");
    expect(text).toContain("20日");
    expect(text).toContain("年度预期");
  });

  it("shows converted amount arrow only for non-base currencies", () => {
    const data = buildTextReportData(
      [
        sub({
          id: "usd",
          name: "US Service",
          price: 10,
          currency: "USD",
          nextBillingDate: "2026-05-20",
        }),
        sub({
          id: "cny",
          name: "CN Service",
          price: 50,
          currency: "CNY",
          nextBillingDate: "2026-05-10",
        }),
      ],
      rates,
      new Date("2026-05-17T00:00:00.000Z"),
    );

    const chunks = formatTextReport(data);
    const text = chunks.join("\n");

    expect(text).toContain("→");
    expect(text).toContain("→");

    expect(text).toContain("US Service  $10.00 → CN¥70.00");

    const cnyLine = `CN Service  CN¥50.00`;
    expect(text).toContain(cnyLine);
  });

  it("splits into multiple chunks when exceeding 4096 chars", () => {
    const manySubs: Subscription[] = [];
    for (let i = 0; i < 200; i++) {
      manySubs.push(
        sub({
          id: `sub-${i}`,
          name: `Subscription ${String(i).padStart(3, "0")}`,
          price: 10 + i,
          currency: "USD",
          billingCycle: "monthly",
          nextBillingDate: "2026-05-20",
          createdAt: "2026-01-01T00:00:00.000Z",
        }),
      );
    }

    const data = buildTextReportData(
      manySubs,
      rates,
      new Date("2026-05-17T00:00:00.000Z"),
    );
    const chunks = formatTextReport(data);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(4096);
    }
  });

  it("handles empty subscriptions gracefully", () => {
    const data = buildTextReportData(
      [],
      rates,
      new Date("2026-05-17T00:00:00.000Z"),
    );
    const chunks = formatTextReport(data);
    const text = chunks.join("\n");

    expect(text).toContain("暂无扣款");
    expect(text).toContain("暂无预期扣款");
  });
});
