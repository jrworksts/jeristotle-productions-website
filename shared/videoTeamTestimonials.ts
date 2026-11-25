export const VIDEO_TEAM_SECTION_HEADING =
  "Working with our award winning video team";

export const VIDEO_TEAM_TESTIMONIALS = [
  {
    videoId: "K-6U7n3jo_g",
    name: "Al Arreola Jr.",
    role: "CEO",
    organization: "United Corpus Christi Chamber of Commerce",
    duration: "1:22",
    context: "Creative collaboration and storytelling",
  },
  {
    videoId: "3HNGQLTbIqQ",
    name: "Jessica Furdock",
    role: "Chief Marketing Officer (at filming)",
    organization: "United Corpus Christi Chamber of Commerce",
    duration: "0:58",
    context: "The filming experience and production quality",
  },
  {
    videoId: "di7udwi3wKA",
    name: "Marty Sepulveda",
    role: "Scout Executive & CEO",
    organization: "Scouting America, South Texas Council",
    duration: "1:23",
    context: "A collaborative local production team",
  },
  {
    videoId: "x1jALwmt8vs",
    name: "Ryan Whiteside",
    role: "Program Manager",
    organization: "ProTech Mechanical",
    duration: "0:24",
    context: "Communication and professional brand presentation",
  },
] as const;

export function videoTeamEmbedUrl(videoId: string): string {
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    throw new Error("Invalid YouTube video identifier");
  }
  return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&playsinline=1`;
}
