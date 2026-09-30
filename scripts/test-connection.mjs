import dotenv from 'dotenv';
dotenv.config({ path: new URL('../.env.local', import.meta.url) });
import sql from 'mssql';

const config = {
  server: process.env.HASH_DB_SERVER,
  port: Number(process.env.HASH_DB_PORT),
  database: process.env.HASH_DB_NAME,
  user: process.env.HASH_DB_USER,
  password: process.env.HASH_DB_PASSWORD,
  options: { encrypt: false, trustServerCertificate: true },
  connectionTimeout: 15000,
};

try {
  const pool = await sql.connect(config);
  const r = await pool.request().query(
    "SELECT SUSER_SNAME() AS login_name, DB_NAME() AS db"
  );
  console.log('CONNECTED OK', r.recordset[0]);
  const t = await pool.request().query(
    "SELECT COUNT(*) AS tables FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE'"
  );
  console.log('tables visible:', t.recordset[0].tables);
  await pool.close();
} catch (e) {
  console.error('FAILED:', e.message);
  process.exit(1);
}
