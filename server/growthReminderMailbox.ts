import { ImapFlow } from "imapflow";
import { JERISTOTLE_EMAIL } from "../shared/const";

/** Absence is NOT proof of non-delivery: an ambiguous SMTP attempt is never released here. */
export async function findReminderSentMessage(
  messageId: string
): Promise<boolean> {
  const pass = process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS;
  if (!pass)
    throw new Error("Gmail credentials unavailable for receipt verification");
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    logger: false,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    auth: { user: JERISTOTLE_EMAIL, pass },
  });
  await client.connect();
  try {
    const lock = await client.getMailboxLock("[Gmail]/Sent Mail", {
      readOnly: true,
    });
    try {
      const ids = await client.search(
        { header: { "message-id": messageId } },
        { uid: true }
      );
      return Array.isArray(ids) && ids.length > 0;
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
}
