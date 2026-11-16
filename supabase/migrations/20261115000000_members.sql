-- Manifest Mens Group: members-only sign-in, member directory, glossary comments.
-- Schema only. The member list itself is imported in the Supabase dashboard and
-- never stored in this (public) repository.
--
-- Identity: members are keyed on phone number. Supabase phone sign-in puts the
-- verified phone in the session token (claim "phone", digits only, e.g.
-- 14155551234), so every check below compares that claim to members.phone.

------------------------------------------------------------------------------
-- Members (the allow-list and the directory)
------------------------------------------------------------------------------
create table public.members (
    id            uuid primary key default gen_random_uuid(),
    phone         text not null unique
                  check (phone ~ '^[1-9][0-9]{10,14}$'),  -- country code + number, digits only
    first_name    text not null check (char_length(first_name) between 1 and 80),
    last_name     text not null check (char_length(last_name) between 1 and 80),
    email         text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    area          text,          -- e.g. San Rafael, San Francisco, Oakland, Redwood City
    team          text,
    active        boolean not null default true,   -- uncheck when a man completes
    is_moderator  boolean not null default false,  -- can hide comments
    show_phone    boolean not null default true,   -- member's own directory choices
    show_email    boolean not null default true,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

comment on table public.members is
    'Manifest member list. Phone is the sign-in key (digits only, with country code, e.g. 14155551234).';

-- Normalize phones on the way in, so "(415) 555-1234" or "+1 415 555 1234" both work.
create or replace function public.normalize_member_phone()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
    digits text := regexp_replace(coalesce(new.phone, ''), '\D', '', 'g');
begin
    if char_length(digits) = 10 then
        digits := '1' || digits;  -- US number without country code
    end if;
    new.phone := digits;
    new.email := nullif(lower(trim(new.email)), '');
    new.updated_at := now();
    return new;
end;
$$;

create trigger members_normalize
before insert or update on public.members
for each row execute function public.normalize_member_phone();

------------------------------------------------------------------------------
-- Who is signed in?
------------------------------------------------------------------------------
create or replace function public.current_member_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
    select m.id
    from public.members m
    where m.active
      and m.phone = regexp_replace(coalesce(auth.jwt() ->> 'phone', ''), '\D', '', 'g')
      and m.phone <> ''
$$;

create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select public.current_member_id() is not null
$$;

create or replace function public.is_moderator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce((
        select m.is_moderator from public.members m
        where m.id = public.current_member_id()
    ), false)
$$;

------------------------------------------------------------------------------
-- Sign-up gate: only phones on the active member list can create an account.
-- (Enabled in Dashboard > Authentication > Hooks > "Before User Created".)
-- Access is also re-checked on every request via is_member(), so deactivating
-- a member cuts access even after he has signed up.
------------------------------------------------------------------------------
create or replace function public.hook_members_only_signup(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    p text := regexp_replace(coalesce(event -> 'user' ->> 'phone', ''), '\D', '', 'g');
begin
    if p <> '' and exists (
        select 1 from public.members m where m.phone = p and m.active
    ) then
        return '{}'::jsonb;
    end if;

    return jsonb_build_object(
        'error', jsonb_build_object(
            'message', 'This phone number is not on the Manifest member list.',
            'http_code', 403
        )
    );
end;
$$;

grant execute on function public.hook_members_only_signup(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_members_only_signup(jsonb) from authenticated, anon, public;

------------------------------------------------------------------------------
-- Members table access
------------------------------------------------------------------------------
alter table public.members enable row level security;

-- New tables are not exposed automatically: grant only what the site needs.
revoke all on public.members from anon, authenticated;
grant select on public.members to authenticated;

-- A member can read his own full row.
create policy "members read own row"
on public.members for select to authenticated
using (id = (select public.current_member_id()));

-- Moderators can read every row.
create policy "moderators read all members"
on public.members for select to authenticated
using ((select public.is_moderator()));

-- A member can change only his own directory privacy choices.
revoke update on public.members from authenticated, anon;
grant update (show_phone, show_email) on public.members to authenticated;
create policy "members update own privacy"
on public.members for update to authenticated
using (id = (select public.current_member_id()))
with check (id = (select public.current_member_id()));

-- Adding/removing members happens in the dashboard (service role), not the site.
revoke insert, delete on public.members from authenticated, anon;

-- Directory for signed-in members: hides contact details a member chose to hide.
create or replace function public.member_directory()
returns table (
    id uuid, first_name text, last_name text, area text, team text,
    phone text, email text, is_me boolean
)
language sql
stable
security definer
set search_path = ''
as $$
    select m.id, m.first_name, m.last_name, m.area, m.team,
           case when m.show_phone or m.id = public.current_member_id() then m.phone end,
           case when m.show_email or m.id = public.current_member_id() then m.email end,
           m.id = public.current_member_id()
    from public.members m
    where m.active and public.is_member()
    order by lower(m.first_name), lower(m.last_name)
$$;

------------------------------------------------------------------------------
-- Glossary comments
------------------------------------------------------------------------------
create table public.glossary_comments (
    id          bigint generated always as identity primary key,
    term_id     text not null check (term_id ~ '^term-[a-z0-9-]{1,120}$'),
    member_id   uuid not null default public.current_member_id()
                references public.members (id) on delete cascade,
    body        text not null check (char_length(trim(body)) between 1 and 2000),
    hidden      boolean not null default false,
    hidden_by   uuid references public.members (id) on delete set null,
    hidden_at   timestamptz,
    created_at  timestamptz not null default now(),
    edited_at   timestamptz
);

create index glossary_comments_term_idx on public.glossary_comments (term_id, created_at);

alter table public.glossary_comments enable row level security;

revoke all on public.glossary_comments from anon, authenticated;
grant select on public.glossary_comments to authenticated;

-- Read: members see visible comments; authors and moderators also see hidden ones.
create policy "members read comments"
on public.glossary_comments for select to authenticated
using (
    (select public.is_member())
    and (not hidden
         or member_id = (select public.current_member_id())
         or (select public.is_moderator()))
);

-- Post: members post as themselves; comments show immediately.
revoke insert, update, delete on public.glossary_comments from authenticated, anon;
grant insert (term_id, body) on public.glossary_comments to authenticated;
create policy "members post own comments"
on public.glossary_comments for insert to authenticated
with check (
    (select public.is_member())
    and member_id = (select public.current_member_id())
    and not hidden
);

-- Edit: authors may edit their own comment text.
grant update (body, edited_at) on public.glossary_comments to authenticated;
create policy "authors edit own comments"
on public.glossary_comments for update to authenticated
using (member_id = (select public.current_member_id()))
with check (member_id = (select public.current_member_id()));

-- Delete: authors delete their own; moderators delete any.
grant delete on public.glossary_comments to authenticated;
create policy "authors or moderators delete comments"
on public.glossary_comments for delete to authenticated
using (
    member_id = (select public.current_member_id())
    or (select public.is_moderator())
);

-- Comments with author names, for the glossary page (one call per page load).
create or replace function public.glossary_comment_feed()
returns table (
    id bigint, term_id text, body text, created_at timestamptz, edited_at timestamptz,
    hidden boolean, author text, is_mine boolean
)
language sql
stable
security definer
set search_path = ''
as $$
    select c.id, c.term_id, c.body, c.created_at, c.edited_at, c.hidden,
           m.first_name || ' ' || left(m.last_name, 1) || '.',
           c.member_id = public.current_member_id()
    from public.glossary_comments c
    join public.members m on m.id = c.member_id
    where public.is_member()
      and (not c.hidden
           or c.member_id = public.current_member_id()
           or public.is_moderator())
    order by c.created_at
$$;

-- Moderators hide or unhide a comment.
create or replace function public.set_comment_hidden(comment_id bigint, hide boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if not public.is_moderator() then
        raise exception 'Only moderators can hide comments' using errcode = '42501';
    end if;
    update public.glossary_comments
    set hidden = hide,
        hidden_by = case when hide then public.current_member_id() end,
        hidden_at = case when hide then now() end
    where id = comment_id;
end;
$$;

------------------------------------------------------------------------------
-- Keep-alive for the free plan (a weekly GitHub job calls this).
------------------------------------------------------------------------------
create or replace function public.ping()
returns text
language sql
stable
set search_path = ''
as $$ select 'ok'::text $$;

-- Function access: signed-in users only, except ping.
revoke execute on function public.member_directory(), public.glossary_comment_feed(),
    public.set_comment_hidden(bigint, boolean), public.current_member_id(),
    public.is_member(), public.is_moderator() from anon, public;
grant execute on function public.member_directory(), public.glossary_comment_feed(),
    public.set_comment_hidden(bigint, boolean), public.current_member_id(),
    public.is_member(), public.is_moderator() to authenticated;
grant execute on function public.ping() to anon, authenticated;
