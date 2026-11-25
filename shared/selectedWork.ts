export type SelectedWorkProject = {
  number: string;
  videoId: string;
  videoTitle: string;
  project: string;
  client: string;
  facts: string[];
  startSeconds?: number;
  award?: {
    label: string;
    year: number;
    ribbonColor: "gold" | "blue";
  };
  productionCredit?: string;
};

export const ADDY_AWARDS_LOGO = "/manus-storage/AAA_Pro_Logo_04d9b0a6.png";

// Custom decorative award artwork requested by Jeremy, not official AAF marks.
export const AWARD_RIBBON_IMAGES = {
  gold: {
    src: "/manus-storage/gold-number-one-web_6cfccb46.png",
    alt: "Gold award ribbon with #1",
  },
  blue: {
    src: "/manus-storage/blue-best-web_fb80c88b.png",
    alt: "Blue award ribbon with Best",
  },
} as const;

// Jeremy's November 3 layout revision leads with these Vendetta award films.
// Award details are user-supplied, not inferred from another studio's records.
export const selectedWork: SelectedWorkProject[] = [
  {
    number: "01",
    videoId: "d70Vc2WqH4U",
    videoTitle: "Oceans '24: The Executive Team",
    project: "2024 Gala",
    client: "United Corpus Christi Chamber of Commerce",
    facts: ["Oceans '24: The Executive Team", "Cinematic event storytelling"],
    award: {
      label: "2024 Gold Medal Winner",
      year: 2024,
      ribbonColor: "gold",
    },
    productionCredit: "Vendetta",
  },
  {
    number: "02",
    videoId: "dDFK75itKEo",
    videoTitle: "Mural Fest Recap 2023",
    project: "Mural Fest 2023",
    client: "Downtown Corpus Christi",
    facts: ["Festival recap", "Art + community storytelling"],
    startSeconds: 22,
    award: {
      label: "2023 Best of Show",
      year: 2023,
      ribbonColor: "blue",
    },
    productionCredit: "Vendetta",
  },
  {
    number: "03",
    videoId: "GRuxDP_UMng",
    videoTitle: "The Golden Mic Season 1 Showcase Recap",
    project: "The Golden Mic",
    client: "Raps And Apps",
    facts: ["1M+ views across the project", "Full project management"],
  },
  {
    number: "04",
    videoId: "zI4ML8d4kzw",
    videoTitle: "The Exchange Relaunch",
    project: "The Exchange Relaunch",
    client: "Contigo Commerce",
    facts: ["300% revenue increase", "Full project management"],
  },
  {
    number: "05",
    videoId: "tnuOCRLiUNM",
    videoTitle: "Mural Fest 2026 in Downtown Corpus Christi",
    project: "Mural Fest 2026",
    client: "Downtown Management District",
    facts: ["Full event capture", "Social media recap videos"],
  },
  {
    number: "06",
    videoId: "nGT2qIqVooA",
    videoTitle: "Big Meat Energy for Full Send BBQ",
    project: "Big Meat Energy",
    client: "Full Send BBQ",
    facts: ["1.5M+ views across the project", "Viral moment + new customers"],
  },
];

export function selectedWorkEmbedUrl(project: SelectedWorkProject) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(project.videoId)) {
    throw new Error("Invalid YouTube video identifier");
  }
  const url = new URL(
    `https://www.youtube-nocookie.com/embed/${project.videoId}`
  );
  url.searchParams.set("autoplay", "1");
  url.searchParams.set("rel", "0");
  url.searchParams.set("playsinline", "1");
  if (project.startSeconds !== undefined) {
    if (!Number.isInteger(project.startSeconds) || project.startSeconds < 0) {
      throw new Error("Invalid YouTube video start time");
    }
    url.searchParams.set("start", String(project.startSeconds));
  }
  return url.toString();
}

export function selectedWorkWatchUrl(project: SelectedWorkProject) {
  selectedWorkEmbedUrl(project);
  const url = new URL("https://www.youtube.com/watch");
  url.searchParams.set("v", project.videoId);
  if (project.startSeconds)
    url.searchParams.set("t", `${project.startSeconds}s`);
  return url.toString();
}
