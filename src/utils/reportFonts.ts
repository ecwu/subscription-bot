import notoSansSc106Regular from "@fontsource/noto-sans-sc/files/noto-sans-sc-106-400-normal.woff";
import notoSansSc106RegularWoff2 from "@fontsource/noto-sans-sc/files/noto-sans-sc-106-400-normal.woff2";
import notoSansSc109Regular from "@fontsource/noto-sans-sc/files/noto-sans-sc-109-400-normal.woff";
import notoSansSc109RegularWoff2 from "@fontsource/noto-sans-sc/files/noto-sans-sc-109-400-normal.woff2";
import notoSansSc110Regular from "@fontsource/noto-sans-sc/files/noto-sans-sc-110-400-normal.woff";
import notoSansSc110RegularWoff2 from "@fontsource/noto-sans-sc/files/noto-sans-sc-110-400-normal.woff2";
import notoSansSc112Regular from "@fontsource/noto-sans-sc/files/noto-sans-sc-112-400-normal.woff";
import notoSansSc112RegularWoff2 from "@fontsource/noto-sans-sc/files/noto-sans-sc-112-400-normal.woff2";
import notoSansSc113Regular from "@fontsource/noto-sans-sc/files/noto-sans-sc-113-400-normal.woff";
import notoSansSc113RegularWoff2 from "@fontsource/noto-sans-sc/files/noto-sans-sc-113-400-normal.woff2";
import notoSansSc114Regular from "@fontsource/noto-sans-sc/files/noto-sans-sc-114-400-normal.woff";
import notoSansSc114RegularWoff2 from "@fontsource/noto-sans-sc/files/noto-sans-sc-114-400-normal.woff2";
import notoSansSc115Regular from "@fontsource/noto-sans-sc/files/noto-sans-sc-115-400-normal.woff";
import notoSansSc115RegularWoff2 from "@fontsource/noto-sans-sc/files/noto-sans-sc-115-400-normal.woff2";
import notoSansSc116Regular from "@fontsource/noto-sans-sc/files/noto-sans-sc-116-400-normal.woff";
import notoSansSc116RegularWoff2 from "@fontsource/noto-sans-sc/files/noto-sans-sc-116-400-normal.woff2";
import notoSansSc117Regular from "@fontsource/noto-sans-sc/files/noto-sans-sc-117-400-normal.woff";
import notoSansSc117RegularWoff2 from "@fontsource/noto-sans-sc/files/noto-sans-sc-117-400-normal.woff2";
import notoSansSc118Regular from "@fontsource/noto-sans-sc/files/noto-sans-sc-118-400-normal.woff";
import notoSansSc118RegularWoff2 from "@fontsource/noto-sans-sc/files/noto-sans-sc-118-400-normal.woff2";
import notoSansSc119Regular from "@fontsource/noto-sans-sc/files/noto-sans-sc-119-400-normal.woff";
import notoSansSc119RegularWoff2 from "@fontsource/noto-sans-sc/files/noto-sans-sc-119-400-normal.woff2";
import notoSansScLatinRegular from "@fontsource/noto-sans-sc/files/noto-sans-sc-latin-400-normal.woff";
import notoSansScLatinRegularWoff2 from "@fontsource/noto-sans-sc/files/noto-sans-sc-latin-400-normal.woff2";

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

const reportResvgFontSources = [
  notoSansScLatinRegularWoff2,
  notoSansSc106RegularWoff2,
  notoSansSc109RegularWoff2,
  notoSansSc110RegularWoff2,
  notoSansSc112RegularWoff2,
  notoSansSc113RegularWoff2,
  notoSansSc114RegularWoff2,
  notoSansSc115RegularWoff2,
  notoSansSc116RegularWoff2,
  notoSansSc117RegularWoff2,
  notoSansSc118RegularWoff2,
  notoSansSc119RegularWoff2,
] as const;

export const REPORT_SATORI_FONTS = reportFontSources.map((font) => ({
  name: REPORT_FONT_FAMILY,
  data: font.data,
  weight: font.weight,
  style: "normal" as const,
}));

export const REPORT_RESVG_FONT_BUFFERS = reportResvgFontSources.map((font) =>
  toFontBuffer(font),
);

function toFontBuffer(buffer: ArrayBuffer): Uint8Array {
  return new Uint8Array(buffer);
}
