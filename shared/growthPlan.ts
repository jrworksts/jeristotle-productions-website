import { LOCAL_AUTHORITY_TASKS } from "./localAuthorityTasks";
import { GROWTH_DAILY_ROUTINE as PREVIOUS_ROUTINES } from "./blueprintGrowthPlan";
import { CONVERSATION_OFFER_TASK_UPDATES } from "./conversationOfferPlan";
import {
  LINKEDIN_PRIORITY_TASK_SLUGS,
  LINKEDIN_PRIORITY_TASK_UPDATES,
} from "./linkedinPriorityPlan";
export {
  GROWTH_PILLARS,
  GROWTH_SCORECARD,
  GROWTH_DELIVERABLE_TARGETS,
} from "./blueprintGrowthPlan";
export type {
  GrowthPhase,
  GrowthPriority,
  GrowthDailyRoutineItem,
  GrowthPillar,
} from "./blueprintGrowthPlan";
import type {
  GrowthTask as BlueprintTask,
  GrowthDailyRoutineItem,
} from "./blueprintGrowthPlan";

export type GrowthWorkstreamId =
  | "foundation"
  | "framework_offer"
  | "content_engine"
  | "funnel_tracking"
  | "linkedin_ads"
  | "local_relationships"
  | "meta_expansion"
  | "authority_media"
  | "sales_delivery"
  | "optimize_scale";
export type GrowthTask = Omit<BlueprintTask, "category"> & {
  category: GrowthWorkstreamId;
  dispatchOrder?: number;
};
export type GrowthWorkstream = {
  id: GrowthWorkstreamId;
  name: string;
  description: string;
};
export const GROWTH_PLAN_VERSION = "local-authority-conversation-offers-v7";
export const GROWTH_PLAN_NOTE =
  "A zero-to-local-authority implementation roadmap for Jeremy and Jeristotle Productions. The 0–100 progress bar counts completed tasks; it is not a measure or promise of fame, audience reach, leads, sales, or market status. Lead with movie-level content production for small businesses and teach the Digital Dominance Blueprint: ATTRACT → EDUCATE → CONVERT → RETAIN → REPEAT. October 30 offer direction: one initial personal LinkedIn video invites a complimentary 2027 marketing-plan conversation; the Blueprint supports the session, then fit determines coaching, done-with-you, premium content plus ad management or scoped full-service support. Monthly planning tiers are $500, $1,500, $4,500 and $7,500+; exact scope, ad-spend treatment and terms require approval, and no existing contract is changed. Offer-ladder and bounded coaching-delivery preparation are front-loaded; no four-package ad launch, coaching purchase, three-month term or ChatGPT-suggested ad budget is approved. Webinar-informed LinkedIn planning remains front-loaded. Jeremy's October 28 direction replaces an awareness-first pilot with one personal, conversation-led approach: useful founder content, an invitation to message Jeremy about 2027 marketing, a business-fit conversation and an optional complimentary strategy session. Measure qualified conversations and booked sessions, not views alone. The original audience worksheet is closed by decision; actual account access, local audience estimates, sponsorship permission and non-connection messaging checks carry into the next preparation task and are not claimed complete. Audit existing profiles before any approved creation. Produce original approved ad creative with existing cameras, Jeremy’s real voice and ordinary editing by default. Higgsfield is optional only when Jeremy wants a specific value-adding enhancement, with rights, likeness and any paid-render approval; it is never a required tool or purchase. Verify the supported message path before paid delivery; a personal Thought Leader video has no native CTA button or personal-DM optimization objective. Explicit creative, audience, objective, spend, dates and launch approval remain required. Facebook and Instagram remain organic-first until a later separately approved phase. Account creation, publishing, ad launches, purchases, contracts and legal filings are not side effects of a checkbox. Every live audience or budget change requires explicit approval. Optimize from real full-funnel evidence without changing budgets unless authorized. Never send test leads into live connected client campaigns without explicit instruction. Preserve the three-pillar/nine-component Blueprint and its self-assessed digital readiness score (0–90, not independently validated performance). Keep the October 22, 2026 start and one implementation task per day; no completed work is reset. Daily routines remain paused. Unfinished work carries forward without adding more tasks to the same day. Earlier Blueprint and Chamber task records remain archived. Existing outbound campaign and reminder schedules are unchanged.";

export const GROWTH_WORKSTREAMS: readonly GrowthWorkstream[] = [
  {
    id: "foundation",
    name: "01 · Identity & social-page setup",
    description:
      "Audit the profiles you actually have, preserve Jeremy’s owner control and prevent duplicates. LinkedIn, the existing Company Page, Facebook and Instagram are the current scope; YouTube and Google remain later verification work.",
  },
  {
    id: "framework_offer",
    name: "02 · Framework, message & offer",
    description:
      "Make Jeremy the recognizable local educator behind the Blueprint, backed by Jeristotle's content-first team and a clear complimentary strategy-session next step.",
  },
  {
    id: "content_engine",
    name: "03 · Content & creative engine",
    description:
      "Produce useful educational content and original movie-level video using real footage and ordinary editing, then publish and repurpose consistently after approval. Higgsfield is optional only when desired and creatively useful.",
  },
  {
    id: "funnel_tracking",
    name: "04 · Funnel, CRM & tracking",
    description:
      "Connect attention to a useful destination, clear opt-in, qualification, booking, follow-up and source-labeled measurement. Validate safely before traffic.",
  },
  {
    id: "linkedin_ads",
    name: "05 · LinkedIn ads first",
    description:
      "Prepare one Jeremy-led, personal LinkedIn conversation campaign: invite local owners to message him, qualify willing interest and offer a useful 2027 strategy session. Verify actual messaging, local audience and account access; original production, spending and launch remain gated.",
  },
  {
    id: "local_relationships",
    name: "06 · Networking & referrals",
    description:
      "Show up in the local business community, build genuine relationships, follow up helpfully and coordinate Chamber and partner visibility.",
  },
  {
    id: "meta_expansion",
    name: "07 · Facebook & Instagram ads",
    description:
      "Expand after the LinkedIn foundation, using the established pages, verified tracking, appropriate creative and a separately approved budget.",
  },
  {
    id: "authority_media",
    name: "08 · Speaking, media & authority",
    description:
      "Turn the framework into talks, workshops, interviews, articles and permitted proof. Earn recognition through useful work rather than unsupported status claims.",
  },
  {
    id: "sales_delivery",
    name: "09 · Sales, delivery & proof",
    description:
      "Qualify conversations, scope the right support, deliver well, document actual outcomes, request permission-based proof and develop retention and referrals.",
  },
  {
    id: "optimize_scale",
    name: "10 · Optimize, systemize & repeat",
    description:
      "Diagnose full-funnel drop-offs, improve creative and conversion paths, review real evidence, document the team system and refresh the roadmap without unauthorized budget changes.",
  },
];

const FIRST_EXECUTION_PATH = [
  ...Array.from(
    { length: 10 },
    (_, i) => `authority-foundation-${String(i + 1).padStart(2, "0")}`
  ),
  "authority-framework_offer-01",
  "authority-framework_offer-02",
  "authority-framework_offer-03",
  "authority-local_relationships-07",
  "authority-linkedin_ads-01",
  "authority-linkedin_ads-02",
  "authority-linkedin_ads-03",
  "authority-content_engine-01",
  "authority-content_engine-04",
  "authority-content_engine-07",
  "authority-content_engine-08",
  "authority-content_engine-10",
  "authority-funnel_tracking-01",
  "authority-funnel_tracking-02",
  "authority-optimize_scale-01",
  "authority-funnel_tracking-03",
  "authority-funnel_tracking-04",
  "authority-framework_offer-04",
  "authority-funnel_tracking-05",
  "authority-funnel_tracking-06",
  "authority-funnel_tracking-07",
  "authority-funnel_tracking-08",
  "authority-funnel_tracking-09",
  "authority-funnel_tracking-10",
  "authority-sales_delivery-01",
  "authority-content_engine-09",
  "authority-framework_offer-10",
  ...Array.from(
    { length: 7 },
    (_, i) => `authority-linkedin_ads-${String(i + 4).padStart(2, "0")}`
  ),
];
const LINKEDIN_FIRST_EXECUTION_PATH = [
  ...LINKEDIN_PRIORITY_TASK_SLUGS,
  ...FIRST_EXECUTION_PATH.filter(
    slug =>
      !LINKEDIN_PRIORITY_TASK_SLUGS.some(prioritySlug => prioritySlug === slug)
  ),
];
export const GROWTH_TASKS: readonly GrowthTask[] = LOCAL_AUTHORITY_TASKS.map(
  task => {
    const update = {
      ...LINKEDIN_PRIORITY_TASK_UPDATES[task.slug],
      ...CONVERSATION_OFFER_TASK_UPDATES[task.slug],
    };
    const rank = LINKEDIN_FIRST_EXECUTION_PATH.indexOf(task.slug);
    return {
      ...task,
      ...update,
      steps: [...(update?.steps ?? task.steps)],
      dependsOn: [...(update?.dependsOn ?? task.dependsOn)],
      dispatchOrder: rank >= 0 ? rank : 100 + task.sortOrder,
    };
  }
);
export const GROWTH_DAILY_ROUTINE: readonly GrowthDailyRoutineItem[] =
  PREVIOUS_ROUTINES.map(item =>
    item.slug === "ddb-daily-pipeline-replies"
      ? {
          ...item,
          title: "Review leads, ad delivery, and replies",
          description:
            "Review current leads and real conversations. Once ads are live, check actual delivery, pacing and lead quality; flag problems for the next action. Do not change a budget without authorization. This check does not auto-send or alter campaign schedules.",
        }
      : item.slug === "ddb-daily-log-actual-metrics"
        ? {
            ...item,
            title: "Log content, ad, and funnel metrics",
            description:
              "Record observed content activity, ad delivery where live, source-labeled opt-ins, conversations and outcomes. Identify the biggest drop-off and tomorrow's improvement without inferring results.",
          }
        : item
  );
