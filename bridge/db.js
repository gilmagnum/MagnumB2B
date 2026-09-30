import sql from 'mssql';
import { sqlConfig } from './config.js';

export { sql };

// Key columns (ItemKey, AccountKey, KeF) - bound as varchar so indexes stay usable.
export const key = (value) => ({ type: sql.VarChar(50), value: value == null ? null : String(value) });

const pools = {};

// role: 'ro' (magnum_ro, all reads) | 'rw' (magnumapp, order insert only)
export function getPool(role = 'ro') {
  if (!pools[role]) {
    const creds = sqlConfig.users[role];
    if (!creds?.password) {
      throw new Error(`Missing SQL password for role "${role}" - fill .env.local (see .env.example)`);
    }
    const pool = new sql.ConnectionPool({
      server: sqlConfig.server,
      port: sqlConfig.port,
      database: sqlConfig.database,
      user: creds.user,
      password: creds.password,
      pool: { max: role === 'rw' ? 2 : 5, min: 0, idleTimeoutMillis: 30000 },
      requestTimeout: 30000,
      options: { encrypt: false, trustServerCertificate: true, appName: `MagnumB2B-bridge-${role}` },
    });
    pools[role] = pool.connect().catch((err) => {
      delete pools[role];
      throw err;
    });
  }
  return pools[role];
}

// params: { name: value } or { name: { type, value } }
export function bind(request, params = {}) {
  for (const [name, p] of Object.entries(params)) {
    if (p && typeof p === 'object' && !(p instanceof Date) && 'type' in p) request.input(name, p.type, p.value);
    else request.input(name, p);
  }
  return request;
}

export async function query(text, params = {}, role = 'ro') {
  const pool = await getPool(role);
  const result = await bind(pool.request(), params).query(text);
  return result.recordset ?? [];
}

export async function closeAll() {
  const open = Object.values(pools);
  for (const role of Object.keys(pools)) delete pools[role];
  await Promise.all(open.map((p) => p.then((pool) => pool.close(), () => {})));
}
