import { describe, it, expect } from "vitest";
import {
  buildReportData,
  formatReportText,
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
    expect(text).not.toContain("Private Service");
  });
});
