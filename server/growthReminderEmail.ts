export interface DigestTask {
  id: number;
  title: string;
  description: string;
  owner: string;
  minutes: number;
  steps: string[];
  doneWhen: string;
  notes: string | null;
  dueDate: string | null;
  status: "not_started" | "in_progress" | "blocked" | "complete";
  pendingDependencies: string[];
}

export interface GrowthReminderEmailData {
  localDate: string;
  dateLabel: string;
  planStartDate: string;
  planDay: number | null;
  planStarted: boolean;
  dailyTaskDate: string;
  dailyTaskIsPreview: boolean;
  state: "prestart" | "preview" | "task" | "finished";
  progress: { complete: number; total: number };
  progressChange?: {
    sinceDate: string;
    previousComplete: number;
    change: number;
  };
  dailyTask: DigestTask | null;
  /** Compatibility alias for older callbacks. Always identical to dailyTask. */
  recommended: DigestTask | null;
}

const TODAY_URL = "https://jeristotleproductions.com/chamber-growth#today";
const JERISTOTLE_EMAIL = "jeremy@jeristotleproductions.com";

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const escapeHtmlWithBreaks = (value: string): string =>
  escapeHtml(value).replace(/\r?\n/g, "<br>");

const displayText = (
  value: string | null | undefined,
  fallback: string
): string => (value && value.trim() ? value : fallback);

const displayMinutes = (minutes: number): string => {
  const normalized = Number.isFinite(minutes)
    ? Math.max(0, Math.round(minutes))
    : 0;
  return `${normalized} min`;
};

const progressSummary = (progress: {
  complete: number;
  total: number;
}): string => {
  const percent =
    progress.total > 0
      ? Math.round((progress.complete / progress.total) * 100)
      : 0;
  return `${progress.complete}/${progress.total} complete, ${percent}%`;
};

const cleanStep = (step: string): string => step.replace(/^\d+[.)]\s*/, "");

function formatDate(date: string): string {
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(parsed.getTime())
    ? date
    : parsed.toLocaleDateString("en-US", {
        timeZone: "America/Chicago",
        month: "long",
        day: "numeric",
        year: "numeric",
      });
}

function taskState(task: DigestTask): {
  label: string;
  detail: string;
  color: string;
} {
  if (task.status === "complete") {
    return {
      label: "Complete",
      detail:
        "This task is marked complete. It remains the selected task in this daily snapshot.",
      color: "#356b39",
    };
  }
  if (task.status === "blocked") {
    return {
      label: "Blocked",
      detail:
        task.pendingDependencies.length > 0
          ? `Waiting on: ${task.pendingDependencies.join("; ")}`
          : "This task is blocked. Record the blocker or resolve it in the app.",
      color: "#8a4f00",
    };
  }
  if (task.status === "in_progress") {
    return {
      label: "In progress",
      detail:
        "Continue this selected task. No additional task is assigned today.",
      color: "#765100",
    };
  }
  return {
    label: "Not started",
    detail: "This is the one task selected for today.",
    color: "#765100",
  };
}

function renderSteps(task: DigestTask): string {
  if (!task.steps.length) {
    return `<p style="margin:0;color:#4f4a42;font-size:14px;line-height:1.6;">No steps supplied.</p>`;
  }
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border:1px solid #eadfbf;background-color:#ffffff;">
    ${task.steps
      .map(
        (step, index) => `<tr>
          <td style="width:28px;padding:10px 0 10px 12px;color:#765100;font-size:12px;font-weight:800;vertical-align:top;">${index + 1}</td>
          <td style="padding:10px 12px 10px 0;color:#302d28;font-size:14px;line-height:1.55;vertical-align:top;">${escapeHtmlWithBreaks(displayText(cleanStep(step), "No step detail supplied."))}</td>
        </tr>`
      )
      .join("")}
  </table>`;
}

function renderTask(data: GrowthReminderEmailData, task: DigestTask): string {
  const state = taskState(task);
  const previewNote = data.dailyTaskIsPreview
    ? `<p style="margin:0 0 12px;color:#765100;font-size:12px;line-height:1.55;">Preview only. This task is scheduled for ${escapeHtml(formatDate(data.dailyTaskDate))}.</p>`
    : "";
  return `<tr>
    <td style="padding:0 22px 22px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#fff8e7;border:1px solid #ead29a;border-left:6px solid #ffb627;">
        <tr><td style="padding:22px 20px 8px;"><p style="margin:0;color:#765100;font-size:10px;font-weight:900;letter-spacing:1.5px;text-transform:uppercase;">${data.dailyTaskIsPreview ? "Task preview" : "Your one task"}</p></td></tr>
        <tr><td style="padding:0 20px 12px;"><h2 style="margin:0;color:#111111;font-size:27px;font-weight:900;letter-spacing:-0.4px;line-height:1.16;">${escapeHtml(displayText(task.title, "Untitled task"))}</h2></td></tr>
        <tr><td style="padding:0 20px 14px;"><p style="margin:0;color:#4a4439;font-size:15px;line-height:1.6;">${escapeHtmlWithBreaks(displayText(task.description, "No task description supplied."))}</p></td></tr>
        <tr><td style="padding:0 20px 14px;">${previewNote}<p style="margin:0;color:${state.color};font-size:12px;font-weight:800;line-height:1.55;">${escapeHtml(state.label)}: ${escapeHtml(state.detail)}</p></td></tr>
        <tr><td style="padding:0 20px 8px;"><p style="margin:0;color:#765100;font-size:10px;font-weight:900;letter-spacing:1.35px;text-transform:uppercase;">Steps</p></td></tr>
        <tr><td style="padding:0 20px 16px;">${renderSteps(task)}</td></tr>
        <tr><td style="padding:0 20px 8px;"><p style="margin:0;color:#765100;font-size:10px;font-weight:900;letter-spacing:1.35px;text-transform:uppercase;">Done when</p></td></tr>
        <tr><td style="padding:0 20px 16px;"><p style="margin:0;color:#111111;font-size:14px;font-weight:800;line-height:1.55;">${escapeHtmlWithBreaks(displayText(task.doneWhen, "No completion condition supplied."))}</p></td></tr>
        <tr><td style="padding:0 20px 20px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;"><tr>
          <td width="50%" style="padding:12px 12px 12px 0;border-top:1px solid #ead29a;vertical-align:top;"><p style="margin:0 0 4px;color:#765100;font-size:10px;font-weight:900;letter-spacing:1.2px;text-transform:uppercase;">Owner</p><p style="margin:0;color:#111111;font-size:13px;font-weight:800;line-height:1.45;">${escapeHtml(displayText(task.owner, "Unassigned"))}</p></td>
          <td width="50%" style="padding:12px 0 12px 12px;border-top:1px solid #ead29a;vertical-align:top;"><p style="margin:0 0 4px;color:#765100;font-size:10px;font-weight:900;letter-spacing:1.2px;text-transform:uppercase;">Time budget</p><p style="margin:0;color:#111111;font-size:13px;font-weight:800;line-height:1.45;">${escapeHtml(displayMinutes(task.minutes))}</p></td>
        </tr></table></td></tr>
        ${task.notes && task.notes.trim() ? `<tr><td style="padding:0 20px 21px;"><p style="margin:0 0 6px;color:#765100;font-size:10px;font-weight:900;letter-spacing:1.35px;text-transform:uppercase;">Working notes</p><p style="margin:0;color:#4a4439;font-size:13px;line-height:1.55;">${escapeHtmlWithBreaks(task.notes)}</p></td></tr>` : ""}
      </table>
    </td>
  </tr>`;
}

function renderNoTask(data: GrowthReminderEmailData): string {
  const content =
    data.state === "prestart"
      ? `This plan starts on ${formatDate(data.planStartDate)}. No daily reminder is due before then.`
      : "All scheduled plan tasks are complete. There is no task to send today.";
  return `<tr><td style="padding:0 22px 22px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#faf8f2;border:1px solid #e5dfd1;"><tr><td style="padding:19px 18px;"><p style="margin:0;color:#111111;font-size:16px;font-weight:800;line-height:1.5;">${escapeHtml(content)}</p></td></tr></table></td></tr>`;
}

/** Builds one deterministic email snapshot without performing database or transport work. */
export function buildGrowthReminderEmail(data: GrowthReminderEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Your one task for ${data.dateLabel}`;
  const task = data.dailyTask;
  const planDay =
    data.planDay === null ? "Plan not started" : `Plan day ${data.planDay}`;
  const movement = data.progressChange
    ? `Since ${data.progressChange.sinceDate}: ${data.progressChange.change === 0 ? "no net change in completed tasks" : `${data.progressChange.change > 0 ? "+" : ""}${data.progressChange.change} completed task${Math.abs(data.progressChange.change) === 1 ? "" : "s"}`}.`
    : "Day-to-day comparison will appear after the first saved delivery baseline.";
  const taskText = task
    ? [
        `${data.dailyTaskIsPreview ? "TASK PREVIEW" : "YOUR ONE TASK"}: ${displayText(task.title, "Untitled task")}`,
        displayText(task.description, "No task description supplied."),
        `${taskState(task).label}: ${taskState(task).detail}`,
        `Owner: ${displayText(task.owner, "Unassigned")}`,
        `Time budget: ${displayMinutes(task.minutes)}`,
        "Steps:",
        ...(task.steps.length
          ? task.steps.map(
              (step, index) =>
                `${index + 1}. ${displayText(cleanStep(step), "No step detail supplied.")}`
            )
          : ["No steps supplied."]),
        `Done when: ${displayText(task.doneWhen, "No completion condition supplied.")}`,
        task.notes && task.notes.trim() ? `Working notes: ${task.notes}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    : data.state === "prestart"
      ? `PLAN NOT STARTED\nThis plan starts on ${formatDate(data.planStartDate)}. No daily reminder is due before then.`
      : "PLAN FINISHED\nAll scheduled plan tasks are complete. There is no task to send today.";

  const html = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
  <body style="margin:0;background-color:#f4f1e9;color:#111111;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#f4f1e9;"><tr><td align="center" style="padding:16px 8px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:620px;background-color:#ffffff;border:1px solid #ded8ca;">
        <tr><td style="height:7px;background-color:#ffb627;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:25px 22px 23px;background-color:#111111;"><p style="margin:0 0 10px;color:#ffcf61;font-size:10px;font-weight:900;letter-spacing:1.8px;text-transform:uppercase;">Jeristotle Productions</p><h1 style="margin:0;color:#ffffff;font-size:32px;font-weight:900;letter-spacing:-0.7px;line-height:1.1;">One thing for today</h1><p style="margin:10px 0 0;color:#e8e4dc;font-size:14px;line-height:1.5;">${escapeHtml(data.dateLabel)}</p></td></tr>
        <tr><td style="padding:19px 22px 15px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#faf8f2;border:1px solid #e5dfd1;"><tr><td style="padding:13px 14px;"><p style="margin:0 0 4px;color:#765100;font-size:10px;font-weight:900;letter-spacing:1.2px;text-transform:uppercase;">${escapeHtml(planDay)}</p><p style="margin:0;color:#111111;font-size:14px;font-weight:800;line-height:1.45;">Plan progress: ${escapeHtml(progressSummary(data.progress))}</p></td></tr></table></td></tr>
        <tr><td style="padding:0 22px 18px;color:#68635a;font-size:12px;line-height:1.6;">${escapeHtml(movement)}</td></tr>
        ${task ? renderTask(data, task) : renderNoTask(data)}
        <tr><td align="center" style="padding:0 22px 14px;"><a href="${TODAY_URL}" style="display:block;background-color:#ffb627;color:#111111;font-size:12px;font-weight:900;letter-spacing:1.25px;padding:16px 18px;text-decoration:none;text-transform:uppercase;">Open today's task</a></td></tr>
        <tr><td style="padding:18px 22px;background-color:#111111;color:#d9d3c8;font-size:11px;line-height:1.6;">From and for ${JERISTOTLE_EMAIL} only. Daily at 8:00 a.m. America/Chicago. This message does not auto-complete work or send outreach.</td></tr>
      </table>
    </td></tr></table>
  </body>
</html>`;

  const text = [
    "ONE THING FOR TODAY",
    data.dateLabel,
    "",
    planDay,
    `Plan progress: ${progressSummary(data.progress)}`,
    movement,
    "",
    taskText,
    "",
    `Open today's task: ${TODAY_URL}`,
    "",
    `From and for ${JERISTOTLE_EMAIL} only.`,
    "Daily at 8:00 a.m. America/Chicago.",
    "This message does not auto-complete work or send outreach.",
  ].join("\n");

  return { subject, html, text };
}
