import type { Request, Response } from "express";
import { JERISTOTLE_EMAIL } from "../shared/const";
import { OUTREACH_READY_BUFFER_TARGET } from "../shared/outreachMaintenance";
import { TRAINING_READY_RESERVE_TARGET } from "../shared/trainingOutreach";
import {
  getCentralWeekWindow,
  getOutreachLocalMoment,
} from "../shared/outreachSchedule";
import { sdk } from "./_core/sdk";
import {
  getChamberOutreachWorkspace,
  getOutreachRecapWindow,
  getOutreachQueueHealth,
  hasOutreachEventSince,
  recordOutreachEvent,
} from "./outreachDb";
import {
  getCreditUnionRecapWindow,
  type CreditUnionRecap,
} from "./creditUnionRecap";
import {
  getBrandVideoRecapWindow,
  type BrandVideoRecap,
} from "./brandVideoRecap";
import { getTrainingRecapWindow, type TrainingRecap } from "./trainingRecap";
import {
  getHustleRecapWindow,
  HUSTLE_RECAP_UNAVAILABLE_MESSAGE,
  type HustleRecap,
} from "./hustleRecap";
import {
  getSectorRecapWindow,
  SECTOR_RECAP_UNAVAILABLE_MESSAGE,
  type SectorRecap,
} from "./sectorRecap";
import { sendJeristotleHtmlEmail } from "./inquiryEmail";

const OUTREACH_PORTAL_URL =
  "https://jeristotleproductions.com/chamber-growth#outreach";
const CREDIT_UNION_PORTAL_URL =
  "https://jeristotleproductions.com/chamber-growth#credit-unions";
const BRAND_VIDEO_PORTAL_URL =
  "https://jeristotleproductions.com/chamber-growth#brand-video";
const TRAINING_PORTAL_URL =
  "https://jeristotleproductions.com/chamber-growth#training";
const HUSTLE_PORTAL_URL =
  "https://jeristotleproductions.com/chamber-growth#hustle";

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export function buildOutreachRecapEmail(input: {
  campaignName: string;
  campaignStatus: string;
  totalProspects: number;
  weekLabel: string;
  newSent: number;
  followupsSent: number;
  replies: number;
  unsubscribes: number;
  errors: number;
  queued: number;
  review: number;
  active: number;
  meetings: number;
  /** Failed research attempts recorded during the recap window. */
  researchFailures?: number;
  /** Approved initial messages that the next daily run can send. */
  readyToSend?: number;
  eligibleQueued?: number;
  bufferTarget?: number;
  /** Runs still left in the `started` state at recap time. */
  incompleteRuns?: number;
  /** The newest daily run in the recap window, if one exists. */
  lastRun?: {
    runDate?: string;
    status?: string;
    summary?: string | null;
  } | null;
  /** Read-only campaign reporting; omitted for backwards-compatible Chamber-only recaps. */
  creditUnionRecap?: CreditUnionRecap;
  /** Read-only Brand Video reporting; it cannot initialize or send a campaign. */
  brandVideoRecap?: BrandVideoRecap;
  /** Read-only Training & Knowledge Capture reporting; it never creates drafts or sends. */
  trainingRecap?: TrainingRecap;
  /** Optional SELECT-only Hustle reporting, including draft/review campaigns. */
  hustleRecap?: HustleRecap;
  /** Optional SELECT-only four-sector reporting; never initializes or sends. */
  sectorRecap?: SectorRecap;
}) {
  const totalSent = input.newSent + input.followupsSent;
  const replyRate = totalSent
    ? Math.round((input.replies / totalSent) * 100)
    : 0;
  const researchFailures = input.researchFailures ?? 0;
  const readyToSend = input.readyToSend;
  const incompleteRuns = input.incompleteRuns ?? 0;
  const campaignIsActive = input.campaignStatus === "active";
  const warnings = [
    ...(campaignIsActive && totalSent === 0
      ? [
          "Warning: the campaign is active, but no sent message events were recorded this week.",
        ]
      : []),
    ...(campaignIsActive && readyToSend === 0
      ? [
          "Warning: the campaign is active, but no approved initial messages are ready to send.",
        ]
      : []),
    ...(campaignIsActive &&
    input.eligibleQueued !== undefined &&
    input.eligibleQueued + (readyToSend ?? 0) < 25
      ? [
          "Warning: fewer than 25 verified queued or ready prospects remain. Replenish source-backed contacts before the campaign runs out.",
        ]
      : []),
  ];
  const lastRunStatus = input.lastRun?.status || "No run recorded";
  const lastRunSummary =
    input.lastRun?.summary?.trim() ||
    "No daily run was recorded in this recap window.";
  const creditUnionCampaigns =
    input.creditUnionRecap?.state === "available"
      ? input.creditUnionRecap.campaigns
      : [];
  const creditUnionSmtpAccepted = creditUnionCampaigns.reduce(
    (total, campaign) =>
      total + campaign.newSmtpAccepted + campaign.followupSmtpAccepted,
    0
  );
  const brandVideoCampaigns =
    input.brandVideoRecap?.state === "available"
      ? input.brandVideoRecap.campaigns
      : [];
  const brandVideoSmtpAccepted = brandVideoCampaigns.reduce(
    (total, campaign) =>
      total + campaign.newSmtpAccepted + campaign.followupSmtpAccepted,
    0
  );
  const trainingCampaigns =
    input.trainingRecap?.state === "available"
      ? input.trainingRecap.campaigns
      : [];
  const trainingSmtpAccepted = trainingCampaigns.reduce(
    (total, campaign) =>
      total + campaign.newSmtpAccepted + campaign.followupSmtpAccepted,
    0
  );
  const hustleCampaigns =
    input.hustleRecap?.state === "available" ? input.hustleRecap.campaigns : [];
  const hustleSmtpAccepted = hustleCampaigns.reduce(
    (total, campaign) => total + campaign.newSmtpAccepted + campaign.followupSmtpAccepted,
    0
  );
  const sectorCampaigns = input.sectorRecap?.state === "available"
    ? input.sectorRecap.campaigns : [];
  const sectorLabels = {
    tourism: "Tourism", real_estate: "Real estate", industrial: "Industrial", healthcare: "Healthcare",
  };
  const subjectParts = [
    `Chamber ${totalSent} sent, ${input.replies} replies`,
    ...(creditUnionCampaigns.length
      ? [`Credit unions ${creditUnionSmtpAccepted} SMTP accepted`]
      : []),
    ...(brandVideoCampaigns.length
      ? [`Brand Video ${brandVideoSmtpAccepted} SMTP accepted`]
      : []),
    ...(input.trainingRecap?.state === "available"
      ? [`Training ${trainingSmtpAccepted} SMTP accepted`]
      : []),
    ...(hustleCampaigns.length
      ? [`Hustle ${hustleSmtpAccepted} SMTP accepted`]
      : []),
    ...sectorCampaigns.map(campaign =>
      `${sectorLabels[campaign.campaignKey]} ${campaign.newSmtpAccepted + campaign.followupSmtpAccepted} SMTP accepted`
    ),
  ];
  const subject =
    subjectParts.length > 1
      ? `Weekly outreach recap: ${subjectParts.join(" · ")}`
      : `Weekly Chamber outreach recap: ${totalSent} sent, ${input.replies} replies`;
  const stat = (label: string, value: string | number) => `
    <td width="25%" style="padding:17px 14px;background:#fff8e7;border:4px solid #ffffff;vertical-align:top;">
      <p style="margin:0;color:#9b6a00;font-size:9px;font-weight:900;letter-spacing:1.4px;text-transform:uppercase;">${escapeHtml(label)}</p>
      <p style="margin:7px 0 0;color:#111111;font-size:25px;font-weight:900;line-height:1;">${escapeHtml(String(value))}</p>
    </td>`;
  const creditUnionSection =
    input.creditUnionRecap?.state === "unavailable"
      ? `<tr><td style="padding:0 40px 32px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fff1ee;border:1px solid #e4a79b;">
            <tr><td style="padding:22px 24px;">
              <p style="margin:0 0 10px;color:#a03322;font-size:10px;font-weight:900;letter-spacing:1.6px;text-transform:uppercase;">Credit-union recap unavailable</p>
              <p style="margin:0;color:#5d241b;font-size:14px;line-height:1.6;">The Chamber recap was generated, but credit-union metrics could not be read: ${escapeHtml(input.creditUnionRecap.error)}</p>
            </td></tr>
          </table>
        </td></tr>`
      : creditUnionCampaigns
          .map(campaign => {
            const smtpAccepted =
              campaign.newSmtpAccepted + campaign.followupSmtpAccepted;
            const replyRate = campaign.initialRecipients
              ? Math.round(
                  (campaign.distinctReplies / campaign.initialRecipients) * 100
                )
              : 0;
            const activity = campaign.lastActivity
              ? `<p style="margin:10px 0 0;color:#6c665c;font-size:13px;line-height:1.6;"><strong>Latest maintenance/run:</strong> ${escapeHtml(campaign.lastActivity.eventType)} &nbsp;·&nbsp; ${escapeHtml(campaign.lastActivity.occurredAt.toLocaleString("en-US"))}${campaign.lastActivity.detail ? ` — ${escapeHtml(campaign.lastActivity.detail)}` : ""}</p>`
              : `<p style="margin:10px 0 0;color:#6c665c;font-size:13px;line-height:1.6;">No recorded maintenance or run activity is available.</p>`;
            return `<tr><td style="padding:0 40px 32px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef7fb;border:1px solid #b8d7e5;">
              <tr><td style="padding:22px 24px;">
                <p style="margin:0 0 10px;color:#17627d;font-size:10px;font-weight:900;letter-spacing:1.6px;text-transform:uppercase;">Credit-union campaign</p>
                <p style="margin:0;color:#25231f;font-size:15px;line-height:1.7;"><strong>${escapeHtml(campaign.campaignName)}</strong> &nbsp;·&nbsp; ${escapeHtml(campaign.campaignStatus)}</p>
                <p style="margin:10px 0 0;color:#25231f;font-size:14px;line-height:1.7;"><strong>${campaign.newSmtpAccepted}</strong> new SMTP accepted &nbsp;·&nbsp; <strong>${campaign.followupSmtpAccepted}</strong> follow-up SMTP accepted &nbsp;·&nbsp; <strong>${smtpAccepted}</strong> total SMTP accepted</p>
                <p style="margin:8px 0 0;color:#6c665c;font-size:13px;line-height:1.6;">SMTP acceptance is not guaranteed delivery.</p>
                <p style="margin:10px 0 0;color:#25231f;font-size:14px;line-height:1.7;"><strong>${campaign.distinctReplies}</strong> distinct replies &nbsp;·&nbsp; <strong>${replyRate}%</strong> reply rate (${campaign.initialRecipients} initial recipients) &nbsp;·&nbsp; <strong>${campaign.distinctMeetings}</strong> meetings</p>
                <p style="margin:8px 0 0;color:#25231f;font-size:14px;line-height:1.7;"><strong>${campaign.distinctOptOuts}</strong> opt-outs &nbsp;·&nbsp; <strong>${campaign.distinctBounces}</strong> bounces &nbsp;·&nbsp; <strong>${campaign.distinctErrorEvents}</strong> error events</p>
                <p style="margin:10px 0 0;color:#25231f;font-size:14px;line-height:1.7;"><strong>${campaign.ready}</strong> ready &nbsp;·&nbsp; <strong>${campaign.verificationNeeded}</strong> verification needed &nbsp;·&nbsp; <strong>${campaign.inSequence}</strong> in sequence</p>
                ${activity}
              </td></tr>
            </table>
          </td></tr>`;
          })
          .join("");
  const brandVideoSection =
    input.brandVideoRecap?.state === "unavailable"
      ? `<tr><td style="padding:0 40px 32px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fff1ee;border:1px solid #e4a79b;">
            <tr><td style="padding:22px 24px;">
              <p style="margin:0 0 10px;color:#a03322;font-size:10px;font-weight:900;letter-spacing:1.6px;text-transform:uppercase;">Brand Video recap unavailable</p>
              <p style="margin:0;color:#5d241b;font-size:14px;line-height:1.6;">The main recap was generated, but Brand Video metrics could not be read: ${escapeHtml(input.brandVideoRecap.error)}</p>
            </td></tr>
          </table>
        </td></tr>`
      : brandVideoCampaigns
          .map(campaign => {
            const smtpAccepted =
              campaign.newSmtpAccepted + campaign.followupSmtpAccepted;
            const replyRate = campaign.initialRecipients
              ? Math.round(
                  (campaign.distinctReplies / campaign.initialRecipients) * 100
                )
              : 0;
            const activity = campaign.lastActivity
              ? `<p style="margin:10px 0 0;color:#6c665c;font-size:13px;line-height:1.6;"><strong>Latest maintenance/run:</strong> ${escapeHtml(campaign.lastActivity.eventType)} &nbsp;·&nbsp; ${escapeHtml(campaign.lastActivity.occurredAt.toLocaleString("en-US"))}${campaign.lastActivity.detail ? ` — ${escapeHtml(campaign.lastActivity.detail)}` : ""}</p>`
              : `<p style="margin:10px 0 0;color:#6c665c;font-size:13px;line-height:1.6;">No recorded maintenance or run activity is available.</p>`;
            return `<tr><td style="padding:0 40px 32px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fff8e7;border:1px solid #ddc789;">
              <tr><td style="padding:22px 24px;">
                <p style="margin:0 0 10px;color:#9b6a00;font-size:10px;font-weight:900;letter-spacing:1.6px;text-transform:uppercase;">Professional Brand Video campaign</p>
                <p style="margin:0;color:#25231f;font-size:15px;line-height:1.7;"><strong>${escapeHtml(campaign.campaignName)}</strong> &nbsp;·&nbsp; ${escapeHtml(campaign.campaignStatus)}</p>
                <p style="margin:10px 0 0;color:#25231f;font-size:14px;line-height:1.7;"><strong>${campaign.newSmtpAccepted}</strong> new SMTP accepted &nbsp;·&nbsp; <strong>${campaign.followupSmtpAccepted}</strong> follow-up SMTP accepted &nbsp;·&nbsp; <strong>${smtpAccepted}</strong> total SMTP accepted</p>
                <p style="margin:8px 0 0;color:#6c665c;font-size:13px;line-height:1.6;">SMTP acceptance is not guaranteed delivery.</p>
                <p style="margin:10px 0 0;color:#25231f;font-size:14px;line-height:1.7;"><strong>${campaign.distinctReplies}</strong> distinct replies &nbsp;·&nbsp; <strong>${replyRate}%</strong> reply rate (${campaign.initialRecipients} initial recipients) &nbsp;·&nbsp; <strong>${campaign.distinctMeetings}</strong> meetings</p>
                <p style="margin:8px 0 0;color:#25231f;font-size:14px;line-height:1.7;"><strong>${campaign.distinctOptOuts}</strong> opt-outs &nbsp;·&nbsp; <strong>${campaign.distinctBounces}</strong> bounces &nbsp;·&nbsp; <strong>${campaign.distinctErrorEvents}</strong> error events</p>
                <p style="margin:10px 0 0;color:#25231f;font-size:14px;line-height:1.7;"><strong>${campaign.ready}</strong> ready &nbsp;·&nbsp; <strong>${campaign.reviewPending}</strong> pending review &nbsp;·&nbsp; <strong>${campaign.inSequence}</strong> in sequence</p>
                ${activity}
              </td></tr>
            </table>
          </td></tr>`;
          })
          .join("");
  const trainingSection =
    input.trainingRecap?.state === "unavailable"
      ? `<tr><td style="padding:0 40px 32px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fff1ee;border:1px solid #e4a79b;">
            <tr><td style="padding:22px 24px;">
              <p style="margin:0 0 10px;color:#a03322;font-size:10px;font-weight:900;letter-spacing:1.6px;text-transform:uppercase;">Training recap unavailable</p>
              <p style="margin:0;color:#5d241b;font-size:14px;line-height:1.6;">The Chamber recap was generated, but Training &amp; Knowledge Capture metrics could not be read: ${escapeHtml(input.trainingRecap.error)}</p>
            </td></tr>
          </table>
        </td></tr>`
      : trainingCampaigns
          .map(campaign => {
            const smtpAccepted =
              campaign.newSmtpAccepted + campaign.followupSmtpAccepted;
            const replyRate = campaign.initialRecipients
              ? Math.round(
                  (campaign.distinctReplies / campaign.initialRecipients) * 100
                )
              : 0;
            const run = campaign.lastRun
              ? `<p style="margin:10px 0 0;color:#25231f;font-size:13px;line-height:1.6;"><strong>Recorded daily totals (${escapeHtml(campaign.lastRun.runDate)}):</strong> ${campaign.lastRun.newSent} initial and ${campaign.lastRun.followupsSent} follow-up SMTP acceptance${campaign.lastRun.newSent + campaign.lastRun.followupsSent === 1 ? "" : "s"}. Persisted status: ${escapeHtml(campaign.lastRun.status)}.</p>${campaign.lastRun.summary ? `<p style="margin:8px 0 0;color:#6c665c;font-size:13px;line-height:1.6;"><strong>Latest stored summary (may describe one tick, not daily totals):</strong> ${escapeHtml(campaign.lastRun.summary)}</p>` : ""}`
              : `<p style="margin:10px 0 0;color:#6c665c;font-size:13px;line-height:1.6;"><strong>Recorded daily totals:</strong> No persisted daily run is available.</p>`;
            const inbox = campaign.lastReplyCheckAt
              ? `Latest inbox scan: ${escapeHtml(campaign.lastReplyCheckAt.toLocaleString("en-US"))}.`
              : "Latest inbox scan: no persisted scan is available.";
            const research = campaign.researchActivity
              ? `${campaign.researchConfigured ? "Research configured" : "Research not connected"}; latest persisted research activity: ${escapeHtml(campaign.researchActivity.eventType)} (${escapeHtml(campaign.researchActivity.occurredAt.toLocaleString("en-US"))})${campaign.researchActivity.detail ? ` — ${escapeHtml(campaign.researchActivity.detail)}` : ""}.`
              : campaign.researchConfigured
                ? "Research configured; no persisted research activity is available."
                : "Research not connected; no persisted research activity is available.";
            return `<tr><td style="padding:0 40px 32px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f5ff;border:1px solid #cec8e9;">
                <tr><td style="padding:22px 24px;">
                  <p style="margin:0 0 10px;color:#5b4a98;font-size:10px;font-weight:900;letter-spacing:1.6px;text-transform:uppercase;">Internal Training &amp; Knowledge Capture</p>
                  <p style="margin:0;color:#25231f;font-size:15px;line-height:1.7;"><strong>${escapeHtml(campaign.campaignName)}</strong> &nbsp;·&nbsp; ${escapeHtml(campaign.campaignStatus)}</p>
                  <p style="margin:10px 0 0;color:#25231f;font-size:14px;line-height:1.7;"><strong>${campaign.newSmtpAccepted}</strong> initial SMTP accepted &nbsp;·&nbsp; <strong>${campaign.followupSmtpAccepted}</strong> follow-up SMTP accepted &nbsp;·&nbsp; <strong>${smtpAccepted}</strong> total SMTP accepted</p>
                  <p style="margin:8px 0 0;color:#6c665c;font-size:13px;line-height:1.6;">SMTP acceptance is not guaranteed delivery.</p>
                  <p style="margin:10px 0 0;color:#25231f;font-size:14px;line-height:1.7;"><strong>${campaign.distinctReplies}</strong> distinct replies &nbsp;·&nbsp; <strong>${replyRate}%</strong> reply rate (${campaign.initialRecipients} initial recipients) &nbsp;·&nbsp; <strong>${campaign.distinctMeetings}</strong> meetings</p>
                  <p style="margin:8px 0 0;color:#25231f;font-size:14px;line-height:1.7;"><strong>${campaign.distinctOptOuts}</strong> opt-outs &nbsp;·&nbsp; <strong>${campaign.distinctBounces}</strong> bounces &nbsp;·&nbsp; <strong>${campaign.distinctErrorEvents}</strong> error events</p>
                  <p style="margin:8px 0 0;color:#25231f;font-size:14px;line-height:1.7;"><strong>${campaign.currentClosed}</strong> closed &nbsp;·&nbsp; <strong>${campaign.currentNotClosed}</strong> not closed &nbsp;·&nbsp; weekly outcome updates: <strong>${campaign.distinctClosedOutcomes}</strong> closed / <strong>${campaign.distinctNotClosedOutcomes}</strong> not closed</p>
                  <p style="margin:10px 0 0;color:#25231f;font-size:14px;line-height:1.7;"><strong>${campaign.readyReserve}/${TRAINING_READY_RESERVE_TARGET}</strong> ready reserve &nbsp;·&nbsp; <strong>${campaign.reviewPending}</strong> pending review &nbsp;·&nbsp; <strong>${campaign.inSequence}</strong> in sequence</p>
                  ${run}
                  <p style="margin:8px 0 0;color:#6c665c;font-size:13px;line-height:1.6;">${inbox}</p>
                  <p style="margin:8px 0 0;color:#6c665c;font-size:13px;line-height:1.6;">${research}</p>
                  <p style="margin:8px 0 0;color:#6c665c;font-size:13px;line-height:1.6;">${campaign.researchLastRequestedAt ? `Latest research request: ${escapeHtml(campaign.researchLastRequestedAt.toLocaleString("en-US"))}.` : "Latest research request: no persisted request is available."}</p>
                </td></tr>
              </table>
            </td></tr>`;
          })
          .join("");

  // Use one escaped line set for HTML and text; never render raw errors, event
  // detail JSON, private research URLs, SMTP credentials, or scheduler tokens.
  const hustleLines = hustleCampaigns.flatMap(campaign => {
    const launchState = campaign.campaignStatus === "review"
      ? "Draft/review state; outreach is not active. Owner launch review is required."
      : campaign.campaignStatus === "paused"
        ? "Paused; outreach is not active."
        : campaign.launchApproved
          ? "Recorded active status; launch approved. Scheduler execution and delivery are not verified by this recap."
          : "Recorded active status; launch approval is missing. Sending is blocked.";
    return [
      `Campaign: ${campaign.campaignName}`,
      `Campaign status: ${campaign.campaignStatus}`,
      launchState,
      `Launch approved: ${campaign.launchApproved ? "Yes" : "No"}`,
      "Weekly activity (recap window):",
      `Initial SMTP accepted: ${campaign.newSmtpAccepted}`,
      `Follow-up SMTP accepted: ${campaign.followupSmtpAccepted}`,
      `Total SMTP accepted: ${campaign.newSmtpAccepted + campaign.followupSmtpAccepted}`,
      "Distinct persisted message receipts; SMTP acceptance is not guaranteed delivery.",
      `Initial recipients: ${campaign.initialRecipients}`,
      `Distinct replies (includes automatic/OOO): ${campaign.distinctReplies}`,
      `Distinct OOO replies: ${campaign.distinctOutOfOfficeReplies ?? "Not separately classified in the persisted reply ledger"}`,
      `Distinct opt-outs: ${campaign.distinctOptOuts}`,
      `Distinct bounces: ${campaign.distinctBounces}`,
      `Recorded events: ${campaign.weeklyEvents}; error/failure/uncertain events: ${campaign.weeklyErrorEvents}`,
      "Current persisted pipeline (not weekly changes):",
      `Prospects: ${campaign.totalProspects}`,
      `Ready reserve: ${campaign.readyReserve}/${campaign.reserveTarget}; review holds: ${campaign.reviewHolds}`,
      "Ready reserve is prepared inventory, not authorization to send. Final qualification, suppression, launch, schedule and capacity checks still apply.",
      `Draft messages: ${campaign.draftMessages}; uncertain messages awaiting inspection: ${campaign.uncertainMessages}`,
      `2027 episode slots recorded: ${campaign.episodeSlots2027}; campaign goal: ${campaign.episodeGoal}`,
      `2027 slots reserved: ${campaign.reservedEpisodeSlots2027}; confirmed: ${campaign.confirmedEpisodeSlots2027}`,
      "Reserved slots are not signed agreements. Confirmed counts reflect stored slot status, not independently verified contracts.",
      `Research connection configured: ${campaign.researchConnected ? "Yes" : "No"}`,
      `Sender schedule connected: ${campaign.senderScheduleConnected ? "Yes" : "No"}`,
      `Sender SMTP configured: ${campaign.senderConfigured ? "Yes" : "No"} (local preflight only; connection not tested)`,
      campaign.researchRequestedAt
        ? `Latest persisted research request: ${campaign.researchRequestedAt.toISOString()}`
        : "Latest persisted research request: Not recorded",
      campaign.lastInboxScanAt
        ? `Latest persisted inbox scan: ${campaign.lastInboxScanAt.toISOString()}`
        : "Latest persisted inbox scan: Not recorded",
    ];
  });
  const hustleUnavailable = input.hustleRecap?.state === "unavailable";
  const hustleSection = hustleUnavailable || hustleCampaigns.length
    ? `<tr><td style="padding:0 40px 32px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${hustleUnavailable ? "#fff1ee" : "#eff8f4"};border:1px solid #b8d7c8;">
          <tr><td style="padding:22px 24px;">
            <p style="margin:0 0 10px;color:#21664d;font-size:10px;font-weight:900;letter-spacing:1.6px;text-transform:uppercase;">Corpus Christi Hustle${hustleUnavailable ? " recap unavailable" : " · episode sponsorship"}</p>
            ${(hustleUnavailable ? [HUSTLE_RECAP_UNAVAILABLE_MESSAGE] : hustleLines).map(line => `<p style="margin:8px 0 0;color:#25231f;font-size:13px;line-height:1.6;">${escapeHtml(line)}</p>`).join("")}
            <p style="margin:16px 0 0;"><a href="${HUSTLE_PORTAL_URL}" style="color:#21664d;font-weight:900;">Open Corpus Christi Hustle →</a></p>
          </td></tr>
        </table>
      </td></tr>`
    : "";

  const sectorPortalUrl = "https://jeristotleproductions.com/chamber-growth#sectors";
  const sectorUnavailable = input.sectorRecap?.state === "unavailable";
  const sectorGroup = input.sectorRecap?.state === "available" ? input.sectorRecap.group : null;
  const sectorLines = sectorCampaigns.flatMap(campaign => [
    `Campaign: ${campaign.campaignName}`,
    `Campaign key: ${campaign.campaignKey}; campaign status: ${campaign.campaignStatus}`,
    `Group status: ${sectorGroup?.status}; approval recorded: ${sectorGroup?.approved ? "Yes" : "No"}; sending enabled: ${sectorGroup?.sendingEnabled ? "Yes" : "No"}`,
    campaign.campaignStatus === "review" || sectorGroup?.status === "review"
      ? "Draft/review state; outreach is not active."
      : campaign.campaignStatus === "paused" || sectorGroup?.status === "paused"
        ? "Paused; outreach is not active."
        : "Recorded active status; execution and delivery are not verified by this recap.",
    `Persisted NEW limit: ${campaign.dailyNewLimit}/day per campaign; seven-day sending: ${sectorGroup?.sendSevenDays ? "Yes" : "No"}; cap scope: ${sectorGroup?.capScope}; follow-ups included in NEW budget: ${sectorGroup?.includesFollowups ? "Yes" : "No (additional)"}`,
    "Weekly activity (same recap window; inclusive start, exclusive end):",
    `Initial SMTP accepted: ${campaign.newSmtpAccepted}`,
    `Follow-up SMTP accepted: ${campaign.followupSmtpAccepted}`,
    `Total SMTP accepted: ${campaign.newSmtpAccepted + campaign.followupSmtpAccepted}`,
    "Distinct persisted message receipts; SMTP acceptance is not inbox delivery or guaranteed delivery.",
    `Initial recipients: ${campaign.initialRecipients}; distinct contacted prospects: ${campaign.distinctContactedProspects}`,
    `Distinct replies (includes automatic/OOO): ${campaign.distinctReplies}`,
    `Distinct OOO replies: ${campaign.distinctOutOfOfficeReplies ?? "Not separately classified in the persisted reply ledger"}`,
    `Distinct opt-outs: ${campaign.distinctOptOuts}; distinct bounces: ${campaign.distinctBounces}`,
    `Distinct weekly meetings: ${campaign.distinctMeetings ?? "Unavailable: no prospect-linked meeting event ledger"}`,
    `Recorded events: ${campaign.weeklyEvents}; error/failure/uncertain events: ${campaign.weeklyErrorEvents}; uncertain events: ${campaign.weeklyUncertainEvents}`,
    `Errored messages attempted this week: ${campaign.weeklyErroredMessages}; currently uncertain messages attempted this week: ${campaign.weeklyUncertainMessages}`,
    "Event and message counts overlap and must not be added. Message error/uncertainty counts reflect current persisted state, not a complete transition history.",
    "Current persisted pipeline (not weekly changes):",
    `Prospects: ${campaign.totalProspects}; current meeting status: ${campaign.currentMeetings}`,
    `Ready reserve: ${campaign.readyReserve}/${campaign.reserveTarget}; pending review: ${campaign.reviewPending}; verification needed: ${campaign.verificationNeeded}; in sequence: ${campaign.inSequence}`,
    "Ready reserve counts distinct qualified, verified prospects with due approved initial messages, no unresolved template tokens and no prior initial attempt. It is prepared inventory, not authorization to send; final suppression, schedule and capacity checks still apply.",
    `Draft messages: ${campaign.draftMessages}; uncertain messages awaiting inspection: ${campaign.uncertainMessages}`,
    `Closed / not closed: Unavailable (no sales-outcome ledger); outcome unknown: ${campaign.outcomeUnknown}`,
    "Unread replies: Unavailable (not recorded). Open/click tracking: Not built; no open/click metrics are reported.",
    `Research enabled: ${sectorGroup?.researchEnabled ? "Yes" : "No"}; research connection configured: ${sectorGroup?.researchConnected ? "Yes" : "No"}; sender schedule connected: ${campaign.senderScheduleConnected ? "Yes" : "No"} (persisted bindings only; not live connectivity checks)`,
    campaign.lastInboxScanAt
      ? `Latest persisted inbox scan: ${campaign.lastInboxScanAt.toISOString()}`
      : "Latest persisted inbox scan: Not recorded",
    campaign.researchActivity
      ? `Latest persisted research/import activity: ${campaign.researchActivity.eventType} (${campaign.researchActivity.occurredAt.toISOString()})`
      : "Latest persisted research/import activity: Not recorded",
    campaign.lastActivity
      ? `Latest persisted activity: ${campaign.lastActivity.eventType} (${campaign.lastActivity.occurredAt.toISOString()})`
      : "Latest persisted activity: Not recorded",
  ]);
  // Do not render raw errors, receipt/detail JSON, private URLs or scheduler IDs.
  const sectorSection = sectorUnavailable || sectorCampaigns.length
    ? `<tr><td style="padding:0 40px 32px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${sectorUnavailable ? "#fff1ee" : "#eef7fb"};border:1px solid #b8d7e5;">
          <tr><td style="padding:22px 24px;">
            <p style="margin:0 0 10px;color:#17627d;font-size:10px;font-weight:900;letter-spacing:1.6px;text-transform:uppercase;">Four-sector outreach${sectorUnavailable ? " recap unavailable" : " · campaign metrics"}</p>
            ${(sectorUnavailable ? [SECTOR_RECAP_UNAVAILABLE_MESSAGE] : sectorLines).map(line => `<p style="margin:8px 0 0;color:#25231f;font-size:13px;line-height:1.6;">${escapeHtml(line)}</p>`).join("")}
            <p style="margin:16px 0 0;"><a href="${sectorPortalUrl}" style="color:#17627d;font-weight:900;">Open the four-sector campaigns →</a></p>
          </td></tr>
        </table>
      </td></tr>`
    : "";

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;background:#f4f1e9;color:#181818;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#f4f1e9;padding:28px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:680px;background:#ffffff;border:1px solid #ded8ca;">
          <tr><td style="height:8px;background:#ffb627;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td style="padding:38px 40px 22px;">
            <p style="margin:0 0 10px;color:#9b6a00;font-size:10px;font-weight:900;letter-spacing:2px;text-transform:uppercase;">Jeristotle Productions · Chamber Outreach</p>
            <h1 style="margin:0;color:#111111;font-size:36px;line-height:1.04;letter-spacing:-1px;">Your Saturday pipeline recap.</h1>
            <p style="margin:15px 0 0;color:#6c665c;font-size:15px;line-height:1.6;">${escapeHtml(input.weekLabel)}</p>
          </td></tr>
          <tr><td style="padding:0 36px 16px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
              ${stat("Total sent", totalSent)}
              ${stat("New", input.newSent)}
              ${stat("Follow-ups", input.followupsSent)}
              ${stat("Replies", input.replies)}
            </tr></table>
          </td></tr>
	          <tr><td style="padding:0 36px 28px;">
	            <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
              ${stat("Reply rate", `${replyRate}%`)}
              ${stat("Meetings", input.meetings)}
              ${stat("Opt-outs", input.unsubscribes)}
              ${stat("Errors", input.errors)}
	            </tr></table>
	          </td></tr>
	          <tr><td style="padding:0 36px 28px;">
	            <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
	              ${stat("Research failures", researchFailures)}
	              ${stat("Ready to send", readyToSend ?? "Not reported")}
	              ${stat("Incomplete runs", incompleteRuns)}
	            </tr></table>
	          </td></tr>
	          ${
              warnings.length
                ? `<tr><td style="padding:0 40px 28px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fff1ee;border:1px solid #e4a79b;">
                    <tr><td style="padding:18px 22px;">
                      <p style="margin:0 0 8px;color:#a03322;font-size:10px;font-weight:900;letter-spacing:1.6px;text-transform:uppercase;">Operational warning</p>
                      ${warnings
                        .map(
                          warning =>
                            `<p style="margin:6px 0 0;color:#5d241b;font-size:14px;line-height:1.55;">${escapeHtml(warning)}</p>`
                        )
                        .join("")}
                    </td></tr>
                  </table>
                </td></tr>`
                : ""
            }
	          <tr><td style="padding:0 40px 32px;">
	            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8f6f0;border:1px solid #e5dfd1;">
	              <tr><td style="padding:22px 24px;">
                <p style="margin:0 0 12px;color:#9b6a00;font-size:10px;font-weight:900;letter-spacing:1.6px;text-transform:uppercase;">Campaign segment</p>
                <p style="margin:0;color:#25231f;font-size:15px;line-height:1.7;"><strong>${escapeHtml(input.campaignName)}</strong> &nbsp;·&nbsp; ${escapeHtml(input.campaignStatus)} &nbsp;·&nbsp; <strong>${input.totalProspects}</strong> qualified Chamber members</p>
              </td></tr>
            </table>
          </td></tr>
          <tr><td style="padding:0 40px 32px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8f6f0;border:1px solid #e5dfd1;">
              <tr><td style="padding:22px 24px;">
                <p style="margin:0 0 12px;color:#9b6a00;font-size:10px;font-weight:900;letter-spacing:1.6px;text-transform:uppercase;">Current pipeline</p>
                <p style="margin:0;color:#25231f;font-size:15px;line-height:1.7;"><strong>${input.queued}</strong> queued for research &nbsp;·&nbsp; <strong>${input.review}</strong> awaiting review &nbsp;·&nbsp; <strong>${input.active}</strong> in sequence</p>
                ${input.eligibleQueued !== undefined ? `<p style="margin:8px 0 0;color:#6c665c;font-size:13px;line-height:1.6;">${input.eligibleQueued} source-backed contacts available; ready reserve ${readyToSend ?? 0}/${input.bufferTarget ?? OUTREACH_READY_BUFFER_TARGET}. The app tops up the reserve automatically during scheduled maintenance.</p>` : ""}
              </td></tr>
	            </table>
	          </td></tr>
	          <tr><td style="padding:0 40px 32px;">
	            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8f6f0;border:1px solid #e5dfd1;">
	              <tr><td style="padding:22px 24px;">
	                <p style="margin:0 0 12px;color:#9b6a00;font-size:10px;font-weight:900;letter-spacing:1.6px;text-transform:uppercase;">Latest daily run</p>
	                <p style="margin:0;color:#25231f;font-size:15px;line-height:1.7;"><strong>${escapeHtml(lastRunStatus)}</strong>${input.lastRun?.runDate ? ` &nbsp;·&nbsp; ${escapeHtml(input.lastRun.runDate)}` : ""}</p>
	                <p style="margin:8px 0 0;color:#6c665c;font-size:13px;line-height:1.6;">${escapeHtml(lastRunSummary)}</p>
	              </td></tr>
	            </table>
	          </td></tr>
	          ${creditUnionSection}
	          ${brandVideoSection}
	          ${trainingSection}${hustleSection}${sectorSection}
	          <tr><td align="center" style="padding:0 40px 40px;">
	            <a href="${OUTREACH_PORTAL_URL}" style="display:block;background:#ffb627;color:#000000;font-size:13px;font-weight:900;letter-spacing:1.4px;padding:18px 22px;text-decoration:none;text-transform:uppercase;">Open the outreach pipeline →</a>
	          </td></tr>
	          ${creditUnionCampaigns.length ? `<tr><td align="center" style="padding:0 40px 40px;"><a href="${CREDIT_UNION_PORTAL_URL}" style="display:block;background:#17627d;color:#ffffff;font-size:13px;font-weight:900;letter-spacing:1.4px;padding:18px 22px;text-decoration:none;text-transform:uppercase;">Open the credit-union campaign →</a></td></tr>` : ""}
	          ${brandVideoCampaigns.length ? `<tr><td align="center" style="padding:0 40px 40px;"><a href="${BRAND_VIDEO_PORTAL_URL}" style="display:block;background:#9b6a00;color:#ffffff;font-size:13px;font-weight:900;letter-spacing:1.4px;padding:18px 22px;text-decoration:none;text-transform:uppercase;">Open the Brand Video campaign →</a></td></tr>` : ""}
	          ${trainingCampaigns.length ? `<tr><td align="center" style="padding:0 40px 40px;"><a href="${TRAINING_PORTAL_URL}" style="display:block;background:#5b4a98;color:#ffffff;font-size:13px;font-weight:900;letter-spacing:1.4px;padding:18px 22px;text-decoration:none;text-transform:uppercase;">Open Training &amp; Knowledge Capture →</a></td></tr>` : ""}
	          <tr><td style="padding:20px 40px;background:#fbfaf7;border-top:1px solid #e5dfd1;color:#817b71;font-size:11px;line-height:1.6;">Sent automatically every Saturday from ${JERISTOTLE_EMAIL}. Counts are drawn from the live outreach campaigns.</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  const text = [
    "WEEKLY CHAMBER OUTREACH RECAP",
    input.weekLabel,
    "",
    `Campaign segment: ${input.campaignName}`,
    `Campaign status: ${input.campaignStatus}`,
    `Qualified Chamber members: ${input.totalProspects}`,
    "",
    `Total sent: ${totalSent}`,
    `New messages: ${input.newSent}`,
    `Follow-ups: ${input.followupsSent}`,
    `Replies: ${input.replies}`,
    `Reply rate: ${replyRate}%`,
    `Meetings: ${input.meetings}`,
    `Unsubscribes: ${input.unsubscribes}`,
    `Errors: ${input.errors}`,
    `Research failures: ${researchFailures}`,
    "",
    `Queued for research: ${input.queued}`,
    `Awaiting review: ${input.review}`,
    `In sequence: ${input.active}`,
    `Ready to send: ${readyToSend ?? "Not reported"}`,
    ...(input.eligibleQueued !== undefined
      ? [
          `Eligible queued prospects: ${input.eligibleQueued}`,
          `Ready reserve target: ${input.bufferTarget ?? OUTREACH_READY_BUFFER_TARGET}`,
        ]
      : []),
    `Incomplete runs: ${incompleteRuns}`,
    `Latest run: ${lastRunStatus}${input.lastRun?.runDate ? ` (${input.lastRun.runDate})` : ""}`,
    `Latest run summary: ${lastRunSummary}`,
    ...(warnings.length ? ["", ...warnings] : []),
    ...(input.creditUnionRecap?.state === "unavailable"
      ? [
          "",
          "CREDIT-UNION RECAP UNAVAILABLE",
          `The Chamber recap was generated, but credit-union metrics could not be read: ${input.creditUnionRecap.error}`,
        ]
      : creditUnionCampaigns.flatMap(campaign => {
          const smtpAccepted =
            campaign.newSmtpAccepted + campaign.followupSmtpAccepted;
          const replyRate = campaign.initialRecipients
            ? Math.round(
                (campaign.distinctReplies / campaign.initialRecipients) * 100
              )
            : 0;
          return [
            "",
            "CREDIT-UNION CAMPAIGN",
            `Campaign: ${campaign.campaignName}`,
            `Campaign status: ${campaign.campaignStatus}`,
            `New SMTP accepted: ${campaign.newSmtpAccepted}`,
            `Follow-up SMTP accepted: ${campaign.followupSmtpAccepted}`,
            `Total SMTP accepted: ${smtpAccepted}`,
            "SMTP acceptance is not guaranteed delivery.",
            `Distinct replies: ${campaign.distinctReplies}`,
            `Reply rate: ${replyRate}% (${campaign.initialRecipients} initial recipients)`,
            `Distinct meetings: ${campaign.distinctMeetings}`,
            `Distinct opt-outs: ${campaign.distinctOptOuts}`,
            `Distinct bounces: ${campaign.distinctBounces}`,
            `Distinct error events: ${campaign.distinctErrorEvents}`,
            `Ready: ${campaign.ready}`,
            `Verification needed: ${campaign.verificationNeeded}`,
            `In sequence: ${campaign.inSequence}`,
            campaign.lastActivity
              ? `Latest maintenance/run: ${campaign.lastActivity.eventType} (${campaign.lastActivity.occurredAt.toLocaleString("en-US")})${campaign.lastActivity.detail ? ` — ${campaign.lastActivity.detail}` : ""}`
              : "Latest maintenance/run: Not recorded",
            `Open the credit-union campaign: ${CREDIT_UNION_PORTAL_URL}`,
          ];
        })),
    ...(input.brandVideoRecap?.state === "unavailable"
      ? [
          "",
          "BRAND VIDEO RECAP UNAVAILABLE",
          `The main recap was generated, but Brand Video metrics could not be read: ${input.brandVideoRecap.error}`,
        ]
      : brandVideoCampaigns.flatMap(campaign => {
          const smtpAccepted =
            campaign.newSmtpAccepted + campaign.followupSmtpAccepted;
          const replyRate = campaign.initialRecipients
            ? Math.round(
                (campaign.distinctReplies / campaign.initialRecipients) * 100
              )
            : 0;
          return [
            "",
            "PROFESSIONAL BRAND VIDEO CAMPAIGN",
            `Campaign: ${campaign.campaignName}`,
            `Campaign status: ${campaign.campaignStatus}`,
            `New SMTP accepted: ${campaign.newSmtpAccepted}`,
            `Follow-up SMTP accepted: ${campaign.followupSmtpAccepted}`,
            `Total SMTP accepted: ${smtpAccepted}`,
            "SMTP acceptance is not guaranteed delivery.",
            `Distinct replies: ${campaign.distinctReplies}`,
            `Reply rate: ${replyRate}% (${campaign.initialRecipients} initial recipients)`,
            `Distinct meetings: ${campaign.distinctMeetings}`,
            `Distinct opt-outs: ${campaign.distinctOptOuts}`,
            `Distinct bounces: ${campaign.distinctBounces}`,
            `Distinct error events: ${campaign.distinctErrorEvents}`,
            `Ready: ${campaign.ready}`,
            `Pending review: ${campaign.reviewPending}`,
            `In sequence: ${campaign.inSequence}`,
            campaign.lastActivity
              ? `Latest maintenance/run: ${campaign.lastActivity.eventType} (${campaign.lastActivity.occurredAt.toLocaleString("en-US")})${campaign.lastActivity.detail ? ` — ${campaign.lastActivity.detail}` : ""}`
              : "Latest maintenance/run: Not recorded",
            `Open the Brand Video campaign: ${BRAND_VIDEO_PORTAL_URL}`,
          ];
        })),
    ...(input.trainingRecap?.state === "unavailable"
      ? [
          "",
          "TRAINING RECAP UNAVAILABLE",
          `The Chamber recap was generated, but Training & Knowledge Capture metrics could not be read: ${input.trainingRecap.error}`,
        ]
      : trainingCampaigns.flatMap(campaign => {
          const smtpAccepted =
            campaign.newSmtpAccepted + campaign.followupSmtpAccepted;
          const replyRate = campaign.initialRecipients
            ? Math.round(
                (campaign.distinctReplies / campaign.initialRecipients) * 100
              )
            : 0;
          return [
            "",
            "INTERNAL TRAINING & KNOWLEDGE CAPTURE",
            `Campaign: ${campaign.campaignName}`,
            `Campaign status: ${campaign.campaignStatus}`,
            `Initial SMTP accepted: ${campaign.newSmtpAccepted}`,
            `Follow-up SMTP accepted: ${campaign.followupSmtpAccepted}`,
            `Total SMTP accepted: ${smtpAccepted}`,
            "SMTP acceptance is not guaranteed delivery.",
            `Distinct replies: ${campaign.distinctReplies}`,
            `Reply rate: ${replyRate}% (${campaign.initialRecipients} initial recipients)`,
            `Distinct meetings: ${campaign.distinctMeetings}`,
            `Distinct opt-outs: ${campaign.distinctOptOuts}`,
            `Distinct bounces: ${campaign.distinctBounces}`,
            `Distinct error events: ${campaign.distinctErrorEvents}`,
            `Closed: ${campaign.currentClosed}`,
            `Not closed: ${campaign.currentNotClosed}`,
            `Weekly outcome updates: ${campaign.distinctClosedOutcomes} closed / ${campaign.distinctNotClosedOutcomes} not closed`,
            `Ready reserve: ${campaign.readyReserve}/${TRAINING_READY_RESERVE_TARGET}`,
            `Pending review: ${campaign.reviewPending}`,
            `In sequence: ${campaign.inSequence}`,
            campaign.lastRun
              ? `Recorded daily totals (${campaign.lastRun.runDate}): ${campaign.lastRun.newSent} initial and ${campaign.lastRun.followupsSent} follow-up SMTP acceptances. Persisted status: ${campaign.lastRun.status}.${campaign.lastRun.summary ? ` Latest stored summary (may describe one tick, not daily totals): ${campaign.lastRun.summary}` : ""}`
              : "Recorded daily totals: Not recorded",
            campaign.lastReplyCheckAt
              ? `Latest inbox scan: ${campaign.lastReplyCheckAt.toLocaleString("en-US")}`
              : "Latest inbox scan: Not recorded",
            campaign.researchActivity
              ? `${campaign.researchConfigured ? "Research configured" : "Research not connected"}; latest persisted research activity: ${campaign.researchActivity.eventType} (${campaign.researchActivity.occurredAt.toLocaleString("en-US")})${campaign.researchActivity.detail ? ` — ${campaign.researchActivity.detail}` : ""}`
              : campaign.researchConfigured
                ? "Research configured; latest research activity: Not recorded"
                : "Research not connected; latest research activity: Not recorded",
            campaign.researchLastRequestedAt
              ? `Latest research request: ${campaign.researchLastRequestedAt.toLocaleString("en-US")}`
              : "Latest research request: Not recorded",
            `Open Training & Knowledge Capture: ${TRAINING_PORTAL_URL}`,
          ];
        })),
    ...(hustleUnavailable
      ? ["", "CORPUS CHRISTI HUSTLE RECAP UNAVAILABLE", HUSTLE_RECAP_UNAVAILABLE_MESSAGE, `Open Corpus Christi Hustle: ${HUSTLE_PORTAL_URL}`]
      : hustleCampaigns.length
        ? ["", "CORPUS CHRISTI HUSTLE · EPISODE SPONSORSHIP", ...hustleLines, `Open Corpus Christi Hustle: ${HUSTLE_PORTAL_URL}`]
        : []),
    ...(sectorUnavailable
      ? ["", "FOUR-SECTOR RECAP UNAVAILABLE", SECTOR_RECAP_UNAVAILABLE_MESSAGE, `Open the four-sector campaigns: ${sectorPortalUrl}`]
      : sectorCampaigns.length
        ? ["", "FOUR-SECTOR OUTREACH · CAMPAIGN METRICS", ...sectorLines, `Open the four-sector campaigns: ${sectorPortalUrl}`]
        : []),
    "",
    `Open the pipeline: ${OUTREACH_PORTAL_URL}`,
  ].join("\n");
  return { subject, html, text };
}

export async function runOutreachSaturdayRecap(options: {
  taskUid: string;
  now?: Date;
}) {
  const now = options.now ?? new Date();
  const moment = getOutreachLocalMoment(now);
  if (moment.weekday !== "Saturday" || moment.hour !== 10) {
    return { ok: true, skipped: "outside-send-window" } as const;
  }
  const workspace = await getChamberOutreachWorkspace();
  if (
    workspace.campaign?.recapTaskUid &&
    workspace.campaign.recapTaskUid !== options.taskUid
  ) {
    return { ok: true, skipped: "wrong-scheduler" } as const;
  }
  const window = getCentralWeekWindow(now);
  if (await hasOutreachEventSince("weekly_recap_sent", window.start)) {
    return { ok: true, skipped: "already-sent" } as const;
  }
  const recap = await getOutreachRecapWindow(window.start, window.end);
  const queueHealth = await getOutreachQueueHealth(now);
  // Read-only failures are displayed in the recap rather than suppressing the
  // existing Chamber send. These report functions never initialize campaigns.
  const [creditUnionRecap, brandVideoRecap, trainingRecap, hustleRecap, sectorRecap] = await Promise.all([
    getCreditUnionRecapWindow(window),
    getBrandVideoRecapWindow(window),
    getTrainingRecapWindow(window),
    getHustleRecapWindow(window, now),
    getSectorRecapWindow(window, now),
  ]);
  const runErrors = recap.runs.reduce(
    (acc, run) => ({
      errors: acc.errors + run.errorCount,
    }),
    { errors: 0 }
  );
  const countEvent = (eventType: string) =>
    recap.events.filter(event => event.eventType === eventType).length;
  const newSent = countEvent("initial_sent");
  const followupsSent = countEvent("followup_sent");
  const researchFailures = countEvent("research_failed");
  const approvedProspectIds = new Set(
    workspace.prospects
      .filter(prospect => prospect.status === "approved")
      .map(prospect => prospect.id)
  );
  const readyToSend = workspace.messages.filter(
    message =>
      message.sequenceStep === 0 &&
      message.status === "approved" &&
      approvedProspectIds.has(message.prospectId)
  ).length;
  const incompleteRuns = recap.runs.filter(
    run => run.status === "started"
  ).length;
  const lastRun = [...recap.runs].sort((left, right) => {
    const byDate = right.runDate.localeCompare(left.runDate);
    if (byDate !== 0) return byDate;
    return right.updatedAt.getTime() - left.updatedAt.getTime();
  })[0];
  const message = buildOutreachRecapEmail({
    campaignName:
      workspace.campaign?.name || "United Corpus Christi Chamber outreach",
    campaignStatus: workspace.campaign?.status || "unknown",
    totalProspects: workspace.prospects.length,
    weekLabel: `${window.start.toLocaleDateString("en-US")} through ${now.toLocaleDateString("en-US")}`,
    newSent,
    followupsSent,
    // A research failure is an operational failure even though it happens
    // before sending and is therefore absent from daily run errorCount.
    errors: runErrors.errors + researchFailures,
    researchFailures,
    readyToSend,
    eligibleQueued: queueHealth.eligibleQueuedCount,
    bufferTarget: OUTREACH_READY_BUFFER_TARGET,
    incompleteRuns,
    lastRun: lastRun
      ? {
          runDate: lastRun.runDate,
          status: lastRun.status,
          summary: lastRun.summary,
        }
      : null,
    replies: countEvent("reply_detected"),
    unsubscribes: countEvent("unsubscribed"),
    meetings: workspace.prospects.filter(
      prospect => prospect.status === "meeting"
    ).length,
    queued: workspace.prospects.filter(prospect => prospect.status === "queued")
      .length,
    review: workspace.prospects.filter(prospect => prospect.status === "review")
      .length,
    active: workspace.prospects.filter(
      prospect => prospect.status === "in_sequence"
    ).length,
    creditUnionRecap,
    brandVideoRecap,
    trainingRecap,
    hustleRecap,
    sectorRecap,
  });
  const delivery = await sendJeristotleHtmlEmail({
    to: JERISTOTLE_EMAIL,
    subject: message.subject,
    html: message.html,
    text: message.text,
  });
  if (!delivery.sent || !delivery.messageId) {
    throw new Error("Jeristotle Gmail delivery is not configured");
  }
  await recordOutreachEvent({
    eventType: "weekly_recap_sent",
    detail: `Saturday recap sent as ${delivery.messageId}.`,
    occurredAt: now,
  });
  return { ok: true, sent: true, messageId: delivery.messageId } as const;
}

export async function chamberOutreachRecapHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) {
      return res.status(403).json({ error: "cron-only endpoint" });
    }
    const result = await runOutreachSaturdayRecap({ taskUid: user.taskUid });
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[ChamberOutreachRecap] ${message}`);
    return res.status(500).json({
      error: message,
      context: { url: req.originalUrl },
      timestamp: new Date().toISOString(),
    });
  }
}
