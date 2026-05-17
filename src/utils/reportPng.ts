import type { ReportData } from "../services/reportService.js";
import { buildReportSvg } from "./reportSvg.js";
import notoSansSc113Bold from "@fontsource/noto-sans-sc/files/noto-sans-sc-113-700-normal.woff2";
import notoSansSc113Regular from "@fontsource/noto-sans-sc/files/noto-sans-sc-113-400-normal.woff2";
import notoSansSc114Bold from "@fontsource/noto-sans-sc/files/noto-sans-sc-114-700-normal.woff2";
import notoSansSc114Regular from "@fontsource/noto-sans-sc/files/noto-sans-sc-114-400-normal.woff2";
import notoSansSc115Bold from "@fontsource/noto-sans-sc/files/noto-sans-sc-115-700-normal.woff2";
import notoSansSc115Regular from "@fontsource/noto-sans-sc/files/noto-sans-sc-115-400-normal.woff2";
import notoSansSc116Bold from "@fontsource/noto-sans-sc/files/noto-sans-sc-116-700-normal.woff2";
import notoSansSc116Regular from "@fontsource/noto-sans-sc/files/noto-sans-sc-116-400-normal.woff2";
import notoSansSc117Bold from "@fontsource/noto-sans-sc/files/noto-sans-sc-117-700-normal.woff2";
import notoSansSc117Regular from "@fontsource/noto-sans-sc/files/noto-sans-sc-117-400-normal.woff2";
import notoSansSc118Bold from "@fontsource/noto-sans-sc/files/noto-sans-sc-118-700-normal.woff2";
import notoSansSc118Regular from "@fontsource/noto-sans-sc/files/noto-sans-sc-118-400-normal.woff2";
import notoSansSc119Bold from "@fontsource/noto-sans-sc/files/noto-sans-sc-119-700-normal.woff2";
import notoSansSc119Regular from "@fontsource/noto-sans-sc/files/noto-sans-sc-119-400-normal.woff2";
import notoSansScLatinBold from "@fontsource/noto-sans-sc/files/noto-sans-sc-latin-700-normal.woff2";
import notoSansScLatinRegular from "@fontsource/noto-sans-sc/files/noto-sans-sc-latin-400-normal.woff2";

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
      fontBuffers: [
        toFontBuffer(notoSansScLatinRegular),
        toFontBuffer(notoSansScLatinBold),
        toFontBuffer(notoSansSc113Regular),
        toFontBuffer(notoSansSc113Bold),
        toFontBuffer(notoSansSc114Regular),
        toFontBuffer(notoSansSc114Bold),
        toFontBuffer(notoSansSc115Regular),
        toFontBuffer(notoSansSc115Bold),
        toFontBuffer(notoSansSc116Regular),
        toFontBuffer(notoSansSc116Bold),
        toFontBuffer(notoSansSc117Regular),
        toFontBuffer(notoSansSc117Bold),
        toFontBuffer(notoSansSc118Regular),
        toFontBuffer(notoSansSc118Bold),
        toFontBuffer(notoSansSc119Regular),
        toFontBuffer(notoSansSc119Bold),
      ],
      defaultFontFamily: "Noto Sans SC",
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
