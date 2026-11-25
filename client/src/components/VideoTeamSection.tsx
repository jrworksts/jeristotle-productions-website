import YouTubeThumbnail from "@/components/YouTubeThumbnail";
import {
  VIDEO_TEAM_SECTION_HEADING,
  VIDEO_TEAM_TESTIMONIALS,
  videoTeamEmbedUrl,
} from "@shared/videoTeamTestimonials";
import { Play, X } from "lucide-react";
import { useRef, useState } from "react";

export default function VideoTeamSection() {
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const playButtons = useRef(new Map<string, HTMLButtonElement>());

  function closePlayer(videoId: string) {
    setActiveVideoId(null);
    requestAnimationFrame(() => playButtons.current.get(videoId)?.focus());
  }

  return (
    <section
      aria-labelledby="video-team-heading"
      className="scroll-mt-24 border-y border-white/10 bg-[#0d0d0d] py-24 text-[#f4f0e8] sm:py-32"
      id="video-team"
    >
      <div className="container">
        <div className="mb-12 grid gap-8 lg:grid-cols-[1.4fr_.6fr] lg:items-end lg:gap-16">
          <div>
            <div className="mb-7 flex items-center gap-3 text-[11px] font-extrabold uppercase tracking-[0.24em] text-[#ffb627]">
              <span
                aria-hidden="true"
                className="h-px w-8 shrink-0 bg-[#ffb627]"
              />
              Our Award Winning Video Team
            </div>
            <h2
              aria-label={VIDEO_TEAM_SECTION_HEADING}
              className="jp-section-heading max-w-4xl font-display"
              id="video-team-heading"
            >
              Working with our{" "}
              <span className="text-[#ffb627]">award winning video team</span>
            </h2>
          </div>
          <p className="max-w-sm text-base leading-7 text-white/60 lg:pb-1">
            Hear from business and community leaders about the creativity,
            collaboration, and care behind their production experience.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8">
          {VIDEO_TEAM_TESTIMONIALS.map(testimonial => {
            const isActive = activeVideoId === testimonial.videoId;
            const playerTitle = `${testimonial.name}: ${testimonial.organization} video testimonial`;

            return (
              <article
                aria-labelledby={`video-team-${testimonial.videoId}`}
                className="group min-w-0 overflow-hidden border border-white/15 bg-[#080808]"
                key={testimonial.videoId}
              >
                <div className="relative aspect-video overflow-hidden bg-black">
                  {isActive ? (
                    <iframe
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      className="h-full w-full focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#ffb627]"
                      onLoad={() => iframeRef.current?.focus()}
                      ref={iframeRef}
                      referrerPolicy="strict-origin-when-cross-origin"
                      src={videoTeamEmbedUrl(testimonial.videoId)}
                      title={playerTitle}
                    />
                  ) : (
                    <button
                      aria-label={`Play ${testimonial.name}'s video testimonial`}
                      className="relative block h-full w-full overflow-hidden text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#ffb627]"
                      onClick={() => setActiveVideoId(testimonial.videoId)}
                      ref={node => {
                        if (node)
                          playButtons.current.set(testimonial.videoId, node);
                        else playButtons.current.delete(testimonial.videoId);
                      }}
                      type="button"
                    >
                      <YouTubeThumbnail
                        videoId={testimonial.videoId}
                        className="h-full w-full object-cover opacity-90 motion-safe:transition motion-safe:duration-200 motion-safe:group-hover:scale-[1.025] group-hover:opacity-100"
                      />
                      <span
                        aria-hidden="true"
                        className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.06)_25%,rgba(0,0,0,.7)_100%)]"
                      />
                      <span
                        aria-hidden="true"
                        className="absolute inset-0 flex items-center justify-center"
                      >
                        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#ffb627] text-black shadow-[0_0_35px_rgba(0,0,0,.25)] motion-safe:transition-transform motion-safe:duration-200 motion-safe:group-hover:scale-110 sm:h-20 sm:w-20">
                          <Play
                            className="ml-1"
                            fill="currentColor"
                            size={24}
                          />
                        </span>
                      </span>
                      <span
                        aria-hidden="true"
                        className="absolute inset-x-5 bottom-4 flex items-center justify-between gap-3 text-[10px] font-extrabold uppercase tracking-[0.18em] text-white sm:inset-x-6 sm:bottom-5"
                      >
                        <span>Watch their story</span>
                        <span className="rounded-full border border-white/25 bg-black/40 px-3 py-1.5 font-mono tracking-normal">
                          {testimonial.duration}
                        </span>
                      </span>
                    </button>
                  )}
                </div>

                <div className="border-t border-white/15 p-6 sm:p-7">
                  <p className="text-[10px] font-bold uppercase leading-5 tracking-[0.15em] text-[#ffb627]">
                    {testimonial.context}
                  </p>
                  <h3
                    className="mt-4 text-2xl font-bold tracking-[-0.03em] sm:text-3xl"
                    id={`video-team-${testimonial.videoId}`}
                  >
                    {testimonial.name}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-white/70">
                    {testimonial.role}
                  </p>
                  <p className="text-sm leading-6 text-white/50">
                    {testimonial.organization}
                  </p>
                  {isActive && (
                    <div className="mt-5 border-t border-white/10 pt-4">
                      <button
                        aria-label={`Close ${testimonial.name}'s video`}
                        className="inline-flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#ffb627] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ffb627]"
                        onClick={() => closePlayer(testimonial.videoId)}
                        type="button"
                      >
                        Close video <X aria-hidden="true" size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        <p className="mt-7 text-xs leading-6 text-white/40">
          Speaker roles reflect the original recordings. Videos load when you
          press play.
        </p>
      </div>
    </section>
  );
}
