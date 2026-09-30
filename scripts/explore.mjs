// Ad-hoc read-only exploration (magnum_ro): node scripts/explore.mjs "<sql>" [more sql...]
// An argument ending in .sql is read as a file; statements are separated by lines of "GO".
import fs from 'node:fs';
import { query, closeAll } from '../bridge/db.js';

const statements = process.argv
  .slice(2)
  .flatMap((arg) => (arg.endsWith('.sql') ? fs.readFileSync(arg, 'utf8').split(/^\s*GO\s*$/im) : [arg]))
  .filter((s) => s.trim());

try {
  for (const text of statements) {
    console.log(`\n-- ${text}`);
    const rows = await query(text);
    if (rows.length && Object.keys(rows[0]).length > 8) rows.forEach((r) => console.log(JSON.stringify(r)));
    else console.table(rows);
  }
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await closeAll();
}
