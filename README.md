# table-export-pdf

Small, dependency-light helpers to export a table (columns + array-of-rows) to:

- **CSV** — `exportTableCSV()`
- **PDF via the browser print dialog** — `exportTablePDF()` ("Save as PDF")
- **PDF as a direct download** — `downloadTablePDF()` (via `html2pdf.js`, no dialog)

It's **framework-agnostic** — it only touches the DOM, so it works in any browser
project (Vue, React, Svelte, plain JS). The PDF is rendered from real DOM, so any
script your page fonts support (Bengali, Arabic, currency symbols, …) renders correctly.

The direct-download PDF supports **repeating report + table headers**, **clean page
breaks** (no row split across pages), **page numbers**, and **selectable paper size** —
all opt-in.

---

## Install

```bash
npm install @bijon059/table-export-pdf
```

`downloadTablePDF()` additionally needs `html2pdf.js`. Everything else (CSV + print-dialog
PDF) has zero dependencies.

```bash
npm install html2pdf.js
```

> `html2pdf.js` is declared as an **optional peer dependency** — you only need it if you
> call `downloadTablePDF()`. It is lazy-imported on first use, so it won't bloat your
> bundle if you never call that function.

---

## Quick start

```js
import { downloadTablePDF, exportTablePDF, exportTableCSV } from '@bijon059/table-export-pdf';

// 1. Describe the columns (title is used verbatim — translate beforehand).
const columns = [
  { title: 'Date' },
  { title: 'Description' },
  { title: 'Amount', align: 'end' },   // 'end' => right-aligned
  { title: 'Balance', align: 'end' },
];

// 2. Rows: each row is an array of cells, one per column.
const rows = [
  ['2026-07-01', 'Opening balance', { csv: 0,    html: '$0.00'   }, { csv: 0,    html: '$0.00'   }],
  ['2026-07-02', 'Sale #1201',      { csv: -50,  html: '-$50.00' }, { csv: -50,  html: '-$50.00' }],
  ['2026-07-03', 'Payment',         { csv: 50,   html: '$50.00'  }, { csv: 0,    html: '$0.00'   }],
];

// 3a. Direct-download PDF with all the niceties:
await downloadTablePDF('Outlet Ledger', columns, rows, {
  storeName: 'My Store',
  filename: 'outlet-ledger',
  pageBreak: true,
  repeatHeader: true,
  pageNumbers: true,
  pageSize: 'a4',
});

// 3b. Or a CSV:
exportTableCSV('outlet-ledger.csv', columns, rows);
```

---

## Data model

Two building blocks are shared across every function.

### Columns

```ts
type Column = {
  title: string;      // header text, used as-is (translate before passing)
  align?: 'end';      // 'end' right-aligns the column (numbers / currency)
};
```

### Rows & cells

`rows` is an array of rows; each row is an array of **cells** aligned 1:1 to `columns`.

A cell is **either**:

- a **plain value** — used verbatim in CSV, HTML-escaped in the PDF; **or**
- a **formatted cell** object, for when the CSV and the PDF should differ:

```ts
type FormattedCell = {
  csv?: any;      // raw value written to the CSV (e.g. -50)
  html?: string;  // pre-formatted HTML shown in the PDF (e.g. "-$50.00")
};
```

Use the object form for currency/formatted columns so **spreadsheets keep the raw
number** while the **PDF shows the formatted string**:

```js
{ csv: -50, html: '-$50.00' }
```

> `html` is inserted as-is (not escaped) — it is your own trusted formatted markup.
> Plain string cells are always HTML-escaped.

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

If you omit `format` and the resolved raw value (via `key` or `value`) is itself an
object with a `csv` or `html` property, it's interpreted as a pre-formatted cell — its
`html` is inserted un-escaped/trusted. Use a `format` callback or a `value` accessor
that returns a primitive if you want a raw object treated as plain escaped text.

---

## API

### `exportTableCSV(filename, columns, rows)`

Builds a UTF-8 CSV (with BOM, so Excel reads it correctly) and downloads it.

| Param | Type | Notes |
|---|---|---|
| `filename` | `string` | Include the `.csv` extension. |
| `columns` | `Column[]` | |
| `rows` | `Cell[][]` | For formatted cells, only `csv` is used. |

Returns `void`.

---

### `exportTablePDF(title, columns, rows, options?)`

Opens the report in a hidden iframe and triggers the browser's **print dialog** (the
user picks "Save as PDF"). No extra dependency. Uses the page's own fonts and the
browser's pagination. `@page { margin: 0 }` suppresses the browser's injected
header/footer (date, url, page numbers).

| Param | Type | Notes |
|---|---|---|
| `title` | `string` | Report title (also the document `<title>`). |
| `columns` | `Column[]` | |
| `rows` | `Cell[][]` | |
| `options.storeName` | `string` | Shown centered at the top. |
| `options.summary` | `SummaryItem[]` | Bordered summary cards under the title (see below). |

Returns `void`.

> Choose this when you don't want to add `html2pdf.js`, or when you want the browser's
> native pagination and print preview. The downside: it depends on a user interacting
> with the print dialog, and you don't control page numbers.

---

### `downloadTablePDF(title, columns, rows, options?)` → `Promise<void>`

Renders the report **straight to a downloaded PDF file** (no dialog) using `html2pdf.js`
(`html2canvas` + `jsPDF`), lazy-imported on first call.

| Param | Type | Default | Notes |
|---|---|---|---|
| `title` | `string` | — | Report title. |
| `columns` | `Column[]` | — | |
| `rows` | `Cell[][]` | — | |
| `options.storeName` | `string` | `''` | Shown centered at the top of page 1. |
| `options.summary` | `SummaryItem[]` | `[]` | Bordered summary cards under the title (page 1). |
| `options.filename` | `string` | `title` | Download name; `.pdf` added automatically. Illegal filename chars are sanitized. |
| `options.pageBreak` | `boolean` | `false` | Paginate rows so **no row is split** across a page break. The **column header (`<thead>`) repeats on every page**. |
| `options.repeatHeader` | `boolean` | `false` | Also repeat the **store name + report title** on every page. **Implies `pageBreak`.** |
| `options.pageNumbers` | `boolean` | `false` | Stamp `N / total` (top-right) and `Page N of total` (bottom-center) on each page. |
| `options.pageSize` | `PageSize` | `'a4'` | `'a4'` \| `'letter'` \| `'legal'` \| `'a3'` \| `'a5'` \| `'tabloid'`. |

Returns a `Promise` that resolves once the file has been saved.

#### `SummaryItem`

```ts
type SummaryItem = {
  label: string;          // small uppercase label
  value: string | number; // may contain pre-formatted HTML
};
```

```js
summary: [
  { label: 'Total Debit',  value: '$1,200.00' },
  { label: 'Total Credit', value: '$800.00'   },
  { label: 'Net Balance',  value: '$400.00'   },
]
```

---

### `buildCSVString(columns, rows)` → `string`

Returns the exact CSV text `exportTableCSV` would download — including the UTF-8 BOM and
`\r\n` line endings — without triggering a download. Useful for previews, tests, or
server-side generation.

```js
import { buildCSVString } from '@bijon059/table-export-pdf';
const csv = buildCSVString(columns, rows); // "﻿Date,Amount\r\n…"
```

### `renderReportHTML(title, columns, rows, options?)` → `string`

Returns the report markup the PDF is built from (styles + header + optional summary +
one table with every row). Headless — no DOM required. `options` accepts `storeName` and
`summary` (same as the export functions). Note this is the single continuous report;
pagination, repeating headers, and page numbers are applied by `downloadTablePDF` at
render time, not present in this string.

```js
import { renderReportHTML } from '@bijon059/table-export-pdf';
document.querySelector('#preview').innerHTML =
  renderReportHTML('Outlet Ledger', columns, rows, { storeName: 'My Store' });
```

---

## Behavior notes & gotchas

- **All enhancement flags are opt-in.** With no flags, `downloadTablePDF` produces one
  continuous table (rows still kept intact via `page-break-inside: avoid`), the header
  only at the top, and no page numbers — the "classic" behavior. Turn on
  `pageBreak` / `repeatHeader` / `pageNumbers` / `pageSize` as needed.
- **`repeatHeader` implies `pageBreak`** — you cannot repeat the header without paginating.
- **Page numbers are Latin numerals only.** They're drawn by jsPDF's default font, which
  can't render non-Latin scripts. The rest of the document (table content, titles) is
  captured from the DOM and renders in whatever script your fonts support.
- **Where to format dates / currency:** format **before** calling the export — pass the
  already-formatted string (or a `{ csv, html }` cell). The library does no locale
  formatting itself; this keeps it framework-agnostic and lets you reuse your app's
  existing formatters (currency helper, date filter, i18n).
- **Column widths:** the PDF uses `table-layout: fixed`, so columns share the printable
  width evenly and long text wraps rather than pushing the last column off the page.
- **Don't position the source element.** (Internal detail — the library builds its own
  container.) If you adapt the code, note that `html2pdf` wraps the element in its own
  off-screen container; adding your own `position`/`left`/`z-index` yields a blank page.

---

## Vue 3 usage

The library is plain ESM — import it in any component. See
[`examples/OutletLedgerExample.vue`](examples/OutletLedgerExample.vue) for a complete
component. The essential part:

```js
import { downloadTablePDF } from '@bijon059/table-export-pdf';

export default {
  methods: {
    // Dynamic API: columns carry key/format, rows are passed raw (untouched).
    exportColumns() {
      return [
        { key: 'created_at', title: this.$t('Date'),        format: v => this.formatDate(v) },
        { key: 'title',      title: this.$t('Description') },
        { key: 'amount',     title: this.$t('Amount'),  align: 'end', format: v => ({ csv: v, html: this.currency(v) }) },
        { key: 'balance',    title: this.$t('Balance'), align: 'end', format: v => ({ csv: v, html: this.currency(v) }) },
      ];
    },

    exportSummary() {
      const total = this.rows.reduce((a, r) => a + (Number(r.amount) || 0), 0);
      return [
        { label: 'Rows', value: String(this.rows.length) },
        { label: 'Net', value: this.currency(total) },
      ];
    },

    async exportPDF() {
      await downloadTablePDF('Outlet Ledger', this.exportColumns(), this.rows, {
        storeName: this.storeName,
        filename: 'outlet-ledger',
        summary: this.exportSummary(),
        pageBreak: true,
        repeatHeader: true,
        pageNumbers: true,
        pageSize: 'a4',
      });
    },
  },
};
```

---

## License

MIT
