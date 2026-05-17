export function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

export function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
}

export function addMonths(dateStr: string, months: number): string {
  const date = new Date(dateStr + "T00:00:00Z");
  date.setUTCMonth(date.getUTCMonth() + months);
  return formatDate(date);
}

export function addYears(dateStr: string, years: number): string {
  const date = new Date(dateStr + "T00:00:00Z");
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return formatDate(date);
}

export function addWeeks(dateStr: string, weeks: number): string {
  return addDays(dateStr, weeks * 7);
}
