-- Any signed-in moderator can make another active member a moderator, or
-- remove that role from another member. Nobody can change his own moderator
-- status here, so the last moderator can't accidentally lock everyone out.

create or replace function public.set_member_moderator(member_id uuid, make boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if not public.is_moderator() then
        raise exception 'Only moderators can change who is a moderator' using errcode = '42501';
    end if;
    if member_id = public.current_member_id() then
        raise exception 'You can''t change your own moderator status' using errcode = '42501';
    end if;
    update public.members
    set is_moderator = make
    where id = member_id and active;
    if not found then
        raise exception 'No active member with that id' using errcode = 'P0002';
    end if;
end;
$$;

-- Which members are moderators (members see a "Moderator" tag in the directory).
create or replace function public.member_moderators()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
    select m.id from public.members m
    where m.active and m.is_moderator and public.is_member()
$$;

revoke execute on function public.set_member_moderator(uuid, boolean), public.member_moderators()
    from public, anon;
grant execute on function public.set_member_moderator(uuid, boolean), public.member_moderators()
    to authenticated;
