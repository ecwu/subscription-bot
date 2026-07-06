import notoSansSc106Regular from "@fontsource/noto-sans-sc/files/noto-sans-sc-106-400-normal.woff";
import notoSansSc109Regular from "@fontsource/noto-sans-sc/files/noto-sans-sc-109-400-normal.woff";
import notoSansSc110Regular from "@fontsource/noto-sans-sc/files/noto-sans-sc-110-400-normal.woff";
import notoSansSc112Regular from "@fontsource/noto-sans-sc/files/noto-sans-sc-112-400-normal.woff";
import notoSansSc113Regular from "@fontsource/noto-sans-sc/files/noto-sans-sc-113-400-normal.woff";
import notoSansSc114Regular from "@fontsource/noto-sans-sc/files/noto-sans-sc-114-400-normal.woff";
import notoSansSc115Regular from "@fontsource/noto-sans-sc/files/noto-sans-sc-115-400-normal.woff";
import notoSansSc116Regular from "@fontsource/noto-sans-sc/files/noto-sans-sc-116-400-normal.woff";
import notoSansSc117Regular from "@fontsource/noto-sans-sc/files/noto-sans-sc-117-400-normal.woff";
import notoSansSc118Regular from "@fontsource/noto-sans-sc/files/noto-sans-sc-118-400-normal.woff";
import notoSansSc119Regular from "@fontsource/noto-sans-sc/files/noto-sans-sc-119-400-normal.woff";
import notoSansScLatinRegular from "@fontsource/noto-sans-sc/files/noto-sans-sc-latin-400-normal.woff";

export const REPORT_FONT_FAMILY = "Noto Sans SC";

const reportFontSources = [
  { data: notoSansScLatinRegular, weight: 400 },
  { data: notoSansSc106Regular, weight: 400 },
  { data: notoSansSc109Regular, weight: 400 },
  { data: notoSansSc110Regular, weight: 400 },
  { data: notoSansSc112Regular, weight: 400 },
  { data: notoSansSc113Regular, weight: 400 },
  { data: notoSansSc114Regular, weight: 400 },
  { data: notoSansSc115Regular, weight: 400 },
  { data: notoSansSc116Regular, weight: 400 },
  { data: notoSansSc117Regular, weight: 400 },
  { data: notoSansSc118Regular, weight: 400 },
  { data: notoSansSc119Regular, weight: 400 },
] as const;

export const REPORT_SATORI_FONTS = reportFontSources.map((font) => ({
  name: REPORT_FONT_FAMILY,
  data: font.data,
  weight: font.weight,
  style: "normal" as const,
}));

export const REPORT_RESVG_FONT_BUFFERS = reportFontSources.map((font) =>
  toFontBuffer(font.data),
);

function toFontBuffer(buffer: ArrayBuffer): Uint8Array {
  return new Uint8Array(buffer);
}
