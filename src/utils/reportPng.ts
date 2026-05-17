import type { ReportData } from "../services/reportService.js";
import { buildReportSvg } from "./reportSvg.js";
import interBold from "@fontsource/inter/files/inter-latin-700-normal.woff2";
import interRegular from "@fontsource/inter/files/inter-latin-400-normal.woff2";

export async function renderReportPng(report: ReportData): Promise<Uint8Array> {
  const { Resvg } = await import("@cf-wasm/resvg/workerd");
  const svg = buildReportSvg(report);
  const resvg = await Resvg.async(svg, {
    background: "#f8f7f2",
    fitTo: {
      mode: "width",
      value: 1200,
    },
    font: {
      fontBuffers: [toFontBuffer(interRegular), toFontBuffer(interBold)],
      defaultFontFamily: "Inter",
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

function toFontBuffer(buffer: ArrayBuffer): Uint8Array {
  return new Uint8Array(buffer);
}
