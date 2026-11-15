-- Performance advisor: index the comment foreign keys.
create index glossary_comments_member_idx on public.glossary_comments (member_id);
create index glossary_comments_hidden_by_idx on public.glossary_comments (hidden_by);
