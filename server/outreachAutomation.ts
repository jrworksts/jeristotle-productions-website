import { randomBytes } from "node:crypto";
import { withOutreachDeadline, withOutreachStage, authenticateOutreach, outreachDeadline, outreachHasSendBudget, outreachDeadlineCheck, OUTREACH_INBOX_BUDGET_MS, OUTREACH_PERSISTENCE_BUDGET_MS, OUTREACH_SMTP_BUDGET_MS } from "./outreachDeadline";
import type { Request, Response } from "express";
import { JERISTOTLE_EMAIL } from "../shared/const";
import { renderJeristotleOutreachEmail } from "../shared/outreachFormatting";
import {
  OUTREACH_DAILY_NEW_CONTACT_LIMIT,
  isOutreachMaintenanceWindow,
  OUTREACH_PREPARATION_BATCH_LIMIT,
  OUTREACH_READY_BUFFER_TARGET,
} from "../shared/outreachMaintenance";
import {
  getNextFollowupAt,
  getOutreachLocalMoment,
} from "../shared/outreachSchedule";
import { isOutreachResearchWindow } from "../shared/outreachResearchWindow";
import { sdk } from "./_core/sdk";
import {
  autoApproveResearchReadyProspects,
  claimOutreachMessageForSend,
  recordOutreachSendAttempt,
  type ChamberDailyLease,
  claimOutreachResearchProspect,
  getApprovedInitialMessages,
  getCampaignForAutomation,
  getDueFollowupMessages,
  getOutreachNewSentCountForDate,
  getOutreachQueueHealth,
  getPreviousSentMessage,
  getQueuedResearchProspects,
  isOutreachEmailSuppressed,
  markOutreachMessageFailed,
  markOutreachMessageSent,
  markProspectResearchFailed,
  recordOutreachDailyRun,
  recordOutreachEvent,
  recoverStaleOutreachResearch,
  reserveOutreachDailyRun,
  saveAutomatedProspectResearch,
  skipOutreachMessage,
  updateOutreachProspect,
} from "./outreachDb";
import { sendJeristotleHtmlEmail } from "./inquiryEmail";
import { checkOutreachReplies } from "./outreachInbox";
import { researchOutreachProspect } from "./outreachResearch";
import { isCreditUnionEmailReserved } from "./creditUnionSendingDb";

function checkChamberInbox(now: Date) {
  return withOutreachStage(OUTREACH_INBOX_BUDGET_MS, () => checkOutreachReplies(
    now, Math.min(outreachDeadline(), Date.now() + OUTREACH_INBOX_BUDGET_MS)
  ));
}
function successfulInboxEvidence(result: Awaited<ReturnType<typeof checkOutreachReplies>>) {
  return { inboxCompleteAll: result.completeAll === true,
    inboxSearchCount: result.searchCount, inboxElapsedMs: result.inboxElapsedMs };
}

async function sendOutreachRecord(
  item: Awaited<ReturnType<typeof getApprovedInitialMessages>>[number],
  gate: { dailyLease: ChamberDailyLease; now: Date; inboxCheckedAt: Date; taskUid: string; freshNow: () => Date }
) {
  const { message, prospect } = item;
  const claimToken = randomBytes(24).toString('hex');
  const providerMessageId = `<chamber-${message.id}-${claimToken}@jeristotleproductions.com>`;
  let claimed = false;
  try {
    const currentCampaign = await getCampaignForAutomation();
    if (currentCampaign.status !== 'active' || currentCampaign.dailyTaskUid !== gate.taskUid) return { sent: false, skipped: true };
    if (await isCreditUnionEmailReserved(prospect.email)) {
      await skipOutreachMessage(message.id, prospect.id, 'Recipient already reserved or contacted in credit-union outreach.');
      return { sent: false, skipped: true };
    }
    if (await isOutreachEmailSuppressed(prospect.email)) {
      await skipOutreachMessage(message.id, prospect.id, 'Recipient is on the outreach suppression list.');
      return { sent: false, skipped: true };
    }
    const previous = message.sequenceStep > 0 ? await getPreviousSentMessage(prospect.id, message.sequenceStep) : undefined;
    if (message.sequenceStep > 0 && !previous?.providerMessageId) return { sent: false, skipped: true };
    if (!outreachHasSendBudget()) return { sent: false, skipped: false, partial: true };
    claimed = await withOutreachStage(OUTREACH_PERSISTENCE_BUDGET_MS, () => claimOutreachMessageForSend({
      messageId: message.id, prospectId: prospect.id, sequenceStep: message.sequenceStep, claimToken,
      dailyLease: gate.dailyLease, inboxCheckedAt: gate.inboxCheckedAt, now: gate.freshNow(),
      taskUid: gate.taskUid, expectedEmail: prospect.email, expectedSubject: message.subject, expectedTextBody: message.textBody,
    }));
    if (!claimed) return { sent: false, skipped: true };
    // Claims are permanent holds, not a license to bypass a fresh stop or source gate.
    const freshCampaign = await getCampaignForAutomation();
    if (freshCampaign.status !== 'active' || freshCampaign.dailyTaskUid !== gate.taskUid ||
      await isCreditUnionEmailReserved(prospect.email) || await isOutreachEmailSuppressed(prospect.email)) {
      await markOutreachMessageFailed(message.id, prospect.id, 'Fresh final send gate stopped an owned pre-SMTP claim; no automatic retry.', claimToken);
      return { sent: false, skipped: true };
    }
    outreachDeadlineCheck(OUTREACH_SMTP_BUDGET_MS + OUTREACH_PERSISTENCE_BUDGET_MS);
    const attempted = await withOutreachStage(OUTREACH_PERSISTENCE_BUDGET_MS, () => recordOutreachSendAttempt({
      messageId: message.id, claimToken, providerMessageId, dailyLease: gate.dailyLease,
      inboxCheckedAt: gate.inboxCheckedAt, now: gate.freshNow(),
      taskUid: gate.taskUid, expectedEmail: prospect.email, expectedSubject: message.subject, expectedTextBody: message.textBody,
    }));
    if (!attempted) return { sent: false, skipped: true };
    // No socket can open unless the provider ID + attempt write was confirmed.
    outreachDeadlineCheck(OUTREACH_SMTP_BUDGET_MS + OUTREACH_PERSISTENCE_BUDGET_MS);
    const delivery = await withOutreachStage(OUTREACH_SMTP_BUDGET_MS, () => sendJeristotleHtmlEmail({
      to: prospect.email, replyTo: JERISTOTLE_EMAIL, subject: message.subject, messageId: providerMessageId,
      html: renderJeristotleOutreachEmail({ subject: message.subject, text: message.textBody,
        physicalPostalAddress: freshCampaign.physicalPostalAddress,
        unsubscribeUrl: `https://jeristotleproductions.com/unsubscribe/${prospect.unsubscribeToken}` }),
      text: message.textBody, inReplyTo: previous?.providerMessageId || undefined, references: previous?.providerMessageId || undefined,
      headers: {
        'List-Unsubscribe': `<https://jeristotleproductions.com/unsubscribe/${prospect.unsubscribeToken}>, <mailto:${JERISTOTLE_EMAIL}?subject=Unsubscribe>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    }));
    if (!delivery.sent || delivery.messageId !== providerMessageId) throw new Error('SMTP result is absent or differs from durable provider ID; inspect, never resend.');
    const sentAt = gate.freshNow();
    const nextFollowupAt = message.sequenceStep < freshCampaign.maxFollowups
      ? getNextFollowupAt(sentAt, freshCampaign.followupDelayDays, freshCampaign.sendHourLocal, freshCampaign.timezone) : null;
    const recorded = await withOutreachStage(OUTREACH_PERSISTENCE_BUDGET_MS, () => markOutreachMessageSent({
      messageId: message.id, prospectId: prospect.id, sequenceStep: message.sequenceStep,
      providerMessageId, sentAt, nextFollowupAt, claimToken, dailyLease: gate.dailyLease,
    }));
    if (!recorded) throw new Error('SMTP accepted but receipt was not committed; inspect, never resend.');
    return { sent: true, skipped: false };
  } catch (error) {
    if (claimed) {
      // A cancelled SQL scope cannot persist; its claim/attempt still prevents retries.
      try { await withOutreachStage(OUTREACH_PERSISTENCE_BUDGET_MS, () => markOutreachMessageFailed(
        message.id, prospect.id, error instanceof Error ? error.message : String(error), claimToken)); } catch {}
    }
    throw error;
  }
}

export async function prepareAutomatedNewProspects(limit: number, now = new Date()) {
  const target = Math.min(OUTREACH_READY_BUFFER_TARGET, Math.max(1, limit));
  await recoverStaleOutreachResearch();
  await autoApproveResearchReadyProspects(target);
  let researchFailures = 0;
  let available = await getApprovedInitialMessages(target);
  const needed = Math.min(
    OUTREACH_PREPARATION_BATCH_LIMIT,
    Math.max(0, target - available.length)
  );
  if (needed === 0 || !isOutreachResearchWindow(now)) return { available, researchFailures };

  const candidates = await getQueuedResearchProspects(needed);
  await Promise.all(
    candidates.map(async prospect => {
      if (!(await claimOutreachResearchProspect(prospect.id))) return;
      try {
        const research = await researchOutreachProspect(prospect);
        await saveAutomatedProspectResearch({
          prospectId: prospect.id,
          personalizedSubject: research.personalizedSubject,
          personalizedOpening: research.personalizedOpening,
          questionAboutGoals: research.questionAboutGoals,
          personalizedHelpAngle: research.personalizedHelpAngle,
          researchSummary: research.researchSummary,
          researchSources: research.sources,
          claimsToAvoid: research.claimsToAvoid,
          autoApprove: true,
        });
      } catch (error) {
        researchFailures += 1;
        await markProspectResearchFailed(
          prospect.id,
          error instanceof Error ? error.message : String(error)
        );
      }
    })
  );
  available = await getApprovedInitialMessages(target);
  return { available, researchFailures };
}

async function runChamberOutreachDailyImpl(options: {
  taskUid: string;
  now?: Date;
}) {
  const now = options.now ?? new Date();
  const startedAt = Date.now();
  // Explicit now is for pure tests; production always advances wall time within this callback.
  const freshNow = () => options.now ? new Date(now.getTime() + Date.now() - startedAt) : new Date();
  const moment = getOutreachLocalMoment(now);
  const campaign = await getCampaignForAutomation();

  if (campaign.dailyTaskUid !== options.taskUid) {
    return { ok: true, skipped: "wrong-scheduler" } as const;
  }
  if (isOutreachResearchWindow(now)) {
    if (campaign.status !== "active")
      return { ok: true, skipped: "campaign-not-active" } as const;
    const prepared = await prepareAutomatedNewProspects(OUTREACH_READY_BUFFER_TARGET, now);
    return {
      ok: prepared.researchFailures === 0,
      researchOnly: true,
      prepared: true,
      readyCount: prepared.available.length,
      researchFailures: prepared.researchFailures,
      sent: false,
      newSent: 0,
      followupsSent: 0,
    } as const;
  }
  // Sending is seven days, 09:00–16:59 Chicago; only newly marked unfinished runs can continue.
  if (moment.hour < 9 || moment.hour >= 17) {
    if (!isOutreachMaintenanceWindow(moment)) return { ok: true, skipped: 'outside-send-window' } as const;
    if (campaign.status !== 'active') return { ok: true, skipped: 'campaign-not-active' } as const;
    const replies = await checkChamberInbox(now);
    const prepared = await prepareAutomatedNewProspects(OUTREACH_READY_BUFFER_TARGET, now);
    const health = await getOutreachQueueHealth(now);
    await recordOutreachEvent({ eventType: 'queue_maintenance',
      detail: `${health.readyCount}/${OUTREACH_READY_BUFFER_TARGET} introductions ready; ${health.eligibleQueuedCount} eligible prospects queued.`, occurredAt: now });
    return { ok: prepared.researchFailures === 0, prepared: true, readyCount: prepared.available.length,
      researchFailures: prepared.researchFailures, repliesDetected: replies.repliesDetected, lowSupply: health.lowSupply,
      ...successfulInboxEvidence(replies) } as const;
  }
  const lease = await reserveOutreachDailyRun(moment.dateKey, freshNow());
  if (!lease) {
    if (campaign.status === 'active') {
      const replies = await checkChamberInbox(now);
      const prepared = await prepareAutomatedNewProspects(OUTREACH_READY_BUFFER_TARGET, now);
      return { ok: prepared.researchFailures === 0, skipped: 'already-ran', prepared: true,
        readyCount: prepared.available.length, researchFailures: prepared.researchFailures, repliesDetected: replies.repliesDetected,
        ...successfulInboxEvidence(replies) } as const;
    }
    return { ok: true, skipped: 'already-ran' } as const;
  }
  let repliesDetected = 0, newSent = 0, followupsSent = 0, errorCount = 0;
  let initialMessages: Awaited<ReturnType<typeof getApprovedInitialMessages>> = [];
  let remainingNewLimit = Math.max(0, OUTREACH_DAILY_NEW_CONTACT_LIMIT - lease.newReserved);
  let partial = false;
  try {
    if (campaign.status !== 'active') {
      await withOutreachStage(OUTREACH_PERSISTENCE_BUDGET_MS, () => recordOutreachDailyRun({ runDate: moment.dateKey,
        status: 'skipped', newSent, followupsSent, repliesDetected, errorCount, lease, now: freshNow(),
        summary: `Campaign is ${campaign.status}; no messages were sent.` }));
      return { ok: true, skipped: 'campaign-not-active', repliesDetected } as const;
    }
    if (campaign.timezone !== 'America/Chicago' || campaign.sendHourLocal !== 9 || campaign.dailyNewLimit !== 10 ||
      !campaign.physicalPostalAddress || campaign.physicalPostalAddress.trim().length < 10)
      throw new Error('Chamber sending configuration invalid; sending blocked.');
    const replyResult = await checkChamberInbox(now);
    if ((replyResult as typeof replyResult & { completeAll?: boolean }).completeAll !== true)
      throw new Error('Fresh completeAll INBOX/Junk/Trash check was not confirmed; sending blocked.');
    repliesDetected = replyResult.repliesDetected;
    // Approved introductions get the bounded callback first; follow-ups remain extra and never consume new quota.
    await autoApproveResearchReadyProspects(campaign.dailyNewLimit);
    remainingNewLimit = Math.max(0, OUTREACH_DAILY_NEW_CONTACT_LIMIT - Math.max(lease.newReserved,
      await getOutreachNewSentCountForDate(moment.dateKey)));
    initialMessages = remainingNewLimit > 0 ? await getApprovedInitialMessages(remainingNewLimit) : [];
    const gate = { dailyLease: lease, now, inboxCheckedAt: now, taskUid: options.taskUid, freshNow };
    for (const item of initialMessages) {
      if (!outreachHasSendBudget()) { partial = true; break; }
      try { const result = await sendOutreachRecord(item, gate); if (result.sent) newSent++; if (result.partial) partial = true; }
      catch { errorCount++; }
    }
    let followupBatchComplete = false;
    if (outreachHasSendBudget()) {
      const dueFollowups = await getDueFollowupMessages(freshNow());
      let visited = 0;
      for (const item of dueFollowups) {
        if (!outreachHasSendBudget()) { partial = true; break; }
        visited++;
        try { const result = await sendOutreachRecord(item, gate); if (result.sent) followupsSent++; if (result.partial) partial = true; }
        catch { errorCount++; }
      }
      followupBatchComplete = visited === dueFollowups.length && dueFollowups.length < 100;
    } else partial = true;
    // No public supply is not a promise of ten sends: retain a safely resumable new run for later approved supply.
    const capSatisfied = remainingNewLimit === 0 || newSent >= remainingNewLimit;
    const status = !partial && !errorCount && capSatisfied && followupBatchComplete ? 'complete' : 'started';
    partial = status === 'started';
    await withOutreachStage(OUTREACH_PERSISTENCE_BUDGET_MS, () => recordOutreachDailyRun({ runDate: moment.dateKey,
      status, newSent, followupsSent, repliesDetected, errorCount, lease, now: freshNow(),
      summary: `${newSent} new messages and ${followupsSent} follow-ups accepted in this bounded batch; ${repliesDetected} replies detected.${initialMessages.length === 0 && remainingNewLimit > 0 ? ' No approved introductions ready; verified public supply required.' : ''}${partial ? ' Unfinished marked run retained; reservations and attempts never reset or retry.' : ''}` }));
    return { ok: true, sent: newSent + followupsSent > 0, partial,
      queueEmpty: initialMessages.length === 0 && remainingNewLimit > 0, newSent, followupsSent, repliesDetected, errorCount,
      ...successfulInboxEvidence(replyResult) } as const;
  } catch (error) {
    errorCount++;
    const message = error instanceof Error ? error.message : String(error);
    try {
      await withOutreachStage(OUTREACH_PERSISTENCE_BUDGET_MS, () => recordOutreachDailyRun({ runDate: moment.dateKey,
        status: 'started', newSent, followupsSent, repliesDetected, errorCount, lease, now: freshNow(), summary: message }));
    } catch { /* Expiring lease is sufficient; no detached persistence or sends. */ }
    return { ok: false, partial: true, inspectionRequired: true, error: message, newSent, followupsSent, repliesDetected, errorCount } as const;
  }
}

async function chamberOutreachDailyHandlerImpl(req: Request) {
  try {
    const user = await authenticateOutreach(options => sdk.authenticateRequest(req, options));
    if (!user.isCron || !user.taskUid) {
      return { httpStatus: 403, payload: { error: "cron-only endpoint" } };
    }
    const result = await runChamberOutreachDaily({ taskUid: user.taskUid });
    return { httpStatus: 200, payload: result.ok === false
      ? { ...result, ...chamberCallbackFailure(new Error("error" in result ? String(result.error) : "")) } : result };
  } catch (error) {
    return { httpStatus: 500, payload: chamberCallbackFailure(error) };
  }
}

function chamberCallbackFailure(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const failureKind = /stage.*deadline/i.test(message) ? "bounded-stage-expired"
    : /(?:27s absolute callback deadline|absolute deadline reached)/i.test(message) ? "callback-deadline-expired"
    : "callback-failed";
  // Only fixed diagnostics are serialized or logged; SQL/mail text and capabilities stay private.
  return { ok: false, inspectionRequired: true, partial: true, failureKind,
    error: "Bounded outreach callback stopped; attempts never automatically retry." };
}

export async function runChamberOutreachDaily(...args: Parameters<typeof runChamberOutreachDailyImpl>) {
  try { return await withOutreachDeadline(() => runChamberOutreachDailyImpl(...args)); }
  catch (error) {
    return { ok: false, inspectionRequired: true, partial: true, error: error instanceof Error ? error.message : String(error) };
  }
}
export async function chamberOutreachDailyHandler(req: Request, res: Response) {
  let response;
  try { response = await withOutreachDeadline(() => chamberOutreachDailyHandlerImpl(req)); }
  catch (error) { response = { httpStatus: 200, payload: chamberCallbackFailure(error) }; }
  // The bounded operation never receives res. Exactly this owner writes after it settles;
  // cancellation cannot leave an inner handler writing a second response later.
  if (res.headersSent || res.writableEnded || res.destroyed) return;
  if ("failureKind" in response.payload) {
    console.error(`[ChamberOutreach] ${response.payload.failureKind}; attempts preserved, sending blocked.`);
  }
  return res.status(response.httpStatus).json(response.payload);
}
