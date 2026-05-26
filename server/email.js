import { config } from "./config.js";

export async function sendPasswordResetEmail(user, resetUrl) {
  if (!config.email.enabled) {
    return { sent: false };
  }

  const subject = "重設你的 NovaX 密碼";
  const text = [
    `${user.name || "NovaX 使用者"} 你好，`,
    "",
    `請使用以下連結重設你的 NovaX 密碼。連結會在 ${config.passwordResetMinutes} 分鐘後失效：`,
    resetUrl,
    "",
    "如果這不是你本人操作，可以忽略這封信。",
  ].join("\n");
  const html = `
    <p>${escapeHtml(user.name || "NovaX 使用者")} 你好，</p>
    <p>請使用以下連結重設你的 NovaX 密碼。連結會在 ${config.passwordResetMinutes} 分鐘後失效：</p>
    <p><a href="${escapeHtml(resetUrl)}">${escapeHtml(resetUrl)}</a></p>
    <p>如果這不是你本人操作，可以忽略這封信。</p>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.email.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.email.from,
      to: user.email,
      subject,
      text,
      html,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Password reset email failed: ${response.status} ${detail}`);
  }

  return { sent: true };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
