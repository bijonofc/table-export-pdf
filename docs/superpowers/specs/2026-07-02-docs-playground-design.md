# Docs-style interactive playground

**Date:** 2026-07-02
**Status:** Approved (design)

## Problem

The current dev playground ([index.html](../../../index.html) + [dev/main.js](../../../dev/main.js))
is a single page with two flat button groups. It does not read like the docs of a modern
library and gives no way to see or edit the data being exported.

We want a **module-wise, docs-style** page: one section per feature, each with an editable
data table, a syntax-highlighted code snippet, the real export buttons, and a live preview of
the output.

## Goals

- Restructure the playground into a documentation-style single page with a sidebar and one
  section per library capability.
- Each section lets the user **edit / add / remove data rows** and then **Download PDF /
  Print / Export CSV** the current data with the real library functions.
- Each section shows a **syntax-highlighted, copy-able code snippet** for its API call.
- Each section shows a **live, byte-exact preview** of the output (report HTML + CSV table).
- Add two small, well-tested **headless string APIs** to the library so the preview is exact
  and the library gains reusable non-DOM output.

## Non-goals

- No documentation-site generator (VitePress etc.). This stays a Vite-served single page.
- No live-editable *code* editor (CodeMirror/Monaco). Snippets are static/illustrative; the
  editable **data** is what drives exports and preview.
- No dark-mode toggle (light theme only for now).
- No headless-browser test suite for the playground (manual browser pass + `node --check`).
- No change to export behavior, pagination, page numbers, or the classic/dynamic column
  semantics — only additive headless APIs and a refactor that keeps existing output identical.

## Library additions (public, headless)

Two pure functions added to `src/index.js`, exported, no DOM dependency:

- `buildCSVString(columns, rows)` → `string`
  Returns the exact CSV text the library downloads, **including the UTF-8 BOM** and `\r\n`
  line endings. `exportTableCSV` is refactored to
  `downloadBlob(new Blob([buildCSVString(columns, rows)], { type: 'text/csv;charset=utf-8;' }), filename)`.
  Output bytes must be identical to today (the existing CSV test must stay green).

- `renderReportHTML(title, columns, rows, options)` → `string`
  Returns the report markup used by the export path: `reportStyleTag() + buildHeaderBlock(title,
  storeName, summary) + buildTableHtml(columns, rows)` — i.e. the current internal
  `buildReportHtml(title, columns, rows, storeName, summary)`.
  `options` accepts `{ storeName?, summary? }` (same normalization as the export functions:
  `storeName || ''`, `Array.isArray(summary) ? summary : []`).
  `exportTablePDF` is refactored so its `content` is `renderReportHTML(title, columns, rows,
  { storeName, summary })` (behavior unchanged). `downloadTablePDF`'s **classic** (non-pagebreak)
  branch likewise uses `renderReportHTML`; its paginated branch is unchanged.

Both functions are documented with JSDoc and exercised by unit tests under `npm test`.

## Playground architecture (module-wise)

```
index.html                # shell: <aside> sidebar + <main id="content"> mount
dev/
  styles.css              # docs styling (sidebar, sections, cards, preview, editable table)
  highlight.js            # highlight.js setup + theme import; exports highlight(code) -> html
  data.js                 # sample datasets + column defs per section
  datatable.js            # editable data-table component
  preview.js              # live preview renderer (report HTML + CSV table)
  ui.js                   # renderSection(section) -> DOM; wires edits -> live preview + buttons
  main.js                 # bootstrap: import sections, build nav + scrollspy, mount each
  sections/
    01-csv.js
    02-print-pdf.js
    03-download-pdf.js
    04-dynamic-columns.js
    05-options.js
    06-preview-api.js
```

`highlight.js` (the npm package) is added as a **devDependency** (dev-only; never shipped in
`dist/`). Everything under `dev/` is dev-only and already excluded from `npm pack`.

### Section module shape

Each `dev/sections/NN-*.js` default-exports a plain object:

```js
export default {
  id: 'csv',                       // anchor id + nav key
  title: 'CSV export',
  blurb: 'Build a UTF-8 CSV (with BOM) from columns + rows and download it.',
  columns,                         // Column[] (see below), drives the editable table + export
  rows,                            // initial sample rows as {key: value} objects
  options: {},                     // export options for this section (e.g. { pageBreak:true, pageNumbers:true })
  api: 'dynamic' | 'classic',      // how rows map to the export call (see Data model)
  actions: ['csv','print','download'],  // which buttons to show
  code: `...`,                     // illustrative highlighted snippet (string)
  previewTitle: 'Outlet Ledger',   // report title used for preview + exports
  storeName: 'My Store',           // optional
  summary: [ /* {label,value} */ ],// optional (for the options/summary section)
};
```

### Column definition (playground-side)

```ts
type PlaygroundColumn = {
  key: string;              // property on the row object
  title: string;            // header
  align?: 'end';
  type?: 'number' | 'text'; // editable input type; 'number' parses to Number on read (default 'text')
  format?: (v, row) => string | { csv, html };  // passed through to the library for dynamic api
};
```

### Editable data table (`datatable.js`)

- Renders a `<table>`: one header per column (`title`), one editable `<input>` per cell
  (`type="number"` when `column.type === 'number'`, else `text`), a per-row delete button, and
  an **Add row** button below.
- Holds the rows as an array of `{key: value}` objects in memory. Reading returns a **deep copy**
  with `number`-typed columns coerced via `Number(value)`.
- Exposes: `mount(container, columns, initialRows)`, `getRows()`, and an `onChange(cb)`
  subscription fired on any edit/add/delete.
- Adding a row appends an object with empty/zero values for each column.

### Mapping edited rows to the export call (`ui.js`)

The library is called with the section's `columns` mapped to **library** columns and the current
rows mapped per `section.api`:

- **`api: 'dynamic'`** — library columns keep `{ key, title, align, format }`; rows (objects) are
  passed straight through. This exercises the object-row / keyed-column path.
- **`api: 'classic'`** — library columns are `{ title, align }` only; each edited row object is
  mapped to a **cell array** in column order, where a column with a `format` produces
  `format(row[key], row)` (a `{csv,html}` cell) and others pass `row[key]` verbatim. This
  exercises the classic array-of-cells path. The section's `code` snippet shows this same
  mapping so the displayed code matches what runs.

### Action buttons (`ui.js`)

Rendered per `section.actions`, each calls the real library function with the mapped
`(columns, rows)`, `previewTitle`, and merged options (`{ storeName, summary, ...section.options }`):

- `csv` → `exportTableCSV('<id>.csv', libColumns, libRows)`
- `print` → `exportTablePDF(previewTitle, libColumns, libRows, { storeName, summary })`
- `download` → `downloadTablePDF(previewTitle, libColumns, libRows, mergedOptions)`

A small status line reports the action taken (e.g. "CSV downloaded", "Rendering PDF…").



### Live preview (`preview.js`)

- On mount and on every `datatable` change, renders:
  - **Report preview**: `renderReportHTML(previewTitle, libColumns, libRows, { storeName, summary })`
    injected into a bordered "page" element.
  - **CSV preview**: `buildCSVString(libColumns, libRows)` parsed into a small rendered `<table>`.
- A caption notes: the report preview shows the **source markup** (single continuous report);
  pagination, repeating headers, and page numbers appear only in the downloaded PDF.

### Code snippets & highlighting (`highlight.js`)

- Each section's `code` string is rendered into a `<pre><code>` block, highlighted with
  highlight.js (`javascript`), with a **Copy** button that writes the raw code to the clipboard
  and shows a transient "Copied" state.
- Snippets are illustrative and reference `columns` / `rows` so they read coherently against the
  section's editable data. They are not executed.

### Shell & navigation (`index.html` + `main.js`)

- `index.html`: `<aside class="sidebar">` (library name + version, `<nav>` links, npm + README
  links) and `<main id="content">`. Loads `/dev/main.js` (module) and `/dev/styles.css`.
- `main.js`: imports all section modules in order, builds the sidebar `<nav>` from their
  `{id,title}`, appends each rendered section to `#content`, and wires **scrollspy** (highlight
  the nav link for the section currently in view via `IntersectionObserver`). Clicking a nav link
  smooth-scrolls to the section anchor.

## Aesthetic

- Fixed left sidebar (~240px), scrollable main column, max content width ~820px.
- System sans stack for prose; monospace for code. One restrained accent color for links,
  active nav item, and primary buttons.
- Generous vertical rhythm; cards with subtle borders/rounding for code + preview.
- Responsive: below ~800px the sidebar becomes a sticky top bar with a hamburger toggle that
  shows/hides the nav; content is single-column full width.
- highlight.js `github` theme (light).

## Testing

- **Library unit tests** (`test/` under `npm test`, no DOM):
  - `buildCSVString`: exact string incl. BOM and `\r\n`; object rows and classic array rows;
    quoting of commas/quotes/newlines.
  - `renderReportHTML`: output contains the store name, title, each summary label/value, the
    column headers, and a `<td>` per cell; respects `align:'end'` → `class="num"`.
  - `exportTableCSV` existing test stays green (byte-identical after refactor).
- **Playground**: `node --check` on each `dev/*.js` and `dev/sections/*.js`; `npm run build`
  exits 0; manual browser pass (`npm run dev`) confirming edit → preview updates and each button
  performs its export.

## Docs / memory

- Update `README.md` to document `buildCSVString` and `renderReportHTML` in the API section.
- Update `pdf-memory.md`: note the two headless APIs and the docs-style playground structure
  under `dev/` (folder layout + status).
