export type GrowthPhase = "first_30" | "days_31_60" | "days_61_90";
export type GrowthPriority = "high" | "normal";

export type GrowthWorkstreamId =
  | "blueprint_v2"
  | "go_to_market"
  | "educational_content"
  | "speaking"
  | "relationships"
  | "lead_generation"
  | "suggested_sales_improvement";

export type GrowthTask = {
  slug: string;
  phase: GrowthPhase;
  category: GrowthWorkstreamId;
  title: string;
  description: string;
  owner: string;
  sortOrder: number;
  minutes: number;
  priority: GrowthPriority;
  steps: string[];
  doneWhen: string;
  dependsOn: string[];
  requiresApproval: boolean;
};

export type GrowthWorkstream = {
  id: GrowthWorkstreamId;
  name: string;
  description: string;
};

export type GrowthDailyRoutineItem = {
  slug: string;
  title: string;
  description: string;
  minutes: number;
};

export type GrowthPillar = {
  name: string;
  subtitle: string;
  components: string[];
};

type GrowthTaskDefinition = Omit<GrowthTask, "sortOrder">;

export const GROWTH_PLAN_VERSION = "ddb-growth-hub-v1";

export const GROWTH_PLAN_NOTE =
  "This is a static, daily-use planning checklist—not an instruction to execute, send, publish, buy, file, or change a schedule automatically. It preserves the Digital Dominance Blueprint teaching path: ATTRACT → EDUCATE → CONVERT → RETAIN → REPEAT. The scorecard is a self-assessed digital readiness score, not an independently validated marketing-performance measure: In Place = 10, Needs Work = 5, Not Started = 0; maximum 90; attainable five-point bands are 70–90 Strong Presence, 40–65 Growing, and 0–35 At Risk. Content starts with the movie-level differentiator and then moves to distribution; no task promises market, reach, lead, sales, attendance, SEO, or conversion results. The source attachment ends in Part 6 at ‘Educational’; the clearly labeled Suggested Sales & Improvement extension below is therefore a proposed continuation, not a supplied requirement.";

export const GROWTH_WORKSTREAMS: readonly GrowthWorkstream[] = [
  {
    id: "blueprint_v2",
    name: "Blueprint v2",
    description:
      "Preserve the recognizable three-pillar, nine-component framework while making the audit, action planning, formats, and IP path easier to use.",
  },
  {
    id: "go_to_market",
    name: "Go-to-market",
    description:
      "Sequence positioning, research preparation, segments, offers, channels, and roadmaps before outreach or promotion.",
  },
  {
    id: "educational_content",
    name: "Educational content",
    description:
      "Build an owner-friendly content library that leads with movie-level creative differentiation, then supports practical distribution and reuse.",
  },
  {
    id: "speaking",
    name: "Speaking",
    description:
      "Create practical talks, workshop tools, and a research-ready opportunity pipeline without claiming venue access or dates.",
  },
  {
    id: "relationships",
    name: "Relationships",
    description:
      "Develop a genuine, consent-aware in-person relationship system that keeps friendship and community participation separate from prospecting.",
  },
  {
    id: "lead_generation",
    name: "Lead generation",
    description:
      "Plan an opt-in educational funnel, attribution, follow-up drafts, and measurement without automatically sending or publishing anything.",
  },
  {
    id: "suggested_sales_improvement",
    name: "Suggested Sales & Improvement extension (not supplied)",
    description:
      "Suggested only because the supplied attachment cuts off during Part 6 at ‘Educational’; it continues the earlier Part 2 lifecycle from qualified conversation through delivery, learning, referrals, and reinvestment.",
  },
];

export const GROWTH_PILLARS: readonly GrowthPillar[] = [
  {
    name: "01 — FOUNDATION",
    subtitle: "Build Your Digital Foundation",
    components: [
      "Website — Your digital storefront",
      "Social Media — Your awareness machine",
      "Email + SMS — Your retention engine",
    ],
  },
  {
    name: "02 — GROWTH",
    subtitle: "Drive Visibility and Create Demand",
    components: [
      "Local SEO + Google Business",
      "Content Marketing",
      "Paid Advertising",
    ],
  },
  {
    name: "03 — OPTIMIZATION",
    subtitle: "Improve Performance and Scale",
    components: [
      "Analytics & Tracking",
      "Reputation & Reviews",
      "Automation & Systems",
    ],
  },
];

export const GROWTH_SCORECARD = {
  maximum: 90,
  selfAssessmentOnly: true,
  choices: [
    { label: "In Place", points: 10 },
    { label: "Needs Work", points: 5 },
    { label: "Not Started", points: 0 },
  ],
  ranges: [
    { min: 70, max: 90, label: "Strong Presence" },
    { min: 40, max: 65, label: "Growing" },
    { min: 0, max: 35, label: "At Risk" },
  ],
} as const;

export const GROWTH_DELIVERABLE_TARGETS = {
  contentIdeas: 100,
  shortFormScripts: 30,
  longFormOutlines: 12,
  socialPosts: 20,
  carousels: 10,
  newsletters: 12,
  articleBriefs: 12,
  flagshipArticles: 5,
  evidenceBackedCaseConcepts: 10,
  launchContentCalendarDays: 30,
  rollingContentCalendarDays: 90,
  speakingMinutes: [5, 15, 30, "45-60", 90],
  qualifiedSpeakingCandidatesWhereFeasible: 30,
} as const;

export const GROWTH_DAILY_ROUTINE: readonly GrowthDailyRoutineItem[] = [
  {
    slug: "ddb-daily-pipeline-replies",
    title: "Review pipeline and replies manually",
    description:
      "Review only consented or existing conversations, update the next action, and flag anything needing an owner decision. This check does not auto-send messages or change schedules.",
    minutes: 15,
  },
  {
    slug: "ddb-daily-create-promote",
    title: "Create or prepare one content promotion",
    description:
      "Advance one approved content batch or prepare a promotion draft; leave any public post or send for explicit approval. This routine does not publish automatically.",
    minutes: 30,
  },
  {
    slug: "ddb-daily-genuine-follow-up",
    title: "Make one genuine relationship follow-up",
    description:
      "Review a real conversation, note context, and prepare one useful follow-up only where welcome; do not turn every relationship into a sales lead or auto-send a message.",
    minutes: 15,
  },
  {
    slug: "ddb-daily-deep-work-next-action",
    title: "Complete the next deep-work action",
    description:
      "Work the next ready plan task for a focused block, document the result, and set a manual next action without changing calendars or automation.",
    minutes: 60,
  },
  {
    slug: "ddb-daily-log-actual-metrics",
    title: "Log actual, source-labeled metrics",
    description:
      "Record observed inputs, conversations, opt-ins, and outcomes with their source and date of observation; do not infer performance or make outcome claims.",
    minutes: 10,
  },
];

const TASK_DEFINITIONS: readonly GrowthTaskDefinition[] = [
  {
    slug: "ddb-blueprint-review-source",
    phase: "first_30",
    category: "blueprint_v2",
    title: "Review the original Blueprint page by page",
    description:
      "Record what must remain recognizable in v2: the three pillars, nine components, audit format, and ATTRACT → EDUCATE → CONVERT → RETAIN → REPEAT teaching model.",
    owner: "Jeremy — framework lead",
    minutes: 45,
    priority: "high",
    steps: [
      "1. Compare every heading and component with the supplied two-page Blueprint.",
      "2. List clarity, usability, and conversion-path questions without rewriting the framework.",
      "3. Save a preservation checklist for the v2 work.",
    ],
    doneWhen:
      "A preservation checklist identifies every pillar, component, scorecard element, and journey term that v2 must retain.",
    dependsOn: [],
    requiresApproval: false,
  },
  {
    slug: "ddb-blueprint-v2-structure",
    phase: "first_30",
    category: "blueprint_v2",
    title: "Outline the Blueprint v2 information architecture",
    description:
      "Create the v2 page flow: owner instructions, nine-component self-assessment, score explanation, Top Three Priorities, action path, and optional implementation support.",
    owner: "Jeremy — framework lead",
    minutes: 60,
    priority: "high",
    steps: [
      "1. Turn the preservation checklist into a plain-language page outline.",
      "2. Place Top Three Priorities after the scorecard and before any service invitation.",
      "3. Mark printable, mobile, presentation, and interactive requirements beside each section.",
    ],
    doneWhen:
      "A v2 outline keeps the original framework recognizable and names the owner-action sections to be built.",
    dependsOn: ["ddb-blueprint-review-source"],
    requiresApproval: false,
  },
  {
    slug: "ddb-blueprint-scorecard",
    phase: "first_30",
    category: "blueprint_v2",
    title: "Specify the self-assessed Digital Growth Scorecard",
    description:
      "Define a nine-component readiness score using only 10 In Place, 5 Needs Work, and 0 Not Started; maximum 90; non-overlapping attainable ranges are 70–90, 40–65, and 0–35.",
    owner: "Jeremy — framework lead",
    minutes: 45,
    priority: "high",
    steps: [
      "1. Write one plain-language status instruction for each of the nine components.",
      "2. Label the result as self-assessed digital readiness, not validated marketing performance.",
      "3. Add Strong Presence, Growing, and At Risk focus guidance without inventing outcomes.",
    ],
    doneWhen:
      "The scorecard specification totals 90, uses only multiples of five, and documents all three non-overlapping ranges.",
    dependsOn: ["ddb-blueprint-v2-structure"],
    requiresApproval: false,
  },
  {
    slug: "ddb-blueprint-journey-offers",
    phase: "first_30",
    category: "blueprint_v2",
    title: "Clarify the customer journey and optional help path",
    description:
      "Map ATTRACT, EDUCATE, CONVERT, RETAIN, and REPEAT to educational offers, landing pages, lead capture, follow-up, and conversion tracking while giving away the WHAT before offering paid HOW support.",
    owner: "Jeremy — strategy lead",
    minutes: 60,
    priority: "high",
    steps: [
      "1. Define the owner action and optional next step for each journey stage.",
      "2. Identify where an assessment, resource, booking request, and follow-up record belong.",
      "3. Remove pressure language and state that self-implementation is a successful educational outcome.",
    ],
    doneWhen:
      "A one-page journey map connects the Blueprint to helpful choices without promising a sales or market result.",
    dependsOn: ["ddb-blueprint-scorecard"],
    requiresApproval: false,
  },
  {
    slug: "ddb-blueprint-owner-instructions",
    phase: "first_30",
    category: "blueprint_v2",
    title: "Draft independent-completion instructions and Top Three Priorities",
    description:
      "Write concise owner instructions for scoring each component, choosing a status, identifying support preferences, and selecting the three most useful next actions.",
    owner: "Jeremy — education lead",
    minutes: 45,
    priority: "high",
    steps: [
      "1. Draft the instructions in simple business-owner language.",
      "2. Add a Top Three Priorities worksheet with owner, next action, and review field.",
      "3. Check that an owner can use the assessment without a sales conversation.",
    ],
    doneWhen:
      "The v2 outline includes self-service instructions and a usable Top Three Priorities action-planning section.",
    dependsOn: ["ddb-blueprint-journey-offers"],
    requiresApproval: false,
  },
  {
    slug: "ddb-blueprint-format-specs",
    phase: "first_30",
    category: "blueprint_v2",
    title: "Create v2 format specifications",
    description:
      "List acceptance criteria for an improved printable PDF, mobile-friendly digital version, presentation version, and fillable or interactive audit; this is a build brief, not production or publication.",
    owner: "Jeremy — production lead",
    minutes: 60,
    priority: "normal",
    steps: [
      "1. Define readable print, mobile, slide, and form behaviors for every scorecard section.",
      "2. List accessibility, brand, and quality-control checks for each format.",
      "3. Turn each format into a small future production backlog.",
    ],
    doneWhen:
      "Each of the four requested v2 formats has a clear purpose, acceptance criteria, and next build action.",
    dependsOn: ["ddb-blueprint-owner-instructions"],
    requiresApproval: false,
  },
  {
    slug: "ddb-blueprint-ip-approval",
    phase: "days_31_60",
    category: "blueprint_v2",
    title: "Prepare the v2 IP protection decision",
    description:
      "Prepare copyright notice, version-control, authorship, licensing, brand-use, and trademark-question recommendations. Any legal filing, payment, registration, or public rights claim requires explicit approval and appropriate professional review.",
    owner: "Jeremy — owner approval",
    minutes: 60,
    priority: "high",
    steps: [
      "1. Assemble a factual IP decision brief and questions for qualified counsel.",
      "2. Separate internal documentation from any filing, payment, or public claim.",
      "3. Record an approval gate before any rights action.",
    ],
    doneWhen:
      "An approval-gated IP decision brief is ready; no filing, payment, or public rights claim has been made.",
    dependsOn: ["ddb-blueprint-format-specs"],
    requiresApproval: true,
  },
  {
    slug: "ddb-blueprint-v2-build-backlog",
    phase: "days_31_60",
    category: "blueprint_v2",
    title: "Break the v2 build into daily production batches",
    description:
      "Turn the approved v2 outline into small, reviewable tasks for print, mobile, presentation, and interactive formats; do not produce or release the formats in this planning task.",
    owner: "Jeremy — production lead",
    minutes: 45,
    priority: "normal",
    steps: [
      "1. Split each format into layout, copy, form, QA, and owner-review actions.",
      "2. Assign a responsible person and acceptance criterion to each action.",
      "3. Hold public release outside this checklist until explicit approval.",
    ],
    doneWhen:
      "A daily v2 production backlog is sequenced with review gates and no public release is scheduled.",
    dependsOn: ["ddb-blueprint-ip-approval"],
    requiresApproval: false,
  },
  {
    slug: "ddb-gtm-movie-level-differentiator",
    phase: "first_30",
    category: "go_to_market",
    title: "Define the movie-level differentiator before campaign tactics",
    description:
      "Write a positioning hypothesis that leads with movie-level commercial, brand-story, social, campaign, and event production, then explains practical distribution and measurement without overstating results.",
    owner: "Jeremy — strategy lead",
    minutes: 60,
    priority: "high",
    steps: [
      "1. State the customer problem in plain language.",
      "2. Describe the creative-production difference before channel tactics.",
      "3. Add a truthful implementation invitation and outcome limitation.",
    ],
    doneWhen:
      "A one-page differentiator explains why creative quality comes first and avoids market-result claims.",
    dependsOn: ["ddb-blueprint-v2-build-backlog"],
    requiresApproval: false,
  },
  {
    slug: "ddb-gtm-research-segment-matrix",
    phase: "first_30",
    category: "go_to_market",
    title: "Set up the Coastal Bend research and segment matrix",
    description:
      "Prepare a no-assumptions research worksheet for small and midsize businesses, entrepreneurs, and local service businesses; later research can compare demand, budget fit, recurring needs, accessibility, and potential lifetime value.",
    owner: "Jeremy — research lead",
    minutes: 60,
    priority: "high",
    steps: [
      "1. Define evidence fields and source links needed before a segment is assessed.",
      "2. Create comparison columns for demand, budget fit, recurring need, access, and lifetime value hypothesis.",
      "3. Leave findings blank until research is actually completed and sourced.",
    ],
    doneWhen:
      "A research-ready segment matrix exists without unsupported local-market claims.",
    dependsOn: ["ddb-gtm-movie-level-differentiator"],
    requiresApproval: false,
  },
  {
    slug: "ddb-gtm-icp-problem-maps",
    phase: "first_30",
    category: "go_to_market",
    title: "Draft ideal-customer and problem-map hypotheses",
    description:
      "Create testable profiles for priority candidate segments and map common marketing problems, decision roles, objections, and content triggers as hypotheses pending research.",
    owner: "Jeremy — strategy lead",
    minutes: 60,
    priority: "high",
    steps: [
      "1. Draft a profile template that distinguishes evidence from assumption.",
      "2. Map problems to the nine Blueprint components and customer journey.",
      "3. Record what would disqualify a segment from near-term focus.",
    ],
    doneWhen:
      "Each candidate profile has a researchable problem map and no asserted market fact without evidence.",
    dependsOn: ["ddb-gtm-research-segment-matrix"],
    requiresApproval: false,
  },
  {
    slug: "ddb-gtm-positioning-alternatives",
    phase: "first_30",
    category: "go_to_market",
    title: "Build the positioning and alternatives review brief",
    description:
      "Prepare a factual review template for competitor and alternative-provider observations, differentiation choices, and proof requirements; do not research, contact, or characterize named providers in this task.",
    owner: "Jeremy — research lead",
    minutes: 45,
    priority: "normal",
    steps: [
      "1. Define observable comparison fields and source-capture rules.",
      "2. Separate Jeristotle claims from claims that need evidence or client approval.",
      "3. Draft positioning tests that can be revised after research.",
    ],
    doneWhen:
      "A source-aware alternatives-review brief is ready for later research and message testing.",
    dependsOn: ["ddb-gtm-icp-problem-maps"],
    requiresApproval: false,
  },
  {
    slug: "ddb-gtm-offer-channel-map",
    phase: "first_30",
    category: "go_to_market",
    title: "Map offers, acquisition channels, and the implementation path",
    description:
      "Connect educational resources to optional implementation offers, landing pages, lead capture, follow-up, and conversion tracking; prioritize responsible paths to qualified conversations rather than promises of fast revenue.",
    owner: "Jeremy — strategy lead",
    minutes: 60,
    priority: "high",
    steps: [
      "1. Inventory possible owned, earned, partner, speaking, and relationship channels.",
      "2. Match each channel to a useful resource and a consent-aware next step.",
      "3. Identify prerequisites before any channel is activated.",
    ],
    doneWhen:
      "A channel map shows the offer, resource, capture point, follow-up owner, and measurement need for each path.",
    dependsOn: ["ddb-gtm-positioning-alternatives"],
    requiresApproval: false,
  },
  {
    slug: "ddb-gtm-90-day-roadmap",
    phase: "first_30",
    category: "go_to_market",
    title: "Turn the plan into a 90-day launch roadmap",
    description:
      "Group the approved Blueprint, content, speaking, relationship, and funnel prerequisites into first 30, days 31–60, and days 61–90 milestones with owner review points.",
    owner: "Jeremy — project lead",
    minutes: 60,
    priority: "high",
    steps: [
      "1. Sequence prerequisites before promotion or outreach.",
      "2. Set review gates for evidence, approvals, and actual metrics.",
      "3. Select only attainable work for each period.",
    ],
    doneWhen:
      "A 90-day roadmap names dependencies, manual review gates, and no promised commercial result.",
    dependsOn: ["ddb-gtm-offer-channel-map"],
    requiresApproval: false,
  },
  {
    slug: "ddb-gtm-annual-measurement-roadmap",
    phase: "days_31_60",
    category: "go_to_market",
    title: "Draft the 12-month roadmap and measurement assumptions",
    description:
      "Create quarterly learning themes, a measurement dictionary, and decision questions for a future 12-month roadmap; label forecasts as assumptions and compare only observed, source-labeled data.",
    owner: "Jeremy — strategy lead",
    minutes: 60,
    priority: "normal",
    steps: [
      "1. Define quarterly education, distribution, relationship, and improvement themes.",
      "2. List metrics, attribution limits, and review questions.",
      "3. Mark every forecast as a hypothesis rather than a commitment.",
    ],
    doneWhen:
      "A 12-month planning view and measurement dictionary are ready for later evidence-based updates.",
    dependsOn: ["ddb-gtm-90-day-roadmap"],
    requiresApproval: false,
  },
  {
    slug: "ddb-gtm-review-approval-gate",
    phase: "days_61_90",
    category: "go_to_market",
    title: "Run the go-to-market readiness review",
    description:
      "Review the positioning, evidence gaps, offers, channel prerequisites, resourcing, and approval needs before any public campaign, spend, or outreach is proposed.",
    owner: "Jeremy — owner approval",
    minutes: 45,
    priority: "high",
    steps: [
      "1. Compare current drafts with the roadmap and available evidence.",
      "2. List blocked prerequisites and decisions requiring approval.",
      "3. Approve only the next planning or production batch, not a market outcome.",
    ],
    doneWhen:
      "A documented readiness review identifies what is ready, blocked, or awaiting approval; no campaign is launched.",
    dependsOn: ["ddb-gtm-annual-measurement-roadmap"],
    requiresApproval: true,
  },
  {
    slug: "ddb-content-editorial-strategy",
    phase: "first_30",
    category: "educational_content",
    title: "Write the editorial strategy around the movie-level differentiator",
    description:
      "Define how approachable education begins with movie-level creative work and then teaches distribution, systems, and the Blueprint; include Make Marketing Easy, Digital Dominance, Build Your Life, Real Business Transformation, and The Creative Entrepreneur.",
    owner: "Jeremy — content lead",
    minutes: 60,
    priority: "high",
    steps: [
      "1. State the educational promise and audience benefit without a performance claim.",
      "2. Map the five content pillars to the nine Blueprint components.",
      "3. Define a useful next step for each pillar.",
    ],
    doneWhen:
      "An editorial strategy leads with movie-level differentiation before distribution tactics and names all five content pillars.",
    dependsOn: ["ddb-gtm-review-approval-gate"],
    requiresApproval: false,
  },
  {
    slug: "ddb-content-audience-messaging",
    phase: "first_30",
    category: "educational_content",
    title: "Create the audience-specific messaging guide",
    description:
      "Define plain-language message variations for owners, entrepreneurs, and local service businesses, including pains, questions, examples, objections, and low-pressure calls to action.",
    owner: "Jeremy — content lead",
    minutes: 60,
    priority: "high",
    steps: [
      "1. Write a problem, insight, example, and next-step pattern for each audience.",
      "2. Connect messages to the self-assessed Blueprint gaps.",
      "3. Flag claims that need evidence or client permission before public use.",
    ],
    doneWhen:
      "A messaging guide distinguishes audiences and gives writers a truthful, helpful message pattern.",
    dependsOn: ["ddb-content-editorial-strategy"],
    requiresApproval: false,
  },
  {
    slug: "ddb-content-brand-voice",
    phase: "first_30",
    category: "educational_content",
    title: "Set brand voice and message guardrails",
    description:
      "Document a curious, practical, clear voice that explains complex marketing without hype, keeps Build Your Life distinct, and avoids claims of guaranteed business results.",
    owner: "Jeremy — brand lead",
    minutes: 45,
    priority: "high",
    steps: [
      "1. Define voice traits, preferred phrases, and phrases to avoid.",
      "2. Add proof, permissions, accessibility, and disclosure rules.",
      "3. Provide a short before-and-after example for contributors.",
    ],
    doneWhen:
      "A usable voice guide makes the educational tone consistent and sets outcome-claim guardrails.",
    dependsOn: ["ddb-content-audience-messaging"],
    requiresApproval: false,
  },
  {
    slug: "ddb-content-channel-priorities",
    phase: "first_30",
    category: "educational_content",
    title: "Choose channels using an evidence-ready prioritization rubric",
    description:
      "Create a rubric for Facebook, Instagram, LinkedIn, YouTube, Shorts, TikTok, website, email, SMS with consent, and local communities based on audience fit, production cost, reuse potential, and observed results—not equal effort by default.",
    owner: "Jeremy — distribution lead",
    minutes: 60,
    priority: "normal",
    steps: [
      "1. List channel purpose, audience, asset requirement, and review metric.",
      "2. Add consent and platform-policy checks where needed.",
      "3. Leave prioritization decisions open until actual evidence is available.",
    ],
    doneWhen:
      "A channel rubric is ready to select focused distribution without unsupported platform assumptions.",
    dependsOn: ["ddb-content-brand-voice"],
    requiresApproval: false,
  },
  {
    slug: "ddb-content-production-workflow",
    phase: "first_30",
    category: "educational_content",
    title: "Build the content workflow and creative production checklist",
    description:
      "Define a small-batch workflow from idea to evidence check, production, owner review, asset preparation, and archive; include a creative-production checklist that protects quality and permissions.",
    owner: "Jeremy — production lead",
    minutes: 60,
    priority: "high",
    steps: [
      "1. Name the intake, brief, draft, review, asset, and archive stages.",
      "2. Add visual, audio, accessibility, rights, and factual-evidence checks.",
      "3. Set a handoff rule for owner approval before public use.",
    ],
    doneWhen:
      "A small-batch workflow and creative checklist make each future asset reviewable before release.",
    dependsOn: ["ddb-content-channel-priorities"],
    requiresApproval: false,
  },
  {
    slug: "ddb-content-repurpose-qa-cta",
    phase: "first_30",
    category: "educational_content",
    title: "Create the repurposing, CTA, and publishing-QC system",
    description:
      "Define how one approved pillar asset becomes clips, posts, newsletter topics, and event follow-ups; create platform-specific CTA guidance and a publishing quality-control checklist without scheduling or posting anything.",
    owner: "Jeremy — distribution lead",
    minutes: 60,
    priority: "high",
    steps: [
      "1. Map each source asset to possible derivative formats.",
      "2. Draft platform-specific CTA choices and consent requirements.",
      "3. Add factual, link, caption, accessibility, approval, and archive checks.",
    ],
    doneWhen:
      "A repurposing map, CTA guide, and publishing-QC checklist are ready for approved future content.",
    dependsOn: ["ddb-content-production-workflow"],
    requiresApproval: false,
  },
  {
    slug: "ddb-content-ideas-01",
    phase: "first_30",
    category: "educational_content",
    title: "Develop content ideas 1–10 of 100",
    description:
      "Create original Blueprint-mapped content ideas 1–10 of the required 100, emphasizing Foundation; tag each with pillar, journey stage, audience, format, and a helpful next step.",
    owner: "Jeremy — content lead",
    minutes: 45,
    priority: "high",
    steps: [
      "1. Generate 10 distinct owner questions for the Foundation theme.",
      "2. Map each idea to a Blueprint component, content pillar, and journey stage.",
      "3. Remove duplicates and unsupported result claims.",
    ],
    doneWhen:
      "Ideas 1–10 are logged in the content library with complete mapping fields.",
    dependsOn: ["ddb-content-repurpose-qa-cta"],
    requiresApproval: false,
  },
  {
    slug: "ddb-content-ideas-02",
    phase: "first_30",
    category: "educational_content",
    title: "Develop content ideas 11–20 of 100",
    description:
      "Create original Blueprint-mapped content ideas 11–20 of the required 100, emphasizing Foundation; tag each with pillar, journey stage, audience, format, and a helpful next step.",
    owner: "Jeremy — content lead",
    minutes: 45,
    priority: "high",
    steps: [
      "1. Generate 10 distinct owner questions for the Foundation theme.",
      "2. Map each idea to a Blueprint component, content pillar, and journey stage.",
      "3. Remove duplicates and unsupported result claims.",
    ],
    doneWhen:
      "Ideas 11–20 are logged in the content library with complete mapping fields.",
    dependsOn: ["ddb-content-ideas-01"],
    requiresApproval: false,
  },
  {
    slug: "ddb-content-ideas-03",
    phase: "first_30",
    category: "educational_content",
    title: "Develop content ideas 21–30 of 100",
    description:
      "Create original Blueprint-mapped content ideas 21–30 of the required 100, emphasizing Growth; tag each with pillar, journey stage, audience, format, and a helpful next step.",
    owner: "Jeremy — content lead",
    minutes: 45,
    priority: "high",
    steps: [
      "1. Generate 10 distinct owner questions for the Growth theme.",
      "2. Map each idea to a Blueprint component, content pillar, and journey stage.",
      "3. Remove duplicates and unsupported result claims.",
    ],
    doneWhen:
      "Ideas 21–30 are logged in the content library with complete mapping fields.",
    dependsOn: ["ddb-content-ideas-02"],
    requiresApproval: false,
  },
  {
    slug: "ddb-content-ideas-04",
    phase: "first_30",
    category: "educational_content",
    title: "Develop content ideas 31–40 of 100",
    description:
      "Create original Blueprint-mapped content ideas 31–40 of the required 100, emphasizing Growth; tag each with pillar, journey stage, audience, format, and a helpful next step.",
    owner: "Jeremy — content lead",
    minutes: 45,
    priority: "high",
    steps: [
      "1. Generate 10 distinct owner questions for the Growth theme.",
      "2. Map each idea to a Blueprint component, content pillar, and journey stage.",
      "3. Remove duplicates and unsupported result claims.",
    ],
    doneWhen:
      "Ideas 31–40 are logged in the content library with complete mapping fields.",
    dependsOn: ["ddb-content-ideas-03"],
    requiresApproval: false,
  },
  {
    slug: "ddb-content-ideas-05",
    phase: "days_31_60",
    category: "educational_content",
    title: "Develop content ideas 41–50 of 100",
    description:
      "Create original Blueprint-mapped content ideas 41–50 of the required 100, emphasizing Optimization; tag each with pillar, journey stage, audience, format, and a helpful next step.",
    owner: "Jeremy — content lead",
    minutes: 45,
    priority: "normal",
    steps: [
      "1. Generate 10 distinct owner questions for the Optimization theme.",
      "2. Map each idea to a Blueprint component, content pillar, and journey stage.",
      "3. Remove duplicates and unsupported result claims.",
    ],
    doneWhen:
      "Ideas 41–50 are logged in the content library with complete mapping fields.",
    dependsOn: ["ddb-content-ideas-04"],
    requiresApproval: false,
  },
  {
    slug: "ddb-content-ideas-06",
    phase: "days_31_60",
    category: "educational_content",
    title: "Develop content ideas 51–60 of 100",
    description:
      "Create original Blueprint-mapped content ideas 51–60 of the required 100, emphasizing Optimization; tag each with pillar, journey stage, audience, format, and a helpful next step.",
    owner: "Jeremy — content lead",
    minutes: 45,
    priority: "normal",
    steps: [
      "1. Generate 10 distinct owner questions for the Optimization theme.",
      "2. Map each idea to a Blueprint component, content pillar, and journey stage.",
      "3. Remove duplicates and unsupported result claims.",
    ],
    doneWhen:
      "Ideas 51–60 are logged in the content library with complete mapping fields.",
    dependsOn: ["ddb-content-ideas-05"],
    requiresApproval: false,
  },
  {
    slug: "ddb-content-ideas-07",
    phase: "days_31_60",
    category: "educational_content",
    title: "Develop content ideas 61–70 of 100",
    description:
      "Create original Blueprint-mapped content ideas 61–70 of the required 100, emphasizing Make Marketing Easy; tag each with pillar, journey stage, audience, format, and a helpful next step.",
    owner: "Jeremy — content lead",
    minutes: 45,
    priority: "normal",
    steps: [
      "1. Generate 10 distinct owner questions for the Make Marketing Easy theme.",
      "2. Map each idea to a Blueprint component, content pillar, and journey stage.",
      "3. Remove duplicates and unsupported result claims.",
    ],
    doneWhen:
      "Ideas 61–70 are logged in the content library with complete mapping fields.",
    dependsOn: ["ddb-content-ideas-06"],
    requiresApproval: false,
  },
  {
    slug: "ddb-content-ideas-08",
    phase: "days_31_60",
    category: "educational_content",
    title: "Develop content ideas 71–80 of 100",
    description:
      "Create original Blueprint-mapped content ideas 71–80 of the required 100, emphasizing Build Your Life; tag each with pillar, journey stage, audience, format, and a helpful next step.",
    owner: "Jeremy — content lead",
    minutes: 45,
    priority: "normal",
    steps: [
      "1. Generate 10 distinct owner questions for the Build Your Life theme.",
      "2. Map each idea to a Blueprint component, content pillar, and journey stage.",
      "3. Remove duplicates and unsupported result claims.",
    ],
    doneWhen:
      "Ideas 71–80 are logged in the content library with complete mapping fields.",
    dependsOn: ["ddb-content-ideas-07"],
    requiresApproval: false,
  },
  {
    slug: "ddb-content-ideas-09",
    phase: "days_61_90",
    category: "educational_content",
    title: "Develop content ideas 81–90 of 100",
    description:
      "Create original Blueprint-mapped content ideas 81–90 of the required 100, emphasizing Real Business Transformation; tag each with pillar, journey stage, audience, format, and a helpful next step.",
    owner: "Jeremy — content lead",
    minutes: 45,
    priority: "normal",
    steps: [
      "1. Generate 10 distinct owner questions for the Real Business Transformation theme.",
      "2. Map each idea to a Blueprint component, content pillar, and journey stage.",
      "3. Remove duplicates and unsupported result claims.",
    ],
    doneWhen:
      "Ideas 81–90 are logged in the content library with complete mapping fields.",
    dependsOn: ["ddb-content-ideas-08"],
    requiresApproval: false,
  },
  {
    slug: "ddb-content-ideas-10",
    phase: "days_61_90",
    category: "educational_content",
    title: "Develop content ideas 91–100 of 100",
    description:
      "Create original Blueprint-mapped content ideas 91–100 of the required 100, emphasizing The Creative Entrepreneur; tag each with pillar, journey stage, audience, format, and a helpful next step.",
    owner: "Jeremy — content lead",
    minutes: 45,
    priority: "normal",
    steps: [
      "1. Generate 10 distinct owner questions for the The Creative Entrepreneur theme.",
      "2. Map each idea to a Blueprint component, content pillar, and journey stage.",
      "3. Remove duplicates and unsupported result claims.",
    ],
    doneWhen:
      "Ideas 91–100 are logged in the content library with complete mapping fields.",
    dependsOn: ["ddb-content-ideas-09"],
    requiresApproval: false,
  },
  {
    slug: "ddb-content-short-scripts-01",
    phase: "days_31_60",
    category: "educational_content",
    title: "Draft short-form video scripts 1–5 of 30",
    description:
      "Draft scripts 1–5 of the required 30 short-form videos; every script includes a hook, spoken copy, suggested visuals, caption, and call to action.",
    owner: "Jeremy — content lead",
    minutes: 60,
    priority: "high",
    steps: [
      "1. Select five approved ideas from the 100-idea library.",
      "2. Write hook, spoken copy, visuals, caption, and CTA for each script.",
      "3. Run voice, factual, and production-feasibility checks before owner review.",
    ],
    doneWhen:
      "Scripts 1–5 contain all five required fields and are ready for internal approval, not publication.",
    dependsOn: ["ddb-content-ideas-10"],
    requiresApproval: true,
  },
  {
    slug: "ddb-content-short-scripts-02",
    phase: "days_31_60",
    category: "educational_content",
    title: "Draft short-form video scripts 6–10 of 30",
    description:
      "Draft scripts 6–10 of the required 30 short-form videos; every script includes a hook, spoken copy, suggested visuals, caption, and call to action.",
    owner: "Jeremy — content lead",
    minutes: 60,
    priority: "high",
    steps: [
      "1. Select five approved ideas from the 100-idea library.",
      "2. Write hook, spoken copy, visuals, caption, and CTA for each script.",
      "3. Run voice, factual, and production-feasibility checks before owner review.",
    ],
    doneWhen:
      "Scripts 6–10 contain all five required fields and are ready for internal approval, not publication.",
    dependsOn: ["ddb-content-ideas-10"],
    requiresApproval: true,
  },
  {
    slug: "ddb-content-short-scripts-03",
    phase: "days_31_60",
    category: "educational_content",
    title: "Draft short-form video scripts 11–15 of 30",
    description:
      "Draft scripts 11–15 of the required 30 short-form videos; every script includes a hook, spoken copy, suggested visuals, caption, and call to action.",
    owner: "Jeremy — content lead",
    minutes: 60,
    priority: "high",
    steps: [
      "1. Select five approved ideas from the 100-idea library.",
      "2. Write hook, spoken copy, visuals, caption, and CTA for each script.",
      "3. Run voice, factual, and production-feasibility checks before owner review.",
    ],
    doneWhen:
      "Scripts 11–15 contain all five required fields and are ready for internal approval, not publication.",
    dependsOn: ["ddb-content-ideas-10"],
    requiresApproval: true,
  },
  {
    slug: "ddb-content-short-scripts-04",
    phase: "days_31_60",
    category: "educational_content",
    title: "Draft short-form video scripts 16–20 of 30",
    description:
      "Draft scripts 16–20 of the required 30 short-form videos; every script includes a hook, spoken copy, suggested visuals, caption, and call to action.",
    owner: "Jeremy — content lead",
    minutes: 60,
    priority: "normal",
    steps: [
      "1. Select five approved ideas from the 100-idea library.",
      "2. Write hook, spoken copy, visuals, caption, and CTA for each script.",
      "3. Run voice, factual, and production-feasibility checks before owner review.",
    ],
    doneWhen:
      "Scripts 16–20 contain all five required fields and are ready for internal approval, not publication.",
    dependsOn: ["ddb-content-ideas-10"],
    requiresApproval: true,
  },
  {
    slug: "ddb-content-short-scripts-05",
    phase: "days_31_60",
    category: "educational_content",
    title: "Draft short-form video scripts 21–25 of 30",
    description:
      "Draft scripts 21–25 of the required 30 short-form videos; every script includes a hook, spoken copy, suggested visuals, caption, and call to action.",
    owner: "Jeremy — content lead",
    minutes: 60,
    priority: "normal",
    steps: [
      "1. Select five approved ideas from the 100-idea library.",
      "2. Write hook, spoken copy, visuals, caption, and CTA for each script.",
      "3. Run voice, factual, and production-feasibility checks before owner review.",
    ],
    doneWhen:
      "Scripts 21–25 contain all five required fields and are ready for internal approval, not publication.",
    dependsOn: ["ddb-content-ideas-10"],
    requiresApproval: true,
  },
  {
    slug: "ddb-content-short-scripts-06",
    phase: "days_31_60",
    category: "educational_content",
    title: "Draft short-form video scripts 26–30 of 30",
    description:
      "Draft scripts 26–30 of the required 30 short-form videos; every script includes a hook, spoken copy, suggested visuals, caption, and call to action.",
    owner: "Jeremy — content lead",
    minutes: 60,
    priority: "normal",
    steps: [
      "1. Select five approved ideas from the 100-idea library.",
      "2. Write hook, spoken copy, visuals, caption, and CTA for each script.",
      "3. Run voice, factual, and production-feasibility checks before owner review.",
    ],
    doneWhen:
      "Scripts 26–30 contain all five required fields and are ready for internal approval, not publication.",
    dependsOn: ["ddb-content-ideas-10"],
    requiresApproval: true,
  },
  {
    slug: "ddb-content-long-outlines-01",
    phase: "days_31_60",
    category: "educational_content",
    title: "Draft long-form outlines 1–4 of 12",
    description:
      "Draft outlines 1–4 of the required 12 long-form videos or educational presentations, with audience, learning arc, examples, engagement, asset needs, and CTA.",
    owner: "Jeremy — education lead",
    minutes: 60,
    priority: "normal",
    steps: [
      "1. Choose four high-value topics from the mapped idea library.",
      "2. Build an opening, teaching arc, concrete examples, engagement, and CTA for each.",
      "3. Mark evidence, visual, and approval requirements before production.",
    ],
    doneWhen:
      "Outlines 1–4 provide a complete educational structure and production brief.",
    dependsOn: ["ddb-content-short-scripts-06"],
    requiresApproval: true,
  },
  {
    slug: "ddb-content-long-outlines-02",
    phase: "days_31_60",
    category: "educational_content",
    title: "Draft long-form outlines 5–8 of 12",
    description:
      "Draft outlines 5–8 of the required 12 long-form videos or educational presentations, with audience, learning arc, examples, engagement, asset needs, and CTA.",
    owner: "Jeremy — education lead",
    minutes: 60,
    priority: "normal",
    steps: [
      "1. Choose four high-value topics from the mapped idea library.",
      "2. Build an opening, teaching arc, concrete examples, engagement, and CTA for each.",
      "3. Mark evidence, visual, and approval requirements before production.",
    ],
    doneWhen:
      "Outlines 5–8 provide a complete educational structure and production brief.",
    dependsOn: ["ddb-content-short-scripts-06"],
    requiresApproval: true,
  },
  {
    slug: "ddb-content-long-outlines-03",
    phase: "days_31_60",
    category: "educational_content",
    title: "Draft long-form outlines 9–12 of 12",
    description:
      "Draft outlines 9–12 of the required 12 long-form videos or educational presentations, with audience, learning arc, examples, engagement, asset needs, and CTA.",
    owner: "Jeremy — education lead",
    minutes: 60,
    priority: "normal",
    steps: [
      "1. Choose four high-value topics from the mapped idea library.",
      "2. Build an opening, teaching arc, concrete examples, engagement, and CTA for each.",
      "3. Mark evidence, visual, and approval requirements before production.",
    ],
    doneWhen:
      "Outlines 9–12 provide a complete educational structure and production brief.",
    dependsOn: ["ddb-content-short-scripts-06"],
    requiresApproval: true,
  },
  {
    slug: "ddb-content-social-posts-01",
    phase: "days_31_60",
    category: "educational_content",
    title: "Draft social posts 1–5 of 20",
    description:
      "Draft posts 1–5 of the required 20 ready-to-publish social posts; each records purpose, target audience, format, platform, required assets, responsible person, and status.",
    owner: "Jeremy — distribution lead",
    minutes: 45,
    priority: "normal",
    steps: [
      "1. Select five ideas with a clear owner takeaway.",
      "2. Draft copy and complete the required scheduling metadata for each post.",
      "3. Verify the public claim, CTA, assets, and approval need.",
    ],
    doneWhen:
      "Posts 1–5 include complete metadata and are awaiting explicit publishing approval.",
    dependsOn: ["ddb-content-long-outlines-03"],
    requiresApproval: true,
  },
  {
    slug: "ddb-content-social-posts-02",
    phase: "days_31_60",
    category: "educational_content",
    title: "Draft social posts 6–10 of 20",
    description:
      "Draft posts 6–10 of the required 20 ready-to-publish social posts; each records purpose, target audience, format, platform, required assets, responsible person, and status.",
    owner: "Jeremy — distribution lead",
    minutes: 45,
    priority: "normal",
    steps: [
      "1. Select five ideas with a clear owner takeaway.",
      "2. Draft copy and complete the required scheduling metadata for each post.",
      "3. Verify the public claim, CTA, assets, and approval need.",
    ],
    doneWhen:
      "Posts 6–10 include complete metadata and are awaiting explicit publishing approval.",
    dependsOn: ["ddb-content-long-outlines-03"],
    requiresApproval: true,
  },
  {
    slug: "ddb-content-social-posts-03",
    phase: "days_31_60",
    category: "educational_content",
    title: "Draft social posts 11–15 of 20",
    description:
      "Draft posts 11–15 of the required 20 ready-to-publish social posts; each records purpose, target audience, format, platform, required assets, responsible person, and status.",
    owner: "Jeremy — distribution lead",
    minutes: 45,
    priority: "normal",
    steps: [
      "1. Select five ideas with a clear owner takeaway.",
      "2. Draft copy and complete the required scheduling metadata for each post.",
      "3. Verify the public claim, CTA, assets, and approval need.",
    ],
    doneWhen:
      "Posts 11–15 include complete metadata and are awaiting explicit publishing approval.",
    dependsOn: ["ddb-content-long-outlines-03"],
    requiresApproval: true,
  },
  {
    slug: "ddb-content-social-posts-04",
    phase: "days_31_60",
    category: "educational_content",
    title: "Draft social posts 16–20 of 20",
    description:
      "Draft posts 16–20 of the required 20 ready-to-publish social posts; each records purpose, target audience, format, platform, required assets, responsible person, and status.",
    owner: "Jeremy — distribution lead",
    minutes: 45,
    priority: "normal",
    steps: [
      "1. Select five ideas with a clear owner takeaway.",
      "2. Draft copy and complete the required scheduling metadata for each post.",
      "3. Verify the public claim, CTA, assets, and approval need.",
    ],
    doneWhen:
      "Posts 16–20 include complete metadata and are awaiting explicit publishing approval.",
    dependsOn: ["ddb-content-long-outlines-03"],
    requiresApproval: true,
  },
  {
    slug: "ddb-content-carousels-01",
    phase: "days_31_60",
    category: "educational_content",
    title: "Draft carousel concepts 1–5 of 10",
    description:
      "Draft carousel concepts 1–5 of the required 10, including complete slide copy, visual direction, caption, CTA, and evidence or permission notes.",
    owner: "Jeremy — production lead",
    minutes: 60,
    priority: "normal",
    steps: [
      "1. Select five multi-step educational topics.",
      "2. Write complete slide-by-slide copy and visual direction.",
      "3. Check readability, rights, and public-approval requirements.",
    ],
    doneWhen:
      "Carousel concepts 1–5 have complete slide copy and are ready for design review.",
    dependsOn: ["ddb-content-social-posts-04"],
    requiresApproval: true,
  },
  {
    slug: "ddb-content-carousels-02",
    phase: "days_31_60",
    category: "educational_content",
    title: "Draft carousel concepts 6–10 of 10",
    description:
      "Draft carousel concepts 6–10 of the required 10, including complete slide copy, visual direction, caption, CTA, and evidence or permission notes.",
    owner: "Jeremy — production lead",
    minutes: 60,
    priority: "normal",
    steps: [
      "1. Select five multi-step educational topics.",
      "2. Write complete slide-by-slide copy and visual direction.",
      "3. Check readability, rights, and public-approval requirements.",
    ],
    doneWhen:
      "Carousel concepts 6–10 have complete slide copy and are ready for design review.",
    dependsOn: ["ddb-content-social-posts-04"],
    requiresApproval: true,
  },
  {
    slug: "ddb-content-newsletters-01",
    phase: "days_61_90",
    category: "educational_content",
    title: "Draft newsletter editions 1–4 of 12",
    description:
      "Draft newsletter editions 1–4 of the required 12 with subject line options, owner lesson, primary resource, CTA, consent-aware send note, and measurement fields.",
    owner: "Jeremy — content lead",
    minutes: 60,
    priority: "normal",
    steps: [
      "1. Select four lessons that stand alone for an opted-in reader.",
      "2. Draft subject options, body, resource link placeholder, and CTA.",
      "3. Check consent, sender, opt-out, evidence, and owner approval requirements.",
    ],
    doneWhen:
      "Newsletter editions 1–4 are complete drafts; no message has been scheduled or sent.",
    dependsOn: ["ddb-content-carousels-02"],
    requiresApproval: true,
  },
  {
    slug: "ddb-content-newsletters-02",
    phase: "days_61_90",
    category: "educational_content",
    title: "Draft newsletter editions 5–8 of 12",
    description:
      "Draft newsletter editions 5–8 of the required 12 with subject line options, owner lesson, primary resource, CTA, consent-aware send note, and measurement fields.",
    owner: "Jeremy — content lead",
    minutes: 60,
    priority: "normal",
    steps: [
      "1. Select four lessons that stand alone for an opted-in reader.",
      "2. Draft subject options, body, resource link placeholder, and CTA.",
      "3. Check consent, sender, opt-out, evidence, and owner approval requirements.",
    ],
    doneWhen:
      "Newsletter editions 5–8 are complete drafts; no message has been scheduled or sent.",
    dependsOn: ["ddb-content-carousels-02"],
    requiresApproval: true,
  },
  {
    slug: "ddb-content-newsletters-03",
    phase: "days_61_90",
    category: "educational_content",
    title: "Draft newsletter editions 9–12 of 12",
    description:
      "Draft newsletter editions 9–12 of the required 12 with subject line options, owner lesson, primary resource, CTA, consent-aware send note, and measurement fields.",
    owner: "Jeremy — content lead",
    minutes: 60,
    priority: "normal",
    steps: [
      "1. Select four lessons that stand alone for an opted-in reader.",
      "2. Draft subject options, body, resource link placeholder, and CTA.",
      "3. Check consent, sender, opt-out, evidence, and owner approval requirements.",
    ],
    doneWhen:
      "Newsletter editions 9–12 are complete drafts; no message has been scheduled or sent.",
    dependsOn: ["ddb-content-carousels-02"],
    requiresApproval: true,
  },
  {
    slug: "ddb-content-article-briefs-01",
    phase: "days_61_90",
    category: "educational_content",
    title: "Draft SEO article briefs 1–4 of 12",
    description:
      "Draft SEO-focused article briefs 1–4 of the required 12 with owner question, intent hypothesis, outline, evidence needs, internal links, CTA, and review metric; no ranking outcome is implied.",
    owner: "Jeremy — content lead",
    minutes: 60,
    priority: "normal",
    steps: [
      "1. Select four owner questions from the content library.",
      "2. Define the outline, evidence requirement, internal-link opportunity, and CTA.",
      "3. Flag any research or public claim needing validation before writing.",
    ],
    doneWhen:
      "Article briefs 1–4 are ready for evidence-backed drafting without an SEO guarantee.",
    dependsOn: ["ddb-content-newsletters-03"],
    requiresApproval: true,
  },
  {
    slug: "ddb-content-article-briefs-02",
    phase: "days_61_90",
    category: "educational_content",
    title: "Draft SEO article briefs 5–8 of 12",
    description:
      "Draft SEO-focused article briefs 5–8 of the required 12 with owner question, intent hypothesis, outline, evidence needs, internal links, CTA, and review metric; no ranking outcome is implied.",
    owner: "Jeremy — content lead",
    minutes: 60,
    priority: "normal",
    steps: [
      "1. Select four owner questions from the content library.",
      "2. Define the outline, evidence requirement, internal-link opportunity, and CTA.",
      "3. Flag any research or public claim needing validation before writing.",
    ],
    doneWhen:
      "Article briefs 5–8 are ready for evidence-backed drafting without an SEO guarantee.",
    dependsOn: ["ddb-content-newsletters-03"],
    requiresApproval: true,
  },
  {
    slug: "ddb-content-article-briefs-03",
    phase: "days_61_90",
    category: "educational_content",
    title: "Draft SEO article briefs 9–12 of 12",
    description:
      "Draft SEO-focused article briefs 9–12 of the required 12 with owner question, intent hypothesis, outline, evidence needs, internal links, CTA, and review metric; no ranking outcome is implied.",
    owner: "Jeremy — content lead",
    minutes: 60,
    priority: "normal",
    steps: [
      "1. Select four owner questions from the content library.",
      "2. Define the outline, evidence requirement, internal-link opportunity, and CTA.",
      "3. Flag any research or public claim needing validation before writing.",
    ],
    doneWhen:
      "Article briefs 9–12 are ready for evidence-backed drafting without an SEO guarantee.",
    dependsOn: ["ddb-content-newsletters-03"],
    requiresApproval: true,
  },
  {
    slug: "ddb-content-flagship-01",
    phase: "days_61_90",
    category: "educational_content",
    title: "Draft flagship article 1 of 5",
    description:
      "Draft flagship blog article 1 of the required five, using one approved article brief, original explanation, practical examples, source notes, internal links, and a low-pressure CTA.",
    owner: "Jeremy — content lead",
    minutes: 90,
    priority: "high",
    steps: [
      "1. Choose an approved article brief and verify needed evidence.",
      "2. Write the article with an owner-first teaching structure and source notes.",
      "3. Run voice, accessibility, IP, link, and approval checks before release.",
    ],
    doneWhen:
      "Flagship article 1 is a complete internal draft with source notes and no public publication.",
    dependsOn: ["ddb-content-article-briefs-03"],
    requiresApproval: true,
  },
  {
    slug: "ddb-content-flagship-02",
    phase: "days_61_90",
    category: "educational_content",
    title: "Draft flagship article 2 of 5",
    description:
      "Draft flagship blog article 2 of the required five, using one approved article brief, original explanation, practical examples, source notes, internal links, and a low-pressure CTA.",
    owner: "Jeremy — content lead",
    minutes: 90,
    priority: "high",
    steps: [
      "1. Choose an approved article brief and verify needed evidence.",
      "2. Write the article with an owner-first teaching structure and source notes.",
      "3. Run voice, accessibility, IP, link, and approval checks before release.",
    ],
    doneWhen:
      "Flagship article 2 is a complete internal draft with source notes and no public publication.",
    dependsOn: ["ddb-content-article-briefs-03"],
    requiresApproval: true,
  },
  {
    slug: "ddb-content-flagship-03",
    phase: "days_61_90",
    category: "educational_content",
    title: "Draft flagship article 3 of 5",
    description:
      "Draft flagship blog article 3 of the required five, using one approved article brief, original explanation, practical examples, source notes, internal links, and a low-pressure CTA.",
    owner: "Jeremy — content lead",
    minutes: 90,
    priority: "normal",
    steps: [
      "1. Choose an approved article brief and verify needed evidence.",
      "2. Write the article with an owner-first teaching structure and source notes.",
      "3. Run voice, accessibility, IP, link, and approval checks before release.",
    ],
    doneWhen:
      "Flagship article 3 is a complete internal draft with source notes and no public publication.",
    dependsOn: ["ddb-content-article-briefs-03"],
    requiresApproval: true,
  },
  {
    slug: "ddb-content-flagship-04",
    phase: "days_61_90",
    category: "educational_content",
    title: "Draft flagship article 4 of 5",
    description:
      "Draft flagship blog article 4 of the required five, using one approved article brief, original explanation, practical examples, source notes, internal links, and a low-pressure CTA.",
    owner: "Jeremy — content lead",
    minutes: 90,
    priority: "normal",
    steps: [
      "1. Choose an approved article brief and verify needed evidence.",
      "2. Write the article with an owner-first teaching structure and source notes.",
      "3. Run voice, accessibility, IP, link, and approval checks before release.",
    ],
    doneWhen:
      "Flagship article 4 is a complete internal draft with source notes and no public publication.",
    dependsOn: ["ddb-content-article-briefs-03"],
    requiresApproval: true,
  },
  {
    slug: "ddb-content-flagship-05",
    phase: "days_61_90",
    category: "educational_content",
    title: "Draft flagship article 5 of 5",
    description:
      "Draft flagship blog article 5 of the required five, using one approved article brief, original explanation, practical examples, source notes, internal links, and a low-pressure CTA.",
    owner: "Jeremy — content lead",
    minutes: 90,
    priority: "normal",
    steps: [
      "1. Choose an approved article brief and verify needed evidence.",
      "2. Write the article with an owner-first teaching structure and source notes.",
      "3. Run voice, accessibility, IP, link, and approval checks before release.",
    ],
    doneWhen:
      "Flagship article 5 is a complete internal draft with source notes and no public publication.",
    dependsOn: ["ddb-content-article-briefs-03"],
    requiresApproval: true,
  },
  {
    slug: "ddb-content-case-concepts-01",
    phase: "days_61_90",
    category: "educational_content",
    title: "Outline evidence-backed case concepts 1–2 of 10",
    description:
      "Outline case-study or client-story concepts 1–2 of the required 10 using only verified material, documented permissions, and attributable outcomes; no client story is published in this task.",
    owner: "Jeremy — evidence lead",
    minutes: 45,
    priority: "normal",
    steps: [
      "1. Identify two possible stories and list the evidence and permission needed for each.",
      "2. Separate verified facts from claims that require client approval.",
      "3. Draft the teaching angle, asset need, and no-results-guarantee note.",
    ],
    doneWhen:
      "Case concepts 1–2 are evidence and permission-gated before any public use.",
    dependsOn: ["ddb-content-flagship-05"],
    requiresApproval: true,
  },
  {
    slug: "ddb-content-case-concepts-02",
    phase: "days_61_90",
    category: "educational_content",
    title: "Outline evidence-backed case concepts 3–4 of 10",
    description:
      "Outline case-study or client-story concepts 3–4 of the required 10 using only verified material, documented permissions, and attributable outcomes; no client story is published in this task.",
    owner: "Jeremy — evidence lead",
    minutes: 45,
    priority: "normal",
    steps: [
      "1. Identify two possible stories and list the evidence and permission needed for each.",
      "2. Separate verified facts from claims that require client approval.",
      "3. Draft the teaching angle, asset need, and no-results-guarantee note.",
    ],
    doneWhen:
      "Case concepts 3–4 are evidence and permission-gated before any public use.",
    dependsOn: ["ddb-content-flagship-05"],
    requiresApproval: true,
  },
  {
    slug: "ddb-content-case-concepts-03",
    phase: "days_61_90",
    category: "educational_content",
    title: "Outline evidence-backed case concepts 5–6 of 10",
    description:
      "Outline case-study or client-story concepts 5–6 of the required 10 using only verified material, documented permissions, and attributable outcomes; no client story is published in this task.",
    owner: "Jeremy — evidence lead",
    minutes: 45,
    priority: "normal",
    steps: [
      "1. Identify two possible stories and list the evidence and permission needed for each.",
      "2. Separate verified facts from claims that require client approval.",
      "3. Draft the teaching angle, asset need, and no-results-guarantee note.",
    ],
    doneWhen:
      "Case concepts 5–6 are evidence and permission-gated before any public use.",
    dependsOn: ["ddb-content-flagship-05"],
    requiresApproval: true,
  },
  {
    slug: "ddb-content-case-concepts-04",
    phase: "days_61_90",
    category: "educational_content",
    title: "Outline evidence-backed case concepts 7–8 of 10",
    description:
      "Outline case-study or client-story concepts 7–8 of the required 10 using only verified material, documented permissions, and attributable outcomes; no client story is published in this task.",
    owner: "Jeremy — evidence lead",
    minutes: 45,
    priority: "normal",
    steps: [
      "1. Identify two possible stories and list the evidence and permission needed for each.",
      "2. Separate verified facts from claims that require client approval.",
      "3. Draft the teaching angle, asset need, and no-results-guarantee note.",
    ],
    doneWhen:
      "Case concepts 7–8 are evidence and permission-gated before any public use.",
    dependsOn: ["ddb-content-flagship-05"],
    requiresApproval: true,
  },
  {
    slug: "ddb-content-case-concepts-05",
    phase: "days_61_90",
    category: "educational_content",
    title: "Outline evidence-backed case concepts 9–10 of 10",
    description:
      "Outline case-study or client-story concepts 9–10 of the required 10 using only verified material, documented permissions, and attributable outcomes; no client story is published in this task.",
    owner: "Jeremy — evidence lead",
    minutes: 45,
    priority: "normal",
    steps: [
      "1. Identify two possible stories and list the evidence and permission needed for each.",
      "2. Separate verified facts from claims that require client approval.",
      "3. Draft the teaching angle, asset need, and no-results-guarantee note.",
    ],
    doneWhen:
      "Case concepts 9–10 are evidence and permission-gated before any public use.",
    dependsOn: ["ddb-content-flagship-05"],
    requiresApproval: true,
  },
  {
    slug: "ddb-content-calendar-30",
    phase: "days_61_90",
    category: "educational_content",
    title: "Build the 30-day launch content calendar",
    description:
      "Create a 30-day draft calendar from approved content batches; every proposed post records purpose, target audience, format, platform, required assets, responsible person, status, and manual approval gate.",
    owner: "Jeremy — distribution lead",
    minutes: 60,
    priority: "high",
    steps: [
      "1. Select a realistic set of ready or planned assets.",
      "2. Complete all required metadata for each proposed post.",
      "3. Leave dates, schedules, and publishing actions unset until explicitly approved.",
    ],
    doneWhen:
      "A 30-day draft calendar is complete and clearly marked as unscheduled.",
    dependsOn: ["ddb-content-case-concepts-05"],
    requiresApproval: true,
  },
  {
    slug: "ddb-content-calendar-90",
    phase: "days_61_90",
    category: "educational_content",
    title: "Build the 90-day content calendar",
    description:
      "Create a 90-day rolling draft calendar that sequences education, speaking reuse, relationship follow-ups, and lead resources with capacity, evidence, and approval checks.",
    owner: "Jeremy — distribution lead",
    minutes: 60,
    priority: "normal",
    steps: [
      "1. Roll the 30-day structure into three reviewable monthly themes.",
      "2. Complete purpose, audience, format, platform, assets, owner, and status fields.",
      "3. Mark every proposed public action as pending manual approval and schedule confirmation.",
    ],
    doneWhen:
      "A 90-day content calendar is a capacity-aware planning draft, not an active publishing schedule.",
    dependsOn: ["ddb-content-calendar-30"],
    requiresApproval: true,
  },
  {
    slug: "ddb-speaking-platform-brief",
    phase: "first_30",
    category: "speaking",
    title: "Define the signature speaking platform and venue-review rules",
    description:
      "Create the practical Make Marketing Easy message and differentiating Build Your Life, Not Just Your Business philosophy; define source, relevance, accessibility, and contact-verification rules for later opportunity research.",
    owner: "Jeremy — speaker lead",
    minutes: 60,
    priority: "high",
    steps: [
      "1. Write the practical message and differentiating philosophy in plain language.",
      "2. Define the audience problem, learning promise, and Blueprint invitation.",
      "3. Set source and verification fields before researching any venue.",
    ],
    doneWhen:
      "A speaking-platform brief and opportunity-review rules exist without claiming any venue, event, contact, or opening.",
    dependsOn: ["ddb-gtm-90-day-roadmap"],
    requiresApproval: false,
  },
  {
    slug: "ddb-speaking-talk-05",
    phase: "first_30",
    category: "speaking",
    title: "Draft the five-minute Blueprint introduction",
    description:
      "Draft the required five-minute introduction with a compelling opening, memorable insight, concrete example, audience prompt, and natural invitation to use the Blueprint.",
    owner: "Jeremy — speaker lead",
    minutes: 45,
    priority: "high",
    steps: [
      "1. Build the opening, one core insight, example, and invitation.",
      "2. Check that the language sounds practical rather than overly polished.",
      "3. Time the draft and note slide or handout needs.",
    ],
    doneWhen:
      "A five-minute internal talk draft is timed and ready for rehearsal.",
    dependsOn: ["ddb-speaking-platform-brief"],
    requiresApproval: true,
  },
  {
    slug: "ddb-speaking-talk-15",
    phase: "first_30",
    category: "speaking",
    title: "Draft the 15-minute educational talk",
    description:
      "Draft the required 15-minute talk using the Blueprint journey, practical examples, audience engagement, and a low-pressure invitation to the assessment.",
    owner: "Jeremy — speaker lead",
    minutes: 60,
    priority: "high",
    steps: [
      "1. Choose a three-part teaching arc from the Blueprint.",
      "2. Add a concrete example and audience engagement moment.",
      "3. Time the draft and flag claims requiring evidence.",
    ],
    doneWhen:
      "A 15-minute internal educational talk draft is timed and ready for rehearsal.",
    dependsOn: ["ddb-speaking-talk-05"],
    requiresApproval: true,
  },
  {
    slug: "ddb-speaking-talk-30",
    phase: "days_31_60",
    category: "speaking",
    title: "Draft the 30-minute signature presentation",
    description:
      "Draft the required 30-minute signature presentation with the movie-level differentiator, the nine components, practical choices, engagement, and an optional Blueprint invitation.",
    owner: "Jeremy — speaker lead",
    minutes: 75,
    priority: "high",
    steps: [
      "1. Build a clear opening and movie-level creative differentiator.",
      "2. Teach the framework with examples and audience reflection.",
      "3. Add a truthful close and note visual or evidence needs.",
    ],
    doneWhen:
      "A 30-minute signature presentation draft is timed and ready for rehearsal.",
    dependsOn: ["ddb-speaking-talk-15"],
    requiresApproval: true,
  },
  {
    slug: "ddb-speaking-workshop-45-60",
    phase: "days_31_60",
    category: "speaking",
    title: "Draft the 45–60-minute interactive workshop",
    description:
      "Draft the required interactive workshop with participant exercises, the self-assessed scorecard, Top Three Priorities, examples, and a natural invitation to use the Blueprint.",
    owner: "Jeremy — speaker lead",
    minutes: 90,
    priority: "high",
    steps: [
      "1. Select the exercise sequence and participant prompts.",
      "2. Integrate the scorecard and Top Three Priorities worksheet.",
      "3. Define facilitator notes, timing, and materials needed.",
    ],
    doneWhen:
      "A 45–60-minute workshop draft includes participant engagement and a complete facilitation flow.",
    dependsOn: ["ddb-speaking-talk-30"],
    requiresApproval: true,
  },
  {
    slug: "ddb-speaking-workshop-90",
    phase: "days_31_60",
    category: "speaking",
    title: "Draft the 90-minute business marketing workshop",
    description:
      "Draft the required 90-minute workshop with deeper practical learning, self-assessment, action planning, questions, and a consent-aware optional follow-up path.",
    owner: "Jeremy — speaker lead",
    minutes: 90,
    priority: "normal",
    steps: [
      "1. Build modules for the Blueprint, examples, scorecard, and action planning.",
      "2. Add engagement, break, and Q&A timing.",
      "3. Define only optional, consent-aware post-event next steps.",
    ],
    doneWhen:
      "A 90-minute workshop draft has a complete agenda, exercises, and material requirements.",
    dependsOn: ["ddb-speaking-workshop-45-60"],
    requiresApproval: true,
  },
  {
    slug: "ddb-speaking-bio-profile",
    phase: "days_31_60",
    category: "speaking",
    title: "Draft the speaker bio and one-page profile",
    description:
      "Create a professional speaker biography and one-page speaker profile that accurately explains the practical teaching style, topics, audience, learning benefits, and approval-gated proof.",
    owner: "Jeremy — speaker support",
    minutes: 60,
    priority: "normal",
    steps: [
      "1. Draft a short and medium biography from verified facts only.",
      "2. Build a one-page profile with topics, audience, and learning benefits.",
      "3. Flag all client logos, quotes, and claims for explicit permission.",
    ],
    doneWhen:
      "An internal speaker bio and one-page profile are complete and awaiting approval for public use.",
    dependsOn: ["ddb-speaking-workshop-90"],
    requiresApproval: true,
  },
  {
    slug: "ddb-speaking-supporting-assets",
    phase: "days_31_60",
    category: "speaking",
    title: "Plan talk descriptions, slides, handouts, QR, follow-up, and reuse",
    description:
      "Create small production briefs for talk descriptions and learning objectives, slide decks, attendee worksheets, event QR and tracking links, post-event email drafts, presentation-to-content reuse, and a monthly outreach cadence.",
    owner: "Jeremy — speaker support",
    minutes: 75,
    priority: "normal",
    steps: [
      "1. Write the required asset checklist for each talk length.",
      "2. Define QR, tracking, consent, follow-up, and reuse rules without creating links or sends.",
      "3. Break support assets into daily production and approval batches.",
    ],
    doneWhen:
      "A complete speaking-toolkit backlog exists; no public materials, QR codes, links, or emails have been released.",
    dependsOn: ["ddb-speaking-bio-profile"],
    requiresApproval: true,
  },
  {
    slug: "ddb-speaking-venues-01",
    phase: "days_31_60",
    category: "speaking",
    title: "Research and qualify speaking candidates 1–10 of 30",
    description:
      "Use documented public sources to research and qualify the first 10 candidate organizations or venues where feasible; capture source, audience relevance, accessibility, verification status, and next research step without inventing contacts or openings.",
    owner: "Jeremy — research lead",
    minutes: 60,
    priority: "normal",
    steps: [
      "1. Review public sources using the venue-review rules.",
      "2. Log source, audience fit, accessibility, and verification status for up to 10 candidates.",
      "3. Mark unknown contacts, dates, and openings as unverified.",
    ],
    doneWhen:
      "Candidates 1–10 are source-noted and ranked only by documented fit; no outreach has been sent.",
    dependsOn: ["ddb-speaking-supporting-assets"],
    requiresApproval: false,
  },
  {
    slug: "ddb-speaking-venues-02",
    phase: "days_61_90",
    category: "speaking",
    title: "Research and qualify speaking candidates 11–20 of 30",
    description:
      "Use documented public sources to research and qualify candidates 11–20 of 30 where feasible, preserving uncertainty rather than inferring access, dates, contacts, or invitations.",
    owner: "Jeremy — research lead",
    minutes: 60,
    priority: "normal",
    steps: [
      "1. Review public sources for up to 10 additional candidates.",
      "2. Record source, audience fit, access signal, and verification status.",
      "3. Rank only candidates with documented information and list gaps.",
    ],
    doneWhen:
      "Candidates 11–20 are source-noted and not represented as booked opportunities.",
    dependsOn: ["ddb-speaking-venues-01"],
    requiresApproval: false,
  },
  {
    slug: "ddb-speaking-venues-03",
    phase: "days_61_90",
    category: "speaking",
    title: "Research and qualify speaking candidates 21–30 of 30",
    description:
      "Use documented public sources to research and qualify candidates 21–30 of 30 where feasible, then prepare a transparent ranked research queue for future approved outreach.",
    owner: "Jeremy — research lead",
    minutes: 60,
    priority: "normal",
    steps: [
      "1. Review public sources for the final candidate batch where feasible.",
      "2. Capture evidence, relevance, accessibility, and contact-verification gaps.",
      "3. Produce a ranked queue that distinguishes qualified from unverified candidates.",
    ],
    doneWhen:
      "Up to 30 candidates are documented where feasible, with no invented contacts, dates, or speaking commitments.",
    dependsOn: ["ddb-speaking-venues-02"],
    requiresApproval: false,
  },
  {
    slug: "ddb-speaking-outreach-review",
    phase: "days_61_90",
    category: "speaking",
    title: "Prepare speaker outreach drafts for approval",
    description:
      "Draft a respectful outreach email, follow-up message, and monthly manual review process for verified opportunities; no messages are sent or scheduled in this task.",
    owner: "Jeremy — owner approval",
    minutes: 45,
    priority: "normal",
    steps: [
      "1. Write an educational, venue-specific outreach draft with no entitlement or result promise.",
      "2. Add a clear manual review, consent, and opt-out check.",
      "3. Queue only verified opportunities for owner approval.",
    ],
    doneWhen:
      "Outreach drafts and a monthly manual process are ready; no contact has been messaged or scheduled.",
    dependsOn: ["ddb-speaking-venues-03"],
    requiresApproval: true,
  },
  {
    slug: "ddb-relationships-principles-tracker",
    phase: "first_30",
    category: "relationships",
    title: "Set relationship principles and a lightweight tracker",
    description:
      "Create a consent-aware relationship process that keeps genuine friendships and personal social experiences distinct from commercial prospecting; define notes, permission basis, next action, and privacy rules.",
    owner: "Jeremy — relationship lead",
    minutes: 45,
    priority: "high",
    steps: [
      "1. Write the relationship-first principles and privacy boundaries.",
      "2. Define only the minimum useful fields for a voluntary relationship record.",
      "3. Add a rule that not every interaction enters a sales pipeline.",
    ],
    doneWhen:
      "A lightweight tracker and relationship principles preserve personal boundaries and useful context.",
    dependsOn: ["ddb-speaking-platform-brief"],
    requiresApproval: false,
  },
  {
    slug: "ddb-relationships-participation-rhythm",
    phase: "first_30",
    category: "relationships",
    title: "Plan the weekly and monthly participation rhythm",
    description:
      "Create a capacity-aware weekly and monthly participation planning template for networking events, mixers, chamber activity, industry gatherings, coffees, lunches, visits, workshops, and partner gatherings; no dates are assumed or changed.",
    owner: "Jeremy — relationship lead",
    minutes: 45,
    priority: "high",
    steps: [
      "1. List channel types and the relationship purpose for each.",
      "2. Define a realistic review cadence and capacity limit.",
      "3. Keep the calendar as a manual planning aid, not an automated schedule.",
    ],
    doneWhen:
      "A weekly and monthly participation template is ready without asserting event dates or making bookings.",
    dependsOn: ["ddb-relationships-principles-tracker"],
    requiresApproval: false,
  },
  {
    slug: "ddb-relationships-conversation-explanations",
    phase: "first_30",
    category: "relationships",
    title: "Draft conversation starters and 30/90-second explanations",
    description:
      "Draft natural conversation starters, a 30-second explanation of Digital Dominance, and a 90-second explanation of Jeristotle Productions that invite learning instead of forcing a sales pitch.",
    owner: "Jeremy — relationship lead",
    minutes: 60,
    priority: "high",
    steps: [
      "1. Write questions that begin with the other person’s business moment.",
      "2. Draft and time the 30-second Digital Dominance explanation.",
      "3. Draft and time the 90-second Jeristotle explanation with no result guarantee.",
    ],
    doneWhen:
      "Conversation starters and both timed explanations are ready for personal practice.",
    dependsOn: ["ddb-relationships-participation-rhythm"],
    requiresApproval: false,
  },
  {
    slug: "ddb-relationships-follow-up-nurture",
    phase: "days_31_60",
    category: "relationships",
    title: "Create follow-up messages and a nurturing cadence",
    description:
      "Draft message options for different conversation types, promises to send a resource, referral introductions, and permission-based future contact; no message is sent automatically.",
    owner: "Jeremy — relationship support",
    minutes: 60,
    priority: "normal",
    steps: [
      "1. Group follow-up situations by actual conversation context.",
      "2. Draft a helpful message and a permission-based next step for each.",
      "3. Add a manual review rule before any send.",
    ],
    doneWhen:
      "Follow-up drafts and nurturing rules are ready; no relationship communication has been auto-sent.",
    dependsOn: ["ddb-relationships-conversation-explanations"],
    requiresApproval: true,
  },
  {
    slug: "ddb-relationships-referral-partners",
    phase: "days_31_60",
    category: "relationships",
    title: "Define the referral-partner identification process",
    description:
      "Create a process for recognizing mutual-fit partners, documenting value exchange, confirming permission, and offering education before asking for referrals.",
    owner: "Jeremy — relationship lead",
    minutes: 45,
    priority: "normal",
    steps: [
      "1. Define partner-fit, ethics, and conflict checks.",
      "2. List questions that reveal mutual value without pressure.",
      "3. Create a manual next-step template for welcomed introductions.",
    ],
    doneWhen:
      "A referral-partner process is documented without naming or contacting any person.",
    dependsOn: ["ddb-relationships-follow-up-nurture"],
    requiresApproval: false,
  },
  {
    slug: "ddb-relationships-event-research-workspace",
    phase: "days_31_60",
    category: "relationships",
    title: "Set up the recurring event research workspace",
    description:
      "Create source and qualification fields for a future Coastal Bend event calendar: organizer, public source, audience, cost or access evidence, relevance, consent, and manual follow-up action.",
    owner: "Jeremy — research lead",
    minutes: 45,
    priority: "normal",
    steps: [
      "1. Define source and verification fields for recurring event research.",
      "2. Add relevance and accessibility criteria without assuming attendance.",
      "3. Create a review queue for manually verified opportunities.",
    ],
    doneWhen:
      "A research workspace is ready; no event, organizer, date, or contact has been claimed as current.",
    dependsOn: ["ddb-relationships-referral-partners"],
    requiresApproval: false,
  },
  {
    slug: "ddb-relationships-collateral-qr",
    phase: "days_61_90",
    category: "relationships",
    title: "Plan physical collateral and event QR sharing",
    description:
      "Create recommendations and a small-batch production brief for physical marketing collateral and sharing the Blueprint through QR codes at events; any link, print order, spend, or public use remains approval-gated.",
    owner: "Jeremy — production lead",
    minutes: 60,
    priority: "normal",
    steps: [
      "1. List collateral uses, audience moments, accessibility, and factual-copy requirements.",
      "2. Define a QR destination, tracking, consent, and quality-control checklist.",
      "3. Separate draft recommendations from printing, payment, and public deployment.",
    ],
    doneWhen:
      "A collateral and QR production brief is ready with explicit approval gates for spends and public use.",
    dependsOn: ["ddb-relationships-event-research-workspace"],
    requiresApproval: true,
  },
  {
    slug: "ddb-leads-funnel-architecture",
    phase: "first_30",
    category: "lead_generation",
    title: "Map the educational inbound funnel architecture",
    description:
      "Map how business owners discover the Blueprint, learn the framework, self-assess, receive recommended action guidance, and optionally request implementation support across ATTRACT → EDUCATE → CONVERT → RETAIN → REPEAT.",
    owner: "Jeremy — funnel lead",
    minutes: 60,
    priority: "high",
    steps: [
      "1. Define the owner value and optional next action at each journey stage.",
      "2. Identify data, consent, and owner-review requirements for every handoff.",
      "3. Exclude any promise of lead volume, conversion, or sales.",
    ],
    doneWhen:
      "A consent-aware funnel map connects education to optional support without outcome guarantees.",
    dependsOn: ["ddb-blueprint-journey-offers"],
    requiresApproval: false,
  },
  {
    slug: "ddb-leads-landing-page-brief",
    phase: "first_30",
    category: "lead_generation",
    title: "Create the Blueprint landing-page build brief",
    description:
      "Write a build brief for a dedicated Blueprint landing page with plain-language promise, movie-level differentiator, educational value, self-assessment path, optional implementation invitation, proof rules, and manual approval gate.",
    owner: "Jeremy — web lead",
    minutes: 60,
    priority: "high",
    steps: [
      "1. Draft the page sections and required evidence or permissions.",
      "2. Define accessibility, privacy, CTA, and tracking requirements.",
      "3. Mark public deployment as pending explicit owner approval.",
    ],
    doneWhen:
      "A landing-page brief is complete; no page has been published or changed.",
    dependsOn: ["ddb-leads-funnel-architecture"],
    requiresApproval: true,
  },
  {
    slug: "ddb-leads-pdf-delivery-brief",
    phase: "first_30",
    category: "lead_generation",
    title: "Create the free PDF delivery and consent brief",
    description:
      "Define an opt-in, consent, delivery, privacy, sender, and suppression plan for the free Blueprint PDF; this is not a live email or SMS automation.",
    owner: "Jeremy — operations lead",
    minutes: 45,
    priority: "high",
    steps: [
      "1. Specify the requested value, form fields, consent language, and delivery expectation.",
      "2. Define sender identity, opt-out, privacy, and suppression requirements.",
      "3. Flag all public delivery and automation actions for approval.",
    ],
    doneWhen:
      "A free-PDF delivery brief is ready with no automated email, SMS, or subscription activated.",
    dependsOn: ["ddb-leads-landing-page-brief"],
    requiresApproval: true,
  },
  {
    slug: "ddb-leads-interactive-audit",
    phase: "days_31_60",
    category: "lead_generation",
    title: "Specify the interactive audit and score-based action plan",
    description:
      "Create a build specification for the fillable audit, the 10/5/0 score calculation, ranges, self-assessment disclaimer, gap capture, Top Three Priorities, and recommended action-plan logic.",
    owner: "Jeremy — funnel lead",
    minutes: 60,
    priority: "high",
    steps: [
      "1. Convert the scorecard rules into clear form and calculation requirements.",
      "2. Write action-plan guidance for each attainable range without performance claims.",
      "3. Define privacy, accessibility, and manual approval checks.",
    ],
    doneWhen:
      "An interactive-audit specification preserves the 90-point self-assessment and does not launch a live form.",
    dependsOn: ["ddb-leads-pdf-delivery-brief"],
    requiresApproval: true,
  },
  {
    slug: "ddb-leads-booking-brief",
    phase: "days_31_60",
    category: "lead_generation",
    title: "Create the Digital Strategy Session booking brief",
    description:
      "Define a voluntary booking-page flow for Digital Strategy Sessions, including fit expectations, availability review, privacy, confirmation, and non-pressure alternative resources; do not change a real calendar.",
    owner: "Jeremy — funnel lead",
    minutes: 45,
    priority: "normal",
    steps: [
      "1. Draft the purpose, fit questions, and preparation expectation.",
      "2. Define manual calendar, confirmation, privacy, and cancellation requirements.",
      "3. Keep all availability and scheduling changes outside this task.",
    ],
    doneWhen:
      "A booking-flow brief is ready and no calendar or appointment schedule has changed.",
    dependsOn: ["ddb-leads-interactive-audit"],
    requiresApproval: true,
  },
  {
    slug: "ddb-leads-crm-attribution",
    phase: "days_31_60",
    category: "lead_generation",
    title: "Define CRM capture and lead attribution fields",
    description:
      "Create the minimum data model for consent, source, campaign, resource, score range, stated need, next action, owner, and observed outcome; do not import contacts.",
    owner: "Jeremy — operations lead",
    minutes: 60,
    priority: "high",
    steps: [
      "1. Define required and optional fields with privacy purpose.",
      "2. Establish source-label and attribution-limit rules.",
      "3. Add suppression, retention, and manual review requirements.",
    ],
    doneWhen:
      "A CRM and attribution specification is complete without importing, enriching, or messaging any contact.",
    dependsOn: ["ddb-leads-booking-brief"],
    requiresApproval: false,
  },
  {
    slug: "ddb-leads-educational-followup",
    phase: "days_31_60",
    category: "lead_generation",
    title: "Draft educational follow-up sequences",
    description:
      "Draft consent-aware follow-up messages for people who request the Blueprint, complete an audit, or request a session; emphasize useful education, not pressure, and include lawful sender and opt-out requirements.",
    owner: "Jeremy — funnel lead",
    minutes: 60,
    priority: "normal",
    steps: [
      "1. Draft value-first follow-up for each voluntary action.",
      "2. Add personalization, consent, sender, and suppression checks.",
      "3. Require owner approval before any send or automation.",
    ],
    doneWhen:
      "Educational follow-up drafts are ready; no email, SMS, or sequence has been sent or scheduled.",
    dependsOn: ["ddb-leads-crm-attribution"],
    requiresApproval: true,
  },
  {
    slug: "ddb-leads-outbound-guardrails",
    phase: "days_31_60",
    category: "lead_generation",
    title: "Create outbound research and contact guardrails",
    description:
      "Define a research template and manual contact guardrails for any future outbound work: public-source verification, relevance, personalization, business-hours practice, truthful identity, opt-out, do-not-contact handling, and approval before outreach.",
    owner: "Jeremy — compliance lead",
    minutes: 60,
    priority: "high",
    steps: [
      "1. Define what evidence is required before a prospect is considered.",
      "2. Write no-scraping, no-assumption, opt-out, and do-not-contact rules.",
      "3. Separate research drafts from actual sending or calling.",
    ],
    doneWhen:
      "Outbound guardrails and research fields are documented; no prospect is researched, contacted, or enrolled.",
    dependsOn: ["ddb-leads-educational-followup"],
    requiresApproval: false,
  },
  {
    slug: "ddb-leads-metrics-dashboard",
    phase: "days_61_90",
    category: "lead_generation",
    title: "Define actual-metrics and conversion-review dashboard",
    description:
      "Specify observed metrics for discovery, opt-ins, assessment completion, requested sessions, qualified conversations, attribution, and learning; log source and date of observation and avoid causal or revenue claims beyond evidence.",
    owner: "Jeremy — operations lead",
    minutes: 45,
    priority: "normal",
    steps: [
      "1. Define each observed metric and its source.",
      "2. Add a data-quality and attribution-limitation note.",
      "3. Define a manual review rhythm for learning, not automatic optimization.",
    ],
    doneWhen:
      "A metrics specification supports honest reporting without a live dashboard or performance guarantee.",
    dependsOn: ["ddb-leads-outbound-guardrails"],
    requiresApproval: false,
  },
  {
    slug: "ddb-leads-activation-review",
    phase: "days_61_90",
    category: "lead_generation",
    title: "Run the lead-engine activation readiness review",
    description:
      "Review the landing-page, delivery, audit, booking, CRM, follow-up, compliance, and metric prerequisites before proposing any public release, send, ad spend, or system activation.",
    owner: "Jeremy — owner approval",
    minutes: 60,
    priority: "high",
    steps: [
      "1. Verify each prerequisite and record any evidence or privacy gap.",
      "2. Identify actions needing owner approval, payment, legal review, or technical QA.",
      "3. Approve only the next manual build or test action.",
    ],
    doneWhen:
      "A readiness review documents go, no-go, and approval-gated items; no funnel is activated.",
    dependsOn: ["ddb-leads-metrics-dashboard"],
    requiresApproval: true,
  },
  {
    slug: "ddb-extension-lifecycle-criteria",
    phase: "days_31_60",
    category: "suggested_sales_improvement",
    title: "Suggested: define lifecycle criteria and handoffs",
    description:
      "Suggested extension, not supplied: convert the earlier Part 2 lifecycle into clear educational, qualified-conversation, proposal, delivery, referral, and reinvestment handoffs; attachment source cuts off during Part 6 at “Educational.”",
    owner: "Jeremy — strategy lead",
    minutes: 45,
    priority: "normal",
    steps: [
      "1. Label this as a proposed extension rather than supplied scope.",
      "2. Define evidence needed to move between lifecycle stages.",
      "3. Preserve the rule that education can succeed without a sale.",
    ],
    doneWhen:
      "A proposed lifecycle handoff model is documented and clearly labeled as not supplied by the attachment.",
    dependsOn: ["ddb-leads-crm-attribution"],
    requiresApproval: false,
  },
  {
    slug: "ddb-extension-discovery-scope",
    phase: "days_31_60",
    category: "suggested_sales_improvement",
    title: "Suggested: prepare discovery and implementation-scope templates",
    description:
      "Suggested extension, not supplied: prepare a discovery agenda, fit criteria, implementation-scope outline, assumptions, exclusions, approvals, and no-results-guarantee language for qualified buyers.",
    owner: "Jeremy — strategy lead",
    minutes: 60,
    priority: "normal",
    steps: [
      "1. Draft questions that uncover goals, constraints, decision path, and implementation fit.",
      "2. Define scope, assumptions, approvals, and exclusions.",
      "3. Separate educational guidance from paid execution.",
    ],
    doneWhen:
      "A proposed discovery and scope template is ready for internal review only.",
    dependsOn: ["ddb-extension-lifecycle-criteria"],
    requiresApproval: false,
  },
  {
    slug: "ddb-extension-proposal-onboarding",
    phase: "days_61_90",
    category: "suggested_sales_improvement",
    title: "Suggested: prepare proposal and onboarding checklists",
    description:
      "Suggested extension, not supplied: create internal checklists for proposals, rights, privacy, approvals, payment decisions, kickoff, timeline assumptions, and success measures; no proposal, contract, payment, or onboarding is initiated.",
    owner: "Jeremy — operations lead",
    minutes: 60,
    priority: "normal",
    steps: [
      "1. List proposal and onboarding information required before commitment.",
      "2. Add rights, privacy, payment, and approval decision points.",
      "3. Flag legal, payment, and client-facing actions for explicit approval.",
    ],
    doneWhen:
      "Internal proposal and onboarding checklists are ready; no client-facing document, payment, or agreement has been issued.",
    dependsOn: ["ddb-extension-discovery-scope"],
    requiresApproval: true,
  },
  {
    slug: "ddb-extension-delivery-reporting",
    phase: "days_61_90",
    category: "suggested_sales_improvement",
    title: "Suggested: define delivery, approval, and reporting cadence",
    description:
      "Suggested extension, not supplied: define a delivery workflow for creative approvals, implementation checkpoints, source-labeled reporting, issue escalation, and retrospective learning without guaranteeing results.",
    owner: "Jeremy — operations lead",
    minutes: 60,
    priority: "normal",
    steps: [
      "1. Map production, client review, approval, delivery, and archive checkpoints.",
      "2. Define observed reporting fields and attribution limitations.",
      "3. Set escalation and retrospective questions.",
    ],
    doneWhen:
      "A proposed delivery and reporting workflow is documented with no performance promise.",
    dependsOn: ["ddb-extension-proposal-onboarding"],
    requiresApproval: false,
  },
  {
    slug: "ddb-extension-referrals-testimonials",
    phase: "days_61_90",
    category: "suggested_sales_improvement",
    title: "Suggested: create referral and testimonial permission rules",
    description:
      "Suggested extension, not supplied: define ethical rules for requesting testimonials, case-study permissions, introductions, and referrals after value is delivered; no request is made in this task.",
    owner: "Jeremy — relationship lead",
    minutes: 45,
    priority: "normal",
    steps: [
      "1. Define evidence, permission, privacy, and timing requirements.",
      "2. Draft an optional, non-pressure request framework.",
      "3. Require explicit approval before any public quote or outreach.",
    ],
    doneWhen:
      "A proposed referral and testimonial process is documented; no request or public quote has been made.",
    dependsOn: ["ddb-extension-delivery-reporting"],
    requiresApproval: true,
  },
  {
    slug: "ddb-extension-quarterly-improvement",
    phase: "days_61_90",
    category: "suggested_sales_improvement",
    title: "Suggested: plan the quarterly learning and reinvestment review",
    description:
      "Suggested extension, not supplied: create a quarterly review template for educational outcomes, delivery lessons, referrals, client feedback, distribution learning, capacity, and reinvestment choices based on actual metrics.",
    owner: "Jeremy — strategy lead",
    minutes: 45,
    priority: "normal",
    steps: [
      "1. Define source-labeled inputs and review questions.",
      "2. Separate observations from conclusions and future hypotheses.",
      "3. Choose a manual next planning action after owner review.",
    ],
    doneWhen:
      "A proposed quarterly improvement template is ready without an automated change or market promise.",
    dependsOn: ["ddb-extension-referrals-testimonials"],
    requiresApproval: false,
  },
];

export const GROWTH_TASKS: readonly GrowthTask[] = TASK_DEFINITIONS.map(
  (task, sortOrder) => ({ ...task, sortOrder })
);
