import { startingBalance } from "./config.js";

const storageKey = "novax-paper-state";

export function makeDefaultState(overrides = {}) {
  return {
    activeSymbol: "BTCUSDT",
    selectedMode: "perp",
    marketSource: "sim",
    cash: startingBalance,
    positions: {},
    spot: {},
    openOrders: [],
    history: [],
    dismissedAlerts: {},
    learningProgress: {},
    realizedPnl: 0,
    ...overrides,
  };
}

export function loadState() {
  const fallback = makeDefaultState();

  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    return { ...fallback, ...saved };
  } catch {
    return fallback;
  }
}

export function saveState(app) {
  const snapshot = {
    activeSymbol: app.activeSymbol,
    selectedMode: app.selectedMode,
    marketSource: app.marketSource,
    cash: app.state.cash,
    positions: app.state.positions,
    spot: app.state.spot,
    openOrders: app.state.openOrders,
    history: app.state.history.slice(0, 80),
    dismissedAlerts: app.state.dismissedAlerts || {},
    learningProgress: app.state.learningProgress || {},
    realizedPnl: app.state.realizedPnl,
  };
  localStorage.setItem(storageKey, JSON.stringify(snapshot));
}

export function applySnapshot(app, snapshot) {
  if (!snapshot || typeof snapshot !== "object") return;

  app.activeSymbol = snapshot.activeSymbol || app.activeSymbol;
  app.selectedMode = snapshot.selectedMode || app.selectedMode;
  app.marketSource = snapshot.marketSource || app.marketSource;
  app.state = {
    ...app.state,
    cash: Number.isFinite(snapshot.cash) ? snapshot.cash : app.state.cash,
    positions: snapshot.positions || {},
    spot: snapshot.spot || {},
    openOrders: Array.isArray(snapshot.openOrders) ? snapshot.openOrders : [],
    history: Array.isArray(snapshot.history) ? snapshot.history : [],
    dismissedAlerts: snapshot.dismissedAlerts || {},
    learningProgress: snapshot.learningProgress || {},
    realizedPnl: Number.isFinite(snapshot.realizedPnl) ? snapshot.realizedPnl : app.state.realizedPnl,
  };
  saveState(app);
}
