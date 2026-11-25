import { and, eq } from "drizzle-orm";
import { getDb } from "./db";
import {
  chamberOutreachCampaigns,
  chamberOutreachProspects,
  chamberOutreachMessages,
  chamberOutreachEvents,
  chamberOutreachSuppressions,
} from "../drizzle/schema";

type HoldInput = {
  campaignId: number;
  prospectId: number;
  email: string;
  messageId: number;
  expectedSentAt: Date;
  expectedProviderMessageId: string | null;
  receivedAt: Date;
  evidenceKey: string;
  safetyVersion: string;
  deadline: number;
};
const fail = (reason: string): never => {
  throw new Error(
    `Chamber inbox manual-review hold ${reason}; sending blocked.`
  );
};
/** Pure fence: only a stopped/review recipient, a cleared queue and a retained exact hold is safe. */
export function chamberReviewAlreadySafe(
  prospect: { status: string; nextFollowupAt: Date | null },
  messages: Array<{
    status: string;
    sentAt: Date | null;
    providerMessageId: string | null;
  }>,
  suppressed: boolean
) {
  return (
    [
      "review",
      "replied",
      "unsubscribed",
      "bounced",
      "meeting",
      "not_fit",
      "complete",
    ].includes(prospect.status) &&
    !prospect.nextFollowupAt &&
    suppressed &&
    !messages.some(
      m =>
        ["draft", "approved", "scheduled"].includes(m.status) &&
        !m.sentAt &&
        !m.providerMessageId
    )
  );
}
/** No campaign upsert, controls, sent copy, failed attempt or old audit mutation. All locks/guards precede DML. */
export async function holdChamberAmbiguousNotice(input: HoldInput) {
  const check = () => {
    if (!Number.isFinite(input.deadline) || Date.now() >= input.deadline)
      fail("deadline exceeded");
  };
  check();
  if (
    !/^[a-f0-9]{64}$/.test(input.evidenceKey) ||
    !input.expectedProviderMessageId ||
    !Number.isFinite(input.expectedSentAt.getTime()) ||
    !Number.isFinite(input.receivedAt.getTime())
  )
    fail("evidence invalid");
  const db = await getDb();
  if (!db) fail("database unavailable");
  return db!.transaction(async tx => {
    const [campaign] = await tx
      .select()
      .from(chamberOutreachCampaigns)
      .where(
        and(
          eq(chamberOutreachCampaigns.id, input.campaignId),
          eq(chamberOutreachCampaigns.slug, "united-chamber-2027-brand-refresh")
        )
      )
      .limit(1);
    const [prospect] = await tx
      .select()
      .from(chamberOutreachProspects)
      .where(
        and(
          eq(chamberOutreachProspects.id, input.prospectId),
          eq(chamberOutreachProspects.campaignId, input.campaignId)
        )
      )
      .limit(1)
      .for("update");
    if (
      !campaign ||
      !prospect ||
      prospect.email.trim().toLowerCase() !== input.email
    )
      fail("ownership changed");
    const messages = await tx
      .select()
      .from(chamberOutreachMessages)
      .where(
        and(
          eq(chamberOutreachMessages.campaignId, input.campaignId),
          eq(chamberOutreachMessages.prospectId, input.prospectId)
        )
      )
      .for("update");
    const events = await tx
      .select()
      .from(chamberOutreachEvents)
      .where(
        and(
          eq(chamberOutreachEvents.campaignId, input.campaignId),
          eq(chamberOutreachEvents.prospectId, input.prospectId)
        )
      );
    const [suppression] = await tx
      .select()
      .from(chamberOutreachSuppressions)
      .where(eq(chamberOutreachSuppressions.email, input.email))
      .limit(1);
    const anchor = messages.find(m => m.id === input.messageId);
    if (
      !anchor ||
      anchor.status !== "sent" ||
      anchor.sentAt?.getTime() !== input.expectedSentAt.getTime() ||
      anchor.providerMessageId !== input.expectedProviderMessageId ||
      anchor.sentAt! > input.receivedAt
    )
      fail("sent anchor changed");
    check();
    if (prospect.status !== "in_sequence") {
      if (!chamberReviewAlreadySafe(prospect, messages, Boolean(suppression)))
        fail("existing disposition not safely held");
      return { changed: false, held: true };
    }
    const pending = messages.filter(m =>
      ["draft", "approved", "scheduled"].includes(m.status)
    );
    if (
      pending.some(
        m =>
          m.sentAt ||
          m.providerMessageId ||
          m.error ||
          (m.scheduledAt && m.scheduledAt.getTime() <= Date.now()) ||
          events.some(e => e.messageId === m.id)
      )
    )
      fail("pending message may have attempt history");
    const detail = JSON.stringify({
      safetyVersion: input.safetyVersion,
      evidenceKey: input.evidenceKey,
      kind: "ambiguous",
      resolution: "manual_review_held",
      messageId: input.messageId,
      note: "Exact known-thread delivery notice lacks conclusive failed/5.x.x evidence. Current sequence held for manual review. Transport outcome unresolved; no delivery, bounce, acceptance or retry asserted. Sent history preserved.",
    });
    const notes = [prospect.manualNotes, detail].filter(Boolean).join("\n\n");
    if (Buffer.byteLength(notes) > 65535) fail("notes overflow");
    check();
    const [changed] = await tx
      .update(chamberOutreachProspects)
      .set({ status: "review", nextFollowupAt: null, manualNotes: notes })
      .where(
        and(
          eq(chamberOutreachProspects.id, input.prospectId),
          eq(chamberOutreachProspects.campaignId, input.campaignId),
          eq(chamberOutreachProspects.status, "in_sequence")
        )
      );
    if (Number(changed.affectedRows ?? 0) !== 1)
      fail("prospect update unconfirmed");
    for (const m of pending) {
      check();
      const [r] = await tx
        .update(chamberOutreachMessages)
        .set({ status: "skipped", error: detail })
        .where(
          and(
            eq(chamberOutreachMessages.id, m.id),
            eq(chamberOutreachMessages.campaignId, input.campaignId),
            eq(chamberOutreachMessages.prospectId, input.prospectId),
            eq(chamberOutreachMessages.status, m.status)
          )
        );
      if (Number(r.affectedRows ?? 0) !== 1) fail("queue update unconfirmed");
    }
    check();
    if (!suppression)
      await tx
        .insert(chamberOutreachSuppressions)
        .values({
          email: input.email,
          reason: "manual",
          source: "chamber_ambiguous_delivery_review",
          notes: detail,
        });
    await tx
      .insert(chamberOutreachEvents)
      .values({
        campaignId: input.campaignId,
        prospectId: input.prospectId,
        messageId: input.messageId,
        eventType: "delivery_review_held",
        detail,
        occurredAt: input.receivedAt,
      });
    check();
    return { changed: true, held: true };
  });
}
