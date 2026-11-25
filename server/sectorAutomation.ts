import { withOutreachDeadline, authenticateOutreach, outreachDeadline, OUTREACH_CALLBACK_BUDGET_MS, OUTREACH_PERSISTENCE_BUDGET_MS } from "./outreachDeadline";
import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, desc } from "drizzle-orm";
import type { Request, Response } from "express";
import {
  sectorOutreachGroups as groups,
  sectorOutreachCampaigns as campaigns,
  sectorOutreachProspects as prospects,
  sectorOutreachMessages as messages,
  sectorOutreachEvents as events,
} from "../drizzle/schema";
import {
  SECTOR_COPY_VERSION,
  SECTOR_CAP_POLICY_VERSION,
  SECTOR_DAILY_NEW_PER_CAMPAIGN,
  sectorFollowupAt,
} from "../shared/sectorOutreach";
import {
  buildSectorSequence,
  readSectorEvidence,
} from "../shared/sectorResearch";
import { getOutreachLocalMoment } from "../shared/outreachSchedule";
import { isPublicTrainingHttpUrl } from "../shared/trainingOutreach";
import { isOutreachResearchWindow } from "../shared/outreachResearchWindow";
import { OUTREACH_VERIFIED_INITIAL_RESERVE_TARGET, OUTREACH_INITIAL_REFILL_START_BELOW, OUTBOUND_REPLENISHMENT_MAX_REQUESTS_PER_DAY, OUTBOUND_REPLENISHMENT_COOLDOWN_MS } from "../shared/outboundReplenishmentPolicy";
import { shouldRefillInitialReserve } from "../shared/outreachReserveRefill";
import { sdk } from "./_core/sdk";
import {
  buildSectorEmail,
  sendSectorEmail,
  sectorEmailTransportConfigured,
  SECTOR_SMTP_DEADLINE_MS,
} from "./sectorEmail";
import {
  sectorDatabase,
  withSectorDeadline,
  sectorDeadlineCheck,
  sectorGroupAuthorized,
  assertSectorFixedConfiguration,
  getSectorRuntimeWorkspace,
  getSectorExclusions,
  sectorProspectQualified,
  prepareSectorReserve,
} from "./sectorRuntimeDb";
import { checkSectorInbox } from "./sectorInbox";

export const SECTOR_CALLBACK_PATH = "/api/scheduled/sector-outreach";
export const SECTOR_CALLBACK_BUDGET_MS = OUTREACH_CALLBACK_BUDGET_MS;
export const SECTOR_PERSISTENCE_BUDGET_MS = OUTREACH_PERSISTENCE_BUDGET_MS;
export function sectorSendMoment(now: Date) {
  const m = getOutreachLocalMoment(now);
  return {
    ...m,
    maintenance: m.hour >= 8 && m.hour < 17,
    send: m.hour >= 9 && m.hour < 17,
  };
}
export function sectorHasSendBudget(deadline: number, now = Date.now()) {
  return (
    Number.isFinite(deadline) &&
    deadline - now >= SECTOR_SMTP_DEADLINE_MS + SECTOR_PERSISTENCE_BUDGET_MS
  );
}
type Group = typeof groups.$inferSelect;
type Campaign = typeof campaigns.$inferSelect;
type Prospect = typeof prospects.$inferSelect;
type Message = typeof messages.$inferSelect;
type Exclusions = Awaited<ReturnType<typeof getSectorExclusions>>;
export function sectorCampaignAuthorized(
  g: Group | undefined,
  c: Campaign | undefined,
  taskUid: string
) {
  return Boolean(
    sectorGroupAuthorized(g) &&
      g?.policyVersion === SECTOR_CAP_POLICY_VERSION &&
      g?.sendingEnabled === 1 &&
      c?.groupId === 1 &&
      c.status === "active" &&
      c.schedulerTaskUid === taskUid &&
      c.dailyNewLimit === SECTOR_DAILY_NEW_PER_CAMPAIGN &&
      c.reserveTarget === OUTREACH_VERIFIED_INITIAL_RESERVE_TARGET &&
      taskUid
  );
}
export function sectorMessageEligible(input: {
  group: Group | undefined;
  campaign: Campaign | undefined;
  prospect: Prospect | undefined;
  message: Message | undefined;
  previous?: Message;
  taskUid: string;
  phase: "claim" | "attempt";
  token?: string;
  providerId?: string;
  now: Date;
  deadline: number;
  exclusions: Exclusions;
}) {
  const {
    group: g,
    campaign: c,
    prospect: p,
    message: m,
    previous,
    now,
  } = input;
  if (
    !sectorCampaignAuthorized(g, c, input.taskUid) ||
    !c ||
    !p ||
    !m ||
    !sectorHasSendBudget(input.deadline, now.getTime()) ||
    !sectorSendMoment(now).send
  )
    return false;
  if (
    !c.lastInboxScanAt ||
    now.getTime() - c.lastInboxScanAt.getTime() > 120000 ||
    c.lastInboxScanAt > now
  )
    return false;
  if (
    p.groupId !== 1 ||
    m.groupId !== 1 ||
    m.campaignKey !== c.campaignKey ||
    p.campaignKey !== c.campaignKey ||
    m.prospectId !== p.id ||
    m.attemptedAt ||
    m.smtpAcceptedAt ||
    m.receiptJson ||
    !sectorProspectQualified(p, input.exclusions, now) ||
    m.copyVersion !== SECTOR_COPY_VERSION ||
    ![1, 2, 3].includes(m.messageNumber)
  )
    return false;
  if (
    input.phase === "claim"
      ? m.status !== "approved" || Boolean(m.claimToken)
      : m.status !== "claimed" ||
        !input.token ||
        m.claimToken !== input.token ||
        m.providerMessageId !== input.providerId
  )
    return false;
  try {
    const canonical = buildSectorSequence(
      readSectorEvidence(p.evidenceJson)
    ).find(s => s.messageNumber === m.messageNumber);
    if (
      !canonical ||
      m.subject !== canonical.subject ||
      m.textBody !== canonical.textBody ||
      m.htmlBody !== canonical.htmlBody
    )
      return false;
  } catch {
    return false;
  }
  if (m.messageNumber === 1)
    return (
      p.status === "ready" &&
      !p.firstSentAt &&
      (!m.scheduledAt || m.scheduledAt <= now)
    );
  if (
    p.status !== "contacted" ||
    !p.firstSentAt ||
    !m.scheduledAt ||
    m.scheduledAt > now ||
    !previous ||
    previous.groupId !== 1 ||
    previous.campaignKey !== c.campaignKey ||
    previous.prospectId !== p.id ||
    previous.messageNumber !== m.messageNumber - 1 ||
    previous.status !== "sent" ||
    !previous.attemptedAt ||
    !previous.smtpAcceptedAt ||
    previous.smtpAcceptedAt > now ||
    !previous.providerMessageId
  )
    return false;
  return (
    sectorFollowupAt(previous.smtpAcceptedAt, m.messageNumber as 2 | 3) <= now
  );
}
/** Both phases lock group -> campaign -> prospect -> message; cap is checked in the attempt transaction, not from callback-local counts. */
export async function claimSectorMessage(input: {
  campaignId: number;
  prospectId: number;
  messageId: number;
  token: string;
  providerId: string;
  taskUid: string;
  deadline: number;
  phase: "claim" | "attempt";
}) {
  if (!sectorHasSendBudget(input.deadline)) return null;
  const db = await sectorDatabase();
  return db.transaction(async tx => {
    const [g] = await tx
      .select()
      .from(groups)
      .where(eq(groups.id, 1))
      .for("update");
    const cs = await tx
      .select()
      .from(campaigns)
      .where(eq(campaigns.groupId, 1))
      .for("update");
    const c = cs.find(c => c.id === input.campaignId);
    if (!g) return null;
    assertSectorFixedConfiguration(g, cs);
    const [p] = await tx
      .select()
      .from(prospects)
      .where(eq(prospects.id, input.prospectId))
      .for("update");
    const [m] = await tx
      .select()
      .from(messages)
      .where(eq(messages.id, input.messageId))
      .for("update");
    const [previous] =
      m && m.messageNumber > 1
        ? await tx
            .select()
            .from(messages)
            .where(
              and(
                eq(messages.prospectId, input.prospectId),
                eq(messages.messageNumber, m.messageNumber - 1)
              )
            )
            .for("update")
        : [];
    const ex = await getSectorExclusions(tx as any),
      now = new Date();
    if (
      !sectorMessageEligible({
        ...input,
        group: g,
        campaign: c,
        prospect: p,
        message: m,
        previous,
        now,
        exclusions: ex,
      }) ||
      !c ||
      !p ||
      !m
    )
      return null;
    const day = getOutreachLocalMoment(now).dateKey;
    if (m.messageNumber === 1) {
      const attempted = await tx
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.groupId, 1),
            eq(messages.campaignKey, c.campaignKey),
            eq(messages.messageNumber, 1)
          )
        );
      const used = attempted.filter(
        a =>
          a.attemptedAt &&
          (a.attemptDate || getOutreachLocalMoment(a.attemptedAt).dateKey) ===
            day
      ).length;
      if (used >= SECTOR_DAILY_NEW_PER_CAMPAIGN) return null;
    }
    sectorDeadlineCheck(SECTOR_SMTP_DEADLINE_MS + SECTOR_PERSISTENCE_BUDGET_MS);
    if (input.phase === "claim")
      await tx
        .update(messages)
        .set({
          status: "claimed",
          claimToken: input.token,
          claimedAt: now,
          providerMessageId: input.providerId,
        })
        .where(eq(messages.id, m.id));
    else {
      // Crash after commit, including before connect, remains terminal uncertain and consumes the daily cap.
      await tx
        .update(messages)
        .set({
          status: "uncertain",
          attemptedAt: now,
          attemptDate: day,
          error:
            "Attempt persisted before SMTP. Acceptance unconfirmed; never automatically retry.",
        })
        .where(eq(messages.id, m.id));
      await tx
        .insert(events)
        .values({
          groupId: 1,
          campaignKey: c.campaignKey,
          eventKey: `sector-attempt:${m.id}:${input.token}`,
          eventType: "message_attempt",
          detailJson: JSON.stringify({
            prospectId: p.id,
            messageId: m.id,
            messageNumber: m.messageNumber,
            providerMessageId: input.providerId,
            attemptDate: day,
            attemptedAt: now.toISOString(),
            terminalUnlessConfirmed: true,
          }),
        });
    }
    return { prospect: p, message: m, previous };
  });
}
export async function recordSectorAcceptance(input: {
  campaignId: number;
  messageId: number;
  prospectId: number;
  token: string;
  providerId: string;
  acceptedAt: Date;
}) {
  const db = await sectorDatabase();
  return db.transaction(async tx => {
    await tx.select().from(groups).where(eq(groups.id, 1)).for("update");
    await tx
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, input.campaignId))
      .for("update");
    const [p] = await tx
      .select()
      .from(prospects)
      .where(eq(prospects.id, input.prospectId))
      .for("update");
    const [m] = await tx
      .select()
      .from(messages)
      .where(eq(messages.id, input.messageId))
      .for("update");
    if (
      !p ||
      !m ||
      m.prospectId !== p.id ||
      m.claimToken !== input.token ||
      m.providerMessageId !== input.providerId ||
      !m.attemptedAt
    )
      throw new Error("Attempt identity mismatch; inspect immutable receipt");
    if (m.receiptJson || m.smtpAcceptedAt)
      return { recorded: false, alreadyRecorded: true };
    await tx
      .update(messages)
      .set({
        status: "sent",
        smtpAcceptedAt: input.acceptedAt,
        receiptJson: JSON.stringify({
          providerMessageId: input.providerId,
          acceptedAt: input.acceptedAt.toISOString(),
          smtpAccepted: true,
          delivered: false,
        }),
        error: null,
      })
      .where(eq(messages.id, m.id));
    const stopped =
      Boolean(p.stoppedAt) || !["ready", "contacted"].includes(p.status);
    await tx
      .update(prospects)
      .set({
        firstSentAt: p.firstSentAt || input.acceptedAt,
        lastSentAt: input.acceptedAt,
        ...(!stopped
          ? {
              status:
                m.messageNumber === 3
                  ? ("complete" as const)
                  : ("contacted" as const),
            }
          : {}),
      })
      .where(eq(prospects.id, p.id));
    if (m.messageNumber < 3 && !stopped) {
      const [next] = await tx
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.prospectId, p.id),
            eq(messages.messageNumber, m.messageNumber + 1)
          )
        )
        .for("update");
      if (
        next &&
        next.status === "approved" &&
        !next.attemptedAt &&
        !next.claimToken
      )
        await tx
          .update(messages)
          .set({
            scheduledAt: sectorFollowupAt(
              input.acceptedAt,
              (m.messageNumber + 1) as 2 | 3
            ),
          })
          .where(eq(messages.id, next.id));
    }
    await tx
      .insert(events)
      .ignore()
      .values({
        groupId: 1,
        campaignKey: m.campaignKey,
        eventKey: `sector-acceptance:${m.id}:${input.token}`,
        eventType: "smtp_accepted",
        detailJson: JSON.stringify({
          prospectId: p.id,
          messageId: m.id,
          providerMessageId: input.providerId,
          acceptedAt: input.acceptedAt.toISOString(),
          delivered: false,
          stopPreserved: stopped,
        }),
      });
    return { recorded: true };
  });
}
export async function requestSectorResearch(
  input: { now?: Date; deadline?: number } = {}
) {
  const now = input.now || new Date();
  if (!isOutreachResearchWindow(now))
    return { requested: false, reason: "outside-central-research-window" };
  const deadline = input.deadline || Date.now() + 25000,
    w = await getSectorRuntimeWorkspace();
  if (w.health.byCampaign.every(h => h.readyInitialCount >= h.reserveTarget))
    return { requested: false, reason: "reserve-full" };
  const db = await sectorDatabase();
  const [finish] = await db.select({ detailJson: events.detailJson }).from(events)
    .where(and(eq(events.groupId, 1), eq(events.eventType, "research_finished")))
    .orderBy(desc(events.occurredAt)).limit(1);
  const completed = finish ? JSON.parse(finish.detailJson) : null;
  if (!w.health.byCampaign.some(h => shouldRefillInitialReserve(h.readyInitialCount,
    Array.isArray(completed?.readyByCampaign) ? completed.readyByCampaign.find((r: any) => r.campaignKey === h.campaignKey) : null)))
    return { requested: false, reason: "reserve-sufficient-no-active-refill" };
  if (Date.now() + 20000 >= deadline)
    return { requested: false, reason: "deadline" };
  const request = await db.transaction(async tx => {
    const [g] = await tx
      .select()
      .from(groups)
      .where(eq(groups.id, 1))
      .for("update");
    if (
      !g ||
      !sectorGroupAuthorized(g) ||
      g.researchEnabled !== 1 ||
      !g.researchWebhookUrl ||
      (g.researchLeaseUntil && g.researchLeaseUntil > now)
    )
      return null;
    if (
      !isPublicTrainingHttpUrl(g.researchWebhookUrl) ||
      !g.researchWebhookUrl.startsWith("https://")
    )
      throw new Error("Research webhook is not trusted public HTTPS");
    const day = getOutreachLocalMoment(now).dateKey,
      prior = await tx
        .select()
    .from(events)
    .where(
      and(eq(events.groupId, 1), eq(events.eventType, "research_requested"))
    );
    if (
      prior.filter(e => getOutreachLocalMoment(e.occurredAt).dateKey === day)
        .length >= OUTBOUND_REPLENISHMENT_MAX_REQUESTS_PER_DAY ||
      (g.researchRequestedAt && now.getTime() - g.researchRequestedAt.getTime() < OUTBOUND_REPLENISHMENT_COOLDOWN_MS)
    )
      return null;
    const requestToken = randomBytes(24).toString("hex"),
      requestedAt = new Date(Math.floor(now.getTime() / 1000) * 1000),
      expiresAt = requestedAt.getTime() + 6 * 3600000;
    const payload = {
      kind: "sector_low_supply",
      groupId: 1,
      requestToken,
      requestedAt: requestedAt.toISOString(),
      expiresAt,
      refillThreshold: OUTREACH_INITIAL_REFILL_START_BELOW,
      byCampaign: w.health.byCampaign.map(h => ({
        campaignKey: h.campaignKey,
        readyInitialCount: h.readyInitialCount,
        reserveTarget: h.reserveTarget,
      })),
      noSends: true,
    };
    await tx
      .update(groups)
      .set({
        researchLeaseToken: requestToken,
        researchRequestedAt: requestedAt,
        researchLeaseUntil: new Date(expiresAt),
      })
      .where(eq(groups.id, 1));
    await tx
      .insert(events)
      .values({
        groupId: 1,
        eventKey: `sector-research:${requestToken}`,
        eventType: "research_requested",
        detailJson: JSON.stringify(payload),
        occurredAt: requestedAt,
      });
    return { url: g.researchWebhookUrl, payload };
  });
  if (!request)
    return {
      requested: false,
      reason: "not-approved-connected-or-lease-bound",
    };
  try {
    if (Date.now() + 15000 >= deadline) throw new Error("Deadline");
    const response = await fetch(request.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request.payload),
      signal: AbortSignal.timeout(
        Math.min(15000, deadline - Date.now() - 5000)
      ),
      redirect: "error",
    });
    if (!response.ok) throw new Error("Unconfirmed research request");
    await response.body?.cancel();
    return { requested: true, requestToken: request.payload.requestToken };
  } catch {
    await db
      .insert(events)
      .ignore()
      .values({
        groupId: 1,
        eventKey: `sector-research:${request.payload.requestToken}:uncertain`,
        eventType: "research_request_uncertain",
        detailJson: JSON.stringify({
          requestToken: request.payload.requestToken,
          reason:
            "HTTP outcome uncertain; preserve original six-hour lease, never retry this request.",
        }),
      });
    return { requested: false, inspectionRequired: true };
  }
}
async function maintenance(input: { taskUid: string }, deadline: number) {
  const db = await sectorDatabase();
  const [c] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.schedulerTaskUid, input.taskUid));
  const [g] = await db.select().from(groups).where(eq(groups.id, 1));
  if (!c || !sectorCampaignAuthorized(g, c, input.taskUid))
    return { ok: true, skipped: "inactive-or-wrong-task" };
  const now = new Date();
  if (isOutreachResearchWindow(now))
    return {
      ok: true,
      researchOnly: true,
      newAttempts: 0,
      followupAttempts: 0,
      smtpAccepted: 0,
      uncertain: 0,
      replenishment: await requestSectorResearch({ now, deadline }),
    };
  if (!sectorSendMoment(new Date()).maintenance)
    return { ok: true, skipped: "outside-Chicago-window" };
  // Even zero targets require configured monitoring and complete All/Junk/Trash discovery.
  await checkSectorInbox(
    c.id,
    new Date(),
    Math.min(deadline - SECTOR_PERSISTENCE_BUDGET_MS, Date.now() + 8000)
  );
  sectorDeadlineCheck(4000);
  await prepareSectorReserve();
  const w = await getSectorRuntimeWorkspace();
  let sent = 0,
    uncertain = 0,
    newAttempts = 0,
    followupAttempts = 0;
  if (sectorSendMoment(new Date()).send && sectorEmailTransportConfigured()) {
    const candidates = w.messages
      .filter(
        m =>
          m.campaignKey === c.campaignKey &&
          m.status === "approved" &&
          !m.claimToken &&
          !m.attemptedAt &&
          (m.messageNumber === 1 ||
            (m.scheduledAt && m.scheduledAt <= new Date()))
      )
      .sort((a, b) => a.messageNumber - b.messageNumber || a.id - b.id);
    for (const m of candidates) {
      if (!sectorHasSendBudget(deadline) || !sectorSendMoment(new Date()).send)
        break;
      const token = randomBytes(24).toString("hex"),
        providerId = `<sector-${m.id}-${token}@jeristotleproductions.com>`,
        p = w.prospects.find(p => p.id === m.prospectId);
      if (!p?.email) continue;
      try {
        buildSectorEmail({
          to: p.email,
          subject: m.subject,
          text: m.textBody,
          messageId: providerId,
        });
      } catch {
        continue;
      }
      const claimInput = {
        campaignId: c.id,
        prospectId: p.id,
        messageId: m.id,
        token,
        providerId,
        taskUid: input.taskUid,
        deadline,
      };
      const claim = await claimSectorMessage({ ...claimInput, phase: "claim" });
      if (!claim) continue;
      const attempt = await claimSectorMessage({
        ...claimInput,
        phase: "attempt",
      });
      if (!attempt) continue; // Claimed but unattempted remains held; never automatic resend or edit.
      if (m.messageNumber === 1) newAttempts++;
      else followupAttempts++;
      try {
        const result = await sendSectorEmail(
          buildSectorEmail({
            to: attempt.prospect.email!,
            subject: attempt.message.subject,
            text: attempt.message.textBody,
            messageId: providerId,
            previousMessageId: attempt.previous?.providerMessageId,
          }),
          { deadline: deadline - SECTOR_PERSISTENCE_BUDGET_MS }
        );
        if (!result.sent) throw new Error("Acceptance unconfirmed");
        await recordSectorAcceptance({
          campaignId: c.id,
          messageId: m.id,
          prospectId: p.id,
          token,
          providerId,
          acceptedAt: new Date(),
        });
        sent++;
      } catch {
        uncertain++;
        sectorDeadlineCheck(1000);
        await db
          .insert(events)
          .ignore()
          .values({
            groupId: 1,
            campaignKey: c.campaignKey,
            eventKey: `sector-uncertain:${m.id}:${token}`,
            eventType: "smtp_uncertain",
            detailJson: JSON.stringify({
              prospectId: p.id,
              messageId: m.id,
              providerMessageId: providerId,
              reason:
                "SMTP or receipt persistence uncertain; attempt remains terminal, never automatically retry.",
            }),
          });
      }
    }
  }
  // No daily batch marker: partial callbacks can safely catch up until this campaign's ten-new-attempt cap.
  sectorDeadlineCheck(1000);
  await db
    .insert(events)
    .values({
      groupId: 1,
      campaignKey: c.campaignKey,
      eventKey: "sector-maintenance:" + randomUUID(),
      eventType: "maintenance_result",
      detailJson: JSON.stringify({
        newAttempts,
        followupAttempts,
        smtpAccepted: sent,
        uncertain,
        date: getOutreachLocalMoment(new Date()).dateKey,
      }),
    });
  const replenishment = null;
  return {
    ok: true,
    newAttempts,
    followupAttempts,
    smtpAccepted: sent,
    uncertain,
    replenishment,
  };
}
export async function runSectorMaintenance(input: { taskUid: string }) {
  if (process.env.NODE_ENV !== "production")
    return { ok: true, skipped: "development-sending-disabled" };
  return withOutreachDeadline(() => maintenance(input, outreachDeadline()));
}
export async function sectorScheduledHandler(req: Request, res: Response) {
  try {
    return await withOutreachDeadline(async () => {
      const user = await authenticateOutreach(options => sdk.authenticateRequest(req, options));
      if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
      return res.json(await runSectorMaintenance({ taskUid: user.taskUid }));
    });
  } catch {
    return res.status(200).json({ ok: false, inspectionRequired: true, partial: true,
      error: "Sector bounded maintenance blocked or uncertain; attempted emails never retry." });
  }
}
