import type {
  ReportData,
  SplitReportData,
  TextReportSubscriptionItem,
} from "../services/reportService.js";
import { formatMoney } from "./money.js";
import satori from "satori";
import robotoBold from "typeface-roboto/files/roboto-latin-700.woff";
import robotoRegular from "typeface-roboto/files/roboto-latin-400.woff";

const WIDTH = 1200;
const HEIGHT = 700;
const CHART_X = 80;
const CHART_Y = 390;
const CHART_WIDTH = 1040;
const CHART_HEIGHT = 260;
const BAR_LABEL_TOP_PADDING = 28;
const BAR_MAX_HEIGHT = CHART_HEIGHT - BAR_LABEL_TOP_PADDING;
const MONTHLY_FILL_OPACITY = "0.35";
const STACK_BLOCK_GAP = 2;

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

export function buildReportOverviewSvg(
  report: SplitReportData,
  upcomingItems: TextReportSubscriptionItem[] = [],
): Promise<string> {
  const missingCurrencies = Array.from(
    new Set([
      ...report.currentMonthly.missingRateCurrencies,
      ...report.currentMonthDue.missingRateCurrencies,
      ...report.yearlyProjection.missingRateCurrencies,
    ]),
  ).sort();
  const excludedNote = overviewExcludedNote(report);
  const missingNote =
    missingCurrencies.length > 0
      ? `总额未计入缺失汇率：${missingCurrencies.join("、")}`
      : "";

  return buildSatoriSvg(
    h(
      "div",
      {
        style: {
          width: "100%",
          height: "100%",
          backgroundColor: COLORS.bg,
          color: COLORS.ink,
          display: "flex",
          flexDirection: "column",
          padding: 72,
          fontFamily: "Roboto",
        },
      },
      h("div", { style: { display: "flex", flexDirection: "column" } },
        h("div", { style: { fontSize: 42, fontWeight: 700 } }, "订阅支出总览"),
        h(
          "div",
          { style: { marginTop: 8, fontSize: 20, color: COLORS.muted } },
          `生成于 ${report.generatedAt.slice(0, 10)} · 基准货币 ${report.baseCurrency} · 当前订阅 ${report.subscriptionCount} 个`,
        ),
      ),
      h(
        "div",
        { style: { display: "flex", gap: 34, marginTop: 28 } },
        overviewMetricCard(
          "未来 30 天扣款",
          formatMoney(report.currentMonthDue.totalBase, report.baseCurrency),
          `${report.currentMonthDue.convertedCount} 个订阅已换算`,
        ),
        overviewMetricCard(
          "月均订阅成本",
          formatMoney(report.currentMonthly.totalBase, report.baseCurrency),
          "活跃自动续费订阅折算",
        ),
        overviewMetricCard(
          "未来 12 个月预期",
          formatMoney(report.yearlyProjection.totalBase, report.baseCurrency),
          "按真实扣款日期预测",
        ),
      ),
      h(
        "div",
        { style: { display: "flex", gap: 32, marginTop: 34 } },
        h(
          "div",
          { style: { display: "flex", flexDirection: "column", width: 512 } },
          overviewSectionTitle("未来 30 天扣款明细"),
          overviewPanel(
            h(
              "div",
              { style: { display: "flex", flexDirection: "column", gap: 12 } },
              ...overviewUpcomingRows(upcomingItems, report.baseCurrency),
            ),
            { height: 288 },
          ),
        ),
        h(
          "div",
          { style: { display: "flex", flexDirection: "column", width: 512 } },
          overviewSectionTitle("扣款日分布"),
          overviewPanel(overviewDueChartNode(report.currentMonthDue), { height: 132 }),
          h("div", { style: { height: 30 } }),
          overviewSectionTitle("年度月度趋势"),
          overviewPanel(overviewYearChartNode(report.yearlyProjection), {
            height: 96,
          }),
        ),
      ),
      h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            gap: 6,
            marginTop: "auto",
            fontSize: 17,
            color: COLORS.muted,
          },
        },
        missingNote
          ? h("div", { style: { color: COLORS.rose, fontWeight: 700 } }, missingNote)
          : null,
        excludedNote ? h("div", null, excludedNote) : null,
      ),
    ),
  );
}

export function buildReportSvg(report: ReportData): string {
  const isMonthlyView =
    report.title.includes("摊平") || report.title.includes("月均");
  const isYearView = report.monthDistribution !== undefined;

  let bars: string;
  let chartEmpty: boolean;
  let legendItems: string;

  if (isYearView && report.monthDistribution) {
    const monthData = report.monthDistribution;
    const maxDistribution = Math.max(
      ...monthData.map((item) => item.actualTotal),
      1,
    );
    const barStep = Math.floor(CHART_WIDTH / Math.max(monthData.length, 1));
    const barWidth = Math.min(70, Math.max(16, barStep - 12));

    bars = monthData
      .map((item, index) => {
        const actualH =
          item.actualTotal > 0
            ? Math.max(2, (item.actualTotal / maxDistribution) * BAR_MAX_HEIGHT)
            : 0;

        const x = CHART_X + index * barStep + (barStep - barWidth) / 2;
        const actualY = CHART_Y + CHART_HEIGHT - actualH;

        const actualRect =
          actualH > 0
            ? `<rect x="${x}" y="${actualY.toFixed(1)}" width="${barWidth}" height="${actualH.toFixed(1)}" rx="3" fill="${COLORS.gold}"/>`
            : "";

        const showLabel = item.actualTotal > 0;

        const monthLabel = monthNameFromKey(item.monthKey);

        return `
          ${actualRect}
          <text x="${x + barWidth / 2}" y="${CHART_Y + CHART_HEIGHT + 24}" text-anchor="middle" class="axis">${escapeXml(monthLabel)}</text>
          ${showLabel ? `<text x="${x + barWidth / 2}" y="${Math.max(actualY - 8, CHART_Y - 4).toFixed(1)}" text-anchor="middle" class="bar-label">${escapeXml(compactAmount(item.actualTotal))}</text>` : ""}`;
      })
      .join("");

    chartEmpty = monthData.every((item) => item.actualTotal === 0);

    const legendX = CHART_X + CHART_WIDTH - 160;
    const legendY = 346;
    legendItems = `
  <rect x="${legendX}" y="${legendY}" width="16" height="16" rx="3" fill="${COLORS.gold}"/>
  <text x="${legendX + 24}" y="${legendY + 14}" class="legend">预期扣款</text>`;
  } else {
    const maxDistribution = Math.max(
      ...report.dayDistribution.map((item) =>
        isMonthlyView
          ? item.actualTotal + item.monthlyEquivalentTotal
          : item.actualTotal,
      ),
      1,
    );
    const barStep = Math.floor(
      CHART_WIDTH / Math.max(report.dayDistribution.length, 1),
    );
    const barWidth = Math.min(40, Math.max(10, barStep - 6));
    const daysInMonth = report.dayDistribution.length;

    bars = report.dayDistribution
      .map((item, index) => {
        const monthlyH =
          isMonthlyView && item.monthlyEquivalentTotal > 0
            ? Math.max(
                2,
                (item.monthlyEquivalentTotal / maxDistribution) *
                  BAR_MAX_HEIGHT,
              )
            : 0;
        const actualH =
          item.actualTotal > 0
            ? Math.max(2, (item.actualTotal / maxDistribution) * BAR_MAX_HEIGHT)
            : 0;

        const x = CHART_X + index * barStep + (barStep - barWidth) / 2;
        const monthlyY = CHART_Y + CHART_HEIGHT - monthlyH;
        const actualY = monthlyY - actualH;

        const monthlyRect =
          monthlyH > 0
            ? `<rect x="${x}" y="${monthlyY.toFixed(1)}" width="${barWidth}" height="${monthlyH.toFixed(1)}" rx="3" fill="${COLORS.teal}"${isMonthlyView ? ` fill-opacity="${MONTHLY_FILL_OPACITY}"` : ""}/>`
            : "";
        const actualRect =
          actualH > 0
            ? isMonthlyView
              ? `<rect x="${x}" y="${actualY.toFixed(1)}" width="${barWidth}" height="${actualH.toFixed(1)}" rx="3" fill="${COLORS.gold}"/>`
              : actualBarBlocks(item.actualCount, x, actualY, barWidth, actualH)
            : "";

        const topY = actualH > 0 ? actualY : monthlyY;
        const showLabel = item.actualTotal > 0;

        const showDayLabel =
          index === 0 || index === daysInMonth - 1 || item.day % 5 === 0;
        const dayLabel =
          report.dayLabelPrefix !== undefined
            ? `${report.dayLabelPrefix}${item.day}`
            : `D${String(item.day).padStart(2, "0")}`;

        return `
          ${monthlyRect}
          ${actualRect}
          ${showDayLabel ? `<text x="${x + barWidth / 2}" y="${CHART_Y + CHART_HEIGHT + 24}" text-anchor="middle" class="axis">${escapeXml(dayLabel)}</text>` : ""}
          ${isMonthlyView ? monthlyViewBarLabels(item, x + barWidth / 2, topY) : showLabel ? `<text x="${x + barWidth / 2}" y="${Math.max(topY - 8, CHART_Y - 4).toFixed(1)}" text-anchor="middle" class="bar-label">${escapeXml(compactAmount(item.actualTotal))}</text>` : ""}`;
      })
      .join("");

    chartEmpty = report.dayDistribution.every(
      (item) => item.actualTotal === 0 && item.monthlyEquivalentTotal === 0,
    );

    const legendX = CHART_X + CHART_WIDTH - 280;
    const legendY = 346;

    legendItems = isMonthlyView
      ? `
  <rect x="${legendX}" y="${legendY}" width="16" height="16" rx="3" fill="${COLORS.teal}" fill-opacity="${MONTHLY_FILL_OPACITY}"/>
  <text x="${legendX + 24}" y="${legendY + 14}" class="legend">月度摊平</text>
  <rect x="${legendX + 140}" y="${legendY}" width="16" height="16" rx="3" fill="${COLORS.gold}"/>
  <text x="${legendX + 164}" y="${legendY + 14}" class="legend">实际扣款</text>`
      : `
  <rect x="${legendX + 70}" y="${legendY}" width="16" height="16" rx="3" fill="${COLORS.gold}"/>
  <text x="${legendX + 94}" y="${legendY + 14}" class="legend">实际扣款</text>`;
  }

  const chartSubtitle = chartEmpty ? "暂无已换算订阅" : report.chartSubtitle;

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
    .axis { font-size: 14px; font-weight: 400; fill: ${COLORS.muted}; }
    .bar-label { font-size: 14px; font-weight: 700; fill: ${COLORS.ink}; }
    .bar-label-monthly { font-size: 14px; font-weight: 700; fill: ${COLORS.teal}; opacity: 0.65; }
    .note { font-size: 19px; font-weight: 400; fill: ${COLORS.muted}; }
    .legend { font-size: 16px; font-weight: 700; fill: ${COLORS.muted}; }
  </style>
  <rect class="bg" x="0" y="0" width="${WIDTH}" height="${HEIGHT}"/>
  <text x="80" y="86" class="title">${escapeXml(report.title)}</text>
  <text x="82" y="124" class="subtitle">当前订阅 · 生成于 ${escapeXml(
    report.generatedAt.slice(0, 10),
  )} · 基准货币 ${report.baseCurrency}</text>

  <rect class="panel" x="72" y="154" width="1056" height="178" rx="8"/>
  <text x="98" y="203" class="label">${escapeXml(report.totalLabel)}</text>
  <text x="96" y="282" class="metric">${escapeXml(
    formatMoney(report.totalBase, report.baseCurrency),
  )}</text>
  <text x="98" y="314" class="note">${report.convertedCount} 个订阅已换算为 ${
    report.baseCurrency
  }${formatExcludedNote(report)}</text>

  <text x="80" y="360" class="section">${escapeXml(report.chartTitle)}</text>
  <text x="80" y="390" class="note">${escapeXml(chartSubtitle)}</text>
  ${legendItems}

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
</svg>`;
}

function monthlyViewBarLabels(
  item: { actualTotal: number; monthlyEquivalentTotal: number },
  x: number,
  topY: number,
): string {
  if (item.actualTotal <= 0 && item.monthlyEquivalentTotal <= 0) return "";

  const labelY = Math.max(topY - 24, CHART_Y - 12);
  const actualLabel = `扣${compactAmount(item.actualTotal)}`;
  const monthlyLabel = `摊${compactAmount(item.monthlyEquivalentTotal)}`;

  return `<text x="${x}" y="${labelY.toFixed(1)}" text-anchor="middle">
    <tspan x="${x}" class="bar-label">${escapeXml(actualLabel)}</tspan>
    <tspan x="${x}" dy="16" class="bar-label-monthly">${escapeXml(monthlyLabel)}</tspan>
  </text>`;
}

function actualBarBlocks(
  count: number,
  x: number,
  y: number,
  width: number,
  height: number,
): string {
  const blockCount = Math.max(1, count);
  if (blockCount === 1 || height <= STACK_BLOCK_GAP * 2) {
    return `<rect x="${x}" y="${y.toFixed(1)}" width="${width}" height="${height.toFixed(1)}" rx="3" fill="${COLORS.gold}"/>`;
  }

  const totalGap = STACK_BLOCK_GAP * (blockCount - 1);
  const blockHeight = Math.max(1, (height - totalGap) / blockCount);

  return Array.from({ length: blockCount }, (_, index) => {
    const blockY = y + index * (blockHeight + STACK_BLOCK_GAP);
    return `<rect x="${x}" y="${blockY.toFixed(1)}" width="${width}" height="${blockHeight.toFixed(1)}" rx="3" fill="${COLORS.gold}"/>`;
  }).join("");
}

type SatoriElement = {
  type: string;
  props: {
    style?: Record<string, unknown>;
    children?: SatoriChild | SatoriChild[];
    [key: string]: unknown;
  };
};

type SatoriChild = SatoriElement | string | number | null;

function h(
  type: string,
  props: Record<string, unknown> | null,
  ...children: SatoriChild[]
): SatoriElement {
  return {
    type,
    props: {
      ...(props ?? {}),
      children: children.length === 1 ? children[0] : children,
    },
  };
}

async function buildSatoriSvg(element: SatoriElement): Promise<string> {
  const svg = await satori(element as any, {
    width: WIDTH,
    height: HEIGHT,
    embedFont: false,
    fonts: [
      {
        name: "Roboto",
        data: robotoRegular,
        weight: 400,
      },
      {
        name: "Roboto",
        data: robotoBold,
        weight: 700,
      },
    ],
  });

  return svg.replace(/font-family="roboto"/g, 'font-family="Noto Sans SC"');
}

function overviewMetricCard(
  title: string,
  value: string,
  note: string,
): SatoriElement {
  return overviewPanel(
    h(
      "div",
      { style: { display: "flex", flexDirection: "column" } },
      h(
        "div",
        {
          style: {
            color: COLORS.muted,
            fontSize: 17,
            fontWeight: 700,
            letterSpacing: 0.5,
          },
        },
        title,
      ),
      h(
        "div",
        { style: { marginTop: 18, fontSize: 42, fontWeight: 700 } },
        value,
      ),
      h(
        "div",
        { style: { marginTop: 8, color: COLORS.muted, fontSize: 17 } },
        note,
      ),
    ),
    { width: 330, height: 144 },
  );
}

function overviewSectionTitle(title: string): SatoriElement {
  return h(
    "div",
    { style: { marginBottom: 12, fontSize: 24, fontWeight: 700 } },
    title,
  );
}

function overviewPanel(
  child: SatoriChild,
  size: { width?: number; height: number },
): SatoriElement {
  return h(
    "div",
    {
      style: {
        width: size.width ?? "100%",
        height: size.height,
        backgroundColor: COLORS.panel,
        border: `1px solid ${COLORS.line}`,
        borderRadius: 10,
        display: "flex",
        flexDirection: "column",
        padding: 24,
      },
    },
    child,
  );
}

function overviewUpcomingRows(
  items: TextReportSubscriptionItem[],
  baseCurrency: string,
): SatoriElement[] {
  const topUpcoming = items.slice(0, 5);
  if (topUpcoming.length === 0) {
    return [
      h(
        "div",
        { style: { color: COLORS.muted, fontSize: 18 } },
        "未来 30 天暂无扣款",
      ),
    ];
  }

  return topUpcoming.map((item) => {
  const converted =
    item.convertedAmount !== undefined && item.currency !== baseCurrency
      ? ` · ${formatMoney(item.convertedAmount, baseCurrency)}`
      : "";
  const date = item.billingDate ?? "日期未定";
  const name = truncateText(item.name, 18);

    return h(
      "div",
      { style: { display: "flex", flexDirection: "column" } },
      h("div", { style: { fontSize: 21, fontWeight: 700 } }, name),
      h(
        "div",
        { style: { marginTop: 3, color: COLORS.muted, fontSize: 18 } },
        `${date} · ${formatMoney(item.amount, item.currency)}${converted}`,
      ),
    );
  });
}

function overviewDueChartNode(report: ReportData): SatoriElement {
  const data = report.dayDistribution.filter((item) => item.actualTotal > 0);
  if (data.length === 0) {
    return h(
      "div",
      { style: { color: COLORS.muted, fontSize: 18 } },
      "未来 30 天暂无扣款",
    );
  }

  const chartWidth = 464;
  const chartHeight = 84;
  const max = Math.max(...data.map((item) => item.actualTotal), 1);
  const step = Math.floor(chartWidth / data.length);
  const barWidth = Math.min(34, Math.max(12, step - 8));

  return h(
    "div",
    { style: { display: "flex", alignItems: "flex-end", gap: 8, height: 84 } },
    ...data.map((item) => {
      const height = Math.max(3, (item.actualTotal / max) * chartHeight);
      return h(
        "div",
        {
          style: {
            width: barWidth,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          },
        },
        h(
          "div",
          { style: { color: COLORS.ink, fontSize: 13, fontWeight: 700 } },
          compactAmount(item.actualTotal),
        ),
        h("div", {
          style: {
            width: barWidth,
            height,
            backgroundColor: COLORS.gold,
            borderRadius: 3,
            marginTop: 4,
          },
        }),
        h(
          "div",
          { style: { marginTop: 5, color: COLORS.muted, fontSize: 13 } },
          `T+${item.day}`,
        ),
      );
    }),
  );
}

function overviewYearChartNode(report: ReportData): SatoriElement {
  const data = report.monthDistribution ?? [];
  if (data.every((item) => item.actualTotal === 0)) {
    return h(
      "div",
      { style: { color: COLORS.muted, fontSize: 18 } },
      "暂无年度预期扣款",
    );
  }

  const chartWidth = 464;
  const chartHeight = 48;
  const max = Math.max(...data.map((item) => item.actualTotal), 1);
  const step = Math.floor(chartWidth / Math.max(data.length, 1));
  const barWidth = Math.min(26, Math.max(8, step - 7));

  return h(
    "div",
    { style: { display: "flex", alignItems: "flex-end", gap: 7, height: 48 } },
    ...data.map((item, index) => {
      const height =
        item.actualTotal > 0
          ? Math.max(2, (item.actualTotal / max) * chartHeight)
          : 0;
      const showLabel = index === 0 || index === data.length - 1;
      return h(
        "div",
        {
          style: {
            width: barWidth,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          },
        },
        h("div", {
          style: {
            width: barWidth,
            height: Math.max(height, 1),
            backgroundColor: height > 0 ? COLORS.teal : "transparent",
            borderRadius: 3,
          },
        }),
        h(
          "div",
          { style: { marginTop: 5, color: COLORS.muted, fontSize: 13 } },
          showLabel ? monthNameFromKey(item.monthKey) : "",
        ),
      );
    }),
  );
}

function overviewExcludedNote(report: SplitReportData): string {
  const excluded = report.currentMonthly.excluded;
  const notes: string[] = [];
  if (excluded.trial > 0) notes.push(`体验 ${excluded.trial}`);
  if (excluded.nonRenewing > 0) notes.push(`已停续费 ${excluded.nonRenewing}`);
  if (excluded.noPrice > 0) notes.push(`无价格 ${excluded.noPrice}`);
  if (excluded.noCurrency > 0) notes.push(`无币种 ${excluded.noCurrency}`);
  if (excluded.customCycle > 0) notes.push(`自定义周期 ${excluded.customCycle}`);
  return notes.length > 0 ? `未计入金额：${notes.join("，")}` : "";
}

function truncateText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function compactAmount(amount: number): string {
  if (amount >= 10000) return `${Math.round(amount / 1000)}k`;
  if (amount >= 1000) return `${(amount / 1000).toFixed(1)}k`;
  return Math.round(amount).toString();
}

function formatExcludedNote(report: ReportData): string {
  const notes: string[] = [];
  if (report.excluded.trial > 0) notes.push(`体验 ${report.excluded.trial}`);
  if (report.excluded.nonRenewing > 0) {
    notes.push(`已停续费 ${report.excluded.nonRenewing}`);
  }
  return notes.length > 0 ? ` · 未计入：${notes.join("，")}` : "";
}

function monthNameFromKey(monthKey: string): string {
  const month = Number(monthKey.slice(5, 7));
  return `${month}月`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
