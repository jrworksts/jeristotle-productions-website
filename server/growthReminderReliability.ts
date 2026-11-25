import { createHash } from "node:crypto";
import { JERISTOTLE_EMAIL } from "../shared/const";
import { growthLocalDate } from "../shared/growthChecklist";
import { getGrowthWorkspace } from "./growthDb";
import { buildGrowthReminderData } from "./growthReminderData";
import { buildGrowthReminderEmail } from "./growthReminderEmail";
import {
  sendJeristotleHtmlEmail,
  verifyInquiryEmailTransport,
} from "./inquiryEmail";
import {
  recordChamberReminderDelivery,
  releaseChamberReminderSend,
  reserveChamberReminderSend,
} from "./db";
import { notifyOwner } from "./_core/notification";
import {
  claimReminderDay,
  claimReminderFailureAlert,
  ensureReminderDay,
  getReminderSchedule,
  patchReminderDay,
  previousReminderProgress,
} from "./growthReminderDeliveryDb";
import { findReminderSentMessage } from "./growthReminderMailbox";

export function reminderMessageId(
  taskUid: string,
  localDate: string,
  failure = false
) {
  const key = createHash("sha256").update(taskUid).digest("hex").slice(0, 16);
  return `<growth-${failure ? "failure" : "tasks"}-${localDate}-${key}@jeristotleproductions.com>`;
}
const esc = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
export function safeReminderError(error: unknown): string {
  const e = error as { code?: string; responseCode?: number };
  // Do not include provider payloads, credentials, stack traces, or arbitrary exception messages in email.
  const code =
    typeof e?.code === "string" && /^[A-Z0-9_-]{1,30}$/.test(e.code)
      ? e.code
      : "APPLICATION_ERROR";
  return `Task reminder could not confirm delivery (${code}${e?.responseCode ? `; SMTP ${Number(e.responseCode)}` : ""}). See the app's delivery record.`;
}
export function buildReminderFailureEmail(localDate: string, detail: string) {
  const subject = `Daily task email needs attention: ${localDate}`;
  const text = [
    "JERISTOTLE PRODUCTIONS · DAILY TASK DELIVERY",
    localDate,
    "",
    detail,
    "An email failure does not change your task or complete any work.",
    "If delivery is uncertain, the app will not resend the task automatically.",
    "Open today's task: https://jeristotleproductions.com/chamber-growth#today",
  ].join("\n");
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f4f1e9;font-family:Arial,sans-serif;color:#111"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" style="max-width:620px;background:#fff;border:1px solid #ded8ca" cellpadding="0" cellspacing="0"><tr><td style="padding:28px;background:#111;border-top:7px solid #ffb627;color:#fff"><p style="color:#ffcf61;font-size:11px;letter-spacing:1.5px">JERISTOTLE PRODUCTIONS</p><h1 style="font-size:28px;line-height:1.2;margin:0">Daily task email needs attention</h1><p>${esc(localDate)}</p></td></tr><tr><td style="padding:28px;font-size:15px;line-height:1.65"><p>${esc(detail)}</p><p>Your task remains in the app. This alert does not change progress or add another daily task.</p><p>If the task's delivery is uncertain, it will not be resent automatically.</p><a href="https://jeristotleproductions.com/chamber-growth#today" style="display:block;background:#ffb627;color:#111;text-align:center;padding:16px;font-weight:bold;text-decoration:none">OPEN TODAY'S TASK</a></td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html };
}

async function sendFailureAlert(
  taskUid: string,
  localDate: string,
  detail: string
) {
  let day = await ensureReminderDay(taskUid, localDate);
  if (day.failureAlertState === "sent" || day.failureAlertState === "uncertain")
    return { emailSent: day.failureAlertState === "sent" };
  if (!day.ownerNotified) {
    try {
      if (
        await notifyOwner({
          title: `Daily task delivery needs attention: ${localDate}`,
          content: detail,
        })
      )
        await patchReminderDay(taskUid, localDate, { ownerNotified: 1 });
    } catch {
      console.error("[GrowthReminder] Owner notification unavailable");
    }
  }
  // Alert has its own preflight and claim: no automatic re-send after ambiguous SMTP response.
  try {
    const ready = await verifyInquiryEmailTransport();
    if (!ready.verified) return { emailSent: false };
    if (!(await claimReminderFailureAlert(taskUid, localDate)))
      return { emailSent: false };
    const result = await sendJeristotleHtmlEmail({
      to: JERISTOTLE_EMAIL,
      ...buildReminderFailureEmail(localDate, detail),
      messageId: reminderMessageId(taskUid, localDate, true),
    });
    if (!result.sent || !result.messageId) {
      await patchReminderDay(taskUid, localDate, {
        failureAlertState: "uncertain",
      });
      return { emailSent: false };
    }
    await patchReminderDay(taskUid, localDate, {
      failureAlertState: "sent",
      failureMessageId: result.messageId,
    });
    return { emailSent: true };
  } catch {
    day = await ensureReminderDay(taskUid, localDate);
    if (day.failureAlertState === "sending")
      await patchReminderDay(taskUid, localDate, {
        failureAlertState: "uncertain",
      });
    console.error(
      "[GrowthReminder] Failure email unavailable; check in-app alert and delivery ledger"
    );
    return { emailSent: false };
  }
}

async function retryRecoveredFailureAlert(
  taskUid: string,
  localDate: string,
  day: Awaited<ReturnType<typeof ensureReminderDay>>
) {
  if (
    day.error &&
    day.failureAlertState === "pending" &&
    !day.error.startsWith("SMTP acceptance recorded")
  ) {
    await sendFailureAlert(
      taskUid,
      localDate,
      `An earlier task-email attempt failed or could not confirm delivery. The task email has since been accepted by SMTP. Earlier issue: ${day.error}`
    );
  }
}

export async function runReliableGrowthReminder(options: {
  taskUid: string;
  now: Date;
  localDate: string;
  hour: number;
  manual?: boolean;
}) {
  const { taskUid, localDate, now, hour } = options;
  // Morning retries stop at noon. Manual catch-up is internal only and must use the real current Central date.
  if (options.manual && localDate !== growthLocalDate())
    return { ok: false, skipped: "manual-catchup-must-be-today" };
  if (!options.manual && (hour < 8 || hour >= 12))
    return { ok: true, skipped: "outside-send-window" };
  const schedule = await getReminderSchedule(taskUid);
  if (!schedule || schedule.status !== "active")
    return { ok: true, skipped: "orphan-or-paused" };
  let day = await ensureReminderDay(taskUid, localDate);
  const messageId = reminderMessageId(taskUid, localDate);
  // Legacy receipt is authoritative, including today's manually sent catch-up.
  if (schedule.lastSentDate === localDate && schedule.lastMessageId) {
    if (day.state !== "sent")
      await patchReminderDay(taskUid, localDate, {
        state: "sent",
        messageId: schedule.lastMessageId,
        actionId: schedule.lastTaskId,
      });
    await retryRecoveredFailureAlert(taskUid, localDate, day);
    return {
      ok: true,
      skipped: "already-sent",
      messageId: schedule.lastMessageId,
    };
  }
  if (day.state === "sent") {
    await retryRecoveredFailureAlert(taskUid, localDate, day);
    return { ok: true, skipped: "already-sent", messageId: day.messageId };
  }
  if (
    day.state === "sending" &&
    now.getTime() - day.updatedAt.getTime() < 5 * 60_000
  )
    return { ok: true, skipped: "send-in-progress" };
  if (
    day.state === "sending" ||
    day.state === "uncertain" ||
    (schedule.lastSentDate === localDate && !schedule.lastMessageId)
  ) {
    let confirmed = false;
    try {
      confirmed = await findReminderSentMessage(messageId);
    } catch {
      /* Unknown stays reserved */
    }
    if (confirmed) {
      await patchReminderDay(taskUid, localDate, { state: "sent", messageId });
      if (day.actionId !== null)
        await recordChamberReminderDelivery(
          taskUid,
          localDate,
          day.actionId,
          messageId
        );
      return { ok: true, reconciled: true, messageId };
    }
    const detail =
      "Today's task email delivery is uncertain. The send reservation is retained to avoid a duplicate; manual review is required.";
    await patchReminderDay(taskUid, localDate, {
      state: "uncertain",
      error: detail,
    });
    const alert = await sendFailureAlert(taskUid, localDate, detail);
    return {
      ok: false,
      skipped: "delivery-uncertain",
      failureEmailSent: alert.emailSent,
    };
  }
  let actionId: number | null = null;
  let transportStarted = false;
  let acceptedMessageId: string | null = null;
  let claimed = false;
  let reserved = false;
  try {
    const workspace = await getGrowthWorkspace(localDate);
    const data = buildGrowthReminderData(workspace);
    if (data.state === "prestart")
      return { ok: true, skipped: "plan-not-started" };
    if (data.dailyTaskIsPreview)
      throw new Error("Future task preview cannot be sent");
    actionId = data.dailyTask?.id ?? 0;
    const prior = await previousReminderProgress(taskUid, localDate);
    if (
      prior?.progressComplete !== null &&
      prior?.progressComplete !== undefined
    ) {
      data.progressChange = {
        sinceDate: prior.localDate,
        previousComplete: prior.progressComplete,
        change: data.progress.complete - prior.progressComplete,
      };
    }
    const message = buildGrowthReminderEmail(data);
    claimed = await claimReminderDay(
      taskUid,
      localDate,
      actionId,
      data.progress.complete
    );
    if (!claimed) return { ok: true, skipped: "claimed-by-another-callback" };
    const ready = await verifyInquiryEmailTransport();
    if (!ready.verified) throw new Error("SMTP is not configured");
    reserved = await reserveChamberReminderSend(taskUid, localDate, actionId);
    if (!reserved) {
      await patchReminderDay(taskUid, localDate, {
        state: "uncertain",
        error: "Existing daily reservation requires review",
      });
      return { ok: false, skipped: "existing-reservation" };
    }
    transportStarted = true;
    const delivery = await sendJeristotleHtmlEmail({
      to: JERISTOTLE_EMAIL,
      ...message,
      messageId,
    });
    if (!delivery.sent || !delivery.messageId) {
      // A missing receipt is not proof of non-delivery, even if the helper resolves rather than throws.
      throw new Error("SMTP acceptance was not confirmed");
    }
    acceptedMessageId = delivery.messageId;
    await patchReminderDay(taskUid, localDate, {
      state: "sent",
      messageId: delivery.messageId,
    });
    await recordChamberReminderDelivery(
      taskUid,
      localDate,
      actionId,
      delivery.messageId
    );
    await retryRecoveredFailureAlert(taskUid, localDate, day);
    return {
      ok: true,
      sent: true,
      actionId,
      localDate,
      taskCount: data.dailyTask ? 1 : 0,
      messageId: delivery.messageId,
    };
  } catch (error) {
    if (acceptedMessageId) {
      // SMTP succeeded. Tracking failure is NOT a delivery failure and must not send a false alarm.
      try {
        await patchReminderDay(taskUid, localDate, {
          state: "sent",
          messageId: acceptedMessageId,
          error:
            "SMTP acceptance recorded; a tracking update needs reconciliation. No resend is required.",
        });
      } catch {
        console.error(
          "[GrowthReminder] SMTP accepted; receipt persistence needs reconciliation"
        );
      }
      return {
        ok: true,
        sent: true,
        localDate,
        actionId,
        messageId: acceptedMessageId,
        bookkeepingWarning: true,
      };
    }
    const detail = safeReminderError(error);
    // A known SMTP-accepted receipt is never downgraded if only legacy bookkeeping fails.
    day = await ensureReminderDay(taskUid, localDate);
    if (day.state !== "sent")
      await patchReminderDay(taskUid, localDate, {
        state: transportStarted ? "uncertain" : "failed",
        error: detail,
      });
    if (reserved && !transportStarted && actionId !== null)
      await releaseChamberReminderSend(taskUid, localDate, actionId);
    const alert = await sendFailureAlert(taskUid, localDate, detail);
    return {
      ok: false,
      error: detail,
      localDate,
      failureEmailSent: alert.emailSent,
    };
  }
}
