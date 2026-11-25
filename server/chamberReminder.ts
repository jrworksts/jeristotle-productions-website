import type { Request, Response } from "express";
import type { ChamberAction } from "../drizzle/schema";
import { CHAMBER_GROWTH_URL, JERISTOTLE_EMAIL } from "../shared/const";
import { sdk } from "./_core/sdk";
import { notifyOwner } from "./_core/notification";
import {
  runReliableGrowthReminder,
  safeReminderError,
} from "./growthReminderReliability";

const CENTRAL_TIME_ZONE = "America/Chicago";

const escapeHtml = (value: string | null | undefined) =>
  (value || "Not provided")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export function getCentralScheduleMoment(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CENTRAL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(part => part.type === type)?.value ?? "";

  return {
    dateKey: `${value("year")}-${value("month")}-${value("day")}`,
    weekday: value("weekday"),
    hour: Number(value("hour")),
  };
}

export function buildChamberTaskReminderEmail(input: {
  action: ChamberAction;
  complete: number;
  total: number;
  weekday: string;
}) {
  const { action, complete, total, weekday } = input;
  const blueprint = action.slug.startsWith("ddb-");
  const workspaceLabel = blueprint
    ? "Digital Dominance Growth"
    : "Chamber Growth";
  const stepNumber = blueprint
    ? action.sortOrder + 1
    : Math.max(1, action.sortOrder);
  const percent = total > 0 ? Math.round((complete / total) * 100) : 0;
  const phase = action.phase.replaceAll("_", " ").replace("days ", "days ");
  const subject = `${weekday} ${blueprint ? "growth" : "Chamber"} action: ${action.title}`;
  const safeTitle = escapeHtml(action.title);
  const safeDescription = escapeHtml(action.description);
  const safeOwner = escapeHtml(action.owner);
  const safeCategory = escapeHtml(action.category);
  const safeNotes = action.notes
    ? escapeHtml(action.notes)
    : "No working notes yet.";

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;background-color:#f4f1e9;color:#181818;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background-color:#f4f1e9;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:620px;background-color:#ffffff;border:1px solid #ded8ca;box-shadow:0 12px 32px rgba(42,35,20,0.08);">
            <tr><td style="height:8px;background-color:#ffb627;font-size:0;line-height:0;">&nbsp;</td></tr>
            <tr>
              <td style="padding:36px 38px 22px;">
                <p style="margin:0 0 12px;color:#9b6a00;font-size:11px;font-weight:800;letter-spacing:2.2px;text-transform:uppercase;">Jeristotle Productions · ${workspaceLabel}</p>
                <h1 style="margin:0;color:#111111;font-size:38px;line-height:1.02;letter-spacing:-1.3px;text-transform:uppercase;">Your ${escapeHtml(weekday)} action is ready.</h1>
                <p style="margin:16px 0 0;color:#68635a;font-size:16px;line-height:1.6;">One task. Finish it, check it off, and the next action will be ready for the following reminder.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 38px 30px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background-color:#fff8e7;border:1px solid #f1dfb8;border-left:6px solid #ffb627;">
                  <tr>
                    <td style="padding:28px 28px 10px;color:#8a5b00;font-size:10px;font-weight:800;letter-spacing:1.8px;text-transform:uppercase;">Step ${stepNumber} of ${total} · ${escapeHtml(phase)} · ${safeCategory}</td>
                  </tr>
                  <tr>
                    <td style="padding:0 28px 18px;color:#0b0b0b;font-size:30px;font-weight:900;line-height:1.08;letter-spacing:-0.8px;">${safeTitle}</td>
                  </tr>
                  <tr>
                    <td style="padding:0 28px 28px;color:#47433b;font-size:16px;line-height:1.65;">${safeDescription}</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 38px 30px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;">
                  <tr>
                    <td width="50%" style="padding:16px 18px;background-color:#f7f4ed;border:1px solid #e5dfd1;border-right:6px solid #ffffff;vertical-align:top;">
                      <p style="margin:0 0 6px;color:#9b6a00;font-size:10px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;">Owner</p>
                      <p style="margin:0;color:#111111;font-size:17px;font-weight:800;">${safeOwner}</p>
                    </td>
                    <td width="50%" style="padding:16px 18px;background-color:#f7f4ed;border:1px solid #e5dfd1;vertical-align:top;">
                      <p style="margin:0 0 6px;color:#9b6a00;font-size:10px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;">Progress</p>
                      <p style="margin:0;color:#111111;font-size:17px;font-weight:800;">${complete}/${total} complete · ${percent}%</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 38px 30px;">
                <p style="margin:0 0 8px;color:#9b6a00;font-size:10px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;">Working notes</p>
                <p style="margin:0;background-color:#f7f4ed;border:1px solid #e5dfd1;color:#514c44;font-size:14px;line-height:1.6;padding:16px 18px;">${safeNotes}</p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:0 38px 38px;">
                <a href="${CHAMBER_GROWTH_URL}" style="display:block;background-color:#ffb627;color:#000000;font-size:13px;font-weight:900;letter-spacing:1.5px;padding:18px 22px;text-decoration:none;text-transform:uppercase;">Open the task and check it off →</a>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 38px;background-color:#fbfaf7;border-top:1px solid #e5dfd1;color:#817b71;font-size:11px;line-height:1.6;">Sent automatically every Tuesday and Thursday at 8:00 AM Central from ${JERISTOTLE_EMAIL}. The task shown is the current ready action in the active growth checklist.</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    `YOUR ${weekday.toUpperCase()} ${blueprint ? "GROWTH" : "CHAMBER"} ACTION`,
    "",
    `Step ${stepNumber} of ${total}: ${action.title}`,
    action.description,
    "",
    `Owner: ${action.owner}`,
    `Progress: ${complete}/${total} complete (${percent}%)`,
    `Working notes: ${action.notes || "No working notes yet."}`,
    "",
    `Open the checklist: ${CHAMBER_GROWTH_URL}`,
  ].join("\n");

  return { subject, html, text };
}

export async function runChamberTaskReminder(options: {
  taskUid: string;
  now?: Date;
  manual?: boolean;
}) {
  const now = options.now ?? new Date();
  const moment = getCentralScheduleMoment(now);
  return runReliableGrowthReminder({
    taskUid: options.taskUid,
    now,
    localDate: moment.dateKey,
    hour: moment.hour,
    manual: options.manual,
  });
}

export async function chamberTaskReminderHandler(req: Request, res: Response) {
  let authorizedCron = false;
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid)
      return res.status(403).json({ error: "cron-only endpoint" });
    authorizedCron = true;
    const result = await runChamberTaskReminder({ taskUid: user.taskUid });
    return res.status(result.ok ? 200 : 503).json(result);
  } catch (error) {
    if (!authorizedCron)
      return res.status(403).json({ error: "cron-only endpoint" });
    console.error(
      "[ChamberReminder] callback failed",
      safeReminderError(error)
    );
    try {
      await notifyOwner({
        title: "Daily task reminder callback failed",
        content:
          "The app could not confirm today's task email. Check the reminder execution log; no delivery is being claimed.",
      });
    } catch {}
    return res.status(500).json({
      error: safeReminderError(error),
      context: { url: req.originalUrl },
      timestamp: new Date().toISOString(),
    });
  }
}
