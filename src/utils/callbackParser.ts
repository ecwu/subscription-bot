export interface DeleteCallbackData {
  action: "confirm" | "cancel";
  subId: string;
}

/**
 * Parse delete callback data.
 *
 * Expected formats:
 *   delete:confirm:<subId>
 *   delete:cancel:<subId>
 */
export function parseDeleteCallbackData(
  callbackData: string,
): DeleteCallbackData | null {
  const prefix = "delete:";
  if (!callbackData.startsWith(prefix)) {
    return null;
  }

  const rest = callbackData.slice(prefix.length);
  const [action, ...subIdParts] = rest.split(":");
  const subId = subIdParts.join(":");

  if (!subId || (action !== "confirm" && action !== "cancel")) {
    return null;
  }

  return { action: action as "confirm" | "cancel", subId };
}

export interface SubCallbackData {
  action: "view" | "edit" | "delete" | "pause" | "resume";
  subId: string;
}

/**
 * Parse subscription action callback data.
 *
 * Expected formats:
 *   sub:view:<subId>
 *   sub:edit:<subId>
 *   sub:delete:<subId>
 *   sub:pause:<subId>
 *   sub:resume:<subId>
 */
export function parseSubCallbackData(
  callbackData: string,
): SubCallbackData | null {
  const prefix = "sub:";
  if (!callbackData.startsWith(prefix)) return null;
  const rest = callbackData.slice(prefix.length);
  const [action, ...subIdParts] = rest.split(":");
  const subId = subIdParts.join(":");
  if (!subId || !["view", "edit", "delete", "pause", "resume"].includes(action))
    return null;
  return { action: action as SubCallbackData["action"], subId };
}

export interface EditCallbackData {
  field: string;
  subId: string;
}

/**
 * Parse edit field callback data.
 *
 * Expected formats:
 *   edit:<field>:<subId>
 */
export function parseEditCallbackData(
  callbackData: string,
): EditCallbackData | null {
  const prefix = "edit:";
  if (!callbackData.startsWith(prefix)) return null;
  const rest = callbackData.slice(prefix.length);
  const [field, ...subIdParts] = rest.split(":");
  const subId = subIdParts.join(":");
  if (!subId) return null;
  return { field, subId };
}

/**
 * Parse cycle selection callback data from add conversation.
 *
 * Expected format: cycle:<cycle>
 */
export function parseCycleCallbackData(
  callbackData: string,
): { cycle: string } | null {
  const prefix = "cycle:";
  if (!callbackData.startsWith(prefix)) return null;
  const cycle = callbackData.slice(prefix.length);
  if (!cycle) return null;
  return { cycle };
}

/**
 * Parse add confirmation callback data.
 *
 * Expected formats:
 *   add:confirm
 *   add:cancel
 */
export function parseAddConfirmCallbackData(
  callbackData: string,
): { action: "confirm" | "cancel" } | null {
  if (callbackData === "add:confirm") return { action: "confirm" };
  if (callbackData === "add:cancel") return { action: "cancel" };
  return null;
}

/**
 * Parse add billing date preview callback data.
 *
 * Expected formats:
 *   addpreview:confirm
 *   addpreview:change
 *   addpreview:cancel
 */
export function parseAddPreviewCallbackData(
  callbackData: string,
): { action: "confirm" | "change" | "cancel" } | null {
  if (callbackData === "addpreview:confirm") return { action: "confirm" };
  if (callbackData === "addpreview:change") return { action: "change" };
  if (callbackData === "addpreview:cancel") return { action: "cancel" };
  return null;
}

export type AddCurrencyCallbackData =
  | { action: "select"; currency: string }
  | { action: "skip" }
  | { action: "other" }
  | { action: "cancel" };

/**
 * Parse add currency callback data.
 *
 * Expected formats:
 *   addcurrency:<currency>
 *   addcurrency:skip
 *   addcurrency:other
 *   addcurrency:cancel
 */
export function parseAddCurrencyCallbackData(
  callbackData: string,
): AddCurrencyCallbackData | null {
  const prefix = "addcurrency:";
  if (!callbackData.startsWith(prefix)) return null;
  const value = callbackData.slice(prefix.length);

  if (value === "skip") return { action: "skip" };
  if (value === "other") return { action: "other" };
  if (value === "cancel") return { action: "cancel" };
  if (/^[A-Z]{3}$/.test(value)) return { action: "select", currency: value };
  return null;
}

export type AddDateCallbackData =
  | { action: "pick"; date: string }
  | { action: "month"; month: string }
  | { action: "noop" }
  | { action: "cancel" }
  | { action: "show" };

/**
 * Parse add date callback data.
 *
 * Expected formats:
 *   adddate:pick:<YYYY-MM-DD>
 *   adddate:month:<YYYY-MM>
 *   adddate:noop
 *   adddate:cancel
 */
export function parseAddDateCallbackData(
  callbackData: string,
): AddDateCallbackData | null {
  if (callbackData === "adddate:noop") return { action: "noop" };
  if (callbackData === "adddate:cancel") return { action: "cancel" };
  if (callbackData === "adddate:show") return { action: "show" };

  const pickPrefix = "adddate:pick:";
  if (callbackData.startsWith(pickPrefix)) {
    const date = callbackData.slice(pickPrefix.length);
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return { action: "pick", date };
    }
    return null;
  }

  const monthPrefix = "adddate:month:";
  if (callbackData.startsWith(monthPrefix)) {
    const month = callbackData.slice(monthPrefix.length);
    if (/^\d{4}-\d{2}$/.test(month)) {
      return { action: "month", month };
    }
  }

  return null;
}

/**
 * Parse edit cycle callback data.
 *
 * Expected format: editcycle:<cycle>:<subId>
 */
export function parseEditCycleCallbackData(
  callbackData: string,
): { cycle: string; subId: string } | null {
  const prefix = "editcycle:";
  if (!callbackData.startsWith(prefix)) return null;
  const rest = callbackData.slice(prefix.length);
  const [cycle, ...subIdParts] = rest.split(":");
  const subId = subIdParts.join(":");
  if (!cycle || !subId) return null;
  return { cycle, subId };
}

export interface PrivacyCallbackData {
  action: "delete_confirm" | "delete_cancel";
}

/**
 * Parse privacy callback data.
 *
 * Expected formats:
 *   privacy:delete_confirm
 *   privacy:delete_cancel
 */
export function parsePrivacyCallbackData(
  callbackData: string,
): PrivacyCallbackData | null {
  if (callbackData === "privacy:delete_confirm") {
    return { action: "delete_confirm" };
  }
  if (callbackData === "privacy:delete_cancel") {
    return { action: "delete_cancel" };
  }
  return null;
}

export type SettingsCallbackData =
  | { action: "toggle_reminder" }
  | { action: "hour" }
  | { action: "timezone" }
  | { action: "select_hour"; hour: number }
  | { action: "select_timezone"; timezone: string }
  | { action: "done" };

/**
 * Parse settings callback data.
 *
 * Expected formats:
 *   settings:toggle_reminder
 *   settings:hour
 *   settings:timezone
 *   settings:hour:<0-23>
 *   settings:tz:<iana>
 *   settings:done
 */
export function parseSettingsCallbackData(
  callbackData: string,
): SettingsCallbackData | null {
  const prefix = "settings:";
  if (!callbackData.startsWith(prefix)) return null;
  const value = callbackData.slice(prefix.length);

  if (value === "toggle_reminder") return { action: "toggle_reminder" };
  if (value === "hour") return { action: "hour" };
  if (value === "timezone") return { action: "timezone" };
  if (value === "done") return { action: "done" };

  const hourPrefix = "hour:";
  if (value.startsWith(hourPrefix)) {
    const raw = value.slice(hourPrefix.length);
    if (raw.length === 0) return null;
    const hour = Number(raw);
    if (Number.isInteger(hour) && hour >= 0 && hour <= 23) {
      return { action: "select_hour", hour };
    }
    return null;
  }

  const tzPrefix = "tz:";
  if (value.startsWith(tzPrefix)) {
    const timezone = value.slice(tzPrefix.length);
    if (timezone.length > 0) {
      return { action: "select_timezone", timezone };
    }
  }

  return null;
}

export type ListCallbackData =
  | { action: "page"; page: number }
  | { action: "select"; subId: string; page: number }
  | { action: "detail"; subId: string; page: number }
  | { action: "back"; page: number }
  | { action: "edit"; subId: string; page: number }
  | { action: "pause"; subId: string; page: number }
  | { action: "resume"; subId: string; page: number }
  | { action: "del"; subId: string; page: number }
  | { action: "delok"; subId: string; page: number }
  | { action: "delno"; subId: string; page: number }
  | { action: "editField"; subId: string; field: string; page: number };

/**
 * Parse list manager callback data.
 *
 * Expected formats:
 *   list:page:<page>
 *   list:select:<subId>:<page>
 *   list:detail:<subId>:<page>
 *   list:back:<page>
 *   list:edit:<subId>:<page>
 *   list:pause:<subId>:<page>
 *   list:resume:<subId>:<page>
 *   list:del:<subId>:<page>
 *   list:delok:<subId>:<page>
 *   list:delno:<subId>:<page>
 *   list:ef:<field>:<subId>:<page>
 */
export function parseListCallbackData(
  callbackData: string,
): ListCallbackData | null {
  const prefix = "list:";
  if (!callbackData.startsWith(prefix)) return null;
  const rest = callbackData.slice(prefix.length);

  const [action, ...parts] = rest.split(":");

  if (action === "page") {
    const page = Number(parts[0]);
    if (!Number.isFinite(page) || page < 0) return null;
    return { action: "page", page };
  }

  if (action === "back") {
    const page = Number(parts[0]);
    if (!Number.isFinite(page) || page < 0) return null;
    return { action: "back", page };
  }

  if (
    action === "select" ||
    action === "detail" ||
    action === "edit" ||
    action === "pause" ||
    action === "resume" ||
    action === "del" ||
    action === "delok" ||
    action === "delno"
  ) {
    const pageStr = parts[parts.length - 1];
    const subIdParts = parts.slice(0, parts.length - 1);
    const subId = subIdParts.join(":");
    const page = Number(pageStr);
    if (!subId || !Number.isFinite(page) || page < 0) return null;
    return { action, subId, page } as ListCallbackData;
  }

  if (action === "ef") {
    const field = parts[0];
    const pageStr = parts[parts.length - 1];
    const subIdParts = parts.slice(1, parts.length - 1);
    const subId = subIdParts.join(":");
    const page = Number(pageStr);
    if (!field || !subId || !Number.isFinite(page) || page < 0) return null;
    return { action: "editField", subId, field, page };
  }

  return null;
}
