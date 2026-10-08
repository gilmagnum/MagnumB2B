import type { DocumentDetail } from "./bridge";

const money = (n?: number) => (n != null ? n.toFixed(2) : "");

// Escape every value interpolated into the exported HTML — names, item keys, customer/address, etc.
// come from Hashavshevet and must never be able to inject markup/script into the print window.
const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
// Only embed an image from an https URL (and escape it); anything else is dropped.
const httpsImg = (url: string | undefined, style: string) =>
  url && /^https:\/\//i.test(url) ? `<img src="${esc(url)}" style="${style}" />` : "";

type Images = Record<string, string>;

// Real .xlsx with the product image embedded IN the cell (not a link). exceljs is
// loaded on demand so it doesn't weigh down the page bundle.
export async function exportExcel(d: DocumentDetail, images: Images = {}) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("מסמך", { views: [{ rightToLeft: true }] });
  ws.columns = [
    { width: 9 }, { width: 16 }, { width: 34 }, { width: 8 }, { width: 8 }, { width: 11 }, { width: 12 },
  ];

  ws.addRow([`${d.docTypeName} ${d.docNumber ? "#" + d.docNumber : "(זמני " + d.stockId + ")"}`]).font = { bold: true, size: 14 };
  ws.addRow([`לקוח`, `${d.customerName} (${d.accountKey})`]);
  ws.addRow([`תאריך`, d.date ? new Date(d.date).toLocaleDateString("he-IL") : ""]);
  ws.addRow([]);
  const header = ws.addRow(["תמונה", "מק״ט", "תיאור", "כמות", "יחידה", "מחיר יח׳", "סה״כ שורה"]);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E2A78" } }; });

  for (const l of d.lines ?? []) {
    const row = ws.addRow(["", l.itemkey, l.name ?? "", l.qty, l.unit ?? "", Number(money(l.unitPrice)) || "", Number(money(l.lineTotal)) || ""]);
    row.height = 40;
    const url = images[l.itemkey];
    if (url && /^https:\/\//i.test(url)) {
      try {
        const buf = await (await fetch(url)).arrayBuffer();
        const ext = /\.png($|\?)/i.test(url) ? "png" : "jpeg";
        const imgId = wb.addImage({ buffer: buf, extension: ext });
        ws.addImage(imgId, { tl: { col: 0.1, row: row.number - 1 + 0.1 }, ext: { width: 48, height: 48 } });
      } catch { /* skip image on CORS/fetch error */ }
    }
  }
  ws.addRow([]);
  const foot = ws.addRow(["", "", "", "", "", "סה״כ", Number(money(d.total)) || ""]);
  foot.font = { bold: true };

  const out = await wb.xlsx.writeBuffer();
  download(new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${docBase(d)}.xlsx`);
}

// Printable HTML -> the browser's "Save as PDF". Shows a product-image thumbnail per line.
export function exportPdf(d: DocumentDetail, images: Images = {}) {
  const rows = (d.lines ?? []).map((l) => {
    const img = httpsImg(images[l.itemkey], "width:44px;height:44px;object-fit:contain");
    return `<tr><td style="text-align:center">${img}</td><td>${esc(l.itemkey)}</td><td>${esc(l.name ?? "")}</td><td style="text-align:center">${esc(l.qty)}</td><td style="text-align:center">${esc(l.unit ?? "")}</td><td style="text-align:left">${money(l.unitPrice)}</td><td style="text-align:left">${money(l.lineTotal)}</td></tr>`;
  }).join("");
  const title = `${esc(d.docTypeName)} ${d.docNumber ? "#" + esc(d.docNumber) : "(זמני " + esc(d.stockId) + ")"}`;
  const meta = `${esc(d.customerName)} (${esc(d.accountKey)})${d.customer?.address ? " · " + esc(d.customer.address) : ""}${d.customer?.phone ? " · " + esc(d.customer.phone) : ""}`;
  const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>${esc(docBase(d))}</title>
    <style>body{font-family:Arial,sans-serif;padding:24px;color:#222}h1{color:#1e2a78;margin:0 0 4px}
    .meta{color:#555;margin-bottom:16px}table{border-collapse:collapse;width:100%}
    th,td{border:1px solid #ccc;padding:6px 8px;font-size:13px;text-align:right;vertical-align:middle}
    thead th{background:#1e2a78;color:#fff}tfoot td{font-weight:700}
    @media print{thead{display:table-header-group}}</style></head>
    <body><h1>${title}</h1>
    <div class="meta">${meta}<br>${d.date ? esc(new Date(d.date).toLocaleDateString("he-IL")) : ""}</div>
    <table><thead><tr><th>תמונה</th><th>מק״ט</th><th>תיאור</th><th>כמות</th><th>יחידה</th><th>מחיר יח׳</th><th>סה״כ שורה</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td colspan="6" style="text-align:left">סה״כ</td><td style="text-align:left">${money(d.total)}</td></tr></tfoot></table>
    <script>window.onload=()=>{setTimeout(()=>window.print(),400)}</script></body></html>`;
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
