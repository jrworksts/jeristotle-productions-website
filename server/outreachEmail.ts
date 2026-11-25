import { JERISTOTLE_EMAIL } from "../shared/const";

export type ChamberOutreachMessage = {
  firstName: string;
  company: string;
  subject: string;
  personalizedOpening: string;
  personalizedHelpAngle: string;
  questionAboutGoals: string;
  physicalPostalAddress: string;
  unsubscribeUrl: string;
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export const normalizeOutreachPunctuation = (value: string) =>
  value.replace(/\s*[—–]\s*/g, ", ");

export function buildOutreachSignature() {
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:30px;border-collapse:collapse;">
      <tr>
        <td style="width:5px;background:#ffb627;font-size:0;line-height:0;">&nbsp;</td>
        <td style="padding:2px 0 2px 18px;">
          <p style="margin:0;color:#111111;font-family:Arial,Helvetica,sans-serif;font-size:19px;font-weight:900;line-height:1.15;">Jeremy Wells</p>
          <p style="margin:5px 0 0;color:#6b655b;font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:800;letter-spacing:1.8px;line-height:1.4;text-transform:uppercase;">Creative Director</p>
          <p style="margin:10px 0 0;color:#a16b00;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:900;letter-spacing:1.5px;line-height:1.4;text-transform:uppercase;">Jeristotle Productions</p>
          <p style="margin:4px 0 0;color:#777066;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;">Movie-level content production for small businesses.</p>
          <p style="margin:10px 0 0;color:#111111;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;">
            <a href="mailto:${JERISTOTLE_EMAIL}" style="color:#111111;font-weight:700;text-decoration:none;">${JERISTOTLE_EMAIL}</a>
            <span style="color:#d5cbb8;padding:0 7px;">|</span>
            <a href="https://jeristotleproductions.com/" style="color:#a16b00;font-weight:800;text-decoration:none;">jeristotleproductions.com</a>
          </p>
        </td>
      </tr>
    </table>`;
}

export function buildInitialChamberOutreachEmail(
  message: ChamberOutreachMessage
) {
  const clean = normalizeOutreachPunctuation;
  const firstName = escapeHtml(clean(message.firstName));
  const company = escapeHtml(clean(message.company));
  const cleanSubject = `A quick idea for ${clean(message.company)}`;
  const subject = escapeHtml(cleanSubject);
  const cleanOpening = clean(message.personalizedOpening);
  const opening = escapeHtml(cleanOpening);
  const cleanHelpAngle = clean(message.personalizedHelpAngle);
  const helpAngle = escapeHtml(cleanHelpAngle);
  const cleanQuestionAboutGoals = clean(message.questionAboutGoals);
  const questionAboutGoals = escapeHtml(cleanQuestionAboutGoals);
  const address = escapeHtml(clean(message.physicalPostalAddress));

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${subject}</title>
  </head>
  <body style="margin:0;background:#ffffff;color:#181818;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#ffffff;">
      <tr>
        <td align="left">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:640px;background:#ffffff;">
            <tr>
              <td style="padding:26px 28px 24px;color:#333333;font-size:16px;line-height:1.65;">
                <p style="margin:0 0 18px;">Hi ${firstName},</p>
                <p style="margin:0 0 18px;">${opening}</p>
                <p style="margin:0 0 18px;">We recently joined the United Corpus Christi Chamber of Commerce, and I wanted to introduce Jeristotle Productions.</p>
                <p style="margin:0 0 18px;">We create movie-level content for small businesses and help connect that content to promotion and targeted new-client lead generation.</p>
                <p style="margin:0 0 18px;">As a new Chamber member, I am reaching out to get to know a few fellow members and hear what they are working toward in 2027.</p>
                <p style="margin:0 0 18px;">Rather than assume what ${company} needs, I would like to hear what your goals are for 2027. If useful, we can compare notes on how a fresh content approach and targeted new-client lead generation might support them.</p>
                <p style="margin:0 0 18px;">${questionAboutGoals}</p>
                <p style="margin:0 0 18px;">One possibility might be ${helpAngle}, but your actual goals should lead the conversation.</p>
                <p style="margin:0 0 24px;">Would you be open to a brief conversation?</p>

                <p style="margin:0;color:#111111;font-size:16px;font-weight:800;line-height:1.6;">Cheers to a prosperous 2027!</p>

                ${buildOutreachSignature()}
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 24px;color:#D3D3D3;font-size:9px;line-height:1.65;">
                Jeristotle Productions · ${address}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    `Hi ${message.firstName},`,
    "",
    cleanOpening,
    "",
    "We recently joined the United Corpus Christi Chamber of Commerce, and I wanted to introduce Jeristotle Productions.",
    "",
    "We create movie-level content for small businesses and help connect that content to promotion and targeted new-client lead generation.",
    "",
    "As a new Chamber member, I am reaching out to get to know a few fellow members and hear what they are working toward in 2027.",
    "",
    `Rather than assume what ${clean(message.company)} needs, I would like to hear what your goals are for 2027. If useful, we can compare notes on how a fresh content approach and targeted new-client lead generation might support them.`,
    "",
    cleanQuestionAboutGoals,
    "",
    `One possibility might be ${cleanHelpAngle}, but your actual goals should lead the conversation.`,
    "",
    "Would you be open to a brief conversation?",
    "",
    "Cheers to a prosperous 2027!",
    "",
    "Jeremy Wells",
    "Creative Director",
    "Jeristotle Productions",
    "Movie-level content production for small businesses.",
    JERISTOTLE_EMAIL,
    "https://jeristotleproductions.com/",
    "",
    `Jeristotle Productions · ${message.physicalPostalAddress}`,
  ].join("\n");

  return { subject: cleanSubject, html, text };
}
