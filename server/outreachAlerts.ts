import { createHash } from "node:crypto";
import type { Request, Response } from "express";
import {
  OUTREACH_ALERT_CALLBACK,
  OUTREACH_ALERT_CRON,
  OUTREACH_ALERT_RECIPIENT,
  OUTREACH_ALERT_RUNTIME_VERSION,
  evaluateOutreachAlert,
  evaluateOutreachReserveAlert,
  buildOutreachAlertEmail,
  type OutreachAlertIssue,
  type OutreachAlertSnapshot,
} from "../shared/outreachAlerts";
import { getOutreachLocalMoment } from "../shared/outreachSchedule";
import {
  loadOutreachAlertSnapshots,
  outreachAlertDayBounds,
} from "./outreachAlertSnapshots";
import {
  claimOutreachAlert,
  claimOutreachEmptyAlertGroup,
  resolveOutreachEmptyEpisodes,
  getOutreachAlertMonitor,
  markOutreachMonitorCheck,
  outreachIncidentKey,
  patchOutreachAlert,
  recentOutreachAlerts,
  recoverStaleOutreachAlertClaims,
  resolveOutreachAlerts,
  upsertOutreachAlert,
  applyOutreachCampaignBaselines,
  outreachCampaignBaselines,
} from "./outreachAlertsDb";
import {
  verifyInquiryEmailTransport,
  sendJeristotleHtmlEmail,
} from "./inquiryEmail";
import { notifyOwner } from "./_core/notification";
import { sdk } from "./_core/sdk";
import { listHeartbeatJobs } from "./_core/heartbeat";
import {
  isOwnerActionOutreachNotification,
  isVerifiedEmptyOutreachNotification,
  OUTREACH_ALERT_NOTIFICATION_POLICY,
} from "../shared/outreachAlertNotificationPolicy";

export function outreachAlertMessageId(key: string) {
  return `<outreach-alert-${createHash("sha256").update(key).digest("hex").slice(0, 32)}@jeristotleproductions.com>`;
}
export function isOutreachAlertWindow(now: Date) {
  const p = getOutreachLocalMoment(now);
  return p.hour >= 9 && p.hour <= 17 && (p.hour > 9 || p.minute >= 30);
}
async function ownerFallback(
  row: Awaited<ReturnType<typeof upsertOutreachAlert>>,
  issue: OutreachAlertIssue,
  localDate: string,
  now: Date
) {
  if (!isOwnerActionOutreachNotification(issue, now)) return false;
  if (!(await claimOutreachAlert(row.id, "owner", now))) return false;
  try {
    const notified = await notifyOwner({
      title: `Outreach needs attention: ${issue.label}`,
      content: `${localDate}. ${issue.detail} Alert email could not confirm acceptance. Open the Growth Hub's outreach delivery alerts. No prospect resend or campaign change was performed.`,
    });
    await patchOutreachAlert(row.id, {
      ownerState: notified ? "sent" : "uncertain",
      ownerNotifiedAt: notified ? now : null,
    });
    return notified;
  } catch {
    try {
      await patchOutreachAlert(row.id, { ownerState: "uncertain" });
    } catch {
      /* Preserve pre-notification claim. */
    }
    return false;
  }
}
export async function notifyOutreachIssue(
  issue: OutreachAlertIssue,
  localDate: string,
  now: Date
) {
  let row = await upsertOutreachAlert(issue, localDate, now);
  // Preserve unresolved diagnostics in the dashboard without an SMTP preflight,
  // notification claim, email or fallback push. Never change prospect state.
  if (!isOwnerActionOutreachNotification(issue, now))
    return { emailSent: false, ownerNotified: false, dashboardOnly: true };
  if (row.emailState === "sent")
    return { emailSent: false, alreadyNotified: true, ownerNotified: false };
  if (row.emailState === "sending")
    return { emailSent: false, alreadyNotified: true, ownerNotified: false };
  if (row.emailState === "uncertain")
    return {
      emailSent: false,
      alreadyNotified: true,
      ownerNotified: await ownerFallback(row, issue, localDate, now),
    };
  let acceptedMessageId: string | null = null;
  let claimed = false;
  try {
    const transport = await verifyInquiryEmailTransport();
    if (!transport.configured || !transport.verified)
      return {
        emailSent: false,
        ownerNotified: await ownerFallback(row, issue, localDate, now),
      };
    claimed = await claimOutreachAlert(row.id, "email", now);
    if (!claimed)
      return { emailSent: false, alreadyNotified: true, ownerNotified: false };
    const result = await sendJeristotleHtmlEmail({
      to: OUTREACH_ALERT_RECIPIENT,
      ...buildOutreachAlertEmail([issue], localDate),
      messageId: outreachAlertMessageId(row.dedupeKey),
    });
    if (!result.sent || !result.messageId)
      throw new Error("ALERT_SMTP_ACCEPTANCE_UNCONFIRMED");
    acceptedMessageId = result.messageId;
    await patchOutreachAlert(row.id, {
      emailState: "sent",
      emailAcceptedAt: new Date(),
      emailMessageId: result.messageId,
    });
    return { emailSent: true, ownerNotified: false };
  } catch {
    // SMTP acceptance cannot be undone by a later ledger update error.
    if (acceptedMessageId) {
      try {
        await patchOutreachAlert(row.id, {
          emailState: "sent",
          emailAcceptedAt: new Date(),
          emailMessageId: acceptedMessageId,
        });
      } catch {
        /* Existing claim prevents blind resend. */
      }
      return {
        emailSent: true,
        bookkeepingWarning: true,
        ownerNotified: false,
      };
    }
    if (claimed) {
      try {
        await patchOutreachAlert(row.id, { emailState: "uncertain" });
      } catch {
        /* Existing claim remains reserved. */
      }
    }
    return {
      emailSent: false,
      ownerNotified: await ownerFallback(row, issue, localDate, now),
    };
  }
}
/** Existing transport only, no new notifier or fallback push for empty stock. */
export async function notifyOutreachEmptyGroup(
  issues: OutreachAlertIssue[],
  localDate: string,
  now: Date
) {
  const eligible = issues.filter(isVerifiedEmptyOutreachNotification);
  if (!eligible.length) return { emailSent: false };
  const rows = await Promise.all(
    eligible.map(i => upsertOutreachAlert(i, localDate, now))
  );
  const bounds = outreachAlertDayBounds(now);
  const claimedRows = await claimOutreachEmptyAlertGroup(
    rows.map(r => r.id),
    now,
    bounds.start,
    bounds.end
  );
  if (!claimedRows.length) return { emailSent: false, alreadyNotified: true };
  const selected = eligible.filter(i =>
    claimedRows.some(r => r.campaignKey === i.campaignKey)
  );
  let acceptedMessageId: string | null = null;
  try {
    // Durable attempt group is reserved first; timeout/unknown acceptance is never blindly retried.
    const result = await sendJeristotleHtmlEmail({
      to: OUTREACH_ALERT_RECIPIENT,
      ...buildOutreachAlertEmail(selected, localDate),
      messageId: outreachAlertMessageId(
        claimedRows
          .map(r => r.dedupeKey)
          .sort()
          .join("|")
      ),
    });
    if (!result.sent || !result.messageId)
      throw new Error("ALERT_SMTP_ACCEPTANCE_UNCONFIRMED");
    acceptedMessageId = result.messageId;
    await Promise.all(
      claimedRows.map(r =>
        patchOutreachAlert(r.id, {
          emailState: "sent",
          emailAcceptedAt: now,
          emailMessageId: result.messageId,
        })
      )
    );
    return { emailSent: true };
  } catch {
    const patches = await Promise.allSettled(
      claimedRows.map(r =>
        patchOutreachAlert(
          r.id,
          acceptedMessageId
            ? {
                emailState: "sent",
                emailAcceptedAt: now,
                emailMessageId: acceptedMessageId,
              }
            : { emailState: "uncertain" }
        )
      )
    );
    return {
      emailSent: Boolean(acceptedMessageId),
      bookkeepingWarning: patches.some(p => p.status === "rejected"),
      acceptanceUnconfirmed: !acceptedMessageId,
    };
  }
}
export async function runOutreachAlerts(taskUid: string, now = new Date()) {
  if (process.env.NODE_ENV === "development")
    return { ok: true, skipped: "development-alert-sending-disabled" };
  const monitor = await getOutreachAlertMonitor(taskUid);
  if (!monitor || monitor.status !== "active")
    return { ok: true, skipped: "orphan-or-paused" };
  if (!isOutreachAlertWindow(now))
    return { ok: true, skipped: "outside-central-alert-window" };
  const snapshots = await applyOutreachCampaignBaselines(
    monitor,
    await loadOutreachAlertSnapshots(now),
    now
  );
  const localDate = getOutreachLocalMoment(now).dateKey;
  const issues = snapshots
    .map(s => evaluateOutreachAlert(s, now))
    .filter((s): s is OutreachAlertIssue => Boolean(s));
  const emptyIssues = snapshots
    .map(s => evaluateOutreachReserveAlert(s, now))
    .filter((i): i is OutreachAlertIssue => Boolean(i));
  await resolveOutreachEmptyEpisodes(snapshots, now);
  await recoverStaleOutreachAlertClaims(now);
  await resolveOutreachAlerts(
    issues.map(i => outreachIncidentKey(i, localDate)),
    now,
    snapshots
      .filter(s => !s.readError && s.schedulerState !== "unavailable")
      .map(s => s.key)
  );
  let emailsSent = 0,
    ownerNotifications = 0;
  // Nine diagnostics remain quiet; zero-ready campaigns share one durable incident email.
  const outcomes = await Promise.allSettled([
    ...issues.map(issue => notifyOutreachIssue(issue, localDate, now)),
    notifyOutreachEmptyGroup(emptyIssues, localDate, now),
  ]);
  for (const outcome of outcomes) {
    if (outcome.status !== "fulfilled") continue;
    if (outcome.value.emailSent) emailsSent++;
    if ("ownerNotified" in outcome.value && outcome.value.ownerNotified)
      ownerNotifications++;
  }
  await markOutreachMonitorCheck(
    monitor.id,
    now,
    outcomes.some(outcome => outcome.status === "rejected")
      ? "ALERT_NOTIFICATION_FAILED"
      : snapshots.some(s => s.readError)
        ? "CAMPAIGN_HEALTH_UNAVAILABLE"
        : null
  );
  return {
    ok: true,
    checkedCampaigns: snapshots.length,
    issueCount: issues.length + emptyIssues.length,
    notificationPolicy: OUTREACH_ALERT_NOTIFICATION_POLICY,
    dashboardOnlyIssueCount: issues.filter(
      i => !isOwnerActionOutreachNotification(i, now)
    ).length,
    alertEmailsAccepted: emailsSent,
    ownerNotifications,
    noProspectSends: true,
  };
}
export async function getOutreachAlertsStatus(now = new Date()) {
  const monitor = await getOutreachAlertMonitor();
  let schedulerState:
    | "enabled"
    | "disabled"
    | "not_linked"
    | "invalid"
    | "unavailable" = "not_linked";
  if (monitor?.scheduleCronTaskUid) {
    try {
      const { jobs } = await listHeartbeatJobs("", { page: 1, pageSize: 100 });
      const job = jobs.find(j => j.taskUid === monitor.scheduleCronTaskUid);
      schedulerState = !job
        ? "not_linked"
        : job.callbackPath !== OUTREACH_ALERT_CALLBACK ||
            job.cronExpression !== OUTREACH_ALERT_CRON
          ? "invalid"
          : job.isEnable
            ? "enabled"
            : "disabled";
    } catch {
      schedulerState = "unavailable";
    }
  }
  let currentIssues: OutreachAlertIssue[] = [];
  let campaignHealth: OutreachAlertSnapshot[] = [];
  try {
    const rawSnapshots = await loadOutreachAlertSnapshots(now);
    const snapshots = monitor
      ? outreachCampaignBaselines(monitor, rawSnapshots, now).snapshots
      : rawSnapshots;
    campaignHealth = snapshots;
    currentIssues = snapshots
      .map(s => evaluateOutreachAlert(s, now))
      .filter((i): i is OutreachAlertIssue => Boolean(i));
    currentIssues.push(
      ...snapshots
        .map(s => evaluateOutreachReserveAlert(s, now))
        .filter((i): i is OutreachAlertIssue => Boolean(i))
    );
  } catch {
    /* API can still report its durable monitor/alert ledger. */
  }
  const alerts = (await recentOutreachAlerts()).map(
    ({
      id,
      label,
      localDate,
      kind,
      detail,
      newAccepted,
      followupAccepted,
      readyCount,
      emailState,
      ownerState,
      resolvedAt,
      createdAt,
    }) => ({
      id,
      label,
      localDate,
      kind,
      detail,
      newAccepted,
      followupAccepted,
      readyCount,
      emailState,
      ownerState,
      resolvedAt,
      createdAt,
    })
  );
  return {
    runtimeVersion: OUTREACH_ALERT_RUNTIME_VERSION,
    notificationPolicy: OUTREACH_ALERT_NOTIFICATION_POLICY,
    monitoringDays: "every_day",
    recipient: OUTREACH_ALERT_RECIPIENT,
    monitorStatus: monitor?.status || "not_configured",
    schedulerState,
    lastCheckedAt: monitor?.lastCheckedAt || null,
    lastErrorCode: monitor?.lastErrorCode || null,
    alerts,
    currentIssues,
    campaignHealth,
    checkedCampaigns: campaignHealth.length,
    caveat:
      "App-owned checks cannot notify during a total application or scheduler outage. SMTP acceptance is not proof of inbox delivery.",
  };
}
export async function outreachAlertsScheduledHandler(
  req: Request,
  res: Response
) {
  let user;
  try {
    user = await sdk.authenticateRequest(req);
  } catch {
    return res.status(403).json({ error: "cron-only endpoint" });
  }
  if (!user.isCron || !user.taskUid)
    return res.status(403).json({ error: "cron-only endpoint" });
  try {
    return res.json(await runOutreachAlerts(user.taskUid));
  } catch {
    try {
      const m = await getOutreachAlertMonitor(user.taskUid);
      if (m)
        await markOutreachMonitorCheck(m.id, new Date(), "ALERT_CHECK_FAILED");
    } catch {
      /* Do not expose DB errors. */
    }
    return res.status(500).json({
      error: "Outreach alert check could not complete.",
      context: { taskUid: user.taskUid },
      timestamp: new Date().toISOString(),
    });
  }
}
