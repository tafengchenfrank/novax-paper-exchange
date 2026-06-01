import { els } from "./dom.js";
import {
  bootstrapAdmin,
  clearToken,
  commentOnPublicTrade,
  followUser,
  getFollowing,
  getFollowingFeed,
  getAdminDashboard,
  getAdminFeedback,
  getAdminModeration,
  getLeaderboard,
  getMe,
  getNotifications,
  getPublicProfile,
  getRemoteAccount,
  getToken,
  loginAccount,
  logoutAccount,
  markNotificationsRead,
  registerAccount,
  requestPasswordReset,
  resetPassword,
  reportContent,
  hideModerationComment,
  hideModerationTrade,
  syncRemoteAccount,
  submitFeedback,
  likePublicTrade,
  unhideModerationComment,
  unhideModerationTrade,
  unfollowUser,
  unlikePublicTrade,
  updateProfile,
  updateAdminUserRole,
} from "./api.js";
import { formatChartPrice } from "./formatters.js";
import { learningLessons } from "./learning.js";
import { createMarketDataStore } from "./market-data.js";
import { currentPrice, seedMarkets, updateMarketPrices } from "./market-sim.js";
import { setFeedStatus, startBinanceFeed, stopBinanceFeed } from "./binance-feed.js";
import { cancelOrder, liquidateIfNeeded, placeOrder, processLimitOrders, resetAccount } from "./orders.js";
import { registerServiceWorker } from "./pwa.js";
import { renderAll, renderTradePanel } from "./render.js";
import { applySnapshot, loadState, saveState } from "./storage.js";

const legalDocuments = {
  terms: {
    title: "使用條款",
    body: `
      <p><strong>最後更新：2026-05-21</strong></p>
      <p>NovaX Paper Exchange 目前為 Beta 測試服務，目的在於提供模擬交易、投資學習與產品體驗。使用本平台即表示你理解並同意以下基本條款。</p>
      <h3>1. 服務性質</h3>
      <p>本平台提供的是模擬交易環境，不提供真實入金、出金、撮合交易、資產保管、代操、投資顧問或任何金融商品銷售服務。</p>
      <h3>2. 帳號與使用責任</h3>
      <p>你需要自行保管帳號登入資料，並確保提供的 email 與個人資料正確。若發現異常使用，平台可暫停或限制帳號功能。</p>
      <h3>3. 公開內容</h3>
      <p>若你將交易日誌設為公開，其他使用者可能看到你的公開交易紀錄、心得、留言與互動。請避免發布個資、攻擊性內容、違法內容或誤導他人的投資承諾。</p>
      <h3>4. 服務變更</h3>
      <p>Beta 期間功能、資料格式、排行榜、社群互動與保存策略可能調整或中斷。平台會盡力維持可用性，但不保證服務永不中斷或資料永不遺失。</p>
      <h3>5. 免責範圍</h3>
      <p>平台資訊僅供教育與模擬用途，不構成投資、法律、稅務或財務建議。任何真實投資決策與風險均由使用者自行承擔。</p>
    `,
  },
  privacy: {
    title: "隱私權政策",
    body: `
      <p><strong>最後更新：2026-05-21</strong></p>
      <p>本政策說明 NovaX Beta 可能收集、使用與保存的資料類型。這是一份產品 Beta 用的基礎版本，正式商業化前應再由專業法務審閱。</p>
      <h3>1. 我們收集的資料</h3>
      <p>平台可能保存你的帳號名稱、email、密碼雜湊、登入 session、密碼重設 token、模擬資產快照、交易紀錄、學習進度、公開交易日誌、按讚、留言、追蹤關係與系統操作紀錄。</p>
      <h3>2. 資料用途</h3>
      <p>資料會用於登入驗證、同步模擬進度、顯示排行榜、提供公開個人頁與追蹤動態、改善產品體驗、排查錯誤與維護服務安全。</p>
      <h3>3. 資料保存與第三方服務</h3>
      <p>正式 Beta 目前部署於 Render，資料庫使用 Neon PostgreSQL，密碼重設信可能透過 Resend 等郵件服務寄送。這些服務可能依其基礎設施處理與保存資料。請不要在平台輸入敏感個資、真實資產資訊或交易所 API 金鑰。</p>
      <h3>4. 資料分享</h3>
      <p>我們不會出售你的個人資料。公開交易日誌、留言、按讚與追蹤行為會依產品設計顯示給其他使用者。</p>
      <h3>5. 使用者選擇</h3>
      <p>你可以不公開交易日誌，也可以登出帳號。若需要修改或刪除帳號資料，請透過平台管理者指定的 Beta 回報管道提出。</p>
      <h3>6. 安全限制</h3>
      <p>平台會採取合理技術措施保護資料，例如密碼雜湊與環境變數保存密鑰；但網路服務無法保證絕對安全。</p>
    `,
  },
  risk: {
    title: "風險聲明",
    body: `
      <p><strong>最後更新：2026-05-21</strong></p>
      <p>NovaX 是模擬交易與投資學習工具。請在使用前理解以下限制。</p>
      <h3>1. 非真實交易</h3>
      <p>平台內的資金、損益、倉位、排行榜與交易紀錄皆為模擬用途，不代表真實資產、真實收益或任何可提領價值。</p>
      <h3>2. 行情資料限制</h3>
      <p>平台可能使用本地模擬行情或第三方公開行情。資料可能延遲、中斷、錯誤或與真實市場成交價格不同，不應作為下單依據。</p>
      <h3>3. 投資風險</h3>
      <p>虛擬資產、股票、衍生品與槓桿交易均可能造成重大虧損。模擬績效不代表真實交易結果，過去績效也不保證未來表現。</p>
      <h3>4. 不構成建議</h3>
      <p>平台上的學習內容、提醒、社群留言與公開交易心得僅供參考，不構成投資建議或買賣推薦。任何真實投資前，請自行研究並評估風險承受能力。</p>
    `,
  },
};

const app = {
  els,
  state: loadState(),
  marketData: {
    sim: createMarketDataStore(),
    binance: createMarketDataStore(),
  },
  binanceFeed: null,
  activeSymbol: "BTCUSDT",
  selectedMode: "perp",
  marketSource: "sim",
  feedStatus: "simulated",
  feedStatusLabel: "模擬行情",
  user: null,
  authMode: "login",
  authModalOpen: false,
  authBusy: false,
  forgotPasswordOpen: false,
  forgotPasswordBusy: false,
  forgotPasswordDevUrl: "",
  resetPasswordOpen: false,
  resetPasswordBusy: false,
  resetPasswordToken: "",
  profileModalOpen: false,
  profileBusy: false,
  adminBootstrapBusy: false,
  legalModalOpen: false,
  activeLegalDoc: "risk",
  feedbackModalOpen: false,
  feedbackBusy: false,
  adminFeedbackOpen: false,
  adminFeedbackBusy: false,
  adminFeedbackRows: [],
  adminFeedbackSummary: null,
  adminDashboardOpen: false,
  adminDashboardBusy: false,
  adminDashboardData: null,
  adminRoleBusyUserId: null,
  adminUserSearch: "",
  reportModalOpen: false,
  reportBusy: false,
  reportTarget: null,
  adminModerationOpen: false,
  adminModerationBusy: false,
  adminModerationData: null,
  publicProfileOpen: false,
  publicProfileBusy: false,
  selectedPublicProfileId: null,
  publicProfile: null,
  publicCommentDrafts: {},
  tradeDetailOpen: false,
  selectedTradeId: null,
  tradeJournalLoadedFor: null,
  leaderboardRows: [],
  followingRows: [],
  feedRows: [],
  feedBusy: false,
  feedMessage: "",
  feedMessageTone: "",
  feedCommentDrafts: {},
  feedSymbol: "all",
  feedSort: "latest",
  feedHighRatingOnly: false,
  notifications: [],
  unreadNotifications: 0,
  notificationsBusy: false,
  lastSyncAt: 0,
  syncQueued: false,
  syncBusy: false,
  selectedSide: "buy",
  selectedTimeframe: "1m",
  mobileNavActive: "trade",
  mobileNavLockedUntil: 0,
  tickCount: 0,
  setOrderMessage(message, tone = "normal") {
    this.els.orderMessage.textContent = message;
    this.els.orderMessage.className = `order-message ${tone}`;
  },
  get activeData() {
    return this.marketData[this.marketSource];
  },
  get candles() {
    return this.activeData.candles;
  },
  get tape() {
    return this.activeData.tape;
  },
  get tickers() {
    return this.activeData.tickers;
  },
  get orderBooks() {
    return this.activeData.orderBooks;
  },
};

app.activeSymbol = app.state.activeSymbol || app.activeSymbol;
app.selectedMode = app.state.selectedMode || app.selectedMode;
app.marketSource = app.state.marketSource || app.marketSource;
app.resetPasswordToken = new URLSearchParams(window.location.search).get("reset_token") || "";
app.resetPasswordOpen = Boolean(app.resetPasswordToken);

registerServiceWorker();
seedMarkets(app, "sim");
app.els.limitPrice.value = formatChartPrice(currentPrice(app));
bindEvents(app);
restoreSession(app);
refreshLeaderboard(app);
if (app.marketSource === "binance") {
  startBinanceFeed(app).then(() => renderAll(app));
} else {
  setFeedStatus(app, "simulated", "模擬行情");
}
renderAll(app);

setInterval(() => {
  if (app.marketSource === "sim") {
    updateMarketPrices(app);
  }
  processLimitOrders(app);
  liquidateIfNeeded(app);
  maybeSyncAccount(app);
  renderAll(app);
}, 1000);

setInterval(() => refreshLeaderboard(app), 15000);
setInterval(() => refreshNotifications(app, { silent: true }), 20000);
setInterval(() => refreshFeed(app, { silent: true }), 20000);

function bindEvents(app) {
  app.els.mobileNavButtons.forEach((button) => {
    button.addEventListener("click", () => handleMobileNav(app, button.dataset.mobileNav));
  });

  document.querySelectorAll("[data-symbol]").forEach((button) => {
    button.addEventListener("click", () => {
      app.activeSymbol = button.dataset.symbol;
      app.els.limitPrice.value = formatChartPrice(currentPrice(app));
      saveState(app);
      queueSync(app);
      renderAll(app);
    });
  });

  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      app.selectedMode = button.dataset.mode;
      saveState(app);
      queueSync(app);
      renderAll(app);
    });
  });

  document.querySelectorAll("[data-side]").forEach((button) => {
    button.addEventListener("click", () => {
      app.selectedSide = button.dataset.side;
      renderAll(app);
    });
  });

  document.querySelectorAll("[data-timeframe]").forEach((button) => {
    button.addEventListener("click", () => {
      app.selectedTimeframe = button.dataset.timeframe;
      renderAll(app);
    });
  });

  document.querySelectorAll("[data-market-source]").forEach((button) => {
    button.addEventListener("click", () => {
      const source = button.dataset.marketSource;
      if (source === app.marketSource) return;

      app.marketSource = source;
      saveState(app);
      queueSync(app);

      if (source === "binance") {
        app.setOrderMessage("正在切換到 Binance 公開行情。");
        startBinanceFeed(app).then(() => renderAll(app));
      } else {
        stopBinanceFeed(app);
        setFeedStatus(app, "simulated", "模擬行情");
        app.setOrderMessage("已切回本地模擬行情。");
      }

      renderAll(app);
    });
  });

  ["input", "change"].forEach((eventName) => {
    [app.els.orderQty, app.els.limitPrice, app.els.leverage, app.els.orderType].forEach((input) => {
      input.addEventListener(eventName, () => renderTradePanel(app));
    });
  });

  app.els.submitOrder.addEventListener("click", () => {
    placeOrder(app);
    queueSync(app);
    renderAll(app);
  });

  app.els.resetAccount.addEventListener("click", () => {
    const learningProgress = app.state.learningProgress || {};
    resetAccount(app);
    app.state.learningProgress = learningProgress;
    saveState(app);
    app.tradeDetailOpen = false;
    app.selectedTradeId = null;
    queueSync(app);
    renderAll(app);
  });

  app.els.ordersTable.addEventListener("click", (event) => {
    const cancelId = event.target?.dataset?.cancel;
    if (!cancelId) return;
    cancelOrder(app, cancelId);
    queueSync(app);
    renderAll(app);
  });
  app.els.alertsList.addEventListener("click", (event) => {
    const dismissButton = event.target?.closest?.("[data-dismiss-alert]");
    if (!dismissButton) return;
    dismissAlert(app, dismissButton.dataset.dismissAlert);
  });
  app.els.markNotificationsRead.addEventListener("click", () => readNotifications(app));
  app.els.notificationList.addEventListener("click", (event) => {
    const profileButton = event.target?.closest?.("[data-notification-profile]");
    if (!profileButton) return;
    openPublicProfile(app, profileButton.dataset.notificationProfile);
  });
  app.els.leaderboard.addEventListener("click", (event) => {
    const profileButton = event.target?.closest?.("[data-public-profile]");
    if (!profileButton) return;
    openPublicProfile(app, profileButton.dataset.publicProfile);
  });
  app.els.followingList.addEventListener("click", (event) => {
    const profileButton = event.target?.closest?.("[data-public-profile]");
    if (!profileButton) return;
    openPublicProfile(app, profileButton.dataset.publicProfile);
  });
  app.els.refreshFeed.addEventListener("click", () => refreshFeed(app));
  app.els.feedSymbol.addEventListener("change", () => {
    app.feedSymbol = app.els.feedSymbol.value;
    renderAll(app);
  });
  app.els.feedSort.addEventListener("change", () => {
    app.feedSort = app.els.feedSort.value;
    renderAll(app);
  });
  app.els.feedHighRatingOnly.addEventListener("change", () => {
    app.feedHighRatingOnly = app.els.feedHighRatingOnly.checked;
    renderAll(app);
  });
  app.els.resetFeedFilters.addEventListener("click", () => {
    app.feedSymbol = "all";
    app.feedSort = "latest";
    app.feedHighRatingOnly = false;
    renderAll(app);
  });
  app.els.feedList.addEventListener("input", (event) => {
    const input = event.target?.closest?.("[data-feed-comment-input]");
    if (!input) return;
    app.feedCommentDrafts[input.dataset.feedCommentInput] = input.value;
  });
  app.els.feedList.addEventListener("click", (event) => {
    const profileButton = event.target?.closest?.("[data-feed-profile]");
    const likeButton = event.target?.closest?.("[data-feed-like]");
    const commentButton = event.target?.closest?.("[data-feed-post-comment]");
    const reportTradeButton = event.target?.closest?.("[data-feed-report-trade]");
    const reportCommentButton = event.target?.closest?.("[data-feed-report-comment]");
    if (profileButton) {
      openPublicProfile(app, profileButton.dataset.feedProfile);
      return;
    }
    if (reportTradeButton) {
      openReportModal(app, {
        targetType: "trade",
        ownerId: reportTradeButton.dataset.reportOwner,
        tradeId: reportTradeButton.dataset.feedReportTrade,
      });
      return;
    }
    if (reportCommentButton) {
      openReportModal(app, {
        targetType: "comment",
        ownerId: reportCommentButton.dataset.reportOwner,
        tradeId: reportCommentButton.dataset.reportTrade,
        commentId: reportCommentButton.dataset.feedReportComment,
      });
      return;
    }
    if (likeButton) {
      toggleFeedTradeLike(app, likeButton.dataset.feedLike);
      return;
    }
    if (commentButton) {
      submitFeedTradeComment(app, commentButton.dataset.feedPostComment);
    }
  });
  app.els.historyList.addEventListener("click", (event) => {
    const detailButton = event.target?.closest?.("[data-trade-detail]");
    if (!detailButton) return;
    app.selectedTradeId = detailButton.dataset.tradeDetail;
    app.tradeDetailOpen = true;
    app.tradeJournalLoadedFor = null;
    renderAll(app);
  });
  app.els.learningList.addEventListener("click", (event) => {
    const practiceButton = event.target?.closest?.("[data-learning-practice]");
    const completeButton = event.target?.closest?.("[data-learning-complete]");
    if (practiceButton) {
      practiceLearningLesson(app, practiceButton.dataset.learningPractice);
      return;
    }
    if (completeButton) {
      completeLearningLesson(app, completeButton.dataset.learningComplete);
    }
  });
  app.els.onboardingList.addEventListener("click", (event) => {
    const actionButton = event.target?.closest?.("[data-onboarding-action]");
    if (!actionButton) return;
    handleOnboardingAction(app, actionButton.dataset.onboardingAction);
  });

  app.els.openAuth.addEventListener("click", () => {
    app.authMode = "login";
    app.authModalOpen = true;
    setAuthMessage(app, "");
    renderAll(app);
    app.els.authEmail.focus();
  });
  app.els.closeAuth.addEventListener("click", () => closeAuthModal(app));
  app.els.authModal.addEventListener("click", (event) => {
    if (event.target?.dataset?.authClose !== undefined) {
      closeAuthModal(app);
    }
  });
  app.els.authModeToggle.addEventListener("click", () => {
    app.authMode = app.authMode === "register" ? "login" : "register";
    setAuthMessage(app, "");
    renderAll(app);
  });
  app.els.authForgotPassword.addEventListener("click", () => openForgotPasswordModal(app));
  app.els.authSubmit.addEventListener("click", () => submitAuth(app));
  [app.els.authName, app.els.authEmail, app.els.authPassword].forEach((input) => {
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        submitAuth(app);
      }
    });
  });
  app.els.closeForgotPassword.addEventListener("click", () => closeForgotPasswordModal(app));
  app.els.forgotPasswordModal.addEventListener("click", (event) => {
    if (event.target?.dataset?.forgotPasswordClose !== undefined) {
      closeForgotPasswordModal(app);
    }
  });
  app.els.forgotPasswordSubmit.addEventListener("click", () => submitForgotPassword(app));
  app.els.forgotPasswordEmail.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      submitForgotPassword(app);
    }
  });
  app.els.closeResetPassword.addEventListener("click", () => closeResetPasswordModal(app));
  app.els.resetPasswordModal.addEventListener("click", (event) => {
    if (event.target?.dataset?.resetPasswordClose !== undefined) {
      closeResetPasswordModal(app);
    }
  });
  app.els.resetPasswordSubmit.addEventListener("click", () => submitResetPassword(app));
  [app.els.resetPasswordNew, app.els.resetPasswordConfirm].forEach((input) => {
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        submitResetPassword(app);
      }
    });
  });
  app.els.openProfile.addEventListener("click", () => openProfileModal(app));
  app.els.openAdminDashboard.addEventListener("click", () => openAdminDashboardModal(app));
  app.els.closeProfile.addEventListener("click", () => closeProfileModal(app));
  app.els.profileModal.addEventListener("click", (event) => {
    if (event.target?.dataset?.profileClose !== undefined) {
      closeProfileModal(app);
    }
  });
  app.els.closePublicProfile.addEventListener("click", () => closePublicProfileModal(app));
  app.els.publicProfileModal.addEventListener("click", (event) => {
    if (event.target?.dataset?.publicProfileClose !== undefined) {
      closePublicProfileModal(app);
    }
  });
  app.els.followProfile.addEventListener("click", () => toggleFollow(app));
  app.els.publicProfileTrades.addEventListener("input", (event) => {
    const input = event.target?.closest?.("[data-comment-input]");
    if (!input) return;
    app.publicCommentDrafts[input.dataset.commentInput] = input.value;
  });
  app.els.publicProfileTrades.addEventListener("click", (event) => {
    const likeButton = event.target?.closest?.("[data-like-trade]");
    const commentButton = event.target?.closest?.("[data-post-comment]");
    const reportTradeButton = event.target?.closest?.("[data-report-trade]");
    const reportCommentButton = event.target?.closest?.("[data-report-comment]");
    if (reportTradeButton) {
      openReportModal(app, {
        targetType: "trade",
        ownerId: app.publicProfile?.id,
        tradeId: reportTradeButton.dataset.reportTrade,
      });
      return;
    }
    if (reportCommentButton) {
      openReportModal(app, {
        targetType: "comment",
        ownerId: app.publicProfile?.id,
        tradeId: reportCommentButton.dataset.reportTrade,
        commentId: reportCommentButton.dataset.reportComment,
      });
      return;
    }
    if (likeButton) {
      togglePublicTradeLike(app, likeButton.dataset.likeTrade);
      return;
    }
    if (commentButton) {
      submitPublicTradeComment(app, commentButton.dataset.postComment);
    }
  });
  app.els.profileSubmit.addEventListener("click", () => submitProfile(app));
  app.els.adminBootstrapSubmit.addEventListener("click", () => submitAdminBootstrap(app));
  app.els.adminBootstrapToken.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      submitAdminBootstrap(app);
    }
  });
  [
    app.els.profileName,
    app.els.profileEmail,
    app.els.profileCurrentPassword,
    app.els.profileNewPassword,
  ].forEach((input) => {
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        submitProfile(app);
      }
    });
  });
  app.els.closeTradeDetail.addEventListener("click", () => closeTradeDetailModal(app));
  app.els.tradeDetailModal.addEventListener("click", (event) => {
    if (event.target?.dataset?.tradeDetailClose !== undefined) {
      closeTradeDetailModal(app);
    }
  });
  app.els.saveTradeJournal.addEventListener("click", () => saveTradeJournal(app));
  app.els.syncAccount.addEventListener("click", () => syncNow(app));
  app.els.logoutAccount.addEventListener("click", () => logout(app));
  app.els.legalDocButtons.forEach((button) => {
    button.addEventListener("click", () => openLegalModal(app, button.dataset.legalDoc));
  });
  app.els.closeLegal.addEventListener("click", () => closeLegalModal(app));
  app.els.legalModal.addEventListener("click", (event) => {
    if (event.target?.dataset?.legalClose !== undefined) {
      closeLegalModal(app);
    }
  });
  app.els.feedbackOpenButtons.forEach((button) => {
    button.addEventListener("click", () => openFeedbackModal(app));
  });
  app.els.closeFeedback.addEventListener("click", () => closeFeedbackModal(app));
  app.els.feedbackModal.addEventListener("click", (event) => {
    if (event.target?.dataset?.feedbackClose !== undefined) {
      closeFeedbackModal(app);
    }
  });
  app.els.feedbackSubmit.addEventListener("click", () => submitFeedbackForm(app));
  app.els.feedbackBody.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      submitFeedbackForm(app);
    }
  });
  app.els.adminFeedbackOpenButtons.forEach((button) => {
    button.addEventListener("click", () => openAdminFeedbackModal(app));
  });
  app.els.closeAdminFeedback.addEventListener("click", () => closeAdminFeedbackModal(app));
  app.els.adminFeedbackModal.addEventListener("click", (event) => {
    if (event.target?.dataset?.adminFeedbackClose !== undefined) {
      closeAdminFeedbackModal(app);
    }
  });
  app.els.loadAdminFeedback.addEventListener("click", () => loadAdminFeedback(app));
  app.els.adminFeedbackToken.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      loadAdminFeedback(app);
    }
  });
  app.els.closeAdminDashboard.addEventListener("click", () => closeAdminDashboardModal(app));
  app.els.adminDashboardModal.addEventListener("click", (event) => {
    if (event.target?.dataset?.adminDashboardClose !== undefined) {
      closeAdminDashboardModal(app);
    }
  });
  app.els.refreshAdminDashboard.addEventListener("click", () => loadAdminDashboard(app));
  app.els.adminUserSearch.addEventListener("input", () => {
    app.adminUserSearch = app.els.adminUserSearch.value;
    renderAll(app);
  });
  app.els.adminUserList.addEventListener("click", (event) => {
    const button = event.target?.closest?.("[data-admin-role-user]");
    if (!button) return;
    updateAdminRoleFromDashboard(app, button.dataset.adminRoleUser, button.dataset.adminRole);
  });
  app.els.closeReport.addEventListener("click", () => closeReportModal(app));
  app.els.reportModal.addEventListener("click", (event) => {
    if (event.target?.dataset?.reportClose !== undefined) {
      closeReportModal(app);
    }
  });
  app.els.reportSubmit.addEventListener("click", () => submitReportForm(app));
  app.els.adminModerationOpenButtons.forEach((button) => {
    button.addEventListener("click", () => openAdminModerationModal(app));
  });
  app.els.closeAdminModeration.addEventListener("click", () => closeAdminModerationModal(app));
  app.els.adminModerationModal.addEventListener("click", (event) => {
    if (event.target?.dataset?.adminModerationClose !== undefined) {
      closeAdminModerationModal(app);
    }
  });
  app.els.loadAdminModeration.addEventListener("click", () => loadAdminModeration(app));
  app.els.adminModerationToken.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      loadAdminModeration(app);
    }
  });
  app.els.adminModerationList.addEventListener("click", (event) => {
    const action = event.target?.closest?.("[data-moderation-action]");
    if (!action) return;
    handleModerationAction(app, action.dataset.moderationAction, action.dataset);
  });
  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (app.tradeDetailOpen) {
      closeTradeDetailModal(app);
    } else if (app.publicProfileOpen) {
      closePublicProfileModal(app);
    } else if (app.profileModalOpen) {
      closeProfileModal(app);
    } else if (app.authModalOpen) {
      closeAuthModal(app);
    } else if (app.forgotPasswordOpen) {
      closeForgotPasswordModal(app);
    } else if (app.resetPasswordOpen) {
      closeResetPasswordModal(app);
    } else if (app.legalModalOpen) {
      closeLegalModal(app);
    } else if (app.feedbackModalOpen) {
      closeFeedbackModal(app);
    } else if (app.adminFeedbackOpen) {
      closeAdminFeedbackModal(app);
    } else if (app.adminDashboardOpen) {
      closeAdminDashboardModal(app);
    } else if (app.reportModalOpen) {
      closeReportModal(app);
    } else if (app.adminModerationOpen) {
      closeAdminModerationModal(app);
    }
  });
  window.addEventListener("resize", () => renderAll(app));
  window.addEventListener("scroll", () => updateMobileNavFromScroll(app), { passive: true });
}

async function restoreSession(app) {
  if (!getToken()) return;

  try {
    const { user } = await getMe();
    app.user = user;
    setAuthMessage(app, `已登入：${user.name}`, "ok");
    await restoreRemoteSnapshot(app);
    await syncNow(app, { silent: true });
    await refreshFollowing(app);
    await refreshFeed(app, { silent: true });
    await refreshNotifications(app, { silent: true });
  } catch {
    clearToken();
    app.user = null;
  } finally {
    renderAll(app);
  }
}

async function submitAuth(app) {
  if (app.authBusy) return;

  app.authBusy = true;
  setAuthMessage(app, app.authMode === "register" ? "建立帳號中..." : "登入中...");

  try {
    const payload = {
      name: app.els.authName.value.trim(),
      email: app.els.authEmail.value.trim(),
      password: app.els.authPassword.value,
    };
    const result =
      app.authMode === "register" ? await registerAccount(payload) : await loginAccount(payload);
    app.user = result.user;
    app.authModalOpen = false;
    app.els.authPassword.value = "";
    setAuthMessage(app, `歡迎，${result.user.name}`, "ok");
    await restoreRemoteSnapshot(app);
    await syncNow(app, { silent: true });
    await refreshLeaderboard(app);
    await refreshFollowing(app);
    await refreshFeed(app, { silent: true });
    await refreshNotifications(app, { silent: true });
  } catch (error) {
    setAuthMessage(app, error.message, "error");
  } finally {
    app.authBusy = false;
    renderAll(app);
  }
}

function openForgotPasswordModal(app) {
  app.authModalOpen = false;
  app.forgotPasswordOpen = true;
  app.forgotPasswordDevUrl = "";
  app.els.forgotPasswordEmail.value = app.els.authEmail.value.trim();
  setForgotPasswordMessage(app, "");
  renderAll(app);
  app.els.forgotPasswordEmail.focus();
}

function closeForgotPasswordModal(app) {
  app.forgotPasswordOpen = false;
  app.forgotPasswordDevUrl = "";
  setForgotPasswordMessage(app, "");
  renderAll(app);
}

async function submitForgotPassword(app) {
  if (app.forgotPasswordBusy) return;

  const email = app.els.forgotPasswordEmail.value.trim();
  if (!email.includes("@")) {
    setForgotPasswordMessage(app, "請輸入有效 email。", "error");
    return;
  }

  app.forgotPasswordBusy = true;
  app.forgotPasswordDevUrl = "";
  setForgotPasswordMessage(app, "正在處理重設申請...");
  renderAll(app);

  try {
    const result = await requestPasswordReset(email);
    app.forgotPasswordDevUrl = result.devResetUrl || "";
    setForgotPasswordMessage(
      app,
      result.devResetUrl ? "本機測試重設連結已建立。" : result.message,
      result.emailEnabled || result.devResetUrl ? "ok" : "error",
    );
  } catch (error) {
    setForgotPasswordMessage(app, error.message, "error");
  } finally {
    app.forgotPasswordBusy = false;
    renderAll(app);
  }
}

function closeResetPasswordModal(app) {
  app.resetPasswordOpen = false;
  app.resetPasswordToken = "";
  app.els.resetPasswordNew.value = "";
  app.els.resetPasswordConfirm.value = "";
  setResetPasswordMessage(app, "");
  clearResetTokenFromUrl();
  renderAll(app);
}

async function submitResetPassword(app) {
  if (app.resetPasswordBusy) return;

  const password = app.els.resetPasswordNew.value;
  const confirm = app.els.resetPasswordConfirm.value;
  if (!app.resetPasswordToken) {
    setResetPasswordMessage(app, "重設連結不完整，請重新申請。", "error");
    return;
  }
  if (password.length < 8) {
    setResetPasswordMessage(app, "新密碼至少 8 碼。", "error");
    return;
  }
  if (password !== confirm) {
    setResetPasswordMessage(app, "兩次輸入的新密碼不一致。", "error");
    return;
  }

  app.resetPasswordBusy = true;
  setResetPasswordMessage(app, "正在更新密碼...");
  renderAll(app);

  try {
    const result = await resetPassword({ token: app.resetPasswordToken, password });
    app.user = result.user;
    app.resetPasswordOpen = false;
    app.resetPasswordToken = "";
    app.els.resetPasswordNew.value = "";
    app.els.resetPasswordConfirm.value = "";
    clearResetTokenFromUrl();
    setAuthMessage(app, "密碼已更新，已為你登入。", "ok");
    await restoreRemoteSnapshot(app);
    await refreshLeaderboard(app);
    await refreshFollowing(app);
    await refreshFeed(app, { silent: true });
    await refreshNotifications(app, { silent: true });
  } catch (error) {
    setResetPasswordMessage(app, error.message, "error");
  } finally {
    app.resetPasswordBusy = false;
    renderAll(app);
  }
}

function clearResetTokenFromUrl() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("reset_token")) return;
  url.searchParams.delete("reset_token");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function openProfileModal(app) {
  if (!app.user) return;

  app.profileModalOpen = true;
  app.els.profileName.value = app.user.name || "";
  app.els.profileEmail.value = app.user.email || "";
  app.els.profileCurrentPassword.value = "";
  app.els.profileNewPassword.value = "";
  app.els.adminBootstrapToken.value = "";
  setProfileMessage(app, "");
  renderAll(app);
  app.els.profileName.focus();
}

async function submitProfile(app) {
  if (!app.user || app.profileBusy) return;

  const newPassword = app.els.profileNewPassword.value;
  const currentPassword = app.els.profileCurrentPassword.value;
  if (newPassword && !currentPassword) {
    setProfileMessage(app, "更改密碼需要輸入目前密碼。", "error");
    return;
  }

  app.profileBusy = true;
  setProfileMessage(app, "儲存中...");

  try {
    const { user } = await updateProfile({
      name: app.els.profileName.value.trim(),
      email: app.els.profileEmail.value.trim(),
      currentPassword,
      newPassword,
    });
    app.user = user;
    app.els.profileCurrentPassword.value = "";
    app.els.profileNewPassword.value = "";
    setProfileMessage(app, "基本資料已更新。", "ok");
    await refreshLeaderboard(app);
  } catch (error) {
    setProfileMessage(app, error.message, "error");
  } finally {
    app.profileBusy = false;
    renderAll(app);
  }
}

async function submitAdminBootstrap(app) {
  if (!app.user || app.adminBootstrapBusy) return;

  const adminToken = app.els.adminBootstrapToken.value.trim();
  if (!adminToken) {
    setProfileMessage(app, "請輸入 Admin Token。", "error");
    return;
  }

  app.adminBootstrapBusy = true;
  setProfileMessage(app, "啟用管理員權限中...");
  renderAll(app);

  try {
    const { user } = await bootstrapAdmin(adminToken);
    app.user = user;
    app.els.adminBootstrapToken.value = "";
    setProfileMessage(app, "管理員權限已啟用。", "ok");
  } catch (error) {
    setProfileMessage(app, error.message, "error");
  } finally {
    app.adminBootstrapBusy = false;
    renderAll(app);
  }
}

async function restoreRemoteSnapshot(app) {
  const { account } = await getRemoteAccount();
  if (!account?.snapshot) return;

  applySnapshot(app, account.snapshot);
  if (app.marketSource === "binance") {
    startBinanceFeed(app).then(() => renderAll(app));
  } else {
    stopBinanceFeed(app);
    setFeedStatus(app, "simulated", "模擬行情");
  }
  app.els.limitPrice.value = formatChartPrice(currentPrice(app));
  setAuthMessage(app, "已載入雲端模擬進度。", "ok");
}

async function syncNow(app, options = {}) {
  if (!app.user || app.syncBusy) return;

  app.syncBusy = true;
  try {
    await syncRemoteAccount(app);
    app.lastSyncAt = Date.now();
    app.syncQueued = false;
    if (!options.silent) {
      setAuthMessage(app, "進度已儲存。", "ok");
    }
    await refreshLeaderboard(app);
  } catch (error) {
    if (!options.silent) {
      setAuthMessage(app, error.message, "error");
    }
  } finally {
    app.syncBusy = false;
    renderAll(app);
  }
}

function queueSync(app) {
  app.syncQueued = true;
}

function maybeSyncAccount(app) {
  if (!app.user) return;
  const due = Date.now() - app.lastSyncAt > 5000;
  if (app.syncQueued && due) {
    syncNow(app, { silent: true });
  }
}

async function refreshLeaderboard(app) {
  try {
    const { rows } = await getLeaderboard();
    app.leaderboardRows = rows || [];
  } catch {
    app.leaderboardRows = [];
  } finally {
    renderAll(app);
  }
}

async function refreshFollowing(app) {
  if (!app.user) {
    app.followingRows = [];
    renderAll(app);
    return;
  }

  try {
    const { rows } = await getFollowing();
    app.followingRows = rows || [];
  } catch {
    app.followingRows = [];
  } finally {
    renderAll(app);
  }
}

async function refreshFeed(app, options = {}) {
  if (!app.user) {
    app.feedRows = [];
    app.feedBusy = false;
    if (!options.silent) renderAll(app);
    return;
  }
  if (app.feedBusy && options.silent && !options.force) return;

  app.feedBusy = true;
  if (!options.silent) {
    setFeedMessage(app, "正在更新追蹤動態...");
    renderAll(app);
  }

  try {
    const { rows } = await getFollowingFeed();
    app.feedRows = rows || [];
    if (!options.silent) setFeedMessage(app, "追蹤動態已更新。", "ok");
  } catch (error) {
    app.feedRows = [];
    if (!options.silent) setFeedMessage(app, error.message, "error");
  } finally {
    app.feedBusy = false;
    renderAll(app);
  }
}

async function refreshNotifications(app, options = {}) {
  if (!app.user) {
    app.notifications = [];
    app.unreadNotifications = 0;
    if (!options.silent) renderAll(app);
    return;
  }

  try {
    const { rows, unreadCount } = await getNotifications();
    app.notifications = rows || [];
    app.unreadNotifications = unreadCount || 0;
  } catch {
    app.notifications = [];
    app.unreadNotifications = 0;
  } finally {
    renderAll(app);
  }
}

async function readNotifications(app) {
  if (!app.user || app.notificationsBusy) return;

  app.notificationsBusy = true;
  renderAll(app);
  try {
    const { rows, unreadCount } = await markNotificationsRead();
    app.notifications = rows || [];
    app.unreadNotifications = unreadCount || 0;
  } catch (error) {
    setAuthMessage(app, error.message, "error");
  } finally {
    app.notificationsBusy = false;
    renderAll(app);
  }
}

async function logout(app) {
  await logoutAccount();
  app.user = null;
  app.authMode = "login";
  app.authModalOpen = false;
  app.profileModalOpen = false;
  app.publicProfileOpen = false;
  app.publicProfile = null;
  app.selectedPublicProfileId = null;
  app.publicCommentDrafts = {};
  app.adminFeedbackOpen = false;
  app.adminFeedbackRows = [];
  app.adminFeedbackSummary = null;
  app.adminDashboardOpen = false;
  app.adminDashboardData = null;
  app.adminRoleBusyUserId = null;
  app.adminUserSearch = "";
  app.adminModerationOpen = false;
  app.adminModerationData = null;
  app.feedRows = [];
  app.feedBusy = false;
  app.feedMessage = "";
  app.feedMessageTone = "";
  app.feedCommentDrafts = {};
  app.tradeDetailOpen = false;
  app.selectedTradeId = null;
  app.tradeJournalLoadedFor = null;
  app.followingRows = [];
  app.notifications = [];
  app.unreadNotifications = 0;
  setAuthMessage(app, "已登出。");
  renderAll(app);
}

function closeAuthModal(app) {
  app.authModalOpen = false;
  renderAll(app);
}

function openLegalModal(app, doc) {
  app.activeLegalDoc = legalDocuments[doc] ? doc : "risk";
  app.legalModalOpen = true;
  app.els.legalTitle.textContent = legalDocuments[app.activeLegalDoc].title;
  app.els.legalBody.innerHTML = legalDocuments[app.activeLegalDoc].body;
  app.els.legalModal.classList.remove("is-hidden");
  renderAll(app);
  app.els.closeLegal.focus();
}

function closeLegalModal(app) {
  app.legalModalOpen = false;
  app.els.legalModal.classList.add("is-hidden");
  renderAll(app);
}

function openFeedbackModal(app) {
  app.feedbackModalOpen = true;
  app.els.feedbackContact.value = app.user?.email || app.els.feedbackContact.value || "";
  setFeedbackMessage(app, "");
  renderAll(app);
  app.els.feedbackBody.focus();
}

function closeFeedbackModal(app) {
  app.feedbackModalOpen = false;
  setFeedbackMessage(app, "");
  renderAll(app);
}

async function submitFeedbackForm(app) {
  if (app.feedbackBusy) return;

  const body = app.els.feedbackBody.value.trim();
  if (body.length < 8) {
    setFeedbackMessage(app, "請輸入至少 8 個字的回饋內容。", "error");
    return;
  }

  app.feedbackBusy = true;
  setFeedbackMessage(app, "送出中...");
  renderAll(app);

  try {
    await submitFeedback({
      category: app.els.feedbackCategory.value,
      body,
      contact: app.els.feedbackContact.value.trim(),
      pagePath: window.location.pathname + window.location.hash,
    });
    app.els.feedbackBody.value = "";
    setFeedbackMessage(app, "謝謝，你的回饋已送出。", "ok");
  } catch (error) {
    setFeedbackMessage(app, error.message, "error");
  } finally {
    app.feedbackBusy = false;
    renderAll(app);
  }
}

function openAdminFeedbackModal(app) {
  app.adminFeedbackOpen = true;
  app.els.adminFeedbackToken.value = sessionStorage.getItem("novax-admin-token") || "";
  setAdminFeedbackMessage(app, "");
  renderAll(app);
  if (isAdminUser(app) && !app.els.adminFeedbackToken.value) {
    loadAdminFeedback(app);
  } else {
    app.els.adminFeedbackToken.focus();
  }
}

function closeAdminFeedbackModal(app) {
  app.adminFeedbackOpen = false;
  setAdminFeedbackMessage(app, "");
  renderAll(app);
}

async function loadAdminFeedback(app) {
  if (app.adminFeedbackBusy) return;

  const token = app.els.adminFeedbackToken.value.trim();
  if (!token && !isAdminUser(app)) {
    setAdminFeedbackMessage(app, "請輸入 Admin Token，或使用管理員帳號登入。", "error");
    return;
  }

  app.adminFeedbackBusy = true;
  setAdminFeedbackMessage(app, "載入中...");
  renderAll(app);

  try {
    const data = await getAdminFeedback(token);
    if (token) sessionStorage.setItem("novax-admin-token", token);
    app.adminFeedbackSummary = data.summary;
    app.adminFeedbackRows = data.rows || [];
    setAdminFeedbackMessage(app, `已載入 ${app.adminFeedbackRows.length} 則最新回饋。`, "ok");
  } catch (error) {
    setAdminFeedbackMessage(app, error.message, "error");
  } finally {
    app.adminFeedbackBusy = false;
    renderAll(app);
  }
}

function openAdminDashboardModal(app) {
  if (!isAdminUser(app)) {
    setAuthMessage(app, "這個帳號沒有後臺權限。", "error");
    renderAll(app);
    return;
  }

  app.adminDashboardOpen = true;
  setAdminDashboardMessage(app, "");
  renderAll(app);
  if (!app.adminDashboardData) {
    loadAdminDashboard(app);
  } else {
    app.els.adminUserSearch.focus();
  }
}

function closeAdminDashboardModal(app) {
  app.adminDashboardOpen = false;
  setAdminDashboardMessage(app, "");
  renderAll(app);
}

async function loadAdminDashboard(app) {
  if (app.adminDashboardBusy) return;

  app.adminDashboardBusy = true;
  setAdminDashboardMessage(app, "載入後臺資料中...");
  renderAll(app);

  try {
    app.adminDashboardData = await getAdminDashboard();
    setAdminDashboardMessage(app, `已載入 ${app.adminDashboardData.users?.length || 0} 個帳號。`, "ok");
  } catch (error) {
    setAdminDashboardMessage(app, error.message, "error");
  } finally {
    app.adminDashboardBusy = false;
    renderAll(app);
  }
}

async function updateAdminRoleFromDashboard(app, userId, role) {
  if (app.adminDashboardBusy || app.adminRoleBusyUserId || !userId || !["admin", "user"].includes(role)) return;

  if (String(app.user?.id) === String(userId) && role === "user") {
    setAdminDashboardMessage(app, "不能撤銷自己的管理員權限。", "error");
    return;
  }

  app.adminDashboardBusy = true;
  app.adminRoleBusyUserId = String(userId);
  setAdminDashboardMessage(app, role === "admin" ? "正在設為管理員..." : "正在撤銷管理員...");
  renderAll(app);

  try {
    await updateAdminUserRole(userId, role);
    app.adminDashboardData = await getAdminDashboard();
    setAdminDashboardMessage(app, "管理員權限已更新。", "ok");
  } catch (error) {
    setAdminDashboardMessage(app, error.message, "error");
  } finally {
    app.adminDashboardBusy = false;
    app.adminRoleBusyUserId = null;
    renderAll(app);
  }
}

function openReportModal(app, target) {
  if (!app.user) {
    app.authMode = "login";
    app.authModalOpen = true;
    setAuthMessage(app, "登入後才能檢舉內容。", "error");
    renderAll(app);
    app.els.authEmail.focus();
    return;
  }

  app.reportTarget = target;
  app.reportModalOpen = true;
  app.els.reportReason.value = "spam";
  app.els.reportDetails.value = "";
  setReportMessage(app, "");
  renderAll(app);
  app.els.reportReason.focus();
}

function closeReportModal(app) {
  app.reportModalOpen = false;
  app.reportTarget = null;
  setReportMessage(app, "");
  renderAll(app);
}

async function submitReportForm(app) {
  if (app.reportBusy || !app.reportTarget) return;

  app.reportBusy = true;
  setReportMessage(app, "送出檢舉中...");
  renderAll(app);

  try {
    await reportContent({
      ...app.reportTarget,
      reason: app.els.reportReason.value,
      details: app.els.reportDetails.value.trim(),
    });
    setReportMessage(app, "檢舉已送出，管理者會查看。", "ok");
  } catch (error) {
    setReportMessage(app, error.message, "error");
  } finally {
    app.reportBusy = false;
    renderAll(app);
  }
}

function openAdminModerationModal(app) {
  app.adminModerationOpen = true;
  app.els.adminModerationToken.value = sessionStorage.getItem("novax-admin-token") || "";
  setAdminModerationMessage(app, "");
  renderAll(app);
  if (isAdminUser(app) && !app.els.adminModerationToken.value) {
    loadAdminModeration(app);
  } else {
    app.els.adminModerationToken.focus();
  }
}

function closeAdminModerationModal(app) {
  app.adminModerationOpen = false;
  setAdminModerationMessage(app, "");
  renderAll(app);
}

async function loadAdminModeration(app) {
  if (app.adminModerationBusy) return;

  const token = app.els.adminModerationToken.value.trim();
  if (!token && !isAdminUser(app)) {
    setAdminModerationMessage(app, "請輸入 Admin Token，或使用管理員帳號登入。", "error");
    return;
  }

  app.adminModerationBusy = true;
  setAdminModerationMessage(app, "載入中...");
  renderAll(app);

  try {
    app.adminModerationData = await getAdminModeration(token);
    if (token) sessionStorage.setItem("novax-admin-token", token);
    setAdminModerationMessage(app, "內容管理資料已更新。", "ok");
  } catch (error) {
    setAdminModerationMessage(app, error.message, "error");
  } finally {
    app.adminModerationBusy = false;
    renderAll(app);
  }
}

async function handleModerationAction(app, action, dataset) {
  const token = app.els.adminModerationToken.value.trim();
  if ((!token && !isAdminUser(app)) || app.adminModerationBusy) return;

  const reason =
    action.startsWith("hide")
      ? window.prompt("請輸入隱藏原因", "違反社群規範") || "違反社群規範"
      : "";
  app.adminModerationBusy = true;
  setAdminModerationMessage(app, "處理中...");
  renderAll(app);

  try {
    if (action === "hide-trade") {
      await hideModerationTrade(token, {
        ownerId: dataset.ownerId,
        tradeId: dataset.tradeId,
        reason,
      });
    } else if (action === "unhide-trade") {
      await unhideModerationTrade(token, {
        ownerId: dataset.ownerId,
        tradeId: dataset.tradeId,
      });
    } else if (action === "hide-comment") {
      await hideModerationComment(token, {
        commentId: dataset.commentId,
        reason,
      });
    } else if (action === "unhide-comment") {
      await unhideModerationComment(token, {
        commentId: dataset.commentId,
      });
    }

    app.adminModerationData = await getAdminModeration(token);
    if (app.adminDashboardData && isAdminUser(app)) {
      app.adminDashboardData = await getAdminDashboard();
    }
    await refreshFeed(app, { silent: true, force: true });
    if (app.publicProfileOpen) await refreshPublicProfile(app);
    setAdminModerationMessage(app, "已更新內容狀態。", "ok");
  } catch (error) {
    setAdminModerationMessage(app, error.message, "error");
  } finally {
    app.adminModerationBusy = false;
    renderAll(app);
  }
}

function closeProfileModal(app) {
  app.profileModalOpen = false;
  renderAll(app);
}

function closePublicProfileModal(app) {
  app.publicProfileOpen = false;
  renderAll(app);
}

function closeTradeDetailModal(app) {
  app.tradeDetailOpen = false;
  renderAll(app);
}

async function openPublicProfile(app, userId) {
  if (!userId || app.publicProfileBusy) return;

  if (String(app.selectedPublicProfileId) !== String(userId)) {
    app.publicCommentDrafts = {};
  }
  app.publicProfileOpen = true;
  app.publicProfileBusy = true;
  app.selectedPublicProfileId = userId;
  app.publicProfile = null;
  setPublicProfileMessage(app, "載入公開資料中...");
  renderAll(app);

  try {
    const { profile } = await getPublicProfile(userId);
    app.publicProfile = profile;
    setPublicProfileMessage(app, "");
  } catch (error) {
    setPublicProfileMessage(app, error.message, "error");
  } finally {
    app.publicProfileBusy = false;
    renderAll(app);
  }
}

async function refreshPublicProfile(app) {
  if (!app.selectedPublicProfileId) return;
  try {
    const { profile } = await getPublicProfile(app.selectedPublicProfileId);
    app.publicProfile = profile;
  } catch (error) {
    setPublicProfileMessage(app, error.message, "error");
  }
}

async function toggleFollow(app) {
  const profile = app.publicProfile;
  if (!profile || app.publicProfileBusy) return;
  if (!app.user) {
    setPublicProfileMessage(app, "登入後才能追蹤交易者。", "error");
    return;
  }
  if (profile.isSelf) return;

  app.publicProfileBusy = true;
  setPublicProfileMessage(app, profile.isFollowing ? "正在取消追蹤..." : "正在追蹤...");
  renderAll(app);

  try {
    if (profile.isFollowing) {
      await unfollowUser(profile.id);
      setPublicProfileMessage(app, "已取消追蹤。", "ok");
    } else {
      await followUser(profile.id);
      setPublicProfileMessage(app, "已加入追蹤。", "ok");
    }
    await refreshPublicProfile(app);
    await refreshLeaderboard(app);
    await refreshFollowing(app);
    await refreshFeed(app, { silent: true });
  } catch (error) {
    setPublicProfileMessage(app, error.message, "error");
  } finally {
    app.publicProfileBusy = false;
    renderAll(app);
  }
}

async function togglePublicTradeLike(app, tradeId) {
  const profile = app.publicProfile;
  if (!profile || !tradeId || app.publicProfileBusy) return;
  if (!app.user) {
    setPublicProfileMessage(app, "登入後才能對公開交易按讚。", "error");
    return;
  }
  if (profile.isSelf) {
    setPublicProfileMessage(app, "自己的公開交易不能按讚。", "error");
    return;
  }

  const trade = profile.recentTrades?.find((item) => item.id === tradeId);
  if (!trade) return;

  app.publicProfileBusy = true;
  setPublicProfileMessage(app, trade.likedByMe ? "正在取消讚..." : "正在按讚...");
  renderAll(app);

  try {
    if (trade.likedByMe) {
      await unlikePublicTrade(profile.id, tradeId);
      setPublicProfileMessage(app, "已取消讚。", "ok");
    } else {
      await likePublicTrade(profile.id, tradeId);
      setPublicProfileMessage(app, "已按讚。", "ok");
    }
    await refreshPublicProfile(app);
    await refreshFeed(app, { silent: true });
  } catch (error) {
    setPublicProfileMessage(app, error.message, "error");
  } finally {
    app.publicProfileBusy = false;
    renderAll(app);
  }
}

async function submitPublicTradeComment(app, tradeId) {
  const profile = app.publicProfile;
  if (!profile || !tradeId || app.publicProfileBusy) return;
  if (!app.user) {
    setPublicProfileMessage(app, "登入後才能留言。", "error");
    return;
  }

  const body = (app.publicCommentDrafts[tradeId] || "").trim();
  if (!body) {
    setPublicProfileMessage(app, "請先輸入留言內容。", "error");
    return;
  }

  app.publicProfileBusy = true;
  setPublicProfileMessage(app, "正在送出留言...");
  renderAll(app);

  try {
    await commentOnPublicTrade(profile.id, tradeId, body);
    delete app.publicCommentDrafts[tradeId];
    await refreshPublicProfile(app);
    await refreshFeed(app, { silent: true });
    setPublicProfileMessage(app, "留言已送出。", "ok");
  } catch (error) {
    setPublicProfileMessage(app, error.message, "error");
  } finally {
    app.publicProfileBusy = false;
    renderAll(app);
  }
}

async function toggleFeedTradeLike(app, key) {
  const { ownerId, tradeId } = parseFeedTradeKey(key);
  if (!ownerId || !tradeId || app.feedBusy) return;
  if (!app.user) {
    setFeedMessage(app, "登入後才能對公開交易按讚。", "error");
    renderAll(app);
    return;
  }

  const trade = findFeedTrade(app, ownerId, tradeId);
  if (!trade) return;

  app.feedBusy = true;
  setFeedMessage(app, trade.likedByMe ? "正在取消讚..." : "正在按讚...");
  renderAll(app);

  try {
    if (trade.likedByMe) {
      await unlikePublicTrade(ownerId, tradeId);
      setFeedMessage(app, "已取消讚。", "ok");
    } else {
      await likePublicTrade(ownerId, tradeId);
      setFeedMessage(app, "已按讚。", "ok");
    }
    await refreshFeed(app, { silent: true, force: true });
    await refreshOpenProfileIfNeeded(app, ownerId);
  } catch (error) {
    setFeedMessage(app, error.message, "error");
  } finally {
    app.feedBusy = false;
    renderAll(app);
  }
}

async function submitFeedTradeComment(app, key) {
  const { ownerId, tradeId } = parseFeedTradeKey(key);
  if (!ownerId || !tradeId || app.feedBusy) return;
  if (!app.user) {
    setFeedMessage(app, "登入後才能留言。", "error");
    renderAll(app);
    return;
  }

  const body = (app.feedCommentDrafts[key] || "").trim();
  if (!body) {
    setFeedMessage(app, "請先輸入留言內容。", "error");
    renderAll(app);
    return;
  }

  app.feedBusy = true;
  setFeedMessage(app, "正在送出留言...");
  renderAll(app);

  try {
    await commentOnPublicTrade(ownerId, tradeId, body);
    delete app.feedCommentDrafts[key];
    await refreshFeed(app, { silent: true, force: true });
    await refreshOpenProfileIfNeeded(app, ownerId);
    setFeedMessage(app, "留言已送出。", "ok");
  } catch (error) {
    setFeedMessage(app, error.message, "error");
  } finally {
    app.feedBusy = false;
    renderAll(app);
  }
}

async function refreshOpenProfileIfNeeded(app, ownerId) {
  if (!app.publicProfileOpen || String(app.selectedPublicProfileId) !== String(ownerId)) return;
  await refreshPublicProfile(app);
}

function findFeedTrade(app, ownerId, tradeId) {
  return app.feedRows.find((item) => String(item.ownerId) === String(ownerId) && String(item.id) === String(tradeId));
}

function parseFeedTradeKey(key) {
  const [ownerId, ...tradeParts] = String(key || "").split(":");
  return {
    ownerId,
    tradeId: tradeParts.join(":"),
  };
}

function dismissAlert(app, alertKey) {
  if (!alertKey) return;
  app.state.dismissedAlerts = app.state.dismissedAlerts || {};
  app.state.dismissedAlerts[alertKey] = Date.now();
  saveState(app);
  queueSync(app);
  renderAll(app);
}

function practiceLearningLesson(app, lessonId) {
  const lesson = learningLessons.find((item) => item.id === lessonId);
  if (!lesson) return;

  app.state.learningProgress = app.state.learningProgress || {};
  app.state.learningProgress[lessonId] = {
    ...app.state.learningProgress[lessonId],
    practicedAt: Date.now(),
  };

  if (lessonId === "spot-vs-perp") {
    app.selectedMode = "spot";
    app.setOrderMessage("已切到現貨模式，可以比較合約區塊的槓桿欄位如何收起。");
    scrollToPanel(".trade-panel");
  } else if (lessonId === "order-types") {
    app.els.orderType.value = "limit";
    app.els.limitPrice.value = formatChartPrice(currentPrice(app));
    app.setOrderMessage("已切到限價單，試著調整價格觀察委託如何掛出。");
    scrollToPanel(".trade-panel");
  } else if (lessonId === "leverage-margin") {
    app.selectedMode = "perp";
    app.els.leverage.value = "20";
    app.setOrderMessage("已切到 20x 預覽，先看保證金與風控提示再下單。", "warn");
    scrollToPanel(".trade-panel");
  } else if (lessonId === "pnl-drawdown") {
    scrollToPanel(".portfolio-panel");
  } else if (lessonId === "journal-emotion") {
    openLatestTradeOrPrompt(app);
  }

  saveState(app);
  queueSync(app);
  renderAll(app);
}

function completeLearningLesson(app, lessonId) {
  if (!learningLessons.some((lesson) => lesson.id === lessonId)) return;
  app.state.learningProgress = app.state.learningProgress || {};
  const current = app.state.learningProgress[lessonId] || {};
  if (current.completedAt) {
    const next = { ...current };
    delete next.completedAt;
    if (next.practicedAt) {
      app.state.learningProgress[lessonId] = next;
    } else {
      delete app.state.learningProgress[lessonId];
    }
  } else {
    app.state.learningProgress[lessonId] = {
      ...current,
      completedAt: Date.now(),
    };
  }
  saveState(app);
  queueSync(app);
  renderAll(app);
}

function handleOnboardingAction(app, action) {
  if (action === "auth") {
    if (app.user) return;
    app.authMode = "register";
    app.authModalOpen = true;
    setAuthMessage(app, "");
    renderAll(app);
    app.els.authName.focus();
    return;
  }

  if (action === "trade") {
    scrollToPanel(".trade-panel");
    app.setOrderMessage("先用小數量完成第一筆模擬交易，再回來看資產與任務進度。");
    renderAll(app);
    return;
  }

  if (action === "journal" || action === "publish") {
    openLatestTradeOrPrompt(app);
    renderAll(app);
    if (app.state.history.length) {
      setJournalMessage(
        app,
        action === "publish" ? "勾選「公開到個人頁」後儲存，就會出現在公開頁與追蹤動態。" : "",
      );
    }
    return;
  }

  if (action === "follow") {
    scrollToPanel(".leaderboard-panel");
  }
}

function handleMobileNav(app, key) {
  app.mobileNavLockedUntil = Date.now() + 900;
  setMobileNavActive(app, key);

  if (key === "account") {
    if (app.user) {
      openProfileModal(app);
    } else {
      app.authMode = "login";
      app.authModalOpen = true;
      setAuthMessage(app, "");
      renderAll(app);
      app.els.authEmail.focus();
    }
    return;
  }

  const targets = {
    trade: ".market-panel",
    assets: ".portfolio-panel",
    social: ".feed-panel",
    learn: ".onboarding-panel",
  };
  scrollToPanel(targets[key] || ".market-panel", "start");
}

function setMobileNavActive(app, key) {
  app.mobileNavActive = key;
  app.els.mobileNavButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.mobileNav === key);
  });
}

function updateMobileNavFromScroll(app) {
  if (
    Date.now() < app.mobileNavLockedUntil ||
    window.innerWidth > 820 ||
    app.authModalOpen ||
    app.forgotPasswordOpen ||
    app.resetPasswordOpen ||
    app.profileModalOpen ||
    app.publicProfileOpen ||
    app.tradeDetailOpen ||
    app.legalModalOpen ||
    app.feedbackModalOpen ||
    app.adminFeedbackOpen ||
    app.adminDashboardOpen ||
    app.reportModalOpen ||
    app.adminModerationOpen
  ) {
    return;
  }

  const sections = [
    ["trade", ".market-panel"],
    ["assets", ".portfolio-panel"],
    ["social", ".feed-panel"],
    ["learn", ".onboarding-panel"],
  ];
  const marker = window.innerHeight * 0.35;
  const active = sections.reduce((current, [key, selector]) => {
    const node = document.querySelector(selector);
    if (!node) return current;
    return node.getBoundingClientRect().top <= marker ? key : current;
  }, "trade");

  if (active !== app.mobileNavActive) {
    setMobileNavActive(app, active);
  }
}

function openLatestTradeOrPrompt(app) {
  const latestTrade = app.state.history[0];
  if (!latestTrade) {
    app.setOrderMessage("先完成一筆模擬交易，再回來練習交易日誌。", "warn");
    scrollToPanel(".trade-panel");
    return;
  }
  app.selectedTradeId = latestTrade.id;
  app.tradeDetailOpen = true;
  app.tradeJournalLoadedFor = null;
}

function scrollToPanel(selector, block = "center") {
  document.querySelector(selector)?.scrollIntoView({ behavior: "smooth", block });
}

function saveTradeJournal(app) {
  const trade = app.state.history.find((item) => item.id === app.selectedTradeId);
  if (!trade) return;

  const rating = Number(app.els.journalRating.value);
  trade.journal = {
    strategy: app.els.journalStrategy.value,
    emotion: app.els.journalEmotion.value,
    rating: Number.isFinite(rating) && rating > 0 ? rating : null,
    note: app.els.journalNote.value.trim(),
    public: app.els.journalPublic.checked,
    updatedAt: Date.now(),
  };

  saveState(app);
  queueSync(app);
  setJournalMessage(app, "交易日誌已儲存。", "ok");
  renderAll(app);
}

function setAuthMessage(app, message, tone = "") {
  app.els.authMessage.textContent = message;
  app.els.authMessage.className = `auth-message ${tone}`;
}

function setForgotPasswordMessage(app, message, tone = "") {
  app.els.forgotPasswordMessage.textContent = message;
  app.els.forgotPasswordMessage.className = `auth-message ${tone}`;
}

function setResetPasswordMessage(app, message, tone = "") {
  app.els.resetPasswordMessage.textContent = message;
  app.els.resetPasswordMessage.className = `auth-message ${tone}`;
}

function setProfileMessage(app, message, tone = "") {
  app.els.profileMessage.textContent = message;
  app.els.profileMessage.className = `auth-message ${tone}`;
}

function setPublicProfileMessage(app, message, tone = "") {
  app.els.publicProfileMessage.textContent = message;
  app.els.publicProfileMessage.className = `auth-message ${tone}`;
}

function setFeedMessage(app, message, tone = "") {
  app.feedMessage = message;
  app.feedMessageTone = tone;
}

function setJournalMessage(app, message, tone = "") {
  app.els.journalMessage.textContent = message;
  app.els.journalMessage.className = `auth-message ${tone}`;
}

function setFeedbackMessage(app, message, tone = "") {
  app.els.feedbackMessage.textContent = message;
  app.els.feedbackMessage.className = `auth-message ${tone}`;
}

function setAdminFeedbackMessage(app, message, tone = "") {
  app.els.adminFeedbackMessage.textContent = message;
  app.els.adminFeedbackMessage.className = `auth-message ${tone}`;
}

function setAdminDashboardMessage(app, message, tone = "") {
  app.els.adminDashboardMessage.textContent = message;
  app.els.adminDashboardMessage.className = `auth-message ${tone}`;
}

function setReportMessage(app, message, tone = "") {
  app.els.reportMessage.textContent = message;
  app.els.reportMessage.className = `auth-message ${tone}`;
}

function setAdminModerationMessage(app, message, tone = "") {
  app.els.adminModerationMessage.textContent = message;
  app.els.adminModerationMessage.className = `auth-message ${tone}`;
}

function isAdminUser(app) {
  return app.user?.role === "admin";
}
