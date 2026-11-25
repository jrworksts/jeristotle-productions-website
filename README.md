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
- Environment variables: `NODE_VERSION=22`, `HIGHLEVEL_WEBHOOK_URL=<HighLevel inbound webhook URL>` (mark it secret)

Each inquiry is validated and POSTed to the HighLevel webhook as JSON (`first_name`, `last_name`, `email`, `phone`, `company_name`, `project_type`, `promotion_goal`, `investment`, `timeline`, `goals`, `discovery_source`). Map those fields in the HighLevel workflow that owns the webhook. After a successful send, the visitor goes to the consultation calendar.
