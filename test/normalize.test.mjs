import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCell, buildTableHtml } from '../src/index.js';
import { resolveCell } from '../src/index.js';
import { normalizeTable } from '../src/index.js';
import { exportTableCSV } from '../src/index.js';
import { buildCSVString } from '../src/index.js';
import { renderReportHTML } from '../src/index.js';

test('normalizeCell: plain value is escaped for html, kept for csv', () => {
  assert.deepEqual(normalizeCell('a<b'), { csv: 'a<b', html: 'a&lt;b' });
});

test('normalizeCell: {csv,html} keeps raw csv and un-escaped html', () => {
  assert.deepEqual(
    normalizeCell({ csv: -50, html: '-$50.00' }),
    { csv: -50, html: '-$50.00' }
  );
});

test('normalizeCell: {csv} only falls back to escaped csv for html', () => {
  assert.deepEqual(normalizeCell({ csv: 'x&y' }), { csv: 'x&y', html: 'x&amp;y' });
});

test('buildTableHtml: classic array rows render escaped cells and num class', () => {
  const columns = [{ title: 'Name' }, { title: 'Amt', align: 'end' }];
  const rows = [['a<b', { csv: 5, html: '$5' }]];
  const html = buildTableHtml(columns, rows);
  assert.match(html, /<th>Name<\/th>/);
  assert.match(html, /<th class="num">Amt<\/th>/);
  assert.match(html, /<td>a&lt;b<\/td>/);
  assert.match(html, /<td class="num">\$5<\/td>/);
});

test('resolveCell: classic array row delegates to normalizeCell by index', () => {
  const row = ['a<b', { csv: 5, html: '$5' }];
  assert.deepEqual(resolveCell({ title: 'X' }, row, 0), { csv: 'a<b', html: 'a&lt;b' });
  assert.deepEqual(resolveCell({ title: 'Y' }, row, 1), { csv: 5, html: '$5' });
});

test('resolveCell: dynamic reads row[key], escapes html when no format', () => {
  const row = { name: 'a<b', amount: -50 };
  assert.deepEqual(resolveCell({ key: 'name', title: 'Name' }, row, 0), { csv: 'a<b', html: 'a&lt;b' });
});

test('resolveCell: value accessor takes precedence over key', () => {
  const row = { amount: -50, balance: 100 };
  const col = { key: 'amount', value: r => r.balance, title: 'B' };
  assert.deepEqual(resolveCell(col, row, 0), { csv: 100, html: '100' });
});

test('resolveCell: format returning a string keeps raw csv, escapes html', () => {
  const row = { amount: -50 };
  const col = { key: 'amount', title: 'Amt', format: v => '<' + v + '>' };
  assert.deepEqual(resolveCell(col, row, 0), { csv: -50, html: '&lt;-50&gt;' });
});

test('resolveCell: format returning {csv,html} passes html un-escaped', () => {
  const row = { amount: -50 };
  const col = { key: 'amount', title: 'Amt', format: v => ({ csv: v, html: '-$50.00' }) };
  assert.deepEqual(resolveCell(col, row, 0), { csv: -50, html: '-$50.00' });
});

test('resolveCell: missing key yields empty-ish cell', () => {
  assert.deepEqual(resolveCell({ key: 'nope', title: 'X' }, {}, 0), { csv: undefined, html: '' });
});

test('normalizeTable: object rows resolve via key + format', () => {
  const columns = [
    { key: 'name', title: 'Name' },
    { key: 'amount', title: 'Amt', align: 'end', format: v => ({ csv: v, html: '$' + v }) },
  ];
  const rows = [{ name: 'x<y', amount: 5 }];
  assert.deepEqual(normalizeTable(columns, rows), [
    [{ csv: 'x<y', html: 'x&lt;y' }, { csv: 5, html: '$5' }],
  ]);
});

test('buildTableHtml: object rows render keyed + formatted cells', () => {
  const columns = [
    { key: 'name', title: 'Name' },
    { key: 'amount', title: 'Amt', align: 'end', format: v => ({ csv: v, html: '-$50.00' }) },
  ];
  const html = buildTableHtml(columns, [{ name: 'a<b', amount: -50 }]);
  assert.match(html, /<td>a&lt;b<\/td>/);
  assert.match(html, /<td class="num">-\$50\.00<\/td>/);
});

test('exportTableCSV: object rows write raw csv values (not formatted html)', () => {
  const columns = [
    { key: 'name', title: 'Name' },
    { key: 'amount', title: 'Amt', format: v => ({ csv: v, html: '$' + v }) },
  ];
  const rows = [{ name: 'Sale, #1', amount: -50 }];

  let blobText;
  globalThis.Blob = class { constructor(parts) { blobText = parts.join(''); } };
  globalThis.URL = { createObjectURL: () => 'blob:x', revokeObjectURL() {} };
  globalThis.document = {
    createElement: () => ({ click() {}, style: {}, setAttribute() {} }),
    body: { appendChild() {}, removeChild() {} },
  };

  exportTableCSV('out.csv', columns, rows);

  assert.equal(blobText, '﻿Name,Amt\r\n"Sale, #1",-50');
});

test('buildTableHtml: object rows produce one tr per row with all columns', () => {
  const columns = [
    { key: 'a', title: 'A' },
    { key: 'b', title: 'B', align: 'end' },
    { value: r => r.a + r.b, title: 'Sum', align: 'end' },
  ];
  const rows = [{ a: 1, b: 2 }, { a: 3, b: 4 }];
  const html = buildTableHtml(columns, rows);
  const trCount = (html.match(/<tr>/g) || []).length; // 1 head + 2 body
  assert.equal(trCount, 3);
  assert.match(html, /<td class="num">3<\/td>/); // Sum of first row
  assert.match(html, /<td class="num">7<\/td>/); // Sum of second row
});

test('buildCSVString: object rows keep raw csv, BOM + CRLF + quoting', () => {
  const columns = [
    { key: 'name', title: 'Name' },
    { key: 'amount', title: 'Amt', format: v => ({ csv: v, html: '$' + v }) },
  ];
  const rows = [{ name: 'Sale, #1', amount: -50 }];
  assert.equal(buildCSVString(columns, rows), '﻿Name,Amt\r\n"Sale, #1",-50');
});

test('buildCSVString: classic array rows quote embedded commas', () => {
  const columns = [{ title: 'A' }, { title: 'B' }];
  assert.equal(buildCSVString(columns, [['x', 'y,z']]), '﻿A,B\r\nx,"y,z"');
});

test('buildCSVString: starts with a single U+FEFF BOM code point', () => {
  const out = buildCSVString([{ title: 'A' }], [['x']]);
  assert.equal(out.codePointAt(0), 0xfeff);
  assert.equal(out.codePointAt(1), 'A'.codePointAt(0));
});

test('renderReportHTML: contains store, title, summary, headers and cells', () => {
  const columns = [
    { key: 'name', title: 'Name' },
    { key: 'amt', title: 'Amt', align: 'end', format: v => ({ csv: v, html: '$' + v }) },
  ];
  const rows = [{ name: 'a<b', amt: 5 }];
  const html = renderReportHTML('My Report', columns, rows, {
    storeName: 'My Store',
    summary: [{ label: 'Total', value: '$5' }],
  });
  assert.match(html, /My Store/);
  assert.match(html, /My Report/);
  assert.match(html, /Total/);
  assert.match(html, /<th>Name<\/th>/);
  assert.match(html, /<th class="num">Amt<\/th>/);
  assert.match(html, /<td>a&lt;b<\/td>/);
  assert.match(html, /<td class="num">\$5<\/td>/);
});

test('renderReportHTML: omits summary block when summary missing/empty', () => {
  const html = renderReportHTML('R', [{ title: 'A' }], [['x']], {});
  assert.ok(!/class="summary"/.test(html));
  assert.match(html, /<td>x<\/td>/);
});
