// Shared API handler: the public guestbook API.
//   GET  /api/comments?page=/experience/... -> { comments } (threads + likes)
//   POST /api/comments { page, body, parent?, name?, relation?, hp?, dwell? }
//        -> { ok }. Signing in is optional: a caller without a token has to
//        say a name and how they know Varakorn instead.
//   PUT  /api/comments { id, body } -> { ok } (edit your own, account only:
//        there is nothing to prove a guest wrote a given comment)
// Identity, when there is one, is a Supabase Auth access token in the
// Authorization header. Comments go up as written; taking one down happens
// from inside the page as the owner, or through scripts/comments-db.mjs.
import { listComments, createComment, updateOwnComment } from './_lib/store.js';
import { userFromRequest, requireUser, isAdmin } from './_lib/supauth.js';
import { readBody, getQuery, sendJson, clientIp } from './_lib/http.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const user = await userFromRequest(req).catch(() => null);
      const admin = isAdmin(user);
      const out = await listComments(getQuery(req).page, user?.id, { admin });
      return sendJson(res, 200, { ...out, admin });
    }
    if (req.method === 'POST') {
      const user = await userFromRequest(req); // null is fine, a name is not
      const b = await readBody(req);
      const out = await createComment({
        page: b.page,
        body: b.body,
        parent: b.parent,
        user,
        guest: { name: b.name, relation: b.relation },
        hp: b.hp,
        dwell: b.dwell,
        ip: clientIp(req),
        admin: isAdmin(user),
      });
      return sendJson(res, 200, out);
    }
    if (req.method === 'PUT') {
      const user = await requireUser(req);
      const b = await readBody(req);
      return sendJson(res, 200, await updateOwnComment({ id: b.id, body: b.body, user }));
    }
    sendJson(res, 405, { error: 'GET, POST, or PUT only' });
  } catch (e) {
    sendJson(res, e.status || 500, { error: e.message || 'error' });
  }
}
