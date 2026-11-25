import type { OutreachAlertIssue, OutreachCampaignKey } from "./outreachAlerts";
import {
  OUTREACH_DAILY_NEW_CONTACT_LIMIT,
  OUTREACH_READY_BUFFER_TARGET,
  OUTREACH_REFILL_START_BELOW,
} from "./outreachMaintenance";
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!
  );
const safe = (s: string, max = 320) =>
  s
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted]")
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, "[redacted link]")
    .replace(
      /\b(?:password|secret|token|authorization|bearer|api[_ -]?key)\s*[:=]\s*\S+/gi,
      "[redacted]"
    )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
const count = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0
    ? String(Math.floor(v))
    : "Unknown";
const date = (v: Date | null | undefined) =>
  v instanceof Date && Number.isFinite(v.getTime())
    ? new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Chicago",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      }).format(v)
    : "Not verified / unavailable";
function href(key: OutreachCampaignKey) {
  const anchor =
    (
      {
        chamber: "outreach",
        credit_union: "credit-unions",
        brand_video: "brand-video",
        training: "training",
        hustle: "hustle",
        tourism: "tourism",
        real_estate: "real-estate",
        industrial: "industrial",
        healthcare: "healthcare",
      } as const
    )[key] ?? "campaigns";
  return `https://jeristotleproductions.com/chamber-growth#${anchor}`;
}
function research(issue: OutreachAlertIssue) {
  switch (issue.researchState) {
    case "pending":
      return "Research pending; existing lease is preserved. Completion is not yet verified.";
    case "exhausted":
      return "Recorded research exhausted eligible public sources; additional verified supply is not guaranteed.";
    case "source_holds":
      return "Retained source / qualification / approval holds prevent these contacts from entering READY NEW.";
    case "not_requested":
      return "No verified refill is pending. Only the next eligible opportunity is shown.";
    default:
      return "Research state unavailable; no pending or completed refill is assumed.";
  }
}
export function renderOutreachAlertEmail(
  issues: OutreachAlertIssue[],
  localDate: string
) {
  const safeDate = safe(localDate, 40) || "Current Central date";
  const n = issues.length;
  const empty = issues.some(i => i.kind === "ready_new_empty");
  const subject = `Jeristotle Productions outreach alert: ${n} ${n === 1 ? "campaign" : "campaigns"} to review (${safeDate})`;
  const intro = empty
    ? "Your outreach reserve has run out in the campaigns below. Verified READY NEW is 0; future new-contact cadence needs replenishment."
    : "A verified owner action requires your attention.";
  const facts = (i: OutreachAlertIssue) => [
    ["READY NEW", count(i.readyCount)],
    [
      "Daily NEW cap",
      `${count(i.dailyLimit ?? OUTREACH_DAILY_NEW_CONTACT_LIMIT)}/day current configured cap; follow-ups additional`,
    ],
    ...(i.dailyLimit != null &&
    i.dailyLimit !== (i.requestedDailyLimit ?? OUTREACH_DAILY_NEW_CONTACT_LIMIT)
      ? [
          [
            "Requested daily NEW policy",
            `${count(i.requestedDailyLimit ?? OUTREACH_DAILY_NEW_CONTACT_LIMIT)}/day; not yet persisted / activated`,
          ],
        ]
      : []),
    ...(i.persistedReserveTarget != null
      ? [["Current persisted reserve target", count(i.persistedReserveTarget)]]
      : []),
    [
      "Desired reserve",
      `${count(i.desiredReserve ?? OUTREACH_READY_BUFFER_TARGET)} verified new contacts (requested shared policy; not proof of filled stock)`,
    ],
    [
      "Refill threshold",
      `Strictly below ${count(i.refillThreshold ?? OUTREACH_REFILL_START_BELOW)}`,
    ],
    ["New SMTP accepted today", count(i.newAccepted)],
    ["Follow-up SMTP accepted today", count(i.followupAccepted)],
    ["Last verified send", date(i.lastVerifiedSendAt)],
    ["Next eligible refill opportunity", date(i.nextRefillOpportunityAt)],
    [
      "Existing research lease until",
      i.researchLeaseUntil
        ? date(i.researchLeaseUntil)
        : "No persisted active lease reported",
    ],
  ];
  const text = [
    "Jeristotle Productions: Outbound outreach alert",
    `Central date: ${safeDate}`,
    "",
    intro,
    "",
    ...issues.flatMap(i => [
      safe(i.label, 120) || "Campaign",
      `Reason: ${safe(i.detail) || "Verified readiness needs review."}`,
      ...(i.ownerAction
        ? ["Your action: reconnect the sending mailbox credentials."]
        : []),
      ...facts(i).map(([k, v]) => `${k}: ${v}`),
      research(i),
      `Growth Hub: ${href(i.campaignKey)}`,
      "",
    ]),
    "Eligible overnight window: 1:00–5:59 AM America/Chicago, subject to the live callback schedule, preserved leases and source checks. An opportunity is not a guaranteed refill or send.",
    "SMTP acceptance is not inbox delivery. These alerts never resend prospects or modify schedules.",
    "One initial alert per empty episode; at most one grouped initial attempt per Central day. No routine reminders. Reset occurs only after verified READY NEW exceeds 0.",
  ].join("\n");
  const rows = issues
    .map(
      i => `<tr><td bgcolor="#151515" style="padding:24px;background-color:#151515;color:#ffffff;border-top:1px solid #3a3322;">
    <h2 style="margin:0 0 10px;background-color:#151515;color:#ffffff;font-size:19px;line-height:1.4;">${esc(safe(i.label, 120) || "Campaign")}</h2>
    <p style="margin:0 0 16px;background-color:#151515;color:#ffffff;font-size:14px;line-height:1.65;">${esc(safe(i.detail) || "Verified readiness needs review.")}</p>
    ${i.ownerAction ? '<p style="margin:0 0 16px;background-color:#151515;color:#ffffff;font-size:14px;font-weight:700;">Your action: reconnect the sending mailbox credentials.</p>' : ""}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#151515" style="background-color:#151515;">${facts(
      i
    )
      .map(
        ([k, v]) =>
          `<tr><td width="44%" style="padding:9px 8px;background-color:#151515;color:#ffcf67;border-bottom:1px solid #333333;font-size:12px;line-height:1.5;vertical-align:top;">${esc(k)}</td><td style="padding:9px 8px;background-color:#151515;color:#ffffff;border-bottom:1px solid #333333;font-size:13px;line-height:1.5;vertical-align:top;font-weight:${k === "READY NEW" ? "800" : "400"};">${esc(v)}</td></tr>`
      )
      .join("")}</table>
    <p style="margin:16px 0;background-color:#151515;color:#ffffff;font-size:13px;line-height:1.65;">${esc(research(i))}</p>
    <table role="presentation" cellpadding="0" cellspacing="0" bgcolor="#ffb627" style="background-color:#ffb627;"><tr><td style="padding:13px 18px;background-color:#ffb627;color:#111111;"><a href="${esc(href(i.campaignKey))}" style="background-color:#ffb627;color:#111111;font-size:13px;font-weight:800;text-decoration:none;">Open Growth Hub →</a></td></tr></table>
  </td></tr>`
    )
    .join("");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body bgcolor="#090909" style="margin:0;padding:0;background-color:#090909;color:#ffffff;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#090909" style="background-color:#090909;color:#ffffff;"><tr><td align="center" style="padding:26px 12px;background-color:#090909;color:#ffffff;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#151515" style="max-width:620px;background-color:#151515;color:#ffffff;border:1px solid #3a3322;">
  <tr><td height="6" bgcolor="#ffb627" style="height:6px;background-color:#ffb627;color:#111111;font-size:0;">&nbsp;</td></tr>
  <tr><td style="padding:28px 24px;background-color:#111111;color:#ffffff;"><p style="margin:0 0 12px;background-color:#111111;color:#ffcf67;font-size:11px;font-weight:800;letter-spacing:2px;">JERISTOTLE PRODUCTIONS</p><h1 style="margin:0 0 12px;background-color:#111111;color:#ffffff;font-size:28px;line-height:1.2;">${empty ? "Your outreach reserve is empty." : "Outreach needs your attention."}</h1><p style="margin:0;background-color:#111111;color:#ffffff;font-size:13px;line-height:1.5;">Central date: ${esc(safeDate)} · ${n} ${n === 1 ? "campaign" : "campaigns"}</p></td></tr>
  <tr><td style="padding:20px 24px;background-color:#1c1c1c;color:#ffffff;font-size:14px;line-height:1.65;">${esc(intro)}</td></tr>${rows || '<tr><td style="padding:24px;background-color:#151515;color:#ffffff;">No campaign issues were supplied.</td></tr>'}
  <tr><td style="padding:20px 24px;background-color:#111111;color:#ffffff;font-size:12px;line-height:1.7;">Eligible overnight window: 1:00–5:59 AM America/Chicago, subject to the live callback schedule, preserved leases and source checks. An opportunity is not a guaranteed refill or send.<br><br>SMTP acceptance is not inbox delivery. These alerts never resend prospects or modify schedules.<br>One initial alert per empty episode; at most one grouped initial attempt per Central day. No routine reminders. Reset occurs only after verified READY NEW exceeds 0.</td></tr>
  </table></td></tr></table></body></html>`;
  return { subject, text, html };
}
