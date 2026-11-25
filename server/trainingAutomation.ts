import { withOutreachDeadline, withOutreachStage, authenticateOutreach, outreachDeadline, outreachHasSendBudget, outreachDeadlineCheck, OUTREACH_INBOX_BUDGET_MS, OUTREACH_PERSISTENCE_BUDGET_MS } from "./outreachDeadline";
import { randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { JERISTOTLE_EMAIL } from "../shared/const";
import { renderJeristotleOutreachEmail } from "../shared/outreachFormatting";
import {
  TRAINING_CALLBACK,
  TRAINING_DAILY_NEW_LIMIT,
  TRAINING_MAINTENANCE_CRON,
  TRAINING_OUTREACH_TIME_ZONE,
  TRAINING_READY_RESERVE_TARGET,
} from "../shared/trainingOutreach";
import { getOutreachLocalMoment } from "../shared/outreachSchedule";
import { isOutreachResearchWindow } from "../shared/outreachResearchWindow";
import { sdk } from "./_core/sdk";
import { sendJeristotleHtmlEmail } from "./inquiryEmail";
import { checkTrainingInbox } from "./trainingInbox";
import {
  buildTrainingOutboundMessageId,
  claimTrainingMessageForSend,
  completeTrainingDailyRun,
  ensureTrainingFollowupPlans,
  finalizeTrainingSmtpAcceptance,
  getDueTrainingFollowupCandidates,
  getTrainingCampaignForScheduledTask,
  getTrainingInitialCandidates,
  getTrainingPointOfSendCheck,
  getTrainingPreviousSentMessage,
  getTrainingSendingHealth,
  markTrainingDeliveryAmbiguousFailure,
  prepareTrainingReadyReserve,
  recordTrainingMaintenanceEvent,
  recordTrainingSendAttempt,
  releaseTrainingUnattemptedClaim,
  reserveTrainingDailyRun,
  type TrainingDailyLease,
  type TrainingDeliveryCandidate,
} from "./trainingSendingDb";
import { requestTrainingReplenishment } from "./trainingResearch";

export { TRAINING_MAINTENANCE_CRON } from "../shared/trainingOutreach";

export function isTrainingMaintenanceMoment(now = new Date()) {
  const moment = getOutreachLocalMoment(now, TRAINING_OUTREACH_TIME_ZONE);
  return {
    ...moment,
    // `isBusinessDay` remains informational for the business-day follow-up
    // planner, but Training maintenance and initial sends run every calendar day.
    inMaintenanceWindow: moment.hour >= 8 && moment.hour < 17,
    isSendTick: moment.hour >= 9 && moment.hour < 17,
  };
}

export function getTrainingListUnsubscribeHeaders(url: string) {
  return {
    "List-Unsubscribe": `<${url}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

function claimToken() {
  return randomBytes(18).toString("hex");
}

async function deliverTrainingCandidate(input: {
  candidate: TrainingDeliveryCandidate;
  initialLease?: TrainingDailyLease;
  currentTime: () => Date;
}) {
  if (!outreachHasSendBudget()) return { sent: false, skipped: "bounded-send-budget", ambiguous: false };
  const now = input.currentTime();
  if (!isTrainingMaintenanceMoment(now).isSendTick)
    return {
      sent: false,
      skipped: "Daily send window expired.",
      ambiguous: false,
    };
  const token = claimToken();
  const messageId = buildTrainingOutboundMessageId(
    input.candidate.message.id,
    token
  );
  const beforeClaim = await getTrainingPointOfSendCheck({
    campaignId: input.candidate.prospect.campaignId,
    prospectId: input.candidate.prospect.id,
    messageId: input.candidate.message.id,
    now,
  });
  if (!beforeClaim.ready)
    return { sent: false, skipped: beforeClaim.reason, ambiguous: false };
  const claimed = await claimTrainingMessageForSend({
    candidate: input.candidate,
    claimToken: token,
    providerMessageId: messageId,
    now,
    initialLease: input.initialLease,
  });
  if (!claimed)
    return {
      sent: false,
      skipped: "Message/day slot was claimed by another worker.",
      ambiguous: false,
    };
  const pointOfSend = await getTrainingPointOfSendCheck({
    campaignId: input.candidate.prospect.campaignId,
    prospectId: input.candidate.prospect.id,
    messageId: input.candidate.message.id,
    claimToken: token,
    now: input.currentTime(),
  });
  if (!pointOfSend.ready) {
    await releaseTrainingUnattemptedClaim({
      messageId: input.candidate.message.id,
      claimToken: token,
      reason: `Pre-SMTP guard blocked sending: ${pointOfSend.reason}`,
    });
    return { sent: false, skipped: pointOfSend.reason, ambiguous: false };
  }
  const previous =
    input.candidate.message.sequenceStep > 0
      ? await getTrainingPreviousSentMessage(
          input.candidate.prospect.id,
          input.candidate.message.sequenceStep
        )
      : undefined;
  if (
    input.candidate.message.sequenceStep > 0 &&
    !previous?.providerMessageId
  ) {
    await releaseTrainingUnattemptedClaim({
      messageId: input.candidate.message.id,
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
    const finalPoint = await getTrainingPointOfSendCheck({
      campaignId: input.candidate.prospect.campaignId, prospectId: input.candidate.prospect.id,
      messageId: input.candidate.message.id, claimToken: token, now: input.currentTime(),
    });
    if (!finalPoint.ready) {
      await releaseTrainingUnattemptedClaim({ messageId: input.candidate.message.id, claimToken: token, reason: finalPoint.reason });
      return { sent: false, skipped: finalPoint.reason, ambiguous: false };
    }
    const attemptAt = input.currentTime();
    if (!isTrainingMaintenanceMoment(attemptAt).isSendTick) {
      await releaseTrainingUnattemptedClaim({
        messageId: input.candidate.message.id,
        claimToken: token,
        reason: "Daily send window expired before SMTP.",
      });
      return {
        sent: false,
        skipped: "Daily send window expired before SMTP.",
        ambiguous: false,
      };
    }
    outreachDeadlineCheck(9000);
    const attemptRecorded = await recordTrainingSendAttempt({
      messageId: input.candidate.message.id,
      claimToken: token,
      now: attemptAt,
      dailyLease: input.initialLease,
    });
    if (!attemptRecorded)
      return {
        sent: false,
        skipped:
          "Message was cancelled or claim changed immediately before SMTP.",
        ambiguous: false,
      };
    if (!isTrainingMaintenanceMoment(input.currentTime()).isSendTick ||
      input.initialLease && isTrainingMaintenanceMoment(input.currentTime()).dateKey !== input.initialLease.runDate)
      throw new Error("Day/window expired after durable attempt; manual review, never retry");
    outreachDeadlineCheck(9000);
    const delivery = await sendJeristotleHtmlEmail({
      to: finalPoint.prospect.primaryEmail!,
      replyTo: JERISTOTLE_EMAIL,
      subject: finalPoint.message.subject,
      html: renderJeristotleOutreachEmail({
        subject: finalPoint.message.subject,
        text: finalPoint.message.textBody,
        unsubscribeUrl: `https://jeristotleproductions.com/training-unsubscribe/${finalPoint.prospect.unsubscribeToken}`,
      }),
      text: finalPoint.message.textBody,
      messageId,
      inReplyTo: previous?.providerMessageId || undefined,
      references: previous?.providerMessageId || undefined,
      headers: getTrainingListUnsubscribeHeaders(
        `https://jeristotleproductions.com/training-unsubscribe/${finalPoint.prospect.unsubscribeToken}`
      ),
    });
    if (!delivery.configured || !delivery.sent)
      throw new Error("Jeristotle SMTP did not report acceptance.");
    const accepted = await finalizeTrainingSmtpAcceptance({
      campaignId: input.candidate.prospect.campaignId,
      prospectId: input.candidate.prospect.id,
      messageId: input.candidate.message.id,
      claimToken: token,
      sequenceStep: input.candidate.message.sequenceStep,
      claimedProviderMessageId: messageId,
      providerMessageId: delivery.messageId || messageId,
      acceptedAt: new Date(),
    });
    if (!accepted) {
      await markTrainingDeliveryAmbiguousFailure({
        campaignId: input.candidate.prospect.campaignId,
        prospectId: input.candidate.prospect.id,
        messageId: input.candidate.message.id,
        claimToken: token,
        error:
          "SMTP accepted but claim finalization lost; inspect manually before any resend.",
      });
      return {
        sent: false,
        skipped: "SMTP accepted but finalization requires manual review.",
        ambiguous: true,
      };
    }
    return { sent: true, skipped: null, ambiguous: false };
  } catch (error) {
    await markTrainingDeliveryAmbiguousFailure({
      campaignId: input.candidate.prospect.campaignId,
      prospectId: input.candidate.prospect.id,
      messageId: input.candidate.message.id,
      claimToken: token,
      error,
    });
    return {
      sent: false,
      skipped: error instanceof Error ? error.message : String(error),
      ambiguous: true,
    };
  }
}

/**
 * Cron callback work. Scope derives only from taskUid. Overnight research never
 * opens IMAP/SMTP. Daytime IMAP precedes send claims and fails closed on SMTP.
 */
async function runTrainingMaintenanceImpl(input: {
  taskUid: string;
  now?: Date;
}) {
  if (process.env.NODE_ENV === "development")
    return { ok: true, skipped: "development-sending-disabled" } as const;
  const deadline = outreachDeadline();
  const now = input.now ?? new Date();
  const currentTime = input.now ? () => input.now! : () => new Date();
  const moment = isTrainingMaintenanceMoment(now);
  const campaign = await getTrainingCampaignForScheduledTask(input.taskUid);
  if (!campaign)
    return { ok: true, skipped: "orphan-or-wrong-scheduler" } as const;
  if (isOutreachResearchWindow(now))
    return {
      ok: true,
      researchOnly: true,
      sent: false,
      newSent: 0,
      followupsSent: 0,
      replenishment: await requestTrainingReplenishment(campaign.id, now),
    } as const;
  if (!moment.inMaintenanceWindow)
    return { ok: true, skipped: "outside-central-maintenance-window" } as const;

  const inbox = await withOutreachStage(OUTREACH_INBOX_BUDGET_MS, () => checkTrainingInbox({ campaignId: campaign.id, now }));
  await ensureTrainingFollowupPlans(campaign.id);
  const reserve = await prepareTrainingReadyReserve(
    TRAINING_READY_RESERVE_TARGET
  );
  const replenishment = null;
  if (!moment.isSendTick)
    return {
      ok: true,
      maintenance: true,
      sent: false,
      repliesDetected: inbox.repliesDetected,
      bouncesDetected: inbox.bouncesDetected,
      unsubscribesDetected: inbox.unsubscribesDetected,
      reserveApproved: reserve.approved,
      readyInitialCount: reserve.health.readyInitialCount,
      reserveTarget: TRAINING_READY_RESERVE_TARGET,
      lowSupply: reserve.health.lowSupply,
      replenishment,
    } as const;

  const lease = await reserveTrainingDailyRun({
    campaignId: campaign.id,
    runDate: moment.dateKey,
    now,
  });
  if (!lease) {
    const health = await getTrainingSendingHealth(
      TRAINING_READY_RESERVE_TARGET
    );
    return {
      ok: true,
      skipped: "daily-batch-already-reserved",
      repliesDetected: inbox.repliesDetected,
      bouncesDetected: inbox.bouncesDetected,
      lowSupply: health.lowSupply,
      replenishment,
    } as const;
  }

  let newSent = 0;
  let followupsSent = 0;
  let errorCount = 0;
  try {
    const current = await getTrainingCampaignForScheduledTask(input.taskUid);
    if (!current || current.status !== "active") {
      await completeTrainingDailyRun({
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

    let initialAttempts = 0;
    for (const candidate of await getTrainingInitialCandidates(campaign.id)) {
      if (
        newSent >= TRAINING_DAILY_NEW_LIMIT ||
        initialAttempts >= TRAINING_DAILY_NEW_LIMIT ||
        !outreachHasSendBudget()
      )
        break;
      initialAttempts += 1;
      const result = await deliverTrainingCandidate({
        candidate,
        initialLease: lease,
        currentTime,
      });
      if (result.sent) newSent += 1;
      if (result.ambiguous) errorCount += 1;
    }
    let followupAttempts = 0;
    for (const candidate of await getDueTrainingFollowupCandidates(
      campaign.id,
      now
    )) {
      if (followupAttempts >= 20 || !outreachHasSendBudget()) break;
      followupAttempts += 1;
      const result = await deliverTrainingCandidate({ candidate, initialLease: lease, currentTime });
      if (result.sent) followupsSent += 1;
      if (result.ambiguous) errorCount += 1;
    }
    const health = await getTrainingSendingHealth(
      TRAINING_READY_RESERVE_TARGET
    );
    await completeTrainingDailyRun({
      campaignId: campaign.id,
      lease,
      status: errorCount ? "failed" : "started",
      newSent,
      followupsSent,
      repliesDetected: inbox.repliesDetected,
      errorCount,
      summary: `${newSent} initial and ${followupsSent} follow-up SMTP acceptances; ${inbox.repliesDetected} replies, ${inbox.bouncesDetected} bounces. ${health.readyInitialCount}/${TRAINING_READY_RESERVE_TARGET} verified initial reserve${health.lowSupply ? "; low verified supply" : ""}.`,
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
      readyInitialCount: health.readyInitialCount,
      reserveTarget: TRAINING_READY_RESERVE_TARGET,
      lowSupply: health.lowSupply,
      replenishment,
    } as const;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await completeTrainingDailyRun({
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

/** Must be mounted by the parent in the root index after deployment approval. */
async function trainingScheduledHandlerImpl(req: Request, res: Response) {
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
    // Request body is deliberately ignored. Authenticated task UID alone scopes work.
    const result = await runTrainingMaintenance({ taskUid: user.taskUid });
    const campaign = await getTrainingCampaignForScheduledTask(user.taskUid);
    if (campaign)
      await recordTrainingMaintenanceEvent(
        campaign.id,
        !result.ok,
        JSON.stringify(result)
      );
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      const campaign = await getTrainingCampaignForScheduledTask(user.taskUid);
      if (campaign)
        await recordTrainingMaintenanceEvent(campaign.id, true, message);
    } catch (recordError) {
      console.error(
        "[TrainingAutomation] Could not persist failure:",
        recordError
      );
    }
    console.error(`[TrainingAutomation] ${message}`);
    return res.status(500).json({
      error: message,
      stack: error instanceof Error ? error.stack : undefined,
      context: { url: req.originalUrl, taskUid: user.taskUid },
      timestamp: new Date().toISOString(),
    });
  }
}

export const TRAINING_SCHEDULE_CALLBACK = TRAINING_CALLBACK;

export async function runTrainingMaintenance(...args: Parameters<typeof runTrainingMaintenanceImpl>) { return withOutreachDeadline(() => runTrainingMaintenanceImpl(...args)); }
export async function trainingScheduledHandler(req: Request, res: Response) {
  try { return await withOutreachDeadline(() => trainingScheduledHandlerImpl(req, res)); }
  catch { return res.status(200).json({ ok: false, inspectionRequired: true, partial: true, error: "Bounded outreach callback stopped; attempts never automatically retry." }); }
}
