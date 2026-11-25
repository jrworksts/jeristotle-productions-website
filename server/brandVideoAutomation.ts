import { withOutreachDeadline, withOutreachStage, authenticateOutreach, outreachDeadline, outreachHasSendBudget, outreachDeadlineCheck, OUTREACH_INBOX_BUDGET_MS, OUTREACH_PERSISTENCE_BUDGET_MS } from "./outreachDeadline";
import { randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { JERISTOTLE_EMAIL } from "../shared/const";
import {
  BRAND_VIDEO_MAINTENANCE_CRON,
  BRAND_VIDEO_CALLBACK,
  BRAND_VIDEO_FOLLOWUP_ATTEMPT_LIMIT,
  getBrandVideoSendMoment,
  getNextBrandVideoScheduleTimes,
  getBrandVideoListUnsubscribeHeaders,
  getBrandVideoUnsubscribeUrl,
} from "../shared/brandVideoOutreach";
import { renderJeristotleOutreachEmail } from "../shared/outreachFormatting";
import {
  OUTREACH_DAILY_NEW_CONTACT_LIMIT,
  OUTREACH_READY_BUFFER_TARGET,
} from "../shared/outreachMaintenance";
import { sdk } from "./_core/sdk";
import { checkBrandVideoInbox } from "./brandVideoInbox";
import { sendJeristotleHtmlEmail } from "./inquiryEmail";
import {
  buildBrandVideoOutboundMessageId,
  claimBrandVideoMessageForSend,
  completeBrandVideoDailyRun,
  ensureBrandVideoFollowupPlans,
  finalizeBrandVideoSmtpAcceptance,
  getBrandVideoCampaignForScheduledTask,
  getBrandVideoInitialCandidates,
  getBrandVideoPointOfSendCheck,
  getBrandVideoPreviousSentMessage,
  getBrandVideoSendingHealth,
  getDueBrandVideoFollowupCandidates,
  markBrandVideoDeliveryAmbiguousFailure,
  prepareBrandVideoReadyReserve,
  recordBrandVideoSendAttempt,
  recordBrandVideoMaintenanceEvent,
  releaseBrandVideoUnattemptedClaim,
  reserveBrandVideoDailyRun,
  type BrandVideoDailyLease,
  type BrandVideoDeliveryCandidate,
} from "./brandVideoSendingDb";

/** 6-field UTC Heartbeat expression. Owner creates/links it only after deploy. */
export { BRAND_VIDEO_MAINTENANCE_CRON } from "../shared/brandVideoOutreach";
export { BV_SEND_RELIABILITY_VERSION } from "../shared/brandVideoOutreach";
const RESERVE_TARGET = OUTREACH_READY_BUFFER_TARGET;

export function isBrandVideoMaintenanceMoment(now = new Date()) {
  const moment = getBrandVideoSendMoment(now);
  return {
    ...moment,
    inMaintenanceWindow: moment.hour >= 8 && moment.hour < 17,
    // A delayed callback may own today's one batch; the durable daily row, not
    // minute matching, prevents every subsequent tick from creating a batch.
    isSendTick: moment.inSendWindow,
  };
}

/** Add fixed sender compliance copy without altering the prospect-specific approved draft. */
export function addBrandVideoComplianceFooter(
  body: string,
  address: string,
  html: boolean
) {
  const text = `${address.trim()}\nTo stop these emails, reply “unsubscribe”.`;
  if (!html) return `${body}\n\n${text}`;
  const escaped = text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
  const footer = `<p style="font:12px Arial;color:#666;white-space:pre-line;">${escaped}</p>`;
  return /<\/body>/i.test(body)
    ? body.replace(/<\/body>/i, `${footer}</body>`)
    : `${body}${footer}`;
}

function claimToken() {
  return randomBytes(18).toString("hex");
}

async function deliverBrandVideoCandidate(input: {
  candidate: BrandVideoDeliveryCandidate;
  dailyLease: BrandVideoDailyLease;
  taskUid: string;
  dailyNewLimit: number;
  currentTime: () => Date;
}) {
  if (!outreachHasSendBudget()) return { sent: false, skipped: "bounded-send-budget", ambiguous: false };
  const { candidate } = input;
  const now = input.currentTime();
  if (!getBrandVideoSendMoment(now, input.dailyLease.runDate).inSendWindow)
    return {
      sent: false,
      skipped: "Daily send window expired.",
      ambiguous: false,
    };
  const token = claimToken();
  const messageId = buildBrandVideoOutboundMessageId(
    candidate.message.id,
    token
  );

  // First read/guard before we reserve a scarce daily initial slot.
  const beforeClaim = await getBrandVideoPointOfSendCheck({
    campaignId: candidate.prospect.campaignId,
    prospectId: candidate.prospect.id,
    messageId: candidate.message.id,
    now,
    dailyLease: input.dailyLease,
    taskUid: input.taskUid,
  });
  if (!beforeClaim.ready)
    return { sent: false, skipped: beforeClaim.reason, ambiguous: false };

  const claimed = await claimBrandVideoMessageForSend({
    candidate,
    claimToken: token,
    providerMessageId: messageId,
    now,
    dailyLease: input.dailyLease,
    dailyNewLimit: input.dailyNewLimit,
  });
  if (!claimed)
    return {
      sent: false,
      skipped: "Message/day slot was claimed by another worker.",
      ambiguous: false,
    };

  // A pause, suppression, unsubscribe, terminal reply/bounce, or contact edit
  // can win between candidate selection and claim. Release only because no SMTP
  // attempt has happened yet; attempted rows never receive automatic retries.
  const pointOfSend = await getBrandVideoPointOfSendCheck({
    campaignId: candidate.prospect.campaignId,
    prospectId: candidate.prospect.id,
    messageId: candidate.message.id,
    claimToken: token,
    now: input.currentTime(),
    dailyLease: input.dailyLease,
    taskUid: input.taskUid,
  });
  if (!pointOfSend.ready) {
    await releaseBrandVideoUnattemptedClaim({
      messageId: candidate.message.id,
      claimToken: token,
      reason: `Pre-SMTP guard blocked sending: ${pointOfSend.reason}`,
    });
    return { sent: false, skipped: pointOfSend.reason, ambiguous: false };
  }

  const previous =
    candidate.message.sequenceStep > 0
      ? await getBrandVideoPreviousSentMessage(
          candidate.prospect.id,
          candidate.message.sequenceStep
        )
      : undefined;
  if (candidate.message.sequenceStep > 0 && !previous?.providerMessageId) {
    await releaseBrandVideoUnattemptedClaim({
      messageId: candidate.message.id,
      claimToken: token,
      reason: "Follow-up lost its prior accepted thread anchor.",
    });
    return {
      sent: false,
      skipped: "Follow-up lacks a prior accepted thread anchor.",
      ambiguous: false,
    };
  }

  try {
    // Thread lookup can take time. Read controls again immediately before the
    // durable attempted-at write, and render only this fresh approved record.
    const finalPoint = await getBrandVideoPointOfSendCheck({
      campaignId: candidate.prospect.campaignId,
      prospectId: candidate.prospect.id,
      messageId: candidate.message.id,
      claimToken: token,
      now: input.currentTime(),
      dailyLease: input.dailyLease,
      taskUid: input.taskUid,
    });
    const attemptAt = input.currentTime();
    if (
      !finalPoint.ready ||
      !getBrandVideoSendMoment(attemptAt, input.dailyLease.runDate).inSendWindow
    ) {
      await releaseBrandVideoUnattemptedClaim({
        messageId: candidate.message.id,
        claimToken: token,
        reason: finalPoint.ready
          ? "Daily send window expired before SMTP."
          : finalPoint.reason,
      });
      return {
        sent: false,
        skipped: finalPoint.ready
          ? "Daily send window expired before SMTP."
          : finalPoint.reason,
        ambiguous: false,
      };
    }
    outreachDeadlineCheck(9000);
    const attemptRecorded = await recordBrandVideoSendAttempt({
      messageId: candidate.message.id,
      claimToken: token,
      now: attemptAt,
      dailyLease: input.dailyLease,
      taskUid: input.taskUid,
      expected: finalPoint,
    });
    if (!attemptRecorded) {
      await releaseBrandVideoUnattemptedClaim({
        messageId: candidate.message.id,
        claimToken: token,
        reason: "Final SMTP guard blocked the unattempted claim.",
      });
      return {
        sent: false,
        skipped:
          "Message was cancelled or claim changed immediately before SMTP.",
        ambiguous: false,
      };
    }
    // Even a slow final DB write must not carry this day's authority past the
    // window/date. The attempt marker is now durable: keep manual-review state
    // rather than undoing it or automatically retrying this message tomorrow.
    if (
      !getBrandVideoSendMoment(input.currentTime(), input.dailyLease.runDate)
        .inSendWindow
    ) {
      throw new Error(
        "Window/date expired after durable attempt marker; SMTP not invoked. Manual review required, no automatic retry."
      );
    }
    const unsubscribeUrl = getBrandVideoUnsubscribeUrl(
      finalPoint.prospect.unsubscribeToken
    );
    outreachDeadlineCheck(9000);
    const delivery = await sendJeristotleHtmlEmail({
      to: finalPoint.prospect.primaryEmail!,
      replyTo: JERISTOTLE_EMAIL,
      subject: finalPoint.message.subject,
      html: renderJeristotleOutreachEmail({
        subject: finalPoint.message.subject,
        text: finalPoint.message.textBody,
        unsubscribeUrl,
        physicalPostalAddress: finalPoint.campaign.physicalPostalAddress,
      }),
      text: addBrandVideoComplianceFooter(
        finalPoint.message.textBody,
        finalPoint.campaign.physicalPostalAddress,
        false
      ),
      messageId,
      inReplyTo: previous?.providerMessageId || undefined,
      references: previous?.providerMessageId || undefined,
      headers: getBrandVideoListUnsubscribeHeaders(unsubscribeUrl),
    });
    // `sent` from the transport means SMTP acceptance, never confirmed delivery. A durable Message-ID means an
    // acceptance result lacking a provider rewrite is still auditable.
    if (!delivery.sent || !delivery.configured) {
      throw new Error("Jeristotle SMTP did not report acceptance.");
    }
    const acceptedAt = input.currentTime();
    const accepted = await finalizeBrandVideoSmtpAcceptance({
      campaignId: candidate.prospect.campaignId,
      prospectId: candidate.prospect.id,
      messageId: candidate.message.id,
      claimToken: token,
      sequenceStep: candidate.message.sequenceStep,
      claimedProviderMessageId: messageId,
      providerMessageId: delivery.messageId || messageId,
      acceptedAt,
    });
    if (!accepted) {
      // SMTP might have accepted this while a terminal state won DB finalization.
      // Record it for human review and never enqueue an automated duplicate.
      await markBrandVideoDeliveryAmbiguousFailure({
        campaignId: candidate.prospect.campaignId,
        prospectId: candidate.prospect.id,
        messageId: candidate.message.id,
        claimToken: token,
        error:
          "SMTP accepted but claim finalization lost; inspect manually before any resend.",
        now,
      });
      return {
        sent: false,
        skipped: "SMTP accepted but finalization requires manual review.",
        ambiguous: true,
      };
    }
    return { sent: true, skipped: null, ambiguous: false };
  } catch (error) {
    await markBrandVideoDeliveryAmbiguousFailure({
      campaignId: candidate.prospect.campaignId,
      prospectId: candidate.prospect.id,
      messageId: candidate.message.id,
      claimToken: token,
      error,
      now,
    });
    return {
      sent: false,
      skipped: error instanceof Error ? error.message : String(error),
      ambiguous: true,
    };
  }
}

/**
 * Called only by a cron-authenticated route. It resolves campaign scope from
 * the persisted task UID and ignores request body data. Inbox monitoring comes
 * before any delivery; a monitor error returns before even a send claim.
 */
async function runBrandVideoMaintenanceImpl(input: {
  taskUid: string;
  now?: Date;
}) {
  if (process.env.NODE_ENV === "development")
    return { ok: true, skipped: "development-sending-disabled" } as const;
  const deadline = outreachDeadline();
  const now = input.now ?? new Date();
  const currentTime = input.now ? () => input.now! : () => new Date();
  const moment = isBrandVideoMaintenanceMoment(now);
  const campaign = await getBrandVideoCampaignForScheduledTask(input.taskUid);
  if (!campaign)
    return { ok: true, skipped: "orphan-or-wrong-scheduler" } as const;
  if (!moment.inMaintenanceWindow) {
    return { ok: true, skipped: "outside-central-maintenance-window" } as const;
  }

  // Do not allow a credential/IMAP outage to lead to a send: reply/bounce stop
  // state must be observed before SMTP processing for today's bounded continuation.
  const inbox = await withOutreachStage(OUTREACH_INBOX_BUDGET_MS, () => checkBrandVideoInbox({ campaignId: campaign.id, now }));
  await ensureBrandVideoFollowupPlans(campaign.id);

  if (
    !moment.isSendTick ||
    !getBrandVideoSendMoment(currentTime(), moment.dateKey).inSendWindow
  ) {
    const reserve = await prepareBrandVideoReadyReserve(RESERVE_TARGET);
    return {
      ok: true,
      maintenance: true,
      sent: false,
      repliesDetected: inbox.repliesDetected,
      bouncesDetected: inbox.bouncesDetected,
      reserveApproved: reserve.approved,
      unsubscribesDetected: inbox.unsubscribesDetected,
      readyInitialCount: reserve.health.readyInitialCount,
      reserveTarget: RESERVE_TARGET,
      lowSupply: reserve.health.lowSupply,
    } as const;
  }

  const lease = await reserveBrandVideoDailyRun({
    campaignId: campaign.id,
    runDate: moment.dateKey,
    now: currentTime(),
  });
  if (!lease) {
    // Any existing daily row (including failed/expired) fences later callbacks.
    // Return 2xx after the inbox scan without reclaiming or resetting that day.
    const health = await getBrandVideoSendingHealth(RESERVE_TARGET);
    return {
      ok: true,
      skipped: "daily-batch-already-reserved",
      repliesDetected: inbox.repliesDetected,
      bouncesDetected: inbox.bouncesDetected,
      lowSupply: health.lowSupply,
    } as const;
  }

  let newSent = 0;
  let followupsSent = 0;
  let errorCount = 0;
  try {
    // Campaign can be paused after the inbox scan. No buffer fill or SMTP then.
    const current = await getBrandVideoCampaignForScheduledTask(input.taskUid);
    if (!current || current.id !== campaign.id || current.status !== "active") {
      await completeBrandVideoDailyRun({
        campaignId: campaign.id,
        lease,
        status: "skipped",
        newSent,
        followupsSent,
        repliesDetected: inbox.repliesDetected,
        errorCount,
        summary: `Campaign is ${current?.status || "unlinked"}; no SMTP acceptance.`,
        now,
      });
      return {
        ok: true,
        skipped: "campaign-not-active",
        repliesDetected: inbox.repliesDetected,
      } as const;
    }

    // Follow-ups take their original plan as a lower bound, but can send only
    // in this bounded same-day continuations. Step ordering and prospect lastSentAt ensure
    // an overdue Day 10 cannot catch up immediately after Day 5.
    let initialAttempts = 0;
    for (const candidate of await getBrandVideoInitialCandidates(campaign.id)) {
      if (
        newSent >= OUTREACH_DAILY_NEW_CONTACT_LIMIT ||
        initialAttempts >= OUTREACH_DAILY_NEW_CONTACT_LIMIT ||
        !outreachHasSendBudget()
      )
        break;
      initialAttempts += 1;
      const result = await deliverBrandVideoCandidate({
        candidate,
        dailyLease: lease,
        taskUid: input.taskUid,
        dailyNewLimit: current.dailyNewLimit,
        currentTime,
      });
      if (result.sent) newSent += 1;
      if (result.ambiguous) errorCount += 1;
    }

    let followupAttempts = 0;
    for (const candidate of await getDueBrandVideoFollowupCandidates(
      campaign.id,
      now
    )) {
      if (
        followupAttempts >= BRAND_VIDEO_FOLLOWUP_ATTEMPT_LIMIT ||
        !outreachHasSendBudget()
      )
        break;
      followupAttempts += 1;
      const result = await deliverBrandVideoCandidate({
        candidate,
        dailyLease: lease,
        taskUid: input.taskUid,
        dailyNewLimit: current.dailyNewLimit,
        currentTime,
      });
      if (result.sent) followupsSent += 1;
      if (result.ambiguous) errorCount += 1;
    }

    // Stay inside the fixed ten-initial cap. The daily row atomically makes
    // this cap durable even if delayed callbacks overlap or a request retries.
    const reserve = await prepareBrandVideoReadyReserve(RESERVE_TARGET);
    await completeBrandVideoDailyRun({
      campaignId: campaign.id,
      lease,
      status: errorCount ? "failed" : "started",
      newSent,
      followupsSent,
      repliesDetected: inbox.repliesDetected,
      errorCount,
      summary: `${newSent} initial and ${followupsSent} follow-up SMTP acceptances; ${inbox.repliesDetected} replies, ${inbox.bouncesDetected} bounces. ${reserve.health.readyInitialCount}/${RESERVE_TARGET} verified initial reserve${reserve.health.lowSupply ? "; low verified supply" : ""}.`,
      now,
    });
    return {
      ok: errorCount === 0,
      sent: newSent + followupsSent > 0,
      newSent,
      followupsSent,
      repliesDetected: inbox.repliesDetected,
      bouncesDetected: inbox.bouncesDetected,
      unsubscribesDetected: inbox.unsubscribesDetected,
      errorCount,
      readyInitialCount: reserve.health.readyInitialCount,
      reserveTarget: RESERVE_TARGET,
      lowSupply: reserve.health.lowSupply,
    } as const;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await completeBrandVideoDailyRun({
      campaignId: campaign.id,
      lease,
      status: "failed",
      newSent,
      followupsSent,
      repliesDetected: inbox.repliesDetected,
      errorCount: errorCount + 1,
      summary: message,
      now,
    });
    throw error;
  }
}

/** Read-only rollout report for controls/UI; does not alter campaign/schedules. */
export async function getBrandVideoSendingReadinessReport() {
  const health = await getBrandVideoSendingHealth(RESERVE_TARGET);
  return {
    ...health,
    ...getNextBrandVideoScheduleTimes(new Date(), health.latestRun?.runDate),
    requestedCron: BRAND_VIDEO_MAINTENANCE_CRON,
    callbackPath: BRAND_VIDEO_CALLBACK,
    sendingReady: Boolean(
      health.campaign.status === "active" &&
        health.campaign.listApprovedAt &&
        health.campaign.configApprovedAt &&
        health.campaign.dailyScheduleTaskUid
    ),
    caveats: [
      health.lowSupply
        ? `Verified reserve is ${health.readyInitialCount}/${RESERVE_TARGET}; no questionable contacts were auto-approved.`
        : null,
      health.claimedForReviewCount
        ? `${health.claimedForReviewCount} scheduled/failed messages require SMTP-state review before any manual resend.`
        : null,
    ].filter(Boolean),
  };
}

/** Compatibility alias requested by controls/dashboard consumers. */
export const getBrandVideoSendingHealthReport =
  getBrandVideoSendingReadinessReport;

async function brandVideoScheduledHandlerImpl(req: Request, res: Response) {
  if (process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test")
    return res.status(403).json({ error: "production-only endpoint" });
  let user;
  try {
    user = await authenticateOutreach(options => sdk.authenticateRequest(req, options));
  } catch {
    return res.status(403).json({ error: "cron-only endpoint" });
  }
  if (!user.isCron || !user.taskUid)
    return res.status(403).json({ error: "cron-only endpoint" });
  try {
    // Do not use request body: only the platform-authenticated task UID scopes
    // a campaign. Returning 2xx for a stale/orphan task prevents retry storms.
    const result = await runBrandVideoMaintenance({ taskUid: user.taskUid });
    const campaign = await getBrandVideoCampaignForScheduledTask(user.taskUid);
    if (campaign)
      await recordBrandVideoMaintenanceEvent(
        campaign.id,
        !result.ok,
        JSON.stringify(result)
      );
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      const campaign = await getBrandVideoCampaignForScheduledTask(
        user.taskUid
      );
      if (campaign)
        await recordBrandVideoMaintenanceEvent(campaign.id, true, message);
    } catch (recordError) {
      console.error(
        "[BrandVideoAutomation] Could not persist failure:",
        recordError
      );
    }
    console.error(`[BrandVideoAutomation] ${message}`);
    return res.status(500).json({
      error: message,
      stack: error instanceof Error ? error.stack : undefined,
      context: { url: req.originalUrl, taskUid: user.taskUid },
      timestamp: new Date().toISOString(),
    });
  }
}

export async function runBrandVideoMaintenance(...args: Parameters<typeof runBrandVideoMaintenanceImpl>) { return withOutreachDeadline(() => runBrandVideoMaintenanceImpl(...args)); }
export async function brandVideoScheduledHandler(req: Request, res: Response) {
  try { return await withOutreachDeadline(() => brandVideoScheduledHandlerImpl(req, res)); }
  catch { return res.status(200).json({ ok: false, inspectionRequired: true, partial: true, error: "Bounded outreach callback stopped; attempts never automatically retry." }); }
}
