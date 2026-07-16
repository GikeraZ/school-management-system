# School Management System

A role-based School Management System for **Teachers**, **Head Teachers**, and **Parents**
(parents receive SMS only — they never log in). It manages exam results, performance
analytics, fee tracking, and automated parent communication via **Twilio SMS**.

Built as a [Lovable](https://lovable.dev)-compatible app: a **Vite + React + TypeScript**
front-end backed by **Supabase** (Postgres + Auth + Row Level Security) and **Supabase Edge
Functions** (Deno) for Twilio SMS and the weekly fee-reminder cron.

---

## Features

| Area | What it does |
|------|--------------|
| **Auth & roles** | Email/password login for Teachers & Head Teachers. Role-driven dashboards. Roles live in a separate `user_roles` table. |
| **Academic structure** | Grades (e.g. Grade 1–8) → Streams (East/West) → Subjects. Students carry name, admission number, grade, stream, parent name & parent phone (E.164). |
| **Results entry** | Teacher picks Grade → Stream → Subject → Exam, enters marks per student, saves as draft. Head Teacher publishes. |
| **Analysis** | Per-stream/subject ranking, class average, highest/lowest. **Most Improved** report (exam vs previous exam, mark delta + rank change). **Overall merit list** aggregated across subjects with positions. |
| **Merit reports** | Printable/PDF report cards per student and merit lists per stream (subject scores, total, average, grade, position, remarks). |
| **SMS to parents** | Individual result SMS, bulk stream results, and manual announcements to selected parents/streams. Full `sms_logs` history. |
| **Fees** | Fee structures per grade/term, payments per student, balances dashboard (paid vs outstanding), filter by grade/stream, CSV export. |
| **Weekly reminders** | Automated SMS every 7 days to parents with an outstanding balance. Head Teacher can pause/resume, change frequency, preview the next send, or trigger it immediately. |

---

## Project layout

```
school-management-system/
├── index.html
├── src/
│   ├── main.tsx                 # entry: QueryClient + Router + Auth + Toast
│   ├── App.tsx                  # routes + role guards
│   ├── index.css                # Tailwind + print styles
│   ├── lib/
│   │   ├── supabase.ts          # client + edge base url
│   │   ├── api.ts               # callEdge() helper (auth header)
│   │   ├── types.ts             # shared types
│   │   ├── utils.ts             # cn, formatters, E.164 validator, CSV
│   │   └── hooks.ts             # React Query data hooks
│   ├── context/AuthContext.tsx  # session + role state
│   ├── components/
│   │   ├── ui.tsx               # Button, Card, Badge, Input, Select, Stat…
│   │   ├── Modal.tsx
│   │   ├── EmptyState.tsx
│   │   ├── Toast.tsx
│   │   └── layout/AppLayout.tsx # sidebar + topbar
│   └── pages/                   # Login, Dashboard, Students, ResultsEntry,
│                                 # Analysis, MeritReports, SMS, Fees,
│                                 # FeeReminders, Grades, Streams, Subjects, Teachers
└── supabase/
    ├── migrations/
    │   ├── 0001_init.sql        # schema, enums, triggers
    │   ├── 0002_rls.sql         # role helpers + RLS policies
    │   ├── 0003_analytics.sql   # vw_fee_balances / vw_fee_outstanding
    │   └── 0004_cron.sql        # pg_cron schedule for weekly reminders
    └── functions/
        ├── _shared/             # cors, auth, twilio helpers
        ├── send-sms/            # single SMS
        ├── send-bulk-sms/       # stream results + announcements
        └── weekly-fee-reminder/ # cron target
```

---

## Setup

### Option A — One command (recommended)

Make sure the **Supabase CLI** is installed (`winget install Supabase.CLI`) and, for the
local stack, that **Docker Desktop is running** (click *Accept* on its first-run screen).

**Local stack (no account needed):**

```bash
npm run setup:local
```

This runs `supabase init` → `supabase start` → applies all migrations + `supabase/seed.sql`
(demo Head Teacher + sample grades/streams/subjects/students/fees) → deploys the three edge
functions → writes `.env`. When it finishes:

```bash
npm run dev
# Login:  head@school.ac.ke   /   School@123
```

**Existing cloud project:**

```bash
npm run setup:cloud -- -ProjectRef <your-ref> -DbPassword <db-password>
```

> Set `TWILIO_*` environment variables before running setup to auto-configure SMS, or add
> them later in the Supabase dashboard (Settings → Edge Functions → Secrets).

### Option B — Manual steps

### 1. Front-end environment

```bash
cp .env.example .env
# Fill in your Supabase project URL and anon key
npm install
npm run dev
```

> `.env` is git-ignored. The anon key is safe to expose in the browser; **Twilio
> secrets are never shipped to the client** — they live only as Supabase function secrets.

### 2. Database & auth (Supabase)

1. Create a Supabase project.
2. Run the migrations in order (SQL editor or `supabase db push`):
   `supabase/migrations/0001_init.sql`, `0002_rls.sql`, `0003_analytics.sql`, `0004_cron.sql`.
3. Enable the **Auth** provider (Email/Password).
4. The first user to sign up gets a `teacher` role automatically (via the
   `on_auth_user_created` trigger). A Head Teacher can promote staff from **Teachers →
   user_roles** (or run `update user_roles set role='head_teacher' where …`).

### 3. Twilio secrets (edge functions only)

```bash
supabase secrets set TWILIO_ACCOUNT_SID=AC...
supabase secrets set TWILIO_AUTH_TOKEN=...
supabase secrets set TWILIO_PHONE_NUMBER=+14155552671
supabase secrets set SMS_SENDER_NAME="Greenfield Academy"
```

### 4. Deploy edge functions

```bash
supabase functions deploy send-sms
supabase functions deploy send-bulk-sms
supabase functions deploy weekly-fee-reminder
```

### 5. Configure the cron target (one-time)

The cron job reads the edge base URL and service-role key from DB settings:

```sql
alter database postgres
  set app.settings.edge_base_url = 'https://<your-project-ref>.supabase.co';
alter database postgres
  set app.settings.service_role_key = '<your-service-role-key>';
```

To disable the schedule later: `select cron.unschedule('weekly-fee-reminder');`

---

## Security model

- **RLS** protects every table. `is_staff()` / `is_head_teacher()` helper functions read
  `user_roles` (SECURITY DEFINER) so policies are reliable.
- Teachers can read academic data and create/edit **draft** results
  (`published = false`). Only Head Teachers may flip a result to `published` (enforced by a
  `WITH CHECK` policy on `results` updates).
- Management tables (grades, streams, subjects, students, teachers, fees) are writable only
  by Head Teachers.
- Parent phone numbers are stored in the DB and used server-side by edge functions — they are
  never imported into the client bundle.
- Edge functions re-validate the caller's role from `user_roles` and reject non-Head-Teacher
  requests. The cron function runs with the service role and performs its own authorization.

---

## Scripts

```bash
npm run dev        # local dev server
npm run build      # type-check + production build
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
```
