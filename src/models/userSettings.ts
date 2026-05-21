export interface UserSettings {
  defaultCurrency: string;
  reminderEnabled: boolean;
  reminderHour: number;
  timezone: string;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  defaultCurrency: "USD",
  reminderEnabled: true,
  reminderHour: 9,
  timezone: "UTC",
};

export const SUPPORTED_TIMEZONES = [
  { label: "UTC", iana: "UTC" },
  { label: "US West (Los Angeles)", iana: "America/Los_Angeles" },
  { label: "US East (New York)", iana: "America/New_York" },
  { label: "Europe (Berlin)", iana: "Europe/Berlin" },
  { label: "UK (London)", iana: "Europe/London" },
  { label: "China (Shanghai)", iana: "Asia/Shanghai" },
  { label: "Japan (Tokyo)", iana: "Asia/Tokyo" },
  { label: "Australia (Sydney)", iana: "Australia/Sydney" },
] as const;

export function isValidTimezone(tz: string): boolean {
  return SUPPORTED_TIMEZONES.some((t) => t.iana === tz) || isValidUtcOffset(tz);
}

const UTC_OFFSET_RE =
  /^UTC([+-])(\d{1,2}):(\d{2})$/;

export function isValidUtcOffset(tz: string): boolean {
  const match = tz.match(UTC_OFFSET_RE);
  if (!match) return false;

  const hours = Number(match[2]);
  const minutes = Number(match[3]);

  if (hours > 14) return false;
  if (hours === 14 && minutes > 0) return false;
  if (minutes !== 0 && minutes !== 15 && minutes !== 30 && minutes !== 45) {
    return false;
  }
  return true;
}

/**
 * Normalize a user-provided UTC offset to the canonical UTC+HH:MM / UTC-HH:MM format.
 * Accepts: +8, -5, +5.5, +5:30, UTC+8, UTC+05:30
 * Returns null if the input cannot be parsed as a valid offset.
 */
export function normalizeUtcOffset(input: string): string | null {
  const trimmed = input.trim();

  const withPrefix =
    /^UTC\s*([+-])\s*(\d{1,2})(?::(\d{2}))?$/i;
  const bare = /^([+-])\s*(\d{1,2})(?::(\d{2}))?$/;
  const decimal = /^([+-])\s*(\d{1,2})\.(\d{1,2})$/;

  let sign: string;
  let hours: number;
  let mins: number;

  const mP = trimmed.match(withPrefix);
  if (mP) {
    sign = mP[1];
    hours = Number(mP[2]);
    mins = mP[3] ? Number(mP[3]) : 0;
  } else {
    const mD = trimmed.match(decimal);
    if (mD) {
      sign = mD[1];
      hours = Number(mD[2]);
      const frac = mD[3];
      if (frac === "5") mins = 30;
      else if (frac === "25") mins = 15;
      else if (frac === "75") mins = 45;
      else return null;
    } else {
      const mB = trimmed.match(bare);
      if (!mB) return null;
      sign = mB[1];
      hours = Number(mB[2]);
      mins = mB[3] ? Number(mB[3]) : 0;
    }
  }

  const normalized = `UTC${sign}${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;

  if (!isValidUtcOffset(normalized)) return null;
  return normalized;
}
