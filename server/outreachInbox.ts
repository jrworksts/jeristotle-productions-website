import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { ImapFlow, type SearchObject } from "imapflow";
import { simpleParser } from "mailparser";
import { ownOutreachImap, outreachDeadlineCheck } from "./outreachDeadline";
import { JERISTOTLE_EMAIL } from "../shared/const";
import { holdChamberAmbiguousNotice } from "./outreachInboxDisposition";
import {
  getChamberInboxSnapshot,
  recordChamberInboxCheck,
  stopChamberInboxProspect,
} from "./outreachDb";

export const CHAMBER_INBOX_SAFETY_VERSION =
  "chamber-inbox-safety-2026-11-05-v2";
const MAX_SOURCE = 262144;
const MAX_TARGETS = 200;
const MAX_MESSAGES = 600;
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;
const TIME_TOLERANCE = 2 * 60 * 1000;
const MAX_SEARCH_TERMS = 100;
const MAX_SEARCH_QUERY_BYTES = 16 * 1024;
const parserOptions = {
  keepDeliveryStatus: true,
  ignoreEmbedded: true,
  skipHtmlToText: false,
  skipImageLinks: true,
  keepCidLinks: true,
  maxHeadSize: 32768,
  maxChildNodes: 100,
};

export type ChamberInboxSentAnchor = {
  id: number;
  sequenceStep: number;
  sentAt: Date;
  providerMessageId: string | null;
};
export type ChamberInboxTarget = {
  id: number;
  email: string;
  firstSentAt: Date;
  sent: ChamberInboxSentAnchor[];
};
export type ChamberInboxDetection = {
  prospectId: number;
  email: string;
  messageId: number;
  receivedAt: Date;
  kind: "replied" | "ooo" | "optout" | "permanent" | "temporary" | "ambiguous";
  binding: "message_id" | "recipient_time";
  action?: string;
  status?: string;
  suppressionReason?: "replied" | "unsubscribed" | "bounced" | "manual";
};

const exactIds = (value: string): string[] =>
  value.match(/<[^<>\s]+@[^<>\s]+>/g) || [];
const validDate = (value: Date) => Number.isFinite(value.getTime());
function blocked(reason: string): never {
  throw new Error(`Chamber inbox ${reason}; sending blocked.`);
}

export function buildChamberInboxTargets(
  campaignId: number,
  prospects: Array<{
    id: number;
    campaignId: number;
    email: string;
    status: string;
    firstSentAt: Date | null;
  }>,
  messages: Array<{
    id: number;
    campaignId: number;
    prospectId: number;
    sequenceStep: number;
    status: string;
    sentAt: Date | null;
    providerMessageId: string | null;
  }>
): ChamberInboxTarget[] {
  const targets = prospects
    .filter(p => p.campaignId === campaignId && p.status === "in_sequence")
    .map(p => {
      const sent = messages
        .filter(
          m =>
            m.campaignId === campaignId &&
            m.prospectId === p.id &&
            m.status === "sent" &&
            m.sentAt
        )
        .map(m => ({
          id: m.id,
          sequenceStep: m.sequenceStep,
          sentAt: m.sentAt!,
          providerMessageId: m.providerMessageId,
        }));
      if (
        !sent.length ||
        sent.some(m => !validDate(m.sentAt)) ||
        !p.email.trim()
      )
        blocked("sent anchor missing or invalid");
      return {
        id: p.id,
        email: p.email.trim().toLowerCase(),
        firstSentAt: new Date(Math.min(...sent.map(m => m.sentAt.getTime()))),
        sent,
      };
    });
  if (
    targets.length > MAX_TARGETS ||
    targets.flatMap(t => t.sent).length > MAX_MESSAGES
  )
    blocked("target/thread bound exceeded");
  const known = targets.flatMap(t =>
    t.sent.flatMap(m => (m.providerMessageId ? [m.providerMessageId] : []))
  );
  if (
    known.some(id => exactIds(id).length !== 1 || exactIds(id)[0] !== id) ||
    new Set(known).size !== known.length
  )
    blocked("non-exact or duplicate sent Message-ID");
  if (new Set(targets.map(t => t.email)).size !== targets.length)
    blocked("duplicate recipient ownership");
  return targets;
}

function originalChamberInboxQueries(
  targets: ChamberInboxTarget[],
  since: Date
): SearchObject[] {
  const queries: SearchObject[] = [];
  for (let i = 0; i < targets.length; i += 20) {
    const group = targets.slice(i, i + 20);
    queries.push({ or: group.map(t => ({ since, from: t.email })) });
    queries.push({ or: group.map(t => ({ since, body: t.email })) });
  }
  const known = targets.flatMap(t =>
    t.sent.flatMap(m => (m.providerMessageId ? [m.providerMessageId] : []))
  );
  if (known.length > MAX_MESSAGES) blocked("thread bound exceeded");
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
  queries.push({
    or: [
      { since, from: "mailer-daemon" },
      { since, from: "postmaster" },
    ],
  });
  return queries;
}

/** OR whole original queries: identical union, retaining their 200-UID overflow fence. */
export function chamberInboxQueries(
  targets: ChamberInboxTarget[],
  since: Date
): SearchObject[] {
  const batches: SearchObject[] = [];
  let group: SearchObject[] = [];
  let terms = 0;
  const termCount = (query: SearchObject): number =>
    query.or ? query.or.reduce((n, child) => n + termCount(child), 0) : 1;
  // JSON plus per-leaf OR/group overhead conservatively bounds this query shape's wire size.
  const queryBytes = (queries: SearchObject[], count: number) =>
    Buffer.byteLength(JSON.stringify({ or: queries })) + count * 8 + 128;
  for (const query of originalChamberInboxQueries(targets, since)) {
    const count = termCount(query);
    if (
      count > MAX_SEARCH_TERMS ||
      queryBytes([query], count) > MAX_SEARCH_QUERY_BYTES
    )
      blocked("search query bound exceeded");
    if (
      group.length &&
      (terms + count > MAX_SEARCH_TERMS ||
        queryBytes([...group, query], terms + count) > MAX_SEARCH_QUERY_BYTES)
    ) {
      batches.push({ or: group });
      group = [];
      terms = 0;
    }
    group.push(query);
    terms += count;
  }
  if (group.length) batches.push({ or: group });
  return batches;
}

// Unfold header fields only: never match arbitrary quoted body IDs as original evidence.
function fields(text: string): Map<string, string[]> {
  if (Buffer.byteLength(text) > MAX_SOURCE)
    blocked("decoded part exceeds bound");
  const result = new Map<string, string[]>();
  for (const line of text
    .replace(/\r\n/g, "\n")
    .replace(/\n[\t ]+/g, " ")
    .split("\n")) {
    const match = /^([A-Za-z][A-Za-z0-9-]*):[\t ]*(.*)$/.exec(line);
    if (match)
      result.set(match[1].toLowerCase(), [
        ...(result.get(match[1].toLowerCase()) || []),
        match[2].trim(),
      ]);
  }
  return result;
}
const one = (f: Map<string, string[]>, key: string) =>
  f.get(key)?.length === 1 ? f.get(key)![0] : "";
function recipient(value: string): string {
  const email = value
    .replace(/^(?:rfc822|utf-8)\s*;\s*/i, "")
    .trim()
    .replace(/^<([^<>]+)>$/, "$1");
  return /^[^\s<>;,]+@[^\s<>;,]+$/.test(email) ? email.toLowerCase() : "";
}
function latestBefore(target: ChamberInboxTarget, date: Date) {
  return target.sent
    .filter(m => m.sentAt <= date)
    .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())[0];
}

export function classifyChamberInboxMessage(
  input: {
    from: string;
    date: Date;
    subject: string;
    text: string;
    references: string;
    deliveryStatus?: string;
    isDeliveryNotice?: boolean;
    originalHeaders?: string[];
    autoSubmitted?: string;
    deliveryNoticeAuthenticated?: boolean;
    failedRecipients?: string[];
  },
  targets: ChamberInboxTarget[]
): ChamberInboxDetection[] {
  if (!validDate(input.date)) blocked("matching date missing or invalid");
  const from = input.from.trim().toLowerCase();
  if (from === JERISTOTLE_EMAIL.toLowerCase()) return [];
  const notice =
    input.isDeliveryNotice ||
    Boolean(input.deliveryStatus) ||
    /^(mailer-daemon|postmaster)@/i.test(from);
  if (notice) {
    // Runtime parser supplies receiver authentication; spoofed reports never become replies.
    if (input.deliveryNoticeAuthenticated === false) return [];
    const statusText = input.deliveryStatus || input.text;
    const blocks = statusText
      .replace(/\r\n/g, "\n")
      .split(/\n\s*\n/)
      .filter(Boolean)
      .map(fields);
    const originals = (input.originalHeaders || []).map(h =>
      fields(h.split(/\r?\n\r?\n/)[0])
    );
    const originalIdFields = [...blocks, ...originals].flatMap(f => [
      ...(f.get("original-message-id") || []),
      ...(f.get("x-original-message-id") || []),
      ...(originals.includes(f) ? f.get("message-id") || [] : []),
    ]);
    const invalidOriginalId = originalIdFields.some(
      value => exactIds(value).length !== 1 || exactIds(value)[0] !== value
    );
    const originalIds = originalIdFields.flatMap(exactIds);
    const uniqueIds = Array.from(new Set(originalIds));
    // Explicit original IDs belonging elsewhere veto recipient-only fallback.
    const originalOwners = targets.flatMap(t =>
      t.sent.flatMap(m =>
        m.providerMessageId && uniqueIds.includes(m.providerMessageId)
          ? [{ target: t, anchor: m }]
          : []
      )
    );
    if (
      uniqueIds.length &&
      (!originalOwners.length ||
        uniqueIds.some(
          id => !originalOwners.some(o => o.anchor.providerMessageId === id)
        ))
    )
      return [];
    const result: ChamberInboxDetection[] = [];
    for (const block of blocks.filter(
      f =>
        f.has("final-recipient") ||
        f.has("original-recipient") ||
        f.has("action") ||
        f.has("status")
    )) {
      const recipients = [
        one(block, "final-recipient"),
        one(block, "original-recipient"),
      ]
        .map(recipient)
        .filter(Boolean);
      if (
        new Set(recipients).size > 1 &&
        recipients.some(email => targets.some(t => t.email === email))
      )
        blocked("conflicting DSN recipient fields");
      const invalidRecipient = ["final-recipient", "original-recipient"].some(
        key =>
          block.has(key) &&
          (block.get(key)!.length !== 1 || !recipient(one(block, key)))
      );
      let owners = originalOwners.filter(
        o =>
          (!recipients.length || recipients.includes(o.target.email)) &&
          o.anchor.sentAt <= input.date
      );
      if (!uniqueIds.length && recipients.length) {
        owners = targets
          .filter(t => recipients.includes(t.email))
          .flatMap(target => {
            const originalDates = [
              ...originals
                .filter(f => {
                  const to =
                    one(f, "to")
                      .toLowerCase()
                      .match(/[^\s<>;,]+@[^\s<>;,]+/g) || [];
                  return to.length === 1 && to[0] === target.email;
                })
                .map(f => one(f, "date")),
              ...blocks.map(f => one(f, "arrival-date")),
            ]
              .filter(Boolean)
              .map(s => new Date(s))
              .filter(validDate);
            const anchored = target.sent.filter(
              m =>
                m.sentAt <= input.date &&
                originalDates.some(
                  d =>
                    Math.abs(d.getTime() - m.sentAt.getTime()) <= TIME_TOLERANCE
                )
            );
            const anchor =
              anchored.length === 1
                ? anchored[0]
                : latestBefore(target, input.date);
            return anchor
              ? [{ target, anchor, uncertain: anchored.length !== 1 }]
              : [];
          });
      }
      if (owners.length > 1) blocked("ambiguous DSN sent-message ownership");
      const owner = owners[0];
      if (!owner) continue;
      const action = one(block, "action").toLowerCase();
      const status = one(block, "status");
      let kind: ChamberInboxDetection["kind"] = "ambiguous";
      if (
        !invalidOriginalId &&
        !invalidRecipient &&
        !("uncertain" in owner && owner.uncertain)
      ) {
        if (action === "failed" && /^5\.\d{1,3}\.\d{1,3}$/.test(status))
          kind = "permanent";
        else if (action === "delayed" && /^4\.\d{1,3}\.\d{1,3}$/.test(status))
          kind = "temporary";
        else if (
          ["delivered", "relayed", "expanded"].includes(action) &&
          /^2\.\d{1,3}\.\d{1,3}$/.test(status)
        )
          continue;
      }
      result.push({
        prospectId: owner.target.id,
        email: owner.target.email,
        messageId: owner.anchor.id,
        receivedAt: input.date,
        kind,
        binding: uniqueIds.length ? "message_id" : "recipient_time",
        action,
        status,
        ...(kind === "permanent"
          ? {
              suppressionReason: /^5\.7\./.test(status)
                ? ("manual" as const)
                : ("bounced" as const),
            }
          : {}),
      });
    }
    // A malformed daemon/report is never allowed to become a human reply.
    if (
      !result.length &&
      originalOwners.length &&
      !blocks.some(f => f.has("action") || f.has("status"))
    ) {
      const owner = originalOwners[0];
      if (owner.anchor.sentAt <= input.date)
        result.push({
          prospectId: owner.target.id,
          email: owner.target.email,
          messageId: owner.anchor.id,
          receivedAt: input.date,
          kind: "ambiguous",
          binding: "message_id",
        });
    }
    if (!result.length && !originalOwners.length && !uniqueIds.length) {
      const refs = exactIds(input.references);
      const related = targets.flatMap(target =>
        target.sent.flatMap(anchor =>
          anchor.providerMessageId &&
          refs.includes(anchor.providerMessageId) &&
          anchor.sentAt <= input.date &&
          (!input.failedRecipients?.length ||
            input.failedRecipients.includes(target.email))
            ? [{ target, anchor }]
            : []
        )
      );
      if (new Set(related.map(o => o.target.id)).size > 1)
        blocked("conflicting delivery-notice thread ownership");
      const owner = related.sort(
        (a, b) => b.anchor.sentAt.getTime() - a.anchor.sentAt.getTime()
      )[0];
      if (owner)
        result.push({
          prospectId: owner.target.id,
          email: owner.target.email,
          messageId: owner.anchor.id,
          receivedAt: input.date,
          kind: "ambiguous",
          binding: "message_id",
        });
    }
    return result;
  }
  const refs = exactIds(input.references);
  const threadOwners = targets.flatMap(t =>
    t.sent.flatMap(m =>
      m.providerMessageId &&
      refs.includes(m.providerMessageId) &&
      m.sentAt <= input.date
        ? [{ target: t, anchor: m }]
        : []
    )
  );
  if (new Set(threadOwners.map(o => o.target.id)).size > 1)
    blocked("conflicting human thread ownership");
  const threadOwner = threadOwners.sort(
    (a, b) => b.anchor.sentAt.getTime() - a.anchor.sentAt.getTime()
  )[0];
  const target = threadOwner?.target || targets.find(t => t.email === from);
  if (!target) return [];
  const anchor = threadOwner?.anchor || latestBefore(target, input.date);
  if (!anchor) return [];
  const optout =
    /\b(?:unsubscribe|remove me|stop emailing|stop sending|do not (?:email|contact)|don'?t (?:email|contact))\b/i.test(
      input.subject + "\n" + input.text.split(/\n(?:On .+wrote:|>)/)[0]
    );
  const automatic =
    /out[ -]of[ -]office|automatic reply|auto[ -]?reply/i.test(input.subject) ||
    Boolean(input.autoSubmitted && input.autoSubmitted.toLowerCase() !== "no");
  return [
    {
      prospectId: target.id,
      email: target.email,
      messageId: anchor.id,
      receivedAt: input.date,
      kind: optout ? "optout" : automatic ? "ooo" : "replied",
      binding: threadOwner ? "message_id" : "recipient_time",
      suppressionReason: optout ? "unsubscribed" : "replied",
    },
  ];
}

export async function parseChamberInboxSource(
  source: Buffer,
  targets: ChamberInboxTarget[],
  fallback?: { date?: Date; from?: string; subject?: string }
): Promise<ChamberInboxDetection[]> {
  if (!source.length || source.length >= MAX_SOURCE)
    blocked("source empty, oversized or truncated");
  const mail = await simpleParser(source, parserOptions);
  const decodedBytes = mail.attachments.reduce(
    (n, a) => n + a.content.length,
    Buffer.byteLength(mail.text || "") + Buffer.byteLength(mail.html || "")
  );
  if (decodedBytes > MAX_SOURCE) blocked("decoded MIME exceeds bound");
  const deliveryStatus = mail.attachments
    .filter(a =>
      ["message/delivery-status", "message/global-delivery-status"].includes(
        a.contentType.toLowerCase()
      )
    )
    .map(a => a.content.toString("utf8"))
    .join("\n\n");
  const originalHeaders = mail.attachments
    .filter(a =>
      [
        "message/rfc822",
        "text/rfc822-headers",
        "message/global",
        "message/global-headers",
      ].includes(a.contentType.toLowerCase())
    )
    .map(a => a.content.toString("utf8"));
  const refs = Array.isArray(mail.references)
    ? mail.references.join(" ")
    : mail.references || "";
  const date = mail.date || fallback?.date;
  if (!date || !validDate(date)) blocked("matching date missing or invalid");
  // INTERNALDATE is also required to be after the bound send if available; moving old mail is not a new reply.
  const from = mail.from?.value[0]?.address || fallback?.from || "";
  const fromDomain = from.toLowerCase().split("@")[1] || "";
  // Use the receiver's first Authentication-Results, not attached/quoted headers or arbitrary body IDs.
  const auth =
    mail.headerLines
      .find(h => h.key === "authentication-results")
      ?.line.replace(/\r?\n[\t ]+/g, " ") || "";
  const dkimDomains = Array.from(
    auth.matchAll(/(?:^|;)\s*dkim=pass\b[^;]*\bheader\.i=@([^\s;]+)/gi)
  ).map(m => m[1].toLowerCase());
  const deliveryNoticeAuthenticated =
    /^Authentication-Results:\s*mx\.google\.com\s*;/i.test(auth) &&
    dkimDomains.includes(fromDomain);
  const failedRecipients = mail.headerLines
    .filter(h => h.key === "x-failed-recipients")
    .flatMap(h =>
      h.line
        .replace(/^X-Failed-Recipients:\s*/i, "")
        .split(",")
        .map(recipient)
    )
    .filter(Boolean);
  const found = classifyChamberInboxMessage(
    {
      from,
      date,
      subject: mail.subject || fallback?.subject || "",
      text: mail.text || "",
      references: [mail.inReplyTo, refs].filter(Boolean).join(" "),
      deliveryStatus,
      originalHeaders,
      isDeliveryNotice:
        /(?:multipart\/report|message\/(?:global-)?delivery-status)/i.test(
          mail.headerLines
            .filter(h => h.key === "content-type")
            .map(h => h.line)
            .join(" ")
        ),
      autoSubmitted: String(mail.headers.get("auto-submitted") || ""),
      deliveryNoticeAuthenticated,
      failedRecipients,
    },
    targets
  );
  if (
    fallback?.date &&
    (!validDate(fallback.date) ||
      found.some(
        d =>
          targets
            .find(t => t.id === d.prospectId)!
            .sent.find(m => m.id === d.messageId)!.sentAt > fallback.date!
      ))
  )
    blocked("receipt date conflicts with sent anchor");
  return found;
}

function getGmailPassword() {
  return process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS || "";
}

export async function verifyOutreachInboxTransport() {
  const password = getGmailPassword();
  if (!password) return { configured: false, verified: false };
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    logger: false,
    auth: { user: JERISTOTLE_EMAIL, pass: password },
  });
  await client.connect();
  await client.logout();
  return { configured: true, verified: true };
}

export async function checkOutreachReplies(
  now = new Date(),
  deadline = Date.now() + 60000
) {
  const startedAt = performance.now();
  let searchCount = 0;
  const password = getGmailPassword();
  if (!password)
    blocked("Gmail app password is not configured for reply monitoring");
  if (!validDate(now) || !Number.isFinite(deadline) || deadline <= Date.now())
    blocked("deadline/date invalid or exceeded");
  let client: ImapFlow | undefined;
  let releaseSocket: (() => void) | undefined;
  let rejectDeadline: (error: Error) => void = () => {};
  const expired = new Promise<never>((_, reject) => {
    rejectDeadline = reject;
  });
  const bounded = <T>(operation: Promise<T>) =>
    Promise.race([operation, expired]);
  const checkTime = () => {
    outreachDeadlineCheck();
    if (Date.now() >= deadline) blocked("absolute deadline exceeded");
  };
  const timer = setTimeout(
    () => {
      rejectDeadline(
        new Error("Chamber inbox absolute deadline exceeded; sending blocked.")
      );
      client?.close();
    },
    Math.max(1, deadline - Date.now())
  );
  try {
    checkTime();
    const snapshot = await bounded(getChamberInboxSnapshot());
    checkTime();
    const targets = buildChamberInboxTargets(
      snapshot.campaign.id,
      snapshot.prospects,
      snapshot.messages
    );
    // Revisit all active sent anchors, not lastReplyCheckAt: old DSNs can be moved to Trash later.
    const since = new Date(
      targets.length
        ? Math.min(...targets.map(t => t.firstSentAt.getTime()))
        : now.getTime()
    );
    since.setUTCDate(since.getUTCDate() - 1);
    const queries = chamberInboxQueries(targets, since);
    client = new ImapFlow({
      host: "imap.gmail.com",
      port: 993,
      secure: true,
      logger: false,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
      auth: { user: JERISTOTLE_EMAIL, pass: password },
    });
    releaseSocket = ownOutreachImap(client);
    await bounded(client.connect());
    checkTime();
    const folders = await bounded(client.list());
    const selected = ["\\All", "\\Junk", "\\Trash"].map(use =>
      folders.filter(f => f.specialUse === use && !f.flags?.has("\\Noselect"))
    );
    if (selected.some(group => group.length !== 1))
      blocked("All/Junk/Trash incomplete or ambiguous");
    const paths = selected.map(group => group[0].path);
    if (new Set(paths).size !== 3) blocked("mailbox ownership incomplete");
    let scanned = 0,
      totalBytes = 0;
    const pending = new Map<
      number,
      { detection: ChamberInboxDetection; evidenceKey: string }
    >();
    const seenSources = new Set<string>();
    const priority = {
      temporary: 0,
      replied: 1,
      ooo: 1,
      permanent: 2,
      optout: 5,
      ambiguous: 4,
    };
    for (const path of paths) {
      checkTime();
      await bounded(client.mailboxOpen(path, { readOnly: true }));
      const uids = new Set<number>();
      const search = async (query: SearchObject) => {
        checkTime();
        searchCount++;
        const found = await bounded(client!.search(query, { uid: true }));
        checkTime();
        if (
          !Array.isArray(found) ||
          found.some(uid => !Number.isSafeInteger(uid) || uid <= 0) ||
          new Set(found).size !== found.length
        )
          blocked("search incomplete or invalid UIDs");
        return found;
      };
      const capture = (found: number[]) => {
        if (found.length > 200) blocked("query overflow");
        found.forEach(uid => uids.add(uid));
        if (uids.size + scanned > MAX_MESSAGES) blocked("scan overflow");
      };
      for (const query of queries) {
        const found = await search(query);
        if (found.length <= 200) capture(found);
        else {
          // A batched union can exceed 200 even when every original query is safe.
          // Retry only those bounded original predicates, never a scan or truncated subset.
          found.forEach(uid => uids.add(uid));
          if (uids.size + scanned > MAX_MESSAGES) blocked("scan overflow");
          for (const original of query.or!) capture(await search(original));
        }
      }
      const requested = Array.from(uids);
      for (let i = 0; i < requested.length; i += 25) {
        checkTime();
        const batch = requested.slice(i, i + 25);
        // ImapFlow source fetching is BODY.PEEK[]<0.MAX_SOURCE>; never sets \\Seen.
        const messages = await bounded(
          client.fetchAll(
            batch,
            {
              envelope: true,
              internalDate: true,
              source: { maxLength: MAX_SOURCE },
              size: true,
            },
            { uid: true }
          )
        );
        if (
          messages.length !== batch.length ||
          new Set(messages.map(m => m.uid)).size !== batch.length ||
          messages.some(m => !batch.includes(m.uid))
        )
          blocked("incomplete or duplicate UID fetch");
        for (const message of messages) {
          checkTime();
          if (
            !Buffer.isBuffer(message.source) ||
            !Number.isSafeInteger(message.size) ||
            message.size! <= 0 ||
            message.size! >= MAX_SOURCE ||
            message.source.length !== message.size
          )
            blocked("source missing, oversized or truncated");
          totalBytes += message.source.length;
          if (totalBytes > MAX_TOTAL_BYTES)
            blocked("total source byte bound exceeded");
          scanned++;
          const evidenceKey = createHash("sha256")
            .update(message.source)
            .digest("hex");
          if (seenSources.has(evidenceKey)) continue;
          seenSources.add(evidenceKey);
          const receiptDate = message.internalDate || message.envelope?.date;
          const detections = await bounded(
            parseChamberInboxSource(message.source, targets, {
              date: receiptDate ? new Date(receiptDate) : undefined,
              from: message.envelope?.from?.[0]?.address,
              subject: message.envelope?.subject,
            })
          );
          checkTime();
          for (const detection of detections) {
            if (detection.receivedAt.getTime() > now.getTime() + TIME_TOLERANCE)
              blocked("future-dated bound response");
            const prior = pending.get(detection.prospectId);
            if (
              !prior ||
              priority[detection.kind] > priority[prior.detection.kind]
            )
              pending.set(detection.prospectId, { detection, evidenceKey });
          }
        }
      }
    }
    checkTime();
    // Stage all classifications before any stop: partial/failed mailbox parsing never stamps success.
    let repliesDetected = 0,
      permanentFailuresDetected = 0,
      temporaryNotices = 0,
      manualReviewHolds = 0;
    for (const { detection, evidenceKey } of Array.from(pending.values())) {
      checkTime();
      if (detection.kind === "temporary") {
        temporaryNotices++;
        continue;
      }
      const sentAnchor = targets
        .find(t => t.id === detection.prospectId)!
        .sent.find(m => m.id === detection.messageId)!;
      if (detection.kind === "ambiguous") {
        if (detection.binding !== "message_id" || !sentAnchor.providerMessageId)
          blocked(
            "matched ambiguous delivery notice lacks exact thread; requires review"
          );
        const held = await bounded(
          holdChamberAmbiguousNotice({
            campaignId: snapshot.campaign.id,
            prospectId: detection.prospectId,
            email: detection.email,
            messageId: detection.messageId,
            expectedSentAt: sentAnchor.sentAt,
            expectedProviderMessageId: sentAnchor.providerMessageId,
            receivedAt: detection.receivedAt,
            evidenceKey,
            safetyVersion: CHAMBER_INBOX_SAFETY_VERSION,
            deadline,
          })
        );
        checkTime();
        if (!held.held)
          blocked("ambiguous notice hold unconfirmed; requires review");
        if (held.changed) manualReviewHolds++;
        continue;
      }
      const stopped = await bounded(
        stopChamberInboxProspect({
          campaignId: snapshot.campaign.id,
          prospectId: detection.prospectId,
          email: detection.email,
          messageId: detection.messageId,
          expectedSentAt: sentAnchor.sentAt,
          expectedProviderMessageId: sentAnchor.providerMessageId,
          kind: detection.kind as "replied" | "ooo" | "optout" | "permanent",
          binding: detection.binding,
          receivedAt: detection.receivedAt,
          suppressionReason: detection.suppressionReason!,
          action: detection.action,
          status: detection.status,
          evidenceKey,
          safetyVersion: CHAMBER_INBOX_SAFETY_VERSION,
          deadline,
        })
      );
      checkTime();
      if (stopped) {
        if (detection.kind === "permanent") permanentFailuresDetected++;
        else repliesDetected++;
      }
    }
    checkTime();
    await bounded(recordChamberInboxCheck(snapshot.campaign.id, now, deadline));
    checkTime();
    return {
      completeAll: true as const,
      repliesDetected,
      permanentFailuresDetected,
      temporaryNotices,
      manualReviewHolds,
      scanned,
      searchCount,
      inboxElapsedMs: Math.ceil(performance.now() - startedAt),
      safetyVersion: CHAMBER_INBOX_SAFETY_VERSION,
    };
  } finally {
    clearTimeout(timer);
    releaseSocket?.();
    client?.close();
  }
}
