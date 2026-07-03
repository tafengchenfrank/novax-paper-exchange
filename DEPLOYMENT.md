# NovaX Beta Deployment

這份文件是輕量 Beta 上線流程。目標是先讓少量使用者可以測試，不急著把架構做成大型正式交易所。

免費部署可以直接看 `FREE_DEPLOYMENT.md`。專案已附 `render.yaml`，Render 可以讀取基本部署設定。

要啟用 Free / Pro 訂閱與正式營運資訊，請依 `MONETIZATION.md` 設定。金流環境變數不完整時，系統會保持免費 Beta，不會產生半開啟的結帳流程。

## 1. 環境變數

先複製範例：

```bash
cp .env.example .env
```

重要設定：

```bash
NODE_ENV=production
HOST=0.0.0.0
PORT=8787
NOVAX_PUBLIC_ORIGIN=https://your-domain.example
NOVAX_SESSION_DAYS=14
NOVAX_ADMIN_TOKEN=change-this-to-a-long-random-secret
NOVAX_PASSWORD_RESET_MINUTES=30
```

如果前端和 API 分開部署，再設定：

```bash
NOVAX_CORS_ORIGINS=https://your-frontend.example
```

資料庫有兩種模式：

```bash
# 付費主機 + persistent disk：保留 SQLite
NOVAX_DATA_DIR=/var/lib/novax
NOVAX_DATABASE_PATH=/var/lib/novax/novax.sqlite

# 免費 Render + Neon：改用 PostgreSQL
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
```

忘記密碼功能可以用 Resend 或 SMTP 寄重設連結。

Resend：

```bash
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxx
NOVAX_EMAIL_FROM="NovaX <noreply@your-domain.example>"
NOVAX_SUPPORT_EMAIL=support@your-domain.example
```

SMTP：

```bash
SMTP_HOST=smtp.your-mail-provider.example
SMTP_PORT=587
SMTP_USER=your-account@example.com
SMTP_PASS=your-smtp-password
SMTP_SECURE=false
NOVAX_EMAIL_FROM="NovaX <your-account@example.com>"
NOVAX_SUPPORT_EMAIL=support@your-domain.example
```

`SMTP_PORT=587` 通常搭配 STARTTLS，所以 `SMTP_SECURE=false`；`SMTP_PORT=465` 通常搭配 SSL，所以 `SMTP_SECURE=true`。沒有設定寄信服務時，production 不會寄出重設信；本機 development 會在畫面顯示測試用連結。設定後重新部署，確認 `/api/health` 顯示 `"emailEnabled": true` 與 `"emailProvider": "smtp"` 或 `"resend"`，再用正式站的「忘記密碼」寄一封測試信。

管理員權限會存在資料庫的帳號角色中，不會只靠 email 自動授權。先設定 `NOVAX_ADMIN_TOKEN`，再用要成為管理員的帳號登入，打開「資料」視窗並輸入 Admin Token。成功後帳號區會顯示「後臺」，可以查看所有帳號摘要、回饋與內容檢舉。

## 2. 啟動檢查

部署前先跑：

```bash
npm run doctor
npm run check
npm run test:e2e
```

`doctor` 會檢查 Node 版本、資料庫是否能連線、SQLite 資料目錄是否可讀寫，以及 production 環境是否設定 HTTPS 網址。

## 3. Beta 儲存策略

預設使用 SQLite，適合小流量 Beta。正式部署時要注意：

- `NOVAX_DATA_DIR` 必須放在 hosting provider 的 persistent disk。
- 不要把正式資料庫放在 ephemeral filesystem。
- 定期備份 `novax.sqlite`、`novax.sqlite-wal`、`novax.sqlite-shm`。

如果使用免費 Render，因為免費 Web Service 不支援 persistent disk，請改用 Neon / Supabase PostgreSQL，並設定 `DATABASE_URL`。只要 `DATABASE_URL` 存在，NovaX 會自動切換成 PostgreSQL。

## 4. 推薦部署平台

簡單 Beta 可選：

- Render Free Web Service + Neon Free PostgreSQL
- Render Web Service + Persistent Disk
- Railway service + volume
- Fly.io app + volume
- 自己的 VPS + systemd / reverse proxy

Build command:

```bash
npm install
```

Start command:

```bash
npm start
```

Health check:

```text
/api/health
```

## 5. 上線前提醒

公開營運前至少要確認：

- 頁尾已顯示正確的經營者、客服與依法需要的稅籍資訊
- 使用條款、隱私權、退款政策與模擬交易聲明符合實際營運方式
- 寄信、密碼重設、取消續訂與退款客服流程均已實測
- 金流仍在審核或未設定時，方案頁顯示「尚未開放」且不能結帳

產品文字必須明確表示這是模擬交易與投資學習工具，不提供真實入金、出金、代操或投資建議。

管理者入口目前包含「後臺」、「管理回饋」與「內容管理」。推薦用 `NOVAX_ADMIN_TOKEN` 升級少數可信任帳號，升級後再保管好 token。公開測試前請確認檢舉、隱藏公開交易、隱藏留言與解除隱藏流程都能正常運作。
