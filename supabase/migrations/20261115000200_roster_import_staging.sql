-- Holding table for importing the roster CSV as-is (headers: Name, Email, Phone Number, Team).
-- Not reachable from the website: RLS on, no grants to anon/authenticated.
create table public.roster_import (
    "Name"          text,
    "Email"         text,
    "Phone Number"  text,
    "Team"          text
);
alter table public.roster_import enable row level security;
revoke all on public.roster_import from anon, authenticated;
comment on table public.roster_import is
    'Temporary: roster CSV lands here, then is copied into members. Empty it after import.';
