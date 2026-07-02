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
