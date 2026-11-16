-- Members can mark themselves as their team's lead; the directory shows it.
alter table public.members
    add column is_team_lead boolean not null default false;

grant update (is_team_lead) on public.members to authenticated;

-- Directory including the team-lead flag. (Same rules as member_directory();
-- a new name because a function's columns can't be changed in place.)
create or replace function public.member_roster()
returns table (
    id uuid, first_name text, last_name text, area text, team text,
    phone text, email text, is_team_lead boolean, is_me boolean
)
language sql
stable
security definer
set search_path = ''
as $$
    select m.id, m.first_name, m.last_name, m.area, m.team,
           case when m.show_phone or m.id = public.current_member_id() then m.phone end,
           case when m.show_email or m.id = public.current_member_id() then m.email end,
           m.is_team_lead,
           m.id = public.current_member_id()
    from public.members m
    where m.active and public.is_member()
    order by lower(m.first_name), lower(m.last_name)
$$;

revoke execute on function public.member_roster() from public, anon;
grant execute on function public.member_roster() to authenticated;
