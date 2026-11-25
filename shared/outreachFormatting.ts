import { JERISTOTLE_EMAIL } from "./const";

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

function publicHttpsUrl(value: string | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

/** Formatting only: does not change stored copy, send, schedule or approve a message. */
export function renderJeristotleOutreachEmail(input: {
  subject: string;
  text: string;
  unsubscribeUrl?: string;
  physicalPostalAddress?: string | null;
  /** Opt-in only. Preserve all legacy signatures/links unless explicitly requested. */
  linkFree?: boolean;
}) {
  const normalized = input.text.replace(/\r\n?/g, "\n");
  if (
    input.linkFree &&
    /(?:https?:\/\/|www\.|mailto:|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:[a-z0-9-]+\.)+(?:com|org|net|io|co|edu|gov)\b)/i.test(
      normalized
    )
  ) {
    throw new Error(
      "Link-free outreach cannot contain URLs or email-address links"
    );
  }
  // Only a standalone signature name is recognized, never a mention in the introduction.
  const signatureAt = normalized.lastIndexOf("\nJeremy Wells\n");
  const body = (
    signatureAt >= 0 ? normalized.slice(0, signatureAt) : normalized
  ).trimEnd();
  const tail =
    signatureAt >= 0 ? normalized.slice(signatureAt + 1).split("\n") : [];
  const address =
    input.physicalPostalAddress?.trim() ||
    tail.find(line => /^\d{1,6}\s+\S/.test(line.trim()))?.trim() ||
    "319 N Mesquite St, Corpus Christi, TX 78401";
  const unsubscribeUrl =
    publicHttpsUrl(input.unsubscribeUrl) ||
    tail
      .map(line => publicHttpsUrl(line.trim()))
      .find(url => url && /unsubscribe/i.test(url));
  const paragraphs = body
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(
      p =>
        `<p style="margin:0 0 18px;white-space:pre-line;">${escapeHtml(p)}</p>`
    )
    .join("\n");
  // Keep any non-standard signature-tail notes rather than silently dropping them.
  const extraNotes = tail
    .slice(1)
    .filter(line => {
      const value = line.trim();
      return (
        value &&
        value !== address &&
        value !== `Jeristotle Productions · ${address}` &&
        !/^(Creative Director|Jeristotle Productions|Movie-level content production for small businesses\.?|Corpus Christi,? TX\.?)$/i.test(
          value
        ) &&
        !/^(https?:\/\/|jeristotleproductions\.com|jeremy@jeristotleproductions\.com)/i.test(
          value
        ) &&
        !/^(To (stop|opt out)|Reply .*(unsubscribe|no thanks))/i.test(value)
      );
    })
    .map(
      line =>
        `<p style="margin:8px 0 0;font-size:12px;line-height:1.65;">${escapeHtml(line)}</p>`
    )
    .join("\n");
  const optOut =
    unsubscribeUrl && !input.linkFree
      ? `To stop these emails, reply &quot;unsubscribe&quot; or use <a href="${escapeHtml(unsubscribeUrl)}" style="color:#777066;text-decoration:underline;">this unsubscribe link</a>.`
      : `To opt out of any future email, reply &quot;unsubscribe&quot;.`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escapeHtml(input.subject)}</title>
  </head>
  <body style="margin:0;background:#ffffff;color:#222222;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#ffffff;">
      <tr><td align="left">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:640px;background:#ffffff;">
          <tr><td style="padding:26px 24px;font-size:16px;line-height:1.65;">
            ${paragraphs}
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:24px;border-collapse:collapse;">
              <tr>
                <td style="width:5px;background:#ffb627;font-size:0;line-height:0;">&nbsp;</td>
                <td style="padding:2px 0 2px 18px;">
                  <p style="margin:0;color:#111111;font-size:19px;font-weight:900;line-height:1.2;">Jeremy Wells</p>
                  <p style="margin:5px 0 0;color:#6b655b;font-size:10px;font-weight:800;letter-spacing:1.8px;line-height:1.4;text-transform:uppercase;">Creative Director</p>
                  <p style="margin:10px 0 0;color:#a16b00;font-size:12px;font-weight:900;letter-spacing:1.5px;line-height:1.4;text-transform:uppercase;">Jeristotle Productions</p>
                  ${
                    input.linkFree
                      ? ""
                      : `<p style="margin:10px 0 0;font-size:12px;line-height:1.6;">
                    <a href="mailto:${JERISTOTLE_EMAIL}" style="color:#111111;font-weight:700;text-decoration:none;">${JERISTOTLE_EMAIL}</a><br>
                    <a href="https://jeristotleproductions.com/" style="color:#a16b00;font-weight:800;text-decoration:none;">jeristotleproductions.com</a>
                  </p>`
                  }
                </td>
              </tr>
            </table>
            ${extraNotes}
            <p style="margin:22px 0 0;color:#D3D3D3;font-size:9px;line-height:1.65;">${escapeHtml(address)}</p>
            <p style="margin:5px 0 0;color:#777066;font-size:11px;line-height:1.65;">${optOut}</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}
