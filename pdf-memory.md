# pdf-memory.md — context handoff for `table-export-pdf`

Read this first when continuing work on the PDF/CSV export library in a new conversation.
It captures what exists, why the code is shaped the way it is, and what's still open.

---

## What this library is

A **framework-agnostic** (pure DOM) helper set to export a table (`columns` + array-of-rows)
to CSV and to print-quality PDF. Extracted from the Vitepos WordPress POS plugin, where the
same logic lives in two synced copies:

- `wp-content/plugins/vitepos/adminpanel/src/libraries/TableExport.js`
- `wp-content/plugins/vitepos/pos-client/src/libraries/TableExport.js`

This standalone package is the clean, generalized version (no `wc_price` / gettext coupling)
meant to be reused across multiple projects.

### Folder layout

```
table-export-pdf/
├── package.json          # ESM ("type":"module"); ships dist/ (built) as main/module/exports;
│                          # html2pdf.js = OPTIONAL peer dep, lazy-imported
├── vite.config.js         # dev: serves index.html; build: lib mode -> dist/ (es+umd, sourcemaps,
│                           # html2pdf.js externalized)
├── index.html             # dev playground page (npm run dev)
├── dev/main.js             # dev playground script wired to index.html
├── README.md              # full public docs (data model, 3 APIs, all options, gotchas)
├── pdf-memory.md          # this file
├── .gitignore
├── src/index.js           # the whole library implementation, single file, JSDoc typedefs
├── test/normalize.test.mjs # node --test unit tests for the pure normalize/resolve helpers
├── dist/                  # BUILD OUTPUT (git/npm-ignored source-wise, but shipped to npm) —
│                           # table-export-pdf.es.js / .umd.js + .map sourcemaps
└── examples/OutletLedgerExample.vue   # runnable Vue 3 example
```

Note: the library logic itself is still a single file (`src/index.js`); "single file" refers
to the implementation, not the whole package — tooling (vite config, dev playground, tests)
now lives alongside it as separate files.

### Folder layout (dev playground, dev-only — not shipped)

```
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

### Public API (all in `src/index.js`)

- `exportTableCSV(filename, columns, rows)` — UTF-8 CSV + BOM. Zero deps.
- `exportTablePDF(title, columns, rows, options?)` — hidden-iframe browser print dialog. Zero deps.
- `downloadTablePDF(title, columns, rows, options?)` → `Promise` — direct download via
  `html2pdf.js` (html2canvas + jsPDF), lazy-imported on first call.
- `buildCSVString(columns, rows)` → string — exact CSV text (BOM + CRLF); `exportTableCSV` wraps it. Zero deps.
- `renderReportHTML(title, columns, rows, options?)` → string — exact report markup (single continuous
  report) used by the PDF path; `exportTablePDF` and `downloadTablePDF`'s classic branch wrap it. Zero deps.

`downloadTablePDF` options (all opt-in; default = classic single continuous table):
`storeName`, `summary` (`[{label,value}]`), `filename`, `pageBreak`, `repeatHeader`
(implies `pageBreak`), `pageNumbers`, `pageSize` (`a4`(default)|letter|legal|a3|a5|tabloid`).

### Data model

- `columns`: `[{ title, align?: 'end' }]` — `title` used verbatim (translate before passing);
  `align:'end'` right-aligns.
- `rows`: array of rows; each row is an array of cells 1:1 with columns. A cell is either a
  plain value (verbatim CSV / HTML-escaped PDF) **or** `{ csv, html }` (raw number to CSV,
  pre-formatted markup to PDF — `html` is inserted un-escaped, it's your trusted output).

---

## Why the code is shaped this way (hard-won decisions — don't regress)

These were all fixed through real bugs in the Vitepos ledger PDF; keep them:

1. **Repeating headers can't come from html2canvas.** html2canvas captures the DOM as one tall
   raster image — it can't repeat `<thead>` or slice cleanly between rows. So we **manually
   paginate**: `paginateRows()` measures header + each row off-screen and groups rows into
   page-sized chunks, rendering **each page as its own `<table>`** separated by
   `.html2pdf__page-break` dividers (html2pdf forces a new page there). That's how the column
   header (and optionally the report header) repeats.

2. **Last column was getting clipped.** Root cause: setting an explicit **px width** on the
   container overrode html2pdf's own container (it sizes to `pageSize.inner.width`, e.g. 190mm
   on A4). Fix: **no explicit width** + `table-layout: fixed`. The off-screen measuring host in
   `paginateRows()` is sized in **mm** (`printableW + 'mm'`) so measured heights map 1:1 to the
   rendered page; px-per-mm is derived empirically from `host.offsetWidth / printableW`.

3. **Rows split across page boundaries.** Fixed by manual pagination **plus** `page-break-inside:
   avoid` on `tr/th/td` as a CSS safety net, and `pagebreak: { mode: ['css','legacy'] }`.

4. **Page geometry is a single source of truth.** `PDF_PAGE_SIZES_MM` feeds BOTH the paginator
   and jsPDF (`format:[pageW,pageH]`), so render and pagination always agree. Margins
   `PDF_MARGIN_MM = [14,10,14,10]`; `PDF_PAGE_SAFETY = 0.94` and `PDF_PAGE_BUFFER_PX = 20` absorb
   rounding/margin-collapse so a row never overflows and gets pushed.

5. **Page numbers are Latin-only.** Stamped after render via the jsPDF worker chain
   (`.toPdf().get('pdf').then(pdf => …)`), using jsPDF's default font which can't render non-Latin
   (e.g. Bengali) glyphs. Everything else renders from the DOM in whatever the page fonts support.
   Format: `N / total` top-right, `Page N of total` bottom-center.

6. **Everything is opt-in** to preserve "classic" behavior for existing callers.

7. **Formatting happens in the caller, before export** (dates, currency). The library does NO
   locale formatting — pass formatted strings or `{csv,html}` cells. Keeps it framework-agnostic.

8. **Never position the source element** passed to html2pdf — it wraps it in its own off-screen
   `opacity:0` container; adding position/left/z-index yields a blank page.

9. **Dynamic columns (added 2026-07-02).** Columns may carry `key` (reads `row[key]`),
   `value` (computed accessor, wins over `key`), and `format(value,row)` (returns a string
   → escaped display text with raw kept for CSV; or `{csv,html}` → trusted un-escaped html).
   Rows can therefore be plain objects. `resolveCell` + `normalizeTable` convert either the
   classic array-of-cells shape or the object shape into internal `{csv,html}` rows; detection
   is per row via `Array.isArray`. All three public functions route through `normalizeTable`,
   so classic callers are byte-identical. Pure functions are unit-tested under `node --test`
   (`test/normalize.test.mjs`); `npm test` runs them. Cell/column count now follows
   `columns.length` (via `normalizeTable` mapping over `columns`), NOT `row.length` as the
   pre-feature builders did; for the documented 1:1 classic contract output is byte-identical,
   but a classic row longer/shorter than `columns` is now truncated/padded to `columns.length`.
   This is a deliberate choice — column count is authoritative.

---

## Status / verification

- `node --check src/index.js` passes.
- Behavior is identical to the in-plugin `TableExport.js` (this is the generalized copy).
- The plugin's `OutletLedgerModal.vue` (both adminpanel and pos-client) call `downloadTablePDF`
  with `pageBreak:true, repeatHeader:true, pageNumbers:true` (adminpanel omits `pageSize`;
  pos-client passes `pageSize:'a4'`).
- `npm test` runs the `node --test` suite (`test/normalize.test.mjs` + `test/playground.test.mjs`), all passing.
- `npm run dev` and `npm run build` exist (Vite): dev serves `index.html`/`dev/main.js` as a
  playground; build emits the library to `dist/` (es + umd, with sourcemaps) for npm publish.
- `test/playground.test.mjs` unit-tests `maplib` + `csvToTable`; `highlight.js` is a
  devDependency (never shipped in `dist/`); the docs-style playground is served by `npm run dev`.

---

## Open / possible next work (nothing committed to — confirm before doing)

- **Point the Vitepos modals at this shared library** and delete the two duplicated
  `TableExport.js` copies (adminpanel + pos-client). NOT done yet — the plugin still uses its own
  copies. Note: those copies also export `exportTablePDF`/`exportTableCSV` used by other callers
  (CreditLedgerModal, CreditFifoLogModal) — check all import sites before removing.
- **Build/dist step**: currently ships source ESM (Vue CLI/Vite import `src/index.js` directly).
  Could add rollup `dist/` and/or TypeScript `.d.ts` (types are JSDoc today).
- **Landscape orientation** option (currently portrait only — `orientation:'p'` hardcoded).
- **`<colgroup>`** for proportional/explicit column widths (today `table-layout:fixed` splits
  evenly).
- **Date-format helper**: earlier discussed wiring a `created_at` date `case`; deliberately left
  to the caller per decision #7.

---

## Related project memory

The user keeps auto-memory at `C:\Users\Appsbd\.claude\projects\d--WebProjects-projects-new-leg\memory\`.
This library is not indexed there yet. Vitepos-specific facts (debt/credit architecture, elite-grid
default for tables, multi-outlet auth, single test command) live in that MEMORY.md — relevant only
when working inside the plugin, not on this standalone library.
