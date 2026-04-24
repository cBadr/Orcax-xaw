# Orcax

Unified email management platform — Gmail, Outlook, and IMAP/SMTP in one place.

**Stack:** Next.js 15 · Supabase · Vercel · TypeScript · Tailwind

---

## Phase 1 scope

- Single-user Login (Supabase Auth, password)
- Add email account:
  - Gmail via OAuth
  - Outlook via OAuth
  - Generic IMAP/SMTP with auto-detect + test connection
- Contacts:
  - Full import from all folders on first connect
  - Incremental sync afterwards (Vercel Cron every 15 min)
  - Name update on conflict (latest wins)
  - Manual tags/notes/merge
  - Per-contact timeline

---

## Local setup

```bash
cd orcax
npm install
cp .env.local.example .env.local
# fill in .env.local (see below)
npm run dev
```

Open <http://localhost:3000>.

---

## 1. Supabase

1. Create a new project at <https://supabase.com>.
2. Open **SQL Editor** and run, in order:
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_rls.sql`
3. Copy from **Project Settings → API**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (keep secret — used only server-side)
4. Create your user in **Authentication → Users → Add user** (email + password). This is the only login account.

---

## 2. Encryption key

Generate a 32-byte key (hex):

```bash
openssl rand -hex 32
```

Set as `ENCRYPTION_KEY` in `.env.local`. **Do not rotate or lose** — all stored IMAP passwords and OAuth tokens will be unreadable.

---

## 3. Google OAuth (Gmail)

1. <https://console.cloud.google.com> → create project "Orcax".
2. **APIs & Services → Library** → enable **Gmail API**.
3. **OAuth consent screen** → External (or Internal for Workspace). Add scopes: `gmail.readonly`, `gmail.send`, `gmail.modify`, `userinfo.email`.
4. **Credentials → Create OAuth Client ID** → Web application.
   - Authorized redirect URIs:
     - `http://localhost:3000/api/auth/gmail/callback`
     - `https://YOUR-DOMAIN/api/auth/gmail/callback`
5. Copy Client ID / Secret → `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.

---

## 4. Microsoft OAuth (Outlook)

1. <https://portal.azure.com> → **Azure Active Directory → App registrations → New registration**.
2. Name: Orcax · Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**.
3. Redirect URI (Web):
   - `http://localhost:3000/api/auth/outlook/callback`
   - `https://YOUR-DOMAIN/api/auth/outlook/callback`
4. **Certificates & secrets → New client secret** → copy value.
5. **API permissions → Add (Microsoft Graph, Delegated)**: `Mail.ReadWrite`, `Mail.Send`, `Contacts.Read`, `offline_access`, `openid`, `profile`, `email`.
6. Copy Application (client) ID / secret → `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`. Leave `MICROSOFT_TENANT=common`.

---

## 5. Deploy to Vercel

```bash
git init && git add . && git commit -m "Initial commit"
# create github repo "orcax" and push
```

Then:
1. <https://vercel.com/new> → import the repo.
2. Add every variable from `.env.local` to the Vercel project (Settings → Environment Variables).
3. Set `NEXT_PUBLIC_APP_URL` to your production URL.
4. Generate `CRON_SECRET` (any long random string) → set in Vercel env.
5. Update Google & Azure redirect URIs with the production URL.
6. Redeploy.

The cron in `vercel.json` runs `/api/cron/sync-contacts` every 15 min to incrementally import new contacts.

---

## File structure

```
orcax/
├── src/
│   ├── app/
│   │   ├── login/                    # Login page
│   │   ├── (dashboard)/
│   │   │   ├── accounts/             # List + add email accounts
│   │   │   └── contacts/             # Contacts list + detail
│   │   └── api/
│   │       ├── accounts/             # autoconfig, test-imap, create
│   │       ├── auth/gmail|outlook/   # OAuth start + callback
│   │       ├── contacts/             # import, merge
│   │       └── cron/sync-contacts    # Vercel cron
│   ├── lib/
│   │   ├── supabase/                 # browser + server clients
│   │   ├── crypto.ts                 # AES-256-GCM
│   │   ├── imap/                     # autoconfig + test
│   │   ├── oauth/                    # gmail + outlook
│   │   └── contacts/                 # extract, upsert, import
│   ├── components/                   # React components
│   └── middleware.ts                 # auth gate
└── supabase/migrations/              # SQL schema
```

---

## Next phases (not implemented yet)

- Unified Inbox
- AI classification / summaries / suggested replies (Claude)
- Full-text + semantic search (pgvector)
- Follow-up tracker
- Send mail
- CSV / vCard import for contacts
- 2FA
