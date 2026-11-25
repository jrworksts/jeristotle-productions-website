export const BRAND_REFRESH_OFFER = {
  name: "2027 Brand Refresh Package",
  investment: "$3,500",
  packageValue: "$10,000",
  spots: 10,
  promotionGoal: "Full production and promotion plan",
  projectType: "2027 Brand Refresh Package",
  deliverables: [
    "2-3 minute cinematic brand film",
    "15-second promotional cut",
    "30-second promotional cut",
    "20 social media reels",
    "20 professionally edited photos",
    "Organic social content and rollout recommendations",
    "Paid campaign audience and creative recommendations",
    "2027 content rollout and next-step recommendations",
  ],
} as const;

export const BRAND_REFRESH_TIMELINES = [
  "ASAP",
  "Within the next few weeks",
  "1-2 Months",
  "Just Curious",
] as const;

export type BrandRefreshApplication = {
  fullName: string;
  businessName: string;
  email: string;
  phone: string;
  timeline: string;
  goals: string;
  discoverySource: string;
  website: string;
};

export function buildBrandRefreshInquiry(application: BrandRefreshApplication) {
  return {
    ...application,
    phone: application.phone || undefined,
    discoverySource: application.discoverySource || undefined,
    projectType: BRAND_REFRESH_OFFER.projectType,
    promotionGoal: BRAND_REFRESH_OFFER.promotionGoal,
    investment: `${BRAND_REFRESH_OFFER.name}: ${BRAND_REFRESH_OFFER.investment}`,
  };
}
