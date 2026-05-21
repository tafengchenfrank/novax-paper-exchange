import { learningLessons } from "./learning.js";
import { calculateAccount } from "./portfolio.js";

export function buildAlerts(app) {
  const alerts = [];
  const account = calculateAccount(app);
  const leverage = Number(app.els.leverage.value) || 1;
  const marginRatio = account.equity > 0 ? (account.margin / account.equity) * 100 : 0;
  const unreviewedTrades = app.state.history.filter((trade) => !isReviewed(trade)).length;
  const completedLessons = learningLessons.filter(
    (lesson) => app.state.learningProgress?.[lesson.id]?.completedAt,
  ).length;

  if (app.selectedMode === "perp" && leverage >= 20) {
    alerts.push({
      key: `high-leverage-${leverage >= 30 ? "30" : "20"}`,
      tone: leverage >= 30 ? "danger" : "warn",
      title: "高槓桿預覽",
      body: `${leverage}x 會放大短線波動，先確認倉位大小與強平估算再下單。`,
    });
  }

  if (marginRatio > 70) {
    alerts.push({
      key: "margin-danger",
      tone: "danger",
      title: "保證金壓力偏高",
      body: `目前保證金使用率約 ${marginRatio.toFixed(1)}%，價格反向波動時帳戶緩衝較薄。`,
    });
  } else if (marginRatio > 40) {
    alerts.push({
      key: "margin-warn",
      tone: "warn",
      title: "保證金使用率升高",
      body: `目前保證金使用率約 ${marginRatio.toFixed(1)}%，加倉前先保留可用資金。`,
    });
  }

  if (unreviewedTrades > 0) {
    alerts.push({
      key: `unreviewed-trades-${unreviewedTrades}`,
      tone: "warn",
      title: "交易日誌未完成",
      body: `還有 ${unreviewedTrades} 筆交易尚未檢討，補上策略、情緒與評分會更容易看出問題。`,
    });
  }

  if (app.user && app.syncQueued) {
    alerts.push({
      key: "sync-queued",
      tone: "info",
      title: "進度待儲存",
      body: "剛剛的操作已排入儲存，稍等一下系統會自動寫入雲端模擬進度。",
    });
  } else if (!app.user && (app.state.history.length > 0 || completedLessons > 0)) {
    alerts.push({
      key: "guest-local-progress",
      tone: "info",
      title: "目前只存在本機",
      body: "登入後可以儲存模擬交易、交易日誌與學習進度，換裝置時比較不會遺失。",
    });
  }

  if (completedLessons < learningLessons.length) {
    alerts.push({
      key: `learning-progress-${completedLessons}`,
      tone: "info",
      title: "還有學習任務可完成",
      body: `學習中心目前完成 ${completedLessons}/${learningLessons.length}，可以用練習按鈕把知識接到實際操作。`,
    });
  }

  return alerts;
}

function isReviewed(trade) {
  const journal = trade?.journal || {};
  return Boolean(journal.strategy || journal.emotion || journal.rating || journal.note);
}
