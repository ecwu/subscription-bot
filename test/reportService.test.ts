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

  it("normalizes supported billing cycles to monthly run-rate", () => {
    const report = buildReportData(
      [
        sub({ id: "monthly", price: 10, billingCycle: "monthly" }),
        sub({ id: "yearly", price: 120, billingCycle: "yearly" }),
        sub({ id: "quarterly", price: 30, billingCycle: "quarterly" }),
        sub({ id: "weekly", price: 12, billingCycle: "weekly" }),
      ],
      rates,
      new Date("2026-05-17T00:00:00.000Z"),
    );

    expect(report.includedCount).toBe(4);
    expect(report.monthlyTotalBase).toBeCloseTo((10 + 10 + 10 + 52) * 7);
    expect(report.byCurrency[0]).toMatchObject({
      currency: "USD",
      subscriptionCount: 4,
    });
    expect(report.byCurrency[0].monthlyTotal).toBeCloseTo(82);
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
    );

    expect(report.includedCount).toBe(1);
    expect(report.excluded).toEqual({
      noPrice: 1,
      noCurrency: 1,
      customCycle: 1,
    });
    expect(report.monthlyTotalBase).toBe(10);
  });

  it("groups by currency and reports missing exchange rates", () => {
    const report = buildReportData(
      [
        sub({ id: "usd", price: 10, currency: "USD" }),
        sub({ id: "eur", price: 10, currency: "EUR" }),
        sub({ id: "gbp", price: 10, currency: "GBP" }),
      ],
      rates,
    );

    expect(report.byCurrency).toHaveLength(3);
    expect(report.monthlyTotalBase).toBe(150);
    expect(report.convertedCount).toBe(2);
    expect(report.missingRateCurrencies).toEqual(["GBP"]);
    expect(
      report.byCurrency.find((item) => item.currency === "GBP"),
    ).toMatchObject({
      monthlyTotal: 10,
      convertedMonthlyTotal: undefined,
    });
  });

  it("aggregates converted monthly totals by next billing day", () => {
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
          nextBillingDate: "2026-07-01",
        }),
        sub({
          id: "c",
          price: 5,
          currency: "EUR",
          nextBillingDate: "2026-07-15",
        }),
        sub({
          id: "d",
          price: 5,
          currency: "GBP",
          nextBillingDate: "2026-07-15",
        }),
      ],
      rates,
    );

    expect(report.dayDistribution).toEqual([
      { day: 1, convertedMonthlyTotal: 210 },
      { day: 15, convertedMonthlyTotal: 40 },
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
    expect(text).toContain("订阅月度支出报告");
    expect(text).not.toContain("Private Service");
  });
});
