# OweMe

**Who owes whom, for the money that's too small to chase.**

Printouts, chai, train tickets, group projects. Someone pays, everyone forgets, and three weeks later
nobody is sure who owes what. OweMe tracks that money without moving any of it.

The whole product is one loop:

> **Track → Notify → Confirm → Settle**

You log what happened. The other person gets told. They confirm the money actually moved (or say it
didn't, and the record stays disputed until the two of you sort it out). Then the balance is clean.

No money moves through OweMe. No UPI, no bank, no fees. It is a shared, unarguable memory of small
money between friends.

---

## Contents

- [What it does](#what-it-does)
- [Stack and architecture](#stack-and-architecture)
- [Local setup](#local-setup)
- [Database: migrations, RLS and tests](#database-migrations-rls-and-tests)
- [How the core loop works](#how-the-core-loop-works)
- [Realtime and notifications](#realtime-and-notifications)
- [The settlement engine](#the-settlement-engine)
- [PWA and offline behaviour](#pwa-and-offline-behaviour)
- [Security model](#security-model)
- [Testing](#testing)
- [Deploying to Vercel + Supabase](#deploying-to-vercel--supabase)
- [Operations: admin, retention, archiving](#operations-admin-retention-archiving)
- [What's deliberately not in v1](#whats-deliberately-not-in-v1)
- [Honest limitations](#honest-limitations)
- [Project layout](#project-layout)

---

## What it does

**Track.** Add an expense in under ten seconds: pick a friend, type an amount, tap a category chip
(Printout, Food, Travel, Ticket, Stationery, Project, Other), say who paid, done. Every timestamp is
the server's, never the phone's.

**Notify.** The other person's phone updates on its own — no pull-to-refresh, no "did you see my
message". Every meaningful event also writes a real row in `notifications` first, so nothing is lost
if their phone was off.

**Confirm.** The debtor taps *Mark as paid*. The creditor gets *"Did you receive this payment?"* —
**Yes** settles it, **No** disputes it. Both sides always see the same state, because it is one row
on one server.

**Settle.** Group balances are netted and reduced to the fewest possible payments. Not one transfer
per receipt — the minimum set that clears everybody.

Also in v1: groups with equal splits that add up to exactly the total, a notification centre with an
unread badge and working deep links, saved-up history with search/date/person/group/status filters,
**Download my history** (CSV + JSON), light and dark mode, and an admin panel for running the thing.

---

## Stack and architecture

| Layer | Choice |
| --- | --- |
| App | Next.js 15 (App Router) + React 19 + TypeScript (strict) |
| UI | Tailwind + shadcn/ui-style primitives on Radix + Lucide icons |
| Data | Supabase Postgres, row level security on every table |
| Auth | Supabase Auth, Google OAuth only in v1 |
| Realtime | Supabase Realtime (Postgres changes), one channel per session |
| Money | Postgres `numeric` in the database, integer **paise** in TypeScript |
| Hosting | Vercel (app) + Supabase free tier (database, auth, realtime) |

Three rules the codebase keeps, in order of priority:

1. **Changes reach affected people without a manual refresh.**
2. **Every important action produces a notification, and nothing is silently dropped.**
3. **Nobody can read or change another person's money by editing a request** — the *database*
   enforces this, not the UI.

A few decisions worth knowing before reading the code:

- **All writes are server actions** returning a discriminated `ActionResult` — they never throw at
  the browser, so every failure has a sentence to show next to the button that was pressed.
- **The server decides who is who.** The payer/debtor of an expense comes from the session, never
  from the form.
- **Double submits are safe.** Every create action takes a `client_request_id`; a repeat returns the
  original row with `duplicate: true` instead of a second expense.
- **Logging can never break a user action.** `log.warn/error` swallows its own failures, and the
  server-side logger strips anything that looks like a token, cookie or key before it is written.

---

## Local setup

**Prerequisites:** Node 20+ (22 recommended), npm, and a Supabase project (free tier is fine).
PostgreSQL 15+ locally is only needed if you want to run the SQL test suites.

### 1. Install

```bash
git clone <your-repo> oweme
cd oweme
npm install
```

### 2. Create the Supabase project and apply the migrations

Create a project at [supabase.com/dashboard](https://supabase.com/dashboard). Then apply the six
migrations **in filename order** — they are plain SQL and idempotent enough to be re-run on a fresh
database:

```bash
# Option A — Supabase CLI (recommended: it tracks what's applied)
supabase link --project-ref <your-project-ref>
supabase db push

# Option B — straight psql
for f in supabase/migrations/*.sql; do
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$f"
done
```

`SUPABASE_DB_URL` is in the dashboard under **Project Settings → Database → Connection string**.
Option C is to paste each file into the dashboard's SQL editor in order — fine for a first run, but
you lose the ability to re-run safely.

What the migrations create:

| File | Contents |
| --- | --- |
| `20260101090000_init_schema.sql` | 11 tables, enums, checks, indexes, the `split_equally` SQL mirror |
| `20260101090100_functions_triggers.sql` | state-machine transitions, event log, share reconciliation, idempotency |
| `20260101090200_rls.sql` | row level security for every table, `public_profiles`, grants |
| `20260101090300_notifications.sql` | `create_notification`, dedupe keys, the 14 notification types |
| `20260101090400_views_balances.sql` | `my_totals`, `my_balances`, `balance_with`, `my_friends`, `search_people` |
| `20260101090500_admin_retention.sql` | admin stats, audit log, retention + archival + purge, pg_cron jobs |

Two things the migrations do at the end that you should check:

- they add the financial tables to the `supabase_realtime` publication (Realtime only broadcasts
  tables that are in it);
- they schedule `oweme_archive_settled` (03:15) and `oweme_purge_logs` (03:45) with pg_cron, and
  print a notice instead of failing if pg_cron is unavailable.

### 3. Turn on Google sign-in

1. **Google Cloud Console** → APIs & Services → Credentials → *Create credentials* → OAuth client ID
   → Web application.
2. Authorised redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`
3. Copy the Client ID and secret into **Supabase → Authentication → Providers → Google**, and enable
   the provider.
4. **Supabase → Authentication → URL Configuration**: set *Site URL* to `http://localhost:3001` for
   local work and your Vercel URL for production, and add both to *Redirect URLs*.

OweMe only ever calls `signInWithOAuth({ provider: 'google' })`. The v1 auth is Google-only by
product decision, not by architecture: adding email/password later is a second button plus a provider
setting, and nothing already stored changes shape.

### 4. Environment variables

```bash
cp .env.example .env.local
```

Fill in `.env.local`. Every variable is documented in the file itself, including where to find it:

| Variable | Where it comes from |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon public |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → service_role secret |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3001` locally, your Vercel URL in production |
| `ARCHIVE_CRON_SECRET` | only if you deploy the archival Edge Function: `openssl rand -hex 32` |
| `DATABASE_URL` | only for `npm run db:verify` against a local throwaway database |

The service role key is optional for local development: the app detects its absence and admin actions
report a clear message instead of failing obscurely. It is required for the admin panel, the audit
log and the archival job in production. It must never be exposed to the browser — nothing in
`src/components` or any client bundle references it.

### 5. Run it

```bash
npm run dev            # http://localhost:3001
```

Sign in with Google, and you land on an empty Home screen with a "find people" nudge. Open a second
browser profile, sign in as someone else, search for the first account by `@username`, and send a
friend request — the first tab updates on its own.

### 6. Useful scripts

```bash
npm run dev         # development server
npm run build       # production build (also type-checks and lints)
npm start           # serve the production build
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm test            # unit tests (settlement, split, queries, routes)
npm run db:verify   # the SQL suites, against $DATABASE_URL
npm run mock        # a fake Supabase for smoke testing without a project
npm run smoke       # end-to-end checks against a running server
```

---

## Database: migrations, RLS and tests

### The schema

Eleven core tables: `profiles`, `friendships`, `expenses`, `expense_events`, `groups`,
`group_members`, `group_expenses`, `group_expense_shares`, `settlements`, `notifications`,
`notification_preferences` — plus `app_settings`, `admin_users`, `admin_audit_log`, `server_logs`,
`archived_records` and `user_exports` for running the thing.

Invariants the database enforces (not the UI):

- `amount > 0`; nobody can create an expense with themselves; shares of a group expense must sum to
  exactly the total — checked by a deferred constraint trigger, so it is impossible to commit a
  half-written split;
- one active friendship per pair, in either direction, enforced by a partial unique index on
  `(least(a,b), greatest(a,b))`;
- `expenses.client_request_id` is unique per creator → double submits collapse into one expense;
- `(status = 'CONFIRMED') = (settled_at is not null)` — a settled record always knows when;
- status changes only along legal edges, and every one of them appends an `expense_events` row with
  actor, event type and timestamp;
- group expenses can only be `PENDING` or `CANCELLED`; nothing is hard-deleted while it still matters.

Money is `numeric(14,2)` in the database and integer paise in TypeScript. There is no float anywhere
in the path from form to total — `toMinor('0.1') + toMinor('0.2') === 30` is a test, not a hope.

### Row level security

RLS is enabled on every table, with policies written for the case where someone has the anon key and
a `curl` habit:

| Table | Who can read | Who can write |
| --- | --- | --- |
| `profiles` | your own row only | your own row only |
| `public_profiles` (view) | everyone signed in | — (name, @username, avatar; **no email**) |
| `friendships` | the two parties | the requester creates; either party responds |
| `expenses` / `expense_events` | payer and debtor | party to the expense; events are trigger-only |
| `groups`, `group_members`, `group_expenses`, `group_expense_shares` | members | members, with ownership rules for removal |
| `settlements` | payer and receiver | the two parties |
| `notifications` | your own | **no insert policy at all** — server-side only, so nothing can be forged |
| `archived_records` | the people who were in it | none (append-only by the archival job) |
| `admin_*`, `app_settings`, `server_logs` | admins / read-only where the UI needs it | service role via admin-checked actions |

`02_rls_test.sql` proves it: a stranger sees nothing and cannot read, edit, cancel, delete, or forge
anyone else's expense, group or settlement; a debtor can mark a payment paid but cannot confirm it
themselves; `anon` is refused outright on every financial table and RPC.

### Running the SQL suites locally

The suites run the real migrations against a plain PostgreSQL instance — `supabase/tests/_bootstrap.sql`
fakes only the parts Supabase provides (`auth` schema, `auth.uid()`, the `anon`/`authenticated`/
`service_role` roles), so what is being tested is the schema you deploy.

```bash
createdb oweme_test
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/oweme_test npm run db:verify
```

Expected output:

```
→ 01_domain_test.sql … 146 assertions passed
→ 02_rls_test.sql … 40 assertions passed

════════════════════════════════════════
 all database tests passed
════════════════════════════════════════
```

The runner drops and rebuilds the schema between files, so point it at a throwaway database and
nowhere else.

---

## How the core loop works

### Adding an expense

Friend search → amount → category chip → "I paid" / "They paid" → submit. The dialog:

- debounces the people search to one request per 250 ms and only ever sends a query for two or more
  characters;
- refuses to submit while `navigator.onLine === false` and **says so before you tap** — there is no
  offline queue in v1 and a "saved" that never reached the server would be a lie;
- mints one `client_request_id` per draft and rotates it after a successful save, so a double tap or
  a flaky connection produces one expense, not two;
- writes the payer/debtor from the session, not from the form.

### The state machine

```
PENDING ──mark paid──▶ PAYMENT_MARKED ──creditor says yes──▶ CONFIRMED
   │                        │
   │                        └──creditor says no──▶ DISPUTED ──▶ (settled by talking)
   │                                                  │
   └──cancelled by the creditor──▶ CANCELLED ◀────────┘ (re-claim, or cancel)
```

Rules the database enforces, and the UI mirrors:

- only the debtor can mark a payment as made;
- only the creditor can confirm or dispute — a debtor can never confirm their own payment;
- a dispute records both claims and **never auto-resolves**; the record keeps its full timeline of
  who said what, when. Every screen shows the same state because there is only one;
- `settled_at` is set exactly when a record becomes `CONFIRMED`;
- cancelling is always a soft cancel. Nothing is hard-deleted while it is active, disputed or
  unresolved.

### Settling up

Any member of a pair can record "we settled this" in cash or UPI. It creates a `settlement` row that
the *other* person confirms — that confirmation is what moves the numbers, so nobody can quietly
declare themselves square.

---

## Realtime and notifications

### Realtime

One channel per signed-in session (`oweme:<user_id>`), with listeners on the ten tables the loop
touches. Incoming events are coalesced with a 120 ms debounce and turned into a single
`router.refresh()`, so a burst of changes costs one re-render instead of ten. Subscriptions are
removed on unmount, the channel is created once per session, and the browser subscribes through the
*same* RLS rules a query would hit — a tampered client still receives nothing it isn't allowed to see.

Reconnecting is visible rather than silent: a banner distinguishes "you're offline" from "catching up
with the server", and when the socket comes back the view refreshes immediately (the free tier drops
idle sockets; this is expected, not an error).

### Notifications

Notifications are **first-class database rows created server-side in the same transaction as the
thing that caused them**. That ordering is the whole point: if the network or the phone is gone, the
row still exists, and it is waiting the next time they open the app.

- 14 types with their own icon, tone and deep link: expense created, payment marked/confirmed/
  disputed, expense cancelled, friend request/accepted/declined, group added, group expense added,
  settlement created/confirmed, history expiring, admin announcement.
- **Dedupe keys** stop repeats: `/expense/<id>/mark:<event_id>`, `/settlement/<id>/confirmed`,
  `/friend/<id>/request`, `/group-member/<gid>:<uid>` — enforced by a partial unique index, so
  re-delivering the same signal cannot create a second alert.
- The notification centre has an unread badge in the nav, unread filters, mark-all-read, dismiss, and
  deep links that still work after the fact: if the thing a notification points at has since been
  archived or purged, the row says so instead of dropping you on a 404.
- **Clients cannot create notifications.** There is no insert policy — server triggers call a
  `SECURITY DEFINER` function. A user cannot forge an alert to themselves or to anybody else.

### Browser push is a bonus, not the mechanism

In-app notifications are the first-class channel and the app is complete without push. Browser
notifications are offered in **Profile → Alerts**, behind a deliberate tap, and the permission prompt
is only raised at that moment — asking on first load burns the permission forever. The service worker
already contains the `push` and `notificationclick` handlers, and *Send a test notification* proves
the display path end-to-end today.

What is deliberately missing is a **sender**: real Web Push needs VAPID keys and a delivery job (an
Edge Function with `web-push`), and on iOS push only works for a PWA added to the Home Screen. That is
a deployment decision, not a code gap — see [Honest limitations](#honest-limitations).

---

## The settlement engine

`src/lib/settlement.ts` is a pure module: balances in, payments out. No I/O, no Supabase, no React —
which is why it is exhaustively testable.

```ts
computeNetBalances(entries)          // reduce any signed deltas to one net figure per person
minimizeTransfers(balances)          // greedy debtor↔creditor matching, at most n−1 transfers
settleUp(balances)                   // throws if the balances don't sum to zero
transfersForUser(transfers, userId)  // "what do I actually have to pay?"
```

Conventions, held everywhere:

- **positive = owed to you**, negative = you owe;
- all amounts are integer paise, never floats;
- `settleUp()` **refuses to invent a settlement**: if the balances are off by even one paisa it
  throws rather than quietly dropping the remainder — a rounding bug should be loud;
- the result is deterministic (stable ordering by id) even when several minimal solutions exist.

The same logic exists in SQL for the database's own views, and `tests/split.test.ts` checks the
TypeScript split matches `split_equally`'s floors-and-remainder behaviour, so the two can't drift.

Covered by `tests/settlement.test.ts` (17 tests): a simple debtor/creditor pair, several people at
once, circular debt (A→B→C→A nets to nothing), all-zero balances, multiple simultaneous creditors and
debtors, and a 200-case randomised property test asserting every settlement ends at exactly zero.

---

## PWA and offline behaviour

- `public/manifest.webmanifest` — standalone display, `start_url: /home`, violet theme, maskable
  icon, and shortcuts for *Add an expense*, *Alerts* and *History* on long-press.
- Icons in `public/icons/` (192/512/maskable/Apple touch/favicon) plus `src/app/icon.png` and
  `apple-icon.png`.
- `public/sw.js` — an offline-friendly shell with three deliberate refusals:
  - it **never queues a financial write**. Creating an expense, marking a payment or recording a
    settlement needs a live connection, because v1 has no conflict resolution and a silent local write
    would eventually contradict the server;
  - it **never caches `/api` responses or authenticated HTML**, so a balance is never served stale and
    one person's screen can't be replayed to another on a shared device;
  - it never caches anything that isn't a static asset or a navigation fallback.
- Navigations fall back to a cached page → `/offline.html` → an inline plain-HTML response, so you get
  a human sentence rather than the browser's dinosaur.
- Assets are cache-first with a background revalidate; the cache is versioned (`oweme-v1`) and old
  caches are deleted on activation.

**There is no offline expense creation in v1, and the app says so** — the add-expense dialog refuses
the submit while offline, and the offline page explains why. That is a product decision: an offline
queue without conflict resolution would produce two different truths about who owes what.

---

## Security model

Assume the attacker has the anon key, a proxy and a UUID generator. The defence is the database:

- **RLS on every table**, with policies keyed to participation, not to which screen you came from.
- **No client write path to notifications, admin tables, settings or the archive.** Those are
  trigger- or service-role-only.
- **Public data is a view.** Other people's emails live in `profiles`, which nobody else can read;
  names, @usernames and avatars come from `public_profiles` and `search_people()`.
- **Server-side validation** of every input with zod: amounts, UUIDs, real friendship or membership,
  shares summing exactly, notification ownership, legal transitions.
- **Admin mutations are server actions** that re-check the caller's admin claim *before* using the
  service role, and write an `admin_audit_log` row either way. The client cannot write settings at all.
- **Admin bootstrap is one-shot.** `claim_first_admin()` only works while no admin exists; after that
  every grant is a manual SQL insert, so a compromised account can't promote itself from the UI.
- **Logs are sanitised** — keys matching token/secret/password/apikey/jwt/cookie are redacted and long
  strings truncated before anything is written. No secrets, no tokens, no message bodies.
- **Cookies and sessions** are handled by `@supabase/ssr`; the middleware refreshes them on every
  request and the route guard redirects expired sessions to `/login?reason=session-expired`, where the
  message is a sentence rather than a stack trace.

Edge cases handled on purpose: duplicate friend requests in both directions, double-submitted forms,
a network drop mid-save (you get an error, never a false "saved"), duplicate realtime delivery, leaving
a group with an open balance (refused, with the reason shown), stale notification deep links, expired
sessions, and multiple simultaneous sessions.

---

## Testing

Three layers, each proving something the others can't:

```bash
npm test                                  # 68 unit tests, no network, no database
npm run db:verify                         # 186 SQL assertions against real Postgres
npm run smoke                             # 30 checks against a running server
```

**Unit tests** (`vitest`) cover the pure logic and the app's own queries:

- `settlement.test.ts` (17) and `split.test.ts` (15) — the money maths, including the property test;
- `queries.history.test.ts` (13) — filters (person, date range, status, group, search), archived-row
  merging, totals, CSV quoting and totals footer;
- `queries.social.test.ts` (6) — friends, requests, notification reads, stale deep links;
- `api.routes.test.ts` (8) — export auth + filtering, health ok/degraded;
- `rls.policy-spec.test.ts` (9) — the query helpers, given exactly the rows a session could read,
  never widen the set; and public data stays public-data-shaped.

They run against an in-memory stand-in for `@supabase/supabase-js` (`tests/helpers/fake-supabase.ts`)
which speaks the slice of the PostgREST builder the app uses, plus a readable mirror of the RLS
policies (`tests/helpers/rls-policies.ts`). That is what lets a test say *"give me the rows Manesh can
see and prove the helper doesn't leak Priya's"* without a database.

**SQL suites** prove the schema itself: constraints, the share-sum trigger, the state machine, and RLS
as Postgres actually applies it — plus all three purge conditions and the fact that a group expense or
a settle-up archived behind your back still produces a notification.

**Smoke test** boots the real production build and checks what must hold before anyone signs in —
route guard redirects with a reason, login renders, `/api/health` answers honestly, the export refuses
anonymous callers, and the PWA assets are served with the right headers:

```bash
npm run mock &                # fake Supabase on 127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
NEXT_PUBLIC_SUPABASE_ANON_KEY=mock-anon-key npm run build && npm start &
npm run smoke
```

---

## Deploying to Vercel + Supabase

Both on free tier is fine; the app is built for it (no image pipeline, no PDF rendering, no
background workers you have to pay for).

1. **Database** — apply the migrations to your production Supabase project (step 2 above). Do this
   before the first deploy; the app queries tables that must already exist.
2. **Auth** — set the production *Site URL* and *Redirect URLs* to your Vercel domain
  (`https://your-app.vercel.app/**`), keeping `http://localhost:3001/**` on the list for local work.
3. **Realtime** — confirm the financial tables are in the `supabase_realtime` publication:
   ```sql
   select tablename from pg_publication_tables where pubname = 'supabase_realtime';
   ```
4. **Vercel** — import the repo, then add the environment variables from `.env.example` for
   *Production* and *Preview*. Set `NEXT_PUBLIC_SITE_URL` to the real domain.
5. **Deploy** — Vercel runs `npm run build`. Nothing else is needed: no build-time database access, no
   `postinstall` surprises.
6. **First admin** — sign in on the deployed app, open `/admin` and use *Claim admin access* while no
   admin exists. After that, grant the role with:
   ```sql
   insert into public.admin_users (user_id, note)
   select id, 'trusted teammate' from public.profiles where username = 'their_username';
   ```
7. **Archival** — the pg_cron jobs are created by the migration. If your project has pg_cron disabled,
   deploy the Edge Function instead:
   ```bash
   supabase functions deploy archive-records --no-verify-jwt
   supabase secrets set ARCHIVE_CRON_SECRET=$(openssl rand -hex 32)
   ```
   and schedule a daily `POST` with an `x-cron-secret` header (Supabase → Edge Functions → Schedules,
   or any cron). The admin panel's *Run the archive job now* button works regardless.
8. **Check it** — `https://your-app.vercel.app/api/health` should return
   `{"status":"ok","database":"reachable",...}` and a 503 when the database is unreachable.

Free-tier notes: Supabase pauses idle projects after about a week without traffic (a Vercel cron or
any visit wakes it), Realtime allows a few hundred concurrent connections (plenty for a few thousand
students), and 500 MB of database is a very large number of ₹20 chai entries.

---

## Operations: admin, retention, archiving

The `/admin` screen is **operational only — admin can never read anybody's expenses from it.** It
shows counts and totals across everyone (people, active users, expenses, open value, disputes, groups,
notification volume), the size of the database and its largest tables, the last 25 server-log lines,
the last 10 admin actions, and health signals.

What an admin can actually change:

| Control | Effect |
| --- | --- |
| Maintenance mode | everyone but admins sees a "back shortly" screen; no data is lost |
| New sign-ups | stop new people joining while you tidy up |
| Creating expenses | disables every add-expense entry point |
| Read-only mode | freezes all financial writes |
| Banner | a short dismissible note at the top of every screen |
| Retention | archive after *N* days, notice *N* days before purge, keep archived *N* days |

**Retention defaults to 180 / 30 / 90 days and every one of those numbers is a setting, not a
constant.** The rules the archival job obeys:

- records that are still active, pending or disputed are **never** touched;
- a settlement only moves once the pair (or group) has nothing open left to offset it with;
- **every affected person is notified** — 1:1 expenses, group expenses (all members) and settle-ups
  alike — with the exact date the archived copy can go;
- archived rows stay readable to the people who were in them, and are read-only forever.

**What decides a purge, precisely** (this is worth stating exactly, because it is easy to overstate):
the record must be past *keep archived for*, the people must have had their *notice before purge*, and
then **either** everyone has downloaded their history since that notice **or** twice the notice window
has passed. Deletion is therefore always *on or after* the keep-archived date.

The practical consequence: **a download can bring a purge forward, it can never hold one back, and it
never shortens somebody's notice.** And with the shipped defaults (keep 90 days, notice 30 days) the
keep-archived date is the one that binds, so the export path only ever matters when
`archive_purge_days < archive_notice_days`. The fallback exists so that one person who never downloads
cannot pin a row to the database — and to your free-tier quota — indefinitely. The user-facing wording
says the same thing ("cleared automatically on or after ⟨date⟩, whether or not you download"), and
`01_domain_test.sql` asserts each of those conditions separately.

The job runs on a schedule (pg_cron 03:15 archive, 03:45 log purge, or the Edge Function) and can be
triggered by hand from the admin panel.

---

## What's deliberately not in v1

Cut on purpose, not forgotten:

- **Real money movement.** No bank linking, no UPI processing, no payment rails. OweMe records what
  happened; you settle in cash or whatever you already use.
- **PDF export.** CSV and JSON ship in v1. A styled PDF (red/green/neutral totals, your name, the date
  range, generated-on date) is real work: headless rendering that doesn't belong on a free tier, or a
  print stylesheet that is a whole design pass of its own. It is deferred rather than half-built —
  see the comment in `src/app/api/history/export/route.ts`.
- **A Web Push sender.** The display path is wired and testable; delivery needs VAPID keys and a
  scheduled function. In-app notifications are complete without it.
- **Offline expense creation.** No conflict resolution in v1, so the app refuses the write and says so.
- **Email digests.** The preference is stored so it can be switched on later; nothing sends yet.
- **Loans, credit scoring, crypto, ads, marketplace, AI chatbot, analytics dashboards, social feed,
  in-app chat.** Out of scope, and the schema doesn't pretend otherwise.
- **Email/password auth.** Google-only in v1 by decision; adding the provider later changes no stored
  data.

## Honest limitations

Things that are true today and worth knowing before you rely on this:

- **Realtime needs a live socket.** If the connection drops, the banner shows it and the view
  refreshes when it returns — but a background tab on a flaky phone network can be briefly stale.
  Notifications are still rows in the database, so nothing is missed, only delayed.
- **The unit tests use a stand-in for the Supabase client**, not a live Postgres. They are strong on
  the app's own logic (filters, scoping, CSV, ids); the database's own behaviour is covered by the SQL
  suites. Neither replaces a real end-to-end run against your Supabase project, which is the first
  thing to do after setup.
- **The iOS PWA is close but not perfect:** push requires adding to Home Screen, and Safari may evict a
  long-idle PWA's cached shell. The app still works; it just refetches.
- **No pagination beyond 500 rows per source** in history and the export. For a student's ledger that
  is years of data; for anything heavier, add keyset pagination before raising it.
- **Single-currency in practice.** The schema carries `currency` on every money row and no INR
  assumptions in the database, but the UI formats INR only.
- **Avatar images come from Google** — nothing is stored in Supabase Storage, which is why the storage
  line in the admin panel reports database size rather than bucket usage.

---

## Project layout

```
src/
  app/
    (app)/                 signed-in shell: layout, loading, error boundary
      home/                totals, who-owes-whom, waiting-on-you, recent activity
      expenses/[id]/       one expense: both sides, actions, event timeline
      friends/             search, requests, friend list with balances
      groups/              list, detail with per-member paid/share/net + settle-up plan
      settlements/[id]/    a payment claim and its confirmation
      notifications/       notification centre with unread filter and deep links
      history/             filters, totals, CSV/JSON export
      profile/             name, @username, alerts, theme, data export, sign out
      admin/               stats, settings, roles, logs, storage, audit
    api/
      history/export/      server-generated CSV + JSON, recorded before it is sent
      health/               liveness probe for uptime checks
      admin/logs/          sanitised client error reports
    login/, auth/callback/ Google OAuth entry and code exchange
  components/
    ui/                    the design system primitives (button, card, dialog, …)
    add-expense/           the under-ten-seconds flow
    friends/ groups/ notifications/ history/ profile/ admin/
    money.tsx              every amount, with an arrow and a label — never colour alone
    providers/             realtime channel, theme, connection banner
  lib/
    money.ts               INR formatting and integer-paise conversion
    split.ts               equal splits with an exact remainder rule
    settlement.ts          the settled-up engine (pure, unit tested)
    validation.ts          zod schemas for every server action input
    actions/               all mutations, all returning ActionResult
    queries/               server-side reads (dashboard, social, history)
    supabase/              browser + server clients, middleware session refresh
    constants.ts types.ts utils.ts logger.ts
supabase/
  migrations/              the schema, RLS, functions, retention — no dashboard click-ops
  tests/                   bootstrap + 176 assertions across two suites
  functions/archive-records/  optional scheduled caller for the retention job
tests/                     vitest suites + the fake Supabase harness
scripts/                   mock-supabase.mjs, smoke.mjs
public/                    manifest, service worker, offline page, icons
```

---

Built for students who split a ₹200 printout four ways and then forget who paid.

Nothing in OweMe moves money. It just makes sure everybody remembers the same thing.
