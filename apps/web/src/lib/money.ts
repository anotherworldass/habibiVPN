export function formatCents(cents: number, currency = ""): string {
  const n = (cents / 100).toFixed(2);
  return currency ? `${n} ${currency}` : n;
}

export function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}
