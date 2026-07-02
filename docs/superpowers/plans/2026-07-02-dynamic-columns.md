# Dynamic Columns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let callers pass raw row objects plus keyed/formatted columns (instead of pre-built cell arrays) to the CSV/PDF export functions, auto-detected per row so the existing array-of-cells API keeps working.

**Architecture:** Add two pure internal helpers — `resolveCell(column, row, colIndex)` and `normalizeTable(columns, rows)` — that convert either input shape into the internal normalized form `Array<Array<{csv, html}>>`. The three public functions call `normalizeTable` once at entry; all downstream code (`buildTableHtml`, CSV builder, `paginateRows`) consumes pre-normalized cells and is agnostic to which API was used.

**Tech Stack:** Plain ESM JavaScript (single file `src/index.js`), JSDoc typedefs, `html2pdf.js` (optional peer dep, lazy-imported). Tests run under plain `node` (built-in `node:test` + `node:assert`) — pure string functions only, no DOM.

## Global Constraints

- File stays ESM (`"type":"module"`); no new **runtime** dependencies. `html2pdf.js` stays an optional peer dep. `vite` and `html2pdf.js` may be added as **devDependencies** (dev playground + build).
- Library does **no** locale formatting — formatting comes only from caller-supplied `format` callbacks.
- Plain string cells and `format`-returned strings are **HTML-escaped**; `{html}` from `{csv,html}` objects is inserted **un-escaped** (trusted markup).
- Detection is **per row**: `Array.isArray(row)` → classic path; object row → dynamic path.
- Existing array-of-cells callers must produce byte-identical output (no regressions).
- `node --check src/index.js` must pass after every task.
- **No git.** This is not a git repo yet (the user will init it later). Do **not** run `git init`, `git add`, or `git commit`, and do not add a git-based build step. Every task ends by saving files and running its verification commands — there are no commit steps.
- The library must remain importable as `import { ... } from 'table-export-pdf'` (its own `package.json` `exports`). The dev playground imports directly from `./src/index.js`.
- `npm run dev` (Vite) must serve a working browser playground; `npm run build` (Vite lib mode) must produce `dist/` for the future npm publish; `npm test` runs `node --test`.

---

### Task 0: Vite dev playground + build config

Set up Vite so `npm run dev` opens a browser playground that exercises the library's three
functions with real sample data, and `npm run build` produces a publishable `dist/` (lib
mode) for the future npm release. This uses the **current (classic) array-of-cells API** so
it works before the dynamic feature exists; Task 5 adds a dynamic-API section to the same page.

**Files:**
- Modify: `package.json` (add `scripts` and `devDependencies`; keep `main`/`module`/`exports`)
- Create: `index.html` (Vite entry at project root)
- Create: `dev/main.js` (playground logic — vanilla JS, imports from `../src/index.js`)
- Create: `vite.config.js` (dev root + lib-mode build with `html2pdf.js` externalized)
- Modify: `.gitignore` (add `dist/` and `node_modules/` if not present)

**Interfaces:**
- Consumes: existing public exports `exportTableCSV`, `exportTablePDF`, `downloadTablePDF`.
- Produces: `npm run dev`, `npm run build`, `npm test` scripts.

- [ ] **Step 1: Add scripts + devDependencies to package.json**

Read `package.json` first. Add a `scripts` block and a `devDependencies` block. After the
edit the file must contain (merge with existing keys, do not remove `main`/`module`/`exports`/
`peerDependencies`):

```json
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "node --test"
  },
  "devDependencies": {
    "vite": "^5.4.0",
    "html2pdf.js": "^0.10.1"
  },
```

- [ ] **Step 2: Create the Vite config (dev + lib build)**

Create `vite.config.js`:

```js
import { defineConfig } from 'vite';

// Dev: serves index.html at the project root (the playground).
// Build: library mode -> dist/, with html2pdf.js kept external (it's an optional peer dep).
export default defineConfig(({ command }) => {
  if (command === 'build') {
    return {
      build: {
        lib: {
          entry: 'src/index.js',
          name: 'TableExportPdf',
          formats: ['es', 'umd'],
          fileName: (format) => `table-export-pdf.${format}.js`,
        },
        rollupOptions: {
          external: ['html2pdf.js'],
          output: { globals: { 'html2pdf.js': 'html2pdf' } },
        },
      },
    };
  }
  return {}; // dev server: default root, serves ./index.html
});
```

- [ ] **Step 3: Create the playground HTML entry**

Create `index.html` at the project root:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>table-export-pdf playground</title>
    <style>
      body { font-family: system-ui, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 16px; }
      button { font: inherit; padding: 8px 14px; margin: 4px 8px 4px 0; cursor: pointer; }
      h1 { font-size: 20px; } h2 { font-size: 15px; margin-top: 28px; }
      pre { background: #f4f4f4; padding: 12px; overflow: auto; border-radius: 6px; }
    </style>
  </head>
  <body>
    <h1>table-export-pdf playground</h1>
    <p>Sample outlet-ledger data. Buttons call the library directly.</p>

    <h2>Classic API (array-of-cells rows)</h2>
    <button id="csv-classic">Export CSV</button>
    <button id="print-classic">Print-dialog PDF</button>
    <button id="download-classic">Download PDF</button>

    <pre id="log">ready.</pre>

    <script type="module" src="/dev/main.js"></script>
  </body>
</html>
```

- [ ] **Step 4: Create the playground logic**

Create `dev/main.js`:

```js
import { exportTableCSV, exportTablePDF, downloadTablePDF } from '../src/index.js';

const log = (msg) => { document.getElementById('log').textContent = msg; };
const currency = (n) => (n < 0 ? '-$' : '$') + Math.abs(Number(n)).toFixed(2);

// Classic API: columns are {title, align}; rows are arrays of cells (plain or {csv,html}).
const classicColumns = [
  { title: 'Date' },
  { title: 'Description' },
  { title: 'Amount', align: 'end' },
  { title: 'Balance', align: 'end' },
];
const classicRows = [
  ['2026-07-01', 'Opening balance', { csv: 0,   html: currency(0) },   { csv: 0,   html: currency(0) }],
  ['2026-07-02', 'Sale #1201',      { csv: -50, html: currency(-50) }, { csv: -50, html: currency(-50) }],
  ['2026-07-03', 'Payment',         { csv: 50,  html: currency(50) },  { csv: 0,   html: currency(0) }],
];

const opts = {
  storeName: 'My Store',
  filename: 'outlet-ledger',
  pageBreak: true,
  repeatHeader: true,
  pageNumbers: true,
  pageSize: 'a4',
  summary: [
    { label: 'Total Debit',  value: currency(50) },
    { label: 'Total Credit', value: currency(50) },
    { label: 'Net Balance',  value: currency(0) },
  ],
};

document.getElementById('csv-classic').onclick = () => {
  exportTableCSV('outlet-ledger.csv', classicColumns, classicRows);
  log('CSV exported (classic).');
};
document.getElementById('print-classic').onclick = () => {
  exportTablePDF('Outlet Ledger', classicColumns, classicRows, { storeName: 'My Store', summary: opts.summary });
  log('Print dialog opened (classic).');
};
document.getElementById('download-classic').onclick = async () => {
  log('Rendering PDF (classic)…');
  await downloadTablePDF('Outlet Ledger', classicColumns, classicRows, opts);
  log('PDF downloaded (classic).');
};
```

- [ ] **Step 5: Ensure .gitignore covers build + deps**

Read `.gitignore`. Ensure it contains these lines (add any missing):

```
node_modules/
dist/
```

- [ ] **Step 6: Install dependencies**

Run: `npm install`
Expected: `vite` and `html2pdf.js` install; a `node_modules/` appears; exit 0.

- [ ] **Step 7: Verify the dev server boots**

Run (non-blocking check): `npm run build`
Expected: Vite builds `dist/table-export-pdf.es.js` and `.umd.js` with `html2pdf.js` external; exit 0.
(This confirms the config parses and the entry resolves without needing to hold a dev server open.)

- [ ] **Step 8: Verify module still parses**

Run: `node --check src/index.js`
Expected: exit 0.

> No commit — this project is not a git repo yet. Confirm all files are saved and the two
> commands above exit 0.

---

### Task 1: Test harness + extract pure helpers into a testable seam

Currently `resolveCell`/`normalizeTable` do not exist and CSV/HTML builders call `normalizeCell` inline. To unit-test without a DOM, the pure functions must be exported. This task adds a test file and confirms the current pure helpers behave as expected — establishing the baseline before adding the dynamic path.

**Files:**
- Modify: `src/index.js` (add named exports for internal pure helpers `normalizeCell`, `buildTableHtml`)
- Create: `test/normalize.test.mjs`

**Interfaces:**
- Consumes: existing `normalizeCell(cell)` → `{csv, html}`, existing `buildTableHtml(columns, rows)` → string. The `test` script (`node --test`) already exists from Task 0.
- Produces: `normalizeCell` and `buildTableHtml` become named exports (in addition to their current internal use).

- [ ] **Step 1: Add named exports to the two existing pure helpers**

In `src/index.js`, change the declaration of `normalizeCell` from:

```js
function normalizeCell(cell) {
```

to:

```js
export function normalizeCell(cell) {
```

And change `buildTableHtml` from:

```js
function buildTableHtml(columns, rows) {
```

to:

```js
export function buildTableHtml(columns, rows) {
```

- [ ] **Step 2: Write baseline tests for the existing behavior**

Create `test/normalize.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCell, buildTableHtml } from '../src/index.js';

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
```

- [ ] **Step 3: Run the tests, verify they pass**

Run: `npm test`
Expected: 4 tests pass. (Confirms the exports work and baseline behavior is captured.)

- [ ] **Step 4: Verify the module still parses**

Run: `node --check src/index.js`
Expected: no output, exit 0.

> No commit (no git repo yet). Confirm files are saved and both commands above pass.

---

### Task 2: `resolveCell` — value extraction + formatting for both shapes

Add the core adapter that turns one column + one row into a normalized `{csv, html}` cell, handling the classic array path and the new dynamic object path.

**Files:**
- Modify: `src/index.js` (add `resolveCell`, extend the `Column` typedef)
- Modify: `test/normalize.test.mjs` (add `resolveCell` tests)

**Interfaces:**
- Consumes: `normalizeCell(cell)` (Task 1), `htmlEscape(value)` (existing internal).
- Produces: `export function resolveCell(column, row, colIndex)` → `{ csv, html }`.
  - Classic branch: when `Array.isArray(row)`, returns `normalizeCell(row[colIndex])`.
  - Dynamic branch: extracts `raw = column.value ? column.value(row) : (column.key != null ? row[column.key] : undefined)`, then:
    - `format` returns string → `{ csv: raw, html: htmlEscape(string) }`
    - `format` returns object → `normalizeCell(object)`
    - no `format` → `normalizeCell(raw)` (i.e. `{ csv: raw, html: htmlEscape(raw) }`)

- [ ] **Step 1: Write failing tests for `resolveCell`**

Add to `test/normalize.test.mjs`:

```js
import { resolveCell } from '../src/index.js';

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
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm test`
Expected: FAIL — `resolveCell` is not exported / not a function.

- [ ] **Step 3: Implement `resolveCell`**

In `src/index.js`, immediately after the `normalizeCell` function, add:

```js
/**
 * Resolve one column + one row into a normalized { csv, html } cell.
 * Classic rows (arrays) index by position; object rows read column.key /
 * column.value and run column.format.
 * @param {Column} column
 * @param {*} row              Array (classic) or plain object (dynamic).
 * @param {number} colIndex    Position of the column (used for array rows).
 * @returns {{csv:*, html:string}}
 */
export function resolveCell(column, row, colIndex) {
    if (Array.isArray(row)) {
        return normalizeCell(row[colIndex]);
    }
    const raw = (column && typeof column.value === 'function')
        ? column.value(row)
        : (column && column.key != null ? row[column.key] : undefined);
    if (column && typeof column.format === 'function') {
        const out = column.format(raw, row);
        if (out !== null && typeof out === 'object' && ('csv' in out || 'html' in out)) {
            return normalizeCell(out);
        }
        // A plain string (or number) return value is display text: keep raw for CSV,
        // escape for the PDF (return { html } from format if you want trusted markup).
        return { csv: raw, html: htmlEscape(out) };
    }
    return normalizeCell(raw);
}
```

- [ ] **Step 4: Extend the `Column` typedef**

In `src/index.js`, replace the existing `Column` typedef block:

```js
/**
 * @typedef {Object} Column
 * @property {string} title      Column header text (used as-is).
 * @property {'end'} [align]     'end' right-aligns the column (for numbers).
 */
```

with:

```js
/**
 * @typedef {Object} Column
 * @property {string} title      Column header text (used as-is).
 * @property {'end'} [align]     'end' right-aligns the column (for numbers).
 * @property {string} [key]      (Object rows) property name read from each row.
 * @property {(row:*)=>*} [value] (Object rows) computed accessor; takes precedence over key.
 * @property {(value:*,row:*)=>(string|FormattedCell)} [format] (Object rows) formats the
 *           extracted value. A string return is used as display text and HTML-escaped;
 *           a { csv, html } return follows FormattedCell semantics (html un-escaped).
 */
```

- [ ] **Step 5: Run tests, verify they pass**

Run: `npm test`
Expected: all tests pass (baseline + 6 new).

- [ ] **Step 6: Verify parse**

Run: `node --check src/index.js`
Expected: exit 0.

> No commit (no git repo yet). Confirm files are saved and both commands above pass.

---

### Task 3: `normalizeTable` + route builders through it

Add the whole-table normalizer and make `buildTableHtml` and the CSV builder consume pre-normalized cells so both APIs share one downstream path.

**Files:**
- Modify: `src/index.js` (add `normalizeTable`; update `buildTableHtml` and `exportTableCSV`)
- Modify: `test/normalize.test.mjs` (add `normalizeTable` + object-row CSV/HTML tests)

**Interfaces:**
- Consumes: `resolveCell(column, row, colIndex)` (Task 2).
- Produces: `export function normalizeTable(columns, rows)` → `Array<Array<{csv, html}>>`.
- Changes `buildTableHtml(columns, rows)`: it now calls `normalizeTable(columns, rows)` internally and reads each cell's `.html` (instead of calling `normalizeCell(row[i])`). Signature and output for classic input are unchanged.

- [ ] **Step 1: Write failing tests**

Add to `test/normalize.test.mjs`:

```js
import { normalizeTable } from '../src/index.js';
import { exportTableCSV } from '../src/index.js';

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
```

- [ ] **Step 2: Write the failing CSV test (DOM-stubbed, strong assertion)**

The CSV path calls `downloadBlob`, which needs `document`/`URL`/`Blob`. Stub those globals
and capture the blob's text so we can assert exact CSV output without a real DOM. Add to
`test/normalize.test.mjs`:

```js
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
```

- [ ] **Step 3: Run tests, verify they fail**

Run: `npm test`
Expected: FAIL — `normalizeTable` not exported; object rows not handled by `buildTableHtml`/CSV.

- [ ] **Step 4: Implement `normalizeTable`**

In `src/index.js`, immediately after `resolveCell`, add:

```js
/**
 * Normalize a whole table (columns + rows, either API shape) into rows of
 * { csv, html } cells. Rows may be arrays (classic) or plain objects (dynamic);
 * detection is per row inside resolveCell.
 * @param {Column[]} columns
 * @param {Array<Array<*>|Object>} rows
 * @returns {Array<Array<{csv:*, html:string}>>}
 */
export function normalizeTable(columns, rows) {
    return rows.map(row => columns.map((col, i) => resolveCell(col, row, i)));
}
```

- [ ] **Step 5: Update `buildTableHtml` to consume normalized cells**

In `src/index.js`, replace the body of `buildTableHtml`:

```js
export function buildTableHtml(columns, rows) {
    const thead = columns
        .map(c => '<th' + (c.align === 'end' ? ' class="num"' : '') + '>' + htmlEscape(c.title) + '</th>')
        .join('');
    let tbody = '';
    for (const row of rows) {
        tbody += '<tr>';
        for (let i = 0; i < row.length; i++) {
            const isNum = columns[i] && columns[i].align === 'end';
            tbody += '<td' + (isNum ? ' class="num"' : '') + '>' + normalizeCell(row[i]).html + '</td>';
        }
        tbody += '</tr>';
    }
    return '<table><thead><tr>' + thead + '</tr></thead><tbody>' + tbody + '</tbody></table>';
}
```

with:

```js
export function buildTableHtml(columns, rows) {
    const thead = columns
        .map(c => '<th' + (c.align === 'end' ? ' class="num"' : '') + '>' + htmlEscape(c.title) + '</th>')
        .join('');
    const normalized = normalizeTable(columns, rows);
    let tbody = '';
    for (const cells of normalized) {
        tbody += '<tr>';
        for (let i = 0; i < columns.length; i++) {
            const isNum = columns[i] && columns[i].align === 'end';
            const cell = cells[i] || { html: '' };
            tbody += '<td' + (isNum ? ' class="num"' : '') + '>' + cell.html + '</td>';
        }
        tbody += '</tr>';
    }
    return '<table><thead><tr>' + thead + '</tr></thead><tbody>' + tbody + '</tbody></table>';
}
```

- [ ] **Step 6: Update `exportTableCSV` to consume normalized cells**

In `src/index.js`, replace the body of `exportTableCSV`:

```js
export function exportTableCSV(filename, columns, rows) {
    const lines = [columns.map(c => csvEscape(c.title)).join(',')];
    for (const row of rows) {
        lines.push(row.map(cell => csvEscape(normalizeCell(cell).csv)).join(','));
    }
    // Prepend a BOM so Excel reads UTF-8 correctly.
    const csv = '﻿' + lines.join('\r\n');
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), filename);
}
```

with:

```js
export function exportTableCSV(filename, columns, rows) {
    const lines = [columns.map(c => csvEscape(c.title)).join(',')];
    for (const cells of normalizeTable(columns, rows)) {
        lines.push(cells.map(cell => csvEscape(cell.csv)).join(','));
    }
    // Prepend a BOM so Excel reads UTF-8 correctly.
    const csv = '﻿' + lines.join('\r\n');
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), filename);
}
```

> The BOM literal `'﻿'` above matches the existing file's intent. If the current
> source shows a literal BOM character instead, keep whichever the file already has —
> do not change the byte, only the row-iteration logic.

- [ ] **Step 7: Run tests, verify they pass**

Run: `npm test`
Expected: all tests pass (baseline + Task 2 + Task 3).

- [ ] **Step 8: Verify parse**

Run: `node --check src/index.js`
Expected: exit 0.

> No commit (no git repo yet). Confirm files are saved and the commands above pass.

---

### Task 4: `paginateRows` uses normalized rows (keep object rows measurable)

`paginateRows` calls `buildTableHtml(columns, rows)` for measuring and each page render. After Task 3, `buildTableHtml` re-normalizes internally, so object rows already flow through. This task verifies pagination is unaffected and that `downloadTablePDF` accepts object rows end-to-end at the string-building layer (the html2pdf call itself still needs a browser).

**Files:**
- Modify: `test/normalize.test.mjs` (add a guard test that `buildTableHtml` produces one `<tr>` per object row with correct cell count)

**Interfaces:**
- Consumes: `buildTableHtml` (Task 3). No new production code.

- [ ] **Step 1: Write a guard test**

Add to `test/normalize.test.mjs`:

```js
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
```

- [ ] **Step 2: Run tests, verify pass (no production change needed)**

Run: `npm test`
Expected: PASS. (If this fails, Task 3's `buildTableHtml` change is wrong — fix there.)

- [ ] **Step 3: Confirm `paginateRows` needs no edit**

Read `src/index.js` around `paginateRows`. Confirm it only calls `buildTableHtml(columns, rows)` and never indexes rows as arrays directly. Expected: it passes `rows` straight to `buildTableHtml` for the measuring host and receives back grouped `rows` (still the original row objects/arrays) which it re-renders via `buildTableHtml` per page. No change required.

- [ ] **Step 4: Verify parse**

Run: `node --check src/index.js`
Expected: exit 0.

> No commit (no git repo yet). Confirm the file is saved and the commands above pass.

---

### Task 5: Docs + example + memory update

Document the dynamic API and update the runnable example and the handoff memory.

**Files:**
- Modify: `README.md` (data model section + a "Dynamic columns" example)
- Modify: `examples/OutletLedgerExample.vue` (show keyed-column form alongside/instead of manual `exportRow`)
- Modify: `pdf-memory.md` (record the new decision)
- Modify: `index.html` (add a "Dynamic API" button group)
- Modify: `dev/main.js` (add a dynamic-API demo using raw object rows + keyed/formatted columns)

**Interfaces:** none (docs + playground only).

- [ ] **Step 1: Add a "Dynamic columns" subsection to README Data model**

In `README.md`, after the "Rows & cells" subsection (ends before `## API`), insert:

````markdown
### Dynamic columns (raw row objects)

Instead of pre-building each row as an array of cells, you can pass **raw row objects**
and let columns declare which property they read and how to format it. Detection is
per row: array rows use the classic path, object rows use the dynamic path.

```ts
type Column = {
  title: string;
  align?: 'end';
  key?: string;                                   // reads row[key]
  value?: (row) => any;                           // computed accessor; wins over key
  format?: (value, row) => string | { csv, html }; // string => escaped display text (csv keeps raw)
};
```

```js
const columns = [
  { key: 'created_at', title: 'Date',        format: v => formatDate(v) },
  { key: 'title',      title: 'Description' },
  { key: 'amount',     title: 'Amount',  align: 'end', format: v => ({ csv: v, html: currency(v) }) },
  { key: 'balance',    title: 'Balance', align: 'end', format: v => ({ csv: v, html: currency(v) }) },
];

// rows are your API objects, untouched:
await downloadTablePDF('Outlet Ledger', columns, rows, { pageBreak: true, repeatHeader: true });
```

A `format` returning a **plain string** is used as display text and HTML-escaped, while
the CSV keeps the raw value. Return `{ csv, html }` when you need trusted HTML markup in
the PDF (inserted un-escaped) with a different raw value in the CSV.
````

- [ ] **Step 2: Update the Vue example to the keyed form**

In `examples/OutletLedgerExample.vue`, replace the `exportColumns`/`exportRow`/`exportPDF`
methods so columns carry `key`/`format` and rows are passed raw. Read the current file
first, then set the script methods to:

```js
methods: {
  exportColumns() {
    return [
      { key: 'created_at', title: this.$t('Date'),        format: v => this.formatDate(v) },
      { key: 'title',      title: this.$t('Description') },
      { key: 'amount',     title: this.$t('Amount'),  align: 'end', format: v => ({ csv: v, html: this.currency(v) }) },
      { key: 'balance',    title: this.$t('Balance'), align: 'end', format: v => ({ csv: v, html: this.currency(v) }) },
    ];
  },
  async exportPDF() {
    await downloadTablePDF('Outlet Ledger', this.exportColumns(), this.rows, {
      storeName: this.storeName,
      filename: 'outlet-ledger',
      pageBreak: true,
      repeatHeader: true,
      pageNumbers: true,
      pageSize: 'a4',
    });
  },
},
```

Remove the now-unused `exportRow` method if present, and ensure `this.rows` is the raw
array of ledger objects.

- [ ] **Step 3: Add a "Dynamic API" group to the playground**

In `index.html`, immediately after the classic button group's closing (after the
`download-classic` button line), add:

```html
    <h2>Dynamic API (raw object rows + keyed columns)</h2>
    <button id="csv-dynamic">Export CSV</button>
    <button id="print-dynamic">Print-dialog PDF</button>
    <button id="download-dynamic">Download PDF</button>
```

In `dev/main.js`, append (after the classic handlers):

```js
// Dynamic API: raw object rows; columns declare key + optional format.
const dynColumns = [
  { key: 'date',    title: 'Date' },
  { key: 'desc',    title: 'Description' },
  { key: 'amount',  title: 'Amount',  align: 'end', format: v => ({ csv: v, html: currency(v) }) },
  { key: 'balance', title: 'Balance', align: 'end', format: v => ({ csv: v, html: currency(v) }) },
];
const dynRows = [
  { date: '2026-07-01', desc: 'Opening balance', amount: 0,   balance: 0 },
  { date: '2026-07-02', desc: 'Sale #1201',      amount: -50, balance: -50 },
  { date: '2026-07-03', desc: 'Payment',         amount: 50,  balance: 0 },
];

document.getElementById('csv-dynamic').onclick = () => {
  exportTableCSV('outlet-ledger.csv', dynColumns, dynRows);
  log('CSV exported (dynamic).');
};
document.getElementById('print-dynamic').onclick = () => {
  exportTablePDF('Outlet Ledger', dynColumns, dynRows, { storeName: 'My Store', summary: opts.summary });
  log('Print dialog opened (dynamic).');
};
document.getElementById('download-dynamic').onclick = async () => {
  log('Rendering PDF (dynamic)…');
  await downloadTablePDF('Outlet Ledger', dynColumns, dynRows, opts);
  log('PDF downloaded (dynamic).');
};
```

- [ ] **Step 4: Record the decision in pdf-memory.md**

In `pdf-memory.md`, under "Why the code is shaped this way", add a new numbered item:

```markdown
9. **Dynamic columns (added 2026-07-02).** Columns may carry `key` (reads `row[key]`),
   `value` (computed accessor, wins over `key`), and `format(value,row)` (returns a string
   → escaped display text with raw kept for CSV; or `{csv,html}` → trusted un-escaped html).
   Rows can therefore be plain objects. `resolveCell` + `normalizeTable` convert either the
   classic array-of-cells shape or the object shape into internal `{csv,html}` rows; detection
   is per row via `Array.isArray`. All three public functions route through `normalizeTable`,
   so classic callers are byte-identical. Pure functions are unit-tested under `node --test`
   (`test/normalize.test.mjs`); `npm test` runs them.
```

- [ ] **Step 5: Verify docs reference nothing broken**

Run: `node --check src/index.js` and `npm test`
Expected: parse OK; all tests pass.

> No commit (no git repo yet). Confirm all three files are saved and the commands above pass.

---

## Notes for the implementer

- **Not a git repo.** `git commit` steps will fail; if so, skip them and just confirm files are saved. Do not `git init` unless the user asks.
- **BOM in `exportTableCSV`.** The existing source may contain a literal BOM char rather than `'﻿'`. Preserve the existing byte; only change the loop that builds `lines`.
- **`htmlEscape` is already defined** near the top of `src/index.js` — `resolveCell` relies on it being in scope (same module, so no import needed).
- **Order matters:** `resolveCell` (Task 2) must be defined before `normalizeTable` (Task 3) uses it, and both before `buildTableHtml`/`exportTableCSV` reference them. Place `resolveCell` right after `normalizeCell`, and `normalizeTable` right after `resolveCell`.
