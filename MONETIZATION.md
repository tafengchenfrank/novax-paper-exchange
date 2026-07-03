# NovaX 營利啟用手冊

程式已具備 Free / Pro 權限、訂閱結帳、Webhook 簽章驗證、續訂狀態、取消入口、條款同意紀錄與退款政策。預設保持免費，不完整的金流設定不會啟用收款。

## 1. 先填正式營運資訊

在 Render `Environment` 設定：

```text
NOVAX_OPERATOR_NAME=你的姓名、商號或公司名稱
NOVAX_OPERATOR_TAX_ID=統一編號（依法取得後填寫）
NOVAX_OPERATOR_ADDRESS=營業聯絡地址
NOVAX_SUPPORT_EMAIL=support@你的網域
NOVAX_TERMS_EFFECTIVE_DATE=2026-07-03
```

尚未辦理稅籍時不要捏造統編。開始收費前，應依所在地、銷售額與服務內容向會計師、稅務機關或律師確認義務。

## 2. 啟用客服與密碼重設信

推薦用已驗證自有網域的 Resend：

```text
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxx
NOVAX_EMAIL_FROM=NovaX <noreply@你的網域>
NOVAX_SUPPORT_EMAIL=support@你的網域
```

重新部署後，確認 `/api/health` 的 `emailEnabled` 為 `true`，並實際測試一封重設信。

## 3. 建立 Lemon Squeezy Pro 訂閱

1. 建立並完成 Lemon Squeezy 商戶審核與收款帳戶。
2. 建立 NovaX Pro 訂閱產品與月繳 Variant。
3. 複製 Hosted Checkout URL、Store Billing Portal URL 與 Variant ID。
4. 在 Lemon Squeezy 建立 Webhook：
   - URL：`https://你的網域/api/billing/webhooks/lemonsqueezy`
   - Events：`subscription_created`、`subscription_updated`、`subscription_cancelled`、`subscription_resumed`、`subscription_expired`、`subscription_paused`、`subscription_unpaused`
   - 建立獨立 Webhook signing secret。
5. 另產生一組至少 32 bytes 的 NovaX 帳號連結密鑰。在 PowerShell 可使用：

```powershell
[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLower()
```

Render 正式環境設定：

```text
NOVAX_BILLING_PROVIDER=lemonsqueezy
LEMONSQUEEZY_CHECKOUT_URL=https://你的商店.lemonsqueezy.com/checkout/buy/你的代碼
LEMONSQUEEZY_PORTAL_URL=https://你的商店.lemonsqueezy.com/billing
LEMONSQUEEZY_PRO_VARIANT_ID=你的VariantId
LEMONSQUEEZY_WEBHOOK_SECRET=你的WebhookSecret
NOVAX_BILLING_LINK_SECRET=另一組獨立隨機密鑰
NOVAX_PRO_PRICE_LABEL=US$9 / 月
NOVAX_BILLING_ALLOW_TEST_MODE=false
```

`LEMONSQUEEZY_WEBHOOK_SECRET` 與 `NOVAX_BILLING_LINK_SECRET` 必須不同，且不可放進 GitHub。

## 4. 上線前測試

```powershell
npm run doctor
npm run check
npm test
npm run test:e2e
```

先在 Lemon Squeezy Test Mode 及非 production 環境測試完整流程。正式 Render 必須保持 `NOVAX_BILLING_ALLOW_TEST_MODE=false`，避免測試訂單取得正式 Pro 權限。

正式小額交易至少確認：

- 結帳前能看到價格、週期、自動續訂與退款政策。
- 付款完成後帳號顯示 `PRO`，進階績效解鎖。
- 客戶入口能更新付款方式及取消續訂。
- 取消後可使用至到期日，到期 Webhook 會收回 Pro 權限。
- 重複 Webhook 不會重複或錯誤變更權限。
- 密碼重設與客服信箱可收到信。

## 5. 營運與備份

- 每週匯出後臺帳號、回饋、檢舉與操作紀錄。
- 在 Neon 設定可用的備份／還原策略並定期演練。
- 監看 Render 健康檢查 `/api/health` 與部署失敗通知。
- 記錄退款、爭議、收入與平台手續費，供報稅與對帳。
- 不新增真實入金、出金、代操、交易所 API 下單或個人化投資建議，除非先取得專業法遵意見。

參考：

- [Lemon Squeezy Webhooks](https://docs.lemonsqueezy.com/help/webhooks)
- [Lemon Squeezy Supported Countries](https://docs.lemonsqueezy.com/help/getting-started/supported-countries)
- [財政部境內網路交易注意事項](https://www.etax.nat.gov.tw/etwmain/tax-info/network-transaction-taxtation-area/seller/notice)
- [行政院消保處通訊交易解除權例外](https://cpc.ey.gov.tw/Page/53D79214534B3D4C)
