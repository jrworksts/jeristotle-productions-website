# Jeristotle Productions

Website for Jeristotle Productions, a Corpus Christi production company: movie-level content production for small businesses.

https://jeristotleproductions.com

## Stack

React 19, Vite, Tailwind 4, Express, tRPC, Drizzle ORM (MySQL) and TypeScript.

## Run locally

```sh
pnpm install
pnpm dev
```

The server expects environment variables such as `DATABASE_URL` and `JWT_SECRET`. See `SELF_HOSTING.md` for deployment notes.

## Note

This is a public, website-only copy. Internal research, prospect data, test fixtures and operational files are not included.

## Hosting on Cloudflare Pages

The public site is a static Vite build plus one Pages Function (`functions/api/inquiry.js`) for the consultation form.

- Build command: `pnpm install --frozen-lockfile && pnpm exec vite build`
- Build output directory: `dist/public`
- Environment variables: `NODE_VERSION=22`, `LEAD_MAILER_URL` (Apps Script web app URL), `LEAD_SECRET` (random shared secret; mark both secret)

Each inquiry is validated, then POSTed to a Google Apps Script web app (`scripts/lead-mailer.gs`) that emails it to jeremy@jeristotleproductions.com from Gmail, with the prospect as Reply-To. Setup steps are at the top of that file. After a successful send, the visitor goes to the consultation calendar.
