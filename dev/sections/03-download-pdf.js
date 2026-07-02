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
    code: `import { downloadTablePDF } from '@bijon/table-export-pdf';

await downloadTablePDF('Outlet Ledger', columns, rows, {
  storeName: 'My Store',
  filename: 'outlet-ledger',
  pageBreak: true,
  repeatHeader: true,
  pageNumbers: true,
  pageSize: 'a4',
});`,
};
