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
    code: `import { renderReportHTML, buildCSVString } from '@bijon/table-export-pdf';

// Exact report markup the PDF is built from:
const html = renderReportHTML('Outlet Ledger', columns, rows, { storeName: 'My Store' });
document.querySelector('#preview').innerHTML = html;

// Exact CSV text (with BOM):
const csv = buildCSVString(columns, rows);`,
};
