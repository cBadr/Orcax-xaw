-- Orcax — initial schema
-- Run in Supabase SQL Editor (or via `supabase db push`).

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- =====================================================================
-- EMAIL ACCOUNTS
-- =====================================================================
create type auth_kind as enum ('oauth_google', 'oauth_microsoft', 'imap_password');

create table if not exists email_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email citext not null,
  display_name text,
  auth_kind auth_kind not null,

  -- IMAP/SMTP (manual)
  imap_host text,
  imap_port int,
  imap_secure boolean default true,
  smtp_host text,
  smtp_port int,
  smtp_secure boolean default true,
  -- encrypted password blob (AES-256-GCM); format: iv:tag:ciphertext (hex)
  password_enc text,

  -- OAuth tokens (encrypted)
  access_token_enc text,
  refresh_token_enc text,
  token_expires_at timestamptz,
  oauth_scope text,

  -- Sync state
  initial_import_done boolean not null default false,
  last_sync_at timestamptz,
  sync_error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (user_id, email)
);

create index if not exists idx_email_accounts_user on email_accounts(user_id);

-- =====================================================================
-- CONTACTS
-- =====================================================================
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text,
  primary_email citext,
  company text,
  phone text,
  notes text,
  tags text[] not null default '{}',
  first_seen_at timestamptz not null default now(),
  last_interaction_at timestamptz,
  interaction_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_contacts_user on contacts(user_id);
create index if not exists idx_contacts_last_interaction on contacts(user_id, last_interaction_at desc nulls last);
create index if not exists idx_contacts_tags on contacts using gin(tags);

-- Each address (a contact may have many)
create table if not exists contact_emails (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email citext not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, email)
);

create index if not exists idx_contact_emails_contact on contact_emails(contact_id);

-- Interaction log (one row per appearance in From/To/Cc/Bcc)
create type msg_direction as enum ('incoming', 'outgoing');

create table if not exists contact_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  account_id uuid not null references email_accounts(id) on delete cascade,
  message_uid text,
  folder text,
  subject text,
  direction msg_direction not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_interactions_contact on contact_interactions(contact_id, occurred_at desc);
create index if not exists idx_interactions_user on contact_interactions(user_id, occurred_at desc);

-- =====================================================================
-- OAuth state (CSRF tokens for OAuth starts)
-- =====================================================================
create table if not exists oauth_states (
  state text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- updated_at triggers
-- =====================================================================
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_email_accounts_updated on email_accounts;
create trigger trg_email_accounts_updated before update on email_accounts
  for each row execute function set_updated_at();

drop trigger if exists trg_contacts_updated on contacts;
create trigger trg_contacts_updated before update on contacts
  for each row execute function set_updated_at();
