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
    <td style="padding:12px 0;border-bottom:1px solid #2b2b2b;color:#9f9f9f;font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;vertical-align:top;width:160px;">${escapeHtml(label)}</td>
    <td style="padding:12px 0;border-bottom:1px solid #2b2b2b;color:#f5f2eb;font-size:15px;line-height:1.55;vertical-align:top;">${escapeHtml(value)}</td>
  </tr>`;

export function buildInquiryEmail(inquiry: InsertProjectInquiry) {
  const subject = `New consultation request: ${inquiry.businessName}`;
  const phoneLink = inquiry.phone
    ? `<a href="tel:${escapeHtml(inquiry.phone)}" style="color:#ffb627;text-decoration:none;">${escapeHtml(inquiry.phone)}</a>`
    : "Not provided";

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;background:#090909;color:#f5f2eb;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#090909;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#111111;border:1px solid #2b2b2b;">
            <tr>
              <td style="height:8px;background:#ffb627;font-size:0;line-height:0;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:38px 40px 24px;">
                <p style="margin:0 0 12px;color:#ffb627;font-size:11px;font-weight:800;letter-spacing:2.2px;text-transform:uppercase;">Jeristotle Productions</p>
                <h1 style="margin:0;color:#ffffff;font-size:36px;line-height:1.05;letter-spacing:-1.2px;text-transform:uppercase;">A new consultation request is ready.</h1>
                <p style="margin:18px 0 0;color:#b8b8b8;font-size:16px;line-height:1.65;">${escapeHtml(inquiry.fullName)} from <strong style="color:#ffffff;">${escapeHtml(inquiry.businessName)}</strong> submitted a production and promotion brief and was sent to the discovery-call calendar.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 40px 32px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  ${row("Project", inquiry.projectType)}
                  ${row("Promotion goal", inquiry.promotionGoal)}
                  ${row("Investment", inquiry.investment)}
                  ${row("Timeline", inquiry.timeline)}
                  ${row("Lead source", inquiry.discoverySource)}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 40px 32px;">
                <p style="margin:0 0 10px;color:#ffb627;font-size:11px;font-weight:800;letter-spacing:1.8px;text-transform:uppercase;">What they need to make happen</p>
                <div style="background:#1a1a1a;border-left:4px solid #ffb627;padding:20px;color:#f5f2eb;font-size:16px;line-height:1.7;">${escapeHtml(inquiry.goals)}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:0 40px 38px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#ffb627;">
                  <tr>
                    <td style="padding:22px;">
                      <p style="margin:0 0 6px;color:#4b3300;font-size:10px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;">Reply directly</p>
                      <a href="mailto:${escapeHtml(inquiry.email)}" style="color:#000000;font-size:18px;font-weight:800;text-decoration:none;">${escapeHtml(inquiry.email)}</a>
                    </td>
                    <td align="right" style="padding:22px;color:#000000;font-size:15px;font-weight:700;">${phoneLink}</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 40px 38px;">
                <a href="${CONSULTATION_CALENDAR_URL}" style="display:inline-block;background:#ffffff;color:#000000;font-size:12px;font-weight:800;letter-spacing:1.4px;padding:16px 20px;text-decoration:none;text-transform:uppercase;">Open consultation calendar</a>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 40px;border-top:1px solid #2b2b2b;color:#727272;font-size:11px;line-height:1.6;">This inquiry was submitted through jeristotleproductions.com. A protected local copy remains in the self-hosted lead store.</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    "NEW JERISTOTLE PROJECT INQUIRY",
    "",
    `Name: ${inquiry.fullName}`,
    `Business: ${inquiry.businessName}`,
    `Email: ${inquiry.email}`,
    `Phone: ${inquiry.phone || "Not provided"}`,
    `Project: ${inquiry.projectType}`,
    `Promotion goal: ${inquiry.promotionGoal || "Not provided"}`,
    `Investment: ${inquiry.investment}`,
    `Timeline: ${inquiry.timeline}`,
    `Lead source: ${inquiry.discoverySource || "Not provided"}`,
    "",
    "GOALS",
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
