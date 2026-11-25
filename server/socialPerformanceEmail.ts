import { z } from "zod";
import { JERISTOTLE_EMAIL } from "../shared/const";

export const SOCIAL_REPORT_TIME_ZONE = "America/Chicago";
export const SOCIAL_REPORT_BRAND_ID = 8113996;
export const SOCIAL_REPORT_BRAND_LABEL = "Jeristotle Productions";
export const SOCIAL_REPORT_RECIPIENT = JERISTOTLE_EMAIL;
export const SOCIAL_REPORT_SENDER = JERISTOTLE_EMAIL;
export const SOCIAL_REPORT_MAX_BYTES = 65_536;
const LOGO_URL =
  "https://files.manuscdn.com/user_upload_by_module/session_file/310519663569963942/ILnVCcHNKYfXrFtM.png";
const GOLD = "#ffb627";
export const FOUNDATION_PLATFORM_LABELS = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedinPersonal: "LinkedIn personal",
  linkedinCompany: "LinkedIn company",
} as const;

/** Messages from this error class contain validation/operational labels, never raw input values. */
export class SocialPerformanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SocialPerformanceError";
  }
}

const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),
      "Control characters are not allowed"
    );
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(value => {
    const parsed = new Date(`${value}T12:00:00Z`);
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "Must be a real YYYY-MM-DD date");
const httpsUrl = text(1500).refine(value => {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !/[\s\u0000-\u001f]/.test(value) &&
      !/%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(value)
    );
  } catch {
    return false;
  }
}, "Must use HTTPS without credentials or control characters");
const sourceIds = z.array(text(80)).min(1).max(4);
const metric = z
  .object({
    label: text(100),
    value: text(120),
    status: z.enum(["known", "unknown"]),
    comparison: text(350),
    comparisonStatus: z.enum(["known", "unknown"]),
    sourceIds,
  })
  .strict()
  .superRefine((row, ctx) => {
    if (row.status === "unknown" && !/^Unknown\b/i.test(row.value))
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "Unknown values must explicitly start with Unknown",
      });
    if (
      row.comparisonStatus === "unknown" &&
      !/^Unknown\b/i.test(row.comparison)
    )
      ctx.addIssue({
        code: "custom",
        path: ["comparison"],
        message: "Unknown comparisons must explicitly start with Unknown",
      });
    if (row.status === "known" && /^Unknown\b/i.test(row.value))
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message: "Unknown values cannot be labelled known",
      });
    if (row.comparisonStatus === "known" && /^Unknown\b/i.test(row.comparison))
      ctx.addIssue({
        code: "custom",
        path: ["comparisonStatus"],
        message: "Unknown comparisons cannot be labelled known",
      });
  });
const platform = z
  .object({
    platform: z.enum([
      "facebook",
      "instagram",
      "linkedinPersonal",
      "linkedinCompany",
    ]),
    availability: z.enum(["available", "partial", "unavailable"]),
    missingData: text(600),
    sourceIds,
    metrics: z.array(metric).min(1).max(8),
  })
  .strict()
  .superRefine((item, ctx) => {
    if (
      item.platform === "linkedinCompany" &&
      item.availability !== "unavailable"
    )
      ctx.addIssue({
        code: "custom",
        path: ["availability"],
        message: "LinkedIn company is unavailable only",
      });
    if (item.availability === "unavailable") {
      if (
        !/\b(unknown|unavailable|missing|not connected|not retrieved)\b/i.test(
          item.missingData
        )
      )
        ctx.addIssue({
          code: "custom",
          path: ["missingData"],
          message: "Unavailable platforms need an explicit missing-data caveat",
        });
      if (
        item.metrics.some(
          row => row.status !== "unknown" || row.comparisonStatus !== "unknown"
        )
      )
        ctx.addIssue({
          code: "custom",
          path: ["metrics"],
          message:
            "Unavailable platforms must have unknown values and comparisons",
        });
    }
  });

/** Strict at every level: no recipient, window override, events, outreach or task fields. */
export const socialPerformancePacketSchema = z
  .object({
    schemaVersion: z.literal(1),
    reportDate: date.refine(
      value => new Date(`${value}T12:00:00Z`).getUTCDay() === 1,
      "reportDate must be Monday"
    ),
    brand: z
      .object({
        id: z.literal(SOCIAL_REPORT_BRAND_ID),
        label: z.literal(SOCIAL_REPORT_BRAND_LABEL),
      })
      .strict(),
    capturedAt: z.iso.datetime({ offset: true }),
    sources: z
      .array(
        z
          .object({
            id: text(80),
            evidence: text(600),
            url: httpsUrl.optional(),
          })
          .strict()
      )
      .min(1)
      .max(12),
    dailyMovement: z
      .object({
        entries: z
          .array(z.object({ date, text: text(600), sourceIds }).strict())
          .min(1)
          .max(7),
        missingData: text(600),
      })
      .strict(),
    weeklySummary: z
      .object({ text: text(1400), missingData: text(600), sourceIds })
      .strict(),
    platforms: z.array(platform).length(4),
    postHighlights: z
      .array(
        z
          .object({
            platform: z.enum(["facebook", "instagram", "linkedinPersonal"]),
            postId: text(160),
            publishedDate: date,
            label: text(160),
            observation: text(600),
            permalink: httpsUrl,
            sourceIds,
          })
          .strict()
      )
      .max(4),
    highlightsMissingData: text(600),
    suggestions: z
      .array(
        z
          .object({
            observation: text(500),
            test: text(500),
            evaluation: text(500),
            sourceIds,
          })
          .strict()
      )
      .max(3),
    motivation: z
      .object({
        title: text(180),
        url: httpsUrl,
        application: text(600),
        sourceIds,
      })
      .strict()
      .optional(),
  })
  .strict();

export type SocialPerformancePacket = z.infer<
  typeof socialPerformancePacketSchema
>;
export interface ReportWindow {
  start: string;
  end: string;
}
export interface SocialReportWindows {
  timeZone: typeof SOCIAL_REPORT_TIME_ZONE;
  current: ReportWindow;
  previous: ReportWindow;
}

export function socialCentralDate(now: Date): string {
  if (!Number.isFinite(now.getTime()))
    throw new SocialPerformanceError("Invalid current time");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SOCIAL_REPORT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (name: string) => parts.find(item => item.type === name)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function shiftSocialDate(value: string, days: number): string {
  const result = new Date(`${value}T12:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

/** Calendar-day arithmetic, not subtraction of Chicago 24-hour intervals across DST. */
export function deriveSocialReportWindows(
  reportDate: string
): SocialReportWindows {
  const parsed = date.safeParse(reportDate);
  if (!parsed.success || new Date(`${reportDate}T12:00:00Z`).getUTCDay() !== 1)
    throw new SocialPerformanceError(
      "reportDate must be a real Monday YYYY-MM-DD"
    );
  return {
    timeZone: SOCIAL_REPORT_TIME_ZONE,
    current: {
      start: shiftSocialDate(reportDate, -7),
      end: shiftSocialDate(reportDate, -1),
    },
    previous: {
      start: shiftSocialDate(reportDate, -14),
      end: shiftSocialDate(reportDate, -8),
    },
  };
}

function validationField(value: string) {
  return value.replace(/[^a-zA-Z0-9_.-]/g, "?").slice(0, 80);
}

export function validateSocialPerformancePacket(
  raw: unknown
): SocialPerformancePacket {
  let serialized: string;
  try {
    serialized = JSON.stringify(raw);
  } catch {
    throw new SocialPerformanceError("Packet must be JSON serializable");
  }
  if (
    typeof serialized !== "string" ||
    Buffer.byteLength(serialized, "utf8") > SOCIAL_REPORT_MAX_BYTES
  )
    throw new SocialPerformanceError(
      "Packet must be JSON of at most 65536 UTF-8 bytes"
    );
  const result = socialPerformancePacketSchema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    const at =
      issue.path.map(String).map(validationField).join(".") || "packet";
    if (issue.code === "unrecognized_keys")
      throw new SocialPerformanceError(
        `Unrecognized field(s) at ${at}: ${issue.keys.slice(0, 8).map(validationField).join(", ")}`
      );
    // Do not echo rejected values, URLs, arbitrary source prose, or Zod's raw issue objects.
    throw new SocialPerformanceError(
      `Invalid ${at}: check required type, allowed scope, format and field limits`
    );
  }
  const packet = result.data;
  const windows = deriveSocialReportWindows(packet.reportDate);
  const inWeek = (day: string) =>
    day >= windows.current.start && day <= windows.current.end;
  const ids = new Set(packet.sources.map(source => source.id));
  if (ids.size !== packet.sources.length)
    throw new SocialPerformanceError("Source ids must be unique");
  const references = [
    packet.weeklySummary.sourceIds,
    ...packet.dailyMovement.entries.map(item => item.sourceIds),
    ...packet.platforms.flatMap(item => [
      item.sourceIds,
      ...item.metrics.map(row => row.sourceIds),
    ]),
    ...packet.postHighlights.map(item => item.sourceIds),
    ...packet.suggestions.map(item => item.sourceIds),
    ...(packet.motivation ? [packet.motivation.sourceIds] : []),
  ];
  if (
    references.some(
      list =>
        list.some(id => !ids.has(id)) || new Set(list).size !== list.length
    )
  )
    throw new SocialPerformanceError(
      "Every sourceIds reference must identify a unique declared source"
    );
  if (new Set(packet.platforms.map(item => item.platform)).size !== 4)
    throw new SocialPerformanceError(
      "Include each of the four foundation platforms exactly once"
    );
  const movementDates = packet.dailyMovement.entries.map(item => item.date);
  if (
    movementDates.some(day => !inWeek(day)) ||
    new Set(movementDates).size !== movementDates.length
  )
    throw new SocialPerformanceError(
      "Daily movement dates must be unique and within the completed report week"
    );
  if (packet.postHighlights.some(item => !inWeek(item.publishedDate)))
    throw new SocialPerformanceError(
      "Post highlights must be actual posts from the completed report week"
    );
  const postIds = packet.postHighlights.map(
    item => `${item.platform}:${item.postId}`
  );
  if (new Set(postIds).size !== postIds.length)
    throw new SocialPerformanceError("Post highlights must be unique");
  for (const item of packet.postHighlights) {
    const hostname = new URL(item.permalink).hostname.toLowerCase();
    const domains =
      item.platform === "facebook"
        ? ["facebook.com", "fb.com"]
        : item.platform === "instagram"
          ? ["instagram.com"]
          : ["linkedin.com"];
    if (
      !domains.some(
        domain => hostname === domain || hostname.endsWith(`.${domain}`)
      )
    )
      throw new SocialPerformanceError(
        "Post permalinks must belong to their declared foundation platform"
      );
    const availability = packet.platforms.find(
      row => row.platform === item.platform
    )!.availability;
    if (availability === "unavailable")
      throw new SocialPerformanceError(
        "Unavailable platforms cannot contain post highlights"
      );
  }
  // Reject explicit Metricool brand selectors inconsistent with the fixed packet scope.
  for (const source of packet.sources) {
    if (!source.url) continue;
    const url = new URL(source.url);
    url.searchParams.forEach((value, key) => {
      if (/^brand_?id$/i.test(key) && value !== String(SOCIAL_REPORT_BRAND_ID))
        throw new SocialPerformanceError(
          "Source URL selects a different Metricool brand"
        );
    });
  }
  return packet;
}

export function assertSocialPerformanceSendAllowed(
  packet: SocialPerformancePacket,
  now = new Date()
): void {
  const today = socialCentralDate(now);
  if (new Date(`${today}T12:00:00Z`).getUTCDay() !== 1)
    throw new SocialPerformanceError(
      "Send refused: current America/Chicago day must be Monday"
    );
  if (today < "2026-11-30")
    throw new SocialPerformanceError(
      "Send refused: authorization starts Monday 2026-11-30"
    );
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: SOCIAL_REPORT_TIME_ZONE,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(now)
  );
  if (hour < 10)
    throw new SocialPerformanceError(
      "Send refused: Monday delivery must not precede 10 AM America/Chicago"
    );
  if (packet.reportDate !== today)
    throw new SocialPerformanceError(
      "Send refused: reportDate must equal the current America/Chicago date"
    );
  const age = now.getTime() - new Date(packet.capturedAt).getTime();
  if (!Number.isFinite(age) || age < 0 || age > 24 * 60 * 60 * 1000)
    throw new SocialPerformanceError(
      "Send refused: capturedAt must not be future or older than 24 hours"
    );
}

/** Only typographical punctuation changes; no metric calculations, rounding or inferred deltas. */
export const socialEmailText = (value: string) =>
  value.replace(/[\u2013\u2014]/g, " - ");
const safe = (value: string) =>
  socialEmailText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
const urlHref = (value: string) =>
  new URL(value).href
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
const rangeText = (window: ReportWindow) => {
  const format = (day: string) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      month: "long",
      day: "numeric",
      ...(window.start.slice(0, 4) !== window.end.slice(0, 4)
        ? { year: "numeric" as const }
        : {}),
    }).format(new Date(`${day}T12:00:00Z`));
  return `${format(window.start)} to ${format(window.end)}${window.start.slice(0, 4) === window.end.slice(0, 4) ? `, ${window.end.slice(0, 4)}` : ""}`;
};

export function buildSocialPerformanceEmail(
  raw: unknown,
  options: { preview?: boolean } = {}
) {
  const packet = validateSocialPerformancePacket(raw);
  const windows = deriveSocialReportWindows(packet.reportDate);
  const range = rangeText(windows.current);
  const subject = `Jeristotle weekly social performance | ${range}`;
  const evidence = (refs: string[]) =>
    `<p style="margin:7px 0 0;color:#716a5d;font-size:11px;line-height:1.5;">Source ids: ${refs.map(safe).join(", ")}</p>`;
  const p = (value: string) =>
    `<p style="margin:8px 0;color:#36332f;font-size:14px;line-height:1.6;">${safe(value)}</p>`;
  const section = (title: string, contents: string) =>
    `<tr><td style="padding:22px 24px;background:#faf8f2;border-bottom:1px solid #d8d0bd;"><h2 style="margin:0 0 12px;color:#151515;font-size:22px;line-height:1.25;">${safe(title)}</h2>${contents}</td></tr>`;
  const movement = [...packet.dailyMovement.entries].sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  const platforms = Object.keys(FOUNDATION_PLATFORM_LABELS).map(
    key => packet.platforms.find(item => item.platform === key)!
  );
  const disclaimer =
    "For Tuesday content planning only. Suggestions are bounded tests, not assigned tasks or authorization to publish, contact anyone, or launch campaigns. No results are guaranteed. Missing data remains unknown; display values and comparisons are supplied by the source packet, not calculated by this sender.";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safe(subject)}</title></head>
<body style="margin:0;background:#eeeae1;color:#151515;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eeeae1;padding:20px 8px;"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#faf8f2;border:1px solid #d8d0bd;">
<tr><td style="padding:24px;background:#111111;border-top:6px solid ${GOLD};">
<table role="presentation" cellspacing="0" cellpadding="0"><tr><td width="50"><img src="${LOGO_URL}" width="38" height="38" alt="Jeristotle logo" style="display:block;border:0;"></td><td style="color:#fffaf0;font-size:13px;font-weight:800;letter-spacing:1.6px;">JERISTOTLE<br><span style="color:${GOLD};font-size:9px;letter-spacing:2px;">PRODUCTIONS</span></td></tr></table>
${options.preview ? `<p style="margin:20px 0 0;padding:12px;background:${GOLD};color:#111111;font-size:14px;font-weight:800;">PREVIEW ONLY | No email sent</p>` : ""}
<p style="margin:24px 0 8px;color:${GOLD};font-size:11px;font-weight:800;letter-spacing:1.5px;">THE MONDAY PERFORMANCE REPORT</p>
<h1 style="margin:0;color:#fffaf0;font-size:32px;line-height:1.12;">What moved.<br><span style="color:${GOLD};">What to test next.</span></h1>
<p style="margin:16px 0 0;color:#c9c5bb;font-size:14px;line-height:1.6;">${safe(range)} | America/Chicago<br>${safe(packet.brand.label)} | Metricool brand ${packet.brand.id}<br>Captured: ${safe(packet.capturedAt)}</p>
</td></tr>
<tr><td style="padding:22px 24px;background:#fff5de;border-left:4px solid ${GOLD};"><h2 style="margin:0 0 8px;color:#151515;font-size:24px;line-height:1.2;">Day-to-day movement</h2>${p("Dated daily observations, separate from the week-over-week summary. No daily comparison is inferred when a daily series is missing.")}${movement.map(item => `${p(`${item.date}: ${item.text}`)}${evidence(item.sourceIds)}`).join("")}${p(`Daily missing data: ${packet.dailyMovement.missingData}`)}</td></tr>
${section("Week-over-week summary", `${p(`Report: ${windows.current.start} to ${windows.current.end}. Previous: ${windows.previous.start} to ${windows.previous.end}. Both are completed Monday to Sunday windows in America/Chicago.`)}${p(packet.weeklySummary.text)}${p(`Weekly missing data: ${packet.weeklySummary.missingData}`)}${evidence(packet.weeklySummary.sourceIds)}`)}
${platforms.map(item => section(`${FOUNDATION_PLATFORM_LABELS[item.platform]} | ${item.availability}`, `${p(`Missing data: ${item.missingData}`)}${evidence(item.sourceIds)}<table width="100%" cellspacing="0" cellpadding="0" style="table-layout:fixed;border-collapse:collapse;"><thead><tr><th align="left" style="padding:10px 6px;background:#111111;color:#fffaf0;font-size:12px;">Metric / display value</th><th align="left" style="padding:10px 6px;background:#111111;color:${GOLD};font-size:12px;">Week-over-week comparison</th></tr></thead><tbody>${item.metrics.map(row => `<tr><td style="padding:12px 6px;border-bottom:1px solid #d8d0bd;background:#faf8f2;color:#151515;font-size:13px;line-height:1.5;vertical-align:top;word-break:break-word;"><strong>${safe(row.label)}</strong><br>${safe(row.value)}<br><span style="color:#716a5d;font-size:11px;">Value: ${row.status}</span></td><td style="padding:12px 6px;border-bottom:1px solid #d8d0bd;background:#faf8f2;color:#36332f;font-size:13px;line-height:1.5;vertical-align:top;word-break:break-word;">${safe(row.comparison)}<br><span style="color:#716a5d;font-size:11px;">Comparison: ${row.comparisonStatus}</span>${evidence(row.sourceIds)}</td></tr>`).join("")}</tbody></table>`)).join("")}
${section("Actual post highlights", `${packet.postHighlights.length ? packet.postHighlights.map(item => `${p(`${FOUNDATION_PLATFORM_LABELS[item.platform]} | ${item.publishedDate} | ${item.label}`)}${p(item.observation)}<p style="font-size:13px;line-height:1.5;"><a href="${urlHref(item.permalink)}" style="color:#91600a;">Open actual post</a></p>${p(`Post id: ${item.postId}`)}${evidence(item.sourceIds)}`).join("") : p("No actual post highlights were verified.")}${p(`Highlight missing data: ${packet.highlightsMissingData}`)}`)}
${section("Ideas for Tuesday planning", packet.suggestions.length ? packet.suggestions.map(item => `${p(`Observation: ${item.observation}`)}${p(`Test: ${item.test}`)}${p(`Evaluation: ${item.evaluation}`)}${evidence(item.sourceIds)}`).join("") : p("No evidence-backed test suggestions are supplied."))}
${packet.motivation ? section("Optional motivation", `${p(packet.motivation.title)}${p(packet.motivation.application)}<p style="font-size:13px;"><a href="${urlHref(packet.motivation.url)}" style="color:#91600a;">Open source</a></p>${evidence(packet.motivation.sourceIds)}`) : ""}
${section("Source evidence and coverage", packet.sources.map(source => `${p(`${source.id}: ${source.evidence}`)}${source.url ? `<p style="font-size:12px;word-break:break-word;"><a href="${urlHref(source.url)}" style="color:#91600a;">Source link</a></p>` : ""}`).join(""))}
<tr><td style="padding:22px 24px;background:#111111;color:#c9c5bb;font-size:11px;line-height:1.6;">${safe(disclaimer)}<br><span style="color:${GOLD};">Jeristotle Productions | Private foundation social-performance report</span></td></tr>
</table></td></tr></table></body></html>`;
  const textBody = [
    ...(options.preview ? ["PREVIEW ONLY | No email sent", ""] : []),
    "JERISTOTLE PRODUCTIONS | THE MONDAY PERFORMANCE REPORT",
    subject,
    `Report date: ${packet.reportDate} | America/Chicago`,
    `Foundation brand: ${packet.brand.label} | Metricool ${packet.brand.id} | Captured: ${packet.capturedAt}`,
    "",
    "DAY-TO-DAY MOVEMENT (not week-over-week)",
    ...movement.map(
      item =>
        `${item.date}: ${item.text} | Source ids: ${item.sourceIds.join(", ")}`
    ),
    `Daily missing data: ${packet.dailyMovement.missingData}`,
    "",
    "WEEK-OVER-WEEK SUMMARY",
    `Report: ${windows.current.start} to ${windows.current.end} | Previous: ${windows.previous.start} to ${windows.previous.end} | Completed Monday to Sunday, America/Chicago`,
    packet.weeklySummary.text,
    `Weekly missing data: ${packet.weeklySummary.missingData}`,
    `Source ids: ${packet.weeklySummary.sourceIds.join(", ")}`,
    ...platforms.flatMap(item => [
      "",
      `${FOUNDATION_PLATFORM_LABELS[item.platform]} | ${item.availability}`,
      `Missing data: ${item.missingData} | Source ids: ${item.sourceIds.join(", ")}`,
      ...item.metrics.map(
        row =>
          `${row.label}: ${row.value} (${row.status}) | Week-over-week: ${row.comparison} (${row.comparisonStatus}) | Source ids: ${row.sourceIds.join(", ")}`
      ),
    ]),
    "",
    "ACTUAL POST HIGHLIGHTS",
    ...(packet.postHighlights.length
      ? packet.postHighlights.flatMap(item => [
          `${FOUNDATION_PLATFORM_LABELS[item.platform]} | ${item.publishedDate} | ${item.label} | Post id: ${item.postId}`,
          item.observation,
          new URL(item.permalink).href,
          `Source ids: ${item.sourceIds.join(", ")}`,
        ])
      : ["No actual post highlights were verified."]),
    `Highlight missing data: ${packet.highlightsMissingData}`,
    "",
    "IDEAS FOR TUESDAY PLANNING",
    ...(packet.suggestions.length
      ? packet.suggestions.flatMap(item => [
          `Observation: ${item.observation}`,
          `Test: ${item.test}`,
          `Evaluation: ${item.evaluation}`,
          `Source ids: ${item.sourceIds.join(", ")}`,
        ])
      : ["No evidence-backed test suggestions are supplied."]),
    ...(packet.motivation
      ? [
          "",
          "OPTIONAL MOTIVATION",
          packet.motivation.title,
          new URL(packet.motivation.url).href,
          packet.motivation.application,
          `Source ids: ${packet.motivation.sourceIds.join(", ")}`,
        ]
      : []),
    "",
    "SOURCE EVIDENCE AND COVERAGE",
    ...packet.sources.map(
      source =>
        `${source.id}: ${source.evidence}${source.url ? ` | ${new URL(source.url).href}` : ""}`
    ),
    "",
    disclaimer,
  ].join("\n");
  return {
    packet,
    windows,
    subject,
    html,
    text: socialEmailText(textBody),
    from: SOCIAL_REPORT_SENDER,
    to: SOCIAL_REPORT_RECIPIENT,
    previewOnly: options.preview === true,
  };
}
