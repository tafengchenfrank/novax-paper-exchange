# NovaX Beta Deployment

這份文件是輕量 Beta 上線流程。目標是先讓少量使用者可以測試，不急著把架構做成大型正式交易所。

免費部署可以直接看 `FREE_DEPLOYMENT.md`。專案已附 `render.yaml`，Render 可以讀取基本部署設定。

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

公開測試前至少要補：

- 使用條款
- 隱私權政策
- 模擬交易聲明
- 聯絡信箱或回報管道

產品文字必須明確表示這是模擬交易與投資學習工具，不提供真實入金、出金、代操或投資建議。

管理者入口目前包含「管理回饋」與「內容管理」，兩者都使用 `NOVAX_ADMIN_TOKEN`。公開測試前請確認檢舉、隱藏公開交易、隱藏留言與解除隱藏流程都能正常運作。
