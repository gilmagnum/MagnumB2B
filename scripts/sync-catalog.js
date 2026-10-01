// Full catalog sync Hashavshevet -> Supabase.  node scripts/sync-catalog.js [--dry-run]
import { syncCatalog } from '../bridge/sync.js';
import { closeAll } from '../bridge/db.js';

try {
  const result = await syncCatalog({ dryRun: process.argv.includes('--dry-run') });
  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await closeAll();
}
