import { ownOutreachImap, withOutreachStage, OUTREACH_INBOX_BUDGET_MS } from "./outreachDeadline";
import { ImapFlow, type SearchObject } from "imapflow";
import { simpleParser } from "mailparser";
import { eq } from "drizzle-orm";
import { sectorOutreachCampaigns as sectorCampaigns } from "../drizzle/schema";
import { JERISTOTLE_EMAIL } from "../shared/const";
import {
  getSectorRuntimeWorkspace,
  sectorDatabase,
  stopSectorProspect,
} from "./sectorRuntimeDb";
import type { SectorStopDisposition } from "./sectorRuntimeDb";

export type SectorInboxTarget = {
  id: number;
  email: string;
  firstSentAt: Date;
  messageIds: string[];
};
const ids = (text: string): string[] =>
  text.toLowerCase().match(/<[^<>\s]+>/g) || [];
export function buildSectorInboxTargets(
  prospects: Array<{
    id: number;
    email: string | null;
    firstSentAt: Date | null;
    stoppedAt: Date | null;
  }>,
  messages: Array<{
    prospectId: number;
    attemptedAt: Date | null;
    providerMessageId: string | null;
  }>
): SectorInboxTarget[] {
  return prospects
    .filter(p => p.email && !p.stoppedAt)
    .flatMap(p => {
      const attempted = messages.filter(
        m => m.prospectId === p.id && m.attemptedAt
      );
      const anchors = [
        ...(p.firstSentAt ? [p.firstSentAt] : []),
        ...attempted.map(m => m.attemptedAt!),
      ];
      return anchors.length
        ? [
            {
              id: p.id,
              email: p.email!,
              firstSentAt: new Date(Math.min(...anchors.map(d => d.getTime()))),
              messageIds: attempted.flatMap(m =>
                m.providerMessageId ? [m.providerMessageId] : []
              ),
            },
          ]
        : [];
    });
}
export function sectorInboxQueries(
  targets: SectorInboxTarget[],
  since: Date
): SearchObject[] {
  const queries: SearchObject[] = [];
  for (let i = 0; i < targets.length; i += 20)
    queries.push({
      or: targets.slice(i, i + 20).map(t => ({ from: t.email, since })),
    });
  // Thread searches deliberately do not constrain the sender: colleagues and alternate OOO addresses count.
  const known = Array.from(new Set(targets.flatMap(t => t.messageIds)));
  if (known.length > 600)
    throw new Error("Sector inbox thread bound exceeded; sending blocked.");
  for (let i = 0; i < known.length; i += 10)
    queries.push({
      or: known.slice(i, i + 10).flatMap((id): SearchObject[] => [
        { since, header: { "In-Reply-To": id } },
        { since, header: { References: id } },
        { since, body: id },
      ]),
    });
  queries.push({ since, header: { "Content-Type": "multipart/report" } });
  queries.push({
    since,
    header: { "Content-Type": "message/delivery-status" },
  });
  if (targets.length)
    queries.push({
      or: targets.map(t => ({ since, body: "rfc822; " + t.email })),
    });
  return queries;
}
export function classifySectorReply(
  input: {
    from: string;
    date: Date;
    subject: string;
    text: string;
    references: string;
    deliveryStatus?: string;
  },
  targets: SectorInboxTarget[]
) {
  const from = input.from.toLowerCase(),
    body = input.text.slice(0, 262144),
    references = ids(input.references);
  if (
    !Number.isFinite(input.date.getTime()) ||
    from === JERISTOTLE_EMAIL.toLowerCase()
  )
    return null;
  const owner = targets.find(t =>
    t.messageIds.some(id => references.includes(id.toLowerCase()))
  );
  const dsn =
    input.deliveryStatus ||
    (/^(mailer-daemon|postmaster)@/i.test(from) ? body : "");
  if (dsn) {
    const recipients = Array.from(
      dsn.matchAll(
        /(?:final-recipient|original-recipient)\s*:\s*(?:rfc822;)?\s*([^\s<>]+@[^\s<>]+)/gi
      ),
      m => m[1].toLowerCase()
    );
    const embedded = ids(dsn + "\n" + body);
    const target =
      owner ||
      targets.find(t => recipients.includes(t.email.toLowerCase())) ||
      targets.find(t =>
        t.messageIds.some(id => embedded.includes(id.toLowerCase()))
      );
    return target && input.date >= target.firstSentAt
      ? {
          id: target.id,
          stage: "bounced" as SectorStopDisposition,
          detail:
            "Delivery-status MIME matched exact recipient or outbound message ID; follow-ups stopped.",
        }
      : null;
  }
  const target = owner || targets.find(t => t.email.toLowerCase() === from);
  if (!target || input.date < target.firstSentAt) return null;
  return {
    id: target.id,
    stage: (/^\s*(unsubscribe|remove me|stop emailing|stop sending)\b/im.test(
      input.subject + "\n" + body
    )
      ? "opted_out"
      : "replied") as SectorStopDisposition,
    detail:
      "Recipient or known-thread response, including automatic/out-of-office response. Follow-ups stopped.",
  };
}
export async function parseSectorInboxSource(
  source: Buffer,
  targets: SectorInboxTarget[],
  fallback?: { date?: Date; from?: string; subject?: string }
) {
  if (source.length >= 262144)
    throw new Error(
      "Sector inbox message too large or truncated; sending blocked."
    );
  const mail = await simpleParser(source, {
    keepDeliveryStatus: true,
    skipHtmlToText: false,
    skipImageLinks: true,
  });
  const deliveryStatus = mail.attachments
    .filter(a => a.contentType.toLowerCase() === "message/delivery-status")
    .map(a => a.content.toString("utf8"))
    .join("\n");
  const refs = Array.isArray(mail.references)
    ? mail.references.join(" ")
    : mail.references || "";
  const date = mail.date || fallback?.date;
  if (!date)
    throw new Error("Sector inbox matching date missing; sending blocked.");
  return classifySectorReply(
    {
      from: mail.from?.value[0]?.address || fallback?.from || "",
      date,
      subject: mail.subject || fallback?.subject || "",
      text: mail.text || "",
      references: [mail.inReplyTo, refs].filter(Boolean).join(" "),
      deliveryStatus,
    },
    targets
  );
}
async function checkSectorInboxImpl(
  campaignId: number,
  now = new Date(),
  deadline = Date.now() + 25000
) {
  const w = await getSectorRuntimeWorkspace(),
    db = await sectorDatabase();
  const campaign = w.campaigns.find(c => c.id === campaignId);
  if (!campaign) throw new Error("Sector campaign missing");
  const targets = buildSectorInboxTargets(
    w.prospects.filter(p => p.campaignKey === campaign.campaignKey),
    w.messages.filter(m => m.campaignKey === campaign.campaignKey)
  );
  if (targets.length > 200)
    throw new Error(
      "Sector inbox scan target bound exceeded; sending blocked."
    );
  const password = process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS;
  if (!password)
    throw new Error(
      "Company Gmail reply monitoring is not configured; sending blocked."
    );
  const checkTime = () => {
    if (Date.now() >= deadline)
      throw new Error("Sector inbox deadline exceeded; sending blocked.");
  };
  checkTime();
  const since = new Date(
    targets.length
      ? Math.min(...targets.map(t => t.firstSentAt.getTime()))
      : now.getTime()
  );
  since.setUTCDate(since.getUTCDate() - 1);
  const queries = sectorInboxQueries(targets, since);
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    logger: false,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
    auth: { user: JERISTOTLE_EMAIL, pass: password },
  });
  const releaseSocket = ownOutreachImap(client);
  let scanned = 0,
    stopped = 0;
  let rejectDeadline: (error: Error) => void = () => {};
  const expired = new Promise<never>((_, reject) => {
    rejectDeadline = reject;
  });
  const bounded = <T>(operation: Promise<T>) =>
    Promise.race([operation, expired]);
  const timer = setTimeout(
    () => {
      client.close();
      rejectDeadline(
        new Error("Sector inbox absolute deadline exceeded; sending blocked")
      );
    },
    Math.max(1, deadline - Date.now())
  );
  try {
    await bounded(client.connect());
    checkTime();
    const folders = await bounded(client.list());
    checkTime();
    const required = ["\\All", "\\Junk", "\\Trash"];
    const selected = required.map(use =>
      folders.find(f => f.specialUse === use)
    );
    if (selected.some(f => !f))
      throw new Error(
        "Sector inbox All/Junk/Trash incomplete; sending blocked"
      );
    const paths = Array.from(new Set(selected.map(f => f!.path)));
    if (paths.length !== 3)
      throw new Error("Sector inbox mailbox bound exceeded; sending blocked.");
    for (const path of paths) {
      checkTime();
      await bounded(client.mailboxOpen(path, { readOnly: true }));
      const uids = new Set<number>();
      for (const query of queries) {
        checkTime();
        const found = await bounded(client.search(query, { uid: true }));
        if (!Array.isArray(found))
          throw new Error("Sector inbox search failed; sending blocked.");
        if (found.length > 200)
          throw new Error("Sector inbox query overflow; sending blocked.");
        found.forEach(n => uids.add(n));
        if (uids.size + scanned > 600)
          throw new Error("Sector inbox scan overflow; sending blocked.");
      }
      if (uids.size) {
        checkTime();
        const messages = await bounded(
          client.fetchAll(
            Array.from(uids),
            { envelope: true, source: { maxLength: 262144 }, size: true },
            { uid: true }
          )
        );
        if (
          messages.length !== uids.size ||
          new Set(messages.map(m => m.uid)).size !== uids.size ||
          messages.some(m => !uids.has(m.uid))
        )
          throw new Error(
            "Sector inbox incomplete or duplicate UID fetch; sending blocked."
          );
        for (const m of messages) {
          checkTime();
          if (
            !Buffer.isBuffer(m.source) ||
            !Number.isInteger(m.size) ||
            m.size! >= 262144 ||
            m.source.length !== m.size
          )
            throw new Error(
              "Sector inbox source missing or oversized; sending blocked."
            );
          scanned++;
          const found = await parseSectorInboxSource(m.source, targets, {
            date: m.envelope?.date ? new Date(m.envelope.date) : undefined,
            from: m.envelope?.from?.[0]?.address,
            subject: m.envelope?.subject,
          });
          checkTime();
          if (
            found &&
            (await stopSectorProspect(found.id, found.stage, found.detail))
          )
            stopped++;
        }
      }
    }
    checkTime();
    await db
      .update(sectorCampaigns)
      .set({ lastInboxScanAt: now })
      .where(eq(sectorCampaigns.id, campaignId));
    return { scanned, stopped };
  } finally {
    releaseSocket();
    clearTimeout(timer);
    client.close();
  }
}

export async function checkSectorInbox(...args: Parameters<typeof checkSectorInboxImpl>) {
  return withOutreachStage(OUTREACH_INBOX_BUDGET_MS, () => checkSectorInboxImpl(...args));
}
