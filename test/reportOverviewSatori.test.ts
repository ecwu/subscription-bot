import { describe, expect, it, vi } from "vitest";
import type { ReportData, SplitReportData } from "../src/services/reportService.js";

vi.mock("typeface-roboto/files/roboto-latin-400.woff", async () => {
  const { readFileSync } = await import("node:fs");
  const buffer = readFileSync(
    "node_modules/typeface-roboto/files/roboto-latin-400.woff",
  );
  return {
    default: buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ),
  };
});

vi.mock("typeface-roboto/files/roboto-latin-700.woff", async () => {
  const { readFileSync } = await import("node:fs");
  const buffer = readFileSync(
    "node_modules/typeface-roboto/files/roboto-latin-700.woff",
  );
  return {
    default: buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ),
  };
});

import { buildReportOverviewSvg } from "../src/utils/reportSvg.js";

function report(overrides: Partial<ReportData> = {}): ReportData {
  return {
    title: "月均订阅成本",
    totalLabel: "月均订阅成本",
    chartTitle: "每日摊平成本",
    chartSubtitle: "活跃自动续费订阅折算为月均后按 30 天摊平",
    generatedAt: "2026-06-17T00:00:00.000Z",
    baseCurrency: "CNY",
    subscriptionCount: 1,
    includedCount: 1,
    convertedCount: 1,
    totalBase: 7,
    byCurrency: [],
    dayDistribution: [
      { day: 3, actualTotal: 13, monthlyEquivalentTotal: 7, actualCount: 1 },
    ],
    missingRateCurrencies: [],
    excluded: {
      noPrice: 0,
      noCurrency: 0,
      customCycle: 0,
      trial: 0,
      nonRenewing: 0,
    },
    ...overrides,
  };
}

describe("buildReportOverviewSvg with real Satori", () => {
  it("renders without Satori layout errors", async () => {
    const splitReport: SplitReportData = {
      generatedAt: "2026-06-17T00:00:00.000Z",
      baseCurrency: "CNY",
      subscriptionCount: 2,
      currentMonthly: report({ totalBase: 120 }),
      currentMonthDue: report({ totalBase: 80 }),
      yearlyProjection: report({
        totalBase: 1440,
        monthDistribution: [
          { monthKey: "2026-06", actualTotal: 80 },
          { monthKey: "2026-07", actualTotal: 120 },
        ],
      }),
    };

    const svg = await buildReportOverviewSvg(splitReport, [
      {
        name: "Private Service",
        amount: 10,
        currency: "USD",
        convertedAmount: 72,
        billingDate: "2026-06-20",
      },
    ]);

    expect(svg).toContain("<svg");
    expect(svg).toContain('font-family="Noto Sans SC"');
    expect(svg).toContain(">订</text>");
    expect(svg).toContain(">览</text>");
  });
});
