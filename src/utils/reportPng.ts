import type {
  ReportData,
  SplitReportData,
  TextReportSubscriptionItem,
} from "../services/reportService.js";
import { buildReportOverviewSvg, buildReportSvg } from "./reportSvg.js";
import {
  REPORT_FONT_FAMILY,
  REPORT_RESVG_FONT_BUFFERS,
} from "./reportFonts.js";

export async function renderReportPng(report: ReportData): Promise<Uint8Array> {
  return renderSvgPng(buildReportSvg(report));
}

export async function renderReportOverviewPng(
  report: SplitReportData,
  upcomingItems: TextReportSubscriptionItem[],
): Promise<Uint8Array> {
  return renderSvgPng(await buildReportOverviewSvg(report, upcomingItems));
}

async function renderSvgPng(svg: string): Promise<Uint8Array> {
  const { Resvg } = await import("@cf-wasm/resvg/workerd");
  const resvg = await Resvg.async(svg, {
    background: "#f8f7f2",
    fitTo: {
      mode: "width",
      value: 1200,
    },
    font: {
      fontBuffers: REPORT_RESVG_FONT_BUFFERS,
      defaultFontFamily: REPORT_FONT_FAMILY,
      defaultFontSize: 16,
    },
  });

  try {
    const rendered = resvg.render();
    try {
      return rendered.asPng();
    } finally {
      rendered.free();
    }
  } finally {
    resvg.free();
  }
}
