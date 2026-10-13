# QuizCraft

A responsive quiz platform built with React, TypeScript, Tailwind CSS, shadcn/ui-style Radix components, an Express API, and a real SQLite database. Accounts, drafts, published quizzes, answers, attempts, bookmarks, reports, and grades persist across server restarts. No cloud credentials are needed for local development.

## Run locally

Use **Node.js 22.13 or later** (Node 24 LTS recommended).

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Open **http://localhost:5173**. Vite proxies `/api` to port 3001. Register a new account through the interface. The eight seeded quizzes are explicitly labeled **Demo**; they have no fabricated user activity or scores.

## Included

- Responsive discovery, search by title/topic/creator, category and difficulty filtering, popularity/newest sorting, recent quizzes, and an introduction to the platform.
- Desktop sidebar, mobile navigation, persistent light/dark preference, accessible Radix dialogs, keyboard navigation, loading states, errors and notifications.
- Registration, login, logout, profile name/picture URL editing, account history and scores, bookmarks, and configurable guest participation.
- Quiz studio: draft autosave, validation, cover URL/color themes, category/difficulty, four question types, editable choices, accepted answers, explanations, points, duplicate/delete/reorder, preview, and publishing.
- Public, unlisted and private quizzes; share links and quiz IDs; configurable layout, time limit, review, answer visibility, passing score, question/answer shuffling, guest permission, and rankings.
- Automatic scoring on the server, normalized accepted text answers, creator review for manually graded answers, result details, retakes, result sharing, and opt-in public rankings.
- Dashboard, activity/performance chart, personal best, achievements, learning streak, draft/published filters and manual grading queue.
- Optional Flashcards on owned quiz cards: tap to reveal answers and explanations, swipe left for the next question or right for the previous one, with a brief flip animation between cards, use arrow buttons/keys, and restart a deck. Flashcards open in a focused overlay above a blurred library on every screen size. Background controls are inactive, keyboard focus stays in study mode, and Escape or Back closes it. Long answers scroll inside the card. Study sessions never create quiz attempts, scores, history or leaderboard entries. Missing answers point back to the editor.
- Reporting, administrator-only platform statistics and moderation with hide/resolve actions.

Published quiz edits preserve the historical question versions and settings used by earlier attempts. All draft attempts count as previews, including runs opened from Saved quizzes, and never appear in history or rankings. Owners can delete quizzes from My quizzes after confirmation. Deletion removes them from libraries, discovery and saved collections, disables share links, and removes the creator’s own attempts from history. Other participants’ published scores remain in their history. Existing draft runs and creator runs of deleted quizzes are corrected automatically when the server starts.

## Environment

| Variable | Purpose |
| --- | --- |
| `PORT` | API/production port; default `3001`. |
| `APP_ORIGIN` | Browser origin. Development: `http://localhost:5173`; production: your exact HTTPS origin. Used for origin checks and reset links. |
| `DATABASE_PATH` | SQLite file path; default `./data/quizcraft.sqlite`. Store on a persistent disk. |
| `NODE_ENV` | Set `production` behind HTTPS to enable secure session cookies. |
| `ADMIN_EMAIL` | Optional default email for the server-side administrator provisioning command. Public signup never grants admin access. |
| `EMAIL_WEBHOOK_URL` | Optional trusted HTTPS endpoint for sending password-reset email. Required for email delivery. |
| `EMAIL_WEBHOOK_TOKEN` | Optional bearer credential for that endpoint; server-only. |

The email webhook receives a JSON POST with `{ "to": "user@example.com", "subject": "Reset your QuizCraft password", "url": "https://your-site/?reset=..." }`. Deliver an email containing that URL and return a successful HTTP response. Tokens expire after one hour, are stored hashed, and are single use. Resetting a password revokes existing sessions. When the webhook is absent, the UI reports that email delivery needs configuration; it never pretends to have sent email.

## Database and security

The executable schema is in [`server/db.mjs`](server/db.mjs). Tables: `users`, `sessions`, `resets`, `quizzes`, `questions`, `attempts`, `responses`, `bookmarks`, and `reports`. Answer choices and accepted answers are stored as JSON on versioned question records. The `answer_options` view exposes individual options, and the `leaderboard_records` view derives public rankings from opt-in, finalized attempts.

The server hashes passwords with salted scrypt and stores only hashed session/reset tokens. Session cookies are HttpOnly and SameSite=Lax, with Secure enabled in production. Account mutation routes require a session. Quiz editing, private access, attempts, grading and admin routes check permissions on the server. SQL uses parameter binding. Correct answers and explanations are omitted from public quiz/active-attempt payloads. Result disclosure follows the quiz’s settings at the start of that attempt. Authentication requests are rate limited.

Timed attempts save answers while in progress. After expiry, the server ignores newly submitted answer data and grades only previously saved answers. Submitting the same attempt again returns its existing result. Guest attempts use random, high-entropy bearer IDs: keep those IDs private. Public leaderboard participation is explicitly opt-in.

Do not put secrets in `VITE_*` variables. `.env`, `data/`, dependencies and generated build artifacts are ignored by Git. Demo cover photographs are bundled locally under `public/covers` (Unsplash); Google Fonts is optional and falls back to system sans-serif when offline.

## Administrator access

After registering your account, grant access from a trusted terminal on the server:

```sh
npm run admin -- --email you@example.com
```

Reload the app. The Administration item becomes available. Administrator privileges are never self-assigned through public registration or profile editing.

## Verify

```powershell
npm test
npm run build
# Builds must be up to date before browser tests:
npm run test:e2e
```

API tests use a separate temporary database and port 3002. Browser tests launch an isolated production server on port 3003 with a separate database and use an installed Chrome at the Windows default path. Set `CHROME_PATH` to your Chrome executable on another system. Tests exercise desktop/tablet/mobile layouts, account creation, studio preview/publishing, bookmarks, guest quiz completion, dark mode, keyboard dialog dismissal, ownership, answer protection, grading, duplicate submission, timer expiry, private/unlisted access and moderation.

Responsive workflow tests cover 320, 390, 768, and 1024px touch viewports, including long content, flashcard flipping, horizontal swipes, vertical answer scrolling, draft editing, timed quiz completion, and results. Discovery is also checked at 375 and 1440px.

## Deploy

Build and serve the entire app from one Node host:

```sh
npm ci
npm run build
NODE_ENV=production APP_ORIGIN=https://quiz.example.com DATABASE_PATH=/var/lib/quizcraft/quizcraft.sqlite npm start
```

Use a Node hosting provider with an attached persistent disk, such as a container host or VPS. Terminate HTTPS at the host’s reverse proxy and route to the configured `PORT`. The Node server serves both the React production build and API. Mount `/var/lib/quizcraft` for durable data, configure the email webhook, and register your administrator account. From a trusted server terminal, run `npm run admin -- --email you@example.com` to grant its role. The included Dockerfile supports this deployment model.

```sh
docker build -t quizcraft .
docker run -d --name quizcraft -p 3001:3001 --env-file .env -e NODE_ENV=production -e APP_ORIGIN=https://quiz.example.com -e DATABASE_PATH=/var/lib/quizcraft/quizcraft.sqlite -v quizcraft-data:/var/lib/quizcraft quizcraft
```

Back up the database with SQLite’s online backup API or during a stopped-server maintenance window. Never copy only the live `.sqlite` file while ignoring its WAL. Run one app instance against the mounted database. For horizontal scaling, migrate the repository/data layer to managed PostgreSQL and a shared session/rate-limit store.

Static-only hosts (including a plain Vercel static deployment) cannot run this backend. Sites uses a Cloudflare Worker runtime; this Node/SQLite app requires the Node host described above, or a deliberate Worker/D1 backend migration. The local application is not published to a production URL automatically.
