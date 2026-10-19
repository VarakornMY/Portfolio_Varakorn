// ---------------------------------------------------------------------------
// One Postgres client for the whole store, pointed at Supabase's transaction
// pooler (port 6543). prepare:false because transaction mode cannot hold
// prepared statements; a few lanes so the account summary's parallel reads
// actually run in parallel instead of queueing on one connection.
// ---------------------------------------------------------------------------
import postgres from 'postgres';
import { runtimeEnv, runtimeScope } from './runtime.js';

let client = null;
let clientUrl = null;

export function db(env = runtimeEnv()) {
  const url = env.HYPERDRIVE?.connectionString || env.DATABASE_URL;
  if (!url) return null;
  const scope = runtimeScope();
  if (scope) {
    if (!scope.clients.has(url)) {
      scope.clients.set(url, postgres(url, {
        prepare: Boolean(env.HYPERDRIVE),
        max: 4,
        idle_timeout: 20,
        connect_timeout: 10,
        ...(env.HYPERDRIVE ? {} : { ssl: 'require' }),
      }));
    }
    return scope.clients.get(url);
  }
  if (!client || clientUrl !== url) {
    client = postgres(url, {
      prepare: false,
      max: 4,
      idle_timeout: 20,
      connect_timeout: 10,
      ssl: 'require',
    });
    clientUrl = url;
  }
  return client;
}
