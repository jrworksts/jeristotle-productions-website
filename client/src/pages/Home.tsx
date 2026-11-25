import ProjectForm from "@/components/ProjectForm";
import YouTubeThumbnail from "@/components/YouTubeThumbnail";
import { JERISTOTLE_LOGO_URL as logo } from "@shared/brandAssets";
import {
  ADDY_AWARDS_LOGO,
  AWARD_RIBBON_IMAGES,
  selectedWork,
  selectedWorkEmbedUrl,
} from "@shared/selectedWork";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  Clapperboard,
  Menu,
  Play,
  X,
} from "lucide-react";
import { useState } from "react";

const hero = "/manus-storage/hero-corpus-christi_07dd5f33.jpg";
const production = "/manus-storage/production-set_a38f8baf.jpg";
const distribution = "/manus-storage/distribution-room_576a719f.jpg";

const services = [
  {
    number: "01",
    title: "Content Strategy",
    copy: "Clarify the audience, offer, business objective, story, channels, and action the content should support before production begins.",
  },
  {
    number: "02",
    title: "Movie-Level Production",
    copy: "Produce commercials, brand stories, social series, photography, campaign assets, event content, and recurring systems with the right creative team for the brief.",
  },
  {
    number: "03",
    title: "Content Systems",
    copy: "Plan formats and deliverables so one production creates a useful library for social, web, campaigns, email, sales, and local visibility.",
  },
  {
    number: "04",
    title: "Promotion & Amplification",
    copy: "Activate the appropriate organic, paid, partner, creator, local-search, event, or media channels to help the work get seen.",
  },
  {
    number: "05",
    title: "Lead Capture & Follow-Up",
    copy: "Connect attention to landing pages, offers, forms, CRM, email, SMS, and workflow automation for a clearer path to customer conversations.",
  },
  {
    number: "06",
    title: "Reporting & Improvement",
    copy: "Use tracking, analytics, reviews, and campaign learning to improve the content and customer path over time.",
  },
];

const promotionServices = [
  {
    number: "01",
    title: "Business Promotion",
    copy: "Turn your strongest content into a coordinated campaign across social, email, web, local media, partnerships, and paid channels.",
    outcome: "Support recognition and demand generation",
  },
  {
    number: "02",
    title: "Event Promotion",
    copy: "Use pre-event creative, countdown content, registration paths, local outreach, and campaign timing to support awareness and attendance goals.",
    outcome: "Support awareness, registration, and attendance goals",
  },
  {
    number: "03",
    title: "Creator Coordination",
    copy: "Identify, vet, invite, and coordinate creators whose audience and voice make sense for your business, launch, or event.",
    outcome: "Extend relevant audience access",
  },
  {
    number: "04",
    title: "Lead Systems",
    copy: "Connect content to a clear offer, landing page, form, tracking plan, CRM, and follow-up automation so attention has a practical next step.",
    outcome: "Give attention a clearer next step",
  },
  {
    number: "05",
    title: "Paid Media Promotion",
    copy: "Build audiences, creative variations, media plans, and optimization cycles that put budget behind the content performing best.",
    outcome: "Put budget behind the strongest creative",
  },
  {
    number: "06",
    title: "On-Site Amplification",
    copy: "Capture interviews, reactions, highlights, and fast-turn social assets that extend an event story beyond the people in the room.",
    outcome: "Extend the event story beyond the room",
  },
];

const process = [
  [
    "01",
    "Clarify",
    "Define the audience, offer, business objective, and customer action the work should support.",
  ],
  [
    "02",
    "Create",
    "Build the right creative plan and produce movie-level content around the story your business needs to tell.",
  ],
  [
    "03",
    "Promote",
    "Put the work to use through the right mix of organic, paid, partner, local, creator, event, or media channels.",
  ],
  [
    "04",
    "Capture",
    "Give interested people a clear next step with a website, landing page, offer, registration path, or lead form.",
  ],
  [
    "05",
    "Follow up",
    "Connect CRM, email, SMS, and workflows so customer interest has a clear, timely response path.",
  ],
  [
    "06",
    "Improve",
    "Review the content, campaign, customer response, and tracking signals to improve the next round.",
  ],
];

const faqs = [
  [
    "What does full-service actually mean?",
    "It means one content-first marketing team from the first strategic conversation through the campaign learning. We can shape the concept, produce the assets, promote the release, coordinate creators, build the customer path, connect follow-up, and improve the system over time.",
  ],
  [
    "Do you only work with Corpus Christi businesses?",
    "Corpus Christi and the Coastal Bend are our home market and primary focus. We can also support projects with broader locations or audiences when the creative and production fit is right.",
  ],
  [
    "Can you work with our existing marketing team?",
    "Yes. We can lead the full engagement or plug into an existing agency, internal marketing team, or campaign strategy. Roles and approvals are clarified during pre-production.",
  ],
  [
    "Can you bring influencers to our event?",
    "Yes, when creator promotion is the right strategy. We can identify, vet, invite, brief, and coordinate relevant influencers or community creators. Participation, rates, content rights, and deliverables are confirmed individually. We never promise a specific person, audience result, or attendance number before agreements are in place.",
  ],
  [
    "How do you help generate leads?",
    "We connect strong content to a practical campaign system. That can include a clear offer, landing page or registration path, forms, tracking, paid media, CRM, email or SMS follow-up, and workflow automation. We report on measurable actions while staying honest that no agency can guarantee a specific lead volume or sales result.",
  ],
  [
    "What kinds of projects are the best fit?",
    "Commercials, social series, brand stories, launch campaigns, event productions, and recurring content systems are our core focus. We also produce documentaries, shorts, and original film projects when the creative fit is right.",
  ],
  [
    "How much should we plan to invest?",
    "Scope, crew, locations, production days, and deliverables all affect investment. Share the range you are planning in the project form; we will be direct about what is realistic and where the budget creates the most value.",
  ],
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-7 flex items-center gap-3 text-[11px] font-extrabold uppercase tracking-[0.28em] text-[#ffb627]">
      <span className="h-px w-8 bg-[#ffb627]" />
      {children}
    </div>
  );
}

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeVideo, setActiveVideo] = useState<string | null>(null);

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#050505] text-[#f4f0e8]">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-[#050505]/80 backdrop-blur-xl">
        <div className="container flex h-[76px] items-center justify-between">
          <a
            aria-label="Jeristotle Productions home"
            className="flex shrink-0 items-center gap-3"
            href="#top"
          >
            <img
              alt="Jeristotle Productions mark"
              className="h-10 w-10 object-contain"
              src={logo}
            />
            <div className="leading-none">
              <span className="block text-[13px] font-black uppercase tracking-[0.16em]">
                Jeristotle
              </span>
              <span className="mt-1 block text-[8px] font-bold uppercase tracking-[0.42em] text-[#ffb627]">
                Productions
              </span>
            </div>
          </a>

          <nav
            aria-label="Primary navigation"
            className="hidden items-center gap-8 min-[1440px]:flex"
          >
            <a className="nav-link" href="#capabilities">
              Content + Marketing System
            </a>
            <a className="nav-link" href="#work">
              Work
            </a>
            <a className="nav-link" href="#approach">
              How it works
            </a>
            <a className="nav-link" href="#why-us">
              Why Jeristotle
            </a>
            <a className="nav-link" href="#faq">
              FAQ
            </a>
          </nav>

          <a
            className="group hidden items-center gap-3 border border-[#ffb627] px-5 py-3 text-[11px] font-extrabold uppercase tracking-[0.2em] text-[#ffb627] transition-colors hover:bg-[#ffb627] hover:text-black sm:flex"
            href="#project"
          >
            Schedule a consultation
            <ArrowUpRight
              className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              size={15}
            />
          </a>

          <button
            aria-expanded={menuOpen}
            aria-label="Toggle navigation"
            className="flex h-11 w-11 items-center justify-center border border-white/15 min-[1440px]:hidden"
            onClick={() => setMenuOpen(open => !open)}
            type="button"
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <AnimatePresence>
          {menuOpen && (
            <motion.nav
              animate={{ opacity: 1, y: 0 }}
              aria-label="Mobile navigation"
              className="border-t border-white/10 bg-[#050505] px-6 py-7 min-[1440px]:hidden"
              exit={{ opacity: 0, y: -8 }}
              initial={{ opacity: 0, y: -8 }}
            >
              {[
                ["Content + Marketing System", "#capabilities"],
                ["Work", "#work"],
                ["How it works", "#approach"],
                ["Why Jeristotle", "#why-us"],
                ["FAQ", "#faq"],
                ["Schedule a consultation", "#project"],
              ].map(([label, href]) => (
                <a
                  className="flex items-center justify-between border-b border-white/10 py-4 text-sm font-bold uppercase tracking-[0.14em]"
                  href={href}
                  key={href}
                  onClick={closeMenu}
                >
                  {label}
                  <ArrowRight size={16} />
                </a>
              ))}
            </motion.nav>
          )}
        </AnimatePresence>
      </header>

      <main>
        <section
          className="relative flex min-h-[920px] items-end overflow-hidden pt-28"
          id="top"
        >
          <img
            alt="Content production crew overlooking the Corpus Christi waterfront"
            className="absolute inset-0 h-full w-full object-cover object-[62%_center]"
            src={hero}
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(3,3,3,.98)_0%,rgba(3,3,3,.88)_31%,rgba(3,3,3,.28)_67%,rgba(3,3,3,.55)_100%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,3,3,.28),rgba(3,3,3,0)_42%,rgba(3,3,3,.96)_100%)]" />
          <div className="grain absolute inset-0 opacity-25" />

          <div className="container relative z-10 pb-10 sm:pb-14">
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="max-w-5xl"
              initial={{ opacity: 0, y: 24 }}
              transition={{ duration: 0.7 }}
            >
              <div className="mb-7 flex items-center gap-3 text-[10px] font-extrabold uppercase tracking-[0.28em] text-[#ffb627] sm:text-xs">
                <span className="h-2 w-2 rounded-full bg-[#ffb627] shadow-[0_0_18px_#ffb627]" />
                Corpus Christi, Texas
              </div>
              <h1 className="max-w-[980px] font-display text-[clamp(4.4rem,10.7vw,10rem)] uppercase leading-[0.76] tracking-[-0.075em] text-white">
                Movie-level
                <span className="block text-[#ffb627]">content</span>
                <span className="block text-[#ffb627]">production</span>
                <span className="block text-[.7em]">
                  for
                  <em className="font-serif normal-case tracking-[-0.045em] text-white/90">
                    {" small businesses."}
                  </em>
                </span>
              </h1>
              <div className="mt-9 flex max-w-3xl flex-col gap-7 border-l border-[#ffb627]/60 pl-5 sm:mt-12 sm:flex-row sm:items-end sm:justify-between sm:pl-7">
                <p className="max-w-xl text-base leading-7 text-white/68 sm:text-lg">
                  We help small businesses tell their story online through
                  commercials, brand stories, social content, and web
                  development. Then create lead generation systems that grow
                  your business on autopilot.
                </p>
                <a
                  className="group flex shrink-0 items-center gap-3 text-xs font-extrabold uppercase tracking-[0.19em] text-white"
                  href="#project"
                >
                  Schedule a consultation
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#ffb627] text-black transition-transform group-hover:rotate-45">
                    <ArrowUpRight size={18} />
                  </span>
                </a>
              </div>
            </motion.div>

            <div className="mt-16 grid border-y border-white/15 sm:grid-cols-3">
              {[
                "Built around your objective",
                "Movie-level creative",
                "Content to customer",
              ].map((item, index) => (
                <div
                  className={`flex items-center gap-4 py-5 text-[10px] font-bold uppercase tracking-[0.18em] text-white/65 ${index > 0 ? "sm:border-l sm:border-white/15 sm:px-6" : ""}`}
                  key={item}
                >
                  <span className="text-[#ffb627]">0{index + 1}</span>
                  {item}
                </div>
              ))}
            </div>
          </div>

          <a
            aria-label="Scroll to introduction"
            className="absolute bottom-10 right-7 hidden h-20 w-20 items-center justify-center rounded-full border border-white/20 text-white/70 transition-colors hover:border-[#ffb627] hover:text-[#ffb627] xl:flex"
            href="#intro"
          >
            <ArrowDownRight size={24} />
          </a>
        </section>

        <section
          className="relative bg-[#f1eee7] py-24 text-[#080808] sm:py-32"
          id="intro"
        >
          <div className="container">
            <SectionLabel>What we believe</SectionLabel>
            <div className="grid gap-12 lg:grid-cols-[1.35fr_.65fr] lg:gap-24">
              <h2 className="jp-section-heading font-display">
                Great stories move people.{" "}
                <span className="text-outline-dark">
                  Random content just fills a feed.
                </span>
              </h2>
              <div className="flex flex-col justify-end">
                <p className="text-lg leading-8 text-black/65">
                  Your audience has endless options and almost no patience.
                  Jeristotle brings movie-level craft to business content, so
                  your message earns attention instead of blending in.
                </p>
                <p className="mt-6 text-lg leading-8 text-black/65">
                  One content-first marketing team connects the story, creative,
                  promotion, customer path, follow-up, and reporting so the work
                  does not stop at delivery.
                </p>
                <a
                  className="group mt-9 flex w-fit items-center gap-4 text-xs font-extrabold uppercase tracking-[0.2em]"
                  href="#capabilities"
                >
                  See the content-to-customer system
                  <ArrowRight
                    className="transition-transform group-hover:translate-x-2"
                    size={18}
                  />
                </a>
              </div>
            </div>
          </div>
        </section>

        <section
          className="border-t border-white/10 py-24 sm:py-32"
          id="capabilities"
        >
          <div className="container">
            <div className="mb-14 grid items-end gap-8 md:grid-cols-2">
              <div>
                <SectionLabel>Full-service capabilities</SectionLabel>
                <h2 className="jp-section-heading font-display">
                  Your Full Service
                  <br />
                  <span className="text-[#ffb627]">Marketing Team</span>
                </h2>
              </div>
              <p className="max-w-lg text-base leading-7 text-white/55 md:ml-auto">
                Jeristotle connects strategy, creative, production, promotion,
                lead capture, follow-up, and reporting so the work does not stop
                at delivery.
              </p>
            </div>

            <div className="grid border-l border-t border-white/15 md:grid-cols-2 lg:grid-cols-3">
              {services.map(service => (
                <article
                  className="group min-h-[300px] border-b border-r border-white/15 p-7 transition-colors hover:bg-[#ffb627] hover:text-black sm:p-9"
                  key={service.number}
                >
                  <div className="flex items-start justify-between">
                    <span className="font-mono text-xs text-[#ffb627] group-hover:text-black">
                      {service.number}
                    </span>
                    <ArrowUpRight
                      className="text-white/25 transition-transform group-hover:-translate-y-1 group-hover:translate-x-1 group-hover:text-black"
                      size={22}
                    />
                  </div>
                  <h3 className="mt-20 text-2xl font-bold tracking-[-0.03em] sm:text-3xl">
                    {service.title}
                  </h3>
                  <p className="mt-4 text-sm leading-6 text-white/48 group-hover:text-black/65">
                    {service.copy}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          className="overflow-hidden bg-[#ffb627] text-black"
          id="why-us"
        >
          <div className="grid lg:grid-cols-2">
            <div className="relative min-h-[620px] overflow-hidden lg:min-h-[840px]">
              <img
                alt="Commercial crew filming a Corpus Christi small business"
                className="absolute inset-0 h-full w-full object-cover"
                src={production}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              <div className="absolute bottom-7 left-7 flex items-center gap-3 border border-white/30 bg-black/55 px-4 py-3 text-[10px] font-bold uppercase tracking-[0.22em] text-white backdrop-blur-md">
                <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                Production in motion
              </div>
            </div>
            <div className="flex flex-col justify-between p-7 sm:p-12 lg:p-16 xl:p-20">
              <div>
                <div className="mb-7 flex items-center gap-3 text-[11px] font-extrabold uppercase tracking-[0.28em]">
                  <span className="h-px w-8 bg-black" />
                  The Jeristotle difference
                </div>
                <h2 className="jp-section-heading font-display">
                  Movie-level creative. Built to help you scale.
                </h2>
              </div>
              <div className="mt-16 max-w-xl lg:ml-auto">
                <p className="text-xl font-semibold leading-8 sm:text-2xl sm:leading-9">
                  We build the right creative team for the story, then connect
                  the finished work to promotion, lead capture, follow-up, and
                  reporting. Your content can become part of a practical
                  marketing system instead of ending as a beautiful file in a
                  folder.
                </p>
                <p className="mt-5 text-sm leading-6 text-black/65">
                  We also produce original films, documentaries, and short-form
                  projects. For businesses, our primary focus is cinematic
                  content and campaigns built to earn attention and support a
                  clearer customer path.
                </p>
                <div className="mt-12 grid gap-8 border-t border-black/25 pt-8 sm:grid-cols-2">
                  <div>
                    <p className="text-4xl font-black tracking-[-0.06em]">
                      Right-fit
                    </p>
                    <p className="mt-2 text-sm leading-6 text-black/60">
                      Directors, cinematographers, producers, editors, sound,
                      motion, and specialists chosen with purpose.
                    </p>
                  </div>
                  <div>
                    <p className="text-4xl font-black tracking-[-0.06em]">
                      One lead
                    </p>
                    <p className="mt-2 text-sm leading-6 text-black/60">
                      A clear line of accountability from discovery through
                      promotion, follow-up, and improvement.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-[#080808] py-24 sm:py-32" id="work">
          <div className="container">
            <div className="mb-14 grid gap-8 border-b border-white/15 pb-12 lg:grid-cols-[1fr_.7fr] lg:items-end">
              <div>
                <SectionLabel>Selected work</SectionLabel>
                <h2 className="jp-section-heading max-w-4xl font-display">
                  See what movie-level looks like.
                </h2>
              </div>
              <p className="max-w-lg text-base leading-7 text-white/52 lg:ml-auto lg:pb-2">
                Real productions for local brands, organizations, and cultural
                moments. Press play to see the craft, then explore the objective
                and project scope behind each piece.
              </p>
            </div>

            <div className="mb-10 flex flex-col gap-6 border-l-2 border-[#ffb627] bg-[#111] p-6 sm:flex-row sm:items-center sm:p-8">
              <div className="w-[184px] shrink-0 bg-[#f4f0e8] p-6">
                <img
                  alt="American Advertising Awards (ADDY Awards)"
                  className="h-auto w-full object-contain"
                  height={310}
                  loading="lazy"
                  src={ADDY_AWARDS_LOGO}
                  width={486}
                />
              </div>
              <div>
                <h3 className="text-2xl font-bold tracking-[-0.03em] sm:text-3xl">
                  Award Winning Video Production
                </h3>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">
                  Watch these 2024 and 2023 award-winning videos from Vendetta
                  our video team.
                </p>
              </div>
            </div>

            {[
              {
                id: "award",
                projects: selectedWork.filter(project => project.award),
              },
              {
                id: "other",
                projects: selectedWork.filter(project => !project.award),
              },
            ].map(group => (
              <div key={group.id} data-work-group={group.id}>
                {group.id === "other" && (
                  <h3 className="mb-8 mt-16 border-t border-white/15 pt-10 text-2xl font-bold tracking-[-0.03em] sm:text-3xl">
                    More Video Examples
                  </h3>
                )}
                <div className="grid grid-cols-1 gap-px bg-white/15 lg:grid-cols-2">
                  {group.projects.map(project => (
                    <article
                      className="group min-w-0 bg-[#080808]"
                      key={project.videoId}
                    >
                      <div className="relative aspect-video overflow-hidden bg-black">
                        {activeVideo === project.videoId ? (
                          <iframe
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            allowFullScreen
                            className="h-full w-full"
                            referrerPolicy="strict-origin-when-cross-origin"
                            src={selectedWorkEmbedUrl(project)}
                            title={project.videoTitle}
                          />
                        ) : (
                          <button
                            aria-label={`Play ${project.videoTitle}`}
                            className="relative h-full w-full overflow-hidden text-left"
                            onClick={() => setActiveVideo(project.videoId)}
                            type="button"
                          >
                            <YouTubeThumbnail
                              videoId={project.videoId}
                              className="h-full w-full object-cover opacity-78 transition duration-300 group-hover:scale-[1.025] group-hover:opacity-95"
                            />
                            <span className="absolute inset-0 bg-[linear-gradient(180deg,transparent_25%,rgba(0,0,0,.78)_100%)]" />
                            <span className="absolute inset-x-6 bottom-6 flex items-center justify-between gap-5">
                              <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-white">
                                Play project
                              </span>
                              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#ffb627] text-black transition-transform duration-200 group-hover:scale-110">
                                <Play fill="currentColor" size={18} />
                              </span>
                            </span>
                          </button>
                        )}
                      </div>
                      <div
                        className={`border border-t-0 border-white/15 ${project.award ? "p-4 sm:p-8 lg:p-6" : "p-6 sm:p-8"}`}
                      >
                        <div
                          className={`flex items-center justify-between font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[#ffb627] ${project.award ? "border-b border-white/15 pb-5 sm:pb-7" : ""}`}
                        >
                          <span>Project {project.number}</span>
                          <span>Watch the work</span>
                        </div>
                        <div
                          data-project-title-row={
                            project.award ? "award" : undefined
                          }
                          className={
                            project.award
                              ? "mt-6 flex items-center justify-between gap-3 sm:mt-8 sm:gap-8 lg:gap-4"
                              : "mt-8"
                          }
                        >
                          <div className="min-w-0 flex-1">
                            <h3
                              className={`font-display uppercase leading-[0.86] tracking-[-0.05em] ${project.award ? "text-[clamp(1.25rem,7vw,3rem)] sm:text-5xl md:text-6xl lg:text-[clamp(2rem,3.5vw,3.75rem)] xl:text-6xl" : "text-[clamp(2.5rem,12vw,3rem)] sm:text-6xl"}`}
                            >
                              {project.project}
                            </h3>
                            <p className="mt-4 text-xs font-bold uppercase tracking-[0.18em] text-white/48">
                              Client / {project.client}
                            </p>
                            {project.productionCredit && (
                              <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-white/48">
                                Production / {project.productionCredit}
                              </p>
                            )}
                          </div>
                          {project.award && (
                            <div
                              data-award-panel={project.award.ribbonColor}
                              className={`flex w-[4.5rem] shrink-0 flex-col items-center rounded-xl border px-2 py-3 text-center sm:w-40 sm:px-4 sm:py-5 lg:w-24 lg:px-2 lg:py-3 ${
                                project.award.ribbonColor === "gold"
                                  ? "border-[#ffb627]/35 bg-[#ffb627]/8 text-[#ffb627]"
                                  : "border-[#7ab5ff]/35 bg-[#7ab5ff]/8 text-[#7ab5ff]"
                              }`}
                            >
                              <img
                                alt={
                                  AWARD_RIBBON_IMAGES[project.award.ribbonColor]
                                    .alt
                                }
                                src={
                                  AWARD_RIBBON_IMAGES[project.award.ribbonColor]
                                    .src
                                }
                                data-award-ribbon={project.award.ribbonColor}
                                className="h-14 w-14 shrink-0 object-contain sm:h-28 sm:w-28 lg:h-20 lg:w-20"
                                width={384}
                                height={384}
                                loading="lazy"
                                decoding="async"
                              />
                              <span className="mt-2 text-[9px] font-extrabold uppercase leading-[1.4] sm:mt-3 sm:text-sm lg:text-[10px]">
                                {project.award.label}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="mt-8 grid gap-px bg-white/15 sm:grid-cols-2">
                          {project.facts.map(fact => (
                            <div
                              className="bg-[#111] px-5 py-5 text-sm font-bold leading-6 text-white/82"
                              key={fact}
                            >
                              <span className="mb-3 block h-1 w-8 bg-[#ffb627]" />
                              {fact}
                            </div>
                          ))}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ))}

            <p className="mt-7 max-w-4xl text-xs leading-6 text-white/35">
              Performance figures reflect reported results across the projects
              shown. Past performance does not guarantee future views, reach,
              leads, attendance, or revenue.
            </p>
          </div>
        </section>


        <section className="py-24 sm:py-32" id="approach">
          <div className="container">
            <div className="grid gap-14 lg:grid-cols-[.7fr_1.3fr] lg:gap-24">
              <div className="lg:sticky lg:top-32 lg:self-start">
                <SectionLabel>How it works</SectionLabel>
                <h2 className="jp-section-heading font-display">
                  From story
                  <br />
                  to{" "}
                  <span className="font-serif normal-case text-[#ffb627]">
                    system.
                  </span>
                </h2>
                <p className="mt-7 max-w-sm text-base leading-7 text-white/50">
                  A deliberate six-stage content-to-customer system that keeps
                  the story, customer path, and next round connected.
                </p>
              </div>
              <div className="border-t border-white/15">
                {process.map(([number, title, copy]) => (
                  <article
                    className="group grid gap-5 border-b border-white/15 py-8 sm:grid-cols-[70px_180px_1fr] sm:items-start sm:py-10"
                    key={number}
                  >
                    <span className="font-mono text-xs text-[#ffb627]">
                      {number}
                    </span>
                    <h3 className="text-3xl font-bold tracking-[-0.04em] transition-colors group-hover:text-[#ffb627]">
                      {title}
                    </h3>
                    <p className="max-w-lg text-sm leading-6 text-white/50 sm:ml-auto">
                      {copy}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="container pb-24 sm:pb-32">
          <div className="relative overflow-hidden border border-white/15">
            <img
              alt="Producer and client reviewing a finished production"
              className="absolute inset-0 h-full w-full object-cover"
              src={distribution}
            />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,.97),rgba(0,0,0,.84)_52%,rgba(0,0,0,.28))]" />
            <div className="relative z-10 max-w-3xl px-7 py-24 sm:px-14 sm:py-32 lg:px-20">
              <SectionLabel>Beyond the final cut</SectionLabel>
              <h2 className="jp-section-heading font-display">
                Beautiful content is only useful when it{" "}
                <span className="text-[#ffb627]">gets seen.</span>
              </h2>
              <p className="mt-7 max-w-xl text-base leading-7 text-white/60">
                We plan formats, channels, launch moments, customer paths, and
                campaign extensions early, so production creates an asset
                system, not one lonely video file.
              </p>
              <a
                className="group mt-9 inline-flex items-center gap-3 bg-white px-6 py-4 text-[11px] font-extrabold uppercase tracking-[0.18em] text-black transition-colors hover:bg-[#ffb627]"
                href="#project"
              >
                Plan my content-to-customer system
                <ArrowUpRight
                  className="transition-transform group-hover:-translate-y-1 group-hover:translate-x-1"
                  size={17}
                />
              </a>
            </div>
          </div>
        </section>

        <section
          className="bg-[#ffb627] py-24 text-black sm:py-32"
          id="promotion"
        >
          <div className="container">
            <div className="grid gap-10 border-b border-black/20 pb-14 lg:grid-cols-[1.15fr_.85fr] lg:items-end">
              <div>
                <div className="mb-7 flex items-center gap-3 text-[11px] font-extrabold uppercase tracking-[0.28em]">
                  <span className="h-px w-8 bg-black" />
                  Production plus promotion
                </div>
                <h2 className="jp-section-heading font-display">
                  We make the content. Then we make it move.
                </h2>
              </div>
              <div className="lg:pb-2">
                <p className="text-xl font-semibold leading-8 sm:text-2xl sm:leading-9">
                  High-level content is the beginning. We help put it to work
                  through the right channels, then connect attention to a clear
                  next step with websites, landing pages, offers, forms, CRM,
                  and follow-up automations.
                </p>
                <a
                  className="group mt-8 inline-flex items-center gap-3 border border-black px-6 py-4 text-[11px] font-extrabold uppercase tracking-[0.18em] transition-colors hover:bg-black hover:text-[#ffb627]"
                  href="#project"
                >
                  Plan my content-to-customer system
                  <ArrowUpRight
                    className="transition-transform group-hover:-translate-y-1 group-hover:translate-x-1"
                    size={17}
                  />
                </a>
              </div>
            </div>

            <div className="grid border-l border-black/20 sm:grid-cols-2 lg:grid-cols-3">
              {promotionServices.map(service => (
                <article
                  className="flex min-h-[310px] flex-col border-b border-r border-black/20 p-7 sm:p-9"
                  key={service.number}
                >
                  <div className="flex items-center justify-between font-mono text-[10px] font-semibold uppercase tracking-[0.18em]">
                    <span>{service.number}</span>
                    <span>Promote</span>
                  </div>
                  <div className="pt-16">
                    <h3 className="text-2xl font-black tracking-[-0.04em] sm:text-3xl">
                      {service.title}
                    </h3>
                    <p className="mt-4 text-sm leading-6 text-black/65">
                      {service.copy}
                    </p>
                    <p className="mt-6 border-t border-black/20 pt-4 text-[10px] font-extrabold uppercase tracking-[0.18em]">
                      {service.outcome}
                    </p>
                  </div>
                </article>
              ))}
            </div>

            <p className="mt-7 max-w-4xl text-xs leading-6 text-black/55">
              Creator participation, media costs, event attendance, lead volume,
              and sales outcomes depend on the offer, audience, budget, timing,
              approvals, and market response. We commit to disciplined strategy,
              execution, and transparent reporting. We do not manufacture
              guarantees.
            </p>
          </div>
        </section>

        <section className="border-y border-white/10 bg-[#0b0b0b] py-24 sm:py-32">
          <div className="container">
            <div className="grid gap-14 lg:grid-cols-[1.1fr_.9fr] lg:gap-24">
              <div>
                <SectionLabel>Built for business</SectionLabel>
                <h2 className="jp-section-heading font-display">
                  Not content for content’s sake.
                </h2>
              </div>
              <div className="grid gap-8 sm:grid-cols-2">
                {[
                  [
                    "Be remembered",
                    "Distinct creative that does not disappear into the same templates as everyone else.",
                  ],
                  [
                    "Build belief",
                    "Story structure and production value that make the business feel as credible as the work.",
                  ],
                  [
                    "Create leverage",
                    "A thoughtful asset plan that extends one production across channels and campaigns.",
                  ],
                  [
                    "Give people a next step",
                    "Creative, promotion, offers, lead capture, and follow-up working together toward a clearer customer path.",
                  ],
                ].map(([title, copy], index) => (
                  <div className="border-t border-white/20 pt-5" key={title}>
                    <span className="font-mono text-[10px] text-[#ffb627]">
                      0{index + 1}
                    </span>
                    <h3 className="mt-8 text-xl font-bold">{title}</h3>
                    <p className="mt-3 text-sm leading-6 text-white/45">
                      {copy}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="bg-[#f1eee7] py-24 text-black sm:py-32" id="faq">
          <div className="container grid gap-14 lg:grid-cols-[.68fr_1.32fr] lg:gap-24">
            <div>
              <SectionLabel>Questions, answered</SectionLabel>
              <h2 className="jp-section-heading font-display">
                Before we roll.
              </h2>
              <p className="mt-6 max-w-sm text-base leading-7 text-black/55">
                The straight answers most teams need before starting a serious
                production conversation.
              </p>
            </div>
            <div className="border-t border-black/20">
              {faqs.map(([question, answer]) => (
                <details
                  className="group border-b border-black/20"
                  key={question}
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-5 py-7 text-left text-lg font-bold sm:text-xl">
                    {question}
                    <ChevronDown
                      className="shrink-0 transition-transform group-open:rotate-180"
                      size={20}
                    />
                  </summary>
                  <p className="max-w-2xl pb-7 pr-8 text-sm leading-7 text-black/58 sm:text-base">
                    {answer}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section
          className="relative overflow-hidden py-24 sm:py-32"
          id="project"
        >
          <div className="absolute -right-36 top-8 h-[520px] w-[520px] rounded-full border border-[#ffb627]/10" />
          <div className="absolute -right-20 top-24 h-[360px] w-[360px] rounded-full border border-[#ffb627]/10" />
          <img
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute -right-10 top-20 w-[440px] opacity-[0.035]"
            src={logo}
          />
          <div className="container relative z-10 grid gap-14 lg:grid-cols-[.8fr_1.2fr] lg:gap-24">
            <div>
              <SectionLabel>Schedule a consultation</SectionLabel>
              <h2 className="jp-section-heading font-display">
                Make the thing they cannot scroll past.
              </h2>
              <p className="mt-8 max-w-md text-lg leading-8 text-white/55">
                Tell us what you need to create, who needs to see it, and what
                should happen after they do. We will help map the production,
                promotion, customer path, and next practical step around that
                goal.
              </p>
              <p className="mt-6 max-w-md border-l border-[#ffb627]/60 pl-4 text-sm leading-6 text-white/62">
                <span className="font-bold text-[#ffb627]">
                  Start with a complimentary 2027 content and marketing strategy
                  session.
                </span>{" "}
                For deeper planning, Marketing Strategy Advisory is available as
                a focused paid working engagement.
              </p>
              <div className="mt-12 flex items-center gap-4 border-t border-white/15 pt-7 text-xs font-bold uppercase tracking-[0.18em] text-white/55">
                <Clapperboard className="text-[#ffb627]" size={22} />
                Corpus Christi · Coastal Bend · Beyond
              </div>
            </div>
            <ProjectForm />
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 bg-black py-10">
        <div className="container">
          <div className="grid gap-10 border-b border-white/10 pb-10 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <img
                alt="Jeristotle Productions"
                className="h-16 w-16 object-contain"
                src={logo}
              />
              <p className="mt-5 max-w-md font-display text-4xl uppercase leading-[0.9] tracking-[-0.04em]">
                Movie-level{" "}
                <span className="text-[#ffb627]">content production</span> for
                small businesses.
              </p>
            </div>
            <a
              className="group flex items-center gap-4 text-xs font-extrabold uppercase tracking-[0.2em] text-[#ffb627]"
              href="#project"
            >
              Schedule a consultation
              <span className="flex h-12 w-12 items-center justify-center rounded-full border border-[#ffb627] transition-colors group-hover:bg-[#ffb627] group-hover:text-black">
                <Play fill="currentColor" size={15} />
              </span>
            </a>
          </div>
          <div className="flex flex-col gap-4 pt-7 text-[10px] font-bold uppercase tracking-[0.2em] text-white/35 sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} Jeristotle Productions</p>
            <a
              className="w-fit text-white/65 transition-colors hover:text-[#ffb627] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ffb627]"
              href="/privacy-policy"
            >
              Privacy Policy
            </a>
            <p>Corpus Christi, Texas · jeristotleproductions.com</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
