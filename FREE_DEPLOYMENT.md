# NovaX Free Deployment Checklist

這條路線使用 Render Free Web Service 加 Neon Free PostgreSQL。適合先讓朋友或早期使用者試用。

## 1. 建 Neon 資料庫

1. 到 Neon 建立免費專案。
2. 建好後進入 Dashboard，找到 Connection string。
3. 選 Node.js 或 PostgreSQL connection string。
4. 複製形如：

```text
postgresql://user:password@host/dbname?sslmode=require
```

這串是正式資料庫密碼，不要貼到公開地方。

## 2. 推到 GitHub

Render 需要從 GitHub 讀專案。第一次可以用：

```bash
git init
git add .
git commit -m "Prepare NovaX beta deployment"
git branch -M main
git remote add origin https://github.com/YOUR_NAME/YOUR_REPO.git
git push -u origin main
```

如果專案已經有 GitHub repo，只要 commit 並 push。

## 3. 建 Render Web Service

1. 到 Render 建立 New Web Service。
2. 選你的 GitHub repo。
3. Render 會讀到 `render.yaml`。
4. 確認設定：

```text
Build Command: npm install
Start Command: npm start
Health Check Path: /api/health
Plan: Free
```

## 4. 設定 Render 環境變數

在 Render 的 Environment 加上：

```text
DATABASE_URL=你的 Neon connection string
NOVAX_PUBLIC_ORIGIN=https://你的-render網址.onrender.com
NOVAX_ADMIN_TOKEN=一串只有你知道的長密碼
NOVAX_PASSWORD_RESET_MINUTES=30
```

`NODE_ENV`、`HOST`、`NOVAX_SESSION_DAYS`、`NOVAX_MAX_JSON_BYTES` 已經寫在 `render.yaml`。
`NOVAX_ADMIN_TOKEN` 是管理員啟用金鑰，不要放進 GitHub。部署後先註冊或登入你要使用的帳號，打開「資料」視窗輸入 Admin Token，成功後帳號區會出現「後臺」。

如果要讓「忘記密碼」真的寄出重設連結，另外設定 Resend：

```text
RESEND_API_KEY=你的 Resend API key
NOVAX_EMAIL_FROM=NovaX <noreply@你的寄信網域>
NOVAX_SUPPORT_EMAIL=你的客服信箱
```

沒有設定寄信服務時，正式站會提示使用者聯絡管理者；本機開發才會顯示測試用重設連結。
設定完成並重新部署後，打開 `/api/health`，看到 `"emailEnabled": true` 與 `"emailProvider": "resend"` 才代表正式寄信已啟用。

## 5. 部署後檢查

部署成功後打開：

```text
https://你的-render網址.onrender.com/api/health
```

正常應該看到：

```json
{
  "ok": true,
  "name": "NovaX API",
  "config": {
    "storage": "postgres"
  }
}
```

也可以登入網站後送出一則 Beta 回饋，或在公開交易/留言按「檢舉」確認流程可用；管理員 email 登入後會在帳號區看到「後臺」，可以查看所有帳號、回饋與檢舉內容。

## 6. 免費方案限制

- Render Free 閒置後會休眠，第一次打開會比較慢。
- Neon Free 有容量與用量限制，Beta 足夠，正式營利前要評估升級。
- 不要在 Render Free 依賴 SQLite 檔案保存資料；正式資料要放 Neon PostgreSQL。
