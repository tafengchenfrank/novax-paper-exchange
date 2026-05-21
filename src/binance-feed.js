import { candleLimit, symbols } from "./config.js";
import { getSourceData, setSourcePrice } from "./market-data.js";

const websocketBase = "wss://data-stream.binance.vision/stream?streams=";
const restBase = "https://data-api.binance.vision/api/v3/klines";

export async function startBinanceFeed(app) {
  stopBinanceFeed(app);
  app.binanceFeed = {
    socket: null,
    reconnectTimer: null,
    manualClose: false,
    attempts: 0,
  };
  setFeedStatus(app, "connecting", "Binance 連線中");

  await bootstrapBinanceCandles(app);
  if (app.marketSource !== "binance") return;

  openSocket(app);
}

export function stopBinanceFeed(app) {
  if (!app.binanceFeed) return;

  app.binanceFeed.manualClose = true;
  if (app.binanceFeed.reconnectTimer) {
    clearTimeout(app.binanceFeed.reconnectTimer);
  }
  if (app.binanceFeed.socket) {
    app.binanceFeed.socket.close();
  }
  app.binanceFeed = null;
}

export function setFeedStatus(app, status, label) {
  app.feedStatus = status;
  app.feedStatusLabel = label;
}

async function bootstrapBinanceCandles(app) {
  const symbolsToLoad = Object.keys(symbols);
  const data = getSourceData(app, "binance");

  const results = await Promise.allSettled(
    symbolsToLoad.map(async (symbol) => {
      const url = `${restBase}?symbol=${symbol}&interval=1m&limit=${candleLimit}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Binance kline bootstrap failed for ${symbol}`);
      }

      const rows = await response.json();
      if (!Array.isArray(rows) || !rows.length) return;

      data.candles[symbol] = rows.map((row) => ({
        time: Number(row[0]),
        open: Number(row[1]),
        high: Number(row[2]),
        low: Number(row[3]),
        close: Number(row[4]),
        volume: Number(row[5]),
      }));

      setSourcePrice(app, symbol, data.candles[symbol][data.candles[symbol].length - 1].close, "binance");
    }),
  );

  if (results.every((result) => result.status === "rejected")) {
    setFeedStatus(app, "error", "Binance 連線失敗");
  }
}

function openSocket(app) {
  const streams = Object.keys(symbols).flatMap((symbol) => {
    const lower = symbol.toLowerCase();
    return [`${lower}@ticker`, `${lower}@trade`, `${lower}@kline_1m`, `${lower}@depth10@1000ms`];
  });

  const socket = new WebSocket(`${websocketBase}${streams.join("/")}`);
  app.binanceFeed.socket = socket;

  socket.addEventListener("open", () => {
    app.binanceFeed.attempts = 0;
    setFeedStatus(app, "live", "Binance 即時");
  });

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const stream = message.stream || "";
    const data = message.data || message;
    const streamSymbol = stream.split("@")[0]?.toUpperCase();

    if (data.e === "24hrTicker") {
      handleTicker(app, data);
    } else if (data.e === "trade") {
      handleTrade(app, data);
    } else if (data.e === "kline") {
      handleKline(app, data.k);
    } else if (data.bids && data.asks && streamSymbol) {
      handleDepth(app, streamSymbol, data);
    }

    app.feedLastUpdate = Date.now();
  });

  socket.addEventListener("error", () => {
    setFeedStatus(app, "error", "Binance 錯誤");
  });

  socket.addEventListener("close", () => {
    if (!app.binanceFeed || app.binanceFeed.manualClose || app.marketSource !== "binance") return;

    app.binanceFeed.attempts += 1;
    const delay = Math.min(12000, 1500 * app.binanceFeed.attempts);
    setFeedStatus(app, "connecting", "Binance 重連中");
    app.binanceFeed.reconnectTimer = setTimeout(() => openSocket(app), delay);
  });
}

function handleTicker(app, data) {
  const symbol = data.s;
  if (!symbols[symbol]) return;
  const store = getSourceData(app, "binance");

  setSourcePrice(app, symbol, Number(data.c), "binance");
  store.tickers[symbol] = {
    open: Number(data.o),
    high: Number(data.h),
    low: Number(data.l),
    volume: Number(data.v),
    quoteVolume: Number(data.q),
    changePercent: Number(data.P),
  };
}

function handleTrade(app, data) {
  const symbol = data.s;
  if (!symbols[symbol]) return;
  const store = getSourceData(app, "binance");
  store.tape[symbol] ||= [];

  store.tape[symbol].unshift({
    side: data.m ? "sell" : "buy",
    price: Number(data.p),
    qty: Number(data.q),
    time: new Date(Number(data.T)).toLocaleTimeString("zh-TW", { hour12: false }),
  });
  store.tape[symbol] = store.tape[symbol].slice(0, 14);
}

function handleKline(app, kline) {
  const symbol = kline.s;
  if (!symbols[symbol]) return;
  const store = getSourceData(app, "binance");

  const candle = {
    time: Number(kline.t),
    open: Number(kline.o),
    high: Number(kline.h),
    low: Number(kline.l),
    close: Number(kline.c),
    volume: Number(kline.v),
  };

  store.candles[symbol] ||= [];
  const series = store.candles[symbol];
  const last = series[series.length - 1];
  if (last?.time === candle.time) {
    series[series.length - 1] = candle;
  } else {
    series.push(candle);
    if (series.length > candleLimit) {
      series.shift();
    }
  }

  setSourcePrice(app, symbol, candle.close, "binance");
}

function handleDepth(app, symbol, data) {
  const store = getSourceData(app, "binance");
  const normalize = (rows) => {
    let total = 0;
    return rows.map(([price, qty]) => {
      const size = Number(qty);
      total += size;
      return {
        price: Number(price),
        qty: size,
        total,
      };
    });
  };

  store.orderBooks[symbol] = {
    asks: normalize(data.asks.slice(0, 9).reverse()),
    bids: normalize(data.bids.slice(0, 9)),
  };
}
