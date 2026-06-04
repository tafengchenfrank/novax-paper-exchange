import net from "node:net";
import tls from "node:tls";
import { config } from "./config.js";

const smtpTimeoutMs = 15_000;

export async function sendPasswordResetEmail(user, resetUrl) {
  if (!config.email.enabled) {
    return { sent: false };
  }

  const message = buildPasswordResetMessage(user, resetUrl);
  if (config.email.provider === "smtp") {
    await sendSmtpEmail(message);
    return { sent: true, provider: "smtp" };
  }

  await sendResendEmail(message);
  return { sent: true, provider: "resend" };
}

function buildPasswordResetMessage(user, resetUrl) {
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

  return {
    from: config.email.from,
    to: user.email,
    subject,
    text,
    html,
  };
}

async function sendResendEmail(message) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.email.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(message),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Password reset email failed: ${response.status} ${detail}`);
  }
}

async function sendSmtpEmail(message) {
  const smtp = config.email.smtp;
  let socket = await connectSmtpSocket(smtp);
  try {
    await expectSmtp(socket, [220]);

    let capabilities = await smtpEhlo(socket);
    if (!smtp.secure && capabilities.has("STARTTLS")) {
      await smtpCommand(socket, "STARTTLS", [220]);
      socket = await upgradeSmtpTls(socket, smtp.host);
      capabilities = await smtpEhlo(socket);
    }

    if (smtp.user || smtp.pass) {
      if (!socket.encrypted) {
        throw new Error("SMTP authentication requires TLS. Use port 465 or a STARTTLS-capable server.");
      }
      await smtpAuth(socket, smtp, capabilities);
    }

    await smtpCommand(socket, `MAIL FROM:<${smtpAddress(message.from)}>`, [250]);
    await smtpCommand(socket, `RCPT TO:<${smtpAddress(message.to)}>`, [250, 251]);
    await smtpCommand(socket, "DATA", [354]);
    socket.write(`${smtpMessage(message)}\r\n.\r\n`);
    await expectSmtp(socket, [250]);
    await smtpCommand(socket, "QUIT", [221]);
  } finally {
    socket.destroy();
  }
}

function connectSmtpSocket(smtp) {
  return new Promise((resolve, reject) => {
    const options = {
      host: smtp.host,
      port: smtp.port,
      servername: smtp.host,
      timeout: smtpTimeoutMs,
    };
    const socket = smtp.secure ? tls.connect(options) : net.connect(options);
    socket.setTimeout(smtpTimeoutMs);
    const cleanup = () => {
      socket.off("connect", onConnect);
      socket.off("secureConnect", onConnect);
      socket.off("timeout", onTimeout);
      socket.off("error", onError);
    };
    const onConnect = () => {
      cleanup();
      resolve(socket);
    };
    const onTimeout = () => {
      cleanup();
      socket.destroy();
      reject(new Error("SMTP connection timed out."));
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };

    socket.once(smtp.secure ? "secureConnect" : "connect", onConnect);
    socket.once("timeout", onTimeout);
    socket.once("error", onError);
  });
}

function upgradeSmtpTls(socket, host) {
  return new Promise((resolve, reject) => {
    const secureSocket = tls.connect({
      socket,
      servername: host,
    });
    secureSocket.setTimeout(smtpTimeoutMs);
    const cleanup = () => {
      secureSocket.off("secureConnect", onSecure);
      secureSocket.off("error", onError);
      secureSocket.off("timeout", onTimeout);
    };
    const onSecure = () => {
      cleanup();
      resolve(secureSocket);
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const onTimeout = () => {
      cleanup();
      secureSocket.destroy();
      reject(new Error("SMTP TLS upgrade timed out."));
    };
    secureSocket.once("secureConnect", onSecure);
    secureSocket.once("error", onError);
    secureSocket.once("timeout", onTimeout);
  });
}

async function smtpEhlo(socket) {
  const response = await smtpCommand(socket, `EHLO ${config.email.smtp.heloName}`, [250]);
  return smtpCapabilities(response.lines);
}

async function smtpAuth(socket, smtp, capabilities) {
  if (capabilities.has("AUTH PLAIN")) {
    const token = Buffer.from(`\0${smtp.user}\0${smtp.pass}`, "utf8").toString("base64");
    await smtpCommand(socket, `AUTH PLAIN ${token}`, [235, 503]);
    return;
  }

  await smtpCommand(socket, "AUTH LOGIN", [334]);
  await smtpCommand(socket, Buffer.from(smtp.user, "utf8").toString("base64"), [334]);
  await smtpCommand(socket, Buffer.from(smtp.pass, "utf8").toString("base64"), [235, 503]);
}

async function smtpCommand(socket, command, expectedCodes) {
  socket.write(`${command}\r\n`);
  return expectSmtp(socket, expectedCodes);
}

function expectSmtp(socket, expectedCodes) {
  return readSmtpResponse(socket).then((response) => {
    if (!expectedCodes.includes(response.code)) {
      throw new Error(`SMTP command failed: ${response.lines.join(" | ")}`);
    }
    return response;
  });
}

function readSmtpResponse(socket) {
  return new Promise((resolve, reject) => {
    let raw = "";
    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("timeout", onTimeout);
    };
    const onData = (chunk) => {
      raw += chunk.toString("utf8");
      const lines = raw.split(/\r?\n/).filter(Boolean);
      const last = lines.at(-1) || "";
      if (!/^\d{3} /.test(last)) return;
      cleanup();
      resolve({
        code: Number(last.slice(0, 3)),
        lines,
      });
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const onTimeout = () => {
      cleanup();
      reject(new Error("SMTP response timed out."));
    };
    socket.on("data", onData);
    socket.once("error", onError);
    socket.once("timeout", onTimeout);
  });
}

function smtpCapabilities(lines) {
  const capabilities = new Set();
  lines.forEach((line) => {
    const capability = line.slice(4).trim().toUpperCase();
    if (!capability) return;
    capabilities.add(capability);
    if (capability.startsWith("AUTH ")) {
      capability
        .split(/\s+/)
        .slice(1)
        .forEach((method) => capabilities.add(`AUTH ${method}`));
    }
  });
  return capabilities;
}

function smtpMessage(message) {
  const boundary = `novax-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const headers = [
    `From: ${message.from}`,
    `To: ${message.to}`,
    `Subject: ${encodedHeader(message.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  const body = [
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    message.text,
    `--${boundary}`,
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    message.html,
    `--${boundary}--`,
  ];
  return dotStuff([...headers, "", ...body].join("\r\n"));
}

function dotStuff(value) {
  return value
    .split(/\r?\n/)
    .map((line) => (line.startsWith(".") ? `.${line}` : line))
    .join("\r\n");
}

function encodedHeader(value) {
  return `=?UTF-8?B?${Buffer.from(String(value), "utf8").toString("base64")}?=`;
}

function smtpAddress(value) {
  const text = String(value || "").trim();
  const match = text.match(/<([^<>]+)>/);
  return (match?.[1] || text).trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
