export const symbols = {
  BTCUSDT: { label: "BTCUSDT", base: "BTC", price: 104200, tick: 0.1, qtyStep: 0.001, vol: 0.0022 },
  ETHUSDT: { label: "ETHUSDT", base: "ETH", price: 3520, tick: 0.01, qtyStep: 0.01, vol: 0.0028 },
  SOLUSDT: { label: "SOLUSDT", base: "SOL", price: 148, tick: 0.001, qtyStep: 0.1, vol: 0.004 },
  XRPUSDT: { label: "XRPUSDT", base: "XRP", price: 0.62, tick: 0.0001, qtyStep: 10, vol: 0.0045 },
};

export const feeRate = 0.0004;
export const startingBalance = 10000;
export const candleLimit = 96;

export const timeframeFactors = {
  "1m": 1,
  "5m": 3,
  "15m": 6,
  "1h": 12,
};

export const leaderboardSeed = [
  { name: "VectorLiu", style: "低回撤", roi: 14.8 },
  { name: "MiraQuant", style: "ETH 波段", roi: 9.6 },
  { name: "RangePilot", style: "網格", roi: 6.2 },
  { name: "DeltaNine", style: "高頻短線", roi: -2.4 },
];
