-- Glossary comments become readable by everyone; posting stays members-only.
--
-- Visitors read through this one function, which returns only visible (not
-- hidden) comments and the author's first name and last initial. The comments
-- table itself stays closed to anonymous visitors, so they can't see hidden
-- comments, member ids, or anything else about members.
create or replace function public.glossary_public_comments()
returns table (
    id bigint, term_id text, body text, created_at timestamptz, edited_at timestamptz,
    author text
)
language sql
stable
security definer
set search_path = ''
as $$
    select c.id, c.term_id, c.body, c.created_at, c.edited_at,
           m.first_name || ' ' || left(m.last_name, 1) || '.'
    from public.glossary_comments c
    join public.members m on m.id = c.member_id
    where not c.hidden
    order by c.created_at
$$;

revoke execute on function public.glossary_public_comments() from public;
grant execute on function public.glossary_public_comments() to anon, authenticated;
