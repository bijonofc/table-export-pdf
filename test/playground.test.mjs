import { test } from 'node:test';
import assert from 'node:assert/strict';
import { libColumns, libRows } from '../dev/maplib.js';
import { csvToTable } from '../dev/preview.js';

const fmt = v => ({ csv: v, html: '$' + v });
const section = {
  columns: [
    { key: 'name', title: 'Name' },
    { key: 'amt', title: 'Amt', align: 'end', type: 'number', format: fmt },
  ],
};
const rows = [{ name: 'x', amt: 5 }];

test('libColumns classic drops key/format, keeps title/align', () => {
  const cols = libColumns({ ...section, api: 'classic' });
  assert.deepEqual(cols, [{ title: 'Name', align: undefined }, { title: 'Amt', align: 'end' }]);
});

test('libColumns dynamic keeps key/align/format', () => {
  const cols = libColumns({ ...section, api: 'dynamic' });
  assert.equal(cols[1].key, 'amt');
  assert.equal(cols[1].align, 'end');
  assert.equal(typeof cols[1].format, 'function');
});

test('libRows classic maps objects to cell arrays via format', () => {
  const out = libRows({ ...section, api: 'classic' }, rows);
  assert.deepEqual(out, [['x', { csv: 5, html: '$5' }]]);
});

test('libRows dynamic passes objects through unchanged', () => {
  const out = libRows({ ...section, api: 'dynamic' }, rows);
  assert.equal(out, rows);
});

test('csvToTable: header row becomes th, body rows become td, BOM stripped', () => {
  const csv = '﻿Name,Amt\r\nx,5';
  const html = csvToTable(csv);
  assert.match(html, /<thead><tr><th>Name<\/th><th>Amt<\/th><\/tr><\/thead>/);
  assert.match(html, /<tbody><tr><td>x<\/td><td>5<\/td><\/tr><\/tbody>/);
  assert.ok(!html.includes('﻿'));
});

test('csvToTable: quoted field with comma is parsed as one cell and escaped', () => {
  const csv = '﻿A,B\r\n"y,z",<b>';
  const html = csvToTable(csv);
  assert.match(html, /<td>y,z<\/td><td>&lt;b&gt;<\/td>/);
});
