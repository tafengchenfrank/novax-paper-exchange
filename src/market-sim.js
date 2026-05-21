import { candleLimit, symbols, timeframeFactors } from "./config.js";
import { getSourceData, getSourcePrice, setSourcePrice } from "./market-data.js";

export function currentMarket(app) {
  return { ...symbols[app.activeSymbol], price: currentPrice(app) };
}

export function currentPrice(app, symbol = app.activeSymbol) {
  return getSourcePrice(app, symbol);
}

export function seedMarkets(app, source = "sim") {
  const data = getSourceData(app, source);

  Object.entries(symbols).forEach(([symbol, market]) => {
    const series = [];
    let close = market.price * (1 - market.vol * 14);

    for (let i = 0; i < candleLimit; i += 1) {
      const candle = makeCandle(close, i, market);
      series.push(candle);
      close = candle.close;
    }

    setSourcePrice(app, symbol, series[series.length - 1].close, source);
    data.candles[symbol] = series;
    data.tape[symbol] = [];

    for (let i = 0; i < 14; i += 1) {
      data.tape[symbol].push(makeTape(app, symbol, source));
    }
  });
}

export function updateMarketPrices(app) {
  const source = "sim";
  const data = getSourceData(app, source);

  Object.entries(symbols).forEach(([symbol, market]) => {
    const series = data.candles[symbol];
    const previous = getSourcePrice(app, symbol, source);
    const wave = Math.sin((Date.now() / 1000 + symbol.length * 17) / 20) * market.vol * 0.25;
    const move = wave + (Math.random() - 0.5) * market.vol;
    const next = Math.max(previous * (1 + move), market.tick);
    setSourcePrice(app, symbol, next, source);

    const activeCandle = series[series.length - 1];
    activeCandle.close = next;
    activeCandle.high = Math.max(activeCandle.high, next);
    activeCandle.low = Math.min(activeCandle.low, next);
    activeCandle.volume += Math.random() * 36;

    if (app.tickCount % 5 === 0) {
      series.push({
        open: next,
        high: next * (1 + Math.random() * market.vol),
        low: next * (1 - Math.random() * market.vol),
        close: next,
        volume: 70 + Math.random() * 240,
        time: Date.now(),
      });
      if (series.length > candleLimit) {
        series.shift();
      }
    }

    if (Math.random() > 0.35) {
      data.tape[symbol].unshift(makeTape(app, symbol, source));
      data.tape[symbol] = data.tape[symbol].slice(0, 14);
    }
  });

  app.tickCount += 1;
}

export function randomBook(app, symbol = app.activeSymbol) {
  const data = getSourceData(app);
  const liveBook = data.orderBooks?.[symbol];
  if (app.marketSource === "binance" && liveBook?.asks?.length && liveBook?.bids?.length) {
    return liveBook;
  }

  const market = symbols[symbol];
  const price = getSourcePrice(app, symbol);
  const levels = 9;
  const bids = [];
  const asks = [];
  let bidTotal = 0;
  let askTotal = 0;

  for (let i = levels; i >= 1; i -= 1) {
    const distance = market.vol * 0.34 * i + 0.00022 * i;
    const qty = market.qtyStep * (10 + Math.random() * 190) * (1 + i / 10);
    askTotal += qty;
    asks.push({ price: price * (1 + distance), qty, total: askTotal });
  }

  for (let i = 1; i <= levels; i += 1) {
    const distance = market.vol * 0.34 * i + 0.00022 * i;
    const qty = market.qtyStep * (10 + Math.random() * 190) * (1 + i / 10);
    bidTotal += qty;
    bids.push({ price: price * (1 - distance), qty, total: bidTotal });
  }

  return { asks, bids };
}

export function aggregateCandles(series, timeframe) {
  const factor = timeframeFactors[timeframe] || 1;
  if (factor === 1) return series;

  const aggregated = [];
  for (let i = 0; i < series.length; i += factor) {
    const group = series.slice(i, i + factor);
    if (!group.length) continue;
    aggregated.push({
      open: group[0].open,
      high: Math.max(...group.map((candle) => candle.high)),
      low: Math.min(...group.map((candle) => candle.low)),
      close: group[group.length - 1].close,
      volume: group.reduce((sum, candle) => sum + candle.volume, 0),
      time: group[0].time,
    });
  }
  return aggregated;
}

function makeCandle(previousClose, index, market) {
  const open = previousClose;
  const drift = Math.sin(index / 9) * market.vol * 0.22;
  const close = open * (1 + drift + (Math.random() - 0.48) * market.vol * 2.7);
  const high = Math.max(open, close) * (1 + Math.random() * market.vol * 1.8);
  const low = Math.min(open, close) * (1 - Math.random() * market.vol * 1.8);
  const volume = 90 + Math.random() * 820;
  return { open, high, low, close, volume, time: Date.now() - (candleLimit - index) * 60000 };
}

function makeTape(app, symbol, source) {
  const market = symbols[symbol];
  const side = Math.random() > 0.5 ? "buy" : "sell";
  return {
    side,
    price: getSourcePrice(app, symbol, source) * (1 + (Math.random() - 0.5) * market.vol),
    qty: market.qtyStep * (3 + Math.random() * 70),
    time: new Date().toLocaleTimeString("zh-TW", { hour12: false }),
  };
}
