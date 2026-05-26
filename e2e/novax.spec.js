import { expect, test } from "@playwright/test";
import { db } from "../server/db.js";

const testAccountPattern = "e2e-%@novax.local";

test.afterEach(() => {
  db.prepare("DELETE FROM content_reports WHERE details LIKE ?").run("E2E report%");
  db.prepare("DELETE FROM users WHERE email LIKE ?").run(testAccountPattern);
  db.prepare("DELETE FROM feedback WHERE body LIKE ?").run("E2E feedback%");
});

test("renders the trading shell and switches market controls", async ({ page }) => {
  await gotoCleanApp(page);

  await expect(page.locator(".brand-lockup h1")).toHaveText("NovaX");
  await expect(page.locator(".beta-disclaimer")).toContainText("模擬交易");
  await page.getByRole("button", { name: "查看風險聲明" }).click();
  await expect(page.locator("#legalModal")).toBeVisible();
  await expect(page.locator("#legalTitle")).toHaveText("風險聲明");
  await expect(page.locator("#legalBody")).toContainText("不構成投資建議");
  await page.locator("#closeLegal").click();
  await expect(page.locator("#legalModal")).toBeHidden();
  await page.locator("[data-feedback-open]").click();
  await expect(page.locator("#feedbackModal")).toBeVisible();
  await page.locator("#feedbackCategory").selectOption("idea");
  await page.locator("#feedbackBody").fill("E2E feedback: 希望新增更多教學任務。");
  await page.locator("#feedbackSubmit").click();
  await expect(page.locator("#feedbackMessage")).toHaveText("謝謝，你的回饋已送出。");
  await page.locator("#closeFeedback").click();
  await expect(page.locator("#feedbackModal")).toBeHidden();
  await expect(page.locator("#marketTitle")).toContainText("BTCUSDT");
  await expect(page.locator("#candleCanvas")).toBeVisible();

  await page.getByRole("button", { name: "ETHUSDT" }).click();
  await expect(page.locator("#marketTitle")).toContainText("ETHUSDT");

  await page.locator('[data-mode="spot"]').click();
  await expect(page.locator("#marketTitle")).toContainText("ETHUSDT 現貨");

  await page.locator('[data-mode="perp"]').click();
  await expect(page.locator("#marketTitle")).toContainText("ETHUSDT 永續");

  await expect(page.locator("#learningProgress")).toHaveText("0/5 完成");
  await expect(page.locator("#onboardingProgress")).toHaveText("0/5 完成");
  await expect(page.locator("#onboardingList")).toContainText("建立你的模擬帳號");
  await expect(page.locator("#alertCount")).toContainText("提醒");
  await expect(page.locator("#alertsList")).toContainText("還有學習任務可完成");
  await expect(page.locator("#learningList")).toContainText("市價單 vs 限價單");
  await page.locator('[data-learning-practice="order-types"]').click();
  await expect(page.locator("#orderType")).toHaveValue("limit");
  await expect(page.locator(".limit-only")).toBeVisible();
  await page.locator('[data-dismiss-alert^="learning-progress"]').first().click();
  await expect(page.locator("#alertsList")).not.toContainText("還有學習任務可完成");
  await page.locator('[data-learning-complete="order-types"]').click();
  await expect(page.locator("#learningProgress")).toHaveText("1/5 完成");
  await expect(page.locator('[data-learning-complete="order-types"]')).toHaveText("取消完成");
  await page.locator('[data-learning-complete="order-types"]').click();
  await expect(page.locator("#learningProgress")).toHaveText("0/5 完成");
  await expect(page.locator('[data-learning-complete="order-types"]')).toHaveText("標記完成");
  await page.locator('[data-learning-complete="order-types"]').click();
  await expect(page.locator("#learningProgress")).toHaveText("1/5 完成");

  await page.reload();
  await expect(page.locator("#learningProgress")).toHaveText("1/5 完成");
  await expect(page.locator('[data-learning-complete="order-types"]')).toHaveText("取消完成");
  await page.locator('[data-learning-practice="leverage-margin"]').click();
  await expect(page.locator("#alertsList")).toContainText("高槓桿預覽");
});

test("uses the mobile bottom navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await gotoCleanApp(page);

  await expect(page.locator(".mobile-tabbar")).toBeVisible();
  await expect(page.locator('[data-mobile-nav="trade"]')).toHaveClass(/is-active/);

  await page.locator('[data-mobile-nav="assets"]').click();
  await expect(page.locator('[data-mobile-nav="assets"]')).toHaveClass(/is-active/);
  await expect(page.locator(".portfolio-panel")).toBeInViewport();

  await page.locator('[data-mobile-nav="social"]').click();
  await expect(page.locator('[data-mobile-nav="social"]')).toHaveClass(/is-active/);
  await expect(page.locator(".feed-panel")).toBeInViewport();

  await page.locator('[data-mobile-nav="learn"]').click();
  await expect(page.locator('[data-mobile-nav="learn"]')).toHaveClass(/is-active/);
  await expect(page.locator(".onboarding-panel")).toBeInViewport();

  await page.locator('[data-mobile-nav="account"]').click();
  await expect(page.locator("#authModal")).toBeVisible();
});

test("registers, edits profile, and logs in with the updated password", async ({ page }) => {
  const suffix = Date.now().toString(36);
  const email = `e2e-profile-${suffix}@novax.local`;
  const newEmail = `e2e-profile-new-${suffix}@novax.local`;

  await gotoCleanApp(page);
  await registerViaUi(page, {
    name: "E2E Pilot",
    email,
    password: "password123",
  });

  await expect(page.locator("#authUserName")).toHaveText("E2E Pilot");
  await expect(page.locator("#onboardingProgress")).toHaveText("1/5 完成");

  await page.locator("#openProfile").click();
  await page.locator("#profileName").fill("E2E Captain");
  await page.locator("#profileEmail").fill(newEmail);
  await page.locator("#profileCurrentPassword").fill("password123");
  await page.locator("#profileNewPassword").fill("password456");
  await page.locator("#profileSubmit").click();

  await expect(page.locator("#profileMessage")).toHaveText("基本資料已更新。");
  await expect(page.locator("#authUserName")).toHaveText("E2E Captain");
  await page.locator("#closeProfile").click();

  await page.locator("#logoutAccount").click();
  await expect(page.locator("#authGuest")).toBeVisible();

  await loginViaUi(page, {
    email: newEmail,
    password: "password456",
  });
  await expect(page.locator("#authUserName")).toHaveText("E2E Captain");

  await page.locator("#logoutAccount").click();
  await page.locator("#openAuth").click();
  await page.locator("#authForgotPassword").click();
  await expect(page.locator("#forgotPasswordModal")).toBeVisible();
  await page.locator("#forgotPasswordEmail").fill(newEmail);
  await page.locator("#forgotPasswordSubmit").click();
  await expect(page.locator("#forgotPasswordMessage")).toHaveText("本機測試重設連結已建立。");
  const resetHref = await page.locator("#forgotPasswordDevLink a").getAttribute("href");
  expect(resetHref).toBeTruthy();

  await page.goto(resetHref);
  await expect(page.locator("#resetPasswordModal")).toBeVisible();
  await page.locator("#resetPasswordNew").fill("password789");
  await page.locator("#resetPasswordConfirm").fill("password789");
  await page.locator("#resetPasswordSubmit").click();
  await expect(page.locator("#authSignedIn")).toBeVisible();
  await expect(page.locator("#authUserName")).toHaveText("E2E Captain");

  await page.locator("#logoutAccount").click();
  await loginViaUi(page, {
    email: newEmail,
    password: "password789",
  });
  await expect(page.locator("#authUserName")).toHaveText("E2E Captain");
});

test("opens public profiles and follows another trader", async ({ page }) => {
  const suffix = Date.now().toString(36);
  const alphaEmail = `e2e-alpha-${suffix}@novax.local`;
  const betaEmail = `e2e-beta-${suffix}@novax.local`;

  await gotoCleanApp(page);
  await registerViaUi(page, {
    name: "E2E Alpha",
    email: alphaEmail,
    password: "password123",
  });
  await page.locator("#orderQty").fill("0.01");
  await page.locator("#submitOrder").click();
  await expect(page.locator("#historyList .history-item")).toHaveCount(1);
  await page.locator("#historyList .history-item").first().click();
  await page.locator("#journalStrategy").selectOption("breakout");
  await page.locator("#journalEmotion").selectOption("calm");
  await page.locator("#journalRating").selectOption("4");
  await page.locator("#journalNote").fill("公開筆記測試：進場前先定義風險。");
  await page.locator("#journalPublic").check();
  await page.locator("#saveTradeJournal").click();
  await expect(page.locator("#journalMessage")).toHaveText("交易日誌已儲存。");
  await page.locator("#closeTradeDetail").click();
  await page.locator("#syncAccount").click();
  await expect(page.locator("#authMessage")).toHaveText("進度已儲存。");
  await page.locator("#logoutAccount").click();

  await registerViaUi(page, {
    name: "E2E Beta",
    email: betaEmail,
    password: "password123",
  });

  await expect(page.locator("#leaderboard")).toContainText("E2E Alpha");
  await page.locator('[data-public-profile]').filter({ hasText: "E2E Alpha" }).first().click();
  await expect(page.locator("#publicProfileModal")).toBeVisible();
  await expect(page.locator("#publicProfileName")).toHaveText("E2E Alpha");
  await expect(page.locator("#publicProfileStats")).toContainText("追蹤者");
  await expect(page.locator("#publicProfileTrades")).toContainText("公開筆記測試");
  await expect(page.locator("#publicProfileTrades")).toContainText("突破");
  await expect(page.locator("#followProfile")).toHaveText("追蹤");

  await expect(page.locator('[data-like-trade]').first()).toContainText("讚 · 0");
  await page.locator('[data-like-trade]').first().click();
  await expect(page.locator("#publicProfileMessage")).toHaveText("已按讚。");
  await expect(page.locator('[data-like-trade]').first()).toContainText("取消讚 · 1");
  const commentInput = page.locator("[data-comment-input]").first();
  await commentInput.fill("我正在輸入留言");
  await page.waitForTimeout(1200);
  await expect(commentInput).toBeFocused();
  await expect(commentInput).toHaveValue("我正在輸入留言");
  await commentInput.fill("這筆紀律很清楚。");
  await page.locator('[data-post-comment]').first().click();
  await expect(page.locator("#publicProfileMessage")).toHaveText("留言已送出。");
  await expect(page.locator("#publicProfileTrades")).toContainText("這筆紀律很清楚。");
  await page.locator("[data-report-comment]").first().click();
  await expect(page.locator("#reportModal")).toBeVisible();
  await page.locator("#reportReason").selectOption("misleading");
  await page.locator("#reportDetails").fill("E2E report: 這則留言需要管理者確認。");
  await page.locator("#reportSubmit").click();
  await expect(page.locator("#reportMessage")).toHaveText("檢舉已送出，管理者會查看。");
  await page.locator("#closeReport").click();
  await expect(page.locator("#reportModal")).toBeHidden();
  await page.locator("[data-report-trade]").first().click();
  await expect(page.locator("#reportModal")).toBeVisible();
  await page.locator("#reportReason").selectOption("other");
  await page.locator("#reportDetails").fill("E2E report: 這筆公開交易需要管理者確認。");
  await page.locator("#reportSubmit").click();
  await expect(page.locator("#reportMessage")).toHaveText("檢舉已送出，管理者會查看。");
  await page.locator("#closeReport").click();
  await expect(page.locator("#reportModal")).toBeHidden();

  await page.locator("#followProfile").click();
  await expect(page.locator("#publicProfileRelation")).toHaveText("已追蹤");
  await expect(page.locator("#publicProfileMessage")).toHaveText("已加入追蹤。");
  await expect(page.locator("#followingList")).toContainText("E2E Alpha");
  await page.locator("#closePublicProfile").click();
  await expect(page.locator("#feedList")).toContainText("E2E Alpha");
  await expect(page.locator("#feedList")).toContainText("公開筆記測試");
  await expect(page.locator("#feedCount")).toHaveText("1 則");
  await page.locator("#feedSymbol").selectOption("ETHUSDT");
  await expect(page.locator("#feedCount")).toHaveText("0/1 則");
  await expect(page.locator("#feedList")).toContainText("目前沒有符合條件的追蹤動態");
  await page.locator("#feedSymbol").selectOption("BTCUSDT");
  await expect(page.locator("#feedList")).toContainText("E2E Alpha");
  await page.locator("#feedHighRatingOnly").check();
  await expect(page.locator("#feedList")).toContainText("公開筆記測試");
  await page.locator("#feedSort").selectOption("popular");
  await expect(page.locator("#feedList")).toContainText("E2E Alpha");
  await page.locator("#resetFeedFilters").click();
  await expect(page.locator("#feedSymbol")).toHaveValue("all");
  await expect(page.locator("#feedSort")).toHaveValue("latest");
  await expect(page.locator("#feedHighRatingOnly")).not.toBeChecked();
  const feedCommentInput = page.locator("[data-feed-comment-input]").first();
  await feedCommentInput.fill("我正在動態牆輸入留言");
  await page.waitForTimeout(1200);
  await expect(feedCommentInput).toBeFocused();
  await expect(feedCommentInput).toHaveValue("我正在動態牆輸入留言");
  await feedCommentInput.fill("從動態牆看到這筆交易。");
  await page.locator("[data-feed-post-comment]").first().click();
  await expect(page.locator("#feedMessage")).toHaveText("留言已送出。");
  await expect(page.locator("#feedList")).toContainText("從動態牆看到這筆交易。");

  await page.locator("#feedList [data-feed-profile]").first().click();
  await expect(page.locator("#publicProfileModal")).toBeVisible();
  await expect(page.locator("#publicProfileRelation")).toHaveText("已追蹤");

  await page.locator("#followProfile").click();
  await expect(page.locator("#publicProfileRelation")).toHaveText("未追蹤");
  await expect(page.locator("#publicProfileMessage")).toHaveText("已取消追蹤。");
  await expect(page.locator("#followingList")).toContainText("尚未追蹤交易者");
  await expect(page.locator("#feedList")).toContainText("尚未追蹤交易者");

  await page.locator("#closePublicProfile").click();
  await page.locator("#logoutAccount").click();
  await loginViaUi(page, {
    email: alphaEmail,
    password: "password123",
  });
  await expect(page.locator("#notificationCount")).toHaveText("4 未讀");
  await expect(page.locator("#notificationList")).toContainText("E2E Beta");
  await expect(page.locator("#notificationList")).toContainText("對你的公開交易按讚");
  await expect(page.locator("#notificationList")).toContainText("留言：這筆紀律很清楚。");
  await expect(page.locator("#notificationList")).toContainText("留言：從動態牆看到這筆交易。");
  await expect(page.locator("#notificationList")).toContainText("開始追蹤你的公開個人頁");
  await page.locator("#markNotificationsRead").click();
  await expect(page.locator("#notificationCount")).toHaveText("0 未讀");
});

test("places simulated orders and updates performance statistics", async ({ page }) => {
  const suffix = Date.now().toString(36);
  const email = `e2e-trade-${suffix}@novax.local`;

  await gotoCleanApp(page);
  await registerViaUi(page, {
    name: "E2E Trader",
    email,
    password: "password123",
  });

  await page.locator("#orderQty").fill("0.01");
  await page.locator("#submitOrder").click();
  await expect(page.locator("#orderMessage")).toContainText("合約單已成交");
  await expect(page.locator("#onboardingProgress")).toHaveText("2/5 完成");
  await expect(page.locator("#historyList .history-item")).toHaveCount(1);
  await expect(page.locator("#performanceTrades")).toHaveText("1");
  await expect(page.locator("#performanceRoi")).toContainText("%");
  await expect(page.locator("#alertsList")).toContainText("交易日誌未完成");

  await page.locator("#historyList .history-item").first().click();
  await expect(page.locator("#tradeDetailModal")).toBeVisible();
  await expect(page.locator("#tradeDetailTitle")).toContainText("BTCUSDT");
  await expect(page.locator("#tradeDetailGrid")).toContainText("名目價值");
  await expect(page.locator("#tradeDetailGrid")).toContainText("手續費");
  await expect(page.locator("#tradeDetailGrid")).toContainText("淨損益");
  await page.locator("#journalStrategy").selectOption("breakout");
  await page.locator("#journalEmotion").selectOption("calm");
  await page.locator("#journalRating").selectOption("4");
  await page.locator("#journalNote").fill("守紀律進場，下一次觀察出場節奏。");
  await page.waitForTimeout(1100);
  await expect(page.locator("#journalNote")).toHaveValue("守紀律進場，下一次觀察出場節奏。");
  await page.locator("#saveTradeJournal").click();
  await expect(page.locator("#journalMessage")).toHaveText("交易日誌已儲存。");
  await expect(page.locator("#onboardingProgress")).toHaveText("3/5 完成");
  await expect(page.locator("#journalStatus")).toHaveText("已檢討");
  await expect(page.locator("#tradeDetailGrid")).toContainText("突破");
  await expect(page.locator("#tradeDetailGrid")).toContainText("冷靜");
  await expect(page.locator("#tradeDetailGrid")).toContainText("4 / 5");
  await page.keyboard.press("Escape");
  await expect(page.locator("#tradeDetailModal")).toBeHidden();

  await page.locator("#historyList .history-item").first().click();
  await expect(page.locator("#journalNote")).toHaveValue("守紀律進場，下一次觀察出場節奏。");
  await page.locator("#closeTradeDetail").click();

  await page.locator('[data-side="sell"]').click();
  await page.locator("#submitOrder").click();
  await expect(page.locator("#historyList .history-item")).toHaveCount(2);
  await expect(page.locator("#performanceTrades")).toHaveText("2");
});

async function gotoCleanApp(page) {
  await page.goto("/");
  await page.evaluate(async () => {
    localStorage.clear();
    if (!navigator.serviceWorker?.getRegistrations) return;
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  });
  await page.reload();
}

async function registerViaUi(page, { name, email, password }) {
  await page.locator("#openAuth").click();
  await ensureAuthMode(page, "register");
  await page.locator("#authName").fill(name);
  await page.locator("#authEmail").fill(email);
  await page.locator("#authPassword").fill(password);
  await page.locator("#authSubmit").click();
  await expect(page.locator("#authSignedIn")).toBeVisible();
}

async function loginViaUi(page, { email, password }) {
  await page.locator("#openAuth").click();
  await ensureAuthMode(page, "login");
  await page.locator("#authEmail").fill(email);
  await page.locator("#authPassword").fill(password);
  await page.locator("#authSubmit").click();
  await expect(page.locator("#authSignedIn")).toBeVisible();
}

async function ensureAuthMode(page, mode) {
  const title = page.locator("#authTitle");
  const text = (await title.textContent()) || "";
  const isRegister = text.includes("建立");
  if ((mode === "register" && !isRegister) || (mode === "login" && isRegister)) {
    await page.locator("#authModeToggle").click();
  }
}
