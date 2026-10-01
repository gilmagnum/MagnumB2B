import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// .env.local is read literally: NAME=everything up to the end of the line.
// (dotenv cuts unquoted values at '#', which breaks the SQL passwords.)
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (match && !(match[1] in process.env)) process.env[match[1]] = match[2];
  }
}
loadEnvFile(path.join(ROOT, '.env.local'));

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
export const TEST_ACCOUNT_KEY = '10'; // "לקוחות שונים לא לליקוט"

// Always added, price 0 (priced manually in Hashavshevet). API shipping.carton -> parcel line.
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
  PayDate: new Date(Date.UTC(1990, 0, 1)),
  ExtraDate1: new Date(Date.UTC(1997, 0, 1)),
  ExtraDate2: new Date(Date.UTC(1997, 0, 1)),
};
// Per order kind, as the current site writes them (picking: order 116993, future: order 117010).
export const HEADER_BY_KIND = {
  picking: { PrintStyle: 1, ExtraText3: 'הזמנת אתר' },
  future: { PrintStyle: 13, ExtraText3: null },
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
export const FLAG_FIELDS = new Set(['shownOnSite', 'ignoreStock']);

// ExtraSums.SuFID -> app field
export const SUM_FIELDS = {
  5: 'perCarton',
  6: 'perPack',
  7: 'cartonVolume',
  8: 'royaltyPrc',
};
