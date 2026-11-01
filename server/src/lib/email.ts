/**
 * CampConnect Email Service
 *
 * Uses nodemailer over SMTP. When SMTP_HOST is not configured (dev mode),
 * emails are logged to the console instead of actually sent.
 *
 * IST timezone: UTC+5:30. All displayed times are converted to IST.
 */

import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../env.js';
import { logger } from './logger.js';

// ─── Transporter (lazily created) ────────────────────────────────────────────

let _transport: Transporter | null = null;

function getTransport(): Transporter {
  if (_transport) return _transport;

  if (env.emailEnabled) {
    _transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    });
  } else {
    // Dev/test fallback — logs to console, no real sending
    _transport = nodemailer.createTransport({
      streamTransport: true,
      newline: 'unix',
    });
  }

  return _transport;
}

// ─── IST helpers ──────────────────────────────────────────────────────────────

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // UTC+5:30

/**
 * Format a date + time string into a human-readable IST string.
 * @param dateStr  YYYY-MM-DD
 * @param timeStr  HH:MM (24h)
 */
export function formatIST(dateStr: string, timeStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);

  // Construct as UTC then add IST offset
  const utcMs = Date.UTC(year, month - 1, day, hour - 5, minute - 30);
  const istDate = new Date(utcMs + IST_OFFSET_MS);

  return istDate.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

// ─── HTML Template ────────────────────────────────────────────────────────────

interface ReminderEmailData {
  studentName: string;
  eventTitle: string;
  eventDescription?: string | null;
  eventDate: string;
  eventTime: string;
  eventVenue?: string | null;
  clubName: string;
  eventUrl: string;
  reminderType: '24h' | '2h';
}

function buildReminderEmail(data: ReminderEmailData): { subject: string; html: string; text: string } {
  const timeLabel = data.reminderType === '24h' ? '24 hours' : '2 hours';
  const formattedTime = formatIST(data.eventDate, data.eventTime);
  const subject = `Reminder: ${data.eventTitle} is Coming Up – CampConnect`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${subject}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0f0f14; color: #e2e2e8; font-family: 'Segoe UI', Arial, sans-serif; }
    .wrapper { max-width: 600px; margin: 0 auto; padding: 24px 16px; }
    .card { background: #1a1a24; border-radius: 16px; overflow: hidden; border: 1px solid #2a2a38; }
    .header { background: linear-gradient(135deg, #6c63ff 0%, #a78bfa 100%); padding: 32px 32px 24px; text-align: center; }
    .logo { font-size: 22px; font-weight: 800; color: #fff; letter-spacing: -0.5px; margin-bottom: 8px; }
    .eyebrow { font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: rgba(255,255,255,0.7); }
    .body { padding: 32px; }
    .greeting { font-size: 18px; font-weight: 600; color: #e2e2e8; margin-bottom: 8px; }
    .lead { color: #a0a0b8; font-size: 15px; line-height: 1.6; margin-bottom: 24px; }
    .badge { display: inline-block; background: rgba(108,99,255,0.15); border: 1px solid rgba(108,99,255,0.4); color: #a78bfa; font-size: 12px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; padding: 4px 12px; border-radius: 999px; margin-bottom: 20px; }
    .event-card { background: #12121c; border: 1px solid #2a2a38; border-radius: 12px; padding: 20px; margin-bottom: 24px; }
    .event-title { font-size: 22px; font-weight: 800; color: #fff; margin-bottom: 12px; }
    .detail-row { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 10px; }
    .detail-icon { font-size: 16px; min-width: 20px; }
    .detail-text { font-size: 14px; color: #c0c0d8; line-height: 1.5; }
    .detail-label { font-weight: 600; color: #e2e2e8; }
    .desc { font-size: 14px; color: #a0a0b8; line-height: 1.7; margin: 16px 0 0; padding-top: 16px; border-top: 1px solid #2a2a38; }
    .cta { text-align: center; margin: 28px 0 8px; }
    .btn { display: inline-block; background: linear-gradient(135deg, #6c63ff, #a78bfa); color: #fff; text-decoration: none; font-weight: 700; font-size: 15px; padding: 14px 32px; border-radius: 12px; }
    .footer { padding: 20px 32px; border-top: 1px solid #2a2a38; text-align: center; }
    .footer p { font-size: 12px; color: #606080; line-height: 1.6; }
    .footer a { color: #a78bfa; text-decoration: none; }
    .check-mark { color: #10b981; font-size: 13px; font-weight: 600; margin-bottom: 12px; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <div class="logo">⚡ CampConnect</div>
        <div class="eyebrow">Your Campus, Connected</div>
      </div>

      <div class="body">
        <div class="badge">⏰ ${timeLabel} to go</div>
        <p class="greeting">Hey ${data.studentName}! 👋</p>
        <p class="lead">
          Your upcoming event is just <strong>${timeLabel} away</strong>.
          Here's a quick reminder so you don't miss out.
        </p>

        <div class="check-mark">✅ You're registered for this event</div>

        <div class="event-card">
          <div class="event-title">${data.eventTitle}</div>

          <div class="detail-row">
            <span class="detail-icon">📅</span>
            <div class="detail-text">
              <span class="detail-label">Date &amp; Time</span><br/>
              ${formattedTime} IST
            </div>
          </div>

          ${data.eventVenue ? `
          <div class="detail-row">
            <span class="detail-icon">📍</span>
            <div class="detail-text">
              <span class="detail-label">Venue</span><br/>
              ${data.eventVenue}
            </div>
          </div>` : ''}

          <div class="detail-row">
            <span class="detail-icon">🏛️</span>
            <div class="detail-text">
              <span class="detail-label">Organised by</span><br/>
              ${data.clubName}
            </div>
          </div>

          ${data.eventDescription ? `<p class="desc">${data.eventDescription}</p>` : ''}
        </div>

        <div class="cta">
          <a href="${data.eventUrl}" class="btn">View Event Details →</a>
        </div>
      </div>

      <div class="footer">
        <p>
          You're receiving this because you registered for <strong>${data.eventTitle}</strong>
          on CampConnect.<br/>
          Questions? Contact your club admin.<br/>
          <a href="${env.PUBLIC_URL}">campconnect.pvppcoe.ac.in</a>
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;

  const text = `
CampConnect Event Reminder – ${timeLabel} to go!

Hi ${data.studentName},

Your upcoming event is just ${timeLabel} away!

Event: ${data.eventTitle}
Date & Time: ${formattedTime} IST
${data.eventVenue ? `Venue: ${data.eventVenue}\n` : ''}Organised by: ${data.clubName}
${data.eventDescription ? `\nAbout: ${data.eventDescription}\n` : ''}
View event details: ${data.eventUrl}

You are registered for this event. See you there!

— The CampConnect Team
`.trim();

  return { subject, html, text };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export type EmailResult = { ok: true } | { ok: false; error: string };

/**
 * Send a registration-reminder email.
 * In dev mode (no SMTP configured) the email is only logged, not delivered.
 */
export async function sendReminderEmail(
  to: string,
  data: ReminderEmailData,
): Promise<EmailResult> {
  const { subject, html, text } = buildReminderEmail(data);

  if (!env.emailEnabled) {
    logger.info(
      { to, subject, eventTitle: data.eventTitle, reminderType: data.reminderType },
      '[email-dev] Reminder email would be sent (SMTP not configured)',
    );
    return { ok: true };
  }

  try {
    const transport = getTransport();
    await transport.sendMail({ from: env.EMAIL_FROM, to, subject, html, text });
    logger.info({ to, subject }, '[email] Reminder email sent');
    return { ok: true };
  } catch (err) {
    const error = (err as Error).message;
    logger.error({ to, subject, error }, '[email] Failed to send reminder email');
    return { ok: false, error };
  }
}

/**
 * Send a password-reset email.
 * In dev mode the reset URL is NOT emailed; instead the API returns it directly.
 */
export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string,
  recipientName: string,
): Promise<EmailResult> {
  const subject = 'Reset your CampConnect password';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${subject}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0f0f14; color: #e2e2e8; font-family: 'Segoe UI', Arial, sans-serif; }
    .wrapper { max-width: 580px; margin: 0 auto; padding: 24px 16px; }
    .card { background: #1a1a24; border-radius: 16px; overflow: hidden; border: 1px solid #2a2a38; }
    .header { background: linear-gradient(135deg, #6c63ff 0%, #a78bfa 100%); padding: 28px 32px; text-align: center; }
    .logo { font-size: 22px; font-weight: 800; color: #fff; }
    .body { padding: 32px; }
    p { color: #c0c0d8; font-size: 15px; line-height: 1.7; margin-bottom: 16px; }
    .cta { text-align: center; margin: 28px 0; }
    .btn { display: inline-block; background: linear-gradient(135deg, #6c63ff, #a78bfa); color: #fff; text-decoration: none; font-weight: 700; font-size: 15px; padding: 14px 32px; border-radius: 12px; }
    .warning { font-size: 13px; color: #a78bfa; background: rgba(108,99,255,0.1); border: 1px solid rgba(108,99,255,0.3); border-radius: 8px; padding: 12px 16px; }
    .footer { padding: 16px 32px; border-top: 1px solid #2a2a38; text-align: center; font-size: 12px; color: #606080; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header"><div class="logo">⚡ CampConnect</div></div>
      <div class="body">
        <p>Hi ${recipientName},</p>
        <p>We received a request to reset the password for your CampConnect account linked to this email address. Click the button below to choose a new password.</p>
        <div class="cta">
          <a href="${resetUrl}" class="btn">Reset My Password</a>
        </div>
        <p class="warning">
          ⏱️ This link expires in <strong>30 minutes</strong> and can only be used once.<br/>
          If you didn't request this, you can safely ignore this email.
        </p>
      </div>
      <div class="footer">CampConnect · PVPP College of Engineering</div>
    </div>
  </div>
</body>
</html>`;

  const text = `Hi ${recipientName},

We received a request to reset your CampConnect password.

Click this link to reset it (expires in 30 minutes):
${resetUrl}

If you didn't request this, ignore this email.

— CampConnect`;

  if (!env.emailEnabled) {
    logger.info({ to, subject }, '[email-dev] Password reset email would be sent (SMTP not configured)');
    return { ok: true };
  }

  try {
    const transport = getTransport();
    await transport.sendMail({ from: env.EMAIL_FROM, to, subject, html, text });
    logger.info({ to }, '[email] Password reset email sent');
    return { ok: true };
  } catch (err) {
    const error = (err as Error).message;
    logger.error({ to, error }, '[email] Failed to send password reset email');
    return { ok: false, error };
  }
}
