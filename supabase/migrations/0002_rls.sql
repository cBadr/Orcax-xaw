-- Row-level security: every row is scoped to its owner (auth.uid()).

alter table email_accounts enable row level security;
alter table contacts enable row level security;
alter table contact_emails enable row level security;
alter table contact_interactions enable row level security;
alter table oauth_states enable row level security;

create policy "own rows — email_accounts"
  on email_accounts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own rows — contacts"
  on contacts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own rows — contact_emails"
  on contact_emails for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own rows — contact_interactions"
  on contact_interactions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own rows — oauth_states"
  on oauth_states for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
