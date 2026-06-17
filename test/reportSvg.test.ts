import { describe, expect, it } from "vitest";
import type { ReportData } from "../src/services/reportService.js";
import { buildReportSvg } from "../src/utils/reportSvg.js";

function report(overrides: Partial<ReportData> = {}): ReportData {
  return {
    title: "未来30天摊平支出",
    totalLabel: "未来30天摊平支出",
    chartTitle: "未来30天摊平分布",
    chartSubtitle: "按未来30天日期汇总的月度摊平支出",
    generatedAt: "2026-06-17T00:00:00.000Z",
    baseCurrency: "EUR",
    subscriptionCount: 1,
    includedCount: 1,
    convertedCount: 1,
    totalBase: 7,
    byCurrency: [],
    dayDistribution: [
      { day: 1, actualTotal: 13, monthlyEquivalentTotal: 7, actualCount: 1 },
      { day: 2, actualTotal: 0, monthlyEquivalentTotal: 0, actualCount: 0 },
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

  it("renders upcoming due bars as blocks while keeping one total label", () => {
    const svg = buildReportSvg(
      report({
        title: "未来30天支出",
        totalLabel: "未来30天实际扣款",
        chartTitle: "未来30天扣款分布",
        chartSubtitle: "按未来30天日期汇总的实际扣款金额",
        totalBase: 20,
        dayLabelPrefix: "T+",
        dayDistribution: [
          {
            day: 0,
            actualTotal: 20,
            monthlyEquivalentTotal: 0,
            actualCount: 3,
          },
          {
            day: 1,
            actualTotal: 0,
            monthlyEquivalentTotal: 0,
            actualCount: 0,
          },
        ],
      }),
    );

    expect(svg).toContain(">20</text>");
    expect(svg.match(/x="320" y="(418\.0|496\.0|574\.0)"/g)).toHaveLength(3);
  });
});
