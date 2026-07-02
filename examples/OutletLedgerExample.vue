<!--
  Example: exporting a ledger table to PDF / CSV with table-export-pdf.

  Adjust the import path to wherever you dropped the library, e.g.
    import { downloadTablePDF, exportTableCSV } from '@/libraries/table-export-pdf';
  or, if installed as a package:
    import { downloadTablePDF, exportTableCSV } from '@bijon/table-export-pdf';
-->
<template>
  <div>
    <button :disabled="isExporting" @click="exportPDF">Download PDF</button>
    <button @click="exportCSV">Download CSV</button>

    <table>
      <thead>
        <tr>
          <th v-for="c in columns" :key="c.name">{{ c.title }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(r, i) in rows" :key="i">
          <td>{{ formatDate(r.created_at) }}</td>
          <td>{{ r.title }}</td>
          <td>{{ currency(r.amount) }}</td>
          <td>{{ currency(r.balance) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script>
import { downloadTablePDF, exportTableCSV } from '../src/index.js';

export default {
  name: 'OutletLedgerExample',
  data() {
    return {
      isExporting: false,
      storeName: 'My Store',
      // `name` is only used locally; the library cares about `title` + `align`.
      columns: [
        { name: 'created_at', title: 'Date' },
        { name: 'title', title: 'Description' },
        { name: 'amount', title: 'Amount', align: 'end' },
        { name: 'balance', title: 'Balance', align: 'end' },
      ],
      rows: [
        { created_at: '2026-07-01', title: 'Opening balance', amount: 0, balance: 0 },
        { created_at: '2026-07-02', title: 'Sale #1201', amount: -50, balance: -50 },
        { created_at: '2026-07-03', title: 'Payment', amount: 50, balance: 0 },
      ],
    };
  },
  methods: {
    // Replace these with your app's real formatters (i18n, currency helper, etc.).
    currency(v) {
      return '$' + (Number(v) || 0).toFixed(2);
    },
    formatDate(v) {
      return v; // e.g. this.$dayjs(v).format('YYYY-MM-DD HH:mm')
    },

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
      if (!this.rows.length) return;
      this.isExporting = true;
      try {
        await downloadTablePDF('Outlet Ledger', this.exportColumns(), this.rows, {
          storeName: this.storeName,
          filename: 'outlet-ledger',
          summary: this.exportSummary(),
          pageBreak: true,
          repeatHeader: true,
          pageNumbers: true,
          pageSize: 'a4',
        });
      } catch (e) {
        console.error(e);
      } finally {
        this.isExporting = false;
      }
    },

    exportCSV() {
      exportTableCSV('outlet-ledger.csv', this.exportColumns(), this.rows);
    },
  },
};
</script>
