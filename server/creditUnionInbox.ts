import { ownOutreachImap, withOutreachStage, OUTREACH_INBOX_BUDGET_MS } from "./outreachDeadline";
import { ImapFlow, type SearchObject } from "imapflow";
import { JERISTOTLE_EMAIL } from "../shared/const";
import {
  getCreditUnionInboxTargets,
  markCreditUnionProspectTerminal,
  recordCreditUnionReplyCheck,
} from "./creditUnionSendingDb";

const PER_QUERY_SCAN_LIMIT = 500;
const SEARCH_TERMS_PER_QUERY = 50;
const MAX_SCAN_MESSAGES = 2_000;
const MAX_TARGETED_QUERIES = 30;
const GMAIL_DSN_SENDERS = new Set([
  "mailer-daemon@googlemail.com",
  "mailer-daemon@gmail.com",
  "postmaster@google.com",
  "postmaster@gmail.com",
]);
const OPT_OUT_PATTERN =
  /\b(?:please\s+)?(?:unsubscribe|remove me|stop emailing|stop sending)\b/i;

type ParsedInboxMessage = {
  from: string | null;
  subject: string;
  date: Date;
  inReplyTo: string | null;
  references: string[];
  messageId: string | null;
  text: string;
};

function getGmailPassword() {
  return process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS || "";
}

function normalizeAddress(value: string | null | undefined) {
  return value?.trim().toLowerCase() || null;
}

function normalizeMessageId(value: string | null | undefined) {
  const raw = value?.trim();
  if (!raw) return null;
  const match = raw.match(/<[^>\s]+>/);
  return (match?.[0] || raw).toLowerCase();
}

function threadIds(raw: string | null | undefined) {
  if (!raw) return [];
  return (
    raw
      .match(/<[^>\s]+>/g)
      ?.map(value => value.toLowerCase())
      .filter(Boolean) || []
  );
}

function safeDate(value: unknown, fallback: Date) {
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function headerSearch(name: string, value: string): SearchObject {
  return { header: { [name]: value } };
}

/** ImapFlow returns the requested headers as a raw Buffer, not a Map. */
export function headerValue(headers: Buffer | null | undefined, name: string) {
  if (!headers) return null;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = headers
    .toString("utf8")
    .match(
      new RegExp(`^${escaped}:\\s*([^\\r\\n]*(?:\\r?\\n[\\t ].*)*)`, "im")
    );
  return match ? match[1].replace(/\r?\n[\t ]+/g, " ").trim() : null;
}

export async function verifyCreditUnionInboxTransport() {
  const password = getGmailPassword();
  if (!password) return { configured: false, verified: false };
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    logger: false,
    auth: { user: JERISTOTLE_EMAIL, pass: password },
  });
  const releaseSocket = ownOutreachImap(client);
  try {
  await client.connect();
  await client.logout();
  return { configured: true, verified: true };
  } finally { releaseSocket(); client.close(); }
}

/**
 * Any post-send message from the exact active recipient is a conservative stop
 * signal, even when their client loses thread headers. A known Gmail DSN still
 * requires a known recipient or outbound Message-ID; subject-only matching is
 * intentionally absent.
 */
export function classifyCreditUnionInboxMessage(
  input: ParsedInboxMessage,
  targets: Awaited<ReturnType<typeof getCreditUnionInboxTargets>>
):
  | { type: "reply" | "unsubscribe"; prospectId: number; detail: string }
  | { type: "bounce"; prospectId: number; detail: string }
  | null {
  const from = normalizeAddress(input.from);
  const knownMessageOwner = new Map<string, number>();
  const targetByEmail = new Map(
    targets.map(target => [
      target.prospect.normalizedEmail?.toLowerCase(),
      target,
    ])
  );
  const targetByProspectId = new Map(
    targets.map(target => [target.prospect.id, target])
  );
  for (const target of targets) {
    for (const sent of target.sentMessages) {
      const id = normalizeMessageId(sent.providerMessageId);
      if (id) knownMessageOwner.set(id, target.prospect.id);
    }
  }

  const body = input.text.slice(0, 20_000);
  const isKnownDsn = Boolean(from && GMAIL_DSN_SENDERS.has(from));
  if (isKnownDsn) {
    const recipientMatch = body.match(
      /(?:final-recipient|original-recipient|recipient)\s*:\s*(?:rfc822;)?\s*([^\s<>]+@[^\s<>]+)/i
    );
    const recipientTarget = recipientMatch
      ? targetByEmail.get(recipientMatch[1].toLowerCase())
      : undefined;
    const explicitMessageOwner = Array.from(body.matchAll(/<[^>\s]+@[^>\s]+>/g))
      .map(match => knownMessageOwner.get(match[0].toLowerCase()))
      .find((id): id is number => typeof id === "number");
    const target = explicitMessageOwner
      ? targetByProspectId.get(explicitMessageOwner)
      : recipientTarget;
    if (
      !target ||
      !target.prospect.firstSentAt ||
      input.date <= target.prospect.firstSentAt
    )
      return null;
    return {
      type: "bounce",
      prospectId: target.prospect.id,
      detail: `Known Gmail delivery-status notification: ${input.subject || "No subject"}`,
    };
  }

  const threadOwner = [input.inReplyTo, ...input.references]
    .flatMap(threadIds)
    .map(id => knownMessageOwner.get(id))
    .find((id): id is number => typeof id === "number");
  // A known outbound thread is a conservative stop signal even when a reply is
  // forwarded through an assistant, alias, or automatic responder.
  const target =
    (from ? targetByEmail.get(from) : undefined) ||
    (from && from !== JERISTOTLE_EMAIL.toLowerCase() && threadOwner
      ? targetByProspectId.get(threadOwner)
      : undefined);
  if (
    !target ||
    !target.prospect.firstSentAt ||
    input.date <= target.prospect.firstSentAt
  ) {
    return null;
  }
  const optedOut =
    OPT_OUT_PATTERN.test(input.subject) || OPT_OUT_PATTERN.test(body);
  return {
    type: optedOut ? "unsubscribe" : "reply",
    prospectId: target.prospect.id,
    detail: `${optedOut ? "Opt-out" : "Exact-recipient or known-thread reply, including any automatic response"} detected in Gmail: ${input.subject || "No subject"}`,
  };
}

async function checkCreditUnionInboxImpl(input: {
  campaignId: number;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const password = getGmailPassword();
  if (!password) {
    throw new Error(
      "Gmail app password is not configured for credit-union reply monitoring"
    );
  }
  const targets = await getCreditUnionInboxTargets(input.campaignId);
  if (targets.length === 0) {
    await recordCreditUnionReplyCheck(input.campaignId, now);
    return { repliesDetected: 0, bouncesDetected: 0, scanned: 0 };
  }
  const earliestFirstSentAt = targets.reduce(
    (earliest, target) =>
      !earliest || target.prospect.firstSentAt! < earliest
        ? target.prospect.firstSentAt!
        : earliest,
    null as Date | null
  );
  if (!earliestFirstSentAt) {
    throw new Error("Credit-union inbox target has no first-send timestamp.");
  }
  const recipientAddresses = Array.from(
    new Set(
      targets
        .map(target => normalizeAddress(target.prospect.normalizedEmail))
        .filter((email): email is string => Boolean(email))
    )
  );
  const sentMessageIds = Array.from(
    new Set(
      targets
        .flatMap(target => target.sentMessages)
        .map(message => normalizeMessageId(message.providerMessageId))
        .filter((messageId): messageId is string => Boolean(messageId))
    )
  );
  // Keep sender and thread matching together in small OR groups. The date
  // window keeps the search bounded without dropping an older active target;
  // classification still verifies each prospect's exact first-send time.
  const searchTerms: SearchObject[] = [
    ...recipientAddresses.map(from => ({ from })),
    ...sentMessageIds.flatMap(messageId => [
      headerSearch("in-reply-to", messageId),
      headerSearch("references", messageId),
    ]),
  ];
  const queries: SearchObject[] = [];
  for (
    let index = 0;
    index < searchTerms.length;
    index += SEARCH_TERMS_PER_QUERY
  ) {
    const batch = searchTerms.slice(index, index + SEARCH_TERMS_PER_QUERY);
    queries.push(
      batch.length === 1
        ? { ...batch[0], since: earliestFirstSentAt }
        : { or: batch, since: earliestFirstSentAt }
    );
  }
  queries.push({
    or: Array.from(GMAIL_DSN_SENDERS).map(from => ({ from })),
    since: earliestFirstSentAt,
  });
  if (queries.length > MAX_TARGETED_QUERIES)
    throw new Error(
      "Credit-union inbox scan is incomplete: targeted query batches exceeded their hard bound."
    );
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 25_000,
    logger: false,
    auth: { user: JERISTOTLE_EMAIL, pass: password },
  });
  let repliesDetected = 0;
  let bouncesDetected = 0;
  let scanned = 0;
  const releaseSocket = ownOutreachImap(client);
  try {
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    const uidSet = new Set<number>();
    for (const query of queries) {
      const uids = await client.search(query, { uid: true });
      if (!Array.isArray(uids)) continue;
      if (uids.length > PER_QUERY_SCAN_LIMIT) {
        throw new Error(
          `Credit-union inbox scan is incomplete: targeted query exceeded ${PER_QUERY_SCAN_LIMIT} messages.`
        );
      }
      for (const uid of uids) uidSet.add(uid);
    }
    const boundedUids = Array.from(uidSet).sort((a, b) => a - b);
    if (boundedUids.length > MAX_SCAN_MESSAGES) {
      throw new Error(
        "Credit-union inbox scan is incomplete: targeted result set exceeded its hard bound."
      );
    }
    if (boundedUids.length) {
      const messages = await client.fetchAll(
        boundedUids,
        {
          envelope: true,
          source: { maxLength: 65_536 },
          headers: ["in-reply-to", "references", "message-id"],
        },
        { uid: true }
      );
      for (const message of messages) {
        const envelope = message.envelope;
        const headers = Buffer.isBuffer(message.headers)
          ? message.headers
          : null;
        const source = Buffer.isBuffer(message.source)
          ? message.source.toString("utf8")
          : String(message.source || "");
        const classification = classifyCreditUnionInboxMessage(
          {
            from: envelope?.from?.[0]?.address || null,
            subject: envelope?.subject || "",
            date: safeDate(envelope?.date, now),
            inReplyTo:
              envelope?.inReplyTo || headerValue(headers, "in-reply-to"),
            references: [headerValue(headers, "references") || ""],
            messageId:
              envelope?.messageId || headerValue(headers, "message-id"),
            text: source,
          },
          targets
        );
        scanned += 1;
        if (!classification) continue;
        const accepted = await markCreditUnionProspectTerminal({
          prospectId: classification.prospectId,
          status:
            classification.type === "reply"
              ? "replied"
              : classification.type === "unsubscribe"
                ? "unsubscribed"
                : "bounced",
          eventType:
            classification.type === "reply"
              ? "reply_detected"
              : classification.type === "unsubscribe"
                ? "unsubscribed"
                : "bounced",
          detail: classification.detail,
          occurredAt: safeDate(envelope?.date, now),
        });
        if (!accepted) continue;
        if (classification.type === "bounce") bouncesDetected += 1;
        else repliesDetected += 1;
      }
    }
  } finally {
    lock.release();
    client.close();
  }
  } finally { releaseSocket(); client.close(); }
  await recordCreditUnionReplyCheck(input.campaignId, now);
  return { repliesDetected, bouncesDetected, scanned };
}

export async function checkCreditUnionInbox(...args: Parameters<typeof checkCreditUnionInboxImpl>) {
  return withOutreachStage(OUTREACH_INBOX_BUDGET_MS, () => checkCreditUnionInboxImpl(...args));
}
