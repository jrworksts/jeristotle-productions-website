import BrandRefreshForm from "@/components/BrandRefreshForm";
import { BRAND_REFRESH_OFFER } from "@shared/brandRefresh";
import { JERISTOTLE_LOGO_URL as logo } from "@shared/brandAssets";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Clapperboard,
  FileText,
  Images,
  Megaphone,
  Play,
  Smartphone,
  TrendingUp,
} from "lucide-react";
import { useEffect } from "react";

const productionImage = "/manus-storage/production-set_a38f8baf.jpg";
const deliverableIcons = [
  Clapperboard,
  Play,
  Play,
  Smartphone,
  Images,
  TrendingUp,
  Megaphone,
  FileText,
];

export default function BrandRefresh2027() {
  useEffect(() => {
    document.title =
      "Get Ready for 2027 Brand Refresh | Jeristotle Productions";
    document
      .querySelector<HTMLMetaElement>('meta[name="description"]')
      ?.setAttribute(
        "content",
        "A limited movie-level brand refresh for small businesses. Get cinematic video, 20 social reels, 20 edited photos, and rollout strategy for 2027."
      );
  }, []);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#050505] text-white">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-black/75 backdrop-blur-xl">
        <div className="container flex h-[76px] items-center justify-between">
          <a
            aria-label="Jeristotle Productions home"
            className="flex items-center gap-3"
            href="/"
          >
            <img
              alt="Jeristotle Productions mark"
              className="h-11 w-11 object-contain"
              src={logo}
            />
            <span className="hidden text-[11px] font-bold uppercase tracking-[0.38em] text-white/80 sm:block">
              Jeristotle Productions
            </span>
          </a>
          <p className="hidden text-[9px] font-bold uppercase tracking-[0.4em] text-white/45 lg:block">
            Brands&nbsp;&nbsp; People&nbsp;&nbsp; Stories&nbsp;&nbsp; Movement
          </p>
          <a
            className="group flex items-center gap-3 border border-[#ffb627] px-4 py-3 text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#ffb627] hover:bg-[#ffb627] hover:text-black sm:px-5"
            href="#apply"
          >
            Apply now
            <ArrowUpRight size={15} />
          </a>
        </div>
      </header>

      <main>
        <section className="relative min-h-[1000px] overflow-hidden pt-28">
          <img
            alt="A cinematic Jeristotle production set"
            className="absolute inset-0 h-full w-full object-cover object-[56%_center]"
            src={productionImage}
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,2,2,.99)_0%,rgba(2,2,2,.93)_43%,rgba(2,2,2,.42)_72%,rgba(2,2,2,.78)_100%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.18),rgba(0,0,0,.08)_45%,rgba(0,0,0,.96)_100%)]" />
          <div className="grain absolute inset-0 opacity-25" />

          <div className="container relative z-10 grid min-h-[872px] items-center gap-16 pb-16 lg:grid-cols-[1fr_150px]">
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              initial={{ opacity: 0, y: 22 }}
              transition={{ duration: 0.65 }}
            >
              <p className="mb-6 text-[10px] font-extrabold uppercase tracking-[0.3em] text-[#ffb627] sm:text-xs">
                Limited time production offer
              </p>
              <h1 className="max-w-[900px] font-display text-[clamp(5.4rem,11vw,10.8rem)] uppercase leading-[0.72] tracking-[-0.075em]">
                Get ready
                <span className="block whitespace-nowrap">
                  for <span className="text-[#ffb627]">2027</span>
                </span>
              </h1>
              <h2 className="mt-6 max-w-3xl text-3xl font-black tracking-[-0.045em] sm:text-5xl">
                Brand Refresh Package
              </h2>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-white/72 sm:text-xl">
                Movie-level content for businesses that want to look like a
                major brand, get their story in front of the right people, and
                create a clearer path to customer conversations.
              </p>

              <div className="mt-10 grid max-w-4xl border border-[#ffb627]/75 bg-black/70 backdrop-blur-sm md:grid-cols-2">
                <div className="p-6 sm:p-8">
                  <p className="text-sm font-bold text-white/60">Investment</p>
                  <p className="mt-2 font-display text-7xl leading-none tracking-[-0.06em] text-[#ffb627] sm:text-8xl">
                    {BRAND_REFRESH_OFFER.investment}
                  </p>
                </div>
                <div className="border-t border-[#ffb627]/35 p-6 md:border-l md:border-t-0 sm:p-8">
                  <p className="text-sm font-bold text-white/60">
                    Package value
                  </p>
                  <p className="mt-3 text-4xl font-black text-white/50 line-through decoration-white/80 sm:text-5xl">
                    {BRAND_REFRESH_OFFER.packageValue}
                  </p>
                  <p className="mt-5 w-fit bg-[#ffb627] px-4 py-2 text-[10px] font-black uppercase tracking-[0.19em] text-black">
                    Only {BRAND_REFRESH_OFFER.spots} spots available
                  </p>
                </div>
              </div>
            </motion.div>

            <div className="hidden self-end pb-20 lg:block">
              <div className="border-l border-[#ffb627]/65 pl-8 text-[10px] font-extrabold uppercase leading-8 tracking-[0.42em] text-[#ffb627]">
                More than content.
                <br />A stronger tomorrow.
              </div>
            </div>
          </div>
        </section>

        <section className="relative border-t border-white/10 py-16 sm:py-24">
          <div className="container">
            <div className="grid gap-12 lg:grid-cols-[1fr_.55fr] lg:items-end">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.3em] text-[#ffb627]">
                  Complete content library
                </p>
                <h2 className="mt-6 font-display text-[clamp(4.8rem,8vw,8.4rem)] uppercase leading-[0.78] tracking-[-0.065em]">
                  What’s <span className="text-[#ffb627]">included</span>
                </h2>
              </div>
              <div className="max-w-lg lg:ml-auto">
                <p className="text-base leading-7 text-white/52">
                  A complete library of cinematic video, short-form content,
                  photography, and strategy designed to support a clearer 2027
                  rollout.
                </p>
                <p className="mt-5 text-sm leading-6 text-white/62">
                  One focused production gives you the core content, rollout
                  direction, and campaign-ready assets to begin 2027 with more
                  clarity and momentum.
                </p>
              </div>
            </div>

            <div className="mt-10 grid border-l border-t border-white/15 md:grid-cols-2">
              {BRAND_REFRESH_OFFER.deliverables.map((deliverable, index) => {
                const Icon = deliverableIcons[index];
                return (
                  <article
                    className="flex min-h-32 items-center gap-5 border-b border-r border-white/15 p-5 transition-colors hover:bg-white/[0.035] sm:p-6"
                    key={deliverable}
                  >
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-white/25 text-[#ffb627]">
                      <Icon size={23} strokeWidth={1.8} />
                    </span>
                    <div className="-translate-y-1">
                      <p className="font-mono text-[9px] font-bold tracking-[0.2em] text-[#ffb627]">
                        0{index + 1}
                      </p>
                      <h3 className="mt-1 text-lg font-bold leading-6 sm:text-xl">
                        {deliverable}
                      </h3>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section
          className="relative overflow-hidden border-t border-white/10 py-16 sm:py-24"
          id="apply"
        >
          <div className="absolute -right-32 top-10 h-[520px] w-[520px] rounded-full border border-[#ffb627]/10" />
          <img
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute -right-6 top-20 w-[440px] opacity-[0.035]"
            src={logo}
          />
          <div className="container relative z-10 grid gap-10 lg:grid-cols-[.8fr_1.2fr] lg:gap-16">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.3em] text-[#ffb627]">
                Apply for a spot
              </p>
              <h2 className="mt-5 font-display text-[clamp(4.8rem,8vw,8rem)] uppercase leading-[0.77] tracking-[-0.066em]">
                Make 2027 look like{" "}
                <span className="text-[#ffb627]">your next level</span>
              </h2>
              <p className="mt-6 max-w-md border-l border-[#ffb627]/60 pl-4 text-sm leading-6 text-white/70">
                <span className="font-bold text-[#ffb627]">
                  Not sure whether a Brand Refresh is the right first step?
                </span>{" "}
                Start with a complimentary 2027 content and marketing strategy
                session.
              </p>
              <p className="mt-6 max-w-md text-lg leading-8 text-white/55">
                Tell us where the business is going.
                <br />
                We will determine fit and recommend the clearest next step.
              </p>
            </div>
            <BrandRefreshForm />
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 bg-black py-9">
        <div className="container flex flex-col gap-7 sm:flex-row sm:items-center sm:justify-between">
          <a
            className="group flex items-center gap-3 text-xs font-extrabold uppercase tracking-[0.2em] text-white/50 hover:text-[#ffb627]"
            href="/"
          >
            <ArrowLeft
              className="transition-transform group-hover:-translate-x-1"
              size={17}
            />
            Back to Jeristotle Productions
          </a>
          <a
            href="/privacy-policy"
            className="w-fit text-xs font-bold uppercase tracking-[0.16em] text-white/65 hover:text-[#ffb627] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ffb627]"
          >
            Privacy Policy
          </a>
          <a
            className="group flex items-center gap-3 text-xs font-extrabold uppercase tracking-[0.2em] text-[#ffb627]"
            href="#apply"
          >
            Apply now
            <ArrowRight
              className="transition-transform group-hover:translate-x-1"
              size={17}
            />
          </a>
        </div>
      </footer>
    </div>
  );
}
