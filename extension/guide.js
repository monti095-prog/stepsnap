const FONT = 'system-ui,"Segoe UI",Roboto,Arial,sans-serif';
const $ = s => document.querySelector(s);
let steps = [], title = '', rid = 0, saveT;
const cache = new Map();

const save = () => {
  clearTimeout(saveT);
  saveT = setTimeout(() => chrome.storage.local.set({ steps: steps.map(({ img, ...r }) => r), guideTitle: title }), 300);
};
const loadImg = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });

// Screenshot with a red box around the element and a dot where you clicked.
async function canvasFor(s) {
  if (!s.img) return null;
  if (cache.has(s.id)) return cache.get(s.id);
  const im = await loadImg(s.img), c = document.createElement('canvas');
  c.width = im.naturalWidth; c.height = im.naturalHeight;
  const g = c.getContext('2d');
  g.drawImage(im, 0, 0);
  if (s.vw && s.rect) {
    const k = c.width / s.vw, lw = Math.max(3, c.width / 280), r = s.rect;
    g.strokeStyle = '#ef4444'; g.lineWidth = lw;
    if (r.w < s.vw * 0.9 && r.h < s.vh * 0.6) g.strokeRect(r.x * k - 4, r.y * k - 4, r.w * k + 8, r.h * k + 8);
    if (s.type === 'click') {
      g.beginPath(); g.arc(s.x * k, s.y * k, Math.max(14, c.width / 90), 0, Math.PI * 2);
      g.fillStyle = 'rgba(239,68,68,.3)'; g.fill(); g.stroke();
    }
  }
  cache.set(s.id, c);
  return c;
}

async function render() {
  const my = ++rid, frag = document.createDocumentFragment();
  $('#empty').hidden = steps.length > 0;
  $('#pdf').disabled = !steps.length;
  for (const [i, s] of steps.entries()) {
    const d = document.createElement('div');
    d.className = 'card';
    d.innerHTML = `<div class="row"><span class="n">${i + 1}</span><input class="t" aria-label="Step ${i + 1} text">
      <button data-a="up" title="Move up">↑</button><button data-a="down" title="Move down">↓</button><button data-a="del" title="Delete step">✕</button></div>`;
    const inp = d.querySelector('.t');
    inp.value = s.text;
    inp.oninput = () => { s.text = inp.value; save(); };
    d.querySelectorAll('button').forEach(b => b.onclick = () => {
      const a = b.dataset.a;
      if (a === 'del') steps.splice(i, 1);
      else {
        const j = a === 'up' ? i - 1 : i + 1;
        if (j < 0 || j >= steps.length) return;
        [steps[i], steps[j]] = [steps[j], steps[i]];
      }
      save(); render();
    });
    const c = await canvasFor(s);
    if (c) d.appendChild(c);
    frag.appendChild(d);
  }
  if (my === rid) $('#steps').replaceChildren(frag);
}

/* ---------- PDF: render pages to canvas, embed as JPEG in a hand-built PDF ---------- */
const W = 1240, H = 1754, M = 90, CW = W - 2 * M; // A4 at ~150 dpi

function wrap(g, text, maxW) {
  const lines = []; let cur = '';
  for (let w of String(text).split(/\s+/)) {
    while (g.measureText(w).width > maxW) {
      let i = 1;
      while (i < w.length && g.measureText(w.slice(0, i + 1)).width <= maxW) i++;
      if (cur) { lines.push(cur); cur = ''; }
      lines.push(w.slice(0, i)); w = w.slice(i);
    }
    if (!w) continue;
    const t = cur ? cur + ' ' + w : w;
    if (g.measureText(t).width <= maxW) cur = t; else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

function buildPdf(jpegs) {
  const enc = new TextEncoder(), chunks = [], offs = [];
  let pos = 0;
  const put = d => { const b = typeof d === 'string' ? enc.encode(d) : d; chunks.push(b); pos += b.length; };
  const obj = n => { offs[n] = pos; put(`${n} 0 obj\n`); };
  const total = 2 + 3 * jpegs.length;
  put('%PDF-1.4\n%âãÏÓ\n');
  obj(1); put('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  obj(2); put(`<< /Type /Pages /Count ${jpegs.length} /Kids [${jpegs.map((_, i) => `${3 + 3 * i} 0 R`).join(' ')}] >>\nendobj\n`);
  jpegs.forEach((j, i) => {
    const p = 3 + 3 * i, content = 'q 595 0 0 842 0 0 cm /Im0 Do Q';
    obj(p); put(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im0 ${p + 2} 0 R >> >> /Contents ${p + 1} 0 R >>\nendobj\n`);
    obj(p + 1); put(`<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);
    obj(p + 2); put(`<< /Type /XObject /Subtype /Image /Width ${j.w} /Height ${j.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${j.bytes.length} >>\nstream\n`);
    put(j.bytes); put('\nendstream\nendobj\n');
  });
  const xref = pos;
  put(`xref\n0 ${total + 1}\n0000000000 65535 f \n`);
  for (let i = 1; i <= total; i++) put(String(offs[i]).padStart(10, '0') + ' 00000 n \n');
  put(`trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(chunks, { type: 'application/pdf' });
}

async function downloadPdf() {
  $('#status').textContent = 'Building PDF…';
  const pages = []; let c, g, y;
  const newPage = () => {
    c = document.createElement('canvas'); c.width = W; c.height = H;
    g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    g.textBaseline = 'top'; pages.push(c); y = M;
  };
  newPage();
  g.fillStyle = '#111827'; g.font = `700 54px ${FONT}`;
  for (const l of wrap(g, title || 'Step-by-step guide', CW)) { g.fillText(l, M, y); y += 68; }
  g.fillStyle = '#6b7280'; g.font = `400 28px ${FONT}`;
  g.fillText(`${steps.length} steps — ${new Date().toLocaleDateString()}`, M, y);
  y += 70;

  for (const [i, s] of steps.entries()) {
    const cv = await canvasFor(s);
    g.font = `600 34px ${FONT}`;
    const lines = wrap(g, s.text, CW - 90), textH = Math.max(60, lines.length * 44);
    let iw = CW, ih = 0;
    if (cv) {
      ih = iw * cv.height / cv.width;
      const maxH = H - 2 * M - textH - 60;
      if (ih > maxH) { ih = maxH; iw = ih * cv.width / cv.height; }
    }
    const blockH = textH + (cv ? ih + 20 : 0) + 50;
    if (y + blockH > H - M - 30 && y > M) newPage();
    g.fillStyle = '#dc2626'; g.beginPath(); g.arc(M + 30, y + 30, 30, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.font = `700 30px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(i + 1), M + 30, y + 31);
    g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillStyle = '#111827'; g.font = `600 34px ${FONT}`;
    lines.forEach((l, k) => g.fillText(l, M + 80, y + Math.max(0, (60 - lines.length * 44) / 2) + k * 44));
    if (cv) {
      const x = M + (CW - iw) / 2, yy = y + textH + 20;
      g.drawImage(cv, x, yy, iw, ih);
      g.strokeStyle = '#d1d5db'; g.lineWidth = 2; g.strokeRect(x, yy, iw, ih);
    }
    y += blockH;
  }

  const jpegs = [];
  for (const [n, p] of pages.entries()) {
    const pg = p.getContext('2d');
    pg.fillStyle = '#9ca3af'; pg.font = `400 24px ${FONT}`; pg.textAlign = 'center'; pg.textBaseline = 'top';
    pg.fillText(`Page ${n + 1} of ${pages.length}`, W / 2, H - 60);
    const blob = await new Promise(r => p.toBlob(r, 'image/jpeg', 0.88));
    jpegs.push({ bytes: new Uint8Array(await blob.arrayBuffer()), w: W, h: H });
  }
  const url = URL.createObjectURL(buildPdf(jpegs));
  const a = document.createElement('a');
  a.href = url;
  a.download = (title || 'guide').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) + '.pdf';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
  $('#status').textContent = 'PDF downloaded';
}

$('#pdf').onclick = downloadPdf;
$('#title').oninput = e => { title = e.target.value; save(); };
$('#discard').onclick = async () => {
  if (!confirm('Delete this guide and all screenshots?')) return;
  const all = await chrome.storage.local.get(null);
  await chrome.storage.local.remove(Object.keys(all).filter(k => k.startsWith('img:')).concat('steps', 'guideTitle'));
  steps = []; cache.clear(); render();
};

(async () => {
  const d = await chrome.storage.local.get(['steps', 'guideTitle']);
  steps = d.steps || [];
  const imgs = await chrome.storage.local.get(steps.filter(s => s.hasImg).map(s => 'img:' + s.id));
  steps.forEach(s => { s.img = imgs['img:' + s.id]; });
  title = d.guideTitle || steps[0]?.pageTitle || 'Step-by-step guide';
  $('#title').value = title;
  await render();
  if (location.hash === '#auto' && steps.length) {
    history.replaceState(null, '', location.pathname);
    downloadPdf();
  }
})();
