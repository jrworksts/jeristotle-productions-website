/**
 * Jeristotle Productions: website lead mailer (Google Apps Script)
 *
 * Receives consultation briefs from the website's /api/inquiry function and
 * emails each one to you from your own Gmail.
 *
 * Setup (one time):
 * 1. Go to https://script.google.com while signed in as jeremy@jeristotleproductions.com
 *    and click New project. Paste this whole file over the starter code.
 * 2. Project Settings > Script Properties > Add property:
 *      LEAD_SECRET = (the same random value you put in Cloudflare)
 * 3. Deploy > New deployment > type "Web app".
 *      Execute as: Me    Who has access: Anyone
 *    Approve the permission prompt, then copy the Web app URL.
 */

const LEAD_RECIPIENT = "jeremy@jeristotleproductions.com";

function doPost(e) {
  const props = PropertiesService.getScriptProperties();
  let lead;
  try {
    lead = JSON.parse(e.postData.contents);
  } catch (err) {
    return respond({ ok: false, error: "bad json" });
  }
  if (!lead || lead.secret !== props.getProperty("LEAD_SECRET")) {
    return respond({ ok: false, error: "unauthorized" });
  }

  const rows = [
    ["Name", lead.full_name],
    ["Business", lead.company_name],
    ["Email", lead.email],
    ["Phone", lead.phone || "Not provided"],
    ["Needs most", lead.project_type],
    ["After someone sees it", lead.promotion_goal],
    ["Planned investment", lead.investment],
    ["Timeline", lead.timeline],
    ["Found us via", lead.discovery_source || "Not provided"],
  ];

  const esc = s =>
    String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const html =
    '<div style="background:#050505;padding:32px;font-family:Arial,sans-serif;color:#f1ede6">' +
    '<p style="color:#ffb627;font-size:11px;letter-spacing:3px;font-weight:bold;margin:0 0 8px">NEW PROJECT INQUIRY</p>' +
    '<h1 style="margin:0 0 24px;font-size:26px;color:#ffffff">' + esc(lead.company_name) + "</h1>" +
    '<table cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;border-collapse:collapse">' +
    rows.map(r =>
      '<tr><td style="padding:10px 0;border-bottom:1px solid #222;color:#9a958d;font-size:13px;width:180px;vertical-align:top">' +
      esc(r[0]) + '</td><td style="padding:10px 0;border-bottom:1px solid #222;font-size:14px;color:#ffffff">' +
      esc(r[1]) + "</td></tr>").join("") +
    "</table>" +
    '<p style="color:#9a958d;font-size:13px;margin:24px 0 6px">Business goal</p>' +
    '<p style="font-size:15px;line-height:1.6;margin:0;white-space:pre-wrap;color:#ffffff">' + esc(lead.goals) + "</p>" +
    '<p style="margin:28px 0 0"><a href="mailto:' + esc(lead.email) +
    '" style="background:#ffb627;color:#050505;padding:12px 18px;text-decoration:none;font-weight:bold;font-size:13px">Reply to ' +
    esc(lead.full_name) + "</a></p></div>";

  const text =
    rows.map(r => r[0] + ": " + (r[1] || "")).join("\n") + "\n\nBusiness goal:\n" + (lead.goals || "");

  GmailApp.sendEmail(
    LEAD_RECIPIENT,
    "New Jeristotle inquiry: " + lead.company_name + " (" + lead.full_name + ")",
    text,
    { htmlBody: html, replyTo: lead.email, name: "Jeristotle Website" }
  );
  return respond({ ok: true });
}

function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
