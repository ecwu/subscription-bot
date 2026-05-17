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
  action: "view" | "edit" | "delete";
  subId: string;
}

/**
 * Parse subscription action callback data.
 *
 * Expected formats:
 *   sub:view:<subId>
 *   sub:edit:<subId>
 *   sub:delete:<subId>
 */
export function parseSubCallbackData(
  callbackData: string,
): SubCallbackData | null {
  const prefix = "sub:";
  if (!callbackData.startsWith(prefix)) return null;
  const rest = callbackData.slice(prefix.length);
  const [action, ...subIdParts] = rest.split(":");
  const subId = subIdParts.join(":");
  if (!subId || !["view", "edit", "delete"].includes(action)) return null;
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
  | { action: "cancel" };

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
