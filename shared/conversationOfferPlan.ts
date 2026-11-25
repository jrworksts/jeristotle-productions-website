import type { GrowthTask } from './growthPlan';

type Update = Partial<Pick<GrowthTask, 'title' | 'description' | 'steps' | 'doneWhen' | 'dependsOn' | 'phase' | 'minutes'>>;

/** October 30 planning update from Jeremy's own ChatGPT conversation, not a launch approval. */
export const CONVERSATION_OFFER_TASK_UPDATES: Readonly<Record<string, Update>> = {
  'authority-linkedin_ads-01': {
    description: 'Retain the completed webinar strategy as history. Current direction is one Jeremy-led personal LinkedIn video inviting a useful conversation about a business’s 2027 marketing plan, with the Blueprint used inside the strategy session and the right level of support recommended after learning the owner’s goals. This update does not reopen completed work or authorize ads.',
    steps: [
      'Lead with movie-level content production for small businesses and the owner’s 2027 marketing goals. Use one primary video and one invitation, not separate paid ads for four packages.',
      'Keep the exact CTA: Message me 2027 and tell me a little about your business. The complimentary session gives practical guidance; pricing follows qualification rather than leading the ad.',
      'Use the Digital Dominance Blueprint as the discussion and scorecard tool. A separate Blueprint explainer may be prepared for organic education later; it is not a prerequisite or a second paid pilot.',
      'Keep actual account, sponsorship, personal-message accessibility and audience checks open. ChatGPT’s proposed objective, daily budget and test duration are suggestions only, not approved campaign settings.',
    ],
  },
  'authority-linkedin_ads-05': {
    description: 'Preserve the completed personal-script task and actual blockers. Refine the future creative review toward one camera-first video selling a useful 2027 marketing-plan conversation, not a production package, coaching subscription or four-tier price list. Coaching, done-with-you and production/full-service support are ways to work together after qualification.',
    steps: [
      'Verify actual free non-connection messaging, Open Profile and Premium availability without buying or changing anything. A personal Thought Leader video has no native CTA button or personal-DM optimization objective.',
      'Verify the correct Jeristotle company-associated account, Page/sponsorship permissions and real local audience estimates. Do not use unrelated accounts or broaden geography without approval.',
      'At the later creative review, select one Jeremy-led video. Lead with movie-level content production for small businesses, introduce help for owners doing it themselves or wanting a team, and invite a complimentary 2027 Marketing Strategy Session. Do not overwrite the already-approved October 29 master as a side effect of planning.',
      'Keep the exact CTA: Message me 2027 and tell me a little about your business. If messaging is blocked, do not silently substitute automated Sponsored Messaging, a form or booking destination.',
      'Reply manually with a useful question about goals and who handles marketing. Recommend the appropriate support only after understanding fit; email/SMS requires appropriate consent.',
      'Measure qualified conversations and booked strategy sessions with source notes, not views or likes treated as leads. A better plan supports the owner’s goals without guaranteeing growth or market outcomes.',
      'Keep final creative, platform objective, actual audience, dates, budget, public posting and paid launch unapproved. Camera-first original footage is the default; Higgsfield is optional only when Jeremy wants a specific useful enhancement with rights and any paid-render approval.',
    ],
  },
  'authority-linkedin_ads-06': {
    description: 'Prepare one primary camera-first video to start a 2027 marketing-plan conversation. The camera already available, real Jeremy voice, clean audio and ordinary editing are enough. Two alternate boards in the earlier brief are optional take choices, not three ads or required shoots. Any new coaching/strategy-session sentence needs final creative review, not silent replacement of the October 29 master.',
    steps: [
      'Review the existing master and camera-first brief. Keep one primary video with the local 2027-plan hook, movie-level content production for small businesses, a clear complimentary strategy-session invitation and the exact CTA: Message me 2027 and tell me a little about your business.',
      'If it improves clarity, propose one brief sentence that support can be coaching, done-with-you or production/full service. Do not put prices, nine service components or four separate package pitches in the ad.',
      'Plan natural camera/audio/lighting, captions, safe crops and genuine cleared original footage. Use one primary proposed short cut or a naturally paced master; do not cram the entire script into 15 seconds.',
      'Keep alternative boards optional and a separate Blueprint explainer for later organic education. Higgsfield is optional only if Jeremy wants a specific value-adding enhancement; no mandatory render or purchase.',
      'Retain written likeness, property, music, logo and other rights checks, separate paid-credit approval if relevant, and review of final creative before any public use. No filming, generation, posting or spend is claimed complete by this update.',
    ],
    doneWhen: 'One primary camera-ready board, original shot list, captions, format notes and written clearances are ready for review, aligned to the complimentary 2027-plan invitation and exact message CTA, and optional alternatives are clearly nonrequired; actual production, public use and any paid rendering require separate explicit approval. No actual final footage, ad or spend is claimed.',
  },
  'authority-linkedin_ads-07': {
    title: 'Prepare the 2027 strategy-session and personal-message flow',
    description: 'Prepare the useful conversation that personal LinkedIn messages to Jeremy begin: owner goals, current marketing, available execution capacity, a light Blueprint assessment and three practical 2027 priorities. Recommend a support level afterward, without turning the free session into free production, an exhaustive audit or a package pitch. This does not claim a live form or automation exists.',
    steps: [
      'Prepare Jeremy’s manual first reply and questions about 2027 goals, who currently handles marketing, current content/customer path and realistic resources. Do not request private credentials or unnecessary sensitive customer data.',
      'Draft a lightweight Foundation, Growth and Optimization scorecard using the existing three-pillar/nine-component Blueprint. Label unknowns and self-assessed readiness, not proven performance or guaranteed business growth.',
      'Create a one-page take-away with three priorities, owner and next action. Use helpful plain language about a better 2027 marketing plan, not a promise to hit revenue or lead targets.',
      'After learning fit, discuss coaching, done-with-you, premium content plus ad management or scoped full-service support. The free session does not require a purchase, include implementation or make an upgrade mandatory.',
      'Confirm manual message and optional booking handoff, Jeremy as owner, a realistic response standard and source-labeled conversation/booked-session measurement. A form or Lead Gen Form is optional, not required; this does not claim a live form or automated messaging flow exists.',
      'Keep consent before email/SMS and prohibit test leads into live client integrations without explicit instruction. Verify the real supported path and later tracking QA before paid traffic.',
    ],
    doneWhen: 'A personal-message reply outline, lightweight Blueprint session worksheet, one-page three-priority 2027 action-plan template and optional booking/consent handoff are ready for review. The appropriate paid support is a later fit discussion, not an upfront price-led ad.',
  },
  'authority-framework_offer-09': {
    title: 'Define the four-tier offer ladder and review the pricing sheet',
    description: 'Use Jeremy’s proposed monthly prices from the October 29 discussion: $500 coaching, $1,500 done-with-you, $4,500 premium content plus ad management and $7,500+ scoped full-service marketing. Clarify who does the work and review the existing pricing-sheet draft; these planning prices do not establish final contracts or unlimited deliverables.',
    steps: [
      'Document four distinct support levels: $500/month coaching for an owner who executes; $1,500/month done-with-you guidance for an executing internal team; $4,500/month recurring premium content plus agreed advertising management; $7,500+/month coordinated full-service execution within a defined scope.',
      'Define client responsibilities, production/edit quantities where applicable, revision limits, included channels, support boundaries, software/third-party fees and exclusions. Treat ad spend as separate pending Jeremy’s explicit confirmation; no media budget or purchase is authorized by a package price.',
      'Review the existing ChatGPT pricing-sheet PDF if available rather than creating a duplicate by default. Check accurate tiers, brand consistency and clear scope/ad-spend caveats. Its text, design, rights and actual file contents are not approved merely because the conversation linked it.',
      'Keep public messaging content-first and the LinkedIn ad focused on the complimentary 2027-plan conversation. Use the tier sheet after qualification, not as four first-flight ads.',
      'Preserve the separate legacy Brand Refresh terms of $3,500, $10,000 value and 10 spots without changing contracts or the existing offer. Verify stated value and actual availability before any new public reuse; do not treat historical scarcity as current or make it a fifth monthly tier.',
      'Record final scopes, price presentation, commitment/cancellation terms and any unresolved decisions for Jeremy’s review. Do not adopt ChatGPT’s earlier lower prices, suggested three-month minimum or call cadence as approved commitments. Do not alter existing client agreements.',
    ],
    doneWhen: 'One internal four-tier fit/scope matrix and a reviewed or explicitly blocked pricing-sheet draft identify monthly planning prices, client execution responsibilities, support/deliverable limits, ad-spend treatment and pending terms. No public offer, contract, payment or ad launch is created.',
    dependsOn: ['authority-foundation-01', 'authority-foundation-02', 'authority-linkedin_ads-07'],
    phase: 'first_30',
    minutes: 60,
  },
  'authority-sales_delivery-02': {
    title: 'Scope the $500 coaching and $1,500 done-with-you delivery model',
    description: 'Build a bounded support model for owners who are not ready for full production retainers. Coaching is a useful service in its own right, not a forced upsell. The client executes in coaching/done-with-you; Jeremy provides agreed direction and review, with no implied unlimited access or done-for-you production.',
    steps: [
      'Draft the coaching format, proposed session cadence, monthly action-plan/review deliverable, between-session support window and maximum delivery time for Jeremy’s approval. Do not assume two calls or a three-month minimum from ChatGPT’s suggestions.',
      'Draft done-with-you responsibilities: the client’s named internal person executes; Jeristotle supplies agreed strategy, content planning, guidance and review. Separate filming, editing, posting, ad execution and CRM implementation unless specifically scoped.',
      'Use Foundation, Growth and Optimization as a repeatable curriculum, guided by each business’s priorities and the Attract → Educate → Convert → Retain → Repeat framework. Do not promise specific savings, leads or growth.',
      'Estimate delivery capacity and costs using declared assumptions, not fabricated demand. Define an onboarding checklist, cancellation/commitment decisions and a fit-based optional upgrade path; retain coaching clients who only need coaching.',
      'Keep the complimentary 2027 fit session useful and bounded. A real first consultation, signed scope, payment and public promotion remain later separately authorized actions, not prerequisites for drafting this delivery model.',
    ],
    doneWhen: 'A review-ready coaching/done-with-you scope defines format, proposed cadence, deliverables, support/time limits, client responsibilities, exclusions, capacity assumptions and unresolved terms. No actual client delivery, subscription or paid commitment is falsely claimed.',
    dependsOn: ['authority-framework_offer-09'],
    phase: 'first_30',
    minutes: 60,
  },
  'authority-framework_offer-01': {
    description: 'Build a reusable Blueprint conversation tool: Foundation, Growth and Optimization organize the nine components, while Attract → Educate → Convert → Retain → Repeat maps the customer journey. Use it in strategy sessions and scoped coaching, not as a crowded initial ad or a guaranteed-growth score.',
  },
  'authority-framework_offer-03': {
    description: 'Align the complimentary 2027 Marketing Strategy Session with the personal-message invitation: learn the owner’s goals, review a light Blueprint assessment, give three practical priorities and then discuss the right support if useful. Keep production/content first and avoid guarantees, free implementation or a mandatory purchase.',
  },
  'authority-sales_delivery-03': {
    description: 'Assemble the later proposal and follow-up pack around the four-tier fit ladder, leading with movie-level content and the connected customer path. Use $500/$1,500/$4,500/$7,500+ only as Jeremy’s planning tiers until exact scope and terms are approved; ad spend is not authorized by service pricing. Do not change existing client contracts.',
  },
};
