import { currentPrice } from "./market-sim.js";
import { startingBalance } from "./config.js";

export function calculateAccount(app) {
  let margin = 0;
  let unrealized = 0;
  let spotValue = 0;

  Object.entries(app.state.positions).forEach(([symbol, position]) => {
    if (!position || position.qty === 0) return;
    const price = currentPrice(app, symbol);
    margin += position.margin;
    unrealized += position.qty * (price - position.entry);
  });

  Object.entries(app.state.spot).forEach(([symbol, qty]) => {
    spotValue += qty * currentPrice(app, symbol);
  });

  const equity = app.state.cash + margin + unrealized + spotValue;
  return { equity, margin, unrealized, spotValue, available: app.state.cash };
}

export function liquidationPrice(position) {
  if (!position || position.qty === 0) return 0;
  const cushion = (1 / Math.max(position.leverage, 1)) * 0.82;
  return position.qty > 0 ? position.entry * (1 - cushion) : position.entry * (1 + cushion);
}

export function calculatePerformance(app, account = calculateAccount(app)) {
  const history = Array.isArray(app.state.history) ? app.state.history : [];
  const pnlEntries = history.map((entry) => Number(entry.pnl) || 0);
  const grossProfit = pnlEntries.filter((pnl) => pnl > 0).reduce((sum, pnl) => sum + pnl, 0);
  const grossLoss = Math.abs(pnlEntries.filter((pnl) => pnl < 0).reduce((sum, pnl) => sum + pnl, 0));
  const wins = pnlEntries.filter((pnl) => pnl > 0).length;
  const losses = pnlEntries.filter((pnl) => pnl < 0).length;
  const decisiveTrades = wins + losses;
  const totalPnl = pnlEntries.reduce((sum, pnl) => sum + pnl, 0);

  let curve = startingBalance;
  let peak = startingBalance;
  let maxDrawdown = 0;
  [...pnlEntries].reverse().forEach((pnl) => {
    curve += pnl;
    peak = Math.max(peak, curve);
    maxDrawdown = Math.max(maxDrawdown, peak - curve);
  });

  return {
    roi: ((account.equity - startingBalance) / startingBalance) * 100,
    tradeCount: history.length,
    winRate: decisiveTrades ? (wins / decisiveTrades) * 100 : 0,
    averagePnl: history.length ? totalPnl / history.length : 0,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
    maxDrawdown,
    maxDrawdownPct: peak > 0 ? (maxDrawdown / peak) * 100 : 0,
  };
}
