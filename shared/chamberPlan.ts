export const CHAMBER_LINKS = {
  membership: "https://unitedcorpuschristi.org/membership/",
  directory: "https://chamber.unitedcorpuschristi.org/list/",
  events: "https://chamber.unitedcorpuschristi.org/events/",
  memberPortal: "https://chamber.unitedcorpuschristi.org/",
  memberLogin: "https://chamber.unitedcorpuschristi.org/login/",
  hotDeals: "https://chamber.unitedcorpuschristi.org/hotdeals/",
  memberDeals: "https://chamber.unitedcorpuschristi.org/MemberToMember/",
  marketspace: "https://chamber.unitedcorpuschristi.org/marketspace/",
  jobs: "https://chamber.unitedcorpuschristi.org/jobs/",
  roiGuide:
    "https://unitedcorpuschristi.org/2026-united-corpus-christi-chamber-tiers/",
} as const;

export const CHAMBER_PRIMARY_CONTACT = {
  name: "Gloria A. Fuentes, IOM",
  role: "VP of Membership",
  email: "chamber-contact@example.org",
  directPhone: "361-371-4482",
  mobilePhone: "361-688-3755",
  address: "602 N. Staples St., STE #150, Corpus Christi, TX 78401",
} as const;

export const CHAMBER_PORTAL_PROFILE_AUDIT = {
  checkedOn: "September 22, 2026",
  overall: 94,
  sections: [
    {
      name: "Organization information",
      completion: 100,
      next: "Reviewed and retained the published phone, email, website, and downtown Unit 4 address.",
    },
    {
      name: "Website information",
      completion: 90,
      next: "Hours, directions, descriptions, highlights, and keywords are complete. Add a social link only after a real Jeristotle account exists.",
    },
    {
      name: "Map pin",
      completion: 100,
      next: "The public member page displays the downtown address and map at 319 N. Mesquite St., Unit 4.",
    },
    {
      name: "Photos and logos",
      completion: 100,
      next: "The approved logo, four client-project images, and The Golden Mic featured video are live.",
    },
  ],
} as const;

export const CHAMBER_PORTAL_OPPORTUNITIES = [
  {
    access: "Available now",
    name: "Study the public member directory",
    action:
      "Review strong member profiles, categories, descriptions, links, and media presentation before building Jeristotle's profile.",
    url: CHAMBER_LINKS.directory,
  },
  {
    access: "Available now",
    name: "Plan networking from the live calendar",
    action:
      "Track Buenos Días, Members Who Lunch, mixers, committees, and ribbon cuttings. Verify each date and registration requirement before planning around it.",
    url: CHAMBER_LINKS.events,
  },
  {
    access: "Available now",
    name: "Study the Chamber's social content",
    action:
      "Follow the official Facebook, Instagram, YouTube, and LinkedIn channels. Log useful formats, partner tags, event rhythms, and content ideas without copying creative assets.",
    url: "https://www.facebook.com/UnitedCCChamber/",
  },
  {
    access: "Portal verified",
    name: "Build the complete company profile",
    action:
      "The profile is 94% complete. Hours, directions, descriptions, five highlights, keywords, contact review, the approved logo, four project images, and The Golden Mic featured video are live. The current four-profile scope is Jeremy’s personal LinkedIn, LinkedIn Company Page, Facebook Page, and Instagram professional profile; Facebook and Instagram setup was user-reported on October 23, 2026 with @jeristotleproductions where a handle applies. Audit canonical URLs and authorized access before adding any social link; do not create duplicates.",
    url: CHAMBER_LINKS.memberLogin,
  },
  {
    access: "Portal verified",
    name: "Use member submission tools",
    action:
      "The account exposes Hot Deals, member-to-member deals, news releases, job postings, MarketSpace, requests for proposals, events, resources, reports, and member news tools.",
    url: CHAMBER_LINKS.memberLogin,
  },
  {
    access: "Confirm with Gloria",
    name: "Verify Propeller media and promotion access",
    action:
      "Confirm the exact enabled fields, five digital cards, extra listings, e-blast and social campaign, podcast, blog or guest-post process, Reel, and current approval lead times.",
    url: `mailto:${CHAMBER_PRIMARY_CONTACT.email}`,
  },
] as const;

export const CHAMBER_SHARED_EVENT_SERIES = [
  {
    name: "Buenos Días",
    format: "Morning networking",
    purpose:
      "Meet people from different industries, discuss business priorities, explore collaborations, and showcase Jeristotle in a structured morning setting.",
    bestUse:
      "Choose three target members before attending, learn what they are promoting, and follow up with one relevant content idea.",
    scheduleNote: "One upcoming date is published and verified.",
    status: "Scheduled",
    url: "https://chamber.unitedcorpuschristi.org/events/details/buenos-dias-networking-breakfast-30612",
    nextEvent: {
      start: "2026-10-22T07:30:00-05:00",
      end: "2026-10-22T09:00:00-05:00",
      venue: "Kiko's Mexican Food Restaurant",
      address: "5514 Everhart Rd., Corpus Christi, TX 78411",
      price:
        "Members $15; non-members $25. Registration includes breakfast and a beverage.",
      registrationUrl:
        "https://chamber.unitedcorpuschristi.org/events/register/30612",
    },
  },
  {
    name: "Members Who Lunch",
    format: "Member luncheon",
    purpose:
      "Build familiarity with fellow members through a business lunch designed for conversation and referrals.",
    bestUse:
      "Sit with unfamiliar members, ask about 2027 marketing priorities, and log warm follow-ups before leaving.",
    scheduleNote:
      "No future date is currently published on the official September 2026 through 2027 calendars.",
    status: "Awaiting next listing",
    url: CHAMBER_LINKS.events,
    nextEvent: null,
  },
  {
    name: "Networking Mixers",
    format: "After-hours networking",
    purpose:
      "Develop relationships with member businesses in a more informal hosted environment.",
    bestUse:
      "Prioritize hosts, sponsors, venues, and established businesses with visible event or recurring-content needs.",
    scheduleNote:
      "No future Chamber networking mixer is currently published on the official calendar.",
    status: "Awaiting next listing",
    url: CHAMBER_LINKS.events,
    nextEvent: null,
  },
] as const;

export const CHAMBER_BENEFIT_SEEDS = [
  {
    slug: "directory-profile",
    name: "Enhanced member directory profile",
    benefitGroup: "Visibility",
    allowance: 1,
    activation:
      "By D+7, request the claim/edit workflow and permitted listing structure. Complete the primary listing with logo, website, Brand Refresh landing page, service keywords, a 200-character description, and a direct inquiry path by D+21.",
    metric: "Profile complete and all links tested",
    officialUrl: CHAMBER_LINKS.directory,
  },
  {
    slug: "additional-listings",
    name: "Three additional same-name directory listings",
    benefitGroup: "Visibility",
    allowance: 3,
    activation:
      "By D+7, ask Gloria to confirm how Propeller's three same-name listings may be structured. Use only Chamber-approved factual service categories or locations and target submission by D+21.",
    metric: "Three additional listings live",
    officialUrl: CHAMBER_LINKS.membership,
  },
  {
    slug: "dedicated-eblast",
    name: "Dedicated e-blast and social campaign",
    benefitGroup: "Campaign",
    allowance: 1,
    activation:
      "By D+14, request current format, inventory, lead time, social components, approval standards, and available analytics. Reserve one launch window after the blog, reel, podcast, Brand Refresh page, and follow-up process are ready.",
    metric: "Campaign sent; clicks, replies, and applications logged",
    officialUrl: CHAMBER_LINKS.membership,
  },
  {
    slug: "weekly-flyers",
    name: "Weekly e-blast flyer placements",
    benefitGroup: "Campaign",
    allowance: 3,
    activation:
      "By D+14, request specifications, cutoff dates, approvals, and reserve all three placements. Sequence clarity, visible craft, and production-system education with distinct UTMs.",
    metric: "Three placements used and responses attributed",
    officialUrl: CHAMBER_LINKS.membership,
  },
  {
    slug: "member-blog",
    name: "Member spotlight blog post",
    benefitGroup: "Content",
    allowance: 1,
    activation:
      "By D+14, confirm whether the current format is a member spotlight, guest post, or both. Pitch an educational story about choosing the one business story that matters and link to the Brand Refresh planning page.",
    metric: "Article published with working backlink and CTA",
    officialUrl: CHAMBER_LINKS.membership,
  },
  {
    slug: "social-reel",
    name: "Chamber social media reel",
    benefitGroup: "Content",
    allowance: 1,
    activation:
      "Create a concise founder-led introduction showing production, promotion, and the business outcome path. End with the Brand Refresh URL.",
    metric: "Reel published and reused in follow-up",
    officialUrl: CHAMBER_LINKS.membership,
  },
  {
    slug: "podcast",
    name: "United We Podcast feature",
    benefitGroup: "Content",
    allowance: 1,
    activation:
      "Frame the interview around helping Corpus Christi businesses look established, build a repeatable content system, and connect attention to action.",
    metric: "Episode recorded, published, clipped, and shared",
    officialUrl: CHAMBER_LINKS.membership,
  },
  {
    slug: "ceremony",
    name: "Ceremony celebration",
    benefitGroup: "Relationship",
    allowance: 1,
    activation:
      "Use the ceremony as a production open house and live demonstration. Invite qualified members, show selected work, and capture follow-up content.",
    metric: "Event completed; named follow-ups scheduled",
    officialUrl: CHAMBER_LINKS.membership,
  },
  {
    slug: "committees",
    name: "Access to join Chamber committees",
    benefitGroup: "Relationship",
    allowance: 2,
    activation:
      "Request participation in Chamber Ambassadors and Economic Empowerment first. Contribute consistently before requesting referrals.",
    metric: "Two committee applications or introductions completed",
    officialUrl: CHAMBER_LINKS.membership,
  },
  {
    slug: "member-events",
    name: "Member event rates",
    benefitGroup: "Relationship",
    allowance: 6,
    activation:
      "Select events where owners and marketing leaders are likely to attend. Research attendees, set three conversation targets, and follow up within 48 hours.",
    metric: "Six strategic events attended; 18 target conversations",
    officialUrl: CHAMBER_LINKS.events,
  },
  {
    slug: "office-cards",
    name: "Company information and cards in Chamber office",
    benefitGroup: "Visibility",
    allowance: 1,
    activation:
      "Deliver current business cards and a concise Brand Refresh one-sheet. Add a trackable QR code or campaign URL before printing.",
    metric: "Materials accepted and display confirmed",
    officialUrl: CHAMBER_LINKS.membership,
  },
  {
    slug: "digital-cards",
    name: "Five digital business cards",
    benefitGroup: "Sales enablement",
    allowance: 5,
    activation:
      "Create Jeremy’s card first. Assign the remaining cards only to active client-facing roles or separately authorized current specialists, using the same calendar and offer links.",
    metric: "Five cards configured; primary links tested",
    officialUrl: CHAMBER_LINKS.membership,
  },
  {
    slug: "chamber-logo",
    name: "Official Chamber logo usage",
    benefitGroup: "Credibility",
    allowance: 1,
    activation:
      "Add the approved member mark to the website credibility area, proposals, email signatures, and Brand Refresh materials according to Chamber guidelines.",
    metric: "Approved logo used in four customer-facing places",
    officialUrl: CHAMBER_LINKS.membership,
  },
  {
    slug: "plaque-cling",
    name: "Member plaque and window cling",
    benefitGroup: "Credibility",
    allowance: 2,
    activation:
      "Display the plaque and cling where clients and partners meet the team. Photograph the installation for a membership announcement.",
    metric: "Both installed and documented",
    officialUrl: CHAMBER_LINKS.membership,
  },
  {
    slug: "certificates",
    name: "Free Certificates of Origin",
    benefitGroup: "Business service",
    allowance: 1,
    activation:
      "Confirm the current request process with Chamber staff and document it for projects that require trade or export documentation.",
    metric: "Process documented; use only when needed",
    officialUrl: CHAMBER_LINKS.membership,
  },
  {
    slug: "notary",
    name: "Free notary access",
    benefitGroup: "Business service",
    allowance: 1,
    activation:
      "Confirm hours, appointment requirements, and document limits; save the process for production agreements and business paperwork.",
    metric: "Access instructions documented",
    officialUrl: CHAMBER_LINKS.membership,
  },
] as const;

const CHAMBER_TASK_DEFINITIONS = [
  [
    "portal-invitation",
    "first_30",
    "Onboarding",
    "Request or resend the Member Portal invitation",
    "Credentials were received and verified on September 21, 2026. Keep this completed item as the access-history record.",
    "Jeremy",
    0,
  ],
  [
    "member-portal-access",
    "first_30",
    "Onboarding",
    "Confirm Chamber Member Portal access",
    "Sign-in was verified on September 21, 2026. The account opens to the Jeristotle Productions dashboard and company profile tools.",
    "Jeremy",
    1,
  ],
  [
    "portal-profile",
    "first_30",
    "Visibility",
    "Complete the Member Portal business profile",
    "Completed September 22, 2026 at 94% overall. Hours, directions, descriptions, five highlights, keywords, public contact review, approved visual media, and the featured video are live. Social links remain intentionally empty until real accounts exist.",
    "Jeremy",
    2,
  ],
  [
    "portal-media",
    "first_30",
    "Visibility",
    "Upload Jeristotle logos, photos, and videos",
    "Completed September 22, 2026. Photos and Logos is 100% complete with the approved member logo and four client-project images. The Golden Mic is live as the profile's featured video.",
    "Jeremy",
    3,
  ],
  [
    "portal-special-offer",
    "first_30",
    "Campaign",
    "Post the 2027 Brand Refresh special offer",
    "Submitted September 22, 2026 for Chamber approval. The September 22 through December 31 Hot Deal includes the approved title, complete package description, truthful outcome language, Jeristotle logo, confirmed phone, email action, and verified Brand Refresh application link.",
    "Jeremy",
    4,
  ],
  [
    "networking-calendar",
    "first_30",
    "Relationships",
    "Choose the first Chamber networking event",
    "Review Buenos Días, Members Who Lunch, and Networking Mixers on the official calendar. Select the best owner-and-marketing-leader room and register before capacity closes.",
    "Jeremy",
    5,
  ],
  [
    "ceremony-plan",
    "first_30",
    "Events",
    "Plan the Jeristotle production open house",
    "Choose the event concept, preferred date, location, concise founder message, live production demonstration, guest flow, and event graphic.",
    "Jeremy",
    6,
  ],
  [
    "ribbon-cutting-request",
    "first_30",
    "Events",
    "Submit the ribbon-cutting request",
    "Submit the official request at least two weeks in advance, then email the approved event graphic to chamber-contact@example.org.",
    "Jeremy",
    7,
  ],
  [
    "activation-call",
    "first_30",
    "Benefits",
    "Confirm Propeller activation details with Gloria",
    "Confirm lead times, format rules, contacts, availability, and expiration policy for every included benefit not already covered in the onboarding email.",
    "Jeremy",
    8,
  ],
  [
    "additional-listings",
    "first_30",
    "Visibility",
    "Request three additional directory listings",
    "Confirm the allowed categories and prioritize commercial video, social content, and event production/promotion.",
    "Jeremy",
    9,
  ],
  [
    "benefit-calendar",
    "first_30",
    "Operations",
    "Ask Gloria for promotional dates and deadlines",
    "Ask chamber-contact@example.org for available dates, submission cutoffs, asset requirements, and the contact for each included promotion. Work through the individual booking tasks that follow. Keep confirmations and deadlines in each task's Working notes; no separate calendar is required.",
    "Jeremy",
    10,
  ],
  [
    "book-dedicated-eblast",
    "first_30",
    "Promotion booking",
    "Confirm the dedicated e-blast send date",
    "Request an October slot if available. The 2027 Brand Refresh flyer and suggested copy are prepared. Ask for the exact send date, materials deadline, graphic specifications, and approval process. Save the Chamber's confirmation in Working notes before checking off. This is separate from the Hot Deal listing.",
    "Jeremy",
    11,
  ],
  [
    "book-member-blog",
    "first_30",
    "Promotion booking",
    "Book the member spotlight blog",
    "Ask Gloria who handles the blog, what the Chamber writes versus what we supply, and the interview and publication dates. Record the confirmed date, story/photo deadline, and contact in Working notes. Check off once the slot and requirements are confirmed, not when the article is published.",
    "Jeremy",
    12,
  ],
  [
    "book-social-reel",
    "first_30",
    "Promotion booking",
    "Book the Chamber social Reel",
    "Confirm who produces the Reel, the shoot or asset-submission date, expected publication date, format, and approval deadline. Save the confirmed dates and Chamber contact in Working notes. Use existing portfolio material where appropriate; do not treat a proposed date as a reserved slot.",
    "Jeremy",
    13,
  ],
  [
    "book-chamber-podcast",
    "first_30",
    "Promotion booking",
    "Book the Chamber podcast feature",
    "Request the recording appointment, topic or preparation requirements, and expected release window. Record the producer contact and confirmed appointment in Working notes; label an unconfirmed release date as pending. Recording and publication remain separate later tasks.",
    "Jeremy",
    14,
  ],
  [
    "book-flyer-one",
    "first_30",
    "Promotion booking",
    "Reserve weekly newsletter flyer placement 1",
    "Ask for the first available suitable weekly e-blast issue and confirm it uses included placement 1 of 3. Save the issue date, graphic dimensions, link requirements, and submission cutoff in Working notes. Start with the 2027 Brand Refresh invitation.",
    "Jeremy",
    15,
  ],
  [
    "book-flyer-two",
    "first_30",
    "Promotion booking",
    "Reserve weekly newsletter flyer placement 2",
    "Reserve included placement 2 of 3 for a later newsletter issue rather than using all placements together. Record the confirmed issue date and artwork deadline in Working notes. Agree on the next content or campaign message before preparing the graphic.",
    "Jeremy",
    16,
  ],
  [
    "book-flyer-three",
    "first_30",
    "Promotion booking",
    "Reserve weekly newsletter flyer placement 3",
    "Reserve included placement 3 of 3, spaced after the earlier placements and within the Chamber's benefit-use period. Save the confirmed issue date, artwork cutoff, and message in Working notes. Confirm the reset or expiration policy instead of assuming a deadline.",
    "Jeremy",
    17,
  ],
  [
    "book-ceremony-date",
    "first_30",
    "Promotion booking",
    "Record the confirmed ceremony date",
    "The ribbon-cutting request is a separate earlier checklist item. Confirm its booking status with Gloria without submitting a duplicate request. Record the actual event date, time, venue, Chamber contact, and event-graphic deadline in Working notes. If a request is still needed, the Chamber asks for at least two weeks' notice; no date is reserved until staff confirms it.",
    "Jeremy",
    18,
  ],
  [
    "digital-cards",
    "first_30",
    "Sales enablement",
    "Configure five digital business cards",
    "Build Jeremy’s card first with portfolio, booking, Brand Refresh, phone, email, and LinkedIn links. Assign any remaining cards only to active client-facing roles or separately authorized current specialists.",
    "Jeremy",
    11,
  ],
  [
    "office-materials",
    "first_30",
    "Visibility",
    "Deliver cards and the Brand Refresh flyer to the Chamber office",
    "Use the current one-sheet and a trackable QR code. Confirm placement with Chamber staff.",
    "Jeremy",
    12,
  ],
  [
    "committee-intros",
    "first_30",
    "Relationships",
    "Request two committee introductions",
    "Start with Ambassadors and Economic Empowerment, subject to Chamber fit and availability.",
    "Jeremy",
    13,
  ],
  [
    "blog-brief",
    "first_30",
    "Content",
    "Submit the member blog brief",
    "Pitch an educational article about why small businesses should not look small, with examples and one Brand Refresh CTA.",
    "Jeremy",
    14,
  ],
  [
    "reel-brief",
    "first_30",
    "Content",
    "Submit the Chamber social reel brief",
    "Show the difference between simply posting and building a movie-level production plus promotion system around a real business goal.",
    "Jeremy",
    15,
  ],
  [
    "prospect-25",
    "first_30",
    "Outreach",
    "Research the first 25 Chamber-member prospects",
    "Confirm current decision-makers, recurring content triggers, active campaigns, and local buying authority before contact.",
    "Jeremy",
    16,
  ],
  [
    "event-1",
    "first_30",
    "Relationships",
    "Attend the selected Chamber networking event",
    "Set three named conversation goals, listen for current marketing priorities, record same-day notes, and follow up personally within 48 hours.",
    "Jeremy",
    17,
  ],
  [
    "publish-blog",
    "days_31_60",
    "Content",
    "Publish and distribute the Chamber member blog",
    "Share the live article in direct follow-up and on Jeristotle channels; verify the backlink and CTA.",
    "Jeremy",
    18,
  ],
  [
    "publish-reel",
    "days_31_60",
    "Content",
    "Produce and publish the Chamber social reel",
    "Coordinate the shoot, approvals, caption, tags, and one trackable Brand Refresh CTA.",
    "Jeremy",
    19,
  ],
  [
    "podcast-record",
    "days_31_60",
    "Content",
    "Record the Chamber podcast feature",
    "Prepare founder story, local-business insights, proof examples, and a clear invitation to the Brand Refresh page.",
    "Jeremy",
    20,
  ],
  [
    "flyer-one",
    "days_31_60",
    "Campaign",
    "Use weekly e-blast flyer placement 1",
    "Lead with the limited Brand Refresh trial and the small-business credibility problem.",
    "Jeremy",
    21,
  ],
  [
    "outreach-wave-one",
    "days_31_60",
    "Outreach",
    "Complete Chamber-member outreach wave 1",
    "Research, contact, and follow up with the first 25 qualified members. Prioritize discovery meetings over mass email.",
    "Jeremy",
    22,
  ],
  [
    "events-two-three",
    "days_31_60",
    "Relationships",
    "Attend two more strategic events",
    "Use the pre-event list, three conversation targets, same-day notes, and 48-hour follow-up rule.",
    "Jeremy",
    23,
  ],
  [
    "dedicated-eblast",
    "days_61_90",
    "Campaign",
    "Launch the dedicated Chamber e-blast",
    "Run only after the blog, reel, podcast, landing page, scheduling link, and follow-up process are ready.",
    "Jeremy",
    24,
  ],
  [
    "flyer-two",
    "days_61_90",
    "Campaign",
    "Use weekly e-blast flyer placement 2",
    "Promote event content and launch campaigns with a specific discovery-call CTA.",
    "Jeremy",
    25,
  ],
  [
    "flyer-three",
    "days_61_90",
    "Campaign",
    "Use weekly e-blast flyer placement 3",
    "Promote recurring content systems to members with ongoing monthly visibility needs.",
    "Jeremy",
    26,
  ],
  [
    "ceremony-execute",
    "days_61_90",
    "Events",
    "Host the production open house and ceremony",
    "Demonstrate a real set, show selected work, capture opt-in contacts, and schedule next conversations without promising attendance.",
    "Jeremy",
    27,
  ],
  [
    "outreach-wave-two",
    "days_61_90",
    "Outreach",
    "Complete Chamber-member outreach wave 2",
    "Work the next 25 qualified members and revisit warm event relationships with a specific idea for their business.",
    "Jeremy",
    28,
  ],
  [
    "quarter-review",
    "days_61_90",
    "Operations",
    "Run the 90-day ROI review",
    "Measure benefits activated, conversations, meetings, Brand Refresh proposals, trials sold, monthly conversations, and lessons from leads that did not close.",
    "Jeremy",
    29,
  ],
] as const;

// Display order follows the list, so inserting booking steps cannot create
// duplicate positions. Stable slugs preserve progress and notes during sync.
export const CHAMBER_TASK_SEEDS = CHAMBER_TASK_DEFINITIONS.map(
  ([slug, phase, category, title, description, owner], sortOrder) =>
    [slug, phase, category, title, description, owner, sortOrder] as const
);

export const CHAMBER_EVENT_SEEDS = [
  {
    name: "Capability Statement Workshop: PITCH PERFECT!",
    eventDate: "2026-09-22T14:00:00-05:00",
    category: "Business Development",
    url: "https://chamber.unitedcorpuschristi.org/events/details/capability-statement-workshop-pitch-perfect-09-22-2026-31535",
    strategicGoal:
      "Improve Jeristotle's institutional and corporate capability pitch; meet growth-minded business owners.",
  },
  {
    name: "2026 State of the City",
    eventDate: "2026-09-23T12:00:00-05:00",
    category: "Government / Chamber",
    url: "https://chamber.unitedcorpuschristi.org/events/details/2026-state-of-the-city-presented-by-citgo-ccmc-30829",
    strategicGoal:
      "Build relationships with established employers, sponsors, developers, and civic leaders who use recurring campaigns and event content.",
  },
  {
    name: "Strategic Financial Planning",
    eventDate: "2026-09-23T14:00:00-05:00",
    category: "Business Development",
    url: "https://chamber.unitedcorpuschristi.org/events/details/strategic-financial-planning-31536",
    strategicGoal:
      "Meet advisors and scaling businesses; listen for launches, recruiting, education, and recurring trust-content needs.",
  },
  {
    name: "Small Business Orientation",
    eventDate: "2026-09-23T15:30:00-05:00",
    category: "Business Development",
    url: "https://chamber.unitedcorpuschristi.org/events/details/small-business-orientation-09-23-2026-31537",
    strategicGoal:
      "Meet newer businesses while staying selective about ability to fund the Brand Refresh and future recurring services.",
  },
  {
    name: "Cocktails with Candidates",
    eventDate: "2026-10-06T17:30:00-05:00",
    category: "Chamber Networking / Civic",
    url: "https://chamber.unitedcorpuschristi.org/events/details/cocktails-with-candidates-31523",
    strategicGoal:
      "Connect with local leaders and business professionals, listen to Corpus Christi City Council candidate priorities, and complete relationship-focused follow-up without implying political endorsement. The official Chamber listing says the venue is B.U.S., 702 N. Chaparral St., and admission is free for Chamber members.",
  },
  {
    name: "Buenos Dias Networking Breakfast",
    eventDate: "2026-10-22T07:30:00-05:00",
    category: "Chamber Networking",
    url: "https://chamber.unitedcorpuschristi.org/events/details/buenos-dias-networking-breakfast-30612",
    strategicGoal:
      "Meet three target members at Kiko's, learn their current marketing priorities, and complete personalized 48-hour follow-up. Member registration is $15 and includes breakfast.",
  },
] as const;

export const CHAMBER_CONTENT_CALENDAR = [
  {
    asset: "Member spotlight blog",
    timing: "Weeks 2–4",
    message:
      "Small businesses do not have to look small: five signs your content is costing you credibility.",
    cta: "See the 2027 Brand Refresh",
  },
  {
    asset: "Chamber social reel",
    timing: "Weeks 3–5",
    message:
      "Movie-level content production plus a plan for getting the work seen.",
    cta: "Watch selected work and apply",
  },
  {
    asset: "United We Podcast",
    timing: "Weeks 5–7",
    message:
      "Why production and digital distribution belong in the same business growth conversation.",
    cta: "Book a production-fit conversation",
  },
  {
    asset: "Weekly flyer 1",
    timing: "Weeks 5–6",
    message:
      "$3,500 Brand Refresh: a focused paid trial for established local businesses.",
    cta: "Apply for the Brand Refresh",
  },
  {
    asset: "Dedicated e-blast",
    timing: "Weeks 8–10",
    message:
      "Turn one production into a complete library of business content with a clear rollout plan.",
    cta: "Start the fit application",
  },
  {
    asset: "Weekly flyer 2",
    timing: "Weeks 9–10",
    message:
      "Event, launch, and campaign content built to keep working after the day is over.",
    cta: "Plan an upcoming campaign",
  },
  {
    asset: "Weekly flyer 3",
    timing: "Weeks 11–12",
    message:
      "From one successful project to a recurring content and promotion system.",
    cta: "Discuss ongoing content needs",
  },
] as const;

export const CHAMBER_EVENT_PLAYBOOK = [
  {
    phase: "Before the room",
    title: "Research six people, choose three conversations",
    copy: "Use the directory and event listing to identify six relevant members or returning contacts. Set three quality conversation goals, prepare one useful question, and know the next helpful resource before arriving.",
  },
  {
    phase: "In the room",
    title: "Lead with the business moment, not a pitch",
    copy: "Ask what they are building, launching, recruiting for, or promoting next. Learn who owns marketing decisions. A business card or friendly exchange is not a qualified opportunity.",
  },
  {
    phase: "Within 24 hours",
    title: "Log context and keep every promise",
    copy: "Record the person, role, need, source, permission basis, and next date. Send anything promised or assign a due date before moving on to another prospecting task.",
  },
  {
    phase: "Within 48 hours",
    title: "Send one personal follow-up",
    copy: "Reference the actual conversation and offer one relevant sample, worksheet, introduction, or 20-minute planning conversation. Do not send a generic sales deck.",
  },
  {
    phase: "Days 7–10",
    title: "Offer one low-pressure next step",
    copy: "If welcomed, offer a content-planning conversation, relevant sample, or permission to stay in touch. Make at most one later trigger-based check-in, then pause.",
  },
  {
    phase: "Monthly",
    title: "Score rooms by relationship quality",
    copy: "Review repeated trust, decision-maker relevance, service contribution, consented next steps, time and cost, and strategic fit. Do not score an event by assumed reach or promised leads.",
  },
] as const;

export const CHAMBER_RELATIONSHIP_PLAYS = [
  {
    name: "Ambassador Committee",
    priority: "Primary recurring commitment",
    action:
      "Ask Gloria for onboarding, service expectations, event assignments, and the next meeting location. Serve consistently for a 90-day test before judging value.",
  },
  {
    name: "Economic Empowerment",
    priority: "Secondary committee",
    action:
      "Ask for current priorities and offer one approved, non-sales resource such as a content-planning worksheet. Never trade free production for access.",
  },
  {
    name: "Member networking",
    priority: "Owner discovery",
    action:
      "Prioritize Buenos Dias-style breakfasts, small-business luncheons, and relevant ribbon cuttings where owners and marketing leaders have time for real conversation.",
  },
  {
    name: "State events",
    priority: "Account mapping",
    action:
      "Use State of the City, County, and Port selectively for senior relationships. Research target organizations and roles; never assume a ticket, table, or sponsorship creates access.",
  },
  {
    name: "Jeristotle ceremony",
    priority: "Live capability demonstration",
    action:
      "Coordinate six to eight weeks ahead. Combine Chamber protocol, a concise founder message, a production-system demonstration, goal-based conversation stations, opt-in follow-up, and clear filming consent.",
  },
] as const;

export const CHAMBER_FUNNEL_GUIDE = [
  [
    "Identified",
    "Confirmed in the public Chamber directory or through a documented Chamber interaction.",
  ],
  [
    "Researching",
    "Operating status, public trigger, decision path, factual personalization, and compliance gates are being verified.",
  ],
  [
    "Contacted",
    "A manual, compliant, personalized email, public-business call, or respectful visit has been logged.",
  ],
  [
    "Meeting",
    "A willing discovery or relationship conversation is scheduled or held; the business moment and decision process are being qualified.",
  ],
  [
    "Brand Refresh proposal",
    "A qualified buyer has a defined foundational need, decision access, timing, and a written $3,500 scope.",
  ],
  [
    "Brand Refresh client",
    "The paid trial is accepted. Deliverables, rights, approvals, timeline, revisions, and reporting are documented.",
  ],
  [
    "Monthly conversation",
    "Only after successful Brand Refresh delivery and review, a documented recurring need and mutual fit justify a separate conversation.",
  ],
  [
    "Monthly client",
    "A separately signed $4,500–$7,500 monthly content-and-distribution scope is active.",
  ],
] as const;

export const CHAMBER_COMPLIANCE_GUARDRAILS = [
  "Never imply that the Chamber referred, endorsed, approved, or partnered with Jeristotle. Use the member mark only under written Chamber rules.",
  "Use the public Chamber directory as a selective research source, not a bulk referral list. Do not automate scraping, text personal numbers, or subscribe contacts without permission.",
  "Commercial email needs accurate sender information, a truthful subject, Jeristotle's postal address, and a functional opt-out. Suppress opt-outs across every sender and sequence.",
  "Use only manual business-hours calls to public business numbers. Honor do-not-call and no-soliciting requests immediately; do not revisit after refusal.",
  "Regulated industries require client-side review of claims, testimonials, privacy, safety, releases, and filming access before production or publication.",
  "Report completed deliverables and observed source-labeled data. Never guarantee reach, attendance, leads, sales, creator participation, SEO, conversion, or market outcomes.",
] as const;

export const CHAMBER_SCRIPTS = [
  {
    name: "Propeller activation email to Gloria",
    copy: "Subject: Jeristotle Productions Propeller benefit activation — current requirements\n\nHello Gloria,\n\nJeristotle Productions is activating its Propeller membership. We provide movie-level content production for small businesses: commercials, social content series, brand stories, campaigns, launches, event content, recurring content systems, digital distribution, creator coordination when relevant, lead-capture paths, and transparent reporting.\n\nPlease confirm the current owner, specifications, lead times, approval rules, inventory, and member actions for the ceremony; three weekly e-blast flyers; blog or guest post; Reel; primary directory plus three same-name listings; dedicated e-blast and social campaign; podcast; five digital cards; logo, plaque, cling, office-card placement, event rates, committees, notary, and Certificates of Origin. Please also confirm whether the current blog format is a member spotlight, guest post, or both.\n\nWe will use only approved factual claims and report completed placements and available data without promising reach, attendance, leads, sales, creator participation, or market outcomes.\n\nThank you,\nJeremy Wells | Jeristotle Productions",
  },
  {
    name: "Event introduction",
    copy: "I’m with Jeristotle Productions. We help Corpus Christi businesses look like major brands through movie-level commercials, social content, and campaign production, then help distribute the work. What does your company need people to notice this quarter?",
  },
  {
    name: "Directory outreach",
    copy: "Subject: A Brand Refresh question for [Company]\n\nHi [Name],\n\nThis is a business introduction from Jeristotle Productions. I found [Company] in the United Corpus Christi Chamber public member directory while researching [category]. I am not writing on behalf of, or with an endorsement from, the Chamber.\n\nI noticed [one public factual observation]. Jeristotle produces movie-level commercials, brand stories, launch pieces, and social content for small businesses. Would a 15-minute fit conversation be useful to see whether a clearly scoped $3,500 Brand Refresh makes sense for [Company]? I can share the deliverables, production requirements, and reporting approach. I will not promise audience, lead, sales, attendance, or market results.\n\nIf this belongs with someone else, please tell me the best business contact. To stop future marketing email, reply unsubscribe or use [functional link].\n\n[Name] | Jeristotle Productions | [phone] | [website] | [valid physical postal address]",
  },
  {
    name: "Business call or voicemail",
    copy: "Hello, this is [Name] with Jeristotle Productions. I found [Company] in the public United Corpus Christi Chamber directory; I am not calling on the Chamber’s behalf. We produce movie-level brand and campaign content for small businesses. I noticed [single factual observation] and wanted to ask whether [owner or marketing lead] is the right person to consider a paid $3,500 Brand Refresh. If it is not relevant, I will update our record and not keep calling. May I send a one-page overview to the right business email?",
  },
  {
    name: "Respectful visit handoff",
    copy: "Hello, I’m [Name] from Jeristotle Productions. I found your public Chamber directory listing. I’m not with the Chamber and do not need to interrupt anyone. Is it alright to leave this one-page $3,500 Brand Refresh overview for the person who handles brand or marketing? It describes the paid starting scope and how to contact us. If you prefer no follow-up, please let me know and I will record that. Thank you.",
  },
  {
    name: "Post-event follow-up",
    copy: "It was good meeting you at [event]. I kept thinking about your comment regarding [need]. I have one practical content idea that could help your business present that more clearly. If useful, I can walk you through it in 15 minutes. No obligation and no promise of market results—just a focused production idea.",
  },
  {
    name: "Brand Refresh close",
    copy: "The best first step is the $3,500 Brand Refresh. It is a contained paid project designed to let both teams test the working relationship while creating a useful content library and rollout recommendations. If the work is strong and you have recurring needs, we can discuss an ongoing system after delivery.",
  },
  {
    name: "Monthly transition",
    copy: "Now that the Brand Refresh is delivered, what do you need to keep promoting every month? If the production process worked well for your team, we can build a right-sized recurring content and distribution plan in the $4,500–$7,500 monthly range. Scope would depend on the confirmed production and promotion needs.",
  },
  {
    name: "Opt-out acknowledgement",
    copy: "Subject: Confirmation — Jeristotle outreach stopped\n\nHi [Name],\n\nThank you for letting us know. We have marked [email, company, or phone] as do-not-contact for Jeristotle marketing outreach and will not send further marketing messages to this address.\n\nJeristotle Productions\n[valid physical postal address]",
  },
] as const;

export const TARGET_CATEGORY_SEEDS = [
  [
    "Real estate, development, and property management",
    "Tier 1",
    "Recurring listings, projects, recruiting, community updates, launches, and high customer value.",
  ],
  [
    "Healthcare, aesthetics, dental, and senior living",
    "Tier 1",
    "Trust, education, recruiting, service-line promotion, testimonials, and recurring local competition.",
  ],
  [
    "Banks, credit unions, insurance, and financial services",
    "Tier 1",
    "High customer value, education needs, community campaigns, recruiting, and executive visibility.",
  ],
  [
    "Hotels, attractions, venues, restaurants, and events",
    "Tier 1",
    "Continuous offers, seasonal campaigns, events, experiences, and social-first storytelling.",
  ],
  [
    "Dealerships and automotive groups",
    "Tier 1",
    "Frequent inventory, offers, recruitment, community sponsorships, and recurring campaign demand.",
  ],
  [
    "Construction, home services, engineering, and industrial firms",
    "Tier 1",
    "Project proof, recruiting, safety, capabilities, trust, and long B2B sales cycles.",
  ],
  [
    "Professional services and law firms",
    "Tier 2",
    "Authority, education, recruitment, founder visibility, and high-value client acquisition.",
  ],
  [
    "Fitness, specialty retail, and lifestyle brands",
    "Tier 2",
    "Visual offers and community content, but qualify budget, decision authority, and recurring need early.",
  ],
] as const;
