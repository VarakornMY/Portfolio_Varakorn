-- Accounts era schema, on Supabase Postgres (Singapore).
-- Identity lives in Supabase Auth (auth.users, uuid). Everything here hangs
-- off profiles, which mirrors auth.users 1:1 and is filled in lazily by the
-- API on a user's first write.
--
-- Row level security is ON for every table with NO policies, on purpose:
-- the publishable key can reach PostgREST, and this slams that door shut.
-- All reads and writes go through the Vercel functions, which connect as the
-- table owner over the pooler and are not subject to RLS.
--
-- Applied by scripts/comments-db.mjs setup and self-healed by api/_lib/store.js.

create table if not exists profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  name       text        not null,
  picture    text,
  created_at timestamptz not null default now()
);
alter table profiles enable row level security;

-- user_id is null for a guest: somebody who wrote without an account. Their
-- name and their relation to Varakorn ride on the row itself, because there is
-- no profile to join to. One of the two has to be there (comments_author_ck).
create table if not exists comments (
  id             bigint generated always as identity primary key,
  page           text        not null,
  user_id        uuid        references profiles(id) on delete cascade,
  guest_name     text,
  guest_relation text,
  parent_id      bigint      references comments(id) on delete cascade,
  body           text        not null,
  approved       boolean     not null default true,  -- on when written; off takes it down
  ip_hash        text,
  created_at     timestamptz not null default now()
);
alter table comments enable row level security;

create index if not exists comments_page_idx
  on comments (page, approved, created_at desc);

create index if not exists comments_user_recent_idx
  on comments (user_id, created_at desc);


create table if not exists likes (
  comment_id bigint      not null references comments(id) on delete cascade,
  user_id    uuid        not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
alter table likes enable row level security;

-- One vouch per person per experience page, published like comments.
-- Same story as comments: user_id null means a guest, and guest_name carries
-- who they are. `relation` was always required, so a guest fills the same box
-- everybody else does. The unique pair only bites signed in people: Postgres
-- treats every null user_id as distinct, so guests are not held to one each.
create table if not exists testimonials (
  id         bigint generated always as identity primary key,
  user_id    uuid        references profiles(id) on delete cascade,
  guest_name text,
  page       text        not null,
  relation   text        not null,
  body       text        not null,
  approved   boolean     not null default true,  -- on when written; off takes it down
  ip_hash    text,
  created_at timestamptz not null default now(),
  unique (user_id, page)
);
alter table testimonials enable row level security;

create index if not exists testimonials_page_idx
  on testimonials (page, approved, created_at desc);

-- 1 Sep 2026: approval before publishing was dropped. Existing installs get
-- the new default, and anything that was still waiting goes up.
alter table comments     alter column approved set default true;
alter table testimonials alter column approved set default true;

-- 7 Sep 2026: signing in became optional. Existing installs loosen the author
-- column and gain the guest fields; every row already there keeps its user_id.
alter table comments     alter column user_id drop not null;
alter table testimonials alter column user_id drop not null;
alter table comments     add column if not exists guest_name text;
alter table comments     add column if not exists guest_relation text;
alter table testimonials add column if not exists guest_name text;
alter table testimonials add column if not exists ip_hash text;

-- The hourly write cap counts a guest by hashed ip, the way it counts an
-- account by user id. These live down here, after the columns they index:
-- on an existing install ip_hash only arrives a few statements above.
create index if not exists comments_ip_recent_idx
  on comments (ip_hash, created_at desc);
create index if not exists testimonials_ip_recent_idx
  on testimonials (ip_hash, created_at desc);

-- an author of some kind is not optional, whichever kind it is
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'comments_author_ck') then
    alter table comments add constraint comments_author_ck
      check (user_id is not null or guest_name is not null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'testimonials_author_ck') then
    alter table testimonials add constraint testimonials_author_ck
      check (user_id is not null or guest_name is not null);
  end if;
end $$;

-- Hanko passport: one stamp per chapter read.
create table if not exists stamps (
  user_id    uuid        not null references profiles(id) on delete cascade,
  stamp      text        not null,
  created_at timestamptz not null default now(),
  primary key (user_id, stamp)
);
alter table stamps enable row level security;

-- Blog notes finished, for the reading ring.
create table if not exists reading (
  user_id    uuid        not null references profiles(id) on delete cascade,
  slug       text        not null,
  created_at timestamptz not null default now(),
  primary key (user_id, slug)
);
alter table reading enable row level security;

-- Desk terminal history for signed in visitors.
create table if not exists chats (
  id         bigint generated always as identity primary key,
  user_id    uuid        not null references profiles(id) on delete cascade,
  role       text        not null check (role in ('user', 'model')),
  body       text        not null,
  created_at timestamptz not null default now()
);
alter table chats enable row level security;

create index if not exists chats_user_idx
  on chats (user_id, created_at);
