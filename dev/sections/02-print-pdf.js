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
    code: `import { exportTablePDF } from '@bijon059/table-export-pdf';

const columns = [
  { key: 'date', title: 'Date' },
  { key: 'desc', title: 'Description' },
  { key: 'amount', title: 'Amount', align: 'end', format: v => ({ csv: v, html: currency(v) }) },
  { key: 'balance', title: 'Balance', align: 'end', format: v => ({ csv: v, html: currency(v) }) },
];

exportTablePDF('Outlet Ledger', columns, rows, { storeName: 'My Store' });`,
};
