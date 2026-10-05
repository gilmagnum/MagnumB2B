import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// .env.local is read literally: NAME=everything up to the end of the line.
// (dotenv cuts unquoted values at '#', which breaks the SQL passwords.)
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    // .env.local is readable only by the service account; tools/tests run without it.
    if (err.code !== 'EPERM' && err.code !== 'EACCES') throw err;
    console.warn(`config: cannot read ${file} (${err.code}) - running without it`);
    return;
  }
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (match && !(match[1] in process.env)) process.env[match[1]] = match[2];
  }
}
loadEnvFile(path.join(ROOT, '.env.local'));
// Optional dev fallback (read-only SQL credentials for the Claude session, which cannot read .env.local).
// Only fills variables .env.local did not set.
loadEnvFile(path.join(ROOT, '.env.dev'));

const env = process.env;

export const sqlConfig = {
  server: env.HASH_DB_SERVER || 'localhost',
  port: Number(env.HASH_DB_PORT || 61476),
  database: env.HASH_DB_NAME || 'magnum12',
  users: {
    ro: { user: env.HASH_DB_USER_RO || 'magnum_ro', password: env.HASH_DB_PASSWORD_RO },
    rw: { user: env.HASH_DB_USER_RW || 'magnumapp', password: env.HASH_DB_PASSWORD_RW },
  },
};

// Hashavshevet constants (SERVER-CONTEXT.md sections 3+5)
// Order document per orderKind (DocumentsDef): picking = "הזמנת סוכן", future = "הזמנה".
export const ORDER_DOCUMENT_IDS = { picking: 11, future: 6 };
export const ORDER_WAREHOUSE = 1;
export const VAT_PRC = 18;
// Accounts.SortGroup of customers (all orders since 2025 come from these; the rest are ledger/supplier accounts).
export const CUSTOMER_SORT_GROUPS = (env.CUSTOMER_SORT_GROUPS || '10,11,12').split(',');
export const TEST_ACCOUNT_KEY = '10';

// Customers whose "orders" are inter-warehouse transfers (reply 53, verified on 1,373 documents of 10830):
// DocumentID 19 "העברה בין מחסנים", Stock.TransStore = source warehouse, Stock.Warehouse (and line
// Warehouse) = destination, no VAT added on the header. Read side only for now (write pending Gil's OK).
export const TRANSFER_ACCOUNTS = { '10830': { documentId: 19, fromWarehouse: 1, toWarehouse: 10830 } }; // "לקוחות שונים לא לליקוט"

// Picking orders always get both lines (qty 0 when unused); price 0 (priced manually in Hashavshevet). API shipping.carton -> parcel line.
export const SHIPPING_ITEMS = {
  carton: { itemKey: 'M1001', name: 'משלוח חבילה B2B' },
  pallet: { itemKey: 'M1002', name: 'משלוח משטח B2B' },
};

// Every order line is flat (Tree=0), matrix cells included - see SERVER-CONTEXT §4/§5.
export const TREE_FLAT = 0;

// Fixed values found on every real "הזמנת אתר" order (schema-dump samples).
export const CURRENCY = 'ש"ח';
export const DEFAULT_UNIT = "יח'";
export const HEADER_DEFAULTS = {
  TransType: 'M00',
  VatFreeTransType: 'חפ',
  Currency: CURRENCY,
  EvalCurrency: '$',
  MainRate: 1,
  VatFactor: 1,
  BranchID: 1,
  UseFID: 2,
  Copies: 2,
  ExtraText3: 'הזמנת אפליקציה', // marks orders written by this app (the old site wrote 'הזמנת אתר')
  PayDate: new Date(Date.UTC(1990, 0, 1)),
  ExtraDate1: new Date(Date.UTC(1997, 0, 1)),
  ExtraDate2: new Date(Date.UTC(1997, 0, 1)),
};
export const LINE_DEFAULTS = {
  CurrencyCode: CURRENCY,
  OPriceCurrencyCode: CURRENCY,
  Rate: 1,
  ORate: 1,
  PurchPriceRate: 1,
  BranchID: 1,
  CancelDate: new Date(Date.UTC(1999, 0, 1)),
  WarrentyDate: new Date(Date.UTC(1980, 0, 1)),
  ExtraDate1: new Date(Date.UTC(1997, 0, 1)),
  ExtraDate2: new Date(Date.UTC(1997, 0, 1)),
};

export const orderWriteEnabled = () => env.ORDER_WRITE_ENABLED === '1';

// ExtraNotes.NoteID -> app field
export const NOTE_FIELDS = {
  7: 'brand',
  8: 'brandOwner',
  16: 'brandGroup',
  22: 'mainCategory',
  23: 'subCategory',
  24: 'group',
  25: 'sizeRulerCode',
  26: 'cartonSizeItem',
  27: 'colorItem',
  28: 'shownOnSite',
  29: 'color',
  31: 'ignoreStock',
  33: 'matrixSize',
  34: 'season',
  36: 'parentSku',
  44: 'kedsCategory',
};
export const FLAG_FIELDS = new Set(['shownOnSite', 'ignoreStock', 'colorItem', 'cartonSizeItem']);

// ExtraSums.SuFID -> app field
export const SUM_FIELDS = {
  5: 'perCarton',
  6: 'perPack',
  7: 'cartonVolume',
  8: 'royaltyPrc',
};
