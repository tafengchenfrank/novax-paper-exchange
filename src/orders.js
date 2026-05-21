import { feeRate, startingBalance, symbols } from "./config.js";
import { makeId } from "./formatters.js";
import { currentPrice } from "./market-sim.js";
import { liquidationPrice } from "./portfolio.js";
import { makeDefaultState, saveState } from "./storage.js";

export function placeOrder(app) {
  const qty = Number(app.els.orderQty.value);
  const orderType = app.els.orderType.value;
  const limitPrice = Number(app.els.limitPrice.value);
  const leverage = Number(app.els.leverage.value);
  const price = orderType === "market" ? currentPrice(app) : limitPrice;

  if (!Number.isFinite(qty) || qty <= 0) {
    app.setOrderMessage("請輸入有效數量。", "warn");
    return false;
  }

  if (orderType === "limit" && (!Number.isFinite(limitPrice) || limitPrice <= 0)) {
    app.setOrderMessage("請輸入有效限價。", "warn");
    return false;
  }

  if (orderType === "limit") {
    app.state.openOrders.unshift({
      id: makeId(),
      symbol: app.activeSymbol,
      mode: app.selectedMode,
      side: app.selectedSide,
      qty,
      price,
      leverage,
      orderType,
      createdAt: Date.now(),
    });
    app.setOrderMessage(`${app.activeSymbol} 限價單已掛出。`);
    saveState(app);
    return true;
  }

  return executeOrder(app, {
    symbol: app.activeSymbol,
    mode: app.selectedMode,
    side: app.selectedSide,
    qty,
    price,
    leverage,
    orderType,
  });
}

export function executeOrder(app, order) {
  if (order.mode === "spot") {
    return executeSpot(app, order);
  }
  return executePerp(app, order);
}

export function processLimitOrders(app) {
  if (!app.state.openOrders.length) return;

  const remaining = [];
  app.state.openOrders.forEach((order) => {
    const price = currentPrice(app, order.symbol);
    const shouldFill =
      (order.side === "buy" && price <= order.price) ||
      (order.side === "sell" && price >= order.price);

    if (!shouldFill) {
      remaining.push(order);
      return;
    }

    const filled = executeOrder(app, { ...order, price });
    if (!filled) {
      remaining.push(order);
    }
  });

  app.state.openOrders = remaining;
  saveState(app);
}

export function liquidateIfNeeded(app) {
  Object.entries({ ...app.state.positions }).forEach(([symbol, position]) => {
    const price = currentPrice(app, symbol);
    const liq = liquidationPrice(position);
    const longHit = position.qty > 0 && price <= liq;
    const shortHit = position.qty < 0 && price >= liq;
    if (!longHit && !shortHit) return;

    const loss = position.margin;
    app.state.realizedPnl -= loss;
    addHistory(app, {
      symbol,
      mode: "合約",
      side: position.qty > 0 ? "sell" : "buy",
      qty: Math.abs(position.qty),
      price,
      pnl: -loss,
      fee: 0,
      notional: Math.abs(position.qty * price),
      margin: position.margin,
      leverage: position.leverage,
      entryPrice: position.entry,
      orderType: "liquidation",
      note: "強平",
    });
    delete app.state.positions[symbol];
    app.setOrderMessage(`${symbol} 觸發強平估算，倉位已由模擬系統關閉。`, "danger");
  });
}

export function cancelOrder(app, cancelId) {
  app.state.openOrders = app.state.openOrders.filter((order) => order.id !== cancelId);
  app.setOrderMessage("委託已取消。");
  saveState(app);
}

export function resetAccount(app) {
  app.state = makeDefaultState({
    activeSymbol: app.activeSymbol,
    selectedMode: app.selectedMode,
    cash: startingBalance,
  });
  app.setOrderMessage("模擬帳戶已重設。");
  saveState(app);
}

export function addHistory(app, entry) {
  app.state.history.unshift({
    id: makeId(),
    time: new Date().toLocaleTimeString("zh-TW", { hour12: false }),
    ...entry,
  });
  app.state.history = app.state.history.slice(0, 80);
}

function executeSpot(app, { symbol, side, qty, price, orderType = "market" }) {
  const notional = qty * price;
  const fee = notional * feeRate;

  if (side === "buy") {
    const cost = notional + fee;
    if (app.state.cash < cost) {
      app.setOrderMessage("可用 USDT 不足。", "warn");
      return false;
    }
    app.state.cash -= cost;
    app.state.spot[symbol] = (app.state.spot[symbol] || 0) + qty;
  } else {
    const holding = app.state.spot[symbol] || 0;
    if (holding < qty) {
      app.setOrderMessage(`現貨 ${symbols[symbol].base} 不足。`, "warn");
      return false;
    }
    app.state.spot[symbol] = holding - qty;
    app.state.cash += notional - fee;
  }

  addHistory(app, {
    symbol,
    mode: "現貨",
    side,
    qty,
    price,
    pnl: -fee,
    fee,
    notional,
    margin: notional,
    leverage: 1,
    orderType,
  });
  app.setOrderMessage(`${symbol} 現貨單已成交。`);
  saveState(app);
  return true;
}

function executePerp(app, { symbol, side, qty, price, leverage, orderType = "market" }) {
  const signedDelta = side === "buy" ? qty : -qty;
  const position = app.state.positions[symbol] || { qty: 0, entry: 0, margin: 0, leverage };
  const notional = Math.abs(qty * price);
  const fee = Math.abs(qty * price) * feeRate;

  if (app.state.cash < fee) {
    app.setOrderMessage("可用 USDT 不足以支付手續費。", "warn");
    return false;
  }

  app.state.cash -= fee;

  if (position.qty === 0 || Math.sign(position.qty) === Math.sign(signedDelta)) {
    const addedMargin = Math.abs(signedDelta * price) / leverage;
    if (app.state.cash < addedMargin) {
      app.state.cash += fee;
      app.setOrderMessage("可用 USDT 不足以建立此倉位。", "warn");
      return false;
    }
    const newQty = position.qty + signedDelta;
    const weightedEntry =
      (Math.abs(position.qty) * position.entry + Math.abs(signedDelta) * price) / Math.abs(newQty);
    app.state.cash -= addedMargin;
    app.state.positions[symbol] = {
      qty: newQty,
      entry: weightedEntry,
      margin: position.margin + addedMargin,
      leverage,
    };
    addHistory(app, {
      symbol,
      mode: `${leverage}x 合約`,
      side,
      qty,
      price,
      pnl: -fee,
      fee,
      notional,
      margin: addedMargin,
      leverage,
      entryPrice: weightedEntry,
      orderType,
      note: position.qty === 0 ? "開倉" : "加倉",
    });
    app.setOrderMessage(`${symbol} 合約單已成交。`);
    saveState(app);
    return true;
  }

  const closingQty = Math.min(Math.abs(position.qty), Math.abs(signedDelta));
  const closeSign = Math.sign(position.qty);
  const grossPnl = closingQty * (price - position.entry) * closeSign;
  const releasedMargin = position.margin * (closingQty / Math.abs(position.qty));
  const netPnl = grossPnl - fee;
  app.state.cash += releasedMargin + grossPnl;
  app.state.realizedPnl += netPnl;

  const remainingPositionQty = position.qty + signedDelta;

  if (Math.abs(remainingPositionQty) < 1e-10) {
    delete app.state.positions[symbol];
  } else if (Math.sign(remainingPositionQty) === closeSign) {
    app.state.positions[symbol] = {
      ...position,
      qty: remainingPositionQty,
      margin: position.margin - releasedMargin,
    };
  } else {
    const flipQty = Math.abs(remainingPositionQty);
    const newMargin = (flipQty * price) / leverage;
    if (app.state.cash < newMargin) {
      delete app.state.positions[symbol];
      app.setOrderMessage("已平倉；剩餘資金不足以反手開倉。", "warn");
    } else {
      app.state.cash -= newMargin;
      app.state.positions[symbol] = {
        qty: remainingPositionQty,
        entry: price,
        margin: newMargin,
        leverage,
      };
    }
  }

  addHistory(app, {
    symbol,
    mode: `${leverage}x 合約`,
    side,
    qty,
    price,
    pnl: netPnl,
    fee,
    notional,
    margin: releasedMargin,
    leverage,
    entryPrice: position.entry,
    orderType,
    grossPnl,
    note: Math.abs(remainingPositionQty) < 1e-10 ? "平倉" : "減倉 / 反手",
  });
  app.setOrderMessage(`${symbol} 成交。`);
  saveState(app);
  return true;
}
