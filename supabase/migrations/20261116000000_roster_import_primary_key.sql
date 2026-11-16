-- Give the staging table a primary key so rows can be deleted in the Table Editor.
alter table public.roster_import add column id bigint generated always as identity primary key;
