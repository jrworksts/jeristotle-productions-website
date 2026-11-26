import { sendSectorEmail } from "./sectorEmail";
import { outreachRuntimeActive, outreachDeadline, outreachDeadlineCheck, OUTREACH_PERSISTENCE_BUDGET_MS } from "./outreachDeadline";
import { randomBytes } from "node:crypto";
import nodemailer from "nodemailer";
import type { InsertProjectInquiry } from "../drizzle/schema";
import { CONSULTATION_CALENDAR_URL, JERISTOTLE_EMAIL } from "../shared/const";
import { assertActiveJeristotleEmailRecipients } from "../shared/personnelPolicy";

const escapeHtml = (value: string | null | undefined): string =>
  (value || "Not provided")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const row = (label: string, value: string | null | undefined): string => `
  <tr>
    <td style="padding:12px 16px 12px 0;border-bottom:1px solid #ece7dc;color:#6b665d;font-size:13px;line-height:1.45;vertical-align:top;width:44%;">${escapeHtml(label)}</td>
    <td style="padding:12px 0;border-bottom:1px solid #ece7dc;color:#111111;font-size:15px;font-weight:700;line-height:1.5;vertical-align:top;">${escapeHtml(value)}</td>
  </tr>`;

const sectionTitle = (title: string): string =>
  `<p style="margin:0 0 6px;color:#8a5d00;font-size:11px;font-weight:800;letter-spacing:1.8px;text-transform:uppercase;">${escapeHtml(title)}</p>`;

function submittedAtCentral(): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date());
}

export function buildInquiryEmail(inquiry: InsertProjectInquiry) {
  const subject = `New consultation request: ${inquiry.businessName} (${inquiry.fullName})`;
  const submittedAt = `${submittedAtCentral()} (Central)`;
  const phone = inquiry.phone || "";
  const phoneCell = phone
    ? `<a href="tel:${escapeHtml(phone)}" style="color:#111111;text-decoration:none;">${escapeHtml(phone)}</a>`
    : "Not provided";
  const emailCell = `<a href="mailto:${escapeHtml(inquiry.email)}" style="color:#111111;text-decoration:none;">${escapeHtml(inquiry.email)}</a>`;
  const linkRow = (label: string, html: string) => `
  <tr>
    <td style="padding:12px 16px 12px 0;border-bottom:1px solid #ece7dc;color:#6b665d;font-size:13px;line-height:1.45;vertical-align:top;width:44%;">${escapeHtml(label)}</td>
    <td style="padding:12px 0;border-bottom:1px solid #ece7dc;color:#111111;font-size:15px;font-weight:700;line-height:1.5;vertical-align:top;">${html}</td>
  </tr>`;

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="light">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;background:#f4f1e9;color:#111111;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f1e9;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#ffffff;border:1px solid #e4ddcc;">
            <tr><td style="height:8px;background:#ffb627;font-size:0;line-height:0;">&nbsp;</td></tr>
            <tr>
              <td style="padding:34px 36px 22px;">
                <p style="margin:0 0 10px;color:#8a5d00;font-size:11px;font-weight:800;letter-spacing:2.2px;text-transform:uppercase;">Jeristotle Productions · New lead</p>
                <h1 style="margin:0;color:#111111;font-size:30px;line-height:1.1;letter-spacing:-0.8px;">${escapeHtml(inquiry.businessName)}</h1>
                <p style="margin:12px 0 0;color:#5b574f;font-size:15px;line-height:1.6;">${escapeHtml(inquiry.fullName)} submitted a consultation brief on jeristotleproductions.com and was sent to the booking calendar.</p>
                <p style="margin:8px 0 0;color:#8b867c;font-size:13px;">Submitted ${escapeHtml(submittedAt)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 36px 26px;">
                ${sectionTitle("Contact")}
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  ${row("Your name", inquiry.fullName)}
                  ${row("Business / organization", inquiry.businessName)}
                  ${linkRow("Email", emailCell)}
                  ${linkRow("Phone", phoneCell)}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 36px 26px;">
                ${sectionTitle("Project brief")}
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  ${row("What do you need most right now?", inquiry.projectType)}
                  ${row("Planned investment", inquiry.investment)}
                  ${row("What should happen after someone sees it?", inquiry.promotionGoal)}
                  ${row("Ideal timeline", inquiry.timeline)}
                  ${row("How did you find us?", inquiry.discoverySource)}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 36px 30px;">
                ${sectionTitle("What business goal should this content and campaign support?")}
                <div style="margin-top:8px;background:#fbf8f0;border-left:4px solid #ffb627;padding:18px 20px;color:#111111;font-size:15px;line-height:1.7;white-space:pre-wrap;">${escapeHtml(inquiry.goals)}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:0 36px 34px;">
                <a href="mailto:${escapeHtml(inquiry.email)}?subject=${encodeURIComponent(`Re: your Jeristotle consultation request`)}" style="display:inline-block;background:#111111;color:#ffffff;font-size:12px;font-weight:800;letter-spacing:1.4px;padding:15px 20px;text-decoration:none;text-transform:uppercase;">Reply to ${escapeHtml(inquiry.fullName)}</a>
                ${phone ? `<a href="tel:${escapeHtml(phone)}" style="display:inline-block;margin-left:8px;border:1px solid #111111;color:#111111;font-size:12px;font-weight:800;letter-spacing:1.4px;padding:14px 20px;text-decoration:none;text-transform:uppercase;">Call</a>` : ""}
                <a href="${CONSULTATION_CALENDAR_URL}" style="display:inline-block;margin-left:8px;background:#ffb627;color:#111111;font-size:12px;font-weight:800;letter-spacing:1.4px;padding:15px 20px;text-decoration:none;text-transform:uppercase;">Calendar</a>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 36px;border-top:1px solid #ece7dc;color:#8b867c;font-size:11px;line-height:1.6;">Sent automatically by the consultation form on jeristotleproductions.com. Replying to this email goes straight to ${escapeHtml(inquiry.email)}.</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    "NEW JERISTOTLE CONSULTATION REQUEST",
    `Submitted: ${submittedAt}`,
    "",
    "CONTACT",
    `Your name: ${inquiry.fullName}`,
    `Business / organization: ${inquiry.businessName}`,
    `Email: ${inquiry.email}`,
    `Phone: ${inquiry.phone || "Not provided"}`,
    "",
    "PROJECT BRIEF",
    `What do you need most right now? ${inquiry.projectType}`,
    `Planned investment: ${inquiry.investment}`,
    `What should happen after someone sees it? ${inquiry.promotionGoal || "Not provided"}`,
    `Ideal timeline: ${inquiry.timeline}`,
    `How did you find us? ${inquiry.discoverySource || "Not provided"}`,
    "",
    "WHAT BUSINESS GOAL SHOULD THIS CONTENT AND CAMPAIGN SUPPORT?",
    inquiry.goals,
    "",
    `Consultation calendar: ${CONSULTATION_CALENDAR_URL}`,
  ].join("\n");

  return { subject, html, text };
}

export function buildInquiryEmailEnvelope(replyTo: string) {
  return {
    from: `"Jeristotle Productions" <${JERISTOTLE_EMAIL}>`,
    to: JERISTOTLE_EMAIL,
    replyTo,
  } as const;
}

function createInquiryEmailTransport() {
  const pass = process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS;
  if (!pass) return null;

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT || "465"),
    secure: process.env.SMTP_SECURE !== "false",
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
    auth: { user: JERISTOTLE_EMAIL, pass },
  });
}

export async function verifyInquiryEmailTransport(): Promise<{
  configured: boolean;
  verified: boolean;
}> {
  const transporter = createInquiryEmailTransport();
  if (!transporter) return { configured: false, verified: false };

  await transporter.verify();
  return { configured: true, verified: true };
}

export async function sendJeristotleHtmlEmail(message: {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  inReplyTo?: string;
  references?: string | string[];
  headers?: Record<string, string>;
  messageId?: string;
}): Promise<{ configured: boolean; sent: boolean; messageId?: string }> {
  assertActiveJeristotleEmailRecipients(message.to);
  if (outreachRuntimeActive()) {
    outreachDeadlineCheck(OUTREACH_PERSISTENCE_BUDGET_MS);
    return sendSectorEmail({
      ...message,
      replyTo: message.replyTo || JERISTOTLE_EMAIL,
      messageId: message.messageId || `<outreach-${randomBytes(18).toString("hex")}@jeristotleproductions.com>`,
      references: Array.isArray(message.references) ? message.references.join(" ") : message.references,
      headers: message.headers || {},
    }, { deadline: outreachDeadline() - OUTREACH_PERSISTENCE_BUDGET_MS });
  }
  const transporter = createInquiryEmailTransport();
  if (!transporter) return { configured: false, sent: false };

  const result = await transporter.sendMail({
    from: `"Jeristotle Productions" <${JERISTOTLE_EMAIL}>`,
    ...message,
  });
  const accepted = Array.isArray(result.accepted) && result.accepted.length > 0;
  const rejected = Array.isArray(result.rejected) && result.rejected.length > 0;
  if (!accepted || rejected)
    throw new Error("SMTP did not accept every requested recipient");
  return { configured: true, sent: true, messageId: result.messageId };
}

export async function sendInquiryEmail(
  inquiry: InsertProjectInquiry
): Promise<{ configured: boolean; sent: boolean; messageId?: string }> {
  const message = buildInquiryEmail(inquiry);
  const envelope = buildInquiryEmailEnvelope(inquiry.email);
  return sendJeristotleHtmlEmail({
    to: envelope.to,
    replyTo: envelope.replyTo,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}
