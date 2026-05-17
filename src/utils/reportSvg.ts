import type {
  ReportCurrencySummary,
  ReportData,
} from "../services/reportService.js";
import { formatMoney } from "./money.js";

const WIDTH = 1200;
const HEIGHT = 800;
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
    ...report.dayDistribution.map((item) => item.convertedMonthlyTotal),
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
        (item.convertedMonthlyTotal / maxDistribution) * CHART_HEIGHT,
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
          compactAmount(item.convertedMonthlyTotal),
        )}</text>`;
    })
    .join("");

  const currencyRows = report.byCurrency
    .slice(0, 6)
    .map((summary, index) => {
      const y = 416 + index * 48;
      const converted =
        summary.convertedMonthlyTotal !== undefined
          ? formatMoney(summary.convertedMonthlyTotal, report.baseCurrency)
          : "missing rate";
      return `
        <text x="800" y="${y}" class="row-currency">${escapeXml(
          summary.currency,
        )}</text>
        <text x="970" y="${y}" class="row-text" text-anchor="end">${escapeXml(
          formatMoney(summary.monthlyTotal, summary.currency),
        )}</text>
        <text x="1100" y="${y}" class="row-muted" text-anchor="end">${escapeXml(
          converted,
        )}</text>
        <text x="800" y="${y + 24}" class="row-small">${summary.subscriptionCount} subscriptions</text>`;
    })
    .join("");

  const excludedTotal =
    report.excluded.noPrice +
    report.excluded.noCurrency +
    report.excluded.customCycle;
  const missingRates =
    report.missingRateCurrencies.length > 0
      ? `Missing rates: ${report.missingRateCurrencies.join(", ")}`
      : "All included currencies converted";
  const excludedLabel =
    excludedTotal === 0
      ? "No subscriptions excluded"
      : `Excluded ${excludedTotal}: no price ${report.excluded.noPrice}, no currency ${report.excluded.noCurrency}, custom ${report.excluded.customCycle}`;
  const chartEmpty = report.dayDistribution.length === 0;
  const chartSubtitle = chartEmpty
    ? "No converted subscriptions with a billing date yet"
    : "Monthly-equivalent spend bucketed by next billing day";
  const topCurrency = report.byCurrency
    .filter(hasConvertedTotal)
    .sort((a, b) => b.convertedMonthlyTotal - a.convertedMonthlyTotal)[0];
  const largestCurrency = topCurrency
    ? `${topCurrency.currency} ${formatMoney(
        topCurrency.convertedMonthlyTotal,
        report.baseCurrency,
      )}`
    : "No converted currency";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <style>
    text { font-family: Inter, Arial, sans-serif; }
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
  <text x="80" y="86" class="title">Subscription Run-Rate</text>
  <text x="82" y="124" class="subtitle">Current subscriptions only - generated ${escapeXml(
    report.generatedAt.slice(0, 10),
  )} - base ${report.baseCurrency}</text>

  <rect class="panel" x="72" y="154" width="680" height="178" rx="8"/>
  <text x="98" y="203" class="label">MONTHLY RUN-RATE</text>
  <text x="96" y="282" class="metric">${escapeXml(
    formatMoney(report.monthlyTotalBase, report.baseCurrency),
  )}</text>
  <text x="98" y="314" class="note">Converted ${report.convertedCount} of ${
    report.includedCount
  } included subscriptions into ${report.baseCurrency}</text>

  <rect class="soft-teal" x="778" y="154" width="150" height="84" rx="8"/>
  <text x="800" y="190" class="stat">${report.includedCount}/${
    report.subscriptionCount
  }</text>
  <text x="800" y="218" class="label">INCLUDED</text>

  <rect class="soft-gold" x="948" y="154" width="180" height="84" rx="8"/>
  <text x="970" y="190" class="stat">${report.byCurrency.length}</text>
  <text x="970" y="218" class="label">CURRENCIES</text>

  <rect class="soft-rose" x="778" y="256" width="350" height="76" rx="8"/>
  <text x="800" y="294" class="row-text">${escapeXml(largestCurrency)}</text>
  <text x="800" y="320" class="label">TOP CONVERTED CURRENCY GROUP</text>

  <text x="80" y="374" class="section">Billing day distribution</text>
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
      ? '<text x="110" y="535" class="subtitle">No converted subscriptions to chart.</text>'
      : ""
  }

  <rect class="panel" x="778" y="360" width="350" height="324" rx="8"/>
  <text x="800" y="392" class="section">Currency summary</text>
  ${currencyRows}

  <rect class="panel" x="72" y="704" width="1056" height="64" rx="8"/>
  <text x="96" y="735" class="note">${escapeXml(excludedLabel)}</text>
  <text x="96" y="758" class="row-small">${escapeXml(missingRates)}</text>
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
): summary is ReportCurrencySummary & { convertedMonthlyTotal: number } {
  return summary.convertedMonthlyTotal !== undefined;
}
