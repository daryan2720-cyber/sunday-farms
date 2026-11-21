/** HTML for the Little Sprouts certificate. expo-print turns it into a one-page PDF. */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

export function certificateHtml(o: {
  nickname: string; heading: string; awardedTo: string; forCompleting: string; programme: string; appName: string; date: string;
}): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 0; }
  body { margin: 0; font-family: -apple-system, Roboto, "Noto Sans", sans-serif; }
  .page { box-sizing: border-box; width: 210mm; height: 297mm; padding: 18mm; }
  .frame { box-sizing: border-box; height: 100%; border: 6px solid #2E7D32; outline: 2px solid #2E7D32; outline-offset: -14px;
           display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 20mm; }
  h1 { color: #2E7D32; font-size: 34pt; margin: 0 0 18mm; }
  .muted { color: #555; font-size: 15pt; margin: 4mm 0; }
  .name { font-size: 40pt; font-weight: bold; margin: 8mm 0; }
  .sprout { font-size: 80pt; margin: 14mm 0; }
  .brand { color: #2E7D32; font-weight: bold; margin-top: 2mm; }
  </style></head><body><div class="page"><div class="frame">
  <h1>${esc(o.heading)}</h1>
  <div class="muted">${esc(o.awardedTo)}</div>
  <div class="name">${esc(o.nickname)}</div>
  <div class="muted">${esc(o.forCompleting)}</div>
  <div class="muted">${esc(o.programme)}</div>
  <div class="sprout">🌱</div>
  <div class="muted">${esc(o.date)}</div>
  <div class="brand">${esc(o.appName)}</div>
  </div></div></body></html>`;
}
