# Docs-style Interactive Playground Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat button-only dev playground with a module-wise, docs-style page where each section has editable data, a highlighted code snippet, real export buttons, and a byte-exact live preview — backed by two new headless string APIs in the library.

**Architecture:** Two additive pure functions (`buildCSVString`, `renderReportHTML`) are extracted from the existing export path in `src/index.js` (output byte-identical). The playground under `dev/` is decomposed into focused ES modules: pure data/mapping (`data.js`, `maplib.js`), DOM components (`datatable.js`, `preview.js`, `ui.js`), setup (`highlight.js`, `main.js`), and one file per doc section under `dev/sections/`. Pure logic is unit-tested under `node --test`; DOM modules are verified with `node --check` + `vite build` + a manual browser pass.

**Tech Stack:** Plain ESM JavaScript, Vite (dev server + lib build, already configured), `html2pdf.js` (optional peer dep, lazy-imported), `highlight.js` (new dev-only devDependency), Node built-in `node:test`.

## Global Constraints

- ESM (`"type":"module"`); NO new **runtime** dependencies. `highlight.js` is added as a **devDependency** only and must never appear in shipped `dist/`.
- The two new functions are **additive**; refactoring the export functions to use them must keep their output **byte-identical** — the existing CSV test must stay green.
- CSV output keeps the UTF-8 **BOM** (U+FEFF) and `\r\n` line endings.
- Library does **no** locale formatting itself; formatting stays in caller-supplied `format` callbacks.
- Everything under `dev/`, plus `index.html` and `vite.config.js`, is dev-only and must remain excluded from `npm pack` (only `dist/`, `src/`, `README.md` ship).
- **No git.** Not a git repo yet. Do NOT run `git init/add/commit`. Every task ends by saving files and running its verification commands — there are no commit steps.
- `node --check <file>` must pass for every JS file created/modified; `npm test` must pass; `npm run build` must exit 0.
- Light theme only; no dark-mode toggle. highlight.js `github` theme.

---

### Task 1: Library — `buildCSVString` + refactor `exportTableCSV`

Extract the CSV-string building into a public pure function; `exportTableCSV` becomes a thin download wrapper. Output must be byte-identical (BOM preserved).

**Files:**
- Modify: `src/index.js` (add `buildCSVString`; rewrite `exportTableCSV` body)
- Modify: `test/normalize.test.mjs` (add `buildCSVString` tests)

**Interfaces:**
- Consumes: existing internal `csvEscape(value)`, `normalizeTable(columns, rows)`, `downloadBlob(blob, filename)`.
- Produces: `export function buildCSVString(columns, rows)` → `string` (CSV text incl. leading U+FEFF BOM, rows joined with `\r\n`). `exportTableCSV(filename, columns, rows)` unchanged signature, now `downloadBlob(new Blob([buildCSVString(columns, rows)], {type:'text/csv;charset=utf-8;'}), filename)`.

- [ ] **Step 1: Write failing tests**

Add to `test/normalize.test.mjs`:

```js
import { buildCSVString } from '../src/index.js';

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
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm test`
Expected: FAIL — `buildCSVString` is not exported.

- [ ] **Step 3: Read the current `exportTableCSV`**

Read `src/index.js` and locate `exportTableCSV`. It currently looks like:

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

The `'﻿'` string literal contains a literal BOM byte. You will MOVE that exact line into `buildCSVString` unchanged — do not retype the BOM; copy the existing bytes.

- [ ] **Step 4: Implement `buildCSVString` and rewrite `exportTableCSV`**

Replace the whole `exportTableCSV` function with:

```js
/**
 * Build the exact CSV text for columns + rows (UTF-8 BOM + CRLF line endings).
 * Same output the library downloads; useful headless (preview, tests, SSR).
 * @param {Column[]} columns
 * @param {Array<Array<*>|Object>} rows
 * @returns {string}
 */
export function buildCSVString(columns, rows) {
    const lines = [columns.map(c => csvEscape(c.title)).join(',')];
    for (const cells of normalizeTable(columns, rows)) {
        lines.push(cells.map(cell => csvEscape(cell.csv)).join(','));
    }
    // Prepend a BOM so Excel reads UTF-8 correctly.
    return '﻿' + lines.join('\r\n');
}

/**
 * Build a CSV from columns + rows and trigger a download.
 * @param {string} filename   Download name (include the `.csv` extension).
 * @param {Column[]} columns
 * @param {Array<Array<*>|Object>} rows
 */
export function exportTableCSV(filename, columns, rows) {
    downloadBlob(new Blob([buildCSVString(columns, rows)], { type: 'text/csv;charset=utf-8;' }), filename);
}
```

> CRITICAL: the `'﻿'` in `buildCSVString` must be the SAME BOM byte moved from the old code — copy it, don't retype. Verify with the BOM test in Step 6.

- [ ] **Step 5: Run tests, verify pass**

Run: `npm test`
Expected: all pass, including the 3 new `buildCSVString` tests and the pre-existing `exportTableCSV` CSV test (byte-identical output).

- [ ] **Step 6: Verify parse**

Run: `node --check src/index.js`
Expected: exit 0.

> No commit (no git repo yet). Confirm files saved and both commands pass.

---

### Task 2: Library — `renderReportHTML` + refactor export functions

Expose the report-markup builder publicly and route the print + classic-download paths through it. Behavior unchanged.

**Files:**
- Modify: `src/index.js` (add `renderReportHTML`; use it in `exportTablePDF` and `downloadTablePDF`'s classic branch)
- Modify: `test/normalize.test.mjs` (add `renderReportHTML` tests)

**Interfaces:**
- Consumes: existing internal `buildReportHtml(title, columns, rows, storeName, summary)`.
- Produces: `export function renderReportHTML(title, columns, rows, options)` → `string`, where `options = { storeName?, summary? }` (normalized `storeName || ''`, `Array.isArray(summary) ? summary : []`). Returns the same markup `buildReportHtml` produces (style tag + header block + one table with all rows).

- [ ] **Step 1: Write failing tests**

Add to `test/normalize.test.mjs`:

```js
import { renderReportHTML } from '../src/index.js';

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
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm test`
Expected: FAIL — `renderReportHTML` not exported.

- [ ] **Step 3: Read the current builders + callers**

Read `src/index.js`. Confirm `buildReportHtml(title, columns, rows, storeName, summary)` exists (it returns `reportStyleTag() + buildHeaderBlock(...) + buildTableHtml(...)`). Note the two call sites:
- In `exportTablePDF`: `const content = buildReportHtml(title, columns, rows, storeName, summary);`
- In `downloadTablePDF` (the `else` / classic branch): `content = buildReportHtml(title, columns, rows, storeName, summary);`

- [ ] **Step 4: Add `renderReportHTML` and route callers through it**

Immediately AFTER the internal `buildReportHtml` function, add:

```js
/**
 * Return the report markup used by the PDF export path (style + header + summary +
 * one table with every row). Pure/headless — useful for previews, tests, SSR.
 * @param {string} title
 * @param {Column[]} columns
 * @param {Array<Array<*>|Object>} rows
 * @param {Object} [options]
 * @param {string} [options.storeName]
 * @param {SummaryItem[]} [options.summary]
 * @returns {string}
 */
export function renderReportHTML(title, columns, rows, options = {}) {
    const storeName = options.storeName || '';
    const summary = Array.isArray(options.summary) ? options.summary : [];
    return buildReportHtml(title, columns, rows, storeName, summary);
}
```

In `exportTablePDF`, replace:

```js
    const content = buildReportHtml(title, columns, rows, storeName, summary);
```

with:

```js
    const content = renderReportHTML(title, columns, rows, { storeName, summary });
```

In `downloadTablePDF`'s classic `else` branch, replace:

```js
        content = buildReportHtml(title, columns, rows, storeName, summary);
```

with:

```js
        content = renderReportHTML(title, columns, rows, { storeName, summary });
```

- [ ] **Step 5: Run tests, verify pass**

Run: `npm test`
Expected: all pass (new `renderReportHTML` tests + everything prior).

- [ ] **Step 6: Verify parse + build**

Run: `node --check src/index.js` (exit 0), then `npm run build` (exit 0; dist rebuilt with the two new exports).

> No commit (no git repo yet). Confirm files saved and all commands pass.

---

### Task 3: Playground foundations — devDep + `highlight.js`, `data.js`, `maplib.js`

Add the syntax-highlighter dependency and the pure playground modules (sample data + row/column mapping). `maplib.js` is fully unit-tested.

**Files:**
- Modify: `package.json` (add `highlight.js` to devDependencies)
- Create: `dev/highlight.js`
- Create: `dev/data.js`
- Create: `dev/maplib.js`
- Create: `test/playground.test.mjs`

**Interfaces:**
- Produces:
  - `dev/highlight.js`: `export function highlight(code) -> string` (HTML).
  - `dev/data.js`: `export const currency`, `export const ledgerColumns`, `export const ledgerRows`, `export const ledgerSummary`. Column objects: `{ key, title, align?, type?, format? }`.
  - `dev/maplib.js`: `export function libColumns(section) -> Column[]`, `export function libRows(section, rows) -> Array`.
    - `section.api === 'classic'`: `libColumns` returns `{ title, align }` per column; `libRows` maps each object row to a cell array where a column with `format` yields `format(row[key], row)` else `row[key]`.
    - otherwise (`'dynamic'`): `libColumns` returns `{ key, title, align, value, format }` per column; `libRows` returns the object rows unchanged.

- [ ] **Step 1: Add `highlight.js` devDependency**

In `package.json`, add `"highlight.js": "^11.9.0"` to the `devDependencies` object (alongside `vite` and `html2pdf.js`).

- [ ] **Step 2: Install it**

Run: `npm install`
Expected: exit 0; `highlight.js` added under `node_modules/`.

- [ ] **Step 3: Write failing tests for `maplib.js`**

Create `test/playground.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { libColumns, libRows } from '../dev/maplib.js';

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
```

- [ ] **Step 4: Run tests, verify they fail**

Run: `npm test`
Expected: FAIL — `../dev/maplib.js` does not exist.

- [ ] **Step 5: Create `dev/maplib.js`**

```js
// Pure mapping from a playground section's {key,...} columns + object rows to the
// library's column/row shapes. 'classic' => array-of-cells; 'dynamic' => objects as-is.

export function libColumns(section) {
    if (section.api === 'classic') {
        return section.columns.map(c => ({ title: c.title, align: c.align }));
    }
    return section.columns.map(c => ({
        key: c.key, title: c.title, align: c.align, value: c.value, format: c.format,
    }));
}

export function libRows(section, rows) {
    if (section.api === 'classic') {
        return rows.map(row => section.columns.map(c => (
            typeof c.format === 'function' ? c.format(row[c.key], row) : row[c.key]
        )));
    }
    return rows;
}
```

- [ ] **Step 6: Run tests, verify pass**

Run: `npm test`
Expected: all pass (4 new maplib tests + all prior).

- [ ] **Step 7: Create `dev/data.js`**

```js
// Shared sample data + column defs for the playground sections.

export const currency = (n) => (Number(n) < 0 ? '-$' : '$') + Math.abs(Number(n)).toFixed(2);

// Playground columns: { key, title, align?, type?, format? }
export const ledgerColumns = [
    { key: 'date', title: 'Date' },
    { key: 'desc', title: 'Description' },
    { key: 'amount', title: 'Amount', align: 'end', type: 'number', format: v => ({ csv: v, html: currency(v) }) },
    { key: 'balance', title: 'Balance', align: 'end', type: 'number', format: v => ({ csv: v, html: currency(v) }) },
];

export const ledgerRows = [
    { date: '2026-07-01', desc: 'Opening balance', amount: 0, balance: 0 },
    { date: '2026-07-02', desc: 'Sale #1201', amount: -50, balance: -50 },
    { date: '2026-07-03', desc: 'Payment', amount: 50, balance: 0 },
];

export const ledgerSummary = [
    { label: 'Total Debit', value: currency(50) },
    { label: 'Total Credit', value: currency(50) },
    { label: 'Net Balance', value: currency(0) },
];
```

- [ ] **Step 8: Create `dev/highlight.js`**

```js
// Syntax highlighting for the code snippets (dev-only; highlight.js is a devDependency).
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import 'highlight.js/styles/github.css';

hljs.registerLanguage('javascript', javascript);

export function highlight(code) {
    return hljs.highlight(code, { language: 'javascript' }).value;
}
```

- [ ] **Step 9: Verify parse**

Run: `node --check dev/maplib.js` and `node --check dev/data.js` and `node --check dev/highlight.js`
Expected: all exit 0. (Note: `node --check` validates syntax only; it does not resolve the `highlight.js` imports — that's fine, the browser/Vite resolves them.)

> No commit (no git repo yet). Confirm files saved and `npm test` + the checks pass.

---

### Task 4: Playground — editable data table (`dev/datatable.js`)

A small DOM component: renders rows as editable inputs, supports add/delete, notifies on change, and reads back typed rows.

**Files:**
- Create: `dev/datatable.js`

**Interfaces:**
- Consumes: nothing (pure DOM).
- Produces: `export function createDataTable(container, columns, initialRows)` → `{ getRows(): Object[], onChange(cb): void }`.
  - `columns` are playground columns (`{ key, title, type?, value? }`). **Only columns with a `key` are editable**; columns without a `key` (computed `value` columns) are ignored by the table — the library resolves them, and they appear in the live preview.
  - `getRows()` returns a fresh array of `{key: value}` objects holding only the keyed (source) fields; columns with `type === 'number'` are coerced via `Number(value || 0)`.
  - `onChange(cb)` registers a callback fired after any edit, add, or delete.

- [ ] **Step 1: Create `dev/datatable.js`**

```js
// Editable data table: inputs per source cell, add/delete rows, change notifications.
// Only columns with a `key` are editable (computed `value` columns are resolved by the
// library and shown in the preview, not here). getRows() returns a typed deep copy.

export function createDataTable(container, columns, initialRows) {
    const editable = columns.filter(c => c.key != null);
    const rows = initialRows.map(r => ({ ...r }));
    const listeners = [];
    const emit = () => listeners.forEach(cb => cb());

    function render() {
        container.innerHTML = '';
        const table = document.createElement('table');
        table.className = 'data-table';

        const thead = document.createElement('thead');
        const htr = document.createElement('tr');
        editable.forEach(c => {
            const th = document.createElement('th');
            th.textContent = c.title;
            htr.appendChild(th);
        });
        htr.appendChild(document.createElement('th')); // delete column
        thead.appendChild(htr);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        rows.forEach((row, ri) => {
            const tr = document.createElement('tr');
            editable.forEach(c => {
                const td = document.createElement('td');
                const input = document.createElement('input');
                input.type = c.type === 'number' ? 'number' : 'text';
                input.value = row[c.key] == null ? '' : row[c.key];
                input.addEventListener('input', () => { rows[ri][c.key] = input.value; emit(); });
                td.appendChild(input);
                tr.appendChild(td);
            });
            const dtd = document.createElement('td');
            const del = document.createElement('button');
            del.type = 'button';
            del.className = 'row-del';
            del.title = 'Delete row';
            del.textContent = '×';
            del.addEventListener('click', () => { rows.splice(ri, 1); render(); emit(); });
            dtd.appendChild(del);
            tr.appendChild(dtd);
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        container.appendChild(table);

        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'row-add';
        add.textContent = '+ Add row';
        add.addEventListener('click', () => {
            const nr = {};
            editable.forEach(c => { nr[c.key] = c.type === 'number' ? 0 : ''; });
            rows.push(nr);
            render();
            emit();
        });
        container.appendChild(add);
    }

    function getRows() {
        return rows.map(row => {
            const o = {};
            editable.forEach(c => {
                o[c.key] = c.type === 'number' ? Number(row[c.key] || 0) : row[c.key];
            });
            return o;
        });
    }

    function onChange(cb) { listeners.push(cb); }

    render();
    return { getRows, onChange };
}
```

- [ ] **Step 2: Verify parse**

Run: `node --check dev/datatable.js`
Expected: exit 0.

> No commit. Confirm file saved.

---

### Task 5: Playground — live preview (`dev/preview.js`)

Renders the byte-exact report markup and a CSV-as-table preview, updated on demand. The pure CSV→table helper is unit-tested.

**Files:**
- Create: `dev/preview.js`
- Modify: `test/playground.test.mjs` (add `csvToTable` tests)

**Interfaces:**
- Consumes: `renderReportHTML`, `buildCSVString` from `../src/index.js` (Tasks 1–2).
- Produces:
  - `export function createPreview(container, meta)` → `{ update(libColumns, libRows): void }`, where `meta = { title, storeName, summary }`.
  - `export function csvToTable(csv)` → `string` (HTML `<table>`), pure; strips a leading BOM, parses CRLF rows with quote handling, HTML-escapes cells.

- [ ] **Step 1: Write failing tests for `csvToTable`**

Add to `test/playground.test.mjs`:

```js
import { csvToTable } from '../dev/preview.js';

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
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm test`
Expected: FAIL — `../dev/preview.js` does not exist.

- [ ] **Step 3: Create `dev/preview.js`**

```js
// Live preview: renders the exact report markup and the CSV as a small table.
import { renderReportHTML, buildCSVString } from '../src/index.js';

function escapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function parseCsvLine(line) {
    const out = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (q) {
            if (ch === '"') {
                if (line[i + 1] === '"') { cur += '"'; i++; } else { q = false; }
            } else { cur += ch; }
        } else if (ch === ',') { out.push(cur); cur = ''; }
        else if (ch === '"') { q = true; }
        else { cur += ch; }
    }
    out.push(cur);
    return out;
}

/**
 * Render a CSV string (with BOM) into an HTML table for preview. Pure.
 * @param {string} csv
 * @returns {string}
 */
export function csvToTable(csv) {
    const text = csv.replace(/^﻿/, '');
    const rows = text.split('\r\n').map(parseCsvLine);
    if (!rows.length) return '<table class="csv-table"></table>';
    const head = rows[0].map(h => '<th>' + escapeHtml(h) + '</th>').join('');
    let body = '';
    for (let i = 1; i < rows.length; i++) {
        body += '<tr>' + rows[i].map(c => '<td>' + escapeHtml(c) + '</td>').join('') + '</tr>';
    }
    return '<table class="csv-table"><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table>';
}

/**
 * Create a live preview panel. `meta` = { title, storeName, summary }.
 */
export function createPreview(container, meta) {
    const cap = document.createElement('p');
    cap.className = 'preview-cap';
    cap.textContent = 'Preview shows the source report markup. Pagination, repeating headers and page numbers appear only in the downloaded PDF.';

    const reportWrap = document.createElement('div');
    reportWrap.className = 'preview-report pdf-export-root';

    const csvHead = document.createElement('h4');
    csvHead.className = 'preview-sub';
    csvHead.textContent = 'CSV';
    const csvWrap = document.createElement('div');
    csvWrap.className = 'preview-csv';

    container.appendChild(cap);
    container.appendChild(reportWrap);
    container.appendChild(csvHead);
    container.appendChild(csvWrap);

    function update(libColumns, libRows) {
        reportWrap.innerHTML = renderReportHTML(meta.title, libColumns, libRows, {
            storeName: meta.storeName, summary: meta.summary,
        });
        csvWrap.innerHTML = csvToTable(buildCSVString(libColumns, libRows));
    }

    return { update };
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npm test`
Expected: all pass (2 new `csvToTable` tests + all prior).

- [ ] **Step 5: Verify parse**

Run: `node --check dev/preview.js`
Expected: exit 0.

> No commit. Confirm files saved and tests pass.

---

### Task 6: Playground — section renderer (`dev/ui.js`)

Assembles a section's DOM (blurb, editable table, highlighted snippet + copy, action buttons, preview) and wires edits → live preview.

**Files:**
- Create: `dev/ui.js`

**Interfaces:**
- Consumes: `exportTableCSV`, `exportTablePDF`, `downloadTablePDF` from `../src/index.js`; `libColumns`, `libRows` from `./maplib.js`; `createDataTable` from `./datatable.js`; `createPreview` from `./preview.js`; `highlight` from `./highlight.js`.
- Produces: `export function renderSection(section)` → `HTMLElement` (`<section id=section.id>`). `section` shape per the spec: `{ id, title, blurb, columns, rows, options, api, actions, code, previewTitle, storeName?, summary? }`.

- [ ] **Step 1: Create `dev/ui.js`**

```js
// Renders one documentation section: blurb, editable data, code snippet, action
// buttons, and a live preview that updates as the data is edited.
import { exportTableCSV, exportTablePDF, downloadTablePDF } from '../src/index.js';
import { libColumns, libRows } from './maplib.js';
import { createDataTable } from './datatable.js';
import { createPreview } from './preview.js';
import { highlight } from './highlight.js';

export function renderSection(section) {
    const sec = document.createElement('section');
    sec.className = 'doc-section';
    sec.id = section.id;

    const h2 = document.createElement('h2');
    h2.textContent = section.title;
    sec.appendChild(h2);

    const blurb = document.createElement('p');
    blurb.className = 'blurb';
    blurb.textContent = section.blurb;
    sec.appendChild(blurb);

    // Editable data
    const dataWrap = document.createElement('div');
    dataWrap.className = 'data-wrap';
    sec.appendChild(dataWrap);
    const dt = createDataTable(dataWrap, section.columns, section.rows);

    // Code card (highlighted snippet + copy)
    const card = document.createElement('div');
    card.className = 'code-card';
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'copy-btn';
    copy.textContent = 'Copy';
    copy.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(section.code); copy.textContent = 'Copied'; }
        catch { copy.textContent = 'Copy failed'; }
        setTimeout(() => { copy.textContent = 'Copy'; }, 1200);
    });
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.className = 'language-javascript';
    code.innerHTML = highlight(section.code);
    pre.appendChild(code);
    card.appendChild(copy);
    card.appendChild(pre);
    sec.appendChild(card);

    // Action buttons + status
    const actions = document.createElement('div');
    actions.className = 'actions';
    const status = document.createElement('span');
    status.className = 'status';

    const cols = () => libColumns(section);
    const rws = () => libRows(section, dt.getRows());
    const mergedOptions = () => ({ storeName: section.storeName, summary: section.summary, ...section.options });

    const addBtn = (label, handler) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'action-btn';
        b.textContent = label;
        b.addEventListener('click', handler);
        actions.appendChild(b);
    };

    if (section.actions.includes('download')) {
        addBtn('Download PDF', async () => {
            status.textContent = 'Rendering PDF…';
            try {
                await downloadTablePDF(section.previewTitle, cols(), rws(), mergedOptions());
                status.textContent = 'PDF downloaded.';
            } catch (e) {
                status.textContent = 'PDF failed: ' + e.message;
            }
        });
    }
    if (section.actions.includes('print')) {
        addBtn('Print', () => {
            exportTablePDF(section.previewTitle, cols(), rws(), { storeName: section.storeName, summary: section.summary });
            status.textContent = 'Print dialog opened.';
        });
    }
    if (section.actions.includes('csv')) {
        addBtn('Export CSV', () => {
            exportTableCSV(section.id + '.csv', cols(), rws());
            status.textContent = 'CSV downloaded.';
        });
    }
    actions.appendChild(status);
    sec.appendChild(actions);

    // Live preview
    const prev = document.createElement('div');
    prev.className = 'preview';
    sec.appendChild(prev);
    const preview = createPreview(prev, { title: section.previewTitle, storeName: section.storeName, summary: section.summary });
    const refresh = () => preview.update(cols(), rws());
    dt.onChange(refresh);
    refresh();

    return sec;
}
```

- [ ] **Step 2: Verify parse**

Run: `node --check dev/ui.js`
Expected: exit 0.

> No commit. Confirm file saved.

---

### Task 7: Playground — shell, styles, sections, bootstrap

Wire everything into the page: the section data modules, the HTML shell, the docs styling, and `main.js` (nav + scrollspy + mount). This replaces the old `index.html` and `dev/main.js`.

**Files:**
- Create: `dev/sections/01-csv.js`, `02-print-pdf.js`, `03-download-pdf.js`, `04-dynamic-columns.js`, `05-options.js`, `06-preview-api.js`
- Create: `dev/styles.css`
- Modify (overwrite): `index.html`
- Modify (overwrite): `dev/main.js`

**Interfaces:**
- Consumes: `renderSection` from `./ui.js`; the shared data from `./data.js`.
- Produces: six section default-exports (shape per spec); a working single-page app served by `npm run dev`.

- [ ] **Step 1: Create `dev/sections/01-csv.js`** (classic array API demo)

```js
import { ledgerColumns, ledgerRows } from '../data.js';

export default {
    id: 'csv',
    title: 'CSV export',
    blurb: 'Build a UTF-8 CSV (with BOM, so Excel reads it correctly) from columns + rows and download it. This section uses the classic array-of-cells API.',
    api: 'classic',
    columns: ledgerColumns,
    rows: ledgerRows,
    options: {},
    actions: ['csv'],
    previewTitle: 'Outlet Ledger',
    storeName: 'My Store',
    code: `import { exportTableCSV } from 'table-export-pdf';

const columns = [
  { title: 'Date' },
  { title: 'Description' },
  { title: 'Amount', align: 'end' },
  { title: 'Balance', align: 'end' },
];
// Classic rows: arrays of cells; use { csv, html } to keep raw numbers in CSV.
const rows = [
  ['2026-07-02', 'Sale #1201', { csv: -50, html: '-$50.00' }, { csv: -50, html: '-$50.00' }],
];

exportTableCSV('outlet-ledger.csv', columns, rows);`,
};
```

- [ ] **Step 2: Create `dev/sections/02-print-pdf.js`** (print dialog, dynamic API)

```js
import { ledgerColumns, ledgerRows } from '../data.js';

export default {
    id: 'print-pdf',
    title: 'Print-dialog PDF',
    blurb: 'Open the report in a hidden iframe and trigger the browser print dialog (choose “Save as PDF”). Zero extra dependency; uses the page fonts.',
    api: 'dynamic',
    columns: ledgerColumns,
    rows: ledgerRows,
    options: {},
    actions: ['print'],
    previewTitle: 'Outlet Ledger',
    storeName: 'My Store',
    code: `import { exportTablePDF } from 'table-export-pdf';

const columns = [
  { key: 'date', title: 'Date' },
  { key: 'desc', title: 'Description' },
  { key: 'amount', title: 'Amount', align: 'end', format: v => ({ csv: v, html: currency(v) }) },
  { key: 'balance', title: 'Balance', align: 'end', format: v => ({ csv: v, html: currency(v) }) },
];

exportTablePDF('Outlet Ledger', columns, rows, { storeName: 'My Store' });`,
};
```

- [ ] **Step 3: Create `dev/sections/03-download-pdf.js`** (direct download + page options)

```js
import { ledgerColumns, ledgerRows } from '../data.js';

export default {
    id: 'download-pdf',
    title: 'Download PDF',
    blurb: 'Render straight to a downloaded PDF via html2pdf.js — with clean page breaks, a repeating header, and page numbers.',
    api: 'dynamic',
    columns: ledgerColumns,
    rows: ledgerRows,
    options: { filename: 'outlet-ledger', pageBreak: true, repeatHeader: true, pageNumbers: true, pageSize: 'a4' },
    actions: ['download'],
    previewTitle: 'Outlet Ledger',
    storeName: 'My Store',
    code: `import { downloadTablePDF } from 'table-export-pdf';

await downloadTablePDF('Outlet Ledger', columns, rows, {
  storeName: 'My Store',
  filename: 'outlet-ledger',
  pageBreak: true,
  repeatHeader: true,
  pageNumbers: true,
  pageSize: 'a4',
});`,
};
```

- [ ] **Step 4: Create `dev/sections/04-dynamic-columns.js`** (value accessor + string format)

```js
import { currency } from '../data.js';

export default {
    id: 'dynamic-columns',
    title: 'Dynamic columns',
    blurb: 'Pass raw row objects and let columns declare which property to read (key), a computed accessor (value), and how to format it (format). A format returning a string is HTML-escaped; return { csv, html } for trusted markup.',
    api: 'dynamic',
    columns: [
        { key: 'sku', title: 'SKU' },
        { key: 'qty', title: 'Qty', align: 'end', type: 'number' },
        { key: 'price', title: 'Price', align: 'end', type: 'number', format: v => currency(v) },
        { value: r => Number(r.qty) * Number(r.price), title: 'Line total', align: 'end', format: v => ({ csv: v, html: currency(v) }) },
    ],
    rows: [
        { sku: 'A-100', qty: 2, price: 9.5 },
        { sku: 'B-200', qty: 1, price: 19.0 },
    ],
    options: { pageBreak: true, pageNumbers: true },
    actions: ['csv', 'download'],
    previewTitle: 'Line Items',
    storeName: 'My Store',
    code: `import { downloadTablePDF } from 'table-export-pdf';

const columns = [
  { key: 'sku', title: 'SKU' },
  { key: 'qty', title: 'Qty', align: 'end' },
  { key: 'price', title: 'Price', align: 'end', format: v => currency(v) },
  // computed column via value(); format returns { csv, html } to keep the raw number in CSV:
  { value: r => r.qty * r.price, title: 'Line total', align: 'end', format: v => ({ csv: v, html: currency(v) }) },
];

// rows are your raw objects, untouched:
await downloadTablePDF('Line Items', columns, rows, { pageBreak: true, pageNumbers: true });`,
};
```

- [ ] **Step 5: Create `dev/sections/05-options.js`** (summary + page size)

```js
import { ledgerColumns, ledgerRows, ledgerSummary } from '../data.js';

export default {
    id: 'options',
    title: 'Options showcase',
    blurb: 'Summary cards under the title, plus paper size and pagination flags. Edit the data and download to see the summary and page numbering in the file.',
    api: 'dynamic',
    columns: ledgerColumns,
    rows: ledgerRows,
    options: { filename: 'ledger-letter', pageBreak: true, repeatHeader: true, pageNumbers: true, pageSize: 'letter' },
    actions: ['csv', 'print', 'download'],
    previewTitle: 'Outlet Ledger',
    storeName: 'My Store',
    summary: ledgerSummary,
    code: `import { downloadTablePDF } from 'table-export-pdf';

await downloadTablePDF('Outlet Ledger', columns, rows, {
  storeName: 'My Store',
  summary: [
    { label: 'Total Debit',  value: '$50.00' },
    { label: 'Total Credit', value: '$50.00' },
    { label: 'Net Balance',  value: '$0.00'  },
  ],
  pageBreak: true,
  repeatHeader: true,
  pageNumbers: true,
  pageSize: 'letter',
});`,
};
```

- [ ] **Step 6: Create `dev/sections/06-preview-api.js`** (headless string APIs)

```js
import { ledgerColumns, ledgerRows } from '../data.js';

export default {
    id: 'preview-api',
    title: 'Headless preview API',
    blurb: 'renderReportHTML() and buildCSVString() return the exact report markup and CSV text without touching the DOM — handy for previews (like this page), tests, or server-side rendering.',
    api: 'dynamic',
    columns: ledgerColumns,
    rows: ledgerRows,
    options: {},
    actions: ['csv', 'download'],
    previewTitle: 'Outlet Ledger',
    storeName: 'My Store',
    code: `import { renderReportHTML, buildCSVString } from 'table-export-pdf';

// Exact report markup the PDF is built from:
const html = renderReportHTML('Outlet Ledger', columns, rows, { storeName: 'My Store' });
document.querySelector('#preview').innerHTML = html;

// Exact CSV text (with BOM):
const csv = buildCSVString(columns, rows);`,
};
```

- [ ] **Step 7: Create `dev/styles.css`**

```css
:root {
  --accent: #2563eb;
  --bg: #ffffff;
  --fg: #1f2933;
  --muted: #6b7280;
  --border: #e5e7eb;
  --card: #f9fafb;
  --sidebar-w: 240px;
  --font-sans: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
* { box-sizing: border-box; }
body { margin: 0; font-family: var(--font-sans); color: var(--fg); background: var(--bg); }

.sidebar {
  position: fixed; top: 0; left: 0; bottom: 0; width: var(--sidebar-w);
  border-right: 1px solid var(--border); padding: 20px 16px; overflow-y: auto;
  display: flex; flex-direction: column; gap: 14px;
}
.sidebar .brand { display: flex; align-items: baseline; gap: 8px; }
.sidebar .brand strong { font-size: 16px; }
.sidebar .brand .ver { color: var(--muted); font-size: 12px; }
.sidebar nav { display: flex; flex-direction: column; gap: 2px; }
.sidebar nav a { color: var(--fg); text-decoration: none; padding: 6px 10px; border-radius: 6px; font-size: 14px; }
.sidebar nav a:hover { background: var(--card); }
.sidebar nav a.active { background: var(--accent); color: #fff; }
.sidebar .links { margin-top: auto; font-size: 13px; color: var(--muted); }
.sidebar .links a { color: var(--accent); text-decoration: none; }
.nav-toggle { display: none; }

main { margin-left: var(--sidebar-w); padding: 32px 28px; max-width: 820px; }
.doc-section { padding: 20px 0 40px; border-bottom: 1px solid var(--border); scroll-margin-top: 20px; }
.doc-section h2 { font-size: 22px; margin: 0 0 6px; }
.blurb { color: var(--muted); margin: 0 0 16px; line-height: 1.5; }

.data-wrap { margin: 0 0 16px; }
table.data-table { border-collapse: collapse; width: 100%; }
table.data-table th, table.data-table td { border: 1px solid var(--border); padding: 4px; text-align: left; }
table.data-table th { background: var(--card); font-size: 12px; }
table.data-table input { width: 100%; border: 1px solid transparent; padding: 4px 6px; font: inherit; background: transparent; }
table.data-table input:focus { border-color: var(--accent); outline: none; border-radius: 4px; }
.row-del { border: none; background: none; color: #b91c1c; cursor: pointer; font-size: 16px; line-height: 1; }
.row-add { margin-top: 8px; border: 1px dashed var(--border); background: var(--card); padding: 6px 12px; border-radius: 6px; cursor: pointer; font: inherit; color: var(--muted); }

.code-card { position: relative; margin: 0 0 16px; }
.code-card pre { margin: 0; background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 16px; overflow: auto; }
.code-card code { font-family: var(--font-mono); font-size: 13px; line-height: 1.5; }
.copy-btn { position: absolute; top: 8px; right: 8px; border: 1px solid var(--border); background: #fff; border-radius: 6px; padding: 4px 10px; font-size: 12px; cursor: pointer; }

.actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 0 0 16px; }
.action-btn { border: none; background: var(--accent); color: #fff; padding: 8px 14px; border-radius: 6px; cursor: pointer; font: inherit; }
.action-btn:hover { filter: brightness(1.05); }
.status { color: var(--muted); font-size: 13px; }

.preview { border: 1px solid var(--border); border-radius: 8px; padding: 16px; background: #fff; }
.preview-cap { margin: 0 0 12px; font-size: 12px; color: var(--muted); }
.preview-sub { margin: 16px 0 6px; font-size: 13px; color: var(--muted); }
.preview-report { border: 1px solid var(--border); border-radius: 6px; padding: 12px; }
table.csv-table { border-collapse: collapse; width: 100%; font-size: 12px; }
table.csv-table th, table.csv-table td { border: 1px solid var(--border); padding: 4px 8px; text-align: left; }
table.csv-table th { background: var(--card); }

@media (max-width: 800px) {
  .sidebar { position: sticky; width: auto; inset: auto; border-right: none; border-bottom: 1px solid var(--border); flex-direction: row; align-items: center; flex-wrap: wrap; }
  .sidebar nav { display: none; width: 100%; }
  body.nav-open .sidebar nav { display: flex; }
  .sidebar .links { margin: 0; }
  .nav-toggle { display: inline-block; margin-left: auto; border: 1px solid var(--border); background: #fff; border-radius: 6px; padding: 4px 10px; cursor: pointer; }
  main { margin-left: 0; padding: 20px 16px; }
}
```

- [ ] **Step 8: Overwrite `index.html`**

Replace the entire file with:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>table-export-pdf — docs & playground</title>
  </head>
  <body>
    <aside class="sidebar">
      <div class="brand"><strong>table-export-pdf</strong><span class="ver">v1.0.0</span></div>
      <button id="nav-toggle" class="nav-toggle" type="button" aria-label="Toggle navigation">☰</button>
      <nav id="nav"></nav>
      <div class="links">
        <a href="https://www.npmjs.com/package/table-export-pdf" target="_blank" rel="noopener">npm</a>
        ·
        <a href="https://github.com/" target="_blank" rel="noopener">README</a>
      </div>
    </aside>
    <main id="content"></main>
    <script type="module" src="/dev/main.js"></script>
  </body>
</html>
```

- [ ] **Step 9: Overwrite `dev/main.js`**

Replace the entire file with:

```js
import './styles.css';
import { renderSection } from './ui.js';
import csv from './sections/01-csv.js';
import printPdf from './sections/02-print-pdf.js';
import downloadPdf from './sections/03-download-pdf.js';
import dynamicCols from './sections/04-dynamic-columns.js';
import options from './sections/05-options.js';
import previewApi from './sections/06-preview-api.js';

const sections = [csv, printPdf, downloadPdf, dynamicCols, options, previewApi];

const nav = document.getElementById('nav');
const content = document.getElementById('content');

const links = {};
sections.forEach(s => {
    const a = document.createElement('a');
    a.href = '#' + s.id;
    a.textContent = s.title;
    a.dataset.id = s.id;
    nav.appendChild(a);
    links[s.id] = a;
    content.appendChild(renderSection(s));
});

// Scrollspy: highlight the nav link of the section currently in view.
const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
        if (e.isIntersecting) {
            Object.values(links).forEach(l => l.classList.remove('active'));
            if (links[e.target.id]) links[e.target.id].classList.add('active');
        }
    });
}, { rootMargin: '-40% 0px -55% 0px' });
sections.forEach(s => {
    const el = document.getElementById(s.id);
    if (el) obs.observe(el);
});

// Mobile nav toggle.
const toggle = document.getElementById('nav-toggle');
if (toggle) toggle.addEventListener('click', () => document.body.classList.toggle('nav-open'));
```

- [ ] **Step 10: Verify parse of all new JS**

Run: `node --check dev/main.js` and `node --check dev/sections/01-csv.js` and `node --check dev/sections/02-print-pdf.js` and `node --check dev/sections/03-download-pdf.js` and `node --check dev/sections/04-dynamic-columns.js` and `node --check dev/sections/05-options.js` and `node --check dev/sections/06-preview-api.js`
Expected: all exit 0.

- [ ] **Step 11: Verify tests + library build still clean**

Run: `npm test` (all pass), then `npm run build` (exit 0; the lib build entry is still `src/index.js` — the `dev/` app does not affect it).

- [ ] **Step 12: Manual browser pass**

Run: `npm run dev` (starts Vite). In the browser: confirm the sidebar lists all six sections with scrollspy; each section shows the editable table, highlighted snippet + Copy, action buttons, and a preview; editing a cell or adding/removing a row updates the preview; and clicking Export CSV / Print / Download PDF performs the real export. Stop the dev server when done (Ctrl+C).

> No commit (no git repo yet). Confirm every command above passed and the manual pass looked correct.

---

### Task 8: Docs — README API entries + memory update

Document the two new public functions and record the playground structure.

**Files:**
- Modify: `README.md` (API section: `buildCSVString`, `renderReportHTML`)
- Modify: `pdf-memory.md`

**Interfaces:** none (docs only).

- [ ] **Step 1: Add README API entries**

In `README.md`, in the `## API` section (after the `downloadTablePDF` entry, before `## Behavior notes`), add:

````markdown
### `buildCSVString(columns, rows)` → `string`

Returns the exact CSV text `exportTableCSV` would download — including the UTF-8 BOM and
`\r\n` line endings — without triggering a download. Useful for previews, tests, or
server-side generation.

```js
import { buildCSVString } from 'table-export-pdf';
const csv = buildCSVString(columns, rows); // "﻿Date,Amount\r\n…"
```

### `renderReportHTML(title, columns, rows, options?)` → `string`

Returns the report markup the PDF is built from (styles + header + optional summary +
one table with every row). Headless — no DOM required. `options` accepts `storeName` and
`summary` (same as the export functions). Note this is the single continuous report;
pagination, repeating headers, and page numbers are applied by `downloadTablePDF` at
render time, not present in this string.

```js
import { renderReportHTML } from 'table-export-pdf';
document.querySelector('#preview').innerHTML =
  renderReportHTML('Outlet Ledger', columns, rows, { storeName: 'My Store' });
```
````

- [ ] **Step 2: Update `pdf-memory.md`**

In `pdf-memory.md`, add to the Public API list the two new functions:

```markdown
- `buildCSVString(columns, rows)` → string — exact CSV text (BOM + CRLF); `exportTableCSV` wraps it. Zero deps.
- `renderReportHTML(title, columns, rows, options?)` → string — exact report markup (single continuous
  report) used by the PDF path; `exportTablePDF` and `downloadTablePDF`'s classic branch wrap it. Zero deps.
```

And update the folder-layout block to include the docs-style playground:

```markdown
### Folder layout (dev playground, dev-only — not shipped)

dev/
  main.js         # bootstrap: sidebar nav + scrollspy, mounts sections
  ui.js           # renderSection(): blurb + editable table + snippet + buttons + preview
  datatable.js    # editable data-table component (add/remove/edit rows)
  preview.js      # live preview via renderReportHTML + buildCSVString (+ pure csvToTable)
  maplib.js       # pure section->library column/row mapping (classic vs dynamic)
  highlight.js    # highlight.js setup (devDependency)
  data.js         # shared sample datasets
  styles.css      # docs styling
  sections/01-csv … 06-preview-api.js   # one file per documented capability
index.html        # docs shell (sidebar + content)
```

Also note in the Status section: `test/playground.test.mjs` unit-tests `maplib` + `csvToTable`;
`highlight.js` is a devDependency; the playground is served by `npm run dev`.

- [ ] **Step 3: Verify nothing broke**

Run: `npm test` (all pass) and `node --check src/index.js` (exit 0).

> No commit (no git repo yet). Confirm all three doc files are saved and commands pass.

---

## Notes for the implementer

- **Not a git repo.** Skip all commits; just save files and run the verification commands.
- **BOM (Task 1):** the `'﻿'` literal must be the exact BOM byte moved from the old `exportTableCSV` — copy it, don't retype. The `codePointAt(0) === 0xfeff` test guards this.
- **`node --check` limits:** it validates syntax only and does NOT resolve imports, so `import 'highlight.js/...'` and `import './styles.css'` pass `--check` even though only Vite/the browser can resolve them. Real resolution is confirmed by the `npm run dev` manual pass.
- **Lib build isolation:** `vite build` uses `src/index.js` as its lib entry; the `dev/` app and `index.html` are dev-only and don't affect `dist/` or `npm pack`. Do not add `dev/` to `package.json` `files`.
- **Ordering:** Tasks 1–2 (library) must precede Task 5 (`preview.js` imports the new functions) and Task 6/7. Task 3 (maplib/data/highlight) precedes Task 6/7. Task 4 precedes Task 6.
