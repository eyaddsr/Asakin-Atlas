/**
 * "Export" = a PDF of exactly what is on screen (below the app header), with the Asakin logo as a
 * simple header. Rendered locally in the browser from the already-authorized page; nothing is sent
 * to a server or third party. Libraries are loaded on demand so they stay out of the main bundle.
 */

type Saved = { el: HTMLElement; top: number; left: number; children: { el: HTMLElement; translate: string }[] };

/**
 * DOM-to-image renderers clone the page and lose scroll positions. Freeze them: move every scrolled
 * container back to 0 and shift its content by the same amount (sticky elements are put back where
 * they were on screen), so the clone looks like the screen. Returns a restore function.
 */
function freezeScroll(root: HTMLElement): () => void {
  const saved: Saved[] = [];
  const sticky: { el: HTMLElement; rect: DOMRect; translate: string }[] = [];
  const scrolled = [...root.querySelectorAll<HTMLElement>('*')].filter((el) => el.scrollTop !== 0 || el.scrollLeft !== 0);
  for (const el of scrolled) {
    for (const s of el.querySelectorAll<HTMLElement>('*')) {
      if (getComputedStyle(s).position === 'sticky') sticky.push({ el: s, rect: s.getBoundingClientRect(), translate: s.style.translate });
    }
  }
  for (const el of scrolled) {
    const top = el.scrollTop; const left = el.scrollLeft;
    const children = [...el.children].filter((c): c is HTMLElement => c instanceof HTMLElement).map((c) => ({ el: c, translate: c.style.translate }));
    saved.push({ el, top, left, children });
    el.scrollTop = 0; el.scrollLeft = 0;
    for (const c of children) c.el.style.translate = `${-left}px ${-top}px`;
  }
  for (const s of sticky) {
    const now = s.el.getBoundingClientRect();
    const [cx = 0, cy = 0] = (s.el.style.translate || '0px 0px').split(' ').map((v) => parseFloat(v) || 0);
    s.el.style.translate = `${cx + s.rect.left - now.left}px ${cy + s.rect.top - now.top}px`;
  }
  return () => {
    for (const s of sticky) s.el.style.translate = s.translate;
    for (const s of saved) {
      for (const c of s.children) c.el.style.translate = c.translate;
      s.el.scrollTop = s.top; s.el.scrollLeft = s.left;
    }
  };
}

async function svgToImage(svg: SVGSVGElement, height: number): Promise<HTMLImageElement> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const vb = svg.viewBox.baseVal;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('height', String(height));
  clone.setAttribute('width', String((height * vb.width) / vb.height));
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`;
  await img.decode();
  return img;
}

export async function exportPagePdf(opts: { root: HTMLElement; logo: SVGSVGElement; skipTop: number; fileName: string; title: string }): Promise<void> {
  const [{ toCanvas }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')]);
  const ratio = 2;
  const { root } = opts;
  root.classList.add('exporting');
  const restore = freezeScroll(root);
  let shot: HTMLCanvasElement;
  try {
    shot = await toCanvas(root, {
      pixelRatio: ratio,
      backgroundColor: '#F4F6F9',
      width: root.clientWidth,
      height: root.clientHeight,
      filter: (node) => !(node instanceof HTMLElement && node.dataset.exportSkip !== undefined),
    });
  } finally {
    restore();
    root.classList.remove('exporting');
  }

  // Compose: simple white header with the logo (right, RTL), then the page below the app header.
  const W = shot.width;
  const skip = Math.round(opts.skipTop * ratio);
  const bodyH = shot.height - skip;
  const headH = 72 * ratio;
  const out = document.createElement('canvas');
  out.width = W; out.height = headH + bodyH;
  const g = out.getContext('2d')!;
  g.fillStyle = '#FFFFFF';
  g.fillRect(0, 0, W, headH);
  const logoH = 30 * ratio;
  const logo = await svgToImage(opts.logo, logoH);
  g.drawImage(logo, W - 32 * ratio - logo.width, (headH - logoH) / 2, logo.width, logoH);
  g.fillStyle = '#E3E7EE';
  g.fillRect(0, headH - ratio, W, ratio);
  g.drawImage(shot, 0, skip, W, bodyH, 0, headH, W, bodyH);

  const pw = W / ratio; const ph = out.height / ratio;
  const pdf = new jsPDF({ orientation: pw >= ph ? 'landscape' : 'portrait', unit: 'px', format: [pw, ph], hotfixes: ['px_scaling'], compress: true });
  pdf.setProperties({ title: opts.title, subject: 'Asakin Systems Integration Map', creator: 'Asakin Integration Map' });
  pdf.addImage(out, 'PNG', 0, 0, pw, ph, undefined, 'FAST');
  pdf.save(opts.fileName);
}
