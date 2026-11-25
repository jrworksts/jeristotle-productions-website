import { Link } from "wouter";

export default function NotFound() {
  return (
    <main className="min-h-screen w-full bg-[#050505] text-white flex items-center justify-center px-6">
      <div className="max-w-xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ffb627]">
          Jeristotle Productions
        </p>
        <h1 className="mt-6 text-7xl font-black tracking-tight sm:text-8xl">
          404
        </h1>
        <h2 className="mt-4 text-2xl font-bold text-[#ffb627]">
          Page not found
        </h2>
        <p className="mt-4 leading-relaxed text-white/70">
          The page you are looking for does not exist or has moved.
        </p>
        <Link
          href="/"
          className="mt-8 inline-block border border-[#ffb627] bg-[#ffb627] px-8 py-3 text-xs font-bold uppercase tracking-[0.2em] text-black transition hover:bg-transparent hover:text-[#ffb627]"
        >
          Back to home
        </Link>
      </div>
    </main>
  );
}
