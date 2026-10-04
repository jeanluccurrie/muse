# MUSE

A personal music-history listening app — a React PWA that guides a listener through
the history of music, roughly 1600 to the present, one album at a time. It pairs a
focused audio player with an AI "historian" that provides context and conversation.

> This repository contains the public application code. Product design docs and
> curriculum content are maintained separately.

## Tech stack

- **Frontend:** React + Vite, TypeScript, Tailwind CSS
- **PWA:** vite-plugin-pwa (service worker, offline support, installable)
- **Backend:** Vercel Serverless Functions (Node.js / TypeScript)
- **Database:** Neon Postgres (`@neondatabase/serverless`)
- **Audio storage:** Vercel Blob
- **AI:** pluggable LLM provider (Anthropic / OpenAI), proxied through the backend

## Project structure

```
api/        Vercel serverless functions (auth, audio, progress, journals, MUSE content)
paths/      Curriculum path definition(s) as JSON
public/     PWA manifest and icons
src/
  components/   UI (path, player, journal, muse, library, bridge, synthesis)
  pages/        Route-level screens
  lib/          API client, audio, auth, themes
  types/        Shared TypeScript types
  styles/       Global CSS / theming
```

## Deploy your own

To stand up your own instance — Vercel, Neon, Blob storage, database migration, AI
setup, and audio upload — follow the step-by-step guide in **[DEPLOY.md](DEPLOY.md)**.
It takes about 20–30 minutes and the free tiers are sufficient for personal use.

## Local development

### Prerequisites

- Node.js 20+
- A Neon Postgres database and a Vercel Blob store (see [DEPLOY.md](DEPLOY.md))

### Environment variables

Copy `.env.local.example` to `.env.local` and fill in:

| Variable | Description |
| --- | --- |
| `MUSE_AUTH_PASSWORD` | The shared password used to access the app |
| `DATABASE_URL` | Neon Postgres connection string |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob read/write token |

`.env.local` is gitignored and must never be committed.

### Run

```bash
npm install
npm run dev        # start the dev server
npm run build      # production build
npm run preview    # preview the production build locally
```

## License

MUSE is licensed under the **GNU Affero General Public License v3.0** (AGPL-3.0) —
see [LICENSE](LICENSE) for the full text.

In short: you are free to use, study, modify, and self-host MUSE. But if you run a
modified version as a network service, you must make your modified source available
to that service's users under the same license.
