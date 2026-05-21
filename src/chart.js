import { aggregateCandles, currentPrice } from "./market-sim.js";
import { formatChartPrice } from "./formatters.js";

export function renderChart(app) {
  const canvas = app.els.canvas;
  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.floor(rect.width * dpr);
  const height = Math.floor(rect.height * dpr);

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const pad = { top: 24, right: 64, bottom: 34, left: 12 };
  const innerWidth = rect.width - pad.left - pad.right;
  const innerHeight = rect.height - pad.top - pad.bottom;
  const sourceSeries = app.candles[app.activeSymbol] || [];
  const series = aggregateCandles(sourceSeries, app.selectedTimeframe);
  const visible = series.slice(-72);
  if (!visible.length) {
    drawEmptyChart(ctx, rect, app.marketSource === "binance" ? "等待 Binance K 線資料" : "等待模擬 K 線資料");
    ctx.restore();
    return;
  }
  const highs = visible.map((item) => item.high);
  const lows = visible.map((item) => item.low);
  const max = Math.max(...highs);
  const min = Math.min(...lows);
  const range = max - min || max * 0.01;
  const xStep = innerWidth / visible.length;
  const candleWidth = Math.max(4, Math.min(12, xStep * 0.62));

  drawGrid(ctx, rect, pad, innerHeight, max, range);

  const yFor = (price) => pad.top + ((max - price) / range) * innerHeight;

  visible.forEach((candle, index) => {
    const x = pad.left + index * xStep + xStep / 2;
    const openY = yFor(candle.open);
    const closeY = yFor(candle.close);
    const highY = yFor(candle.high);
    const lowY = yFor(candle.low);
    const up = candle.close >= candle.open;
    ctx.strokeStyle = up ? "#16c784" : "#ef5c67";
    ctx.fillStyle = up ? "rgba(22, 199, 132, 0.82)" : "rgba(239, 92, 103, 0.82)";
    ctx.beginPath();
    ctx.moveTo(x, highY);
    ctx.lineTo(x, lowY);
    ctx.stroke();
    const bodyTop = Math.min(openY, closeY);
    const bodyHeight = Math.max(2, Math.abs(closeY - openY));
    ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
  });

  drawSma(ctx, visible, 9, yFor, xStep, pad.left, "#f3b546");
  drawSma(ctx, visible, 21, yFor, xStep, pad.left, "#46b7c7");
  drawCurrentPrice(ctx, rect, pad, yFor(currentPrice(app)), currentPrice(app));

  ctx.restore();
}

function drawEmptyChart(ctx, rect, message) {
  ctx.fillStyle = "rgba(200, 209, 191, 0.62)";
  ctx.font = "700 13px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(message, rect.width / 2, rect.height / 2);
  ctx.textAlign = "left";
}

function drawGrid(ctx, rect, pad, innerHeight, max, range) {
  ctx.strokeStyle = "rgba(200, 209, 191, 0.1)";
  ctx.lineWidth = 1;

  for (let i = 0; i < 5; i += 1) {
    const y = pad.top + (innerHeight / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(rect.width - pad.right + 8, y);
    ctx.stroke();

    const price = max - (range / 4) * i;
    ctx.fillStyle = "rgba(200, 209, 191, 0.55)";
    ctx.font = "11px Inter, sans-serif";
    ctx.fillText(formatChartPrice(price), rect.width - pad.right + 14, y + 4);
  }
}

function drawSma(ctx, series, length, yFor, xStep, left, color) {
  if (series.length < length) return;

  ctx.strokeStyle = color;
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  series.forEach((_, index) => {
    if (index < length - 1) return;
    const slice = series.slice(index - length + 1, index + 1);
    const average = slice.reduce((sum, candle) => sum + candle.close, 0) / length;
    const x = left + index * xStep + xStep / 2;
    const y = yFor(average);
    if (index === length - 1) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function drawCurrentPrice(ctx, rect, pad, priceY, price) {
  ctx.strokeStyle = "rgba(237, 242, 232, 0.5)";
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(pad.left, priceY);
  ctx.lineTo(rect.width - pad.right + 8, priceY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#edf2e8";
  ctx.fillRect(rect.width - pad.right + 8, priceY - 10, 54, 20);
  ctx.fillStyle = "#07100b";
  ctx.font = "700 11px Inter, sans-serif";
  ctx.fillText(formatChartPrice(price), rect.width - pad.right + 12, priceY + 4);
}
