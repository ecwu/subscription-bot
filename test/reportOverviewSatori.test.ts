import { describe, expect, it, vi } from "vitest";
import type {
  ReportData,
  SplitReportData,
} from "../src/services/reportService.js";

vi.mock("../src/utils/reportFonts.js", async () => {
  const { readFileSync } = await import("node:fs");

  const readFont = (fileName: string): ArrayBuffer => {
    const buffer = readFileSync(
      `node_modules/@fontsource/noto-sans-sc/files/${fileName}`,
    );
    return buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    );
  };

  const REPORT_FONT_FAMILY = "Noto Sans SC";
  const fontSources = [
    { data: readFont("noto-sans-sc-latin-400-normal.woff"), weight: 400 },
    { data: readFont("noto-sans-sc-106-400-normal.woff"), weight: 400 },
    { data: readFont("noto-sans-sc-109-400-normal.woff"), weight: 400 },
    { data: readFont("noto-sans-sc-110-400-normal.woff"), weight: 400 },
    { data: readFont("noto-sans-sc-112-400-normal.woff"), weight: 400 },
    { data: readFont("noto-sans-sc-113-400-normal.woff"), weight: 400 },
    { data: readFont("noto-sans-sc-114-400-normal.woff"), weight: 400 },
    { data: readFont("noto-sans-sc-115-400-normal.woff"), weight: 400 },
    { data: readFont("noto-sans-sc-116-400-normal.woff"), weight: 400 },
    { data: readFont("noto-sans-sc-117-400-normal.woff"), weight: 400 },
    { data: readFont("noto-sans-sc-118-400-normal.woff"), weight: 400 },
    { data: readFont("noto-sans-sc-119-400-normal.woff"), weight: 400 },
  ] as const;

  return {
    REPORT_FONT_FAMILY,
    REPORT_SATORI_FONTS: fontSources.map((font) => ({
      name: REPORT_FONT_FAMILY,
      data: font.data,
      weight: font.weight,
      style: "normal",
    })),
    REPORT_RESVG_FONT_BUFFERS: fontSources.map(
      (font) => new Uint8Array(font.data),
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
    expect(svg).toContain('viewBox="0 0 1200 820"');
    expect(svg).toContain('font-family="noto sans sc"');
    expect(svg).toContain(">订</text>");
    expect(svg).toContain(">览</text>");
  });
});
