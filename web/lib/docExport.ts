import type { DocumentDetail } from "./bridge";

const money = (n?: number) => (n != null ? n.toFixed(2) : "");
const esc = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;

// Excel-friendly CSV (UTF-8 BOM so Hebrew opens correctly in Excel).
export function exportExcel(d: DocumentDetail) {
  const head = [
    [`מסמך`, `${d.docTypeName} ${d.docNumber ? "#" + d.docNumber : "(זמני " + d.stockId + ")"}`],
    [`לקוח`, `${d.customerName} (${d.accountKey})`],
    [`תאריך`, d.date ? new Date(d.date).toLocaleDateString("he-IL") : ""],
    [],
    [`מק״ט`, `תיאור`, `כמות`, `יחידה`, `מחיר יח׳`, `סה״כ שורה`],
  ];
  const lines = (d.lines ?? []).map((l) => [l.itemkey, l.name ?? "", l.qty, l.unit ?? "", money(l.unitPrice), money(l.lineTotal)]);
  const foot = [[], [``, ``, ``, ``, `סה״כ`, money(d.total)]];
  const rows = [...head, ...lines, ...foot];
  const csv = "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
  download(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${docBase(d)}.csv`);
}

// Printable HTML -> the browser's "Save as PDF".
export function exportPdf(d: DocumentDetail) {
  const rows = (d.lines ?? []).map((l) =>
    `<tr><td>${l.itemkey}</td><td>${l.name ?? ""}</td><td style="text-align:center">${l.qty}</td><td style="text-align:center">${l.unit ?? ""}</td><td style="text-align:left">${money(l.unitPrice)}</td><td style="text-align:left">${money(l.lineTotal)}</td></tr>`
  ).join("");
  const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>${docBase(d)}</title>
    <style>body{font-family:Arial,sans-serif;padding:24px;color:#222}h1{color:#1e2a78;margin:0 0 4px}
    .meta{color:#555;margin-bottom:16px}table{border-collapse:collapse;width:100%}
    th,td{border:1px solid #ccc;padding:6px 8px;font-size:13px;text-align:right}
    thead th{background:#1e2a78;color:#fff}tfoot td{font-weight:700}</style></head>
    <body><h1>${d.docTypeName} ${d.docNumber ? "#" + d.docNumber : "(זמני " + d.stockId + ")"}</h1>
    <div class="meta">${d.customerName} (${d.accountKey})${d.address ? " · " + d.address : ""}${d.phone ? " · " + d.phone : ""}<br>${d.date ? new Date(d.date).toLocaleDateString("he-IL") : ""}</div>
    <table><thead><tr><th>מק״ט</th><th>תיאור</th><th>כמות</th><th>יחידה</th><th>מחיר יח׳</th><th>סה״כ שורה</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td colspan="5" style="text-align:left">סה״כ</td><td style="text-align:left">${money(d.total)}</td></tr></tfoot></table>
    <script>window.onload=()=>{window.print()}</script></body></html>`;
  const w = window.open("", "_blank");
  if (!w) { alert("החלון נחסם — אפשר חלונות קופצים כדי להדפיס/לשמור PDF"); return; }
  w.document.write(html); w.document.close();
}

function docBase(d: DocumentDetail) {
  return `${d.docTypeName}_${d.docNumber || d.stockId}_${d.accountKey}`.replace(/[^\w֐-׿.-]+/g, "_");
}
function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
