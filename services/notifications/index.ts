import nodemailer from "nodemailer";
import { env } from "@/lib/env";
import type { Db } from "@/lib/db";
import { getSettings } from "@/lib/settings";

export interface NotifyInput {
  title: string;
  body?: string;
  level?: "info" | "success" | "warning" | "error";
  link?: string;
}

export interface ChannelResult {
  channel: string;
  ok: boolean;
  detail?: string;
}

/** Telegram Bot API (official, free). */
export async function sendTelegram(text: string, chatId?: string): Promise<ChannelResult> {
  const e = env();
  const chat = chatId ?? e.TELEGRAM_CHAT_ID;
  if (!e.TELEGRAM_BOT_TOKEN || !chat) return { channel: "telegram", ok: false, detail: "Telegram not configured" };
  const res = await fetch(`https://api.telegram.org/bot${e.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text: text.slice(0, 4000), disable_web_page_preview: true }),
    signal: AbortSignal.timeout(10_000),
  });
  return { channel: "telegram", ok: res.ok, detail: res.ok ? undefined : `HTTP ${res.status}` };
}

export function smtpConfigured(): boolean {
  const e = env();
  return Boolean(e.SMTP_HOST && e.SMTP_FROM);
}

/** Send an email through the user's own SMTP server (e.g. Gmail app password — free). */
export async function sendEmail(to: string, subject: string, text: string): Promise<ChannelResult> {
  const e = env();
  if (!smtpConfigured()) return { channel: "email", ok: false, detail: "SMTP not configured" };
  const transport = nodemailer.createTransport({
    host: e.SMTP_HOST,
    port: e.SMTP_PORT,
    secure: e.SMTP_PORT === 465,
    auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASSWORD } : undefined,
  });
  const info = await transport.sendMail({ from: e.SMTP_FROM, to, subject, text });
  return { channel: "email", ok: true, detail: info.messageId };
}

/**
 * Create an in-app notification (shown in the app and as a browser notification) and fan out to
 * external channels the user enabled. External failures are reported, never thrown.
 */
export async function notify(db: Db, userId: string, n: NotifyInput): Promise<ChannelResult[]> {
  const settings = await getSettings(db);
  const results: ChannelResult[] = [{ channel: "in_app", ok: true }];
  const text = `${n.title}${n.body ? `\n\n${n.body}` : ""}`;
  if (settings.notifications.telegram) {
    results.push(await sendTelegram(text).catch((err) => ({ channel: "telegram", ok: false, detail: String(err.message) })));
  }
  if (settings.notifications.email && settings.notifications.emailTo) {
    results.push(
      await sendEmail(settings.notifications.emailTo, n.title, n.body ?? n.title).catch((err) => ({
        channel: "email",
        ok: false,
        detail: String(err.message),
      })),
    );
  }
  await db.query(
    `insert into notifications(user_id, title, body, level, link, channels) values ($1,$2,$3,$4,$5,$6)`,
    [userId, n.title.slice(0, 300), (n.body ?? "").slice(0, 5000), n.level ?? "info", n.link ?? null, results.filter((r) => r.ok).map((r) => r.channel)],
  );
  return results;
}
