import { JERISTOTLE_EMAIL } from "../shared/const";
import {
  buildInitialChamberOutreachEmail,
  buildOutreachSignature,
  normalizeOutreachPunctuation,
  type ChamberOutreachMessage,
} from "./outreachEmail";

export type OutreachSequenceKind =
  | "initial"
  | "followup_one"
  | "followup_two"
  | "followup_three";

export type OutreachSequenceDraft = {
  sequenceStep: number;
  kind: OutreachSequenceKind;
  subject: string;
  html: string;
  text: string;
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

function buildFollowupEmail({
  firstName,
  company,
  subject,
  paragraphs,
  physicalPostalAddress,
  unsubscribeUrl,
}: {
  firstName: string;
  company: string;
  subject: string;
  paragraphs: string[];
  physicalPostalAddress: string;
  unsubscribeUrl: string;
}) {
  const clean = normalizeOutreachPunctuation;
  const cleanSubject = clean(subject);
  const safeSubject = escapeHtml(cleanSubject);
  const safeAddress = escapeHtml(clean(physicalPostalAddress));
  const cleanParagraphs = paragraphs.map(clean);
  const body = cleanParagraphs
    .map(
      paragraph => `<p style="margin:0 0 18px;">${escapeHtml(paragraph)}</p>`
    )
    .join("\n");

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${safeSubject}</title>
  </head>
  <body style="margin:0;background:#ffffff;color:#181818;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#ffffff;">
      <tr>
        <td align="left">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:640px;background:#ffffff;">
            <tr>
              <td style="padding:26px 28px 24px;color:#333333;font-size:16px;line-height:1.65;">
                <p style="margin:0 0 18px;">Hi ${escapeHtml(clean(firstName))},</p>
                ${body}
                <p style="margin:6px 0 0;color:#111111;font-size:16px;font-weight:800;line-height:1.6;">Cheers to a prosperous 2027!</p>
                ${buildOutreachSignature()}
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 24px;color:#D3D3D3;font-size:9px;line-height:1.65;">
                Jeristotle Productions · ${safeAddress}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    `Hi ${clean(firstName)},`,
    "",
    ...cleanParagraphs.flatMap(paragraph => [paragraph, ""]),
    "Cheers to a prosperous 2027!",
    "",
    "Jeremy Wells",
    "Creative Director",
    "Jeristotle Productions",
    "Movie-level content production for small businesses.",
    JERISTOTLE_EMAIL,
    "https://jeristotleproductions.com/",
    "",
    `Jeristotle Productions · ${clean(physicalPostalAddress)}`,
  ].join("\n");

  return { subject: cleanSubject, html, text };
}

export function buildChamberOutreachSequence(
  message: ChamberOutreachMessage
): OutreachSequenceDraft[] {
  const initial = buildInitialChamberOutreachEmail(message);
  const replySubject = `Re: ${initial.subject}`;
  const base = {
    firstName: message.firstName,
    company: message.company,
    subject: replySubject,
    physicalPostalAddress: message.physicalPostalAddress,
    unsubscribeUrl: message.unsubscribeUrl,
  };

  const followupOne = buildFollowupEmail({
    ...base,
    paragraphs: [
      `I wanted to follow up because one detail from ${message.company} stood out to me. ${message.personalizedOpening}`,
      message.questionAboutGoals,
      "Would a short conversation be useful?",
    ],
  });

  const followupTwo = buildFollowupEmail({
    ...base,
    paragraphs: [
      `One practical idea for ${message.company} would be ${message.personalizedHelpAngle}.`,
      "That is only an initial thought. Your goals and what you are already working toward should lead the conversation.",
      "Would you be open to comparing notes?",
    ],
  });

  const followupThree = buildFollowupEmail({
    ...base,
    paragraphs: [
      "I will make this my last follow-up.",
      "If the timing is not right, no response is needed and we will not continue the sequence.",
      `If you are open to it, I would still enjoy hearing what ${message.company} wants to achieve in 2027.`,
    ],
  });

  return [
    { sequenceStep: 0, kind: "initial", ...initial },
    { sequenceStep: 1, kind: "followup_one", ...followupOne },
    { sequenceStep: 2, kind: "followup_two", ...followupTwo },
    { sequenceStep: 3, kind: "followup_three", ...followupThree },
  ];
}
