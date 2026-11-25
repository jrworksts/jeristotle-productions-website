import { withOutreachDeadline, withOutreachStage, authenticateOutreach, outreachDeadline, outreachHasSendBudget, outreachDeadlineCheck, OUTREACH_INBOX_BUDGET_MS, OUTREACH_PERSISTENCE_BUDGET_MS } from "./outreachDeadline";
import { randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { JERISTOTLE_EMAIL } from "../shared/const";
import {
  getCreditUnionListUnsubscribeHeaders,
  getCreditUnionUnsubscribeUrl,
} from "../shared/creditUnionOutreach";
import { renderJeristotleOutreachEmail } from "../shared/outreachFormatting";
import {
  OUTREACH_DAILY_NEW_CONTACT_LIMIT,
  OUTREACH_MAINTENANCE_CRON,
} from "../shared/outreachMaintenance";
import { CREDIT_UNION_PROACTIVE_RESERVE_TARGET as OUTREACH_READY_BUFFER_TARGET } from "../shared/outboundReplenishmentPolicy";
import { getOutreachLocalMoment } from "../shared/outreachSchedule";
import { sdk } from "./_core/sdk";
import { checkCreditUnionInbox } from "./creditUnionInbox";
import { sendJeristotleHtmlEmail } from "./inquiryEmail";
import {
  buildCreditUnionOutboundMessageId,
  claimCreditUnionMessageForSend,
  completeCreditUnionDailyRun,
  ensureCreditUnionFollowupPlans,
  finalizeCreditUnionSmtpAcceptance,
  getCreditUnionCampaignForScheduledTask,
  getCreditUnionInitialCandidates,
  getCreditUnionPointOfSendCheck,
  getCreditUnionPreviousSentMessage,
  getCreditUnionSendingHealth,
  getDueCreditUnionFollowupCandidates,
  markCreditUnionDeliveryAmbiguousFailure,
  prepareCreditUnionReadyReserve,
  recordCreditUnionSendAttempt,
  recordCreditUnionMaintenanceEvent,
  releaseCreditUnionUnattemptedClaim,
  reserveCreditUnionDailyRun,
  type CreditUnionDailyLease,
  type CreditUnionDeliveryCandidate,
} from "./creditUnionSendingDb";

/** 6-field UTC Heartbeat expression. Owner creates/links it only after deploy. */
export const CREDIT_UNION_MAINTENANCE_CRON = OUTREACH_MAINTENANCE_CRON;
const CENTRAL_TIME_ZONE = "America/Chicago";
const RESERVE_TARGET = OUTREACH_READY_BUFFER_TARGET;

export function isCreditUnionMaintenanceMoment(now = new Date()) {
  const moment = getOutreachLocalMoment(now, CENTRAL_TIME_ZONE);
  return {
    ...moment,
    inMaintenanceWindow: moment.hour >= 8 && moment.hour < 17,
    // Same-day catch-up is bounded to 09:00–16:59; an owned daily lease and
    // durable initial reservations, not minute matching, enforce the cap.
    isSendTick: moment.hour >= 9 && moment.hour < 17,
  };
}

function claimToken() {
  return randomBytes(18).toString("hex");
}

async function deliverCreditUnionCandidate(input: {
  candidate: CreditUnionDeliveryCandidate;
  now: Date;
  initialLease?: CreditUnionDailyLease;
  dailyNewLimit: number;
  currentTime: () => Date;
}) {
  if (!outreachHasSendBudget()) return { sent: false, skipped: "bounded-send-budget", ambiguous: false };
  const { candidate, now } = input;
  const token = claimToken();
  const messageId = buildCreditUnionOutboundMessageId(
    candidate.message.id,
    token
  );

  // First read/guard before we reserve a scarce daily initial slot.
  const beforeClaim = await getCreditUnionPointOfSendCheck({
    campaignId: candidate.prospect.campaignId,
    prospectId: candidate.prospect.id,
    messageId: candidate.message.id,
  });
  if (!beforeClaim.ready)
    return { sent: false, skipped: beforeClaim.reason, ambiguous: false };

  const claimed = await claimCreditUnionMessageForSend({
    candidate,
    claimToken: token,
    providerMessageId: messageId,
    now,
    initialLease: input.initialLease,
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
  const pointOfSend = await getCreditUnionPointOfSendCheck({
    campaignId: candidate.prospect.campaignId,
    prospectId: candidate.prospect.id,
    messageId: candidate.message.id,
    claimToken: token,
  });
  if (!pointOfSend.ready) {
    await releaseCreditUnionUnattemptedClaim({
      messageId: candidate.message.id,
      claimToken: token,
      reason: `Pre-SMTP guard blocked delivery: ${pointOfSend.reason}`,
    });
    return { sent: false, skipped: pointOfSend.reason, ambiguous: false };
  }

  const previous =
    candidate.message.sequenceStep > 0
      ? await getCreditUnionPreviousSentMessage(
          candidate.prospect.id,
          candidate.message.sequenceStep
        )
      : undefined;
  if (candidate.message.sequenceStep > 0 && !previous?.providerMessageId) {
    await releaseCreditUnionUnattemptedClaim({
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
    const finalPoint = await getCreditUnionPointOfSendCheck({
      campaignId: candidate.prospect.campaignId, prospectId: candidate.prospect.id,
      messageId: candidate.message.id, claimToken: token,
    });
    if (!finalPoint.ready || !isCreditUnionMaintenanceMoment(input.currentTime()).isSendTick ||
      input.initialLease && isCreditUnionMaintenanceMoment(input.currentTime()).dateKey !== input.initialLease.runDate) {
      await releaseCreditUnionUnattemptedClaim({ messageId: candidate.message.id, claimToken: token, reason: "Fresh final guard/day/window blocked SMTP" });
      return { sent: false, skipped: "Fresh final guard/day/window", ambiguous: false };
    }
    outreachDeadlineCheck(9000);
    const attemptRecorded = await recordCreditUnionSendAttempt({
      messageId: candidate.message.id,
      claimToken: token,
      now: input.currentTime(),
      dailyLease: input.initialLease,
    });
    if (!attemptRecorded) {
      return {
        sent: false,
        skipped:
          "Message was cancelled or claim changed immediately before SMTP.",
        ambiguous: false,
      };
    }
    const unsubscribeUrl = getCreditUnionUnsubscribeUrl(
      finalPoint.prospect.unsubscribeToken
    );
    if (!isCreditUnionMaintenanceMoment(input.currentTime()).isSendTick ||
      input.initialLease && isCreditUnionMaintenanceMoment(input.currentTime()).dateKey !== input.initialLease.runDate)
      throw new Error("Day/window expired after durable attempt; manual review, never retry");
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
      text: finalPoint.message.textBody,
      messageId,
      inReplyTo: previous?.providerMessageId || undefined,
      references: previous?.providerMessageId || undefined,
      headers: getCreditUnionListUnsubscribeHeaders(unsubscribeUrl),
    });
    // `sent` means SMTP completed; supplied durable Message-ID means an
    // acceptance result lacking a provider rewrite is still auditable.
    if (!delivery.sent || !delivery.configured) {
      throw new Error("Jeristotle SMTP did not report acceptance.");
    }
    const acceptedAt = new Date();
    const accepted = await finalizeCreditUnionSmtpAcceptance({
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
      await markCreditUnionDeliveryAmbiguousFailure({
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
    await markCreditUnionDeliveryAmbiguousFailure({
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
async function runCreditUnionMaintenanceImpl(input: {
  taskUid: string;
  now?: Date;
}) {
  const deadline = outreachDeadline();
  const now = input.now ?? new Date();
  const currentTime = input.now ? () => input.now! : () => new Date();
  const moment = isCreditUnionMaintenanceMoment(now);
  const campaign = await getCreditUnionCampaignForScheduledTask(input.taskUid);
  if (!campaign)
    return { ok: true, skipped: "orphan-or-wrong-scheduler" } as const;
  if (!moment.inMaintenanceWindow) {
    return { ok: true, skipped: "outside-central-maintenance-window" } as const;
  }

  // Do not allow a credential/IMAP outage to lead to a send: reply/bounce stop
  // state must be observed before SMTP processing in an owned continuation.
  const inbox = await withOutreachStage(OUTREACH_INBOX_BUDGET_MS, () => checkCreditUnionInbox({ campaignId: campaign.id, now }));
  await ensureCreditUnionFollowupPlans(campaign.id);

  if (!moment.isSendTick) {
    const reserve = await prepareCreditUnionReadyReserve(RESERVE_TARGET);
    return {
      ok: true,
      maintenance: true,
      sent: false,
      repliesDetected: inbox.repliesDetected,
      bouncesDetected: inbox.bouncesDetected,
      reserveApproved: reserve.approved,
      readyInitialCount: reserve.health.readyInitialCount,
      lowSupply: reserve.health.lowSupply,
    } as const;
  }

  const lease = await reserveCreditUnionDailyRun({
    campaignId: campaign.id,
    runDate: moment.dateKey,
    now,
  });
  if (!lease) {
    // An overlapping callback never sends without owning the existing day.
    // Released/expired started days continue without resetting reservations.
    const health = await getCreditUnionSendingHealth(RESERVE_TARGET);
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
    const current = await getCreditUnionCampaignForScheduledTask(input.taskUid);
    if (!current || current.status !== "active") {
      await completeCreditUnionDailyRun({
        campaignId: campaign.id,
        lease,
        status: "skipped",
        newSent,
        followupsSent,
        repliesDetected: inbox.repliesDetected,
        errorCount,
        summary: `Campaign is ${current?.status || "unlinked"}; no SMTP delivery.`,
        now,
      });
      return {
        ok: true,
        skipped: "campaign-not-active",
        repliesDetected: inbox.repliesDetected,
      } as const;
    }

    // Follow-ups take their original plan as a lower bound, but can send only
    // in the daily owned send window. Step ordering and prospect lastSentAt ensure
    // an overdue Day 9 cannot catch up immediately after Day 4.
    let initialAttempts = 0;
    for (const candidate of await getCreditUnionInitialCandidates(
      campaign.id
    )) {
      if (
        newSent >= OUTREACH_DAILY_NEW_CONTACT_LIMIT ||
        initialAttempts >= OUTREACH_DAILY_NEW_CONTACT_LIMIT ||
        !outreachHasSendBudget()
      )
        break;
      initialAttempts += 1;
      const result = await deliverCreditUnionCandidate({
        candidate,
        now,
        currentTime,
        initialLease: lease,
        dailyNewLimit: current.dailyNewLimit,
      });
      if (result.sent) newSent += 1;
      if (result.ambiguous) errorCount += 1;
    }

    const reserve = await prepareCreditUnionReadyReserve(RESERVE_TARGET);
    let followupAttempts = 0;
    for (const candidate of await getDueCreditUnionFollowupCandidates(
      campaign.id,
      now
    )) {
      if (followupAttempts >= 20 || !outreachHasSendBudget()) break;
      followupAttempts += 1;
      const result = await deliverCreditUnionCandidate({
        candidate,
        now,
        currentTime,
        initialLease: lease,
        dailyNewLimit: current.dailyNewLimit,
      });
      if (result.sent) followupsSent += 1;
      if (result.ambiguous) errorCount += 1;
    }

    // Stay inside the fixed ten-initial cap. The daily row atomically makes
    // this cap durable even if two 09:00 callbacks overlap or a request retries.
    await completeCreditUnionDailyRun({
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
      errorCount,
      readyInitialCount: reserve.health.readyInitialCount,
      lowSupply: reserve.health.lowSupply,
    } as const;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await completeCreditUnionDailyRun({
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
export async function getCreditUnionSendingReadinessReport() {
  const health = await getCreditUnionSendingHealth(RESERVE_TARGET);
  return {
    ...health,
    requestedCron: CREDIT_UNION_MAINTENANCE_CRON,
    callbackPath: "/api/scheduled/credit-union-outreach",
    deliveryReady: Boolean(
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
        ? `${health.claimedForReviewCount} scheduled/failed messages require delivery-state review before any manual resend.`
        : null,
    ].filter(Boolean),
  };
}

/** Compatibility alias requested by controls/dashboard consumers. */
export const getCreditUnionSendingHealthReport =
  getCreditUnionSendingReadinessReport;

async function creditUnionScheduledHandlerImpl(req: Request, res: Response) {
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
    const result = await runCreditUnionMaintenance({ taskUid: user.taskUid });
    const campaign = await getCreditUnionCampaignForScheduledTask(user.taskUid);
    if (campaign)
      await recordCreditUnionMaintenanceEvent(
        campaign.id,
        !result.ok,
        JSON.stringify(result)
      );
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      const campaign = await getCreditUnionCampaignForScheduledTask(
        user.taskUid
      );
      if (campaign)
        await recordCreditUnionMaintenanceEvent(campaign.id, true, message);
    } catch (recordError) {
      console.error(
        "[CreditUnionAutomation] Could not persist failure:",
        recordError
      );
    }
    console.error(`[CreditUnionAutomation] ${message}`);
    return res.status(500).json({
      error: message,
      context: { url: req.originalUrl },
      timestamp: new Date().toISOString(),
    });
  }
}

export async function runCreditUnionMaintenance(...args: Parameters<typeof runCreditUnionMaintenanceImpl>) { return withOutreachDeadline(() => runCreditUnionMaintenanceImpl(...args)); }
export async function creditUnionScheduledHandler(req: Request, res: Response) {
  try { return await withOutreachDeadline(() => creditUnionScheduledHandlerImpl(req, res)); }
  catch { return res.status(200).json({ ok: false, inspectionRequired: true, partial: true, error: "Bounded outreach callback stopped; attempts never automatically retry." }); }
}
