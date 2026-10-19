import comments from '../api/comments.js';
import like from '../api/like.js';
import testimonials from '../api/testimonials.js';
import me from '../api/me.js';
import chat from '../api/chat.js';
import wall from '../api/wall.js';
import { withRuntime } from '../api/_lib/runtime.js';

const handlers = new Map(Object.entries({ comments, like, testimonials, me, chat, wall })
  .map(([name, handler]) => [`/api/${name}`, handler]));

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.hostname === 'varakorn.me') {
      url.hostname = 'www.varakorn.me';
      url.protocol = 'https:';
      return Response.redirect(url.href, 301);
    }
    if (url.pathname !== '/api' && !url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }
    const handler = handlers.get(url.pathname.replace(/\/$/, ''));
    if (!handler) return Response.json({ error: 'not found' }, { status: 404 });

    return withRuntime(env, async () => {
      const req = {
        method: request.method,
        url: url.pathname + url.search,
        query: Object.fromEntries(url.searchParams),
        headers: {
          ...Object.fromEntries(request.headers),
          // Use Cloudflare's client address rather than a caller supplied XFF.
          'x-forwarded-for': request.headers.get('cf-connecting-ip') || '',
        },
        readJson: () => request.json(),
      };
      const headers = new Headers({ 'cache-control': 'no-store' });
      let body = '';
      const res = {
        statusCode: 200,
        setHeader(name, value) { headers.set(name, value); },
        end(value = '') { body = value; },
      };
      await handler(req, res);
      if (res.statusCode >= 400) headers.set('cache-control', 'no-store');
      return new Response(body, { status: res.statusCode, headers });
    }, (promise) => ctx.waitUntil(promise));
  },
};
