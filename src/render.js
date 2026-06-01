import { feeRate, leaderboardSeed, startingBalance } from "./config.js";
import { amount, currency, formatChartPrice, percent, signedCurrency } from "./formatters.js";
import { currentMarket, currentPrice, randomBook } from "./market-sim.js";
import { calculateAccount, calculatePerformance, liquidationPrice } from "./portfolio.js";
import { renderChart } from "./chart.js";
import { learningLessons } from "./learning.js";
import { buildAlerts } from "./alerts.js";

export function renderAll(app) {
  renderAuth(app);
  renderHeader(app);
  renderChart(app);
  renderBook(app);
  renderTradePanel(app);
  renderPortfolio(app);
  renderOnboarding(app);
  renderFeed(app);
  renderAlerts(app);
  renderNotifications(app);
  renderLearningCenter(app);
  renderTradeDetail(app);
  renderPublicProfile(app);
  renderFeedbackModals(app);
  renderLeaderboard(app);
  updateActiveControls(app);
}

export function renderTradePanel(app) {
  const account = calculateAccount(app);
  const price =
    app.els.orderType.value === "limit" ? Number(app.els.limitPrice.value) || currentPrice(app) : currentPrice(app);
  const qty = Number(app.els.orderQty.value) || 0;
  const leverage = Number(app.els.leverage.value);
  const notional = qty * price;
  const margin = app.selectedMode === "perp" ? notional / leverage : notional;
  const fee = notional * feeRate;

  app.els.accountEquity.textContent = currency(account.equity);
  app.els.availableBalance.textContent = currency(account.available);
  app.els.unrealizedPnl.textContent = signedCurrency(account.unrealized);
  app.els.unrealizedPnl.className = account.unrealized >= 0 ? "positive" : "negative";
  app.els.leverageLabel.textContent = `${leverage}x`;
  app.els.notionalPreview.textContent = currency(notional);
  app.els.marginPreview.textContent = currency(margin);
  app.els.feePreview.textContent = currency(fee);
  app.els.submitOrder.classList.toggle("buy", app.selectedSide === "buy");
  app.els.submitOrder.classList.toggle("sell", app.selectedSide === "sell");
  app.els.submitOrder.textContent = app.selectedSide === "buy" ? "買入模擬單" : "賣出模擬單";

  document.querySelectorAll(".limit-only").forEach((node) => {
    node.classList.toggle("is-hidden", app.els.orderType.value !== "limit");
  });
  document.querySelector(".leverage-field").classList.toggle("is-hidden", app.selectedMode !== "perp");
}

function renderHeader(app) {
  const market = currentMarket(app);
  const series = app.candles[app.activeSymbol] || [];
  const fallbackPrice = currentPrice(app);
  const last = series[series.length - 1] || {
    open: fallbackPrice,
    high: fallbackPrice,
    low: fallbackPrice,
    volume: 0,
  };
  const reference = series[0]?.open || fallbackPrice;
  const ticker = app.marketSource === "binance" ? app.tickers[app.activeSymbol] : null;
  const change = ticker?.changePercent ?? ((market.price - reference) / reference) * 100;
  const account = calculateAccount(app);

  app.els.sourceEyebrow.textContent = app.marketSource === "binance" ? "Binance Market Data" : "Live Simulation";
  app.els.feedStatus.textContent = app.feedStatusLabel || "模擬行情";
  app.els.feedStatus.className = `metric-pill ${feedStatusClass(app.feedStatus)}`;
  app.els.headerPrice.textContent = currency(market.price, market.price > 20 ? 2 : 4);
  app.els.headerChange.textContent = percent(change);
  app.els.headerChange.className = change >= 0 ? "positive" : "negative";
  app.els.headerEquity.textContent = currency(account.equity);
  app.els.marketTitle.textContent = `${market.label} ${app.selectedMode === "perp" ? "永續" : "現貨"}`;
  app.els.statOpen.textContent = currency(last.open, market.price > 20 ? 2 : 4);
  app.els.statHigh.textContent = currency(last.high, market.price > 20 ? 2 : 4);
  app.els.statLow.textContent = currency(last.low, market.price > 20 ? 2 : 4);
  app.els.statVolume.textContent = amount(last.volume, 0);
}

function feedStatusClass(status) {
  if (status === "live") return "live";
  if (status === "connecting") return "connecting";
  if (status === "error") return "error";
  return "";
}

function renderBook(app) {
  const { asks, bids } = randomBook(app);
  const maxTotal = Math.max(...asks.map((row) => row.total), ...bids.map((row) => row.total));
  const bestAsk = asks[asks.length - 1].price;
  const bestBid = bids[0].price;
  const spread = bestAsk - bestBid;

  app.els.asks.innerHTML = asks.map((row) => bookRow(row, maxTotal)).join("");
  app.els.bids.innerHTML = bids.map((row) => bookRow(row, maxTotal)).join("");
  app.els.midPrice.textContent = currency(currentPrice(app), currentPrice(app) > 20 ? 2 : 4);
  app.els.spreadPill.textContent = `Spread ${formatChartPrice(spread)}`;
  app.els.tape.innerHTML = (app.tape[app.activeSymbol] || [])
    .slice(0, 10)
    .map(
      (trade) => `
        <div class="tape-row">
          <span class="${trade.side}">${currency(trade.price, trade.price > 20 ? 2 : 4)}</span>
          <span>${amount(trade.qty, 4)}</span>
          <span>${trade.time}</span>
        </div>
      `,
    )
    .join("");
}

function bookRow(row, maxTotal) {
  const width = Math.max(8, (row.total / maxTotal) * 100);
  return `
    <div class="book-row">
      <span class="depth" style="width:${width}%"></span>
      <span class="price">${currency(row.price, row.price > 20 ? 2 : 4)}</span>
      <span>${amount(row.qty, 4)}</span>
      <span>${amount(row.total, 4)}</span>
    </div>
  `;
}

function renderPortfolio(app) {
  const account = calculateAccount(app);
  const performance = calculatePerformance(app, account);
  const marginRatio = account.equity > 0 ? (account.margin / account.equity) * 100 : 0;
  renderAssetDashboard(app, account, performance);
  app.els.marginRatio.textContent = `保證金 ${marginRatio.toFixed(1)}%`;
  app.els.realizedPnl.textContent = `已實現 ${signedCurrency(app.state.realizedPnl)}`;

  const positionRows = Object.entries(app.state.positions)
    .filter(([, position]) => position && Math.abs(position.qty) > 0)
    .map(([symbol, position]) => {
      const price = currentPrice(app, symbol);
      const pnl = position.qty * (price - position.entry);
      const side = position.qty > 0 ? "多" : "空";
      return `
        <tr>
          <td>${symbol}</td>
          <td class="${position.qty > 0 ? "positive" : "negative"}">${side}</td>
          <td>${amount(Math.abs(position.qty), 5)}</td>
          <td>${currency(position.entry, position.entry > 20 ? 2 : 4)}</td>
          <td class="${pnl >= 0 ? "positive" : "negative"}">${signedCurrency(pnl)}</td>
          <td>${currency(liquidationPrice(position), price > 20 ? 2 : 4)}</td>
        </tr>
      `;
    });

  app.els.positionsTable.innerHTML =
    positionRows.join("") || `<tr class="empty-row"><td colspan="6">目前沒有合約持倉。</td></tr>`;

  const orderRows = app.state.openOrders.map(
    (order) => `
      <tr>
        <td>${order.symbol}</td>
        <td class="${order.side === "buy" ? "positive" : "negative"}">${order.side === "buy" ? "買入" : "賣出"}</td>
        <td>${currency(order.price, order.price > 20 ? 2 : 4)}</td>
        <td>${amount(order.qty, 5)}</td>
        <td><button class="tiny-action" data-cancel="${order.id}">取消</button></td>
      </tr>
    `,
  );
  app.els.ordersTable.innerHTML =
    orderRows.join("") || `<tr class="empty-row"><td colspan="5">目前沒有開放委託。</td></tr>`;

  app.els.historyList.innerHTML =
    app.state.history
      .slice(0, 9)
      .map(
        (item) => `
          <button class="history-item" type="button" data-trade-detail="${escapeHtml(item.id)}">
            <span class="history-dot ${item.side}"></span>
            <div>
              <strong>${escapeHtml(item.symbol)} ${escapeHtml(item.mode)} ${item.side === "buy" ? "買入" : "賣出"} ${amount(item.qty, 5)}</strong>
              <span>${escapeHtml(item.time)} @ ${currency(item.price, item.price > 20 ? 2 : 4)}${item.note ? ` · ${escapeHtml(item.note)}` : ""}</span>
            </div>
            <strong class="${item.pnl >= 0 ? "positive" : "negative"}">${signedCurrency(item.pnl)}</strong>
          </button>
        `,
      )
      .join("") || `<div class="empty-state">尚無成交紀錄。</div>`;

  renderRiskCoach(app, account, marginRatio);
}

function renderTradeDetail(app) {
  const trade = app.state.history.find((item) => item.id === app.selectedTradeId);
  const shouldOpen = Boolean(app.tradeDetailOpen && trade);
  app.els.tradeDetailModal.classList.toggle("is-hidden", !shouldOpen);

  if (!shouldOpen) return;

  const qty = Number(trade.qty) || 0;
  const price = Number(trade.price) || 0;
  const leverage = trade.leverage || leverageFromMode(trade.mode);
  const notional = numberOr(trade.notional, Math.abs(qty * price));
  const fee = numberOr(trade.fee, Math.abs(notional * feeRate));
  const margin = numberOr(trade.margin, leverage > 0 ? notional / leverage : notional);
  const pnl = Number(trade.pnl) || 0;
  const grossPnl = Number.isFinite(trade.grossPnl) ? trade.grossPnl : null;
  const entryPrice = Number.isFinite(trade.entryPrice) ? trade.entryPrice : null;
  const priceDigits = price > 20 ? 2 : 4;
  const journal = trade.journal || {};
  const reviewed = Boolean(journal.strategy || journal.emotion || journal.rating || journal.note);

  app.els.tradeDetailTitle.textContent = `${trade.symbol} ${trade.side === "buy" ? "買入" : "賣出"}`;
  app.els.tradeDetailMeta.textContent = `${trade.time || "--"} · ${trade.mode || "--"} · ${orderTypeLabel(trade.orderType)}`;
  app.els.tradeDetailPnl.textContent = signedCurrency(pnl);
  app.els.tradeDetailPnl.className = pnl >= 0 ? "positive" : "negative";
  app.els.journalStatus.textContent = reviewed ? "已檢討" : "未檢討";
  app.els.journalStatus.className = `metric-pill ${reviewed ? "live" : ""}`;
  app.els.tradeDetailGrid.innerHTML = [
    detailRow("交易對", trade.symbol),
    detailRow("方向", sideLabel(trade.side)),
    detailRow("模式", trade.mode || "--"),
    detailRow("訂單類型", orderTypeLabel(trade.orderType)),
    detailRow("數量", amount(qty, 5)),
    detailRow("成交價", currency(price, priceDigits)),
    detailRow("名目價值", currency(notional)),
    detailRow("手續費", currency(fee)),
    detailRow("槓桿", leverage > 1 ? `${leverage}x` : "無"),
    detailRow("保證金", currency(margin)),
    detailRow("入場均價", entryPrice ? currency(entryPrice, entryPrice > 20 ? 2 : 4) : "--"),
    detailRow("毛損益", grossPnl === null ? "--" : signedCurrency(grossPnl), grossPnl),
    detailRow("淨損益", signedCurrency(pnl), pnl),
    detailRow("策略", strategyLabel(journal.strategy)),
    detailRow("情緒", emotionLabel(journal.emotion)),
    detailRow("評分", journal.rating ? `${journal.rating} / 5` : "--"),
    detailRow("公開狀態", journal.public ? "公開" : "私人"),
    detailRow("備註", trade.note || "--"),
  ].join("");

  if (app.tradeJournalLoadedFor !== trade.id) {
    app.els.journalStrategy.value = journal.strategy || "";
    app.els.journalEmotion.value = journal.emotion || "";
    app.els.journalRating.value = journal.rating ? String(journal.rating) : "";
    app.els.journalNote.value = journal.note || "";
    app.els.journalPublic.checked = Boolean(journal.public);
    app.els.journalMessage.textContent = "";
    app.els.journalMessage.className = "auth-message";
    app.tradeJournalLoadedFor = trade.id;
  }
}

function detailRow(label, value, toneValue = null) {
  const tone = toneValue === null ? "" : Number(toneValue) >= 0 ? "positive" : "negative";
  return `
    <div class="trade-detail-row">
      <span>${escapeHtml(label)}</span>
      <strong class="${tone}">${escapeHtml(String(value))}</strong>
    </div>
  `;
}

function sideLabel(side) {
  return side === "buy" ? "買入 / 做多" : "賣出 / 做空";
}

function orderTypeLabel(type) {
  if (type === "limit") return "限價";
  if (type === "liquidation") return "強平";
  return "市價";
}

function strategyLabel(strategy) {
  const labels = {
    breakout: "突破",
    pullback: "回調",
    grid: "網格",
    chase: "追單",
    reversal: "反轉",
    test: "測試單",
  };
  return labels[strategy] || "--";
}

function emotionLabel(emotion) {
  const labels = {
    calm: "冷靜",
    hesitant: "猶豫",
    fomo: "FOMO",
    revenge: "報復性交易",
    patient: "耐心等待",
  };
  return labels[emotion] || "--";
}

function leverageFromMode(mode = "") {
  const match = String(mode).match(/(\d+(?:\.\d+)?)x/);
  return match ? Number(match[1]) : 1;
}

function numberOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderAssetDashboard(app, account, performance) {
  app.els.assetOwner.textContent = app.user?.name || "訪客模擬帳戶";
  app.els.assetSyncStatus.textContent = accountSyncLabel(app);
  app.els.assetSyncStatus.className = `metric-pill ${accountSyncTone(app)}`;
  app.els.assetEquity.textContent = currency(account.equity);
  app.els.assetAvailable.textContent = currency(account.available);
  app.els.assetSpotValue.textContent = currency(account.spotValue);
  app.els.assetMarginUsed.textContent = currency(account.margin);

  app.els.performanceRoi.textContent = percent(performance.roi);
  app.els.performanceRoi.className = performance.roi >= 0 ? "positive" : "negative";
  app.els.performanceWinRate.textContent = performance.tradeCount ? `${performance.winRate.toFixed(1)}%` : "--";
  app.els.performanceTrades.textContent = amount(performance.tradeCount, 0);
  app.els.performanceDrawdown.textContent = `${performance.maxDrawdownPct.toFixed(2)}%`;
  app.els.performanceDrawdown.className = performance.maxDrawdownPct > 0 ? "negative" : "";
  app.els.performanceAveragePnl.textContent = signedCurrency(performance.averagePnl);
  app.els.performanceAveragePnl.className = performance.averagePnl >= 0 ? "positive" : "negative";
  app.els.performanceProfitFactor.textContent =
    performance.profitFactor === Infinity ? "不限" : amount(performance.profitFactor, 2);
}

function renderLearningCenter(app) {
  const progress = app.state.learningProgress || {};
  const completed = learningLessons.filter((lesson) => progress[lesson.id]?.completedAt).length;
  app.els.learningProgress.textContent = `${completed}/${learningLessons.length} 完成`;
  app.els.learningProgress.className = `metric-pill ${completed === learningLessons.length ? "live" : ""}`;
  app.els.learningList.innerHTML = learningLessons
    .map((lesson) => {
      const status = progress[lesson.id] || {};
      const done = Boolean(status.completedAt);
      const practiced = Boolean(status.practicedAt);
      return `
        <article class="learning-card ${done ? "is-complete" : ""}">
          <div class="learning-card-head">
            <div>
              <span>${escapeHtml(lesson.category)} · ${escapeHtml(lesson.time)}</span>
              <strong>${escapeHtml(lesson.title)}</strong>
            </div>
            <span class="metric-pill ${done ? "live" : practiced ? "connecting" : ""}">
              ${done ? "已完成" : practiced ? "已練習" : "未開始"}
            </span>
          </div>
          <p>${escapeHtml(lesson.summary)}</p>
          <ul>
            ${lesson.points.map((point) => `<li>${escapeHtml(point)}</li>`).join("")}
          </ul>
          <div class="learning-actions">
            <button class="tiny-action" type="button" data-learning-practice="${escapeHtml(lesson.id)}">
              ${escapeHtml(lesson.practiceLabel)}
            </button>
            <button class="tiny-action complete-action" type="button" data-learning-complete="${escapeHtml(lesson.id)}">
              ${done ? "取消完成" : "標記完成"}
            </button>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderOnboarding(app) {
  const missions = onboardingMissions(app);
  const completed = missions.filter((mission) => mission.done).length;
  app.els.onboardingProgress.textContent = `${completed}/${missions.length} 完成`;
  app.els.onboardingProgress.className = `metric-pill ${completed === missions.length ? "live" : ""}`;
  app.els.onboardingList.innerHTML = missions
    .map(
      (mission, index) => `
        <article class="onboarding-card ${mission.done ? "is-complete" : ""}">
          <span class="onboarding-step">${index + 1}</span>
          <div>
            <strong>${escapeHtml(mission.title)}</strong>
            <p>${escapeHtml(mission.body)}</p>
          </div>
          <button
            class="tiny-action"
            type="button"
            data-onboarding-action="${escapeHtml(mission.action)}"
            ${mission.done && mission.action !== "follow" ? "disabled" : ""}
          >
            ${escapeHtml(mission.done ? "完成" : mission.label)}
          </button>
        </article>
      `,
    )
    .join("");
}

function onboardingMissions(app) {
  const reviewedTrades = app.state.history.filter((trade) => isReviewedTrade(trade));
  const publicTrades = app.state.history.filter((trade) => trade.journal?.public);
  return [
    {
      title: "建立你的模擬帳號",
      body: "登入後進度會儲存到雲端，公開頁、排行榜與追蹤動態才會完整運作。",
      done: Boolean(app.user),
      action: "auth",
      label: "登入 / 註冊",
    },
    {
      title: "完成第一筆模擬交易",
      body: "先用小數量下單，觀察名目價值、保證金與手續費怎麼變化。",
      done: app.state.history.length > 0,
      action: "trade",
      label: "前往下單",
    },
    {
      title: "寫下第一篇交易日誌",
      body: "標記策略、情緒與評分，比只看賺虧更能累積交易經驗。",
      done: reviewedTrades.length > 0,
      action: "journal",
      label: "打開日誌",
    },
    {
      title: "公開一篇心得",
      body: "公開後其他使用者才能在你的公開頁與追蹤動態看到這筆交易。",
      done: publicTrades.length > 0,
      action: "publish",
      label: "設定公開",
    },
    {
      title: "追蹤一位交易者",
      body: "從排行榜打開公開頁並追蹤，就能在動態牆看到對方最新心得。",
      done: app.followingRows.length > 0,
      action: "follow",
      label: "看排行榜",
    },
  ];
}

function isReviewedTrade(trade) {
  const journal = trade?.journal || {};
  return Boolean(journal.strategy || journal.emotion || journal.rating || journal.note);
}

function renderAlerts(app) {
  const dismissed = app.state.dismissedAlerts || {};
  const visibleAlerts = buildAlerts(app).filter((alert) => !dismissed[alert.key]).slice(0, 5);
  app.els.alertCount.textContent = `${visibleAlerts.length} 則提醒`;
  app.els.alertCount.className = `metric-pill ${visibleAlerts.some((alert) => alert.tone === "danger") ? "error" : visibleAlerts.some((alert) => alert.tone === "warn") ? "connecting" : ""}`;

  app.els.alertsList.innerHTML =
    visibleAlerts
      .map(
        (alert) => `
          <article class="alert-item ${escapeHtml(alert.tone)}">
            <div>
              <span>${alertToneLabel(alert.tone)}</span>
              <strong>${escapeHtml(alert.title)}</strong>
              <p>${escapeHtml(alert.body)}</p>
            </div>
            <button class="tiny-action" type="button" data-dismiss-alert="${escapeHtml(alert.key)}">忽略</button>
          </article>
        `,
      )
      .join("") || `<div class="empty-state alert-empty">目前沒有需要處理的提醒。</div>`;
}

function renderNotifications(app) {
  if (!app.user) {
    app.els.notificationCount.textContent = "未登入";
    app.els.notificationCount.className = "metric-pill";
    app.els.markNotificationsRead.disabled = true;
    app.els.notificationList.innerHTML = `<div class="empty-state notification-empty">登入後可接收追蹤、按讚與留言通知。</div>`;
    return;
  }

  const unread = app.unreadNotifications || 0;
  app.els.notificationCount.textContent = `${unread} 未讀`;
  app.els.notificationCount.className = `metric-pill ${unread > 0 ? "connecting" : ""}`;
  app.els.markNotificationsRead.disabled = app.notificationsBusy || unread === 0;
  app.els.notificationList.innerHTML =
    app.notifications
      .map((notification) => notificationRow(notification))
      .join("") || `<div class="empty-state notification-empty">目前沒有社交通知。</div>`;
}

function notificationRow(notification) {
  return `
    <button
      class="notification-row ${notification.readAt ? "" : "is-unread"}"
      type="button"
      data-notification-profile="${escapeHtml(notification.actorId)}"
    >
      <div>
        <span>${escapeHtml(notificationLabel(notification.type))} · ${dateLabel(notification.createdAt)}</span>
        <strong>${escapeHtml(notification.actorName)}</strong>
        <p>${escapeHtml(notificationBody(notification))}</p>
      </div>
    </button>
  `;
}

function notificationLabel(type) {
  if (type === "trade_like") return "按讚";
  if (type === "trade_comment") return "留言";
  if (type === "follow") return "追蹤";
  return "通知";
}

function notificationBody(notification) {
  if (notification.type === "trade_like") return "對你的公開交易按讚。";
  if (notification.type === "trade_comment") return `留言：${notification.body || "--"}`;
  if (notification.type === "follow") return "開始追蹤你的公開個人頁。";
  return notification.body || "你有新的社群互動。";
}

function renderFeed(app) {
  if (!app.els.feedList) return;

  app.els.feedMessage.textContent = app.feedMessage || "";
  app.els.feedMessage.className = `auth-message feed-message ${app.feedMessageTone || ""}`;
  syncFeedFilterControls(app);

  if (!app.user) {
    app.els.feedCount.textContent = "未登入";
    app.els.feedCount.className = "metric-pill";
    app.els.refreshFeed.disabled = true;
    app.els.feedList.innerHTML = `<div class="empty-state feed-empty">登入後可看到追蹤者最新公開交易與心得。</div>`;
    app.feedSignature = "";
    return;
  }

  const totalRows = app.feedRows || [];
  const rows = visibleFeedRows(app);
  app.els.feedCount.textContent =
    rows.length === totalRows.length ? `${rows.length} 則` : `${rows.length}/${totalRows.length} 則`;
  app.els.feedCount.className = `metric-pill ${app.feedBusy ? "connecting" : totalRows.length ? "live" : ""}`;
  app.els.refreshFeed.disabled = app.feedBusy;

  const signature = feedSignature(app);
  if (app.feedSignature === signature) {
    syncFeedInteractionState(app);
    return;
  }

  app.els.feedList.innerHTML = rows.length
    ? rows.map((trade) => feedTradeRow(app, trade)).join("")
    : feedEmptyState(app, totalRows.length);
  app.feedSignature = signature;
  syncFeedInteractionState(app);
}

function feedSignature(app) {
  const rows = visibleFeedRows(app);
  return JSON.stringify({
    userId: app.user?.id || null,
    feedSymbol: app.feedSymbol,
    feedSort: app.feedSort,
    feedHighRatingOnly: app.feedHighRatingOnly,
    following: app.followingRows.map((row) => row.id),
    totalCount: (app.feedRows || []).length,
    rows: rows.map((trade) => ({
      ownerId: trade.ownerId,
      ownerName: trade.ownerName,
      id: trade.id,
      side: trade.side,
      qty: trade.qty,
      price: trade.price,
      pnl: trade.pnl,
      time: trade.time,
      journal: trade.journal,
      likesCount: trade.likesCount,
      likedByMe: trade.likedByMe,
      comments: (trade.comments || []).map((comment) => ({
        id: comment.id,
        body: comment.body,
        authorName: comment.authorName,
      })),
    })),
  });
}

function visibleFeedRows(app) {
  const symbol = app.feedSymbol || "all";
  const sort = app.feedSort || "latest";
  const highRatingOnly = Boolean(app.feedHighRatingOnly);
  const latestValue = (trade) => Number(trade.journal?.updatedAt || trade.sortAt || 0);
  const commentCount = (trade) => (trade.comments || []).length;
  const ratingValue = (trade) => Number(trade.journal?.rating || 0);
  const tieBreak = (a, b) => latestValue(b) - latestValue(a);

  const rows = (app.feedRows || [])
    .filter((trade) => symbol === "all" || trade.symbol === symbol)
    .filter((trade) => !highRatingOnly || ratingValue(trade) >= 4);

  return rows.sort((a, b) => {
    if (sort === "popular") {
      return (b.likesCount || 0) - (a.likesCount || 0) || commentCount(b) - commentCount(a) || tieBreak(a, b);
    }
    if (sort === "comments") {
      return commentCount(b) - commentCount(a) || (b.likesCount || 0) - (a.likesCount || 0) || tieBreak(a, b);
    }
    if (sort === "pnl") {
      return (Number(b.pnl) || 0) - (Number(a.pnl) || 0) || tieBreak(a, b);
    }
    return tieBreak(a, b);
  });
}

function syncFeedFilterControls(app) {
  const disabled = !app.user || app.feedBusy;
  app.els.feedSymbol.value = app.feedSymbol || "all";
  app.els.feedSort.value = app.feedSort || "latest";
  app.els.feedHighRatingOnly.checked = Boolean(app.feedHighRatingOnly);
  app.els.feedSymbol.disabled = disabled;
  app.els.feedSort.disabled = disabled;
  app.els.feedHighRatingOnly.disabled = disabled;
  app.els.resetFeedFilters.disabled =
    disabled || (app.feedSymbol === "all" && app.feedSort === "latest" && !app.feedHighRatingOnly);
}

function feedEmptyState(app, totalCount) {
  if (app.feedBusy) {
    return `<div class="empty-state feed-empty">正在整理追蹤動態...</div>`;
  }
  if (!app.followingRows.length) {
    return `<div class="empty-state feed-empty">尚未追蹤交易者。可以從排行榜打開公開頁並追蹤。</div>`;
  }
  if (totalCount > 0) {
    return `<div class="empty-state feed-empty">目前沒有符合條件的追蹤動態。</div>`;
  }
  return `<div class="empty-state feed-empty">追蹤者尚未公開交易日誌。</div>`;
}

function feedTradeRow(app, trade) {
  const priceDigits = trade.price > 20 ? 2 : 4;
  const journal = trade.journal || {};
  const key = `${trade.ownerId}:${trade.id}`;
  const commentDraft = app.feedCommentDrafts?.[key] || "";
  return `
    <article class="feed-card">
      <div class="feed-card-head">
        <button class="feed-author" type="button" data-feed-profile="${escapeHtml(trade.ownerId)}">
          <span>追蹤交易者</span>
          <strong>${escapeHtml(trade.ownerName || "使用者")}</strong>
          <small>${formatNullablePercent(trade.ownerRoi)} · ${amount(trade.ownerTradesCount || 0, 0)} 筆</small>
        </button>
        <span class="metric-pill">${dateLabel(journal.updatedAt || trade.ownerUpdatedAt)}</span>
      </div>

      <div class="public-trade-main">
        <span class="history-dot ${trade.side}"></span>
        <div>
          <strong>${escapeHtml(trade.symbol)} ${trade.side === "buy" ? "買入" : "賣出"} ${amount(trade.qty, 5)}</strong>
          <span>${escapeHtml(trade.time)} · ${escapeHtml(trade.mode)} · ${currency(trade.price, priceDigits)}</span>
        </div>
        <strong class="${trade.pnl >= 0 ? "positive" : "negative"}">${signedCurrency(trade.pnl)}</strong>
      </div>

      <div class="public-journal-card">
        <div class="public-journal-tags">
          <span>${escapeHtml(strategyLabel(journal.strategy))}</span>
          <span>${escapeHtml(emotionLabel(journal.emotion))}</span>
          <span>${journal.rating ? `${escapeHtml(journal.rating)} / 5` : "未評分"}</span>
        </div>
        <p>${journal.note ? escapeHtml(journal.note) : "未填寫公開筆記。"}</p>
      </div>

      <div class="feed-actions">
        <button
          class="tiny-action ${trade.likedByMe ? "is-liked" : ""}"
          type="button"
          data-feed-like="${escapeHtml(key)}"
          ${!app.user ? "disabled" : ""}
        >
          ${trade.likedByMe ? "取消讚" : "讚"} · ${amount(trade.likesCount || 0, 0)}
        </button>
        <button class="tiny-action" type="button" data-feed-profile="${escapeHtml(trade.ownerId)}">公開頁</button>
        <button
          class="tiny-action"
          type="button"
          data-feed-report-trade="${escapeHtml(trade.id)}"
          data-report-owner="${escapeHtml(trade.ownerId)}"
          ${!app.user ? "disabled" : ""}
        >
          檢舉
        </button>
      </div>

      <div class="public-comments">
        ${
          (trade.comments || [])
            .map((comment) =>
              publicCommentRow(comment, {
                ownerId: trade.ownerId,
                tradeId: trade.id,
                feed: true,
                canReport: Boolean(app.user),
              }),
            )
            .join("") || `<div class="empty-state public-comment-empty">尚無留言。</div>`
        }
      </div>
      <div class="public-comment-form">
        <input
          type="text"
          maxlength="240"
          value="${escapeHtml(commentDraft)}"
          data-feed-comment-input="${escapeHtml(key)}"
        />
        <button
          class="tiny-action"
          type="button"
          data-feed-post-comment="${escapeHtml(key)}"
          ${!app.user ? "disabled" : ""}
        >
          留言
        </button>
      </div>
    </article>
  `;
}

function syncFeedInteractionState(app) {
  const disabled = !app.user || app.feedBusy;
  app.els.feedList
    .querySelectorAll("[data-feed-like], [data-feed-post-comment], [data-feed-report-trade], [data-feed-report-comment]")
    .forEach((button) => {
      button.disabled = disabled;
    });
}

function alertToneLabel(tone) {
  if (tone === "danger") return "危險";
  if (tone === "warn") return "注意";
  return "一般";
}

function accountSyncLabel(app) {
  if (!app.user) return "本機資料";
  if (app.syncBusy) return "儲存中";
  if (app.syncQueued) return "待儲存";
  return "雲端儲存";
}

function accountSyncTone(app) {
  if (!app.user) return "";
  if (app.syncBusy || app.syncQueued) return "connecting";
  return "live";
}

function renderRiskCoach(app, account, marginRatio) {
  const cards = [];
  const currentLeverage = Number(app.els.leverage.value);

  if (marginRatio > 70) {
    cards.push({
      tone: "danger",
      title: "保證金壓力偏高",
      body: "目前倉位吃掉太多權益，價格小幅波動也可能快速接近強平估算。",
    });
  } else if (marginRatio > 40) {
    cards.push({
      tone: "warn",
      title: "倉位需要留緩衝",
      body: "保證金使用率已經偏高，連續加倉前先看未實現損益與可用資金。",
    });
  } else {
    cards.push({
      tone: "normal",
      title: "資金緩衝正常",
      body: "目前模擬帳戶仍保留可用資金，適合觀察策略節奏與進出場品質。",
    });
  }

  if (currentLeverage >= 25 && app.selectedMode === "perp") {
    cards.push({
      tone: "warn",
      title: "高槓桿區間",
      body: `${currentLeverage}x 會放大短線波動，適合小倉位測試，不適合重倉連續追價。`,
    });
  }

  if (account.unrealized < -account.equity * 0.08) {
    cards.push({
      tone: "danger",
      title: "浮虧超過權益 8%",
      body: "這種回撤通常需要先處理風險，再討論補倉或等待反彈。",
    });
  }

  app.els.riskCoach.innerHTML = cards
    .map(
      (card) => `
        <div class="risk-card ${card.tone}">
          <strong>${card.title}</strong>
          <p>${card.body}</p>
        </div>
      `,
    )
    .join("");
}

function renderLeaderboard(app) {
  const account = calculateAccount(app);
  const roi = ((account.equity - startingBalance) / startingBalance) * 100;
  const rows = app.leaderboardRows.length
    ? app.leaderboardRows.map((row) => ({
        id: row.id,
        name: row.name,
        style:
          Number.isFinite(row.equity) && row.updatedAt
            ? `${currency(row.equity)} · ${row.tradesCount} 筆`
            : `${row.tradesCount || 0} 筆 · 尚未儲存`,
        roi: row.roi,
        you: app.user?.id === row.id,
        isFollowing: row.isFollowing,
      }))
    : [...leaderboardSeed, { name: "你", style: "NovaX 帳戶", roi, you: true }];
  rows.sort((a, b) => b.roi - a.roi);

  app.els.leaderboard.innerHTML = rows
    .map((row, index) => {
      const tag = row.id ? "button" : "div";
      const attrs = row.id ? ` type="button" data-public-profile="${escapeHtml(row.id)}"` : "";
      return `
        <${tag} class="leader-row ${row.you ? "is-you" : ""}"${attrs}>
          <span class="rank">${index + 1}</span>
          <div class="leader-name">
            <strong>${escapeHtml(row.name)}${row.you ? " · 你" : ""}</strong>
            <span>${escapeHtml(row.style)}</span>
          </div>
          <div class="leader-score">
            <strong class="${toneClass(row.roi)}">${formatNullablePercent(row.roi)}</strong>
            ${row.isFollowing ? `<span class="metric-pill live">已追蹤</span>` : ""}
          </div>
        </${tag}>
      `;
    })
    .join("");

  renderFollowing(app);
}

function renderFollowing(app) {
  if (!app.user) {
    app.els.followingCount.textContent = "未登入";
    app.els.followingList.innerHTML = `<div class="empty-state following-empty">登入後可追蹤排行榜交易者。</div>`;
    return;
  }

  app.els.followingCount.textContent = `${app.followingRows.length} 人`;
  app.els.followingList.innerHTML =
    app.followingRows
      .map(
        (row) => `
          <button class="following-row" type="button" data-public-profile="${escapeHtml(row.id)}">
            <div class="leader-name">
              <strong>${escapeHtml(row.name)}</strong>
              <span>${Number.isFinite(row.equity) ? `${currency(row.equity)} · ${row.tradesCount} 筆` : "尚未儲存"}</span>
            </div>
            <strong class="${toneClass(row.roi)}">${formatNullablePercent(row.roi)}</strong>
          </button>
        `,
      )
      .join("") || `<div class="empty-state following-empty">尚未追蹤交易者。</div>`;
}

function renderPublicProfile(app) {
  const shouldOpen = Boolean(app.publicProfileOpen);
  app.els.publicProfileModal.classList.toggle("is-hidden", !shouldOpen);
  if (!shouldOpen) return;

  const profile = app.publicProfile;
  if (!profile) {
    app.els.publicProfileTitle.textContent = "公開個人頁";
    app.els.publicProfileName.textContent = app.publicProfileBusy ? "載入中..." : "--";
    app.els.publicProfileMeta.textContent = "--";
    app.els.publicProfileRelation.textContent = app.publicProfileBusy ? "載入中" : "--";
    app.els.publicProfileRelation.className = "metric-pill connecting";
    app.els.publicProfileStats.innerHTML = "";
    app.els.publicProfileTrades.innerHTML = `<div class="empty-state">尚無公開交易。</div>`;
    app.publicProfileTradeSignature = "";
    app.els.followProfile.disabled = true;
    app.els.followProfile.textContent = "追蹤";
    return;
  }

  app.els.publicProfileTitle.textContent = "公開個人頁";
  app.els.publicProfileName.textContent = profile.name;
  app.els.publicProfileMeta.textContent = `${dateLabel(profile.createdAt)} 加入 · ${dateLabel(profile.updatedAt)} 更新`;
  app.els.publicProfileRelation.textContent = profile.isSelf ? "這是你" : profile.isFollowing ? "已追蹤" : "未追蹤";
  app.els.publicProfileRelation.className = `metric-pill ${profile.isFollowing || profile.isSelf ? "live" : ""}`;
  app.els.publicProfileStats.innerHTML = [
    publicStat("ROI", formatNullablePercent(profile.roi), profile.roi),
    publicStat("總權益", formatNullableCurrency(profile.equity)),
    publicStat("交易次數", amount(profile.tradesCount || 0, 0)),
    publicStat("追蹤者", amount(profile.followersCount || 0, 0)),
    publicStat("追蹤中", amount(profile.followingCount || 0, 0)),
    publicStat("最近儲存", dateLabel(profile.updatedAt)),
  ].join("");

  const tradeSignature = publicProfileTradeSignature(app, profile);
  if (app.publicProfileTradeSignature !== tradeSignature) {
    app.els.publicProfileTrades.innerHTML =
      profile.recentTrades?.length
        ? profile.recentTrades.map((trade) => publicTradeRow(app, profile, trade)).join("")
        : `<div class="empty-state">尚無公開交易。</div>`;
    app.publicProfileTradeSignature = tradeSignature;
  }
  syncPublicProfileTradeState(app, profile);

  app.els.followProfile.disabled = app.publicProfileBusy || !app.user || profile.isSelf;
  app.els.followProfile.textContent = profile.isSelf
    ? "自己的公開頁"
    : !app.user
      ? "登入後追蹤"
      : profile.isFollowing
        ? "取消追蹤"
        : "追蹤";
}

function publicProfileTradeSignature(app, profile) {
  const trades = (profile.recentTrades || []).map((trade) => ({
    id: trade.id,
    pnl: trade.pnl,
    likesCount: trade.likesCount,
    likedByMe: trade.likedByMe,
    comments: (trade.comments || []).map((comment) => ({
      id: comment.id,
      body: comment.body,
      authorName: comment.authorName,
    })),
    journal: trade.journal,
  }));
  return JSON.stringify({
    userId: app.user?.id || null,
    profileId: profile.id,
    isSelf: profile.isSelf,
    trades,
  });
}

function syncPublicProfileTradeState(app, profile) {
  const actionDisabled = app.publicProfileBusy || !app.user || profile.isSelf;
  const commentDisabled = app.publicProfileBusy || !app.user;
  const reportDisabled = app.publicProfileBusy || !app.user;
  app.els.publicProfileTrades.querySelectorAll("[data-like-trade]").forEach((button) => {
    button.disabled = actionDisabled;
  });
  app.els.publicProfileTrades.querySelectorAll("[data-post-comment]").forEach((button) => {
    button.disabled = commentDisabled;
  });
  app.els.publicProfileTrades.querySelectorAll("[data-report-trade], [data-report-comment]").forEach((button) => {
    button.disabled = reportDisabled;
  });
  app.els.publicProfileTrades.querySelectorAll("[data-comment-input]").forEach((input) => {
    input.disabled = !app.user;
  });
}

function publicStat(label, value, toneValue = null) {
  const tone = toneValue === null ? "" : Number(toneValue) >= 0 ? "positive" : "negative";
  return `
    <div class="public-stat">
      <span>${escapeHtml(label)}</span>
      <strong class="${tone}">${escapeHtml(value)}</strong>
    </div>
  `;
}

function publicTradeRow(app, profile, trade) {
  const priceDigits = trade.price > 20 ? 2 : 4;
  const journal = trade.journal || {};
  const commentDraft = app.publicCommentDrafts?.[trade.id] || "";
  const interactionDisabled = app.publicProfileBusy || !app.user || profile.isSelf;
  return `
    <article class="public-trade-row">
      <div class="public-trade-main">
        <span class="history-dot ${trade.side}"></span>
        <div>
          <strong>${escapeHtml(trade.symbol)} ${trade.side === "buy" ? "買入" : "賣出"} ${amount(trade.qty, 5)}</strong>
          <span>${escapeHtml(trade.time)} · ${escapeHtml(trade.mode)} · ${currency(trade.price, priceDigits)}</span>
        </div>
        <strong class="${trade.pnl >= 0 ? "positive" : "negative"}">${signedCurrency(trade.pnl)}</strong>
      </div>
      <div class="public-journal-card">
        <div class="public-journal-tags">
          <span>${escapeHtml(strategyLabel(journal.strategy))}</span>
          <span>${escapeHtml(emotionLabel(journal.emotion))}</span>
          <span>${journal.rating ? `${escapeHtml(journal.rating)} / 5` : "未評分"}</span>
        </div>
        <p>${journal.note ? escapeHtml(journal.note) : "未填寫公開筆記。"}</p>
      </div>
      <div class="public-trade-actions">
        <button
          class="tiny-action ${trade.likedByMe ? "is-liked" : ""}"
          type="button"
          data-like-trade="${escapeHtml(trade.id)}"
          ${interactionDisabled ? "disabled" : ""}
        >
          ${trade.likedByMe ? "取消讚" : "讚"} · ${amount(trade.likesCount || 0, 0)}
        </button>
        <button
          class="tiny-action"
          type="button"
          data-report-trade="${escapeHtml(trade.id)}"
          ${!app.user ? "disabled" : ""}
        >
          檢舉
        </button>
      </div>
      <div class="public-comments">
        ${
          (trade.comments || [])
            .map((comment) =>
              publicCommentRow(comment, {
                ownerId: profile.id,
                tradeId: trade.id,
                canReport: Boolean(app.user),
              }),
            )
            .join("") || `<div class="empty-state public-comment-empty">尚無留言。</div>`
        }
      </div>
      <div class="public-comment-form">
        <input
          type="text"
          maxlength="240"
          value="${escapeHtml(commentDraft)}"
          data-comment-input="${escapeHtml(trade.id)}"
          ${!app.user ? "disabled" : ""}
        />
        <button
          class="tiny-action"
          type="button"
          data-post-comment="${escapeHtml(trade.id)}"
          ${app.publicProfileBusy || !app.user ? "disabled" : ""}
        >
          留言
        </button>
      </div>
    </article>
  `;
}

function publicCommentRow(comment, context = {}) {
  const ownerId = context.ownerId || "";
  const tradeId = context.tradeId || "";
  const reportAttrs = context.feed
    ? `data-feed-report-comment="${escapeHtml(comment.id)}" data-report-owner="${escapeHtml(ownerId)}" data-report-trade="${escapeHtml(tradeId)}"`
    : `data-report-comment="${escapeHtml(comment.id)}" data-report-trade="${escapeHtml(tradeId)}"`;
  const reportButton =
    context.canReport && comment.id
      ? `<button class="tiny-action comment-report" type="button" ${reportAttrs}>檢舉留言</button>`
      : "";
  return `
    <div class="public-comment-row">
      <div class="public-comment-head">
        <strong>${escapeHtml(comment.authorName)}</strong>
        ${reportButton}
      </div>
      <p>${escapeHtml(comment.body)}</p>
    </div>
  `;
}

function formatNullableCurrency(value) {
  return Number.isFinite(value) ? currency(value) : "--";
}

function formatNullablePercent(value) {
  return Number.isFinite(value) ? percent(value) : "--";
}

function toneClass(value) {
  if (!Number.isFinite(value)) return "";
  return value >= 0 ? "positive" : "negative";
}

function dateLabel(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function dateTimeLabel(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function feedbackCategoryLabel(value) {
  return {
    bug: "功能異常",
    ux: "操作卡住",
    idea: "功能建議",
    other: "其他",
  }[value] || "其他";
}

function reportReasonLabel(value) {
  return (
    {
      spam: "垃圾訊息",
      abuse: "攻擊或騷擾",
      misleading: "誤導性投資內容",
      personal: "個資或敏感資訊",
      other: "其他",
    }[value] || "其他"
  );
}

function moderationStatusLabel(value) {
  return value === "actioned" ? "已處理" : "待處理";
}

function renderAuth(app) {
  const signedIn = Boolean(app.user);
  const isAdmin = app.user?.role === "admin";
  if (signedIn && app.authModalOpen) {
    app.authModalOpen = false;
  }
  if (signedIn && app.forgotPasswordOpen) {
    app.forgotPasswordOpen = false;
  }
  if (!signedIn && app.profileModalOpen) {
    app.profileModalOpen = false;
  }
  if (!isAdmin) {
    app.adminFeedbackOpen = false;
    app.adminDashboardOpen = false;
    app.adminModerationOpen = false;
  }

  app.els.authGuest.classList.toggle("is-hidden", signedIn);
  app.els.authSignedIn.classList.toggle("is-hidden", !signedIn);
  app.els.openAdminDashboard.classList.toggle("is-hidden", !isAdmin);
  app.els.adminFeedbackOpenButtons.forEach((button) => button.classList.toggle("is-hidden", !isAdmin));
  app.els.adminModerationOpenButtons.forEach((button) => button.classList.toggle("is-hidden", !isAdmin));
  app.els.authModal.classList.toggle("is-hidden", !app.authModalOpen || signedIn);
  app.els.forgotPasswordModal.classList.toggle("is-hidden", !app.forgotPasswordOpen || signedIn);
  app.els.resetPasswordModal.classList.toggle("is-hidden", !app.resetPasswordOpen);
  app.els.profileModal.classList.toggle("is-hidden", !app.profileModalOpen || !signedIn);
  app.els.authNameField.classList.toggle("is-hidden", app.authMode !== "register");
  app.els.authForgotPassword.classList.toggle("is-hidden", app.authMode !== "login");
  app.els.authTitle.textContent = app.authMode === "register" ? "建立帳號" : "登入帳號";
  app.els.authModeToggle.textContent = app.authMode === "register" ? "已有帳號，登入" : "建立新帳號";
  app.els.authSubmit.textContent = app.authMode === "register" ? "註冊" : "登入";
  app.els.authSubmit.disabled = app.authBusy;
  app.els.forgotPasswordSubmit.disabled = app.forgotPasswordBusy;
  app.els.forgotPasswordSubmit.textContent = app.forgotPasswordBusy ? "處理中..." : "寄出重設連結";
  app.els.forgotPasswordDevLink.innerHTML = app.forgotPasswordDevUrl
    ? `本機測試連結：<a href="${escapeHtml(app.forgotPasswordDevUrl)}">開啟重設頁</a>`
    : "";
  app.els.resetPasswordSubmit.disabled = app.resetPasswordBusy;
  app.els.resetPasswordSubmit.textContent = app.resetPasswordBusy ? "更新中..." : "更新密碼";
  app.els.profileSubmit.disabled = app.profileBusy;
  app.els.profileSubmit.textContent = app.profileBusy ? "儲存中..." : "儲存資料";
  app.els.adminBootstrapBlock.classList.toggle("is-hidden", !signedIn || isAdmin);
  app.els.adminBootstrapSubmit.disabled = app.adminBootstrapBusy;
  app.els.adminBootstrapSubmit.textContent = app.adminBootstrapBusy ? "啟用中..." : "啟用管理員權限";

  if (signedIn) {
    app.els.authUserName.textContent = isAdmin ? `${app.user.name} · 管理員` : app.user.name;
  }
}

function renderFeedbackModals(app) {
  app.els.feedbackModal.classList.toggle("is-hidden", !app.feedbackModalOpen);
  app.els.feedbackSubmit.disabled = app.feedbackBusy;
  app.els.feedbackSubmit.textContent = app.feedbackBusy ? "送出中..." : "送出回饋";

  app.els.adminFeedbackModal.classList.toggle("is-hidden", !app.adminFeedbackOpen);
  app.els.loadAdminFeedback.disabled = app.adminFeedbackBusy;
  app.els.loadAdminFeedback.textContent = app.adminFeedbackBusy ? "載入中..." : "載入回饋";
  renderAdminFeedback(app);

  app.els.adminDashboardModal.classList.toggle("is-hidden", !app.adminDashboardOpen);
  app.els.refreshAdminDashboard.disabled = app.adminDashboardBusy;
  app.els.refreshAdminDashboard.textContent = app.adminDashboardBusy ? "載入中..." : "刷新";
  app.els.adminUserSearch.value = app.adminUserSearch || "";
  renderAdminDashboard(app);

  app.els.reportModal.classList.toggle("is-hidden", !app.reportModalOpen);
  app.els.reportSubmit.disabled = app.reportBusy;
  app.els.reportSubmit.textContent = app.reportBusy ? "送出中..." : "送出檢舉";

  app.els.adminModerationModal.classList.toggle("is-hidden", !app.adminModerationOpen);
  app.els.loadAdminModeration.disabled = app.adminModerationBusy;
  app.els.loadAdminModeration.textContent = app.adminModerationBusy ? "載入中..." : "載入檢舉與隱藏內容";
  renderAdminModeration(app);
}

function renderAdminFeedback(app) {
  const summary = app.adminFeedbackSummary;
  app.els.adminFeedbackSummary.innerHTML = summary
    ? `
        <div><span>註冊帳號</span><strong>${escapeHtml(summary.usersCount)}</strong></div>
        <div><span>已同步帳號</span><strong>${escapeHtml(summary.syncedAccountsCount)}</strong></div>
        <div><span>總回饋</span><strong>${escapeHtml(summary.feedbackCount)}</strong></div>
        <div><span>新回饋</span><strong>${escapeHtml(summary.newFeedbackCount)}</strong></div>
      `
    : "";

  app.els.adminFeedbackList.innerHTML =
    app.adminFeedbackRows
      .map(
        (item) => `
          <article class="admin-feedback-item">
            <div class="admin-feedback-head">
              <span>${escapeHtml(feedbackCategoryLabel(item.category))} · ${dateTimeLabel(item.createdAt)}</span>
              <strong>${escapeHtml(item.user?.name || item.contact || "匿名使用者")}</strong>
            </div>
            <p>${escapeHtml(item.body)}</p>
            <dl>
              <div><dt>聯絡</dt><dd>${escapeHtml(item.contact || item.user?.email || "--")}</dd></div>
              <div><dt>頁面</dt><dd>${escapeHtml(item.pagePath || "--")}</dd></div>
              <div><dt>狀態</dt><dd>${escapeHtml(item.status || "new")}</dd></div>
            </dl>
          </article>
        `,
      )
      .join("") ||
    (summary ? `<div class="empty-state admin-feedback-empty">目前還沒有回饋。</div>` : "");
}

function renderAdminDashboard(app) {
  const data = app.adminDashboardData;
  const summary = data?.summary;
  app.els.adminDashboardSummary.innerHTML = summary
    ? `
        <div><span>註冊帳號</span><strong>${escapeHtml(summary.usersCount)}</strong></div>
        <div><span>已同步帳號</span><strong>${escapeHtml(summary.syncedAccountsCount)}</strong></div>
        <div><span>管理員帳號</span><strong>${escapeHtml(summary.adminAccountsCount)}</strong></div>
        <div><span>停權帳號</span><strong>${escapeHtml(summary.suspendedAccountsCount || 0)}</strong></div>
        <div><span>待處理檢舉</span><strong>${escapeHtml(summary.openReportsCount)}</strong></div>
      `
    : "";

  if (!data) {
    app.els.adminUserList.innerHTML = "";
    app.els.adminAuditList.innerHTML = "";
    return;
  }

  const users = filteredAdminUsers(app);
  app.els.adminUserList.innerHTML = users.length
    ? users.map((user) => adminUserRow(app, user)).join("")
    : `<div class="empty-state admin-feedback-empty">沒有符合條件的帳號。</div>`;

  renderAdminAudit(app);
}

function filteredAdminUsers(app) {
  const query = String(app.adminUserSearch || "").trim().toLowerCase();
  const users = app.adminDashboardData?.users || [];
  if (!query) return users;

  return users.filter((user) =>
    `${user.name || ""} ${user.email || ""} ${accountStatusLabel(user.status)} ${user.suspensionReason || ""}`
      .toLowerCase()
      .includes(query),
  );
}

function adminUserRow(app, user) {
  const isAdmin = user.role === "admin";
  const isSuspended = user.status === "suspended";
  const nextRole = isAdmin ? "user" : "admin";
  const nextStatus = isSuspended ? "active" : "suspended";
  const isSelf = String(user.id) === String(app.user?.id);
  const isBusy =
    app.adminDashboardBusy ||
    String(app.adminRoleBusyUserId || "") === String(user.id) ||
    String(app.adminStatusBusyUserId || "") === String(user.id);
  const roleDisabled = isBusy || isSuspended || (isSelf && isAdmin);
  const statusDisabled = isBusy || isSelf;
  const actionLabel = isAdmin ? "撤銷管理員" : "設為管理員";
  const statusActionLabel = isSuspended ? "解除停權" : "停權";
  const reason = isSuspended && user.suspensionReason ? ` · 停權原因：${user.suspensionReason}` : "";
  return `
    <article class="admin-feedback-item admin-user-item ${isAdmin ? "is-admin" : ""} ${isSuspended ? "is-suspended" : ""}">
      <div class="admin-feedback-head">
        <span>${escapeHtml(isAdmin ? "管理員" : "一般帳號")} · ${escapeHtml(accountStatusLabel(user.status))} · ${dateTimeLabel(user.createdAt)}</span>
        <strong>${escapeHtml(user.name || "使用者")}</strong>
      </div>
      <p>${escapeHtml(`${user.email || "--"}${reason}`)}</p>
      <dl>
        <div><dt>總權益</dt><dd>${formatNullableCurrency(user.equity)}</dd></div>
        <div><dt>ROI</dt><dd class="${toneClass(user.roi)}">${formatNullablePercent(user.roi)}</dd></div>
        <div><dt>交易</dt><dd>${amount(user.tradesCount || 0, 0)}</dd></div>
        <div><dt>最後同步</dt><dd>${dateTimeLabel(user.accountUpdatedAt)}</dd></div>
        <div><dt>追蹤者 / 中</dt><dd>${amount(user.followersCount || 0, 0)} / ${amount(user.followingCount || 0, 0)}</dd></div>
        <div><dt>回饋 / 檢舉</dt><dd>${amount(user.feedbackCount || 0, 0)} / ${amount(user.reportsMadeCount || 0, 0)}</dd></div>
      </dl>
      <div class="moderation-actions">
        <button
          class="tiny-action"
          type="button"
          data-admin-role-user="${escapeHtml(user.id)}"
          data-admin-role="${escapeHtml(nextRole)}"
          ${roleDisabled ? "disabled" : ""}
        >
          ${escapeHtml(isSelf && isAdmin ? "目前帳號" : actionLabel)}
        </button>
        <button
          class="tiny-action ${isSuspended ? "" : "is-danger"}"
          type="button"
          data-admin-status-user="${escapeHtml(user.id)}"
          data-admin-status="${escapeHtml(nextStatus)}"
          ${statusDisabled ? "disabled" : ""}
        >
          ${escapeHtml(isSelf ? "目前帳號" : statusActionLabel)}
        </button>
      </div>
    </article>
  `;
}

function renderAdminAudit(app) {
  const logs = app.adminDashboardData?.auditLogs || [];
  app.els.adminAuditList.innerHTML = logs.length
    ? logs.map(adminAuditRow).join("")
    : `<div class="empty-state admin-feedback-empty">目前還沒有管理操作紀錄。</div>`;
}

function adminAuditRow(log) {
  const target = adminAuditTargetLabel(log);
  return `
    <article class="admin-feedback-item admin-audit-item">
      <div class="admin-feedback-head">
        <span>${escapeHtml(adminAuditActionLabel(log.action))} · ${dateTimeLabel(log.createdAt)}</span>
        <strong>${escapeHtml(log.actor?.name || "管理員")}</strong>
      </div>
      <p>${escapeHtml(adminAuditDescription(log))}</p>
      <dl>
        <div><dt>目標</dt><dd>${escapeHtml(target)}</dd></div>
        <div><dt>類型</dt><dd>${escapeHtml(adminAuditTargetTypeLabel(log.targetType))}</dd></div>
        <div><dt>補充</dt><dd>${escapeHtml(adminAuditSupplement(log))}</dd></div>
      </dl>
    </article>
  `;
}

function adminAuditDescription(log) {
  const details = log.details || {};
  const actor = log.actor?.name || "管理員";
  const target = adminAuditTargetLabel(log);

  if (log.action === "admin_role_update") {
    return `${actor} 將 ${target} 從 ${adminRoleLabel(details.fromRole)} 改為 ${adminRoleLabel(details.toRole)}。`;
  }
  if (log.action === "admin_bootstrap") {
    return `${target} 啟用管理員權限。`;
  }
  if (log.action === "user_suspend") {
    return `${actor} 將 ${target} 停權。`;
  }
  if (log.action === "user_unsuspend") {
    return `${actor} 解除 ${target} 的停權。`;
  }
  if (log.action === "hide_trade") {
    return `${actor} 隱藏了交易 ${details.tradeId || log.targetId || "--"}。`;
  }
  if (log.action === "unhide_trade") {
    return `${actor} 解除隱藏交易 ${details.tradeId || log.targetId || "--"}。`;
  }
  if (log.action === "hide_comment") {
    return `${actor} 隱藏了留言 #${details.commentId || log.targetId || "--"}。`;
  }
  if (log.action === "unhide_comment") {
    return `${actor} 解除隱藏留言 #${details.commentId || log.targetId || "--"}。`;
  }
  return `${actor} 更新了 ${target}。`;
}

function adminAuditTargetLabel(log) {
  const details = log.details || {};
  return log.targetUser?.name || details.name || details.email || log.targetId || "--";
}

function adminAuditActionLabel(action) {
  return (
    {
      admin_bootstrap: "啟用管理員",
      admin_role_update: "角色變更",
      user_suspend: "停權帳號",
      user_unsuspend: "解除停權",
      hide_trade: "隱藏交易",
      unhide_trade: "解除隱藏交易",
      hide_comment: "隱藏留言",
      unhide_comment: "解除隱藏留言",
    }[action] || "管理操作"
  );
}

function adminAuditSupplement(log) {
  const details = log.details || {};
  return details.reason || details.email || details.tradeId || details.commentId || "--";
}

function adminAuditTargetTypeLabel(type) {
  return (
    {
      user: "帳號",
      trade: "交易",
      comment: "留言",
    }[type] || "--"
  );
}

function adminRoleLabel(role) {
  return role === "admin" ? "管理員" : "一般帳號";
}

function accountStatusLabel(status) {
  return status === "suspended" ? "已停權" : "正常";
}

function renderAdminModeration(app) {
  const data = app.adminModerationData;
  const summary = data?.summary;
  app.els.adminModerationSummary.innerHTML = summary
    ? `
        <div><span>總檢舉</span><strong>${escapeHtml(summary.reportsCount)}</strong></div>
        <div><span>待處理</span><strong>${escapeHtml(summary.openReportsCount)}</strong></div>
        <div><span>隱藏交易</span><strong>${escapeHtml(summary.hiddenTradesCount)}</strong></div>
        <div><span>隱藏留言</span><strong>${escapeHtml(summary.hiddenCommentsCount)}</strong></div>
      `
    : "";

  if (!data) {
    app.els.adminModerationList.innerHTML = "";
    return;
  }

  app.els.adminModerationList.innerHTML = [
    moderationSection(
      "檢舉紀錄",
      (data.reports || []).map((item) => moderationReportRow(app, item)).join(""),
      "目前沒有檢舉。",
    ),
    moderationSection(
      "已隱藏交易",
      (data.hiddenTrades || []).map((item) => hiddenTradeRow(app, item)).join(""),
      "目前沒有隱藏交易。",
    ),
    moderationSection(
      "已隱藏留言",
      (data.hiddenComments || []).map((item) => hiddenCommentRow(app, item)).join(""),
      "目前沒有隱藏留言。",
    ),
  ].join("");
}

function moderationSection(title, body, emptyText) {
  return `
    <h3 class="moderation-heading">${escapeHtml(title)}</h3>
    ${body || `<div class="empty-state admin-feedback-empty">${escapeHtml(emptyText)}</div>`}
  `;
}

function moderationReportRow(app, item) {
  const isComment = item.targetType === "comment";
  const action = isComment ? "hide-comment" : "hide-trade";
  const actionAttrs = isComment
    ? `data-comment-id="${escapeHtml(item.commentId)}"`
    : `data-owner-id="${escapeHtml(item.ownerId)}" data-trade-id="${escapeHtml(item.tradeId)}"`;
  const actionButton =
    item.status === "open"
      ? `
          <button
            class="tiny-action"
            type="button"
            data-moderation-action="${action}"
            ${actionAttrs}
            ${app.adminModerationBusy ? "disabled" : ""}
          >
            ${isComment ? "隱藏留言" : "隱藏交易"}
          </button>
        `
      : "";
  const targetLabel = isComment ? `留言 #${item.commentId || "--"}` : `交易 ${item.tradeId || "--"}`;
  return `
    <article class="admin-feedback-item moderation-item ${item.status === "open" ? "" : "is-muted"}">
      <div class="admin-feedback-head">
        <span>${escapeHtml(reportReasonLabel(item.reason))} · ${dateTimeLabel(item.createdAt)} · ${escapeHtml(moderationStatusLabel(item.status))}</span>
        <strong>${escapeHtml(targetLabel)}</strong>
      </div>
      <p>${escapeHtml(item.details || item.commentBody || "使用者沒有提供補充說明。")}</p>
      <dl>
        <div><dt>檢舉者</dt><dd>${escapeHtml(item.reporter?.name || "--")}</dd></div>
        <div><dt>內容作者</dt><dd>${escapeHtml(item.commentAuthorName || item.ownerName || "--")}</dd></div>
        <div><dt>擁有者</dt><dd>${escapeHtml(item.ownerName || "--")}</dd></div>
      </dl>
      <div class="moderation-actions">${actionButton}</div>
    </article>
  `;
}

function hiddenTradeRow(app, item) {
  return `
    <article class="admin-feedback-item moderation-item">
      <div class="admin-feedback-head">
        <span>${dateTimeLabel(item.hiddenAt)} · ${escapeHtml(item.reason || "未填原因")}</span>
        <strong>${escapeHtml(item.ownerName || "使用者")} / ${escapeHtml(item.tradeId || "--")}</strong>
      </div>
      <div class="moderation-actions">
        <button
          class="tiny-action"
          type="button"
          data-moderation-action="unhide-trade"
          data-owner-id="${escapeHtml(item.ownerId)}"
          data-trade-id="${escapeHtml(item.tradeId)}"
          ${app.adminModerationBusy ? "disabled" : ""}
        >
          解除隱藏
        </button>
      </div>
    </article>
  `;
}

function hiddenCommentRow(app, item) {
  return `
    <article class="admin-feedback-item moderation-item">
      <div class="admin-feedback-head">
        <span>${dateTimeLabel(item.hiddenAt)} · ${escapeHtml(item.reason || "未填原因")}</span>
        <strong>${escapeHtml(item.authorName || "使用者")} 的留言</strong>
      </div>
      <p>${escapeHtml(item.body || "--")}</p>
      <dl>
        <div><dt>公開頁</dt><dd>${escapeHtml(item.ownerName || "--")}</dd></div>
        <div><dt>交易</dt><dd>${escapeHtml(item.tradeId || "--")}</dd></div>
        <div><dt>留言 ID</dt><dd>${escapeHtml(item.commentId || "--")}</dd></div>
      </dl>
      <div class="moderation-actions">
        <button
          class="tiny-action"
          type="button"
          data-moderation-action="unhide-comment"
          data-comment-id="${escapeHtml(item.commentId)}"
          ${app.adminModerationBusy ? "disabled" : ""}
        >
          解除隱藏
        </button>
      </div>
    </article>
  `;
}

function updateActiveControls(app) {
  document.querySelectorAll("[data-symbol]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.symbol === app.activeSymbol);
  });
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.mode === app.selectedMode);
  });
  document.querySelectorAll("[data-side]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.side === app.selectedSide);
  });
  document.querySelectorAll("[data-timeframe]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.timeframe === app.selectedTimeframe);
  });
  document.querySelectorAll("[data-market-source]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.marketSource === app.marketSource);
  });
}
