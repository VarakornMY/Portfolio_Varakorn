// ---------------------------------------------------------------------------
// The store: profiles, comments with one reply level,
// likes, testimonials, hanko passport stamps, blog reading marks, and desk
// terminal chat history. Talks to Supabase Postgres (Singapore) through the
// transaction pooler; identity comes from api/_lib/supauth.js as a uuid.
// Used by the Vercel functions, the Vite dev middleware, and the moderation
// CLI (scripts/comments-db.mjs).
// ---------------------------------------------------------------------------
import { createHash } from 'node:crypto';
import { db } from './db.js';
import { experience, posts } from '../../src/js/data.js';

const BODY_MAX = 2000;
const RELATION_MAX = 80;
const NAME_MAX = 60;
const RATE_WINDOW = '1 hour';
const RATE_MAX = 5; // comments + vouches per account per window
const RATE_MAX_GUEST = 3; // and per guest, counted by hashed ip
const MIN_DWELL_MS = 3000; // nobody writes a real thought faster than this
const CHAT_KEEP = 60; // stored turns per user

/* Only pages that actually mount the guestbook. The shape is checked first
   because it is cheap, then membership below, against the real list. */
const PAGE_RE = /^\/(experience\/[a-z0-9-]{1,64}|blog#[a-z0-9-]{1,64})$/;

/* The passport: one stamp per experience chapter. Derived from data.js so a
   new chapter automatically becomes a collectable. */
const STAMPS = new Set(experience.filter((x) => x.page).map((x) => x.page));
const SLUGS = new Set(posts.map((p) => p.slug));
const EXP_PAGE_RE = /^\/experience\/[a-z0-9-]{1,64}$/;

/* Every place that can actually hold words, taken from data.js: the six
   experience chapters and the blog notes. Matching the shape was enough while
   writing needed an account and a nonsense slug only wasted the writer's own
   time. Now that anybody can write, a slug that no page reads back would be a
   quiet place to pile rows up, so the key has to name a real page. */
const KNOWN_PAGES = new Set([...STAMPS, ...[...SLUGS].map((slug) => '/blog#' + slug)]);

const requirePage = (page) => {
  const key = String(page || '');
  if (!PAGE_RE.test(key) || !KNOWN_PAGES.has(key)) throw err(400, 'unknown page');
  return key;
};

const requireExpPage = (page) => {
  const key = String(page || '');
  if (!EXP_PAGE_RE.test(key) || !STAMPS.has(key)) throw err(400, 'unknown page');
  return key;
};

/* strip control characters except newline and tab */
const CTRL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

const err = (status, message) => Object.assign(new Error(message), { status });

const hashIp = (ip) =>
  createHash('sha256')
    .update('vk-guestbook:' + (ip || 'unknown'))
    .digest('hex')
    .slice(0, 32);

const clean = (v, max) =>
  String(v || '').replace(/\r\n/g, '\n').replace(CTRL_RE, '').trim().slice(0, max + 1);

/* ---------- schema self-heal (mirrors db/schema.sql) ---------- */

const DDL = [
  `create table if not exists profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    name text not null, picture text,
    created_at timestamptz not null default now())`,
  `alter table profiles add column if not exists title text`,
  `alter table profiles add column if not exists bio text`,
  `alter table profiles add column if not exists links jsonb not null default '[]'::jsonb`,
  `alter table profiles enable row level security`,
  `create table if not exists comments (
    id bigint generated always as identity primary key,
    page text not null,
    user_id uuid references profiles(id) on delete cascade,
    guest_name text, guest_relation text,
    parent_id bigint references comments(id) on delete cascade,
    body text not null, approved boolean not null default true,
    ip_hash text, created_at timestamptz not null default now())`,
  `alter table comments enable row level security`,
  `create index if not exists comments_page_idx on comments (page, approved, created_at desc)`,
  `create index if not exists comments_user_recent_idx on comments (user_id, created_at desc)`,
  `create table if not exists likes (
    comment_id bigint not null references comments(id) on delete cascade,
    user_id uuid not null references profiles(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (comment_id, user_id))`,
  `alter table likes enable row level security`,
  `create table if not exists testimonials (
    id bigint generated always as identity primary key,
    user_id uuid references profiles(id) on delete cascade,
    guest_name text,
    page text not null, relation text not null, body text not null,
    approved boolean not null default true,
    ip_hash text, created_at timestamptz not null default now(),
    unique (user_id, page))`,
  `alter table testimonials enable row level security`,
  `create index if not exists testimonials_page_idx on testimonials (page, approved, created_at desc)`,
  /* 1 Sep 2026: words publish the moment they are written. `approved` stays
     as the switch that takes something down again, it just starts on. */
  `alter table comments alter column approved set default true`,
  `alter table testimonials alter column approved set default true`,
  /* 7 Sep 2026: signing in became optional. The author column loosens and the
     guest fields arrive; a name of some kind is still not optional. */
  `alter table comments alter column user_id drop not null`,
  `alter table testimonials alter column user_id drop not null`,
  `alter table comments add column if not exists guest_name text`,
  `alter table comments add column if not exists guest_relation text`,
  `alter table testimonials add column if not exists guest_name text`,
  `alter table testimonials add column if not exists ip_hash text`,
  /* the hourly cap counts a guest by hashed ip, so these wait for the columns
     above: on an existing install ip_hash arrives one statement earlier */
  `create index if not exists comments_ip_recent_idx on comments (ip_hash, created_at desc)`,
  `create index if not exists testimonials_ip_recent_idx on testimonials (ip_hash, created_at desc)`,
  `do $$ begin
     if not exists (select 1 from pg_constraint where conname = 'comments_author_ck') then
       alter table comments add constraint comments_author_ck
         check (user_id is not null or guest_name is not null);
     end if;
     if not exists (select 1 from pg_constraint where conname = 'testimonials_author_ck') then
       alter table testimonials add constraint testimonials_author_ck
         check (user_id is not null or guest_name is not null);
     end if;
   end $$`,
  `create table if not exists stamps (
    user_id uuid not null references profiles(id) on delete cascade,
    stamp text not null, created_at timestamptz not null default now(),
    primary key (user_id, stamp))`,
  `alter table stamps enable row level security`,
  `create table if not exists reading (
    user_id uuid not null references profiles(id) on delete cascade,
    slug text not null, created_at timestamptz not null default now(),
    primary key (user_id, slug))`,
  `alter table reading enable row level security`,
  `create table if not exists chats (
    id bigint generated always as identity primary key,
    user_id uuid not null references profiles(id) on delete cascade,
    role text not null check (role in ('user', 'model')),
    body text not null, created_at timestamptz not null default now())`,
  `alter table chats enable row level security`,
  `create index if not exists chats_user_idx on chats (user_id, created_at)`,
];

export async function ensureSchema(sql) {
  for (const stmt of DDL) await sql.unsafe(stmt);
}

/* 42P01 is a table that is not there, 42703 a column that is not there. Both
   mean this deploy is ahead of the database, and both are fixed by running the
   DDL above, so a release never depends on somebody remembering to migrate. */
const isMissingSchema = (e) =>
  e?.code === '42P01' ||
  e?.code === '42703' ||
  /relation "\w+" does not exist/.test(e?.message || '') ||
  /column "\w+" .*does not exist/.test(e?.message || '');

async function withSchema(sql, fn) {
  try {
    return await fn();
  } catch (e) {
    if (!isMissingSchema(e)) throw e;
    await ensureSchema(sql);
    return fn();
  }
}

function need(env) {
  const sql = db(env);
  if (!sql) throw err(503, 'database is not configured');
  return sql;
}

/* ---------- who is writing ----------
   Signing in is optional, being anonymous is not. A visitor with an account
   is their profile row. Anybody else has to say a name, and on a comment how
   they know Varakorn, so every set of words on the site has a face to it. */

/** The name a guest gave, validated. Throws rather than let a blank through. */
function guestName(guest) {
  const name = clean(guest?.name, NAME_MAX);
  if (!name || name.length > NAME_MAX)
    throw err(400, 'leave a name, in ' + NAME_MAX + ' characters or less, so Varakorn knows who wrote this');
  return name;
}

/** And how they know him. The vouch form always asked; comments ask now too. */
function guestRelation(guest) {
  const relation = clean(guest?.relation, RELATION_MAX);
  if (!relation || relation.length > RELATION_MAX)
    throw err(400, 'say how you know Varakorn, in ' + RELATION_MAX + ' characters or less');
  return relation;
}

/* Two cheap gates in front of the guest forms, since nothing waits for
   approval. The honeypot is a field no human ever sees: a bot fills it in
   because it fills everything in, and gets a cheerful ok while nothing is
   written, so it never learns to come back. The dwell check is the other
   half, because nobody reads a page and writes a real thought in three
   seconds. Both are only as strong as a client that could lie, which is the
   point: they cost a person nothing and cost a crawler the whole trip. */
function guestGate({ hp, dwell }) {
  if (String(hp || '').trim()) return false; // silently swallowed
  const ms = Number(dwell);
  if (Number.isFinite(ms) && ms >= 0 && ms < MIN_DWELL_MS)
    throw err(400, 'That was quick. Take a moment with it and send it again.');
  return true;
}

/* ---------- profiles ---------- */

/** Mirror a verified Supabase Auth user into profiles. Cheap upsert. */
export async function ensureProfile(user, env = process.env) {
  const sql = need(env);
  await withSchema(sql, () => sql`
    insert into profiles (id, name, picture, title, bio, links)
    values (${user.id}, ${user.name}, ${user.picture},
            ${user.title}, ${user.bio}, ${sql.json(user.links || [])})
    on conflict (id) do update
      set name = excluded.name, picture = excluded.picture,
          title = excluded.title, bio = excluded.bio, links = excluded.links`);
}

/* ---------- comments ---------- */

export async function listComments(page, viewerId, opts = {}, env = process.env) {
  const sql = db(env);
  if (!sql) return { offline: true };
  requirePage(page);
  const viewer = viewerId || '00000000-0000-0000-0000-000000000000';
  const admin = Boolean(opts.admin);
  // left join: a guest has no profile row, so their name and their relation
  // come off the comment itself. The relation stands in for a title, which is
  // what the profile card and the home wall already know how to show.
  const rows = await withSchema(sql, () => sql`
    select c.id, c.parent_id, c.body, c.created_at, c.approved,
      coalesce(c.user_id = ${viewer}, false) as mine,
      (c.user_id is null) as guest,
      coalesce(p.name, c.guest_name) as name,
      p.picture,
      coalesce(p.title, c.guest_relation) as title,
      p.bio, p.links,
      (select count(*)::int from likes l where l.comment_id = c.id) as likes,
      exists(select 1 from likes l where l.comment_id = c.id and l.user_id = ${viewer}) as liked
    from comments c
    left join profiles p on p.id = c.user_id
    where c.page = ${page} and (c.approved or c.user_id = ${viewer} or ${admin})
    order by c.created_at asc
    limit 500`);

  const tops = [];
  const byId = new Map();
  for (const r of rows) {
    if (!r.parent_id) {
      byId.set(String(r.id), { ...r, replies: [] });
      tops.push(byId.get(String(r.id)));
    }
  }
  for (const r of rows) {
    if (r.parent_id) byId.get(String(r.parent_id))?.replies.push(r);
  }
  tops.reverse(); // newest thread first, replies stay oldest first
  return { comments: tops };
}

/** Comments and vouches share one budget: five in an hour for an account,
    three for a guest, who is counted by hashed ip instead of by user id. It is
    there to stop a flood, not to slow anybody down. */
async function guardRate(sql, { userId, ipHash }, admin) {
  if (admin) return;
  const max = userId ? RATE_MAX : RATE_MAX_GUEST;
  const [{ n }] = userId
    ? await sql`
        select (
          (select count(*) from comments
            where user_id = ${userId} and created_at > now() - ${RATE_WINDOW}::interval) +
          (select count(*) from testimonials
            where user_id = ${userId} and created_at > now() - ${RATE_WINDOW}::interval)
        )::int as n`
    : await sql`
        select (
          (select count(*) from comments
            where ip_hash = ${ipHash} and created_at > now() - ${RATE_WINDOW}::interval) +
          (select count(*) from testimonials
            where ip_hash = ${ipHash} and created_at > now() - ${RATE_WINDOW}::interval)
        )::int as n`;
  if (n >= max)
    throw err(429, `You have left ${max} in the last hour, the limit. Come back a little later.`);
}

/** `user` is the signed in visitor, or null. A null one has to bring
    `guest` = { name, relation }, plus the honeypot and the dwell the form
    collected. Everything past that is the same for both. */
export async function createComment(
  { page, body, parent, user, guest, ip, admin, hp, dwell },
  env = process.env
) {
  const sql = db(env);
  if (!sql) return { offline: true };
  requirePage(page);

  const cleanBody = clean(body, BODY_MAX);
  if (!cleanBody || cleanBody.length > BODY_MAX)
    throw err(400, 'comment must be 1 to 2000 characters');

  // the name and the relation are read before anything is touched, so a guest
  // who left one blank is told so rather than half written into the database
  const author = user
    ? { userId: user.id, name: null, relation: null }
    : { userId: null, name: guestName(guest), relation: guestRelation(guest) };

  if (!user && !guestGate({ hp, dwell })) return { ok: true };

  if (user) await ensureProfile(user, env);
  const ipHash = hashIp(ip);
  return withSchema(sql, async () => {
    let parentId = null;
    if (parent != null) {
      const rows = await sql`
        select id from comments
        where id = ${Number(parent)} and page = ${page} and approved and parent_id is null`;
      if (!rows.length) throw err(400, 'that comment cannot be replied to');
      parentId = rows[0].id;
    }

    await guardRate(sql, { userId: author.userId, ipHash }, admin);

    await sql`
      insert into comments (page, user_id, guest_name, guest_relation, parent_id, body, ip_hash)
      values (${page}, ${author.userId}, ${author.name}, ${author.relation},
              ${parentId}, ${cleanBody}, ${ipHash})`;
    return { ok: true };
  });
}

/** Rewrite your own comment. It stays up while you edit it. */
export async function updateOwnComment({ id, body, user }, env = process.env) {
  const sql = need(env);
  const cleanBody = clean(body, BODY_MAX);
  if (!cleanBody || cleanBody.length > BODY_MAX)
    throw err(400, 'comment must be 1 to 2000 characters');
  const rows = await withSchema(sql, () => sql`
    update comments set body = ${cleanBody}
    where id = ${Number(id)} and user_id = ${user.id}
    returning id`);
  if (!rows.length) throw err(404, 'not yours or already gone');
  return { ok: true };
}

/* ---------- likes ---------- */

export async function toggleLike(commentId, user, env = process.env) {
  const sql = db(env);
  if (!sql) return { offline: true };
  const cid = Number(commentId);
  if (!cid) throw err(400, 'unknown comment');

  await ensureProfile(user, env);
  return withSchema(sql, async () => {
    const target = await sql`select id from comments where id = ${cid} and approved`;
    if (!target.length) throw err(400, 'unknown comment');
    const removed = await sql`
      delete from likes where comment_id = ${cid} and user_id = ${user.id} returning 1`;
    if (!removed.length) {
      await sql`insert into likes (comment_id, user_id) values (${cid}, ${user.id})
                on conflict do nothing`;
    }
    const [{ n }] = await sql`select count(*)::int as n from likes where comment_id = ${cid}`;
    return { liked: !removed.length, likes: n };
  });
}

/* ---------- testimonials ---------- */

/** Approved vouches for one experience page, plus the viewer's own (any state). */
export async function listTestimonials(page, viewerId, opts = {}, env = process.env) {
  const sql = db(env);
  if (!sql) return { offline: true };
  requireExpPage(page);
  const viewer = viewerId || '00000000-0000-0000-0000-000000000000';
  const admin = Boolean(opts.admin);
  const rows = await withSchema(sql, () => sql`
    select t.id, t.relation, t.body, t.approved, t.created_at,
           coalesce(p.name, t.guest_name) as name,
           p.picture, p.title, p.bio, p.links,
           (t.user_id is null) as guest,
           coalesce(t.user_id = ${viewer}, false) as mine
    from testimonials t
    left join profiles p on p.id = t.user_id
    where t.page = ${page} and (t.approved or t.user_id = ${viewer} or ${admin})
    order by t.created_at desc
    limit 100`);
  return { testimonials: rows };
}

/** One vouch per account per page, rewritten in place on a second go. A guest
    has no account to hold that to, so theirs is simply added: the unique pair
    only constrains rows that carry a user_id. */
export async function saveTestimonial(
  { page, relation, body, user, guest, ip, admin, hp, dwell },
  env = process.env
) {
  const sql = db(env);
  if (!sql) return { offline: true };
  requireExpPage(page);

  const cleanRelation = clean(relation, RELATION_MAX);
  const cleanBody = clean(body, BODY_MAX);
  if (!cleanRelation || cleanRelation.length > RELATION_MAX)
    throw err(400, 'say how you know Varakorn, in 80 characters or less');
  if (!cleanBody || cleanBody.length > BODY_MAX)
    throw err(400, 'the vouch must be 1 to 2000 characters');

  // the vouch form has always asked how you know him, so a guest only owes a
  // name on top of what everybody fills in
  const name = user ? null : guestName(guest);
  if (!user && !guestGate({ hp, dwell })) return { ok: true };

  if (user) await ensureProfile(user, env);
  const ipHash = hashIp(ip);
  return withSchema(sql, async () => {
    await guardRate(sql, { userId: user?.id || null, ipHash }, admin);
    if (user) {
      await sql`
        insert into testimonials (user_id, page, relation, body, ip_hash)
        values (${user.id}, ${page}, ${cleanRelation}, ${cleanBody}, ${ipHash})
        on conflict (user_id, page) do update
          set relation = excluded.relation, body = excluded.body`;
    } else {
      await sql`
        insert into testimonials (guest_name, page, relation, body, ip_hash)
        values (${name}, ${page}, ${cleanRelation}, ${cleanBody}, ${ipHash})`;
    }
    return { ok: true };
  });
}

/* ---------- passport stamps + reading ---------- */

export async function addStamp(user, stamp, env = process.env) {
  const sql = db(env);
  if (!sql) return { offline: true };
  if (!STAMPS.has(String(stamp || ''))) throw err(400, 'unknown stamp');
  await ensureProfile(user, env);
  await withSchema(sql, () => sql`
    insert into stamps (user_id, stamp) values (${user.id}, ${stamp})
    on conflict do nothing`);
  return { ok: true };
}

export async function markRead(user, slug, env = process.env) {
  const sql = db(env);
  if (!sql) return { offline: true };
  if (!SLUGS.has(String(slug || ''))) throw err(400, 'unknown note');
  await ensureProfile(user, env);
  await withSchema(sql, () => sql`
    insert into reading (user_id, slug) values (${user.id}, ${slug})
    on conflict do nothing`);
  return { ok: true };
}

/* ---------- the account page, in one round trip ---------- */

export async function accountSummary(user, env = process.env) {
  const sql = db(env);
  if (!sql) return { offline: true };
  return withSchema(sql, async () => {
    // one round trip instead of five: the profile upsert and all four reads
    // fly together, which matters when the function is an ocean from the db
    const [, stamps, reading, comments, testimonials] = await Promise.all([
      ensureProfile(user, env),
      sql`select stamp, created_at from stamps where user_id = ${user.id}`,
      sql`select slug, created_at from reading where user_id = ${user.id}`,
      sql`select id, page, body, approved, created_at
          from comments where user_id = ${user.id}
          order by created_at desc limit 100`,
      sql`select id, page, relation, body, approved, created_at
          from testimonials where user_id = ${user.id}
          order by created_at desc`,
    ]);
    return {
      user: {
        name: user.name,
        email: user.email,
        picture: user.picture,
        title: user.title,
        bio: user.bio,
        links: user.links || [],
      },
      stamps: stamps.map((s) => s.stamp),
      allStamps: [...STAMPS],
      read: reading.map((r) => r.slug),
      totalNotes: SLUGS.size,
      comments,
      testimonials,
    };
  });
}

/** A user deleting their own comment or testimonial from the account page. */
export async function deleteOwn(kind, id, user, opts = {}, env = process.env) {
  const sql = need(env);
  const table = kind === 'testimonial' ? 'testimonials' : 'comments';
  const cid = Number(id);
  const rows = await withSchema(sql, () =>
    opts.admin
      ? sql`delete from ${sql(table)} where id = ${cid} returning id`
      : sql`delete from ${sql(table)} where id = ${cid} and user_id = ${user.id} returning id`
  );
  if (!rows.length) throw err(404, 'not yours or already gone');
  return { ok: true };
}

/** Take something off the site, or put it back. Owner only, checked upstream. */
export async function setVisibility(kind, id, showing, env = process.env) {
  const sql = need(env);
  const table = kind === 'testimonial' ? 'testimonials' : 'comments';
  const rows = await withSchema(sql, () =>
    sql`update ${sql(table)} set approved = ${Boolean(showing)}
        where id = ${Number(id)} returning id, approved`
  );
  if (!rows.length) throw err(404, 'already gone');
  return { ok: true, showing: rows[0].approved };
}

/* ---------- desk terminal history + gate ---------- */


export async function chatHistory(user, env = process.env) {
  const sql = db(env);
  if (!sql) return { history: [] };
  const rows = await withSchema(sql, () => sql`
    select role, body from chats
    where user_id = ${user.id}
    order by created_at asc, id asc
    limit ${CHAT_KEEP}`);
  return { history: rows.map((r) => ({ role: r.role, text: r.body })) };
}

export async function appendChat(user, userText, modelText, env = process.env) {
  const sql = db(env);
  if (!sql) return;
  await ensureProfile(user, env);
  await withSchema(sql, async () => {
    await sql`insert into chats (user_id, role, body)
              values (${user.id}, 'user', ${clean(userText, 600)}),
                     (${user.id}, 'model', ${clean(modelText, 2000)})`;
    // keep the tail, drop the ancient
    await sql`delete from chats where user_id = ${user.id} and id not in
              (select id from chats where user_id = ${user.id}
               order by created_at desc, id desc limit ${CHAT_KEEP})`;
  });
}

/* ---------- the wall: recent approved words, site wide ---------- */

/** Newest approved vouches and top level comments across every page, with
    the profile card fields, for the floating wall on the home page. */
export async function wallItems(env = process.env) {
  const sql = db(env);
  if (!sql) return { items: [] };
  return withSchema(sql, async () => {
    const [vouches, comments] = await Promise.all([
      sql`select t.body, t.page, t.relation, t.created_at,
                 coalesce(p.name, t.guest_name) as name,
                 p.picture, p.title, p.bio, p.links
          from testimonials t left join profiles p on p.id = t.user_id
          where t.approved order by t.created_at desc limit 12`,
      sql`select c.body, c.page, c.created_at,
                 coalesce(p.name, c.guest_name) as name,
                 p.picture, coalesce(p.title, c.guest_relation) as title,
                 p.bio, p.links
          from comments c left join profiles p on p.id = c.user_id
          where c.approved and c.parent_id is null
          order by c.created_at desc limit 12`,
    ]);
    const items = [
      ...vouches.map((v) => ({ kind: 'vouch', ...v })),
      ...comments.map((c) => ({ kind: 'comment', ...c })),
    ]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 24);
    return { items };
  });
}

/* ---------- moderation (CLI only, never exposed over HTTP) ----------
   Nothing waits for approval any more, so moderation is after the fact:
   `recent` to see what people wrote, then `hide` or `delete`. */

/** The newest words on the site, whatever their state. */
export async function listRecent(limit = 20, env = process.env) {
  const sql = need(env);
  const n = Math.min(Math.max(Number(limit) || 20, 1), 200);
  return withSchema(sql, async () => {
    const comments = await sql`
      select c.id, c.page, c.parent_id, c.body, c.created_at, c.approved,
             coalesce(p.name, c.guest_name) as name,
             c.guest_relation as relation, (c.user_id is null) as guest
      from comments c left join profiles p on p.id = c.user_id
      order by c.created_at desc limit ${n}`;
    const testimonials = await sql`
      select t.id, t.page, t.relation, t.body, t.created_at, t.approved,
             coalesce(p.name, t.guest_name) as name, (t.user_id is null) as guest
      from testimonials t left join profiles p on p.id = t.user_id
      order by t.created_at desc limit ${n}`;
    return { comments, testimonials };
  });
}


export async function listPending(env = process.env) {
  const sql = need(env);
  return withSchema(sql, async () => {
    const comments = await sql`
      select c.id, c.page, c.parent_id, c.body, c.created_at,
             coalesce(p.name, c.guest_name) as name, (c.user_id is null) as guest
      from comments c left join profiles p on p.id = c.user_id
      where not c.approved order by c.created_at asc`;
    const testimonials = await sql`
      select t.id, t.page, t.relation, t.body, t.created_at,
             coalesce(p.name, t.guest_name) as name, (t.user_id is null) as guest
      from testimonials t left join profiles p on p.id = t.user_id
      where not t.approved order by t.created_at asc`;
    return { comments, testimonials };
  });
}

export async function moderate(kind, action, id, env = process.env) {
  const sql = need(env);
  const table = kind === 'testimonial' ? 'testimonials' : 'comments';
  const rows =
    action === 'approve'
      ? await sql`update ${sql(table)} set approved = true where id = ${Number(id)} returning id`
      : action === 'hide'
        ? await sql`update ${sql(table)} set approved = false where id = ${Number(id)} returning id`
        : await sql`delete from ${sql(table)} where id = ${Number(id)} returning id`;
  return rows.length > 0;
}
