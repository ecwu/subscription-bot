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
  callbackData: string
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
  callbackData: string
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
  callbackData: string
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
  callbackData: string
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
  callbackData: string
): { action: "confirm" | "cancel" } | null {
  if (callbackData === "add:confirm") return { action: "confirm" };
  if (callbackData === "add:cancel") return { action: "cancel" };
  return null;
}

/**
 * Parse edit cycle callback data.
 *
 * Expected format: editcycle:<cycle>:<subId>
 */
export function parseEditCycleCallbackData(
  callbackData: string
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
  callbackData: string
): PrivacyCallbackData | null {
  if (callbackData === "privacy:delete_confirm") {
    return { action: "delete_confirm" };
  }
  if (callbackData === "privacy:delete_cancel") {
    return { action: "delete_cancel" };
  }
  return null;
}
