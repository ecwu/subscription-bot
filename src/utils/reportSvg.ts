import type {
  ReportCurrencySummary,
  ReportData,
} from "../services/reportService.js";
import { formatMoney } from "./money.js";

const WIDTH = 1200;
const HEIGHT = 760;
const CHART_X = 80;
const CHART_Y = 420;
const CHART_WIDTH = 660;
const CHART_HEIGHT = 220;

const COLORS = {
  ink: "#162326",
  muted: "#5f6f72",
  faint: "#89979a",
  line: "#d9d4ca",
  panel: "#ffffff",
  bg: "#f8f7f2",
  teal: "#2f6f73",
  tealLight: "#d8eeee",
  gold: "#b7791f",
  goldLight: "#fff1d6",
  rose: "#a85555",
  roseLight: "#f7e1dd",
};

export function buildReportSvg(report: ReportData): string {
  const maxDistribution = Math.max(
    ...report.dayDistribution.map((item) => item.convertedTotal),
    1,
  );
  const barStep = Math.floor(
    CHART_WIDTH / Math.max(report.dayDistribution.length, 1),
  );
  const barWidth = Math.min(56, Math.max(16, barStep - 10));

  const bars = report.dayDistribution
    .map((item, index) => {
      const height = Math.max(
        4,
        (item.convertedTotal / maxDistribution) * CHART_HEIGHT,
      );
      const x = CHART_X + index * barStep + (barStep - barWidth) / 2;
      const y = CHART_Y + CHART_HEIGHT - height;
      return `
        <rect x="${x}" y="${y.toFixed(1)}" width="${barWidth}" height="${height.toFixed(
          1,
        )}" rx="5" fill="${COLORS.teal}"/>
        <text x="${x + barWidth / 2}" y="${CHART_Y + CHART_HEIGHT + 34}" text-anchor="middle" class="axis">D${String(
          item.day,
        ).padStart(2, "0")}</text>
        <text x="${x + barWidth / 2}" y="${Math.max(
          y - 10,
          CHART_Y - 4,
        ).toFixed(1)}" text-anchor="middle" class="bar-label">${escapeXml(
          compactAmount(item.convertedTotal),
        )}</text>`;
    })
    .join("");

  const currencyRows = report.byCurrency
    .slice(0, 6)
    .map((summary, index) => {
      const y = 416 + index * 48;
      const converted =
        summary.convertedTotal !== undefined
          ? formatMoney(summary.convertedTotal, report.baseCurrency)
          : "缺少汇率";
      return `
        <text x="800" y="${y}" class="row-currency">${escapeXml(
          summary.currency,
        )}</text>
        <text x="970" y="${y}" class="row-text" text-anchor="end">${escapeXml(
          formatMoney(summary.total, summary.currency),
        )}</text>
        <text x="1100" y="${y}" class="row-muted" text-anchor="end">${escapeXml(
          converted,
        )}</text>
        <text x="800" y="${y + 24}" class="row-small">${summary.subscriptionCount} 个订阅</text>`;
    })
    .join("");

  const chartEmpty = report.dayDistribution.length === 0;
  const chartSubtitle = chartEmpty ? "暂无已换算订阅" : report.chartSubtitle;
  const topCurrency = report.byCurrency
    .filter(hasConvertedTotal)
    .sort((a, b) => b.convertedTotal - a.convertedTotal)[0];
  const largestCurrency = topCurrency
    ? `${topCurrency.currency} ${formatMoney(
        topCurrency.convertedTotal,
        report.baseCurrency,
      )}`
    : "无已换算币种";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <style>
    text { font-family: "Noto Sans SC", sans-serif; }
    .bg { fill: ${COLORS.bg}; }
    .panel { fill: ${COLORS.panel}; stroke: ${COLORS.line}; stroke-width: 1; }
    .soft-teal { fill: ${COLORS.tealLight}; }
    .soft-gold { fill: ${COLORS.goldLight}; }
    .soft-rose { fill: ${COLORS.roseLight}; }
    .title { font-size: 44px; font-weight: 700; fill: ${COLORS.ink}; }
    .subtitle { font-size: 21px; font-weight: 400; fill: ${COLORS.muted}; }
    .metric { font-size: 66px; font-weight: 700; fill: ${COLORS.ink}; }
    .stat { font-size: 34px; font-weight: 700; fill: ${COLORS.ink}; }
    .label { font-size: 18px; font-weight: 700; fill: ${COLORS.muted}; letter-spacing: 0.6px; }
    .section { font-size: 25px; font-weight: 700; fill: ${COLORS.ink}; }
    .row-currency { font-size: 23px; font-weight: 700; fill: ${COLORS.ink}; }
    .row-text { font-size: 22px; font-weight: 700; fill: ${COLORS.ink}; }
    .row-muted { font-size: 20px; font-weight: 400; fill: ${COLORS.muted}; }
    .row-small { font-size: 17px; font-weight: 400; fill: ${COLORS.faint}; }
    .axis { font-size: 15px; font-weight: 400; fill: ${COLORS.muted}; }
    .bar-label { font-size: 15px; font-weight: 700; fill: ${COLORS.ink}; }
    .note { font-size: 19px; font-weight: 400; fill: ${COLORS.muted}; }
  </style>
  <rect class="bg" x="0" y="0" width="${WIDTH}" height="${HEIGHT}"/>
  <text x="80" y="86" class="title">${escapeXml(report.title)}</text>
  <text x="82" y="124" class="subtitle">当前订阅 · 生成于 ${escapeXml(
    report.generatedAt.slice(0, 10),
  )} · 基准货币 ${report.baseCurrency}</text>

  <rect class="panel" x="72" y="154" width="680" height="178" rx="8"/>
  <text x="98" y="203" class="label">${escapeXml(report.totalLabel)}</text>
  <text x="96" y="282" class="metric">${escapeXml(
    formatMoney(report.totalBase, report.baseCurrency),
  )}</text>
  <text x="98" y="314" class="note">${report.convertedCount} 个订阅已换算为 ${
    report.baseCurrency
  }</text>

  <rect class="soft-teal" x="778" y="154" width="150" height="84" rx="8"/>
  <text x="800" y="190" class="stat">${report.includedCount}</text>
  <text x="800" y="218" class="label">纳入统计</text>

  <rect class="soft-gold" x="948" y="154" width="180" height="84" rx="8"/>
  <text x="970" y="190" class="stat">${report.byCurrency.length}</text>
  <text x="970" y="218" class="label">币种数量</text>

  <rect class="soft-rose" x="778" y="256" width="350" height="76" rx="8"/>
  <text x="800" y="294" class="row-text">${escapeXml(largestCurrency)}</text>
  <text x="800" y="320" class="label">最大支出币种</text>

  <text x="80" y="374" class="section">${escapeXml(report.chartTitle)}</text>
  <text x="80" y="405" class="note">${escapeXml(chartSubtitle)}</text>
  <line x1="${CHART_X}" y1="${CHART_Y}" x2="${
    CHART_X + CHART_WIDTH
  }" y2="${CHART_Y}" stroke="${COLORS.line}" stroke-width="1"/>
  <line x1="${CHART_X}" y1="${CHART_Y + CHART_HEIGHT / 2}" x2="${
    CHART_X + CHART_WIDTH
  }" y2="${CHART_Y + CHART_HEIGHT / 2}" stroke="${COLORS.line}" stroke-width="1"/>
  <line x1="${CHART_X}" y1="${CHART_Y + CHART_HEIGHT}" x2="${
    CHART_X + CHART_WIDTH
  }" y2="${CHART_Y + CHART_HEIGHT}" stroke="${COLORS.line}" stroke-width="2"/>
  ${bars}
  ${
    chartEmpty
      ? '<text x="110" y="535" class="subtitle">暂无已换算订阅。</text>'
      : ""
  }

  <rect class="panel" x="778" y="360" width="350" height="324" rx="8"/>
  <text x="800" y="392" class="section">币种汇总</text>
  ${currencyRows}
</svg>`;
}

function compactAmount(amount: number): string {
  if (amount >= 10000) return `${Math.round(amount / 1000)}k`;
  if (amount >= 1000) return `${(amount / 1000).toFixed(1)}k`;
  return Math.round(amount).toString();
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function hasConvertedTotal(
  summary: ReportCurrencySummary,
): summary is ReportCurrencySummary & { convertedTotal: number } {
  return summary.convertedTotal !== undefined;
}
