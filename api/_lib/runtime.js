import { AsyncLocalStorage } from 'node:async_hooks';

// Workers cannot reuse database sockets across requests. Keep bindings and
// connections local to one request without changing the shared API handlers.
const requests = new AsyncLocalStorage();

export const runtimeScope = () => requests.getStore();
export const runtimeEnv = () => runtimeScope()?.env || process.env;

export function withRuntime(env, action, waitUntil) {
  return requests.run({ env, clients: new Map() }, async () => {
    const scope = runtimeScope();
    try {
      return await action();
    } finally {
      const cleanup = Promise.allSettled(
        [...scope.clients.values()].map((client) => client.end({ timeout: 1 }))
      );
      if (waitUntil) waitUntil(cleanup);
      else await cleanup;
    }
  });
}
