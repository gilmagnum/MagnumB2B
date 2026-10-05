// node --test test/matrix.test.js  (pure, no database)
import test from 'node:test';
import assert from 'node:assert/strict';
import { matrixAxes, labelCell } from '../bridge/read.js';

const defs = [{ ItemKey: 'KD54301', LineHead: 'צבע', ColHead: 'מידה' }];
const tbl = [
  { ID: 1, ItemKey: 'KD54301', Name: 'לבן 501', Code: '501', VorH: 0 },
  { ID: 2, ItemKey: 'KD54301', Name: 'שחור 502', Code: '502', VorH: 0 },
  { ID: 3, ItemKey: 'KD54301', Name: '04', Code: '04', VorH: 1 },
  { ID: 4, ItemKey: 'KD54301', Name: '06', Code: '06', VorH: 1 },
  { ID: 9, ItemKey: 'KD54301', Name: 'כחול 523', Code: '523', VorH: 0 }, // added later, higher ID
];
const ax = matrixAxes(defs, tbl).get('KD54301');
const cell = (itemKey, line, col, notes = {}) => ({ itemKey, fatherKey: 'KD54301', line, col, ...notes });

test('axes: VorH 0 = lines, 1 = columns, in ID order', () => {
  assert.deepEqual(ax.lines.map((l) => l.code), ['501', '502', '523']);
  assert.deepEqual(ax.cols.map((c) => c.code), ['04', '06']);
});

test('label by position when the codes agree', () => {
  assert.deepEqual(labelCell(cell('KD5430150206', 1, 1), ax), { colorLabel: 'שחור 502', sizeLabel: '06' });
});

test('codes win when the position disagrees', () => {
  // Hashavshevet line index 5 for colour 523 (gaps in the table): matched by code, not position.
  assert.deepEqual(labelCell(cell('KD5430152304', 5, 0), ax), { colorLabel: 'כחול 523', sizeLabel: '04' });
});

test('no guessing: unknown codes fall back to the cell notes', () => {
  assert.deepEqual(labelCell(cell('KD5430159904', 1, 0, { colorNote: 'הערה' }), ax), { colorLabel: 'הערה', sizeLabel: '04' });
});

test('headers decide the axes (line = size)', () => {
  const swapped = matrixAxes([{ ItemKey: 'X', LineHead: 'מידה', ColHead: 'צבע' }],
    [{ ID: 1, ItemKey: 'X', Name: 'S', Code: 'S', VorH: 0 }, { ID: 2, ItemKey: 'X', Name: 'אדום', Code: 'R', VorH: 1 }]).get('X');
  assert.deepEqual(labelCell({ itemKey: 'XSR', fatherKey: 'X', line: 0, col: 0 }, swapped), { colorLabel: 'אדום', sizeLabel: 'S' });
});

test('no matrix definition: notes only', () => {
  assert.deepEqual(labelCell(cell('Q1', 0, 0, { sizeNote: 'M', colorNote: 'כחול' }), undefined), { colorLabel: 'כחול', sizeLabel: 'M' });
});
