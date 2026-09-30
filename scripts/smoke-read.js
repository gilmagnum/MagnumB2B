// Read-only smoke test of the bridge (magnum_ro).
import { read, closeAll } from '../bridge/index.js';
import { TEST_ACCOUNT_KEY } from '../bridge/config.js';

try {
  const items = await read.getItems();
  const shown = items.filter((i) => i.shownOnSite);
  console.log(`Items: ${items.length} active, ${shown.length} shown on site, ${items.filter((i) => i.isMatrix).length} matrix`);
  console.log('Sample item:', shown[0] ?? items[0]);

  const accounts = await read.getAccounts();
  console.log(`Accounts: ${accounts.length} active`);

  const test = await read.getAccount(TEST_ACCOUNT_KEY);
  console.log(`Test account ${TEST_ACCOUNT_KEY}:`, test ? test.FullName : 'NOT FOUND');

  const sample = shown[0] ?? items[0];
  if (sample) {
    const prices = await read.getPriceSources(TEST_ACCOUNT_KEY, sample.itemKey);
    console.log(
      `Price sources for ${sample.itemKey}: ${prices.priceLists.length} price lists, ` +
        `${prices.specialPrices.length} special prices, ${prices.discounts.length} discounts`,
    );
    console.log('Stock by warehouse:', await read.getStockByWarehouse(sample.itemKey));
  }
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await closeAll();
}
