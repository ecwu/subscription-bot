export function formatMoney(
  amount: number,
  currency: string = "USD"
): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount);
  } catch {
    return `${amount} ${currency.toUpperCase()}`;
  }
}

export function parseMoneyInput(input: string): number | undefined {
  const cleaned = input.replace(/[^\d.]/g, "");
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
}
