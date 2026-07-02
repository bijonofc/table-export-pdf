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
