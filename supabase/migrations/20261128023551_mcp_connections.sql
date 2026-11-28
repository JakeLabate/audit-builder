-- Migration 20261128023551: mcp_connections (applied 2026-11-28)
-- An MCP client signs in as a person, through Supabase's OAuth server. The
-- token says who and which client, not which workspace, so the consent page
-- records the workspace here and the API worker reads it back.
create table public.mcp_connections (
  user_id      uuid        not null references auth.users(id) on delete cascade,
  client_id    text        not null,
  org_id       uuid        not null references public.orgs(id) on delete cascade,
  client_name  text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  primary key (user_id, client_id)
);

alter table public.mcp_connections enable row level security;

create policy mcp_connections_select on public.mcp_connections
  for select to authenticated using (user_id = auth.uid());

create policy mcp_connections_insert on public.mcp_connections
  for insert to authenticated
  with check (user_id = auth.uid() and private.is_member(org_id));

create policy mcp_connections_update on public.mcp_connections
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and private.is_member(org_id));

create policy mcp_connections_delete on public.mcp_connections
  for delete to authenticated using (user_id = auth.uid());

grant select, insert, update, delete on public.mcp_connections to authenticated;
revoke all on public.mcp_connections from anon;
