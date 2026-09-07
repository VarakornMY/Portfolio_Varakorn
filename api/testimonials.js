// Vercel serverless function: vouches from people who worked with Varakorn.
//   GET  /api/testimonials?page=/experience/... -> { testimonials, admin }
//        (everything showing, plus the caller's own, plus all of it for the owner)
//   POST /api/testimonials { page, relation, body, name?, hp?, dwell? } -> { ok }
//        Signing in is optional; a caller without a token says a name instead.
// One vouch per account per page, rewritten in place on a second go. A guest
// has no account to hold that to, so theirs is simply added.
import { listTestimonials, saveTestimonial } from './_lib/store.js';
import { userFromRequest, isAdmin } from './_lib/supauth.js';
import { readBody, getQuery, sendJson, clientIp } from './_lib/http.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const user = await userFromRequest(req).catch(() => null);
      const admin = isAdmin(user);
      const out = await listTestimonials(getQuery(req).page, user?.id, { admin });
      return sendJson(res, 200, { ...out, admin });
    }
    if (req.method === 'POST') {
      const user = await userFromRequest(req); // null is fine, a name is not
      const b = await readBody(req);
      const out = await saveTestimonial({
        page: b.page,
        relation: b.relation,
        body: b.body,
        user,
        guest: { name: b.name },
        hp: b.hp,
        dwell: b.dwell,
        ip: clientIp(req),
        admin: isAdmin(user),
      });
      return sendJson(res, 200, out);
    }
    sendJson(res, 405, { error: 'GET or POST only' });
  } catch (e) {
    sendJson(res, e.status || 500, { error: e.message || 'error' });
  }
}
