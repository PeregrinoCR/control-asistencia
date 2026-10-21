/** Escapes text for HTML. */
export const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function tableHtml(header: string[], rows: Array<Array<string | number>>) {
  return `<table><thead><tr>${header.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;
}

/**
 * Opens a printable page and the print dialog, where "Guardar como PDF" makes the PDF.
 * The window opens right away (browsers block it after a wait) and fills in when `body` is ready.
 * `css` adds styles for special layouts such as student cards.
 */
export async function printDocument(title: string, body: string | Promise<string>, opts: { school?: string; logo?: string; css?: string } = {}) {
  const w = window.open('', '_blank');
  if (!w) return alert('Permita las ventanas emergentes para imprimir o guardar en PDF.');
  w.document.write('<p style="font: 14px system-ui; margin: 24px">Preparando…</p>');
  const html = await body;
  w.document.open();
  const date = new Date().toLocaleDateString('es-CR', { day: 'numeric', month: 'long', year: 'numeric' });
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  body { font: 12px/1.4 system-ui, sans-serif; color: #111; margin: 24px; }
  header { display: flex; align-items: center; gap: 12px; border-bottom: 2px solid #1e4fd8; padding-bottom: 8px; margin-bottom: 16px; }
  header img { height: 40px; }
  h1 { font-size: 18px; margin: 0; }
  .sub { color: #555; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 5px 6px; border-bottom: 1px solid #ddd; vertical-align: top; }
  th { background: #f1f3f7; font-size: 11px; }
  @page { margin: 14mm; }
  ${opts.css ?? ''}
</style></head><body>
<header>${opts.logo ? `<img src="${esc(opts.logo)}" alt="">` : ''}<div><h1>${esc(title)}</h1><div class="sub">${esc(opts.school ?? '')} · ${date}</div></div></header>
${html}
<script>window.onload = () => setTimeout(() => window.print(), 300);</script>
</body></html>`);
  w.document.close();
}
