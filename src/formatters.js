export function currency(value, digits = 2) {
  const number = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(number);
}

export function amount(value, digits = 4) {
  const number = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(number);
}

export function signedCurrency(value) {
  const formatted = currency(Math.abs(value), 2);
  return value >= 0 ? `+${formatted}` : `-${formatted}`;
}

export function percent(value) {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function formatChartPrice(value) {
  return value > 20 ? value.toFixed(2) : value.toFixed(4);
}

export function makeId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
