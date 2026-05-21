import { els } from "./dom.js";
import {
  clearToken,
  commentOnPublicTrade,
  followUser,
  getFollowing,
  getFollowingFeed,
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
  syncRemoteAccount,
  likePublicTrade,
  unfollowUser,
  unlikePublicTrade,
  updateProfile,
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
  profileModalOpen: false,
  profileBusy: false,
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
    if (profileButton) {
      openPublicProfile(app, profileButton.dataset.feedProfile);
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
  app.els.authSubmit.addEventListener("click", () => submitAuth(app));
  [app.els.authName, app.els.authEmail, app.els.authPassword].forEach((input) => {
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        submitAuth(app);
      }
    });
  });
  app.els.openProfile.addEventListener("click", () => openProfileModal(app));
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
    if (likeButton) {
      togglePublicTradeLike(app, likeButton.dataset.likeTrade);
      return;
    }
    if (commentButton) {
      submitPublicTradeComment(app, commentButton.dataset.postComment);
    }
  });
  app.els.profileSubmit.addEventListener("click", () => submitProfile(app));
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

function openProfileModal(app) {
  if (!app.user) return;

  app.profileModalOpen = true;
  app.els.profileName.value = app.user.name || "";
  app.els.profileEmail.value = app.user.email || "";
  app.els.profileCurrentPassword.value = "";
  app.els.profileNewPassword.value = "";
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
    app.profileModalOpen ||
    app.publicProfileOpen ||
    app.tradeDetailOpen
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
