import { describe, expect, it } from "vitest";
import type { ReportData } from "../src/services/reportService.js";
import { buildReportSvg } from "../src/utils/reportSvg.js";

function report(overrides: Partial<ReportData> = {}): ReportData {
  return {
    title: "月度摊平支出",
    totalLabel: "月度摊平支出",
    chartTitle: "月度摊平分布",
    chartSubtitle: "按扣款日汇总的月度摊平支出",
    generatedAt: "2026-06-17T00:00:00.000Z",
    baseCurrency: "EUR",
    subscriptionCount: 1,
    includedCount: 1,
    convertedCount: 1,
    totalBase: 7,
    byCurrency: [],
    dayDistribution: [
      { day: 1, actualTotal: 13, monthlyEquivalentTotal: 7 },
      { day: 2, actualTotal: 0, monthlyEquivalentTotal: 0 },
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

describe("buildReportSvg", () => {
  it("renders monthly view labels with actual and monthly-equivalent values", () => {
    const svg = buildReportSvg(report());

    expect(svg).toContain("扣13");
    expect(svg).toContain("摊7");
    expect(svg).toContain('class="bar-label-monthly"');
  });

  it("renders monthly-equivalent bars as the muted series", () => {
    const svg = buildReportSvg(report());

    expect(svg).toContain('fill="#2f6f73" fill-opacity="0.35"');
    expect(svg).toContain(
      '<rect x="840" y="346" width="16" height="16" rx="3" fill="#2f6f73" fill-opacity="0.35"/>',
    );
    expect(svg).toContain(
      '<rect x="980" y="346" width="16" height="16" rx="3" fill="#b7791f"/>',
    );
    expect(svg).not.toContain('fill="#b7791f" fill-opacity="0.45"');
  });
});
