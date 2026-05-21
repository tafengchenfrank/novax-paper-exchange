import { symbols } from "./config.js";

export function createMarketDataStore() {
  return {
    candles: {},
    tape: {},
    tickers: {},
    orderBooks: {},
    prices: {},
  };
}

export function getSourceData(app, source = app.marketSource) {
  return app.marketData[source];
}

export function getSourcePrice(app, symbol = app.activeSymbol, source = app.marketSource) {
  return getSourceData(app, source)?.prices?.[symbol] ?? symbols[symbol].price;
}

export function setSourcePrice(app, symbol, price, source = app.marketSource) {
  getSourceData(app, source).prices[symbol] = price;
}
