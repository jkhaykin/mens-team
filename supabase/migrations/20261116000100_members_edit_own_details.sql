-- Members can edit their own details on the member page.
--
-- Name, email, team and area: a plain update of his own row (the existing
-- "members update own privacy" policy already limits updates to his own row;
-- this only widens which columns he may change). Active and moderator status
-- stay admin-only.
grant update (first_name, last_name, email, area, team) on public.members to authenticated;

-- Phone: never updated directly. The member confirms the new number with a
-- texted code (Supabase Auth "phone change"); when Auth saves the verified
-- number, the trigger below moves his member row to it, so his next session
-- token (which carries the new number) still matches.

-- Before texting a code, the page checks that the new number isn't already
-- another member's (which would otherwise fail only after the code is entered).
create or replace function public.phone_available_for_me(new_phone text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    with p as (
        select case
            when char_length(d) = 10 then '1' || d else d
        end as digits
        from (select regexp_replace(coalesce(new_phone, ''), '\D', '', 'g') as d) x
    )
    select public.is_member()
       and (select digits from p) ~ '^[1-9][0-9]{10,14}$'
       and not exists (
           select 1 from public.members m, p
           where m.phone = p.digits
             and m.id <> public.current_member_id()
       )
$$;

revoke execute on function public.phone_available_for_me(text) from public, anon;
grant execute on function public.phone_available_for_me(text) to authenticated;

-- Keep members.phone in step with the verified sign-in number.
create or replace function public.sync_member_phone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    old_digits text := regexp_replace(coalesce(old.phone, ''), '\D', '', 'g');
    new_digits text := regexp_replace(coalesce(new.phone, ''), '\D', '', 'g');
begin
    if old_digits = '' or new_digits = '' or old_digits = new_digits then
        return new;
    end if;
    if exists (select 1 from public.members where phone = new_digits) then
        raise exception 'That number already belongs to another Manifest member.';
    end if;
    update public.members set phone = new_digits where phone = old_digits;
    return new;
end;
$$;

revoke execute on function public.sync_member_phone() from public, anon, authenticated;

create trigger on_auth_phone_change_sync_member
after update of phone on auth.users
for each row execute function public.sync_member_phone();
