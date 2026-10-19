import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import { runtimeEnv, runtimeScope, withRuntime } from '../api/_lib/runtime.js';
import { db } from '../api/_lib/db.js';

const ctx = { waitUntil(promise) { return promise; } };
const call = (path, options, env = {}) => worker.fetch(
  new Request(`https://portfolio.test${path}`, options), env, ctx
);

test('anonymous chat stays gated, including malformed JSON', async () => {
  const response = await call('/api/chat', { method: 'POST', body: '{' });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).gate, true);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('all API endpoints route to their own handlers', async () => {
  for (const path of ['comments', 'like', 'testimonials', 'me', 'chat', 'wall']) {
    const response = await call(`/api/${path}`, { method: 'PATCH' });
    assert.equal(response.status, path === 'me' ? 401 : 405, path);
  }
  const response = await call('/api/missing');
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error, 'not found');
});

test('comments forward JSON bodies and keep validation', async () => {
  const response = await call('/api/comments', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ page: '/experience/hygr-content-creator', body: 'hello', name: 'Guest' }),
  }, { DATABASE_URL: 'postgres://test:test@localhost:5432/test' });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /say how you know Varakorn/);
});

test('public assets retain their original request', async () => {
  const response = await call('/experience/example?x=1', undefined, {
    ASSETS: { fetch(request) { return new Response(request.url); } },
  });
  assert.equal(await response.text(), 'https://portfolio.test/experience/example?x=1');
});

test('concurrent requests isolate bindings and database clients and clean up', async () => {
  const clients = [];
  const cleaned = [];
  await Promise.all(['first', 'second'].map((name) => withRuntime({ name,
    DATABASE_URL: 'postgres://test:test@localhost:5432/test' }, async () => {
    await new Promise((resolve) => setTimeout(resolve, name === 'first' ? 10 : 0));
    assert.equal(runtimeEnv().name, name);
    const client = db();
    clients.push(client);
    assert.equal(db(), client);
    // No network: replace the lazy client with a cleanup observer.
    runtimeScope().clients.set('observer', { end() { cleaned.push(name); } });
  })));
  assert.notEqual(clients[0], clients[1]);
  assert.deepEqual(cleaned.sort(), ['first', 'second']);
  assert.equal(runtimeScope(), undefined);
  assert.equal(runtimeEnv(), process.env);
});
