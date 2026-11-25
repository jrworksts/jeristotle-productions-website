import type { GrowthTask } from "./growthPlan";

export const LINKEDIN_PRIORITY_PLAN_VERSION =
  "linkedin-full-funnel-priority-2026-10-24";
export const LINKEDIN_PRIORITY_EFFECTIVE_DATE = "2026-10-25";
export const LINKEDIN_PRIORITY_MARKER_SLUG = "growth-linkedin-priority-v1";

/** Planning comes forward; production, tracking QA and actual launch remain gated. */
export const LINKEDIN_PRIORITY_TASK_SLUGS = [
  "authority-foundation-01",
  "authority-foundation-02",
  "authority-foundation-03",
  "authority-linkedin_ads-01",
  "authority-linkedin_ads-03",
  "authority-linkedin_ads-02",
  "authority-linkedin_ads-05",
  "authority-linkedin_ads-06",
  "authority-linkedin_ads-07",
  "authority-framework_offer-09",
  "authority-sales_delivery-02",
  "authority-linkedin_ads-04",
  "authority-linkedin_ads-08",
] as const;

type TaskUpdate = Partial<
  Pick<
    GrowthTask,
    | "title"
    | "description"
    | "steps"
    | "doneWhen"
    | "dependsOn"
    | "minutes"
    | "phase"
  >
>;

export const LINKEDIN_PRIORITY_TASK_UPDATES: Readonly<
  Record<string, TaskUpdate>
> = {
  "authority-linkedin_ads-01": {
    title:
      "Finalize the webinar-informed LinkedIn full-funnel campaign strategy",
    description:
      "Review the LinkedIn webinar findings and GPT critique, then finalize one simple Corpus Christi pilot: Jeremy-led educational content builds familiarity, a clear strategy-session path captures willing interest, and consented follow-up supports real conversations. This is planning, not an ad launch.",
    steps: [
      "Review the dated campaign strategy and source notes. Keep movie-level content production for small businesses as the positioning; use Small businesses don’t need to look small as a proposed creative hook, not an unsupported diagnosis.",
      "Choose one awareness-first objective to validate in Campaign Manager, the proposed owner audience, three educational hooks, and the complimentary 2027 marketing strategy-session invitation. Match formats to funnel stages; do not attach an unsupported Lead Gen Form or CTA button to a Thought Leader video ad.",
      "Define the smallest viable pilot and a separate consented inquiry/booking path. Paid retargeting and additional campaigns wait for actual eligible audience supply, evidence, capacity and approval.",
      "Record what Jeremy approves for planning and what remains unverified: ad-account access, exact targeting and audience size, approved creative, tracking/consent, budget and flight. No spending or launch is authorized by completing this task.",
    ],
    doneWhen:
      "A dated strategy decision identifies the message, one initial objective, audience hypothesis, educational creative, strategy-session path, measurement and explicit launch blockers. Jeremy has reviewed the proposal; no ad, spend or live test lead was created.",
    dependsOn: [
      "authority-foundation-01",
      "authority-foundation-02",
      "authority-foundation-03",
    ],
    minutes: 40,
    phase: "first_30",
  },
  "authority-linkedin_ads-03": {
    title: "Audit the existing LinkedIn Page and Campaign Manager access",
    description:
      "Use the completed asset inventory to inspect the existing Jeristotle LinkedIn Page and any ad account before planning paid delivery. This read-only audit does not require rewriting profiles or creating duplicate pages.",
    steps: [
      "Open the existing LinkedIn Company Page from the verified asset inventory. Confirm its association with Jeristotle Productions and Jeremy’s actual Page role; keep unknown administrator and recovery details explicitly unverified.",
      "Inspect any existing Campaign Manager account, Page association, role holders, Thought Leader sponsorship permissions and billing readiness. Record the exact account and Page IDs only when verified.",
      "Name each blocker and the person needed to resolve it. Do not create an account, grant access, enter payment details, revoke unverified accounts or alter Jeremy’s owner control as a side effect of this audit.",
    ],
    doneWhen:
      "One read-only readiness note records the existing Page, verified ad-account/role/billing state, Jeremy’s administrator path and all unverified blockers. No account, duplicate page, payment or permission change was made.",
    dependsOn: ["authority-foundation-03", "authority-linkedin_ads-01"],
    phase: "first_30",
  },
  "authority-linkedin_ads-02": {
    title: "Confirm the personal LinkedIn conversation-led approach",
    description:
      "Close the original audience-research step by Jeremy's October 28 direction: lead with his personal LinkedIn presence and invite business owners to message him. Actual ad-account access, audience estimates and free messaging availability are not verified by this decision and carry into the next preparation task.",
    steps: [
      "Record Jeremy's approved direction: personal content, a message invitation, a business-fit conversation and an optional complimentary 2027 marketing strategy session.",
      "Measure relevant inbound conversations, qualified prospects and booked sessions rather than treating views or likes as leads.",
      "Retain the actual blockers for the next task: the correct Jeristotle ad account, displayed local audience estimates, permission to sponsor the post and non-connection messaging access. Do not claim these checks passed.",
      "Completing this decision closes the superseded audience worksheet, not the underlying launch checks. No ad-account creation, payment, public post, targeting change or paid launch is authorized. Any later account creation, live audience change, spend or launch requires Jeremy's explicit approval.",
    ],
    doneWhen:
      "Jeremy's personal, conversation-led direction is recorded and the original audience worksheet is closed at his request, with every unfinished account, audience and messaging check explicitly carried into the next task.",
    phase: "first_30",
  },
  "authority-linkedin_ads-05": {
    title: "Prepare Jeremy’s personal LinkedIn conversation-led ad",
    description:
      "Prepare one simple Jeremy-led LinkedIn ad inviting Corpus Christi business owners to message him about their 2027 marketing. The goal is qualified conversations, not views alone. Verify the actual personal-message path and paid-delivery blockers before asking for launch approval.",
    steps: [
      "Verify whether people outside Jeremy's connections can message him freely. Check Open Profile and actual Premium availability without purchasing a subscription or changing settings as a side effect; record missing access honestly.",
      "Locate the correct Jeristotle company-associated ad account, Page and post-sponsorship permissions. Record actual Corpus Christi targeting controls, audience estimates and eligibility warnings. Do not use unrelated accounts, invent estimates or expand geography without approval; account creation remains separately authorized work.",
      "Draft one original Jeremy-led video and post with the CTA: Message me 2027 and tell me a little about your business. Lead with movie-level content production for small businesses and offer a useful conversation about 2027 marketing, not guaranteed leads or sales. Plan camera-first original creative production with existing equipment in the later production task; Higgsfield is optional only when Jeremy wants a specific value-adding enhancement, with rights and any paid-render approval.",
      "Record the format limitation: a Thought Leader video has no native CTA button and is not optimized for personal DMs. Its message invitation belongs in the video and post text. If the actual message path is blocked, stop and propose a supported alternative; do not silently substitute automated Sponsored Messaging or a form.",
      "Define Jeremy's manual first reply, one useful business-fit question and an optional complimentary strategy-session next step. Track relevant inbound conversations, qualified prospects and booked sessions with source notes; email/SMS follow-up requires appropriate consent.",
      "Save the draft and a short readiness checklist for review. Keep audience, creative, objective, dates, spend and launch approval explicitly pending; do not publish, send a test lead, buy Premium or start an ad by completing this task.",
    ],
    doneWhen:
      "One personal conversation-led script/post, a clear 2027 message invitation, manual response outline and factual account/audience/messaging checklist are ready for Jeremy's review. Unknown checks remain blocked, no unsupported message button or lead optimization is claimed, and no ad or spend is launched.",
    dependsOn: ["authority-linkedin_ads-01", "authority-linkedin_ads-02"],
    phase: "first_30",
  },
  "authority-linkedin_ads-06": {
    description:
      "Prepare a practical Jeremy-led shooting brief using the camera already available, clean audio and ordinary editing. Plan natural short clips from the master script; Higgsfield is optional only for a specific enhancement Jeremy wants, not a required step. Actual recording, rights clearance, final assets and any paid generation remain separately approval-gated later work.",
    dependsOn: ["authority-linkedin_ads-05"],
    phase: "first_30",
  },
  "authority-linkedin_ads-07": {
    title: "Specify the personal-message and strategy-session follow-up path",
    description:
      "Keep the first conversion path simple: personal LinkedIn messages to Jeremy, a useful business-fit conversation and an optional complimentary 2027 strategy session. Forms, automated message flows and extra campaigns are alternatives only if needed and separately approved, not mandatory first steps. This draft specification does not claim a live form, CRM connection or automation is already working.",
    steps: [
      "Define a useful complimentary 2027 marketing strategy session: owner goals, a content-to-customer path review, one clear bottleneck, three prioritized next steps and a practical take-away. Paid implementation is a separate discussion.",
      "Confirm the personal LinkedIn message path, first reply and optional booking handoff. Do not require a landing page or Lead Gen Form for this direct conversation-led pilot; propose an alternative only when actual platform limits require Jeremy's decision.",
      "Assign Jeremy the response/booking owner and propose a realistic follow-up service standard. Record qualified conversations, campaign source and bookings without confusing platform engagement with inquiries. Specify consent before moving a conversation to email or optional SMS.",
      "Keep all live client CRM, Email/SMS and workflow integrations off-limits for test leads without explicit instruction. Use only previews or isolated staging; the later build and tracking QA tasks must verify the real path before paid traffic.",
    ],
    doneWhen:
      "A written personal-message and optional strategy-session path names the first reply, useful qualification question, booking handoff, Jeremy as owner, consent and actual lead measurement; no form, automation or live test lead is implied to exist.",
    dependsOn: ["authority-linkedin_ads-01", "authority-linkedin_ads-06"],
    phase: "first_30",
  },
  "authority-linkedin_ads-04": {
    title: "Review the fixed-budget pilot and obtain spend/flight approval",
    description:
      "Package one personal LinkedIn conversation-led pilot for Jeremy's explicit creative, objective, audience, budget and flight approval. Qualified conversations and booked sessions are the business outcomes to measure; platform objective limitations remain explicit and no additional paid campaign is automatically authorized.",
    steps: [
      "Prepare an approval card naming verified account, objective, audience version, creative versions, proposed total/daily cap, start/end dates and review point. Leave unknown or unapproved values pending rather than inventing a budget.",
      "Specify LinkedIn-only delivery, the no-automatic-budget-change rule and the exact authorized optimization scope. Facebook/Instagram paid campaigns, new audiences, expanded geography, additional flights and budget changes require separate explicit approval.",
      "Record Jeremy’s written approval, revision, rejection or pending status. Approval of a strategy or checklist is not approval to spend or launch, and silence is never approval.",
    ],
    phase: "first_30",
  },
  "authority-linkedin_ads-08": {
    title: "Assemble the non-live LinkedIn pilot build sheet",
    description:
      "Translate the reviewed personal-message strategy into a Campaign Manager draft or complete build sheet with delivery disabled. Verify the actual message entry path rather than assume a native DM button exists; missing assets, account access, audience eligibility and pending authorization remain visible blockers.",
    phase: "first_30",
  },
  "authority-linkedin_ads-09": {
    dependsOn: [
      "authority-funnel_tracking-05",
      "authority-funnel_tracking-09",
      "authority-content_engine-09",
      "authority-framework_offer-10",
      "authority-linkedin_ads-08",
    ],
  },
};
