import { ownOutreachResource, outreachDeadlineCheck } from "./outreachDeadline";
import { performance } from "node:perf_hooks";
import type { Readable } from "node:stream";
import SMTPConnection from "nodemailer/lib/smtp-connection";
import MailComposer from "nodemailer/lib/mail-composer";
import { JERISTOTLE_EMAIL } from "../shared/const";
import { assertActiveJeristotleEmailRecipients } from "../shared/personnelPolicy";
import { renderJeristotleOutreachEmail } from "../shared/outreachFormatting";

/** Absolute lifetime, not an SMTP inactivity timeout. Never race an uncancelled send. */
export const SECTOR_SMTP_DEADLINE_MS = 5_000;

export type SectorEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo: string;
  messageId: string;
  inReplyTo?: string;
  references?: string;
  headers: Record<string, string>;
};

function smtpConfiguration() {
  // Preserve the legacy credential precedence and account. Never log credentials.
  const pass = process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS;
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT || "465");
  if (
    !pass ||
    !host.trim() ||
    /[\s\x00-\x1f]/.test(host) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  )
    return null;
  return {
    options: {
      host,
      port,
      secure: process.env.SMTP_SECURE !== "false",
      connectionTimeout: SECTOR_SMTP_DEADLINE_MS,
      greetingTimeout: SECTOR_SMTP_DEADLINE_MS,
      socketTimeout: SECTOR_SMTP_DEADLINE_MS,
      dnsTimeout: SECTOR_SMTP_DEADLINE_MS,
      logger: false,
      debug: false,
      transactionLog: false,
    },
    auth: { user: JERISTOTLE_EMAIL, pass },
  };
}

/** Local preflight only: no DNS, connection, verification, claim, or persistence. */
export function sectorEmailTransportConfigured() {
  return smtpConfiguration() !== null;
}

/** Local preflight and canonical campaign content; never accepts caller-supplied From/envelope. */
export function buildSectorEmail(input: {
  to: string;
  subject: string;
  text: string;
  messageId: string;
  previousMessageId?: string | null;
}): SectorEmail {
  assertActiveJeristotleEmailRecipients(input.to);
  if (
    !/^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(input.to) ||
    /[\r\n]/.test(input.subject)
  )
    throw new Error("Invalid Sector email recipient or subject");
  if (
    !/^<[^<>\s]+@jeristotleproductions\.com>$/.test(input.messageId) ||
    (input.previousMessageId &&
      !/^<[^<>\s]+@[^<>\s]+>$/.test(input.previousMessageId))
  )
    throw new Error("Invalid Sector message identifier");
  return {
    to: input.to,
    replyTo: JERISTOTLE_EMAIL,
    subject: input.subject,
    text: input.text,
    html: renderJeristotleOutreachEmail({
      subject: input.subject,
      text: input.text,
      linkFree: true,
    }),
    messageId: input.messageId,
    inReplyTo: input.previousMessageId || undefined,
    references: input.previousMessageId || undefined,
    headers: {},
  };
}

/**
 * One connection, one SMTP transaction, no pool, reset, reconnect, or retry.
 * The caller MUST durably record attemptedAt and the exact message ID/claim first.
 * Every rejection after that boundary is uncertain, even an AUTH/connect failure.
 */
export function sendSectorEmail(
  message: SectorEmail,
  input: { deadline: number }
): Promise<{ configured: boolean; sent: boolean; messageId?: string }> {
  const startedAt = performance.now();
  const lifetime = Math.min(
    SECTOR_SMTP_DEADLINE_MS,
    input.deadline - Date.now()
  );
  outreachDeadlineCheck();
  const configuration = smtpConfiguration();
  if (!configuration)
    return Promise.resolve({ configured: false, sent: false });
  if (!Number.isFinite(lifetime) || lifetime <= 0)
    return Promise.reject(
      new Error(
        "Sector SMTP deadline unavailable; inspect attempted email, never retry"
      )
    );
  const expiresAt = startedAt + lifetime;

  return new Promise((resolve, reject) => {
    let settled = false;
    let connection: SMTPConnection | undefined;
    let source: Readable | undefined;
    const dispose = () => {
      // SMTPConnection.close() is real cancellation (unlike non-pooled transport.close()).
      // Installed nodemailer 10.0.10 close() uses socket.end() after handshake, which
      // may flush pending DATA. Capture its exposed, typed socket and HARD destroy
      // it too. close() clears protocol timers/actions and blocks late DNS connects.
      const socket = connection?._socket;
      try {
        source?.unpipe();
        source?.destroy();
      } catch {
        /* teardown must not prevent settlement */
      }
      try {
        if (socket) socket.destroy();
      } catch {
        /* never reconnect */
      }
      try {
        connection?.close();
      } catch {
        /* owned socket was already hard-aborted */
      }
    };
    const releaseOwnership = ownOutreachResource(dispose);
    const finish = (error?: string) => {
      if (settled) return;
      settled = true; // Set before close() synchronously emits end/error.
      clearTimeout(timer);
      releaseOwnership();
      dispose();
      if (error)
        reject(new Error(`${error}; inspect attempted email, never retry`));
      else
        resolve({ configured: true, sent: true, messageId: message.messageId });
    };
    const current = () => {
      if (settled) return false;
      try { outreachDeadlineCheck(); } catch { finish("Outreach callback closed"); return false; }
      // Monotonic check also rejects callbacks delivered after the deadline when
      // the event loop is delayed; periodic traffic cannot renew this deadline.
      if (performance.now() >= expiresAt) {
        finish("Sector SMTP absolute deadline exceeded");
        return false;
      }
      return true;
    };
    const timer = setTimeout(
      () => finish("Sector SMTP absolute deadline exceeded"),
      Math.max(1, expiresAt - performance.now())
    );
    try {
      assertActiveJeristotleEmailRecipients(message.to);
      const mime = new MailComposer({
        from: `"Jeristotle Productions" <${JERISTOTLE_EMAIL}>`,
        to: message.to,
        replyTo: JERISTOTLE_EMAIL,
        subject: message.subject,
        text: message.text,
        html: message.html,
        messageId: message.messageId,
        inReplyTo: message.inReplyTo,
        references: message.references,
        headers: message.headers,
        envelope: { from: JERISTOTLE_EMAIL, to: [message.to] },
        // Only in-memory strings are supported; never fetch content/attachments.
        disableFileAccess: true,
        disableUrlAccess: true,
      }).compile();
      connection = new SMTPConnection(configuration.options);
      connection.on("error", () =>
        finish("Sector SMTP failure or acceptance uncertain")
      );
      connection.on("end", () =>
        finish("Sector SMTP connection ended without confirmed acceptance")
      );
      if (!current()) return;
      connection.connect(error => {
        if (!current()) return;
        if (error) {
          finish("Sector SMTP connection failed");
          return;
        }
        try {
          connection!.login(configuration.auth, error => {
            if (!current()) return;
            if (error) {
              finish("Sector SMTP authentication failed");
              return;
            }
            try {
              source = mime.createReadStream();
              source.on("error", () =>
                finish("Sector SMTP message stream failed")
              );
              if (!current()) return;
              connection!.send(
                { from: JERISTOTLE_EMAIL, to: [message.to] },
                source,
                (error, info) => {
                  if (!current()) return;
                  if (
                    error ||
                    !info ||
                    info.accepted?.length !== 1 ||
                    info.accepted[0]?.toLowerCase() !==
                      message.to.toLowerCase() ||
                    info.rejected?.length !== 0 ||
                    !/^2\d\d(?:[ -]|$)/.test(info.response || "")
                  ) {
                    finish("Sector SMTP acceptance not confirmed");
                    return;
                  }
                  finish();
                }
              );
            } catch {
              finish("Sector SMTP send failed");
            }
          });
        } catch {
          finish("Sector SMTP authentication failed");
        }
      });
    } catch {
      finish("Sector SMTP preparation or connection failed");
    }
  });
}
