import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReportData } from "../src/services/reportService.js";

const resvgMock = vi.hoisted(() => ({
  async: vi.fn(),
  renderedFree: vi.fn(),
  resvgFree: vi.fn(),
}));

vi.mock("@cf-wasm/resvg/workerd", () => ({
  Resvg: {
    async: resvgMock.async,
  },
}));

import { renderReportPng } from "../src/utils/reportPng.js";

function report(overrides: Partial<ReportData> = {}): ReportData {
  return {
    title: "未来30天摊平支出",
    totalLabel: "未来30天摊平支出",
    chartTitle: "未来30天摊平分布",
    chartSubtitle: "按未来30天日期汇总的月度摊平支出",
    generatedAt: "2026-06-17T00:00:00.000Z",
    baseCurrency: "CNY",
    subscriptionCount: 1,
    includedCount: 1,
    convertedCount: 1,
    totalBase: 12,
    byCurrency: [{ currency: "USD", total: 12, subscriptionCount: 1 }],
    dayDistribution: [
      { day: 1, actualTotal: 12, monthlyEquivalentTotal: 12, actualCount: 1 },
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

describe("renderReportPng", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resvgMock.async.mockResolvedValue({
      render: () => ({
        asPng: () => new Uint8Array([1, 2, 3]),
        free: resvgMock.renderedFree,
      }),
      free: resvgMock.resvgFree,
    });
  });

  it("renders report SVG through resvg and frees native handles", async () => {
    const png = await renderReportPng(report());

    expect(Array.from(png)).toEqual([1, 2, 3]);
    expect(resvgMock.async).toHaveBeenCalledTimes(1);
    const [svg, options] = resvgMock.async.mock.calls[0];
    expect(svg).toContain("未来30天摊平支出");
    expect(options.fitTo).toEqual({ mode: "width", value: 1200 });
    expect(options.font.defaultFontFamily).toBe("Noto Sans SC");
    expect(options.font.fontBuffers).toHaveLength(18);
    expect(resvgMock.renderedFree).toHaveBeenCalledTimes(1);
    expect(resvgMock.resvgFree).toHaveBeenCalledTimes(1);
  });
});
