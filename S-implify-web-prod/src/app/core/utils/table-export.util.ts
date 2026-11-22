export interface TableExportColumn {
    field: string;
    title: string;
    hide?: boolean;
}

function visibleColumns(columns: TableExportColumn[]): TableExportColumn[] {
    return columns.filter((c) => !c.hide);
}

function cellText(row: object, field: string): string {
    const v = (row as Record<string, unknown>)[field];
    if (v == null) {
        return '';
    }
    return String(v);
}

function escapeCsvCell(value: string): string {
    if (/[",\n\r]/.test(value)) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** CSV with UTF-8 BOM so Excel opens special characters correctly. */
export function downloadCsv(filename: string, columns: TableExportColumn[], rows: object[]): void {
    const cols = visibleColumns(columns);
    if (!cols.length) {
        return;
    }
    const lines = [
        cols.map((c) => escapeCsvCell(c.title)).join(','),
        ...rows.map((row) => cols.map((c) => escapeCsvCell(cellText(row, c.field))).join(',')),
    ];
    const blob = new Blob(['\uFEFF', lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    link.click();
    URL.revokeObjectURL(url);
}

export function printTable(title: string, columns: TableExportColumn[], rows: object[]): void {
    const cols = visibleColumns(columns);
    if (!cols.length) {
        return;
    }
    let html = `<p>${escapeHtml(title)}</p><table style="width:100%;border-collapse:collapse"><thead><tr>`;
    for (const col of cols) {
        html += `<th style="padding:8px 4px;text-align:left;background:#eff5ff">${escapeHtml(col.title)}</th>`;
    }
    html += '</tr></thead><tbody>';
    for (const row of rows) {
        html += '<tr>';
        for (const col of cols) {
            html += `<td style="padding:4px;border-top:1px solid #eee">${escapeHtml(cellText(row, col.field))}</td>`;
        }
        html += '</tr>';
    }
    html +=
        '</tbody></table><style>body{font-family:Arial,sans-serif;color:#495057}p{text-align:center;font-size:18px;font-weight:bold;margin:15px}</style>';

    const win = window.open('', '_blank', 'left=0,top=0,width=1100,height=700');
    if (!win) {
        return;
    }
    win.document.write(`<title>${escapeHtml(title)}</title>${html}`);
    win.document.close();
    win.focus();
    win.onafterprint = () => win.close();
    win.print();
}

/** Header printed above every report (logo + title + selected scope + generation date). */
export interface PrintReportHeader {
    title: string;
    /** Each line describes one part of the selection, e.g. "District: ...". */
    selection: string[];
    generatedAt: string;
    logoUrl?: string;
}

export interface PrintReportSection {
    title?: string;
    columns: TableExportColumn[];
    rows: object[];
}

/**
 * Print-friendly report: the same detached-window pattern as {@link printTable},
 * with the report header (logo / title / selection / date) and tables only.
 * No portal navigation, buttons or page chrome are written into the print document.
 */
export function printReport(header: PrintReportHeader, sections: PrintReportSection[]): void {
    const logo = header.logoUrl || '/assets/images/logo.jpeg';
    let body = `
      <header class="report-head">
        <img class="report-logo" src="${escapeHtml(logo)}" alt="S-Implify" />
        <div class="report-heading">
          <div class="report-title">${escapeHtml(header.title)}</div>
          <div class="report-selection">${header.selection.map((line) => `<span>${escapeHtml(line)}</span>`).join('')}</div>
          <div class="report-generated">Generated: ${escapeHtml(header.generatedAt)}</div>
        </div>
      </header>`;

    for (const section of sections) {
        const cols = visibleColumns(section.columns);
        if (!cols.length) {
            continue;
        }
        body += '<section class="report-section">';
        if (section.title) {
            body += `<h2>${escapeHtml(section.title)}</h2>`;
        }
        body += '<table><thead><tr>';
        for (const col of cols) {
            body += `<th>${escapeHtml(col.title)}</th>`;
        }
        body += '</tr></thead><tbody>';
        if (!section.rows.length) {
            body += `<tr><td colspan="${cols.length}" class="empty">No data for the current selection</td></tr>`;
        }
        for (const row of section.rows) {
            body += '<tr>';
            for (const col of cols) {
                body += `<td>${escapeHtml(cellText(row, col.field))}</td>`;
            }
            body += '</tr>';
        }
        body += '</tbody></table></section>';
    }

    const style = `
      <style>
        @page { size: auto; margin: 14mm; }
        body { font-family: Arial, Helvetica, sans-serif; color: #495057; font-size: 12px; margin: 0; }
        .report-head { display: flex; align-items: center; gap: 14px; border-bottom: 2px solid #4361ee; padding-bottom: 12px; margin-bottom: 18px; }
        .report-logo { width: 48px; height: 48px; object-fit: contain; }
        .report-heading { flex: 1; }
        .report-title { font-size: 20px; font-weight: 700; color: #0e1726; }
        .report-selection { display: flex; flex-wrap: wrap; gap: 4px 18px; margin-top: 6px; font-size: 11px; color: #506690; }
        .report-generated { margin-top: 4px; font-size: 10px; color: #868e96; }
        .report-section { margin-bottom: 18px; break-inside: avoid; }
        h2 { font-size: 13px; color: #0e1726; margin: 0 0 6px; }
        table { width: 100%; border-collapse: collapse; }
        th { text-align: left; padding: 8px 6px; background: #eff5ff; color: #0e1726; border: 1px solid #dfe6f0; font-size: 11px; }
        td { padding: 6px; border: 1px solid #e9ecef; vertical-align: top; }
        tbody tr:nth-child(even) td { background: #fbfcfe; }
        td.empty { text-align: center; color: #868e96; padding: 14px; }
        @media print { .report-section { page-break-inside: avoid; } }
      </style>`;

    const win = window.open('', '_blank', 'left=0,top=0,width=1100,height=700');
    if (!win) {
        return;
    }
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(header.title)}</title>${style}</head><body>${body}</body></html>`);
    win.document.close();
    win.focus();
    win.onafterprint = () => win.close();
    win.print();
}
