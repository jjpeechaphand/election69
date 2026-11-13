/* Election 69 two-page dashboard: shell, shared state, sidebar, search, Overview page,
   Thailand hex map and the province tooltip / detail system. Analysis charts live in e69-analysis.js. */
(function () {
  'use strict';
  const E69 = window.E69 = window.E69 || {};
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = new Intl.NumberFormat('en-US');
  const fmt = v => Number.isFinite(v) ? nf.format(Math.round(v)) : '—';
  const fmtP = (v, k = 2) => Number.isFinite(v) ? v.toLocaleString('en-US', { minimumFractionDigits: k, maximumFractionDigits: k }) + '%' : '—';
  const fmtPP = (v, k = 2) => Number.isFinite(v) ? (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: k, maximumFractionDigits: k }) : '—';
  // Phone layout ("m" on <html>, set before the first paint in index.html): narrow screens and phones held sideways.
  // Everything wider with a mouse is the desktop layout, which none of the phone code below touches.
  const phoneQuery = matchMedia('(max-width: 899px), (hover: none) and (pointer: coarse) and (max-height: 500px)');
  const isM = () => phoneQuery.matches;
  const narrow = isM;
  const coarse = () => matchMedia('(hover: none), (pointer: coarse)').matches;
  // DS is the loaded election dataset (data/<election>/*.csv via e69-source.js); D is what e69-data.js builds from it.
  let D, DS = null, lang = 'th';
  try { if (localStorage.getItem('e69-language') === 'en') lang = 'en'; } catch (e) { /* storage unavailable */ }
  const t = (th, en) => lang === 'en' ? en : th;
  const CFG = () => DS.config;
  const MONTHS_TH = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  // Election day in words, e.g. "8 กุมภาพันธ์ 2569" / "8 February 2026", from the election's settings.
  const electionDay = () => { const [y, m, d] = CFG().date.split('-').map(Number); return lang === 'en' ? d + ' ' + MONTHS_EN[m - 1] + ' ' + y : d + ' ' + MONTHS_TH[m - 1] + ' ' + (y + 543); };

  const defaults = () => ({
    page: 'overview', region: '', party: '', province: '', district: '', candidate: '',
    mapMode: 'winner',
    analysisTab: 'core', mobileChart: 'seats',
    coreFocus: '',   // desktop: the chart of the four-chart overview that is open large ('' = all four)
    seatTier: 'const', brush: null,
    coalition: null, coalMore: false,   // majority builder: the parties picked (null = start from the largest party)
    heatMetric: 'list', heatSort: 'region',
    recordBy: 'votes', recordTop: '10',   // candidate records: which ranking, and how many rows
    compare: [], detail: null,
    mView: 'summary',   // phones: the overview page shows either the summary or the map
  });
  let state = defaults();
  E69.state = () => state;

  /* ---------- names & small helpers ---------- */
  const provinceOf = code => D.provinceByCode.get(code);
  const pname = x => { const p = typeof x === 'string' ? provinceOf(x) : x; return p ? (lang === 'en' ? p.nameEn || p.name : p.name) : ''; };
  const ptitle = p => lang === 'en' ? (p.nameEn || p.name) : (p.code === '10' ? p.name : 'จังหวัด' + p.name);
  const rname = r => lang === 'en' ? (D.REGION_EN[r] || r) : r;
  const dname = r => lang === 'en' ? (r.provinceEn || r.province) + ' · Constituency ' + r.number : r.province + ' เขต ' + r.number;
  const dot = party => '<i class="dot" style="--c:' + esc(D.colorOf(party)) + '" aria-hidden="true"></i>';
  const thaiDate = iso => {
    const d = new Date(iso); if (!Number.isFinite(d.getTime())) return '—';
    if (lang === 'en') return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' });
    const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    const local = new Date(d.getTime() + 7 * 3600e3);
    return local.getUTCDate() + ' ' + months[local.getUTCMonth()] + ' ' + (local.getUTCFullYear() + 543);
  };
  const ICON = {
    overview: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>',
    analysis: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16v5"/><path d="M16 14v7"/><path d="M20 10v11"/><path d="m22 3-8.646 8.646a.5.5 0 0 1-.708 0L9.354 8.354a.5.5 0 0 0-.707 0L2 15"/><path d="M4 18v3"/><path d="M8 14v7"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
    map: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.1 6.3 9.9 4.2a2 2 0 0 0-1.8 0L3.6 6.5A1 1 0 0 0 3 7.4v12a1 1 0 0 0 1.4.9l3.7-1.9a2 2 0 0 1 1.8 0l4.2 2.1a2 2 0 0 0 1.8 0l4.5-2.3a1 1 0 0 0 .6-.9v-12a1 1 0 0 0-1.4-.9l-3.7 1.9a2 2 0 0 1-1.8 0Z"/><path d="M15 6.6v14.2M9 3.2v14.2"/></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
    filters: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/></svg>',
    expand: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m18 15-6-6-6 6"/></svg>',
    collapse: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>',
    // phone tab bar: the House (a hall with columns) and search with filters (a list that narrows, and a magnifier)
    house: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21h18M6 17v-6M10 17v-6M14 17v-6M18 17v-6M12 3l8 4.5H4z"/></svg>',
    find: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M3 12h8M3 18h5"/><circle cx="16" cy="15.5" r="3.5"/><path d="m21 20.5-2.5-2.5"/></svg>',
  };
  const isRegionIn = r => !state.region || r.region === state.region;
  const scopeRows = () => D.rows.filter(isRegionIn);
  const calmMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  // How much larger than the compact scale text is drawn right now ("type scale" in e69.css): 0 on phones and in
  // small desktop windows, 1.5 or 2.5 px where there is room. Text drawn by script (charts, map labels) adds it.
  const typeUp = () => { const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--f12')); return Number.isFinite(v) ? Math.max(0, v - 12) : 0; };

  /* ---------- colour theme ---------- */
  // Light or dark follows the device unless the visitor picks one from the menu beside the flags; the pick is kept on
  // this browser only. index.html applies it before the first paint, so the page never flashes the wrong theme.
  const THEME_KEY = 'e69-theme', darkQuery = matchMedia('(prefers-color-scheme: dark)');
  let themeChoice = 'system';
  try { const v = localStorage.getItem(THEME_KEY); if (v === 'light' || v === 'dark') themeChoice = v; } catch (e) { /* storage unavailable */ }
  const isDark = () => document.documentElement.dataset.theme === 'dark';
  // Colours the maps and charts paint directly; everything else uses the CSS variables in e69.css. Light values are
  // the original ones, dark ones are checked against the dark surfaces. Tile labels keep their own rule (dark ink on
  // light tiles, white on dark ones), which holds in both themes.
  const PALETTE = {
    light: { text: '#102631', text2: '#3b4f5b', text3: '#4b5e69', text4: '#5d707c', empty: '#d5dbe3', emptyInk: '#3b4f5b', otherInk: '#46445e', zero: '#e8ecf1', unset: '#e2e8f0', other: '#e3e6ee',
      seatBase: '#f1f5f9', shareBase: '#f8fafc', ring: '#fff', glass: '#ffffffd9', band: '#e0f2fe', mutedBar: '#dfe6ee', accentBar: '#0284c7', soft: '#5d707c66' },
    dark: { text: '#e5eef4', text2: '#bdcbd4', text3: '#90a3af', text4: '#90a3af', empty: '#3b4250', emptyInk: '#bdcbd4', otherInk: '#aab0c2', zero: '#252b36', unset: '#2b313d', other: '#2b313d',
      seatBase: '#1f2431', shareBase: '#1f2431', ring: '#0b1a23', glass: '#0b1a23d9', band: '#0d2f40', mutedBar: '#2b404c', accentBar: '#38a3db', soft: '#90a3af66' },
  };
  const colors = () => PALETTE[isDark() ? 'dark' : 'light'];
  // Party colours as drawn. Light mode uses them exactly as given; dark mode lifts the darkest (navy, purple, brown) so
  // they stand off the dark background. The darkest move most, which keeps their order and spacing; hue is kept (OKLCH)
  // and chroma trimmed only as far as needed to stay inside sRGB.
  const toLinear = c => (c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  const toByte = c => Math.round(255 * Math.max(0, Math.min(1, c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)));
  function toOklch(hex) {
    const c = d3.rgb(hex), r = toLinear(c.r), g = toLinear(c.g), b = toLinear(c.b);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
    return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, Math.hypot(A, B), Math.atan2(B, A)];
  }
  function oklchToLinear(L, C, h) {
    const A = C * Math.cos(h), B = C * Math.sin(h);
    const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3, m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3, s = (L - 0.0894841775 * A - 1.2914855480 * B) ** 3;
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
  }
  const lifted = new Map();
  function liftForDark(hex) {
    if (!lifted.has(hex)) {
      const [L, C, h] = toOklch(hex), L2 = Math.max(L, 0.43 + 0.33 * L);
      let c = C, rgb = oklchToLinear(L2, c, h);
      while (c > 0 && rgb.some(v => v < 0 || v > 1)) { c = Math.max(0, c - 0.004); rgb = oklchToLinear(L2, c, h); }
      lifted.set(hex, L2 - L < 0.005 ? hex : d3.rgb(...rgb.map(toByte)).formatHex());
    }
    return lifted.get(hex);
  }
  // The dataset as drawn in the current theme: only the party colours differ.
  const themedRaw = raw => isDark() ? { ...raw, parties: raw.parties.map(p => ({ ...p, color: liftForDark(p.color) })) } : raw;
  const buildD = ds => window.E69Data.build(themedRaw(ds.raw), window.ElectionModel, ds.reference, ds.portraits);

  /* ---------- in-place updates ---------- */
  // Bring `box` up to date with `html` but keep every element whose structure is unchanged, patching only its
  // attributes and text. Kept elements can then animate with CSS transitions (a highlight fading in, a bar
  // growing) and scroll positions stay where they were. Parts whose structure changed are replaced outright.
  function morph(box, html) {
    const next = document.createElement('div'); next.innerHTML = html;
    patchChildren(box, next);
  }
  function patchChildren(a, b) {
    const ac = a.childNodes, bc = b.childNodes;
    if (ac.length !== bc.length || [...ac].some((n, i) => n.nodeName !== bc[i].nodeName)) { a.replaceChildren(...bc); return; }
    for (let i = 0; i < ac.length; i++) patchNode(ac[i], bc[i]);
  }
  function patchNode(a, b) {
    if (a.nodeType !== 1) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return; }
    for (const { name } of [...a.attributes]) if (!b.hasAttribute(name)) a.removeAttribute(name);
    for (const { name, value } of [...b.attributes]) if (a.getAttribute(name) !== value) a.setAttribute(name, value);
    patchChildren(a, b);
  }
  // Restart a one-shot CSS animation class on an element.
  function replay(el, cls, ms) {
    if (!el || calmMotion()) return;
    el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
    clearTimeout(el['__' + cls]); el['__' + cls] = setTimeout(() => el.classList.remove(cls), ms || 600);
  }

  /* ---------- chart tooltip (shared with analysis) ---------- */
  // Phones have no hover. There a tap on a chart mark opens its tooltip as a card above the tab bar (see "tap to
  // inspect" further down); the chart's own hint ("click to …") becomes a button that does it, and a finger sliding
  // across a chart while the page scrolls opens nothing.
  let tipSource = '', inspecting = false;
  function chartTip(ev, html) {
    const box = $('chartTip');
    if (isM()) {
      if (ev && ev.pointerType === 'touch' && !inspecting) return;
      let act = '';
      const body = html.replace(/<small>((?:คลิก|Click )[^<]*)<\/small>\s*$/, (m, hint) => { act = hint.replace(/^คลิกเพื่อ\s*/, '').replace(/^Click (?:to|for) /, ''); return ''; });
      tipSource = html;
      box.innerHTML = body + (act ? '<button type="button" class="tip-act" data-act="tip-act">' + esc(act.charAt(0).toUpperCase() + act.slice(1)) + '</button>' : '') +
        '<button type="button" class="tip-close" data-act="tip-close" aria-label="' + t('ปิด', 'Close') + '">' + ICON.x + '</button>';
      box.style.left = box.style.top = ''; box.hidden = false;
      return;
    }
    box.innerHTML = html; box.hidden = false;
    const r = box.getBoundingClientRect(), pad = 12;
    let x = ev.clientX + 14, y = ev.clientY + 14;
    if (x + r.width > innerWidth - pad) x = ev.clientX - r.width - 14;
    if (y + r.height > innerHeight - pad) y = ev.clientY - r.height - 14;
    box.style.left = Math.max(pad, x) + 'px'; box.style.top = Math.max(pad, y) + 'px';
  }
  // Charts hide their tooltip when the pointer leaves a mark; a finger "leaves" right after every tap, so on phones
  // the card stays until it is closed, another mark is tapped or the chart is redrawn.
  const hideChartTip = ev => { if (isM() && ev && /^pointer(leave|out)$/.test(ev.type)) return; $('chartTip').hidden = true; tipSource = ''; };

  /* ---------- shared detail renderers (one data model for tooltip, panel and sheet) ---------- */
  function partial(agg) { return agg && !agg.complete ? ' <em class="partial">' + t('ข้อมูลไม่ครบ ', 'partial: ') + agg.n + '/' + agg.of + t(' เขต', '') + '</em>' : ''; }
  function value(agg, unit) { return agg && agg.value !== null ? fmt(agg.value) + (unit ? ' <small>' + unit + '</small>' : '') + partial(agg) : '<span class="na">' + t('ไม่มีข้อมูล', 'Not available') + '</span>'; }

  // Candidate portraits: official ECT photos cut out in the party-leader frame (scripts/prepare_mp_portraits.py).
  // election.csv names the file pattern; ids it lists as missing, and files that fail to load, get a neutral silhouette
  // in the party's tint instead. Purely illustrative: the name is always next to the photo, so the image has empty alt.
  const failedPhotos = new Set();
  // A person's name wraps between its words, never inside one unless a word alone is wider than the line (Thai line
  // breaking would otherwise split an unfamiliar surname, e.g. "ตันจรา / รักษ์").
  const nm = s => String(s ?? '').split(/\s+/).filter(Boolean).map(w => '<span class="nm-w">' + esc(w) + '</span>').join(' ');
  function photoSrc(c) {
    const cfg = CFG(), id = c && c.officialCandidateId;
    if (!cfg.candidatePhotos || !id || cfg.candidatePhotosMissing.includes(id)) return '';
    const src = cfg.candidatePhotos.replace('{id}', id);
    return failedPhotos.has(src) ? '' : src;
  }
  function face(c, party, size) {   // size: xs (search), sm (list rows), md (runner-up)
    const src = photoSrc(c);
    return '<span class="face face-' + size + (src ? '' : ' no-photo') + '"' + (party ? ' style="--c:' + esc(D.colorOf(party)) + '"' : '') + ' aria-hidden="true">' +
      (src ? '<img src="' + esc(src) + '" alt="" loading="lazy" decoding="async">' : '') + '</span>';
  }
  document.addEventListener('error', ev => {
    const img = ev.target, box = img.parentElement;
    if (img.tagName !== 'IMG' || !box || !box.matches('.face, .wc-photo')) return;
    failedPhotos.add(img.getAttribute('src')); box.classList.add('no-photo'); img.remove();
  }, true);

  // A figure's label keeps its bracket on one line: "ไม่เลือกผู้ใด" may wrap, "(แบบแบ่งเขต)" moves down whole.
  const keepBracket = s => esc(s).replace(/ \(([^()]+)\)$/, ' <span class="nw">($1)</span>');
  function provinceDetail(p, mode) {
    const interactive = mode !== 'tip';
    const sel = state.party, maxSeat = Math.max(1, ...p.seats.map(s => s.count));
    const seatRows = p.seats.map(s => ({ ...s }));
    if (sel && !seatRows.some(s => s.party === sel)) seatRows.push({ party: sel, count: 0, color: D.colorOf(sel), zero: true });
    const turnout = p.turnoutRate;
    const seatsHtml = seatRows.map(s => '<li class="' + (s.party === sel ? 'is-sel' : '') + (s.zero ? ' is-zero' : '') + '">' + dot(s.party) + '<span class="pn">' + esc(s.party) + '</span><span class="bar" aria-hidden="true"><i style="width:' + (100 * s.count / maxSeat) + '%;--c:' + esc(s.color) + '"></i></span><b>' + s.count + ' ' + t('เขต', s.count === 1 ? 'seat' : 'seats') + '</b></li>').join('');
    const winners = !interactive ? '' : p.winners.map(w => {
      const inner = '<span class="no">' + t('เขต ', 'No. ') + w.number + '</span>' + face(w.resolved ? D.byId.get(w.id).winner : null, w.party, 'sm') +
        (w.resolved
          ? '<span class="who"><b>' + nm(w.name) + '</b><small>' + dot(w.party) + esc(w.party) + '</small></span><span class="num">' + fmt(w.votes) + '<small>' + t('ห่าง ', 'lead ') + fmt(w.marginVotes) + ' (' + fmtP(w.marginPct, 1) + ')</small></span>'
          : '<span class="who"><b class="na">' + (w.tied ? t('คะแนนเท่ากัน ยังไม่ระบุผู้ชนะ', 'Tied – no winner assigned') : t('ยังระบุผู้ชนะไม่ได้', 'Winner unavailable')) + '</b></span><span class="num">—</span>');
      const cls = (w.party === sel ? 'is-sel ' : '') + (state.district === w.id ? 'is-cur' : '');
      return interactive ? '<li class="' + cls + '"><button type="button" data-act="district" data-v="' + w.id + '">' + inner + '</button></li>' : '<li class="' + cls + '">' + inner + '</li>';
    }).join('');
    const seatSum = p.seats.reduce((s, x) => s + x.count, 0);
    return '<div class="pd pd-' + mode + '">' +
      '<header class="pd-head"><p class="pd-meta"><span>' + esc(lang === 'en' ? rname(p.region) + ' region' : 'ภาค' + (p.region === 'กรุงเทพมหานคร' ? 'กลาง (กรุงเทพฯ)' : p.region)) + '</span><span' + (lang === 'th' ? ' lang="en">' + esc(p.nameEn || '') : ' lang="th">' + esc(p.name)) + '</span></p>' +
      '<h3 class="pd-title"' + (mode === 'sheet' ? '' : ' id="pdTitle-' + mode + '"') + '>' + esc(ptitle(p)) + '</h3>' +
      '<p class="pd-count">' + t('จำนวนเขตเลือกตั้ง: ', 'Constituencies: ') + '<b>' + p.count + '</b> ' + t('เขต', '') + '</p></header>' +
      '<dl class="pd-stats">' +
      '<div><dt>' + t('ผู้มาใช้สิทธิ', 'Voters who turned out') + '</dt><dd>' + value(p.turnout, t('คน', 'people')) + '</dd></div>' +
      '<div class="hl"><dt>' + t('อัตราการใช้สิทธิ', 'Turnout rate') + '</dt><dd>' + (turnout.value !== null ? fmtP(turnout.value) + partial(turnout) : '<span class="na">' + t('ไม่มีข้อมูล', 'Not available') + '</span>') + '</dd></div>' +
      '<div><dt>' + t('ผู้มีสิทธิเลือกตั้ง', 'Eligible voters') + '</dt><dd>' + value(p.eligible, t('คน', 'people')) + '</dd></div>' +
      '<div><dt>' + keepBracket(t('บัตรเสีย (แบบแบ่งเขต)', 'Invalid ballots (constituency)')) + '</dt><dd>' + value(p.invalid, t('ใบ', 'ballots')) + '</dd></div>' +
      '<div><dt>' + keepBracket(t('บัตรเสีย (บัญชีรายชื่อ)', 'Invalid ballots (party-list)')) + '</dt><dd>' + value(p.invalidList, t('ใบ', 'ballots')) + '</dd></div>' +
      '<div><dt>' + keepBracket(t('ไม่เลือกผู้ใด (แบบแบ่งเขต)', 'No-vote ballots (constituency)')) + '</dt><dd>' + value(p.noVote, t('ใบ', 'ballots')) + '</dd></div>' +
      '</dl>' +
      (turnout.value !== null ? '<p class="pd-sub">' + t('ผู้มาใช้สิทธิ ', 'Turnout: ') + fmt(turnout.numerator) + t(' จากผู้มีสิทธิ ', ' of ') + fmt(turnout.denominator) + t(' คน', ' eligible voters') + '</p>' : '') +
      '<section class="pd-seats"><h4>' + t('จำนวนเขตที่แต่ละพรรคชนะ', 'Constituencies won by each party') + '</h4><ul>' + seatsHtml + '</ul>' +
      '<p class="pd-check">' + t('รวม ', 'Total ') + seatSum + t(' จาก ', ' of ') + p.count + t(' เขต', ' constituencies') + (p.unresolved ? ' · ' + t('ยังไม่มีผู้ชนะ ', 'unresolved ') + p.unresolved : '') + (sel ? ' · ' + t('ไฮไลต์พรรคที่เลือก ตัวเลขยังเป็นผลทั้งจังหวัด', 'selected party highlighted; figures remain complete province results') : '') + '</p></section>' +
      // The hover tooltip stays a short summary; the result of every constituency is one click away (pinned panel).
      (interactive ? '<section class="pd-winners"><h4>' + t('ผลการเลือกตั้งรายเขต', 'Result in each constituency') + ' <small>' + p.count + t(' เขต', ' total') + '</small></h4><ol class="pd-list">' + winners + '</ol></section>' : '') +
      '<footer class="pd-foot">' + (mode === 'tip' ? '<b class="pd-more">' + t('คลิกเพื่อดูผลทั้ง ' + p.count + ' เขตและแผนที่รายเขต', 'Click to see all ' + p.count + ' constituency results and the constituency map') + '</b> ' : '') + t('ผลทางการทั้งจังหวัดจาก กกต. ไม่ขึ้นกับตัวกรอง อัตราการใช้สิทธิคิดจากผู้มาใช้สิทธิรวมทุกเขตหารด้วยผู้มีสิทธิรวม บัตรเสียแยกตามชนิดบัตร', 'Complete official ECT results for the province, unaffected by filters. Turnout divides total voters by total eligible voters; invalid ballots are listed per ballot type.') + '</footer></div>';
  }

  // ECT's own figures for a few constituencies do not add up exactly; say so instead of silently correcting them.
  function ballotNote(r) {
    const parts = [];
    if (r.ballotGap) parts.push(t('บัตรแบบแบ่งเขต: บัตรดี + บัตรเสีย + ไม่เลือกผู้ใด ', 'Constituency ballot: valid + invalid + no-vote is ') + (r.ballotGap > 0 ? t('มากกว่า', 'more than') : t('น้อยกว่า', 'less than')) + t('ผู้มาใช้สิทธิ ', ' turnout by ') + Math.abs(r.ballotGap) + t(' ใบ', ''));
    if (r.listBallotGap) parts.push(t('บัตรบัญชีรายชื่อ: ยอดรวม', 'Party-list ballot: total is ') + (r.listBallotGap > 0 ? t('มากกว่า', 'more than') : t('น้อยกว่า', 'less than')) + t('ผู้มาใช้สิทธิ ', ' turnout by ') + Math.abs(r.listBallotGap) + t(' ใบ', ''));
    return parts.length ? '<p class="data-note">' + esc(parts.join(' ')) + ' ' + t('ตามตัวเลขที่ กกต. ประกาศ ระบบไม่ได้แก้ค่าต้นทาง', 'as published by ECT; the source values are not altered.') + '</p>' : '';
  }
  function districtDetail(r, mode) {
    const p = provinceOf(r.provinceCode), party = state.party || r.winnerParty, c = party ? D.comparison(r, party) : null;
    const top = r.candidates[0]?.votes || 1;
    const cands = r.candidates.map((x, i) => '<li class="' + (x.officialCandidateId && x.officialCandidateId === state.candidate ? 'is-cur ' : '') + (x.party === state.party ? 'is-sel' : '') + '"><span class="rk">' + (i + 1) + '</span>' + face(x, x.party, 'sm') + '<span class="who"><b>' + nm(x.name) + '</b><small>' + dot(x.party) + esc(x.party) + ' · ' + t('หมายเลข ', 'No. ') + x.number + '</small></span><span class="bar" aria-hidden="true"><i style="width:' + (100 * (x.votes || 0) / top) + '%;--c:' + esc(D.colorOf(x.party)) + '"></i></span><span class="num">' + fmt(x.votes) + '<small>' + fmtP(D.rows.length && r.validVotes ? x.votes / r.validVotes * 100 : null) + '</small></span></li>').join('');
    let ballots = '';
    if (c) {
      ballots = c.candidatePresent && c.candidateShare !== null && c.listShare !== null
        ? '<div class="ballots"><div><span>' + t('บัตรเลือกผู้สมัคร (แบ่งเขต)', 'Constituency ballot') + '</span><span class="bar"><i style="width:' + c.candidateShare + '%;--c:' + esc(D.colorOf(party)) + '"></i></span><b>' + fmtP(c.candidateShare) + '</b><small>' + fmt(c.candidateVotes) + ' / ' + fmt(c.candidateDenominator) + '</small></div>' +
          '<div><span>' + t('บัตรเลือกพรรค (บัญชีรายชื่อ)', 'Party-list ballot') + '</span><span class="bar hollow"><i style="width:' + c.listShare + '%;--c:' + esc(D.colorOf(party)) + '"></i></span><b>' + fmtP(c.listShare) + '</b><small>' + fmt(c.listVotes) + ' / ' + fmt(c.listDenominator) + '</small></div>' +
          '<p>' + t('ส่วนต่าง (บัญชีรายชื่อ − ผู้สมัคร): ', 'Difference (list − candidate): ') + '<b>' + fmtPP(c.ppGap) + t(' จุดเปอร์เซ็นต์', ' pp') + '</b> · ' + fmtPP(c.voteGap, 0) + t(' คะแนน', ' votes') + '</p></div>'
        : '<p class="na-box">' + (c.candidatePresent ? t('ข้อมูลคะแนนสองใบไม่ครบ', 'Two-ballot data incomplete') : t('พรรคนี้ไม่ได้ส่งผู้สมัครในเขตนี้ จึงไม่มีคะแนนผู้สมัครให้เทียบ (ไม่แทนด้วยศูนย์)', 'This party fielded no candidate here, so there is no candidate share to compare (not treated as zero).')) + '</p>';
    }
    const inCmp = state.compare.includes(r.id), cmpFull = !inCmp && state.compare.length >= 3;   // the comparison holds 3 (CMP_MAX in e69-analysis.js)
    const actions = mode !== 'tip' ? '<div class="dd-actions">' + (state.page === 'analysis' ? '<button type="button" class="ghost-btn" data-act="compare-add" data-v="' + r.id + '"' + (inCmp || cmpFull ? ' disabled' : '') + '>' + (inCmp ? t('อยู่ในรายการเปรียบเทียบแล้ว', 'Already in comparison') : cmpFull ? t('เปรียบเทียบครบ 3 เขตแล้ว', 'Comparison full (3)') : t('+ เพิ่มในการเปรียบเทียบ', '+ Add to comparison')) + '</button><button type="button" class="ghost-btn" data-act="goto-map" data-v="' + r.id + '">' + t('ดูบนแผนที่ภาพรวม', 'Show on overview map') + '</button>' : '<button type="button" class="ghost-btn" data-act="province" data-v="' + r.provinceCode + '">' + t('← ทุกเขตใน', '← All constituencies in ') + esc(pname(p)) + '</button>') + '</div>' : '';
    return '<div class="dd dd-' + mode + '"><header class="pd-head"><p class="pd-meta"><span>' + esc(ptitle(p)) + '</span></p><h3 class="pd-title">' + t('เขตเลือกตั้งที่ ', 'Constituency ') + r.number + '</h3>' + (r.zone?.length ? '<p class="zone">' + esc(r.zone.join(' · ')) + '</p>' : '') + '</header>' +
      // Winner (large portrait) above the runner-up (smaller), with the gap between them; the size order is the result.
      (r.winnerParty ? '<div class="winner-card' + (photoSrc(r.winner) ? ' has-photo' : '') + '" style="--c:' + esc(D.colorOf(r.winnerParty)) + '"><small>' + t('ผู้ชนะ', 'Winner') + '</small><b>' + nm(r.winnerName) + '</b><span>' + dot(r.winnerParty) + esc(r.winnerParty) + ' · ' + t('หมายเลข ', 'No. ') + r.winner.number + '</span><strong>' + fmt(r.winnerVotes) + ' <small>' + t('คะแนน', 'votes') + ' · ' + fmtP(r.winnerShare) + '</small></strong>' +
        (photoSrc(r.winner) ? '<span class="wc-photo" aria-hidden="true"><img src="' + esc(photoSrc(r.winner)) + '" alt="" decoding="async"></span>' : '') + '</div>' +
        (r.runner ? '<div class="runner-up">' + face(r.runner, r.runner.party, 'md') + '<span class="who"><small>' + t('อันดับสอง', 'Runner-up') + '</small><b>' + nm(r.runner.name) + '</b><small><span class="nw">' + dot(r.runner.party) + esc(r.runner.party) + '</span> · ' + fmt(r.runner.votes) + t(' คะแนน', ' votes') + '</small></span>' +
          '<span class="gap"><small>' + t('ส่วนต่างคะแนน', 'Victory margin') + '</small><b>' + fmt(r.marginVotes) + '</b><small>' + t('คะแนน · ', 'votes · ') + fmtP(r.marginPct) + '</small></span></div>' : '')
        : '<p class="na-box">' + (r.tied ? t('คะแนนอันดับหนึ่งเท่ากัน ยังไม่ระบุผู้ชนะ', 'First place is tied; no winner is assigned') : t('ยังระบุผู้ชนะไม่ได้', 'Winner unavailable')) + '</p>') +
      '<dl class="pd-stats dd-stats">' +
      '<div class="hl"><dt>' + t('อัตราการใช้สิทธิ', 'Turnout rate') + '</dt><dd>' + fmtP(r.turnoutPct) + ' <small class="of">' + fmt(r.turnout) + ' / ' + fmt(r.eligible) + '</small></dd></div>' +
      '<div><dt>' + keepBracket(t('บัตรเสีย (แบบแบ่งเขต)', 'Invalid (constituency)')) + '</dt><dd>' + fmt(r.invalid) + ' <small>' + t('ใบ', 'ballots') + '</small></dd></div>' +
      '<div><dt>' + keepBracket(t('ไม่เลือกผู้ใด (แบบแบ่งเขต)', 'No vote (constituency)')) + '</dt><dd>' + fmt(r.noVote) + ' <small>' + t('ใบ', 'ballots') + '</small></dd></div>' +
      '<div><dt>' + keepBracket(t('บัตรดี (แบบแบ่งเขต)', 'Valid (constituency)')) + '</dt><dd>' + fmt(r.validVotes) + ' <small>' + t('ใบ', 'ballots') + '</small></dd></div>' +
      '</dl>' + ballotNote(r) + actions +
      '<section class="dd-cands"><h4>' + t('คะแนนผู้สมัครทุกคน', 'All candidates') + ' <small>' + r.candidates.length + t(' คน · % ของบัตรดีแบบแบ่งเขต', ' · % of valid constituency ballots') + '</small></h4><ol class="cand-list">' + cands + '</ol></section>' +
      (c ? '<section class="dd-ballots"><h4>' + t('คะแนนสองใบของพรรค', 'Two ballots for ') + esc(party) + ' <small>' + (state.party ? t('พรรคที่เลือก', 'selected party') : t('พรรคของผู้ชนะ', 'winning party')) + '</small></h4>' + ballots + '<p class="caveat">' + t('ข้อมูลระดับเขตไม่สามารถบอกได้ว่าผู้ใช้สิทธิคนใดเลือกต่างกันในสองบัตร', 'District totals cannot reveal how any individual voter split their ballots.') + '</p></section>' : '') +
      '</div>';
  }

  /* ---------- sidebar & top bar ---------- */
  function renderSidebar() {
    // Patched in place, so the sheen across the current page's item (e69.css) plays only when the page changes.
    morph($('primaryNav'), [['overview', t('ภาพรวม', 'Overview'), t('ผลสรุป แผนที่ และการ์ดพรรค', 'Results, map and party cards')], ['analysis', t('วิเคราะห์ข้อมูล', 'Data Analysis'), t('กราฟเปรียบเทียบและการกระจาย', 'Comparisons and distributions')]]
      .map(([v, label, sub]) => '<a href="#' + v + '" class="nav-item' + (state.page === v ? ' active' : '') + '" data-act="page" data-v="' + v + '"' + (state.page === v ? ' aria-current="page"' : '') + '>' + ICON[v] + '<span><b>' + label + '</b><small>' + sub + '</small></span></a>').join(''));
    $('primaryNav').setAttribute('aria-label', t('หน้า', 'Pages'));
    $('sidebar').setAttribute('aria-label', t('เมนูหลัก', 'Main menu'));
    // Rewritten only when the number changes, so the logo's light keeps running smoothly across renders.
    const brandWord = document.querySelector('#sidebar .brand-word'), brandHtml = 'ELECTION<b>' + esc(CFG().brandNumber) + '</b>';
    if (brandWord.innerHTML !== brandHtml) { brandWord.innerHTML = brandHtml; brandWord.dataset.text = 'ELECTION' + CFG().brandNumber; }
    $('brandSub').textContent = t('ผลเลือกตั้งไทย ' + CFG().beYear, 'Thai general election ' + CFG().year);
    $('search').placeholder = t('เช่น บางรัก, นครราชสีมา 3, ชื่อผู้สมัคร', 'e.g. Bang Rak, Chiang Mai 3, a candidate');
    $('searchLabel').textContent = isM() ? t('พิมพ์ชื่อจังหวัด เลขเขต อำเภอหรือตำบล ชื่อผู้สมัคร หรือพรรค แล้วเลือกจากรายการ', 'Type a province, a constituency number, a district or sub-district (in Thai), a candidate or a party, then pick from the list')
      : t('ค้นหาจังหวัด เขต/อำเภอ ผู้สมัคร หรือพรรค', 'Search a place, candidate or party');
    $('langGroup').setAttribute('aria-label', t('เลือกภาษา', 'Choose language'));
    document.querySelectorAll('#langGroup button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === lang)));
    $('sourcesLabel').textContent = t('ที่มาข้อมูลและวิธีอ่าน', 'Sources & how to read');
    $('closeNavLabel').textContent = t('ปิดเมนู', 'Close menu'); $('menuLabel').textContent = t('เมนู', 'Menu');
    $('skipLink').textContent = t('ข้ามไปยังเนื้อหา', 'Skip to content');
    $('sheetCloseLabel').textContent = t('ปิด', 'Close');
    // Phone-only parts (hidden on desktop): the panel's buttons, the menu button and its drawer, search examples.
    $('mPanelCloseLabel').textContent = t('ปิด', 'Close'); $('mDone').textContent = t('แสดงผล', 'Show results');
    $('mMenuLabel').textContent = t('เมนู: ธีมสี อัปเดตข้อมูล และที่มาข้อมูล', 'Menu: colour theme, data refresh and sources');
    $('mDrawerPanel').setAttribute('aria-label', t('เมนู', 'Menu')); $('mDrawerCloseLabel').textContent = t('ปิดเมนู', 'Close menu');
    if ($('mDrawerWord').innerHTML !== brandHtml) { $('mDrawerWord').innerHTML = brandHtml; $('mDrawerWord').dataset.text = 'ELECTION' + CFG().brandNumber; }
    $('mDrawerSub').textContent = $('brandSub').textContent;
    $('mTabbar').setAttribute('aria-label', t('เมนูหลัก', 'Main menu'));
    const examples = lang === 'en' ? ['Bangkok', 'Chiang Mai 3', 'Khon Kaen', 'บางรัก', 'ประชาชน'] : ['กรุงเทพมหานคร', 'เชียงใหม่ 3', 'โคราช', 'บางรัก', 'ประชาชน'];
    $('mExamples').innerHTML = '<span class="ex-h">' + t('เช่น', 'Try') + '</span>' + examples.map(x => '<button type="button" data-act="m-example" data-v="' + esc(x) + '">' + esc(x) + '</button>').join('');
    const opt = (v, label, cur) => '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(label) + '</option>';
    const provinceOpts = D.provinces.filter(p => !state.region || p.region === state.region).slice().sort((a, b) => pname(a).localeCompare(pname(b), lang === 'en' ? 'en' : 'th'));
    $('filters').innerHTML =
      '<span class="side-label">' + (isM() ? t('ตัวกรอง (ใช้กับทุกหน้า)', 'Filters (apply to every view)') : t('ตัวกรองร่วม (ใช้ทั้งสองหน้า)', 'Shared filters (both pages)')) + '</span>' +
      '<label class="field"><span>' + t('ภูมิภาค', 'Region') + '</span><select id="fRegion">' + opt('', t('ทุกภูมิภาค', 'All regions'), state.region) + D.regions.map(r => opt(r.name, rname(r.name) + ' (' + r.count + ')', state.region)).join('') + '</select></label>' +
      '<label class="field"><span>' + t('จังหวัด', 'Province') + '</span><select id="fProvince">' + opt('', t('ทุกจังหวัด', 'All provinces'), state.province) + provinceOpts.map(p => opt(p.code, pname(p), state.province)).join('') + '</select></label>' +
      '<label class="field"><span>' + t('พรรคที่สนใจ', 'Party of interest') + '</span><select id="fParty">' + opt('', t('ทุกพรรค', 'All parties'), state.party) + D.seatParties.map(p => opt(p.name, p.name + ' · ' + p.totalSeats + t(' ที่นั่ง', ' seats'), state.party)).join('') + '<optgroup label="' + esc(t('พรรคที่ไม่ได้ที่นั่ง', 'Parties without seats')) + '">' + D.parties.filter(p => !p.totalSeats).sort((a, b) => a.name.localeCompare(b.name, 'th')).map(p => opt(p.name, p.name, state.party)).join('') + '</optgroup></select></label>';
  }

  function renderTopbar() {
    const ov = state.page === 'overview';
    $('pageTitle').textContent = ov ? t('ภาพรวมผลเลือกตั้ง', 'Election Overview') : t('วิเคราะห์ผลการเลือกตั้ง', 'Election Results Analysis');
    $('pageSub').textContent = ov ? t('เลือกตั้ง สส. ' + electionDay() + ' ข้อมูลจาก ' + CFG().sourceTh + ' ณ ', 'General election of ' + electionDay() + ', ' + CFG().sourceEn + ' results as of ') + thaiDate(D.updatedAt)
      : t('เปรียบเทียบคะแนน ดูการกระจายผล และหารูปแบบการแข่งขันใน ' + D.rows.length + ' เขต', 'Compare votes, explore distributions and find competitive patterns across ' + D.rows.length + ' constituencies');
    if (isM()) {
      // One short line each on a phone: the view's name, then election day and the date of the data.
      const [y, m, d] = CFG().date.split('-').map(Number), MS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
      $('pageTitle').textContent = !ov ? t('วิเคราะห์ผลเลือกตั้ง', 'Results Analysis') : state.mView === 'map' ? t('แผนที่ผลเลือกตั้ง', 'Results Map') : t('ภาพรวมผลเลือกตั้ง', 'Election Overview');
      $('pageSub').textContent = (lang === 'en' ? d + ' ' + MONTHS_EN[m - 1].slice(0, 3) + ' ' + y : d + ' ' + MS[m - 1] + ' ' + (y + 543)) + ' · ' + t(CFG().sourceTh + ' ณ ', CFG().sourceEn + ' as of ') + thaiDate(D.updatedAt);
    }
    renderDataStatus(); renderThemeControl();
    const chips = [];
    if (state.region) chips.push(['region', t('ภูมิภาค ', 'Region: ') + rname(state.region)]);
    if (state.party) chips.push(['party', t('พรรค', 'Party: ') + state.party]);
    if (state.province) chips.push(['province', pname(state.province)]);
    if (state.district) chips.push(['district', dname(D.byId.get(state.district))]);
    if (state.brush && !ov) chips.push(['brush', state.brush.label + ' (' + state.brush.ids.length + t(' เขต)', ')')]);
    // A chip that just appeared (or changed its label) pops in, so the new filter is easy to spot.
    const keys = new Set(chips.map(([k, label]) => k + '|' + label)), fresh = k => chipKeys && !chipKeys.has(k) && !calmMotion();
    $('chips').innerHTML = chips.map(([k, label]) => '<button type="button" class="chip chip-' + k + (fresh(k + '|' + label) ? ' chip-in' : '') + '" data-act="unset" data-v="' + k + '" aria-label="' + esc(t('ล้าง ', 'Remove ') + label) + '">' + esc(label) + '<span aria-hidden="true">×</span></button>').join('');
    chipKeys = keys;
  }
  let chipKeys = null;

  /* ---------- Overview ---------- */
  function overviewSkeleton() {
    $('pageOverview').innerHTML =
      '<div class="ov">' +
      '<section class="kpis" id="kpis"></section>' +
      '<section class="card parties-card" aria-labelledby="partiesTitle"><div class="card-head"><h2 id="partiesTitle"></h2><div id="partyOthers"></div></div><div class="party-cards" id="partyCards"></div></section>' +
      '<section class="card map-card" aria-labelledby="mapTitle"><div class="card-head map-head"><div id="mapHeading"></div><div class="map-controls" id="mapControls"></div></div>' +
      '<div class="map-stage" id="mapStage"><svg id="hexmap" role="group"></svg><svg id="distmap" role="group" hidden></svg><p class="map-loading" id="mapLoading" hidden></p><div class="map-tools" id="mapTools"></div><div class="map-legend" id="mapLegend"></div><p class="lens-hint m-only" id="lensHint" aria-hidden="true"></p></div>' +
      '<p class="map-credit" id="mapCredit"></p>' +
      '</section>' +
      '<section class="card context-card" id="context" aria-live="polite"></section>' +
      // Phones only: a way into the map, the House and the closest races, a footer (the desktop shows these beside the map).
      '<button type="button" class="card m-map-cta m-only" id="mMapCta" data-act="m-tab" data-v="map"></button>' +
      '<section class="card m-national m-only" id="mNational"></section>' +
      '<footer class="m-foot m-only" id="mFoot"></footer>' +
      '</div>';
    buildMap();
  }

  function renderOverview() {
    if (!$('hexmap')) overviewSkeleton();
    const ov = document.querySelector('#pageOverview .ov'), focus = !!(state.province || state.district);
    // Phones: the panel under the map is sized before the map measures itself, so a fly-in lands in the right place.
    if (isM()) ov.dataset.panel = state.mView === 'map' && focus ? mPanelSize : 'none'; else delete ov.dataset.panel;
    // Pinning a province folds the party cards into a strip; fade the strip in rather than snapping.
    if (ov.classList.contains('focus') !== focus) { ov.classList.toggle('focus', focus); replay($('partyCards'), 'cards-in', 400); }
    renderKpis(); renderParties(); renderMapControls(); updateMap(); renderContext();
    if (isM()) renderPhoneSummary();
  }
  // Phones: the summary view's way into the map (a small copy of the map in its current colours), the House and the
  // closest races, and where the data comes from.
  function renderPhoneSummary() {
    morph($('mNational'), nationalContext());
    const { out } = mapEncoding(), pats = [];
    const polys = tiles.map(d => {
      let fill = (out.get(d.code) || {}).fill || colors().empty;
      const tie = /^url\(#tie(\d+)\)$/.exec(fill);
      if (tie) {   // tie stripes get their own copy here: the originals live in the full map, which may be hidden
        const lead = provinceOf(tie[1]).leaders, w = 5;
        pats.push('<pattern id="mtie' + tie[1] + '" patternUnits="userSpaceOnUse" width="' + w * lead.length + '" height="10" patternTransform="rotate(45)">' + lead.map((x, i) => '<rect x="' + i * w + '" width="' + w + '" height="10" fill="' + esc(D.colorOf(x)) + '"/>').join('') + '</pattern>');
        fill = 'url(#mtie' + tie[1] + ')';
      }
      return '<polygon points="' + hexPoints(d.cx, d.cy) + '" fill="' + esc(fill) + '"' + (isOutside(d.code) ? ' opacity=".22"' : '') + '/>';
    }).join('');
    $('mMapCta').innerHTML = '<svg class="mini" viewBox="' + [vb.x, vb.y, vb.w, vb.h].join(' ') + '" aria-hidden="true"><defs>' + pats.join('') + '</defs>' + polys + '</svg>' +
      '<span class="txt"><span class="t1">' + t('แต่ละจังหวัดเลือกพรรคไหน', 'How each province voted') + '</span><span class="t2">' + t('แผนที่ 77 จังหวัด แตะจังหวัดเพื่อดูผลรายเขตและคะแนนผู้สมัครทุกคน', 'A map of all 77 provinces: tap one for each constituency and every candidate') + '</span><span class="go">' + t('เปิดแผนที่', 'Open the map') + ICON.next + '</span></span>';
    $('mFoot').innerHTML = '<span>' + t('ผลอย่างเป็นทางการจาก ' + CFG().sourceTh + ' ณ ', 'Official results from the ' + CFG().sourceEn + ' as of ') + esc(thaiDate(D.updatedAt)) + '</span><button type="button" class="ghost-btn" data-act="sources"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/></svg>' + t('ที่มาข้อมูลและวิธีอ่าน', 'Sources & how to read') + '</button>';
  }

  function renderKpis() {
    const rows = scopeRows(), s = state.region ? D.summarize(rows) : D.national;
    const scope = state.region ? rname(state.region) : t('ทั้งประเทศ', 'Nationwide');
    const items = [
      [t('ผู้มาใช้สิทธิ', 'Voters who turned out') + (state.region ? ' ' + (lang === 'th' && state.region !== 'กรุงเทพมหานคร' ? 'ภาค' : '') + scope : ''), fmt(s.turnout.value), fmtP(s.turnoutRate.value) + t(' ของผู้มีสิทธิ ', ' of ') + fmt(s.eligible.value) + t(' คน', ' eligible')],
      [t('บัตรเสีย แบบแบ่งเขต', 'Invalid ballots (constituency)'), fmt(s.invalid.value), fmtP(s.invalidRate.value) + t(' ของผู้มาใช้สิทธิ', ' of turnout')],
      [t('เขตเลือกตั้ง', 'Constituencies'), fmt(rows.length) + (state.region ? '<small> / ' + D.rows.length + '</small>' : ''), t('ใน ', 'in ') + new Set(rows.map(r => r.provinceCode)).size + t(' จังหวัด', ' provinces')],
      [t('เขตที่ชนะกันไม่ถึง 5%', 'Won by under 5%'), fmt(s.closeRaces), t('คิดจากบัตรดีแบบแบ่งเขต', 'of valid constituency ballots')],
    ];
    $('kpis').setAttribute('aria-label', t('ตัวเลขสรุป', 'Key figures'));
    $('kpis').innerHTML = items.map(([label, v, note]) => '<div class="kpi"><span class="kpi-label">' + label + '</span><strong class="kpi-value">' + v + '</strong><span class="kpi-note">' + note + '</span></div>').join('');
  }

  function portraitImg(p) {
    const pt = p.portrait;
    if (!pt || !pt.src) return '';
    const role = pt.verifiedPMCandidate === false ? t('ผู้สมัครบัญชีรายชื่อ', 'Party-list candidate') : t('แคนดิเดตนายกรัฐมนตรี', 'PM candidate');
    return '<img src="' + esc(pt.src) + '" data-fallback="' + esc(pt.fallback || '') + '" alt="' + esc(pt.name + ' · ' + role + t(' พรรค', ', ') + p.name) + '" loading="eager" decoding="async">';
  }

  function renderParties() {
    const c = CFG();
    $('partiesTitle').innerHTML = t('พรรคไหนได้ที่นั่งมากที่สุด', 'Which parties won the most seats') + ' <small>' + t('จาก ' + c.totalSeats + ' ที่นั่ง <span class="nw">(เขต ' + c.constituencySeats + ' บัญชีรายชื่อ ' + c.listSeats + ')</span>', 'of ' + c.totalSeats + ' seats <span class="nw">(' + c.constituencySeats + ' constituency, ' + c.listSeats + ' list)</span>') + '</small>';
    const others = D.seatParties.filter(p => !p.principal);
    $('partyCards').setAttribute('aria-label', t('การ์ดพรรคการเมือง', 'Party cards'));
    // Patched in place so choosing a party fades the other cards instead of redrawing all ten.
    morph($('partyCards'), D.principal.map(p => {
      const on = state.party === p.name;
      const role = p.portrait ? (p.portrait.verifiedPMCandidate === false ? t('ผู้สมัครบัญชีรายชื่อ', 'Party-list candidate') : t('แคนดิเดตนายกฯ', 'PM candidate')) : '';
      return '<button type="button" class="party-card' + (on ? ' selected' : '') + (state.party && !on ? ' dimmed' : '') + '" style="--party:' + esc(p.color) + '" data-act="party" data-v="' + esc(p.name) + '" aria-pressed="' + on + '">' +
        '<span class="pc-name">' + esc(p.name) + '</span><strong class="pc-total">' + p.totalSeats + '</strong>' +
        '<span class="pc-split"><span>' + t('เขต ', 'Const. ') + p.constituencySeats + '</span><span>' + t('บัญชี ', 'List ') + p.listSeats + '</span></span>' +
        '<span class="pc-bar" aria-hidden="true"><i style="width:' + (100 * p.constituencySeats / Math.max(1, p.totalSeats)) + '%"></i></span>' +
        (p.portrait ? '<span class="pc-person">' + esc(p.portrait.name.replace(/^นาย/, '')).split(/\s+/).map(w => '<span class="nw">' + w + '</span>').join(' ') + '<small>' + role + '</small></span>' : '') +
        '<span class="pc-photo">' + portraitImg(p) + '</span></button>';
    }).join(''));
    $('partyOthers').innerHTML = '<button type="button" class="others-row" data-act="page" data-v="analysis" data-chart="seats" title="' + esc(t('เขต ', 'Constituency ') + others.reduce((s, p) => s + p.constituencySeats, 0) + t(' บัญชีรายชื่อ ', ', list ') + others.reduce((s, p) => s + p.listSeats, 0)) + '"><span>' + t('อีก ', 'Another ') + others.length + t(' พรรค ', ' parties: ') + '<b>' + others.reduce((s, p) => s + p.totalSeats, 0) + t(' ที่นั่ง', ' seats') + '</b></span><span>' + t('ดูทุกพรรค', 'See all') + '</span></button>';
    $('partyCards').querySelectorAll('img').forEach(img => { img.onerror = () => { img.onerror = null; if (img.dataset.fallback) img.src = img.dataset.fallback; }; });
  }

  /* ---------- hex map ---------- */
  const R = 18, SQ3 = Math.sqrt(3);
  let tiles = [], vb, zoomBehavior, camera = d3.zoomIdentity, tipCode = '', focusCode = '', measureCtx, labelFrame;
  const hexPoints = (cx, cy) => Array.from({ length: 6 }, (_, i) => { const a = Math.PI / 6 * (1 + 2 * i); return (cx + R * Math.cos(a)).toFixed(2) + ',' + (cy + R * Math.sin(a)).toFixed(2); }).join(' ');

  // Curated word boundaries for multiline tile labels: full names are wrapped only between words, never abbreviated.
  const BREAKS = { 10: 'กรุงเทพ|มหานคร', 11: 'สมุทร|ปราการ', 12: 'นนท|บุรี', 13: 'ปทุม|ธานี', 14: 'พระนคร|ศรี|อยุธยา', 15: 'อ่าง|ทอง', 16: 'ลพ|บุรี', 17: 'สิงห์|บุรี', 18: 'ชัย|นาท', 19: 'สระ|บุรี', 20: 'ชล|บุรี', 22: 'จันท|บุรี', 24: 'ฉะเชิง|เทรา', 25: 'ปราจีน|บุรี', 26: 'นคร|นายก', 27: 'สระ|แก้ว',
    30: 'นคร|ราช|สีมา', 31: 'บุรี|รัมย์', 33: 'ศรี|สะ|เกษ', 34: 'อุบล|ราช|ธานี', 35: 'ยโส|ธร', 36: 'ชัย|ภูมิ', 37: 'อำนาจ|เจริญ', 38: 'บึง|กาฬ', 39: 'หนอง|บัว|ลำภู', 40: 'ขอน|แก่น', 41: 'อุดร|ธานี', 43: 'หนอง|คาย', 44: 'มหา|สาร|คาม', 45: 'ร้อย|เอ็ด', 46: 'กาฬ|สินธุ์', 47: 'สกล|นคร', 48: 'นคร|พนม', 49: 'มุก|ดาหาร',
    50: 'เชียง|ใหม่', 51: 'ลำ|พูน', 52: 'ลำ|ปาง', 53: 'อุตร|ดิตถ์', 56: 'พะ|เยา', 57: 'เชียง|ราย', 58: 'แม่|ฮ่องสอน', 60: 'นคร|สวรรค์', 61: 'อุทัย|ธานี', 62: 'กำแพง|เพชร', 64: 'สุโข|ทัย', 65: 'พิษณุ|โลก', 66: 'พิ|จิตร', 67: 'เพชร|บูรณ์',
    70: 'ราช|บุรี', 71: 'กาญจน|บุรี', 72: 'สุพรรณ|บุรี', 73: 'นคร|ปฐม', 74: 'สมุทร|สาคร', 75: 'สมุทร|สงคราม', 76: 'เพชร|บุรี', 77: 'ประจวบ|คีรี|ขันธ์', 80: 'นคร|ศรี|ธรรมราช', 84: 'สุราษฎร์|ธานี', 93: 'พัท|ลุง', 94: 'ปัต|ตานี', 96: 'นรา|ธิวาส' };
  // Long romanised words may break at a syllable edge with a hyphen (Ratcha-thani); short words never break.
  // A break never splits th, ph, kh, ch or ng (Phang-nga, not Phan-gnga), and the next syllable starts with one
  // consonant or a real cluster (Phet-cha, not Phe-tcha). `min` is the shortest word that may break.
  function hyphenate(word, min = 8) {
    if (word.length < min) return [word];
    const V = /[aeiou]/i, codaEnd = /(ng|[nmktp])$/i;
    let best = null;
    for (let i = min < 8 ? 2 : 3; i <= word.length - 3; i++) {
      const left = word.slice(0, i), right = word.slice(i);
      if (/^h/i.test(right) || V.test(right[0]) || (/n$/i.test(left) && /^g/i.test(right)) || (/^ng/i.test(right) && !/ng$/i.test(left))) continue;
      if (/^[^aeiou][^aeiouhrlwg]/i.test(right)) continue;
      if (!V.test(left.at(-1)) && !codaEnd.test(left)) continue;
      const score = Math.abs(word.length / 2 - i) - (/^(buri|thani)$/i.test(right) ? 2.5 : 0);
      if (!best || score < best.score) best = { i, score };
    }
    return best ? [word.slice(0, best.i), word.slice(best.i)] : [word];
  }
  // Every syllable break of a word of six letters or more (Non-tha-buri), for names that do not fit otherwise.
  const syllables = word => { const h = hyphenate(word, 6); return h.length < 2 ? h : h.flatMap(syllables); };
  // Every way of grouping word segments into 1–3 lines (1–4 with `tight`); the fitting step picks the most legible one.
  function lineOptions(name, code, tight) {
    let parts;
    if (/[a-z]/i.test(name)) parts = name.split(/\s+/).flatMap(w => { const h = tight ? syllables(w) : hyphenate(w); return h.map((p, i) => ({ t: p, glue: i < h.length - 1 ? '-' : ' ' })); });
    else if (BREAKS[code] && BREAKS[code].replace(/\|/g, '') === name) parts = BREAKS[code].split('|').map(p => ({ t: p, glue: '' }));
    else return [[name]];
    const line = (a, b) => parts.slice(a, b).map((p, i, arr) => p.t + (i < arr.length - 1 ? (p.glue === '-' ? '' : p.glue) : (p.glue === '-' ? '-' : ''))).join('');
    const n = parts.length, opts = [[line(0, n)]];
    for (let i = 1; i < n; i++) opts.push([line(0, i), line(i, n)]);
    for (let i = 1; i < n; i++) for (let j = i + 1; j < n; j++) opts.push([line(0, i), line(i, j), line(j, n)]);
    if (tight) for (let i = 1; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) opts.push([line(0, i), line(i, j), line(j, k), line(k, n)]);
    return opts;
  }
  function measure(text) {
    if (!measureCtx) { measureCtx = document.createElement('canvas').getContext('2d'); }
    measureCtx.font = '600 100px ' + getComputedStyle(document.body).fontFamily;
    return measureCtx.measureText(text).width / 100;
  }

  function buildMap() {
    tiles = DS.reference.tiles.map(tile => ({ ...tile, cx: (tile.x - (tile.y % 2 === 0 ? 0.5 : 0)) * R * SQ3, cy: tile.y * R * 1.5 }));
    const xs = tiles.map(d => d.cx), ys = tiles.map(d => d.cy), pad = 3;
    vb = { x: Math.min(...xs) - R * SQ3 / 2 - pad, y: Math.min(...ys) - R - pad };
    vb.w = Math.max(...xs) + R * SQ3 / 2 + pad - vb.x; vb.h = Math.max(...ys) + R + pad - vb.y;
    const svg = d3.select('#hexmap').attr('viewBox', [vb.x, vb.y, vb.w, vb.h].join(' ')).attr('preserveAspectRatio', 'xMidYMid meet');
    const defs = svg.append('defs');
    addSheenDefs(defs, 'hex').selectAll('polygon').data(tiles).join('polygon').attr('points', d => hexPoints(d.cx, d.cy));
    const g = svg.append('g').attr('class', 'hex-layer');
    // Tiles stand a little off the sea: two offset copies of every tile underneath read as a soft shadow.
    const shade = g.append('g').attr('class', 'hex-shade').attr('aria-hidden', 'true');
    for (const [dy, cls] of [[3.4, 'far'], [1.6, 'near']]) shade.append('g').attr('class', cls).selectAll('polygon').data(tiles, d => d.code).join('polygon').attr('points', d => hexPoints(d.cx, d.cy + dy));
    const cells = g.selectAll('g.hex').data(tiles, d => d.code).join('g').attr('class', 'hex').attr('data-code', d => d.code).attr('role', 'button').attr('tabindex', -1);
    cells.append('polygon').attr('points', d => hexPoints(d.cx, d.cy));
    cells.append('text').attr('class', 'hex-label').attr('x', d => d.cx).attr('y', d => d.cy);
    // Outline overlays instead of re-ordering tiles: moving a focused element in the DOM would drop keyboard focus.
    // For the same reason the tile under the pointer is lifted as a copy drawn above its neighbours (see liftTile).
    g.append('polygon').attr('class', 'ring sel-ring').attr('display', 'none');
    g.append('polygon').attr('class', 'ring lens-ring').attr('display', 'none');   // phones: the province the lens is on
    g.append('g').attr('class', 'hex-lift').attr('aria-hidden', 'true');
    addSheen(g, 'hex', vb.x, vb.y, vb.w, vb.h);
    zoomBehavior = d3.zoom().scaleExtent([1, 6]).translateExtent([[vb.x - 40, vb.y - 40], [vb.x + vb.w + 40, vb.y + vb.h + 40]])
      .filter(ev => ev.type === 'wheel' ? !ev.button : ev.type.startsWith('touch') ? (ev.touches.length > 1 || camera.k > 1.01) : !ev.button && !ev.ctrlKey && !lensReady())
      .on('zoom', ev => { camera = ev.transform; g.attr('transform', camera); svg.style('touch-action', camera.k > 1.01 ? 'none' : 'pan-y pinch-zoom'); $('mapStage').classList.toggle('is-zoomed', camera.k > 1.01); scheduleLabels(); positionPill(); if (tipCode) hideTip(true); });
    svg.call(zoomBehavior).on('dblclick.zoom', null);
    svg.call(zoomBehavior.transform, camera);
    svg.style('touch-action', 'pan-y pinch-zoom');
    const el = $('hexmap');
    el.addEventListener('pointerover', ev => { const cell = ev.target.closest('.hex'); if (!cell || ev.pointerType === 'touch') return; onHexEnter(cell.dataset.code, cell, ev); });
    el.addEventListener('pointermove', onHexMove);
    el.addEventListener('pointerout', ev => { const cell = ev.target.closest('.hex'); if (!cell || ev.pointerType === 'touch') return; if (ev.relatedTarget && cell.contains(ev.relatedTarget)) return; onHexLeave(); });
    el.addEventListener('click', ev => { const cell = ev.target.closest('.hex'); if (cell) activateProvince(cell.dataset.code, true); });
    el.addEventListener('focusin', ev => { const cell = ev.target.closest('.hex'); if (cell) { focusCode = cell.dataset.code; setHover(focusCode); showPill(focusCode); if (!narrow()) showTip(focusCode, cell); } });
    el.addEventListener('focusout', ev => { if (!el.contains(ev.relatedTarget)) { setHover(''); hidePill(); scheduleHide(); } });
    el.addEventListener('keydown', onMapKey);
    el.addEventListener('pointerdown', lensDown);   // phones: focus + context (see below)
    el.addEventListener('contextmenu', ev => { if (lens) ev.preventDefault(); });
    if ('ResizeObserver' in window) new ResizeObserver(() => scheduleLabels()).observe($('mapStage'));
  }

  /* ---------- phones: focus + context on the national map ---------- */
  /* On a phone a province is narrower than a fingertip, so it is hard to aim at. Touch the map and slide (or keep the
     finger down for a moment) and a fisheye lens opens under the finger: the province there and the ones around it
     grow (the focus) while the rest of the country stays on screen, pressed together a little (the context). A label
     above the province names it. The lens stays centred on a province until the finger has crossed its enlarged
     outline, so the target under the finger is always large and a small slip does not change it. Lifting the finger
     opens that province; lifting it over the sea opens nothing. A quick tap works as it always did.
     Only in the phone layout, on the national map at its normal size: two fingers still pinch-zoom, and a zoomed map
     is still dragged with one finger. */
  const LENS = { reach: 8 * R * SQ3, hold: 170, slop: 7, target: 78, min: 2, max: 3 };
  let lens = null;
  const lensReady = () => isM() && state.page === 'overview' && state.mView === 'map' && !state.province && camera.k <= 1.01 && !$('mapStage').classList.contains('is-animating');
  const corners = d => d.corners || (d.corners = Array.from({ length: 6 }, (_, i) => { const a = Math.PI / 6 * (1 + 2 * i); return [d.cx + R * Math.cos(a), d.cy + R * Math.sin(a)]; }));
  // The fisheye. A map point moves away from the centre of the lens by a factor that falls from `m` at the centre to 1
  // at LENS.reach, where the map is left as it is; (ox, oy) leans the middle of the lens away from the screen's edge.
  // The third value is the scale along the radius at that point: the size a label there can keep.
  function lensAt(L, x, y) {
    const dx = x - L.cx, dy = y - L.cy, u = Math.hypot(dx, dy) / LENS.reach;
    if (u >= 1) return [x, y, 1];
    const v = 1 - u, k = 1 + (L.m - 1) * v * v * v;
    return [L.cx + dx * k + L.ox * v * v, L.cy + dy * k + L.oy * v * v, 1 + (L.m - 1) * v * v * (1 - 4 * u)];
  }
  const lensLayer = () => document.querySelector('#hexmap .hex-layer');
  const lensPoint = pt => { const m = lensLayer().getScreenCTM(); return m ? new DOMPoint(pt.x, pt.y).matrixTransform(m.inverse()) : null; };
  // The province whose enlarged tile holds a map point, with the lens settled on its current province.
  function lensHit(L, x, y) {
    for (const d of tiles) {
      const p = corners(d).map(c => lensAt(L.to, c[0], c[1]));
      let inside = false;
      for (let i = 0, j = 5; i < 6; j = i++) if ((p[i][1] > y) !== (p[j][1] > y) && x < (p[j][0] - p[i][0]) * (y - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) inside = !inside;
      if (inside) return d.code;
    }
    return '';
  }
  function lensDraw() {
    const L = lens; let ring = null;
    d3.select('#hexmap').selectAll('g.hex').each(function (d) {
      const pts = corners(d).map(c => lensAt(L, c[0], c[1])), mid = lensAt(L, d.cx, d.cy), text = pts.map(p => p[0].toFixed(2) + ',' + p[1].toFixed(2)).join(' ');
      this.firstChild.setAttribute('points', text);
      // A name grows with its tile, but never past the size that fits it (on a small map the names start oversized).
      // (The scale at the tile's outer corners is the smaller one near the centre of the lens, where it falls fastest.)
      const far = Math.hypot(d.cx - L.cx, d.cy - L.cy) / LENS.reach + R / LENS.reach, s = Math.min(mid[2], far >= 1 ? 1 : 1 + (L.m - 1) * Math.pow(1 - far, 3));
      const k = s >= 1 ? Math.max(1, s * (d.fitK || 1)) : s, label = this.lastChild;
      label.setAttribute('transform', 'translate(' + mid[0].toFixed(2) + ',' + mid[1].toFixed(2) + ') scale(' + k.toFixed(3) + ') translate(' + -d.cx + ',' + -d.cy + ')');
      label.style.opacity = s < 0.9 ? Math.max(0, (s - 0.6) / 0.3).toFixed(2) : '';
      if (d.code === L.over) ring = text;
    });
    d3.select('#hexmap .lens-ring').attr('display', ring ? null : 'none').attr('points', ring);
  }
  function lensFrame(now) {
    const L = lens; if (!L) return;
    L.frame = 0;
    const dt = L.last ? Math.min(64, now - L.last) : 16, k = calmMotion() ? 1 : 1 - Math.exp(-dt / 42);
    L.last = now;
    let moving = false;
    for (const key of ['cx', 'cy', 'ox', 'oy', 'm']) {
      const gap = L.to[key] - L[key];
      if (Math.abs(gap) < (key === 'm' ? 0.004 : 0.05)) L[key] = L.to[key]; else { L[key] += gap * k; moving = true; }
    }
    lensDraw();
    if (moving) L.frame = requestAnimationFrame(lensFrame);
    else if (L.closing) lensDone();
  }
  const lensKick = () => { if (lens && !lens.frame) { lens.last = 0; lens.frame = requestAnimationFrame(lensFrame); } };
  // The lens settles on a province: how much it enlarges, and how far its middle leans to keep the tiles it pushes
  // outward on the screen.
  function lensFocus(code) {
    const L = lens, d = tiles.find(x => x.code === code), el = $('hexmap');
    const px = Math.min(el.clientWidth / vb.w, el.clientHeight / vb.h) * camera.k || 1;   // screen pixels per map unit
    // The province under the finger is drawn about a thumb wide. The lens is strongest at its very centre and already
    // a little weaker at the province's own corners, so its strength there is set from the width wanted.
    const grow = Math.max(LENS.min, Math.min(LENS.max, LENS.target / (R * SQ3 * px))), m = 1 + (grow - 1) / Math.pow(1 - R / LENS.reach, 3);
    const T = { cx: d.cx, cy: d.cy, ox: 0, oy: 0, m }, box = el.getBoundingClientRect();
    const a = lensPoint({ x: box.left + 4, y: box.top + 4 }), b = lensPoint({ x: box.right - 4, y: box.bottom - 4 });
    // The enlarged province must still cover the place it was, so the finger stays on it: that caps the lean. (The
    // lean is felt a little less at the province's edge than at its centre, hence the division.)
    const hx = R * SQ3 / 2, capX = 0.95 * (grow - 1) * hx / Math.pow(1 - hx / LENS.reach, 2), capY = 0.95 * (grow - 1) * R / Math.pow(1 - R / LENS.reach, 2);
    for (let pass = 0; a && b && pass < 3; pass++) {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const q of tiles) for (const c of corners(q)) { const p = lensAt(T, c[0], c[1]); if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
      T.ox = Math.max(-capX, Math.min(capX, T.ox + 1.25 * (Math.max(0, a.x - x0) - Math.max(0, x1 - b.x))));
      T.oy = Math.max(-capY, Math.min(capY, T.oy + 1.25 * (Math.max(0, a.y - y0) - Math.max(0, y1 - b.y))));
    }
    L.focus = L.over = code; L.to = T;
    if (!L.on) {
      L.on = true; Object.assign(L, { cx: d.cx, cy: d.cy, ox: 0, oy: 0, m: 1 });
      el.classList.add('lens-on'); $('mapStage').classList.add('has-lens');
      try { localStorage.setItem('e69-lens-used', '1'); } catch (e) { /* nothing to remember */ }
    }
    lensTag(); lensKick();
  }
  // The label above the enlarged province: its name, what it holds, and what lifting the finger will do.
  function lensTag() {
    const L = lens, tag = $('lensTag'), p = L.over && provinceOf(L.over);
    if (!L.on) { tag.hidden = true; return; }
    tag.innerHTML = p ? '<b>' + esc(pname(p)) + '</b><span>' + p.count + t(' เขต', p.count === 1 ? ' constituency' : ' constituencies') + p.seats.slice(0, 2).map(s => ' · ' + dot(s.party) + esc(s.party) + ' ' + s.count).join('') + '</span><small>' + t('ปล่อยนิ้วเพื่อเปิดจังหวัดนี้', 'Lift your finger to open it') + '</small>'
      : '<span>' + t('ตรงนี้ไม่มีจังหวัด', 'No province here') + '</span><small>' + t('ปล่อยนิ้วตรงนี้เพื่อยกเลิก', 'Lift your finger here to cancel') + '</small>';
    tag.classList.toggle('is-none', !p);
    tag.hidden = false; lensTagPlace();
  }
  function lensTagPlace() {
    const L = lens, tag = $('lensTag'); if (!L || tag.hidden) return;
    let x = L.pt.x, y = L.pt.y - 62;
    if (L.over) {   // above the enlarged province and the ring of neighbours around it, so it hides neither them nor the finger
      const d = tiles.find(q => q.code === L.over), ring = lensAt(L.to, d.cx + R * SQ3 / 2, d.cy - 2.5 * R), top = new DOMPoint(d.cx + L.to.ox, ring[1]).matrixTransform(lensLayer().getScreenCTM());
      x = top.x; y = top.y - 6;
    }
    tag.style.left = Math.max(6, Math.min(innerWidth - tag.offsetWidth - 6, x - tag.offsetWidth / 2)) + 'px';
    tag.style.top = Math.max(6, y - tag.offsetHeight) + 'px';
  }
  function lensTrack() {
    const L = lens, box = $('mapStage').getBoundingClientRect(), p = L.pt.x >= box.left && L.pt.x <= box.right && L.pt.y >= box.top && L.pt.y <= box.bottom ? lensPoint(L.pt) : null;
    const hit = p ? lensHit(L, p.x, p.y) : '';
    if (hit && hit !== L.focus) lensFocus(hit);
    else if (hit !== L.over) { L.over = hit; lensTag(); lensKick(); }
    else if (!hit && L.on) lensTagPlace();
  }
  function lensArm() {
    const L = lens; clearTimeout(L.timer); L.armed = true;
    setHover(''); hideTip(true);   // a mouse in a narrow window: the tile it rested on is no longer lifted
    try { $('hexmap').setPointerCapture(L.id); } catch (e) { /* the finger has already left */ }
    lensTrack();
  }
  function lensDown(ev) {
    if (!lensReady()) return;
    if (!ev.isPrimary) { lensCancel(); return; }   // a second finger: the pinch takes over
    if (ev.pointerType === 'mouse' && ev.button) return;
    if (lens) lensDone();
    lens = { id: ev.pointerId, x0: ev.clientX, y0: ev.clientY, pt: { x: ev.clientX, y: ev.clientY }, armed: false, on: false, closing: false, over: '', focus: '', cx: 0, cy: 0, ox: 0, oy: 0, m: 1, to: { cx: 0, cy: 0, ox: 0, oy: 0, m: 1 }, frame: 0, last: 0, timer: 0 };
    // A finger that stays down opens the lens where it is; a mouse (a narrow desktop window) opens it by dragging.
    if (ev.pointerType !== 'mouse') lens.timer = setTimeout(() => { if (lens && !lens.armed && !lens.closing) lensArm(); }, LENS.hold);
  }
  function lensMove(ev) {
    const L = lens; if (!L || ev.pointerId !== L.id || L.closing) return;
    L.pt = { x: ev.clientX, y: ev.clientY };
    if (!L.armed) { if (Math.hypot(ev.clientX - L.x0, ev.clientY - L.y0) < LENS.slop) return; lensArm(); return; }
    lensTrack();
  }
  function lensUp(ev) {
    const L = lens; if (!L || ev.pointerId !== L.id || L.closing) return;
    if (!L.armed) { clearTimeout(L.timer); lens = null; return; }   // a quick tap: the click that follows opens the province, as before
    const open = ev.type === 'pointerup' ? L.over : '';
    dropClick = performance.now() + 350;   // the lens has decided; the click the browser sends right after must not decide again
    lensClose();
    if (open) activateProvince(open, true);
  }
  // The lens melts back into the map (and is gone at once for reduced motion).
  function lensClose() {
    const L = lens; if (!L) return;
    clearTimeout(L.timer); L.closing = true; L.over = '';
    try { $('hexmap').releasePointerCapture(L.id); } catch (e) { /* not captured */ }
    $('lensTag').hidden = true;
    if (!L.on) { lens = null; return; }
    L.to = { cx: L.to.cx, cy: L.to.cy, ox: 0, oy: 0, m: 1 };
    if (calmMotion()) lensDone(); else lensKick();
  }
  // Every tile goes back exactly as it was drawn.
  function lensDone() {
    const L = lens; if (!L) return;
    cancelAnimationFrame(L.frame); clearTimeout(L.timer); lens = null;
    $('lensTag').hidden = true;
    d3.select('#hexmap').classed('lens-on', false).selectAll('g.hex').each(function (d) { this.firstChild.setAttribute('points', hexPoints(d.cx, d.cy)); this.lastChild.removeAttribute('transform'); this.lastChild.style.opacity = ''; });
    d3.select('#hexmap .lens-ring').attr('display', 'none');
    $('mapStage')?.classList.remove('has-lens');
  }
  function lensCancel() { if (lens && !lens.closing) { if (lens.armed) dropClick = performance.now() + 350; lensClose(); } }
  addEventListener('pointermove', lensMove, { passive: true });
  addEventListener('pointerup', lensUp); addEventListener('pointercancel', lensUp);

  /* Light on the maps. Now and then a soft band of light sweeps across the tiles (or a province's constituencies),
     clipped to their shapes so the sea stays calm; e69.css times it (first pass about a second after the map
     appears, then every 15 s) and switches it off for reduced motion. The clip path holds copies of the shapes. */
  // Each map keeps its own ids (key 'hex' or 'dist'): a gradient inside a hidden map may not be usable by the other.
  function addSheenDefs(defs, key) {
    const grad = defs.append('linearGradient').attr('id', key + 'Sheen').attr('x1', 0).attr('y1', 0).attr('x2', 1).attr('y2', 0.45);
    [[0, 0], [0.38, 0], [0.5, 1], [0.62, 0], [1, 0]].forEach(([o, a]) => grad.append('stop').attr('offset', o).attr('stop-color', '#fff').attr('stop-opacity', a));
    return defs.append('clipPath').attr('id', key + 'Clip');
  }
  function addSheen(layer, key, x, y, w, h) {
    // The band rides inside a clipped group: the group's clip stays put while the band moves across it.
    layer.append('g').attr('class', 'map-sheen-clip').attr('clip-path', 'url(#' + key + 'Clip)').attr('aria-hidden', 'true')
      .append('rect').attr('class', 'map-sheen').attr('x', x - w).attr('y', y).attr('width', w).attr('height', h).attr('fill', 'url(#' + key + 'Sheen)').style('--sweep', (2 * w).toFixed(1) + 'px');
  }
  // The first time the national map is shown, it lights up province by province from Bangkok outward (≈1.2 s).
  let litOnce = false;
  function lightUpMap() {
    litOnce = true;
    if (calmMotion()) return;
    const el = $('hexmap'), origin = tiles.find(x => x.code === '10') || tiles[0], far = d3.max(tiles, d => Math.hypot(d.cx - origin.cx, d.cy - origin.cy)) || 1;
    d3.select(el).selectAll('g.hex').style('--d', d => Math.round(40 + 720 * Math.hypot(d.cx - origin.cx, d.cy - origin.cy) / far) + 'ms');
    el.classList.add('map-lit');
    setTimeout(() => el.classList.remove('map-lit'), 1800);
  }

  function luminance(hex) {
    const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || ''); if (!m) return 1;
    const [r, g, b] = [m[1], m[2], m[3]].map(x => { const c = parseInt(x, 16) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  // Colour ramps for quantities that belong to no party. Teal and rose sit in the widest gaps between party
  // colours, so shading never reads as a party's (the d3 Blues and Oranges they replace ran through
  // พลังประชารัฐ's blue and ประชาชน's orange). Every step keeps the lightness of the step it replaces, so the
  // shading and the label ink are unchanged. Teal is the general one (turnout, the analysis heatmap); rose is
  // kept for invalid ballots. Dark mode keeps the hues and flips the anchor: low values sit close to the dark map and
  // high values are bright (lightness spaced like the light steps, mirrored onto OKLCH 0.32–0.86).
  const RAMPS = {
    light: {
      teal: d3.interpolateRgbBasis(['#f6fcfb', '#daeeec', '#bee0dd', '#98cfcb', '#59b7b1', '#149e98', '#0e7e79', '#085f5b', '#033c39']),
      rose: d3.interpolateRgbBasis(['#fff3f8', '#fee2ee', '#fdc8df', '#f7a6cc', '#ef88bb', '#de6aa6', '#c44f8e', '#963c6c', '#722c51']),
    },
    dark: {
      teal: d3.interpolateRgbBasis(['#053b39', '#074845', '#0a5451', '#0e6561', '#147d79', '#1a958f', '#21b0a9', '#37cbc3', '#60eae2']),
      rose: d3.interpolateRgbBasis(['#5d063c', '#6f0848', '#820c55', '#942364', '#ad3d7a', '#c55390', '#e16ca8', '#fc85c1', '#fdbbd9']),
    },
  };
  const ramps = () => RAMPS[isDark() ? 'dark' : 'light'];
  const rateRamp = mode => ramps()[mode === 'turnout' ? 'teal' : 'rose'];
  // Shade ramp for one party (seats won, vote share). Light: from near-white to the party colour. Dark: from the dark
  // tile base through the party colour up to a bright tint of the same hue (OKLCH 0.86, the top of the dark teal and
  // rose ramps), so the steps span about as much lightness as in light mode and the largest values glow. A dark party
  // colour as the top end would leave every province dim and alike.
  const glowed = new Map();
  function glowForDark(hex) {
    if (!glowed.has(hex)) {
      const [L, C, h] = toOklch(hex), L2 = Math.max(L, 0.86);
      let c = C, rgb = oklchToLinear(L2, c, h);
      while (c > 0 && rgb.some(v => v < 0 || v > 1)) { c = Math.max(0, c - 0.004); rgb = oklchToLinear(L2, c, h); }
      glowed.set(hex, d3.rgb(...rgb.map(toByte)).formatHex());
    }
    return glowed.get(hex);
  }
  function partyRamp(base, c) {
    if (!isDark()) return d3.interpolateRgb(base, c);
    const top = glowForDark(d3.color(c).formatHex()), Lb = toOklch(base)[0], Lc = toOklch(c)[0], Lt = toOklch(top)[0];
    if (Lt - Lc < 0.02) return d3.interpolateLab(base, c);
    // The party colour sits where its lightness falls between the base and the top, so lightness rises evenly.
    const k = Math.min(0.85, Math.max(0.15, (Lc - Lb) / (Lt - Lb))), lo = d3.interpolateLab(base, c), hi = d3.interpolateLab(c, top);
    return t => t <= k ? lo(t / k) : hi((t - k) / (1 - k));
  }
  // Legend bar stops for a party ramp from t0 (at p0 % of the bar) to the top: light keeps its two-stop bar ending in
  // the party colour; dark samples the bend through the party colour.
  const rampStops = (ramp, t0, p0, c) => isDark() ? [0, 1, 2, 3, 4].map(i => ramp(t0 + (1 - t0) * i / 4) + ' ' + (p0 + (100 - p0) * i / 4) + '%').join(',') : ramp(t0) + (p0 ? ' ' + p0 + '%' : '') + ',' + c;

  // Map encodings. Returns {fill, ink, value} per province plus legend HTML.
  function mapEncoding() {
    // Tie stripes depend only on the data, so their patterns are made once and kept: a tile fading from one
    // colouring to another can still reference its old pattern mid-transition.
    const mode = state.mapMode, out = new Map(), defs = d3.select('#hexmap defs');
    let legend = '';
    if (mode === 'winner' && !state.party) {
      const used = new Map();
      for (const p of D.provinces) {
        const lead = p.leaders;
        if (!lead.length) { out.set(p.code, { fill: colors().empty, ink: colors().emptyInk, text: t('ไม่มีผู้ชนะ', 'No winner') }); continue; }
        lead.forEach(x => used.set(x, (used.get(x) || 0) + 1));
        if (lead.length === 1) { const c = D.colorOf(lead[0]); out.set(p.code, { fill: c, ink: luminance(c) > 0.33 ? '#102631' : '#fff', text: lead[0] + ' ' + p.seats[0].count + '/' + p.count }); }
        else {
          const id = 'tie' + p.code, w = 5;
          if (defs.select('#' + id).empty()) {
            const pat = defs.append('pattern').attr('id', id).attr('patternUnits', 'userSpaceOnUse').attr('width', w * lead.length).attr('height', 10).attr('patternTransform', 'rotate(45)');
            lead.forEach((x, i) => pat.append('rect').attr('x', i * w).attr('width', w).attr('height', 10).attr('fill', D.colorOf(x)));
          }
          out.set(p.code, { fill: 'url(#' + id + ')', ink: '#fff', halo: true, text: lead.join(' = ') + ' ' + p.seats[0].count });
        }
      }
      legend = '<div class="lg-items">' + [...used].sort((a, b) => b[1] - a[1]).map(([x, n]) => '<button type="button" class="lg-item" data-act="party" data-v="' + esc(x) + '">' + dot(x) + esc(x) + ' <small>' + n + '</small></button>').join('') + '<span class="lg-item"><i class="dot stripe" aria-hidden="true"></i>' + t('ลายแถบ: ชนะเขตเท่ากัน', 'Stripes: tied lead') + '</span></div><p class="lg-cap">' + t('สีคือพรรคที่ชนะเขตมากที่สุดในจังหวัด ไม่จำเป็นต้องชนะทุกเขต ตัวเลขคือจำนวนจังหวัด', 'Colour is the party that won most seats in the province, not necessarily all. Numbers count provinces.') + '</p>';
    } else if (mode === 'winner' && state.party) {
      const c = D.colorOf(state.party), ramp = partyRamp(colors().seatBase, c), zero = colors().zero;
      for (const p of D.provinces) {
        const n = p.seats.find(s => s.party === state.party)?.count || 0, share = n / p.count;
        const fill = n ? ramp(0.3 + 0.7 * share) : zero;
        out.set(p.code, { fill, ink: luminance(d3.color(fill).formatHex()) > 0.33 ? '#102631' : '#fff', text: state.party + ' ' + n + '/' + p.count + t(' เขต', '') });
      }
      legend = '<div class="lg-ramp"><span>0 ' + t('เขต', 'seats') + '</span><i style="background:linear-gradient(90deg,' + zero + ' 0 12%,' + rampStops(ramp, 0.3, 12, c) + ')"></i><span>' + t('ชนะทุกเขต', 'all seats') + '</span></div><p class="lg-cap">' + t('ความเข้มสี = สัดส่วนเขตในจังหวัดที่พรรค', 'Shade = share of the province\'s constituencies won by ') + esc(state.party) + (isDark() ? t(' ชนะ (เทาเข้ม = ไม่ชนะเลย)', ' (dark grey = none)') : t(' ชนะ (เทาอ่อน = ไม่ชนะเลย)', ' (light grey = none)')) + '</p>';
    } else if (mode === 'turnout' || mode === 'invalid') {
      const get = p => mode === 'turnout' ? p.turnoutRate.value : p.invalidRate.value;
      const vals = D.provinces.map(get).filter(Number.isFinite), lo = Math.floor(d3.min(vals)), hi = Math.ceil(d3.max(vals));
      const interp = rateRamp(mode), color = v => interp(0.12 + 0.83 * (v - lo) / Math.max(1e-9, hi - lo));
      for (const p of D.provinces) { const v = get(p); const fill = Number.isFinite(v) ? color(v) : colors().empty; out.set(p.code, { fill, ink: luminance(d3.color(fill).formatHex()) > 0.33 ? '#102631' : '#fff', text: fmtP(v) }); }
      legend = '<div class="lg-ramp"><span>' + lo + '%</span><i style="background:linear-gradient(90deg,' + color(lo) + ',' + color((lo + hi) / 2) + ',' + color(hi) + ')"></i><span>' + hi + '%</span></div><p class="lg-cap">' + (mode === 'turnout' ? t('อัตราการใช้สิทธิระดับจังหวัด = Σผู้มาใช้สิทธิ ÷ Σผู้มีสิทธิ (ช่วงสีตามค่าต่ำสุด–สูงสุดจริง)', 'Province turnout = Σ voters ÷ Σ eligible (colour range spans the actual min–max)') : t('บัตรเสียแบบแบ่งเขต ÷ ผู้มาใช้สิทธิ (ช่วงสีตามค่าต่ำสุด–สูงสุดจริง)', 'Invalid constituency ballots ÷ turnout (range spans actual min–max)')) + '</p>';
    } else if (mode === 'list' || mode === 'cand') {
      const ballot = mapBallot(), what = ballotWord();
      if (!state.party) {
        // No party chosen: each province takes the colour of the party with the most votes on this ballot, so the
        // map reads beside the seat map (on the party ballot most provinces change colour).
        const used = new Map();
        let differ = 0;
        for (const p of D.provinces) {
          const top = topParty(p, ballot);
          if (!top) { out.set(p.code, { fill: colors().empty, ink: colors().emptyInk, text: '' }); continue; }
          used.set(top.party, (used.get(top.party) || 0) + 1);
          if (!p.leaders.includes(top.party)) differ++;
          const c = D.colorOf(top.party);
          out.set(p.code, { fill: c, ink: luminance(c) > 0.33 ? '#102631' : '#fff', text: what + ' ' + top.party + ' ' + fmtP(top.share) });
        }
        legend = '<div class="lg-items">' + [...used].sort((a, b) => b[1] - a[1]).map(([x, n]) => '<button type="button" class="lg-item" data-act="party" data-v="' + esc(x) + '">' + dot(x) + esc(x) + ' <small>' + n + '</small></button>').join('') + '</div>' +
          '<p class="lg-cap">' + t('สีคือพรรคที่ได้' + what + (ballot === 'partyList' ? ' (บัญชีรายชื่อ) ' : ' (แบบแบ่งเขต รวมทุกเขต) ') + 'มากที่สุดในจังหวัด ตัวเลขคือจำนวนจังหวัด', 'Colour is the party with the most ' + what + ' in the province. Numbers count provinces.') + '</p>' +
          '<p class="lg-cap lg-diff">' + (differ ? t('ใน <b>' + differ + '</b> จังหวัด สีนี้ต่างจากพรรคที่ชนะเขตมากที่สุด', 'In <b>' + differ + '</b> provinces this is not the party that won the most seats') : t('ทุกจังหวัด สีนี้ตรงกับพรรคที่ชนะเขตมากที่สุด', 'In every province this is also the party that won the most seats')) + '</p>';
      } else {
        const c = D.colorOf(state.party), vals = D.provinces.map(p => D.share(p, state.party, ballot).value), hi = Math.max(1, Math.ceil(d3.max(vals.filter(Number.isFinite)))), ramp = partyRamp(colors().shareBase, c);
        D.provinces.forEach((p, i) => { const v = vals[i]; const fill = Number.isFinite(v) ? ramp(0.08 + 0.92 * v / hi) : colors().empty; out.set(p.code, { fill, ink: luminance(d3.color(fill).formatHex()) > 0.33 ? '#102631' : '#fff', text: what + ' ' + fmtP(v) }); });
        legend = '<div class="lg-ramp"><span>0%</span><i style="background:linear-gradient(90deg,' + rampStops(ramp, 0.08, 0, c) + ')"></i><span>' + hi + '%</span></div><p class="lg-cap">' + esc(state.party) + ' · ' + (ballot === 'partyList' ? t('คะแนนเลือกพรรค ÷ บัตรดีบัญชีรายชื่อ', 'party-list votes ÷ valid party-list ballots') : t('คะแนนผู้สมัครของพรรค ÷ บัตรดีแบบแบ่งเขต (เขตที่ไม่ส่งผู้สมัครนับ 0 คะแนน)', 'candidate votes ÷ valid constituency ballots (no candidate = 0 votes)')) + t(' รวมระดับจังหวัด', ', aggregated by province') + '</p>';
      }
    }
    return { out, legend };
  }
  // The two ballots as map colourings: 'list' = the party ballot (party-list), 'cand' = the candidate ballot (constituency).
  const mapBallot = () => state.mapMode === 'cand' ? 'constituency' : 'partyList';
  const ballotWord = () => state.mapMode === 'cand' ? t('คะแนนเลือกผู้สมัคร', 'candidate votes') : t('คะแนนเลือกพรรค', 'party-list votes');
  // The party with the most votes on one ballot in a province summary: { party, share (% of that ballot's valid votes) }.
  function topParty(p, ballot) {
    const votes = ballot === 'partyList' ? p.listVotes : p.candVotes, den = ballot === 'partyList' ? p.listValid.value : p.valid.value;
    let best = null;
    for (const [party, v] of votes) if (!best || v > best.v || (v === best.v && party.localeCompare(best.party, 'th') < 0)) best = { party, v };
    return best && den ? { party: best.party, share: best.v / den * 100 } : null;
  }

  const RESET_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>';
  let headingKey = '';
  function renderMapControls() {
    const p = state.province && provinceOf(state.province), key = (p ? p.code : '') + '|' + lang;
    $('mapHeading').innerHTML = p
      ? '<button type="button" class="map-back" data-act="map-reset">' + ICON.back + t('แผนที่ประเทศไทย', 'Map of Thailand') + '</button><h2 id="mapTitle">' + esc(ptitle(p)) + ' <small>' + p.count + t(' เขต', p.count === 1 ? ' seat' : ' seats') + '</small></h2>'
      : '<h2 id="mapTitle">' + t('แต่ละจังหวัดเลือกพรรคไหน', 'How each province voted') + '</h2>' + (isM() ? '<p class="m-hint">' + t('แตะจังหวัดเพื่อดูผลรายเขต', 'Tap a province for its constituencies') + '</p>' : '');
    if (headingKey && headingKey.split('|')[0] !== key.split('|')[0]) replay($('mapHeading'), p ? 'head-in' : 'head-back', 450);
    headingKey = key;
    renderMapCredit(p);
    const opt = (v, label, cur, title) => '<option value="' + v + '"' + (v === cur ? ' selected' : '') + (title ? ' title="' + title + '"' : '') + '>' + label + '</option>';
    // The two ballots are colourings of their own (they were a sub-choice of "vote share of the selected party"):
    // "คะแนนเลือกพรรค" / "คะแนนเลือกผู้สมัคร" use the words of the constituency panel (บัตรเลือกพรรค, บัตรเลือกผู้สมัคร);
    // the official names (บัญชีรายชื่อ, แบบแบ่งเขต) are in each option's title and in the colour key, which keeps the
    // closed menu short enough for a 1024 px window. Groups say what each colouring measures.
    $('mapControls').innerHTML = '<label class="field compact"><span class="sr-only">' + t('สีบนแผนที่', 'Map colour') + '</span><select id="mapMode" title="' + t('สีบนแผนที่', 'Map colour') + '">' +
      '<optgroup label="' + t('ที่นั่ง', 'Seats') + '">' + opt('winner', state.party ? t('ที่นั่งเขตของพรรคที่เลือก', 'Seats of selected party') : t('พรรคที่ชนะเขตมากที่สุด', 'Party winning most seats'), state.mapMode) + '</optgroup>' +
      '<optgroup label="' + t('คะแนนเสียง', 'Votes') + '">' + opt('list', t('คะแนนเลือกพรรค', 'Party-list votes'), state.mapMode, t('บัตรเลือกพรรค (บัญชีรายชื่อ)', 'Party-list ballot')) + opt('cand', t('คะแนนเลือกผู้สมัคร', 'Candidate votes'), state.mapMode, t('บัตรเลือกผู้สมัคร (แบบแบ่งเขต)', 'Constituency ballot')) + '</optgroup>' +
      '<optgroup label="' + t('การใช้สิทธิ', 'Voting') + '">' + opt('turnout', t('อัตราการใช้สิทธิ', 'Turnout rate'), state.mapMode) + opt('invalid', t('สัดส่วนบัตรเสีย (แบ่งเขต)', 'Invalid ballot rate'), state.mapMode) + '</optgroup></select></label>' +
      // Phones: a short pill instead of the menu; it opens a sheet that explains each colouring.
      '<button type="button" class="m-mode m-only" data-act="m-mapmode" aria-haspopup="dialog" aria-label="' + esc(t('สีบนแผนที่: ', 'Map colour: ') + MAP_MODES().find(x => x[0] === state.mapMode)[2]) + '"><span class="sw" style="background:' + modeSwatch(state.mapMode) + '"></span><span class="lb">' + MAP_MODES().find(x => x[0] === state.mapMode)[1] + '</span></button>';
    $('mapTools').innerHTML = '<button type="button" class="map-reset" data-act="map-reset" title="' + t('กลับไปแผนที่ประเทศไทยตอนเปิดหน้าเว็บ', 'Back to the full map of Thailand') + '">' + RESET_ICON + t('รีเซ็ต', 'Reset') + '</button>' +
      '<button type="button" class="icon-btn" data-act="zoom" data-v="in" title="' + t('ขยาย', 'Zoom in') + '" aria-label="' + t('ขยายแผนที่', 'Zoom in') + '">+</button><button type="button" class="icon-btn" data-act="zoom" data-v="out" title="' + t('ย่อ', 'Zoom out') + '" aria-label="' + t('ย่อแผนที่', 'Zoom out') + '">−</button>';
    // Phones: what the lens is for, in the open sea beside the south (the gesture cannot be seen otherwise).
    $('lensHint').innerHTML = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3M11 8v6M8 11h6"/></svg><span><b>' + t('แตะค้างแล้วเลื่อนนิ้ว', 'Touch and slide') + '</b>' + t('แว่นขยายช่วยเล็งจังหวัด', 'a lens helps you aim') + '</span>';
  }
  // The five colourings as the phone sheet lists them: [value, short name for the pill, full name, what it shows, group].
  const MAP_MODES = () => {
    const p = state.party && esc(state.party);
    return [
      ['winner', p ? t('ที่นั่งของพรรค', 'Party seats') : t('พรรคที่ชนะ', 'Winning party'), p ? t('ที่นั่งเขตของพรรคที่เลือก', 'Seats of selected party') : t('พรรคที่ชนะเขตมากที่สุด', 'Party winning most seats'),
        p ? t('ยิ่งเข้มยิ่งชนะเขตในจังหวัดมาก (' + p + ')', 'Darker = more of the province\'s seats won by ' + p) : t('สีของพรรคที่ได้ ส.ส.เขตมากที่สุดในแต่ละจังหวัด ลายแถบคือชนะเท่ากัน', 'The party that won most constituencies in each province; stripes mean a tie'), t('ที่นั่ง', 'Seats')],
      ['list', t('คะแนนเลือกพรรค', 'Party-list votes'), t('คะแนนเลือกพรรค (บัญชีรายชื่อ)', 'Party-list votes'),
        p ? t('สัดส่วนคะแนนบัตรเลือกพรรคของ ' + p, p + '\'s share of the party-list ballot') : t('พรรคที่ได้คะแนนบัตรเลือกพรรคมากที่สุดในแต่ละจังหวัด', 'The party with the most party-list votes in each province'), t('คะแนนเสียง', 'Votes')],
      ['cand', t('คะแนนผู้สมัคร', 'Candidate votes'), t('คะแนนเลือกผู้สมัคร (แบบแบ่งเขต)', 'Candidate votes'),
        p ? t('สัดส่วนคะแนนผู้สมัครของ ' + p, p + '\'s share of the constituency ballot') : t('พรรคที่ผู้สมัครได้คะแนนรวมมากที่สุดในแต่ละจังหวัด', 'The party whose candidates won the most votes in each province'), t('คะแนนเสียง', 'Votes')],
      ['turnout', t('การใช้สิทธิ', 'Turnout'), t('อัตราการใช้สิทธิ', 'Turnout rate'), t('ผู้มาใช้สิทธิ ÷ ผู้มีสิทธิ ยิ่งเข้มยิ่งออกมาใช้สิทธิมาก', 'Voters ÷ eligible voters; darker = higher turnout'), t('การใช้สิทธิ', 'Voting')],
      ['invalid', t('บัตรเสีย', 'Invalid'), t('สัดส่วนบัตรเสีย (แบ่งเขต)', 'Invalid ballot rate'), t('บัตรเสียแบบแบ่งเขต ÷ ผู้มาใช้สิทธิ ยิ่งเข้มยิ่งเสียมาก', 'Invalid constituency ballots ÷ turnout; darker = more'), t('การใช้สิทธิ', 'Voting')],
    ];
  };
  function modeSwatch(mode) {
    if (mode === 'turnout' || mode === 'invalid') { const r = rateRamp(mode); return 'linear-gradient(135deg,' + r(0.18) + ',' + r(0.92) + ')'; }
    if (state.party) return 'linear-gradient(135deg,' + colors().seatBase + ',' + D.colorOf(state.party) + ')';
    const c = D.seatParties.slice(0, 3).map(p => p.color);
    return 'linear-gradient(135deg,' + c[0] + ' 0 34%,' + c[1] + ' 34% 67%,' + c[2] + ' 67%)';
  }
  function mapModeSheet() {
    let group = '';
    return '<ul class="m-pick">' + MAP_MODES().map(([v, , name, what, g]) => {
      const head = g !== group ? '<li class="m-pick-group">' + g + '</li>' : ''; group = g;
      return head + '<li><button type="button" data-act="m-setmode" data-v="' + v + '"' + (state.mapMode === v ? ' aria-current="true"' : '') + '><span class="sw" style="background:' + modeSwatch(v) + '"></span><b>' + name + '</b><small>' + what + '</small></button></li>';
    }).join('') + '</ul>';
  }
  // How-to line at the foot of the legend; the map's credits sit under the map, outside its frame.
  const mapNote = () => state.province
    ? '<p class="lg-cap lg-note">' + (coarse() ? t('แตะเขตเพื่อดูคะแนนผู้สมัคร', 'Tap a constituency for candidate results.') : t('ชี้เขตเพื่อดูชื่อพื้นที่และผล คลิกเพื่อดูคะแนนผู้สมัครทุกคน', 'Hover a constituency for its area and result, click for every candidate.')) + '</p>'
    : '<p class="lg-cap lg-note">' + (coarse() ? t('แตะจังหวัดเพื่อดูแผนที่รายเขต', 'Tap a province to open its constituencies.') + (isM() ? t(' หรือแตะค้างแล้วเลื่อนนิ้ว: แว่นขยายจะขยายจังหวัดใต้นิ้วและรอบ ๆ ให้เล็งง่าย แล้วปล่อยนิ้วเพื่อเปิด', ' Or touch and slide: a lens enlarges the provinces under and around your finger; lift it to open one.') : '') : t('ชี้จังหวัดเพื่อดูสรุป คลิกเพื่อซูมเข้าไปดูรายเขต', 'Hover a province for a summary, click to zoom into its constituencies.')) + '</p>';
  const HEX_SOURCE = 'https://github.com/puripant/thailand-hex-map', SHAPE_SOURCE = 'https://github.com/KittapatR/Thai-ECT-election-map';
  // One wording for the hex-map credit, used under the map and in the sources dialog; `linkHtml` is the linked title.
  // Non-breaking spaces keep the academic title with the name, so a line never ends between "ผศ." and "ดร.".
  const hexCredit = linkHtml => t('แผนที่ประเทศไทยแบบหกเหลี่ยม: อ้างอิงรูปแบบจาก ', 'Hex map of Thailand: layout adapted from ') + linkHtml +
    t(' ผลงานของ ผศ. ดร. ภูริพันธุ์ รุจิขจร อาจารย์ประจำภาควิชาสถิติ จุฬาลงกรณ์มหาวิทยาลัย และผู้ร่วมก่อตั้ง Boonmee Lab', ', the work of Asst. Prof. Dr. Puripant Ruchikachorn, lecturer in the Department of Statistics, Chulalongkorn University, and co-founder of Boonmee Lab.');
  // Credit for whichever base map is on screen: the hex layout nationally, the constituency outlines in a province.
  function renderMapCredit(p) {
    const link = (href, text) => '<a href="' + href + '" target="_blank" rel="noopener">' + text + '</a>';
    // Phones: one line under the map; the full credit is in the colour key (setLegend).
    if (isM()) {
      $('mapCredit').innerHTML = p ? t('ขอบเขตเขต: ', 'Boundaries: ') + link(SHAPE_SOURCE, 'Thai-ECT-election-map') + t(' โดย Kittapat Ratanaphupha (โดยประมาณ)', ' by Kittapat Ratanaphupha (approximate)')
        : t('แผนที่หกเหลี่ยม: ', 'Hex map: ') + link(HEX_SOURCE, 'Hex Map of Thailand') + t(' โดย ผศ. ดร. ภูริพันธุ์ รุจิขจร', ' by Asst. Prof. Dr. Puripant Ruchikachorn');
      return;
    }
    $('mapCredit').innerHTML = p
      ? t('ขอบเขตเขตเลือกตั้ง: ', 'Constituency boundaries: ') + link(SHAPE_SOURCE, 'Thai-ECT-election-map') + t(' โดย Kittapat Ratanaphupha (สัญญาอนุญาต MIT) เป็นขอบเขตโดยประมาณ ไม่ใช่แผนที่ทางการของ กกต.', ' by Kittapat Ratanaphupha (MIT License); approximate outlines, not an official ECT map.')
      : hexCredit(link(HEX_SOURCE, 'Hex Map of Thailand'));
  }
  let legendOpen = false, legendHtml = '';
  function setLegend(html) {
    const credit = !isM() ? '' : '<p class="lg-credit">' + (state.province
      ? t('ขอบเขตเขตเลือกตั้ง: ', 'Constituency boundaries: ') + '<a href="' + SHAPE_SOURCE + '" target="_blank" rel="noopener">Thai-ECT-election-map</a>' + t(' โดย Kittapat Ratanaphupha (สัญญาอนุญาต MIT) เป็นขอบเขตโดยประมาณ ไม่ใช่แผนที่ทางการของ กกต.', ' by Kittapat Ratanaphupha (MIT License); approximate outlines, not an official ECT map.')
      : hexCredit('<a href="' + HEX_SOURCE + '" target="_blank" rel="noopener">Hex Map of Thailand</a>')) + '</p>';
    const lg = $('mapLegend'), full = '<button type="button" class="lg-toggle" data-act="legend-toggle" aria-expanded="' + legendOpen + '">' + t('คำอธิบายสี', 'Colour key') + '</button><div class="lg-body">' + html + mapNote() + credit + '</div>';
    lg.classList.toggle('open', legendOpen);
    if (full === legendHtml && lg.innerHTML) return;
    const had = !!legendHtml; legendHtml = full; lg.innerHTML = full;
    if (had) replay(lg, 'lg-swap', 450);   // a new colour key fades in with the recoloured map
  }

  /* Map transitions. National → province: the map flies to the clicked tile while the rest of the country
     fades, then the tile blooms into its real constituency outlines (inner ones first). Province → national:
     the outlines fold back, and the camera pulls out while the other provinces return in a ripple that
     spreads from the province you were looking at. Clear All and reduced-motion settings switch instantly. */
  let shownProvince = '', animToken = 0, instantMap = false;
  function updateMap() {
    const target = state.province && provinceOf(state.province) ? state.province : '', instant = instantMap;
    instantMap = false;   // one Clear All buys one instant switch, even when there was nothing to switch
    // Same map, new colouring (a party picked, a map mode changed): recolour with motion rather than snapping.
    if (target === shownProvince) { if (target) drawDistrictMap(false, true); else paintHexMap(true); return; }
    const from = shownProvince, token = ++animToken;
    shownProvince = target;
    if (instant || calmMotion() || !$('mapStage').clientWidth) { settleMap(target); return; }
    if (!from) flyIn(target, token); else if (!target) flyOut(from, token); else hopProvince(target, token);
  }
  function showLayer(drill) {
    $('hexmap').toggleAttribute('hidden', drill); $('distmap').toggleAttribute('hidden', !drill);
    $('mapStage').classList.toggle('is-province', drill);
  }
  function stopMapAnimations() {
    const hex = d3.select('#hexmap');
    hex.interrupt('fly').interrupt('fade-svg').style('opacity', null);
    hex.selectAll('g.hex').interrupt('fade').style('opacity', null);
    d3.select('#distmap').selectAll('g.dist, text.dist-label').interrupt('enter').interrupt('leave').attr('opacity', null).attr('transform', null);
    $('mapStage').classList.remove('is-animating');
  }
  function settleMap(target) {
    stopMapAnimations(); showLayer(!!target);
    if (target) { setHover(''); hideTip(true); hidePill(); drawDistrictMap(); } else paintHexMap();
  }
  function provinceCamera(code) {
    const el = $('hexmap'), tile = tiles.find(x => x.code === code), s = Math.min(el.clientWidth / vb.w, el.clientHeight / vb.h) || 1;
    const k = Math.max(2.2, Math.min(6, 0.5 * Math.min(el.clientWidth, el.clientHeight) / s / (2 * R)));
    return d3.zoomIdentity.translate(vb.x + vb.w / 2, vb.y + vb.h / 2).scale(k).translate(-tile.cx, -tile.cy);
  }
  const isOutside = code => !!state.region && provinceOf(code).region !== state.region;
  function flyIn(code, token) {
    stopMapAnimations(); showLayer(false); paintHexMap();
    hideTip(true); hidePill(); hideChartTip(); loadShapes().catch(() => {});
    const svg = d3.select('#hexmap'), stage = $('mapStage');
    stage.classList.add('is-animating');
    svg.selectAll('g.hex').transition('fade').duration(420).ease(d3.easeCubicOut).style('opacity', d => d.code === code ? 1 : 0.07);
    svg.transition('fly').duration(760).ease(d3.easeCubicInOut).call(zoomBehavior.transform, provinceCamera(code))
      .on('end', () => { if (token === animToken) revealDistricts(code, token); });
  }
  function revealDistricts(code, token) {
    loadShapes().then(() => {
      if (token !== animToken) return;
      showLayer(true); $('hexmap').removeAttribute('hidden');   // both layers visible for the cross-fade
      distKey = ''; drawDistrictMap(true);
      d3.select('#hexmap').transition('fade-svg').duration(300).style('opacity', 0).on('end', () => {
        if (token !== animToken) return;
        setHover('');   // the lifted province rode in with the camera; the national map is put away without it
        $('hexmap').setAttribute('hidden', '');
        d3.select('#hexmap').style('opacity', null).selectAll('g.hex').style('opacity', null);
        $('mapStage').classList.remove('is-animating');
      });
    }).catch(() => { if (token === animToken) settleMap(code); });
  }
  function foldTransform(el) { const c = [el.clientWidth / 2, el.clientHeight / 2]; return 'translate(' + c[0] + ',' + c[1] + ') scale(0.8) translate(' + -c[0] + ',' + -c[1] + ')'; }
  function flyOut(code, token) {
    stopMapAnimations(); hideChartTip();
    const stage = $('mapStage'), el = $('distmap'), cells = d3.select(el).selectAll('g.dist, text.dist-label');
    stage.classList.add('is-animating');
    const finish = () => {
      if (token !== animToken) return;
      showLayer(false); paintHexMap();
      const svg = d3.select('#hexmap'), tile = tiles.find(x => x.code === code);
      const far = d3.max(tiles, d => Math.hypot(d.cx - tile.cx, d.cy - tile.cy)) || 1;
      svg.call(zoomBehavior.transform, provinceCamera(code));
      svg.selectAll('g.hex').style('opacity', d => d.code === code ? 1 : 0.07);
      svg.style('opacity', 0).transition('fade-svg').duration(200).style('opacity', 1).on('end', () => svg.style('opacity', null));
      const fly = svg.transition('fly').duration(900).ease(d3.easeCubicInOut).call(zoomBehavior.transform, d3.zoomIdentity);
      const ripple = svg.selectAll('g.hex').filter(d => d.code !== code).transition('fade')
        .delay(d => 140 + 420 * Math.hypot(d.cx - tile.cx, d.cy - tile.cy) / far).duration(380).ease(d3.easeCubicOut)
        .style('opacity', d => isOutside(d.code) ? 0.2 : 1).on('end', function () { d3.select(this).style('opacity', null); });
      // Hand every tile (the province's own included) back to the stylesheet so region dimming applies again.
      Promise.all([fly.end(), ripple.end()]).catch(() => {}).then(() => { if (token === animToken) { svg.selectAll('g.hex').style('opacity', null); stage.classList.remove('is-animating'); layoutLabels(); } });
    };
    if (el.hasAttribute('hidden') || cells.empty()) { finish(); return; }
    cells.transition('leave').duration(280).ease(d3.easeCubicIn).attr('opacity', 0).attr('transform', foldTransform(el)).end().then(finish, finish);
  }
  function hopProvince(code, token) {
    stopMapAnimations(); hideChartTip();
    const el = $('distmap'), cells = d3.select(el).selectAll('g.dist, text.dist-label');
    const next = () => { if (token !== animToken) return; loadShapes().then(() => { if (token !== animToken) return; showLayer(true); distKey = ''; drawDistrictMap(true); }).catch(() => settleMap(code)); };
    if (el.hasAttribute('hidden') || cells.empty()) { showLayer(true); next(); return; }
    cells.transition('leave').duration(200).ease(d3.easeCubicIn).attr('opacity', 0).attr('transform', foldTransform(el)).end().then(next, next);
  }

  /* Recolouring with motion. Choosing a party spreads its colouring outward from the province it did best in,
     and clearing it pulls the colours back from the same place; a new map mode sweeps from north to south.
     Each tile blends its old colour into the new one; tie stripes, which cannot blend, dip and swap.
     Fresh figures from the refresh button sweep in the same way, so changed provinces are seen to change. */
  let colourWas = null, refreshMotion = false;
  function colourChange() {
    const now = { mode: state.mapMode, party: state.party }, was = colourWas, refreshed = refreshMotion;
    colourWas = now; refreshMotion = false;
    if (!was || calmMotion()) return null;
    if (was.party !== now.party) return { party: now.party || was.party };
    return was.mode !== now.mode || refreshed ? { sweep: true } : null;
  }
  function stronghold(party) {
    let best = null;
    for (const p of D.provinces) {
      const n = p.seats.find(s => s.party === party)?.count || 0;
      if (n && (!best || n / p.count > best.share || (n / p.count === best.share && n > best.n))) best = { code: p.code, share: n / p.count, n };
    }
    return best && best.code;
  }
  const PAINT_MS = 420;
  function recolor(shape, label, fill, ink, delay) {
    const from = shape.attr('fill');
    shape.interrupt('paint').attr('fill-opacity', null); label.interrupt('paint');
    if (from === fill || from === null) { shape.attr('fill', fill); label.attr('fill', ink); return; }   // nothing to blend from
    const tr = shape.transition('paint').delay(delay).duration(PAINT_MS).ease(d3.easeCubicInOut);
    if (/^url/.test(from || '') || /^url/.test(fill)) tr.attrTween('fill', () => k => k < 0.5 ? from : fill).attrTween('fill-opacity', () => k => String(1 - 0.6 * Math.sin(Math.PI * k))).on('end', function () { this.removeAttribute('fill-opacity'); });
    else tr.attr('fill', fill).on('end', function () { this.setAttribute('fill', fill); });   // finish on the exact colour string
    label.transition('paint').delay(delay).duration(PAINT_MS).ease(d3.easeCubicInOut).attr('fill', ink).on('end', function () { this.setAttribute('fill', ink); });
  }
  function paintHexMap(animate) {
    $('mapLoading').hidden = true;
    const change = colourChange(), motion = animate && change && !$('hexmap').hasAttribute('hidden') ? change : null;
    const { out, legend } = mapEncoding();
    const svg = d3.select('#hexmap').attr('aria-label', t('แผนที่หกเหลี่ยม ' + tiles.length + ' จังหวัด ใช้ปุ่มลูกศรเพื่อเลื่อนระหว่างจังหวัด', 'Hex map of ' + tiles.length + ' provinces; use arrow keys to move between provinces'));
    const active = state.province || focusCode || '57';
    let delay = () => 0;
    if (motion) {
      const origin = motion.party && tiles.find(x => x.code === stronghold(motion.party));
      if (origin) { const far = d3.max(tiles, d => Math.hypot(d.cx - origin.cx, d.cy - origin.cy)) || 1; delay = d => 320 * Math.hypot(d.cx - origin.cx, d.cy - origin.cy) / far; }
      else { const [y0, y1] = d3.extent(tiles, d => d.cy); delay = d => 320 * (d.cy - y0) / Math.max(1, y1 - y0); }
    }
    svg.selectAll('g.hex').each(function (d) {
      const p = provinceOf(d.code), enc = out.get(d.code) || {}, cell = d3.select(this);
      const outside = state.region && p.region !== state.region;
      cell.classed('is-selected', state.province === d.code).classed('is-outside', !!outside).classed('has-halo', !!enc.halo)
        .attr('tabindex', d.code === active ? 0 : -1)
        .attr('aria-pressed', String(state.province === d.code))
        .attr('aria-label', ptitle(p) + ', ' + p.count + t(' เขต, ', ' constituencies, ') + p.seats.map(s => s.party + ' ' + s.count).join(', ') + (enc.text ? ', ' + enc.text : '') + ', ' + t('อัตราการใช้สิทธิ ', 'turnout ') + fmtP(p.turnoutRate.value));
      const poly = cell.select('polygon'), label = cell.select('text').attr('data-name', pname(p)), fill = enc.fill || colors().empty, ink = enc.ink || colors().emptyInk;
      if (motion) recolor(poly, label, fill, ink, delay(d));
      else { poly.interrupt('paint').attr('fill', fill).attr('fill-opacity', null); label.interrupt('paint').attr('fill', ink); }
    });
    // A tile dimmed by the region filter casts a dimmed shadow too.
    svg.selectAll('.hex-shade polygon').classed('is-outside', d => isOutside(d.code));
    setLegend(legend);
    const selTile = tiles.find(x => x.code === state.province);
    d3.select('#hexmap .sel-ring').attr('display', selTile ? null : 'none').attr('points', selTile ? hexPoints(selTile.cx, selTile.cy) : null);
    layoutLabels();   // also redraws a lifted tile; it takes its new colour at once (the real tile may still be blending)
    if (liftedCode) { const enc = out.get(liftedCode) || {}, copy = d3.select('#hexmap .hex-lifted'); copy.select('polygon').attr('fill', enc.fill || colors().empty).attr('fill-opacity', null); copy.select('text').attr('fill', enc.ink || colors().emptyInk); }
    if (!litOnce && !$('hexmap').hasAttribute('hidden') && $('hexmap').clientWidth) lightUpMap();
  }

  /* ---------- province drill-down: real constituency outlines replace the national map ---------- */
  let shapesPromise = null, distZoom = null, distCamera = d3.zoomIdentity, distKey = '';
  function loadShapes() {
    if (window.E69_DISTRICT_SHAPES) return Promise.resolve();
    if (!shapesPromise) shapesPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script'); s.src = CFG().districtShapes;   // set per election in election.csv
      s.onload = () => window.E69_DISTRICT_SHAPES ? resolve() : reject(Error('district shapes missing'));
      s.onerror = () => { shapesPromise = null; reject(Error('district shapes failed to load')); };
      document.head.append(s);
    });
    return shapesPromise;
  }
  // One colour rule per map mode, the same meaning as on the national map but per constituency.
  let districtScales = null;
  function districtEncoding() {
    const mode = state.mapMode, party = state.party, rows = D.rows;
    if (!districtScales) {
      const ext = f => d3.extent(rows, f).map((v, i) => i ? Math.ceil(v) : Math.floor(v));
      districtScales = { turnout: ext(r => r.turnoutPct), invalid: ext(r => r.invalidPct) };
    }
    const inkFor = fill => luminance(d3.color(fill).formatHex()) > 0.33 ? '#102631' : '#fff', pal = colors();
    if (mode === 'turnout' || mode === 'invalid') {
      const [lo, hi] = districtScales[mode], interp = rateRamp(mode);
      const color = v => interp(0.12 + 0.83 * (v - lo) / Math.max(1e-9, hi - lo)), get = r => mode === 'turnout' ? r.turnoutPct : r.invalidPct;
      return { fill: r => Number.isFinite(get(r)) ? color(get(r)) : pal.empty, ink: r => Number.isFinite(get(r)) ? inkFor(color(get(r))) : pal.otherInk, value: r => fmtP(get(r)),
        legend: '<div class="lg-ramp"><span>' + lo + '%</span><i style="background:linear-gradient(90deg,' + color(lo) + ',' + color((lo + hi) / 2) + ',' + color(hi) + ')"></i><span>' + hi + '%</span></div><p class="lg-cap">' + (mode === 'turnout' ? t('อัตราการใช้สิทธิรายเขต สเกลเดียวกับทั้ง ' + D.rows.length + ' เขต', 'Constituency turnout, on one scale for all ' + D.rows.length + ' constituencies') : t('บัตรเสียแบบแบ่งเขต ÷ ผู้มาใช้สิทธิ รายเขต สเกลเดียวกับทั้ง ' + D.rows.length + ' เขต', 'Invalid constituency ballots ÷ turnout, on one scale for all ' + D.rows.length)) + '</p>' };
    }
    const p = provinceOf(state.province);
    if ((mode === 'list' || mode === 'cand') && party) {
      const share = r => { const c = D.comparison(r, party); return mode === 'list' ? c.listShare : (c.candidatePresent ? c.candidateShare : 0); };
      const hi = Math.max(1, Math.ceil(d3.max(rows, share) || 1)), ramp = partyRamp(pal.shareBase, D.colorOf(party)), color = v => ramp(0.08 + 0.92 * v / hi);
      return { fill: r => Number.isFinite(share(r)) ? color(share(r)) : pal.empty, ink: r => Number.isFinite(share(r)) ? inkFor(color(share(r))) : pal.otherInk, value: r => fmtP(share(r)),
        legend: '<div class="lg-ramp"><span>0%</span><i style="background:linear-gradient(90deg,' + rampStops(ramp, 0.08, 0, D.colorOf(party)) + ')"></i><span>' + hi + '%</span></div><p class="lg-cap">' + esc(party) + ' ' + (mode === 'list' ? t('สัดส่วนคะแนนเลือกพรรคในแต่ละเขต', 'party-list share in each constituency') : t('สัดส่วนคะแนนผู้สมัครในแต่ละเขต (ไม่ส่งผู้สมัครนับ 0)', 'candidate share in each constituency (no candidate counts as 0)')) + '</p>' };
    }
    if (mode === 'list') {
      // No party chosen: the party with the most party votes in each constituency, beside who won the seat.
      const top = r => { let best = null; for (const [x, v] of Object.entries(r.partyList || {})) if (Number.isFinite(v) && (!best || v > best[1])) best = [x, v]; return best ? best[0] : null; };
      const mine = rows.filter(r => r.provinceCode === state.province), counts = d3.rollups(mine.filter(top), v => v.length, top).sort((a, b) => b[1] - a[1]);
      const differ = mine.filter(r => top(r) && top(r) !== r.winnerParty).length;
      return { fill: r => top(r) ? D.colorOf(top(r)) : pal.empty, ink: r => top(r) ? inkFor(D.colorOf(top(r))) : pal.otherInk, value: r => top(r) ? t('คะแนนเลือกพรรคสูงสุด ', 'most party votes: ') + top(r) : '',
        legend: '<div class="lg-items">' + counts.map(([x, n]) => '<button type="button" class="lg-item" data-act="party" data-v="' + esc(x) + '">' + dot(x) + esc(x) + ' <small>' + n + t(' เขต', '') + '</small></button>').join('') + '</div><p class="lg-cap">' + t('สีคือพรรคที่ได้คะแนนเลือกพรรคมากที่สุดในแต่ละเขต', 'Colour is the party with the most party votes in each constituency') +
          (differ ? t(' · ' + differ + ' จาก ' + mine.length + ' เขต ไม่ใช่พรรคของผู้ชนะเขต', ' · in ' + differ + ' of ' + mine.length + ' it is not the winner\'s party') : '') + '</p>' };
    }
    if (party) {
      const c = D.colorOf(party), won = r => r.winnerParty === party;
      return { fill: r => won(r) ? c : pal.other, ink: r => won(r) ? inkFor(c) : pal.otherInk, value: r => r.winnerParty || '',
        legend: '<div class="lg-items">' + '<span class="lg-item">' + dot(party) + esc(party) + t(' ชนะ ', ' won ') + (p.seats.find(s => s.party === party)?.count || 0) + t(' เขต', ' seats') + '</span><span class="lg-item"><i class="dot" style="--c:' + pal.other + '" aria-hidden="true"></i>' + t('พรรคอื่นชนะ', 'won by another party') + '</span></div>' };
    }
    return { fill: r => r.winnerParty ? D.colorOf(r.winnerParty) : pal.empty, ink: r => r.winnerParty ? inkFor(D.colorOf(r.winnerParty)) : pal.otherInk, value: r => r.winnerParty || t('ยังไม่มีผู้ชนะ', 'no winner'),
      legend: '<div class="lg-items">' + p.seats.map(s => '<button type="button" class="lg-item" data-act="party" data-v="' + esc(s.party) + '">' + dot(s.party) + esc(s.party) + ' <small>' + s.count + t(' เขต', '') + '</small></button>').join('') + '</div><p class="lg-cap">' + t('สีคือพรรคของผู้ชนะในแต่ละเขต ตัวเลขในพื้นที่คือหมายเลขเขต', 'Colour is the winning party in each constituency; numbers are constituency numbers') + '</p>' };
  }
  // Fits a province into the constituency map. On a phone the map tools sit over the top-right corner of the map and
  // the colour key button over the bottom-right, so a constituency drawn there would hide under a button, number and
  // all. When the plain fit runs under either, the drawing is first slid aside within the map and only made smaller
  // (a step at a time) when sliding is not enough; of the places that keep clear it takes the one nearest the middle.
  function fitDistricts(feats, W, H, el) {
    const M = 18, plain = d3.geoIdentity().reflectY(true).fitExtent([[M, M], [W - M, H - M]], { type: 'FeatureCollection', features: feats });
    if (!isM()) return plain;
    const box = el.getBoundingClientRect();
    const room = n => { if (!n || !n.getClientRects().length) return null; const r = n.getBoundingClientRect();
      return r.width ? { x0: r.left - box.left - 6, y0: r.top - box.top - 6, x1: r.right - box.left + 6, y1: r.bottom - box.top + 6 } : null; };
    const keep = [room($('mapTools')), room($('mapLegend').querySelector('.lg-toggle'))].filter(Boolean);
    if (!keep.length) return plain;
    // Outer outlines as the plain fit draws them, each with its bounding box, and the box of the whole province.
    const rings = feats.flatMap(f => f.geometry.type === 'Polygon' ? [f.geometry.coordinates[0]] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates.map(p => p[0]) : [])
      .map(ring => { const pts = ring.map(pt => plain(pt)); return { pts, x0: d3.min(pts, q => q[0]), x1: d3.max(pts, q => q[0]), y0: d3.min(pts, q => q[1]), y1: d3.max(pts, q => q[1]) }; });
    if (!rings.length) return plain;
    const bx0 = d3.min(rings, r => r.x0), by0 = d3.min(rings, r => r.y0), bw = d3.max(rings, r => r.x1) - bx0, bh = d3.max(rings, r => r.y1) - by0;
    // Does an outline cross box r, or hold it inside? (An edge through the box, or a corner of the box in the shape.)
    const meets = (ring, r) => {
      if (ring.x1 < r.x0 || ring.x0 > r.x1 || ring.y1 < r.y0 || ring.y0 > r.y1) return false;
      const p = ring.pts;
      for (let i = 1; i < p.length; i++) {
        const ax = p[i - 1][0], ay = p[i - 1][1], bx = p[i][0], by = p[i][1];
        if ((ax < r.x0 && bx < r.x0) || (ax > r.x1 && bx > r.x1) || (ay < r.y0 && by < r.y0) || (ay > r.y1 && by > r.y1)) continue;
        let t0 = 0, t1 = 1, cut = false;                       // Liang–Barsky: does the edge a–b reach into the box?
        for (const [d, q] of [[ax - bx, ax - r.x0], [bx - ax, r.x1 - ax], [ay - by, ay - r.y0], [by - ay, r.y1 - ay]]) {
          if (d === 0) { if (q < 0) { cut = true; break; } continue; }
          const t = q / d;
          if (d < 0) { if (t > t1) { cut = true; break; } if (t > t0) t0 = t; } else { if (t < t0) { cut = true; break; } if (t < t1) t1 = t; }
        }
        if (!cut) return true;
      }
      return d3.polygonContains(p, [r.x0, r.y0]);
    };
    // Is the drawing clear of every button when made s times as large and its top-left corner put at (left, top)?
    // The buttons' boxes are taken back into the plain drawing, so no outline is moved to test a place.
    const clear = (s, left, top) => keep.every(k => {
      const r = { x0: bx0 + (k.x0 - left) / s, x1: bx0 + (k.x1 - left) / s, y0: by0 + (k.y0 - top) / s, y1: by0 + (k.y1 - top) / s };
      return !rings.some(ring => meets(ring, r));
    });
    const k0 = plain.scale(), [tx, ty] = plain.translate();
    const placed = (s, left, top) => d3.geoIdentity().reflectY(true).scale(k0 * s).translate([s * tx + left - s * bx0, s * ty + top - s * by0]);
    for (let s = 1; s >= 0.6; s -= 0.02) {
      const w = bw * s, h = bh * s, cx = M + (W - 2 * M - w) / 2, cy = M + (H - 2 * M - h) / 2;
      let spot = null;
      for (const top of [cy, M, H - M - h]) for (const left of [cx, M, W - M - w]) if (!spot && clear(s, left, top)) spot = [left, top];
      if (!spot) continue;
      let lo = 0, hi = 1;                                      // then back toward the middle as far as it stays clear
      for (let i = 0; i < 6; i++) { const m = (lo + hi) / 2; if (clear(s, spot[0] + (cx - spot[0]) * m, spot[1] + (cy - spot[1]) * m)) lo = m; else hi = m; }
      return placed(s, spot[0] + (cx - spot[0]) * lo, spot[1] + (cy - spot[1]) * lo);
    }
    return plain;
  }

  function drawDistrictMap(entrance, animate) {
    const code = state.province, el = $('distmap'), p = provinceOf(code);
    const change = colourChange(), motion = animate && !entrance && change;
    $('mapLegend').style.width = $('mapLegend').style.maxHeight = '';
    $('mapStage').classList.remove('legend-compact');
    if (!window.E69_DISTRICT_SHAPES) {
      $('mapLegend').innerHTML = ''; $('mapLoading').hidden = false; $('mapLoading').textContent = t('กำลังโหลดแผนที่รายเขต…', 'Loading constituency map…');
      loadShapes().then(() => { if (state.province === code && state.page === 'overview') updateMap(); })
        .catch(() => { $('mapLoading').textContent = t('โหลดแผนที่รายเขตไม่ได้ ตรวจว่ามีไฟล์ ' + CFG().districtShapes + ' อยู่ในโฟลเดอร์เว็บ', 'Could not load the constituency map. Check that ' + CFG().districtShapes + ' is in the site folder.'); });
      return;
    }
    $('mapLoading').hidden = true;
    const enc = districtEncoding();
    setLegend(enc.legend);
    const W = el.clientWidth, H = el.clientHeight; if (!W || !H) return;
    const svg = d3.select(el).attr('aria-label', t('แผนที่เขตเลือกตั้งของ', 'Constituency map of ') + ptitle(p));
    // Outlines are fitted once per province. Small size changes (the colour key under the map gaining or losing
    // a line when a party is picked) just rescale the same drawing through its viewBox; rebuilding would reset
    // every shape mid-recolour. Only a large resize re-fits.
    const fit = el.__fit, refit = !fit || Math.abs(W - fit[0]) > fit[0] * 0.15 || Math.abs(H - fit[1]) > fit[1] * 0.15;
    if (code !== distKey || refit) {
      distKey = code; el.__fit = [W, H];
      svg.attr('viewBox', [0, 0, W, H].join(' '));
      const feats = window.E69_DISTRICT_SHAPES.features.filter(f => f.properties.provinceCode === code);
      const projection = fitDistricts(feats, W, H, el);
      const path = d3.geoPath(projection);
      svg.selectAll('*').remove();
      addSheenDefs(svg.append('defs'), 'dist').selectAll('path').data(feats).join('path').attr('d', path);
      const g = svg.append('g').attr('class', 'dist-layer');
      // The province stands off the sea like the tiles of the national map (offset copies underneath).
      const shade = g.append('g').attr('class', 'hex-shade').attr('aria-hidden', 'true');
      for (const [dy, cls] of [[4, 'far'], [2, 'near']]) shade.append('g').attr('class', cls).attr('transform', 'translate(0,' + dy + ')').selectAll('path').data(feats).join('path').attr('d', path);
      const cells = g.selectAll('g.dist').data(feats, f => f.properties.id).join('g').attr('class', 'dist').attr('data-id', f => f.properties.id).attr('role', 'button').attr('tabindex', 0);
      cells.append('path').attr('d', path);
      g.append('path').attr('class', 'ring sel-ring').attr('display', 'none');
      g.append('path').attr('class', 'ring hover-ring').attr('display', 'none');
      // Numbers in their own layer above every outline, so no neighbouring shape or ring can cover one; each sits at
      // its shape's visual centre and is sized to the room there (see labelSpot / sizeDistLabels).
      g.append('g').attr('class', 'dist-labels').attr('aria-hidden', 'true').selectAll('text').data(feats, f => f.properties.id).join('text')
        .attr('class', 'dist-label').attr('data-id', f => f.properties.id).attr('dy', '.36em').text(f => f.properties.number)
        .each(function (f) { const [x, y, r] = labelSpot(f, projection); this.__room = r; d3.select(this).attr('x', x.toFixed(1)).attr('y', y.toFixed(1)); });
      el.__labelBase = Math.max(12, Math.min(17, Math.min(W, H) / 26)) + typeUp();
      sizeDistLabels(el, 1);
      addSheen(g, 'dist', 0, 0, W, H);
      el.__path = path;
      distCamera = d3.zoomIdentity;
      if (!distZoom) {
        distZoom = d3.zoom().scaleExtent([1, 8])
          .filter(ev => ev.type === 'wheel' ? !ev.button : ev.type.startsWith('touch') ? (ev.touches.length > 1 || distCamera.k > 1.01) : !ev.button && !ev.ctrlKey)
          .on('zoom', ev => { distCamera = ev.transform; d3.select(el).select('g.dist-layer').attr('transform', distCamera); sizeDistLabels(el, distCamera.k); hideChartTip(); });
        d3.select(el).call(distZoom).on('dblclick.zoom', null).style('touch-action', 'pan-y pinch-zoom');
        el.addEventListener('pointerover', ev => { const c = ev.target.closest('.dist'); if (c && ev.pointerType !== 'touch') hoverDistrict(c.dataset.id, ev); });
        el.addEventListener('pointermove', ev => { const c = ev.target.closest('.dist'); if (c && ev.pointerType !== 'touch') hoverDistrict(c.dataset.id, ev); });
        el.addEventListener('pointerout', ev => { const c = ev.target.closest('.dist'); if (c && !(ev.relatedTarget && c.contains(ev.relatedTarget))) hoverDistrict('', ev); });
        el.addEventListener('click', ev => { const c = ev.target.closest('.dist'); if (c) pickDistrict(c.dataset.id); });
        el.addEventListener('keydown', ev => { const c = ev.target.closest('.dist'); if (c && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); pickDistrict(c.dataset.id); } });
        el.addEventListener('focusin', ev => { const c = ev.target.closest('.dist'); if (c) setDistrictRing('hover', c.dataset.id); });
        el.addEventListener('focusout', () => setDistrictRing('hover', ''));
      }
      d3.select(el).call(distZoom.transform, d3.zoomIdentity);
    }
    // A new colouring spreads from the middle of the province outward, like the bloom that opened it.
    const mid = [el.__fit[0] / 2, el.__fit[1] / 2], awayFromMid = f => { const [x, y] = el.__path.centroid(f); return Math.hypot(x - mid[0], y - mid[1]); };
    const farthest = motion ? d3.max(svg.selectAll('g.dist').data(), awayFromMid) || 1 : 1;
    const labelOf = new Map(); svg.selectAll('text.dist-label').each(function (f) { labelOf.set(f.properties.id, d3.select(this)); });
    svg.selectAll('g.dist').each(function (f) {
      const r = D.byId.get(f.properties.id), cell = d3.select(this), shape = cell.select('path'), label = labelOf.get(f.properties.id);
      if (motion) recolor(shape, label, enc.fill(r), enc.ink(r), 240 * awayFromMid(f) / farthest);
      else { shape.interrupt('paint').attr('fill', enc.fill(r)); label.interrupt('paint').attr('fill', enc.ink(r)); }
      label.classed('has-halo', enc.ink(r) === '#fff');
      cell.attr('aria-label', t('เขต ', 'Constituency ') + r.number + ', ' + (r.zone || []).map(z => zoneParts(z).base).join(', ') + ', ' + (r.winnerName ? r.winnerName + ', ' + r.winnerParty : t('ยังไม่มีผู้ชนะ', 'no winner')) + ', ' + enc.value(r)).attr('aria-pressed', String(state.district === r.id));
    });
    setDistrictRing('sel', state.district);
    // A constituency chosen from search or a list pulses once the map has settled, so the eye finds it.
    if (pulseId && pulseId === state.district) { const id = pulseId; pulseId = ''; setTimeout(() => pulseDistrict(id), entrance ? 780 : 80); }
    if (entrance && !calmMotion()) {
      // Constituencies bloom out of the zoomed tile: the ones nearest the centre arrive first, each with its number.
      const c = [W / 2, H / 2], cells = svg.selectAll('g.dist, text.dist-label');
      const away = f => { const [x, y] = el.__path.centroid(f); return Math.hypot(x - c[0], y - c[1]); };
      const far = d3.max(cells.data(), away) || 1;
      cells.attr('opacity', 0).attr('transform', foldTransform(el))
        .transition('enter').delay(f => 40 + 300 * away(f) / far).duration(520).ease(d3.easeBackOut.overshoot(0.9))
        .attr('opacity', 1).attr('transform', 'translate(0,0) scale(1) translate(0,0)')
        .on('end', function () { d3.select(this).attr('transform', null).attr('opacity', null); });
    }
  }
  /* Constituency numbers. Each sits at its shape's visual centre: the point inside it farthest from every edge (the
     pole of inaccessibility, found with the polylabel method), which a centroid is not for long, bent or hooked shapes.
     That distance is the room the number has, so a number shrinks to fit inside its shape instead of spilling across
     a border; a shape too small even for the 10 px floor keeps the floor and its halo (zooming in gives it room). */
  function segDist2(px, py, ax, ay, bx, by) {
    let x = ax, y = ay, dx = bx - x, dy = by - y;
    if (dx || dy) { const k = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy); if (k > 1) { x = bx; y = by; } else if (k > 0) { x += dx * k; y += dy * k; } }
    dx = px - x; dy = py - y;
    return dx * dx + dy * dy;
  }
  function polylabel(rings, precision) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of rings[0]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const size = Math.min(x1 - x0, y1 - y0);
    if (!(size > 0)) return [x0, y0, 0];
    const dist = (x, y) => {   // distance to the outline, negative outside (holes count as outside)
      let inside = false, best = Infinity;
      for (const ring of rings) for (let i = 0, n = ring.length, j = n - 1; i < n; j = i++) {
        const [ax, ay] = ring[i], [bx, by] = ring[j];
        if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
        best = Math.min(best, segDist2(x, y, ax, ay, bx, by));
      }
      return (inside ? 1 : -1) * Math.sqrt(best);
    };
    const cell = (x, y, h) => { const d = dist(x, y); return { x, y, h, d, max: d + h * Math.SQRT2 }; };
    const heap = [];   // cells by the best distance they could still hold, largest first
    const up = c => { heap.push(c); for (let i = heap.length - 1; i;) { const p = (i - 1) >> 1; if (heap[p].max >= heap[i].max) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const down = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) { heap[0] = last; for (let i = 0; ;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l].max > heap[m].max) m = l; if (r < heap.length && heap[r].max > heap[m].max) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } }
      return top;
    };
    for (let x = x0; x < x1; x += size) for (let y = y0; y < y1; y += size) up(cell(x + size / 2, y + size / 2, size / 2));
    let best = cell((x0 + x1) / 2, (y0 + y1) / 2, 0);
    let a = 0, cx = 0, cy = 0;   // area centroid of the outer ring, another good first guess
    for (let i = 0, r = rings[0], n = r.length, j = n - 1; i < n; j = i++) { const f = r[i][0] * r[j][1] - r[j][0] * r[i][1]; a += f; cx += (r[i][0] + r[j][0]) * f; cy += (r[i][1] + r[j][1]) * f; }
    if (a) { const c = cell(cx / (3 * a), cy / (3 * a), 0); if (c.d > best.d) best = c; }
    while (heap.length) {
      const c = down();
      if (c.d > best.d) best = c;
      if (c.max - best.d <= precision) continue;
      const h = c.h / 2;
      up(cell(c.x - h, c.y - h, h)); up(cell(c.x + h, c.y - h, h)); up(cell(c.x - h, c.y + h, h)); up(cell(c.x + h, c.y + h, h));
    }
    return [best.x, best.y, best.d];
  }
  // [x, y, room] for a constituency in map pixels; a multi-part constituency (islands) is labelled in its roomiest part.
  function labelSpot(f, project) {
    const geo = f.geometry, polys = geo.type === 'MultiPolygon' ? geo.coordinates : geo.type === 'Polygon' ? [geo.coordinates] : [];
    let best = null;
    for (const poly of polys) {
      const spot = polylabel(poly.map(ring => ring.map(pt => project(pt))), 0.5);
      if (!best || spot[2] > best[2]) best = spot;
    }
    return best || [0, 0, 0];
  }
  // One size for every number that has room for it; a number in a tight shape shrinks to fit (never below 10 px).
  // Sizes are screen pixels at zoom k: zooming in gives small shapes room to show their number at full size.
  const DIST_FLOOR = 10;
  function sizeDistLabels(el, k) {
    const base = el.__labelBase || 14;
    d3.select(el).selectAll('text.dist-label').each(function (f) {
      const r = (this.__room || 0) * k, room = (String(f.properties.number).length > 1 ? 1.25 : 1.85) * r;   // digits fit the clear circle
      this.setAttribute('font-size', (Math.max(DIST_FLOOR, Math.min(base, room)) / k).toFixed(2));
    });
  }
  function setDistrictRing(kind, id) {
    const el = $('distmap'), f = id && window.E69_DISTRICT_SHAPES?.features.find(x => x.properties.id === id && x.properties.provinceCode === state.province);
    d3.select(el).select('.' + kind + '-ring').attr('display', f && el.__path ? null : 'none').attr('d', f && el.__path ? el.__path(f) : null);
    if (kind === 'hover') d3.select(el).selectAll('g.dist').classed('is-hover', x => !!f && x.properties.id === id);   // for the spotlight in e69.css
  }
  let pulseId = '';
  function pulseDistrict(id) {
    const el = $('distmap'), f = window.E69_DISTRICT_SHAPES?.features.find(x => x.properties.id === id && x.properties.provinceCode === state.province);
    if (!f || !el.__path || state.district !== id || calmMotion() || el.hasAttribute('hidden')) return;
    const layer = d3.select(el).select('g.dist-layer');
    layer.selectAll('path.pulse-ring').remove();
    layer.append('path').attr('class', 'ring pulse-ring').attr('d', el.__path(f)).on('animationend', function () { this.remove(); });
  }
  function hoverDistrict(id, ev) {
    setDistrictRing('hover', id);
    if (!id) { hideChartTip(); return; }
    const r = D.byId.get(id);
    const zones = (r.zone || []).map(z => { const zp = zoneParts(z), extra = zp.paren.length > 72 ? zp.paren.slice(0, 70) + '…' : zp.paren; return '<li><b>' + esc(zp.base) + '</b>' + (extra ? ' <small>(' + esc(extra) + ')</small>' : '') + '</li>'; }).join('');
    chartTip(ev, '<b>' + esc(dname(r)) + '</b>' + (zones ? '<ul class="tt-zones" aria-label="' + t('พื้นที่ในเขต', 'Areas in this constituency') + '">' + zones + '</ul>' : '') + (r.winnerParty ? '<div class="tt-win">' + face(r.winner, r.winnerParty, 'md') + '<span><small>' + t('ผู้ชนะ', 'Winner') + '</small><b>' + nm(r.winnerName) + '</b><small>' + dot(r.winnerParty) + esc(r.winnerParty) + '</small></span></div><div class="tt-row"><span>' + t('คะแนน', 'Votes') + '</span><span>' + fmt(r.winnerVotes) + ' (' + fmtP(r.winnerShare) + ')</span></div><div class="tt-row"><span>' + t('ส่วนต่าง', 'Margin') + '</span><span>' + fmt(r.marginVotes) + ' (' + fmtP(r.marginPct) + ')</span></div>' : '<div>' + t('ยังไม่มีผู้ชนะ', 'No winner') + '</div>') + '<div class="tt-row"><span>' + t('อัตราการใช้สิทธิ', 'Turnout') + '</span><span>' + fmtP(r.turnoutPct) + '</span></div><small>' + t('คลิกเพื่อดูคะแนนผู้สมัครทุกคน', 'Click for every candidate') + '</small>');
  }
  function pickDistrict(id) {
    hideChartTip();
    // Phones: a tap always opens the constituency in the panel (a second tap does not close it).
    if (isM()) { if (mPanelSize === 'peek') mPanelSize = 'half'; setState({ district: id, candidate: '' }); return; }
    setState({ district: state.district === id ? '' : id, candidate: '' });
  }
  // Reset: from a province the map folds back and pulls out to the whole country (see flyOut);
  // on the national map it glides back to the centred starting view.
  function resetMap() {
    hideTip(true); hideChartTip();
    if (state.province) { setState({ province: '', district: '', candidate: '' }); return; }
    const svg = d3.select('#hexmap');
    if (calmMotion()) svg.call(zoomBehavior.transform, d3.zoomIdentity);
    else svg.transition('fly').duration(650).ease(d3.easeCubicInOut).call(zoomBehavior.transform, d3.zoomIdentity);
  }

  function scheduleLabels() {
    if (labelFrame) return;
    labelFrame = requestAnimationFrame(() => {
      labelFrame = 0;
      if ($('mapStage')?.classList.contains('is-animating')) { layoutLabels(); return; }
      if (state.page === 'overview' && shownProvince) drawDistrictMap(); else layoutLabels();
    });
  }
  // Every tile always shows its full province name. Each label picks the line split that gives the largest
  // legible size inside its hexagon; long names get a slightly smaller size instead of an abbreviation.
  // A romanised name that cannot reach the floor gets more break points and may go down to LATIN_FLOOR, so it stays
  // inside its tile instead of running under the neighbouring tiles (small windows in English).
  const LABEL_FLOOR = 8.5, LATIN_FLOOR = 7, LINE = 1.08;
  // Keep the legend inside the empty Gulf area: right of the southern provinces and below the eastern ones.
  function positionLegend() {
    const el = $('hexmap'), lg = $('mapLegend'), stage = $('mapStage'); if (!el || !lg) return;
    // The constituency map keeps its legend in a row underneath; only the national map places it in the sea.
    if (narrow() || stage.classList.contains('is-province')) { stage.classList.remove('legend-compact'); lg.style.width = lg.style.maxHeight = ''; return; }
    const s = Math.min(el.clientWidth / vb.w, el.clientHeight / vb.h), offY = (el.clientHeight - vb.h * s) / 2, offX = (el.clientWidth - vb.w * s) / 2, half = R * SQ3 / 2;
    const southRight = Math.max(...tiles.filter(d => d.y >= 12).map(d => d.cx)) + half;
    const northBottom = Math.max(...tiles.filter(d => d.y < 12 && d.cx + half > southRight).map(d => d.cy)) + R;
    const room = el.clientWidth - offX - (southRight - vb.x) * s - 20, height = el.clientHeight - (offY + (northBottom - vb.y) * s) - 18;
    // Too little open sea beside the south: fold the legend into a "colour key" button instead of covering provinces.
    const compact = room < 170 || height < 200;
    stage.classList.toggle('legend-compact', compact);
    if (compact) { lg.style.width = lg.style.maxHeight = ''; return; }
    lg.style.width = Math.min(250, room) + 'px';
    lg.style.maxHeight = height + 'px';
  }
  function layoutLabels() {
    const el = $('hexmap'); if (!el || !el.clientWidth) return;
    positionLegend();
    const svgScale = Math.min(el.clientWidth / vb.w, el.clientHeight / vb.h), scale = svgScale * camera.k;
    const up = typeUp(), hexW = R * SQ3 * scale, hexH = 2 * R * scale, base = Math.max(10 + up, Math.min(14 + up, hexW * 0.27));   // a name is never larger than this, nor than fits its tile
    const roomW = [0, 0.88, 0.86, 0.78], roomH = [0, 0.5, 0.66, 0.8];
    // Romanised names run longer per line, so they are fitted to the tile's real outline: a pointy-top hexagon
    // narrows towards its top and bottom points, and every line has to clear the edges at its own height.
    const tip = hexH / 2, halfW = y => y <= tip / 2 ? hexW / 2 : hexW / 2 * Math.max(0, (tip - y) / (tip / 2));
    const shapeFit = o => {
      const fits = s => o.ws.every((w, i) => { const y = (Math.abs(i - (o.ws.length - 1) / 2) * LINE + 0.38) * s; return y <= tip * 0.94 && w * s / 2 <= halfW(y) * 0.92; });
      let lo = 0, hi = base; for (let k = 0; k < 16; k++) { const m = (lo + hi) / 2; if (fits(m)) lo = m; else hi = m; }
      return lo;
    };
    const choose = (opts, latin) => {
      let best = null;
      for (const o of opts) {
        const n = o.lines.length, fit = latin ? shapeFit(o) : Math.min(base, hexW * roomW[n] / o.w, hexH * roomH[n] / (n * LINE));
        const score = fit - (n - 1) * 0.6;
        if (!best || score > best.score) best = { o, fit, score };
      }
      return best;
    };
    const withWidths = lines => { const ws = lines.map(measure); return { lines, ws, w: Math.max(...ws) }; };
    d3.select(el).selectAll('g.hex').each(function (d) {
      const text = d3.select(this).select('text'), name = text.attr('data-name') || '', latin = /[a-z]/i.test(name);
      if (!d.opts || d.optsFor !== name) { d.opts = lineOptions(name, d.code).map(withWidths); d.tightOpts = null; d.optsFor = name; }
      let best = choose(d.opts, latin);
      if (latin && best.fit < LABEL_FLOOR) {
        d.tightOpts = d.tightOpts || lineOptions(name, d.code, true).map(withWidths);
        best = choose(d.tightOpts, true);
        // Nothing fits even at the smallest size: take the arrangement that overflows least, whatever its line count.
        if (best.fit < LATIN_FLOOR) best = d.tightOpts.map(o => ({ o, fit: shapeFit(o) })).reduce((a, b) => b.fit > a.fit ? b : a);
      }
      const px = Math.max(latin ? LATIN_FLOOR : LABEL_FLOOR, best.fit), n = best.o.lines.length;
      d.fitK = Math.min(1, best.fit / px);   // below 1 the name is already larger than its tile (a small map); the phone lens uses it
      text.attr('font-size', px / scale).attr('display', null);
      text.selectAll('tspan').data(best.o.lines).join('tspan').attr('x', d.cx).attr('dy', (_, i) => i === 0 ? (-(n - 1) / 2 * LINE + 0.36) + 'em' : LINE + 'em').text(x => x);
    });
    if (liftedCode) liftTile(liftedCode, true);
  }

  function setHover(code) {
    d3.select('#hexmap').selectAll('g.hex').classed('is-hover', d => d.code === code);
    liftTile(code);
  }
  /* The province under the pointer (or keyboard focus) rises a little above its neighbours: a copy of its tile and
     name, with the glowing outline, grows to LIFT around the tile's centre with a small overshoot and casts a soft
     shadow. The copy takes no pointer events, so the real tile underneath still answers the pointer. `still` redraws
     the copy at full lift without motion (new colours, re-fitted labels). */
  const LIFT = 1.14;
  let liftedCode = '';
  function liftTile(code, still) {
    const lift = d3.select('#hexmap .hex-lift');
    if (lift.empty() || (code === liftedCode && !still)) return;
    liftedCode = code || '';
    lift.selectAll('g.lift-wrap').interrupt('lift').remove();
    const tile = code && tiles.find(x => x.code === code), src = tile && document.querySelector('#hexmap g.hex[data-code="' + code + '"]');
    if (!src) return;
    const at = k => 'translate(' + tile.cx + ',' + tile.cy + ') scale(' + k + ') translate(' + -tile.cx + ',' + -tile.cy + ')';
    const wrap = lift.append('g').attr('class', 'lift-wrap'), copy = src.cloneNode(true);
    for (const a of ['role', 'tabindex', 'aria-label', 'aria-pressed', 'data-code', 'style', 'class']) copy.removeAttribute(a);
    copy.setAttribute('class', ['hex-lifted', ...['has-halo', 'is-outside'].filter(c => src.classList.contains(c))].join(' '));
    wrap.node().append(copy);
    wrap.append('polygon').attr('class', 'ring hover-ring').attr('points', hexPoints(tile.cx, tile.cy));
    if (still || calmMotion()) wrap.attr('transform', at(LIFT));
    else wrap.attr('transform', at(1)).transition('lift').duration(240).ease(d3.easeBackOut.overshoot(2.2)).attr('transform', at(LIFT));
  }
  function showPill(code) {
    const pill = $('hexPill'), p = provinceOf(code); if (!p) return;
    pill.textContent = pname(p); pill.hidden = false; pill.dataset.code = code; positionPill();
  }
  function positionPill() {
    const pill = $('hexPill'); if (pill.hidden) return;
    const cell = document.querySelector('#hexmap g.hex[data-code="' + pill.dataset.code + '"] polygon'); if (!cell) return;
    const r = cell.getBoundingClientRect(), w = pill.offsetWidth;
    pill.style.left = Math.max(6, Math.min(innerWidth - w - 6, r.left + r.width / 2 - w / 2)) + 'px';
    pill.style.top = Math.max(6, r.top - pill.offsetHeight - 6) + 'px';
  }
  function hidePill() { $('hexPill').hidden = true; }

  /* Province tooltip. With a mouse it opens at the pointer and follows it across the map. Once the pointer
     rests on a province the tooltip settles, so moving a short way into it (to scroll the winner list) does not
     push it away. Keyboard focus anchors it beside the tile instead. Escape closes it. */
  let hideTimer = 0, switchTimer = 0, restTimer = 0, followFrame = 0, lastPt = null, restPt = null, settled = false, pointerPt = null, dismissedAt = null;
  const TIP_GAP = 18, SETTLE_MS = 260, SETTLE_RADIUS = 70;
  document.addEventListener('pointermove', ev => { pointerPt = { x: ev.clientX, y: ev.clientY }; }, { capture: true, passive: true });
  // After Escape the tooltip stays closed until the pointer really moves. Hiding it uncovers the map under a still
  // pointer, and the browser then sends a fresh pointerover for that tile, which must not reopen it.
  function dismissTip() { dismissedAt = pointerPt; }
  const stillDismissed = ev => { if (!dismissedAt || !ev) return false; if (Math.hypot(ev.clientX - dismissedAt.x, ev.clientY - dismissedAt.y) < 8) return true; dismissedAt = null; return false; };
  // While it follows the pointer the tooltip lets the pointer through, so a quick move that lands on it still reaches
  // the map. It only takes the pointer once settled.
  function settle(v) { settled = v; $('provinceTip').classList.toggle('is-following', !v); }
  function restSoon() { settle(false); clearTimeout(restTimer); restTimer = setTimeout(() => { settle(true); restPt = lastPt; }, SETTLE_MS); }
  function onHexEnter(code, cell, ev) {
    clearTimeout(hideTimer); setHover(code);
    if (narrow() || stillDismissed(ev)) return;
    if (ev) lastPt = { x: ev.clientX, y: ev.clientY };
    if (!tipCode) { showTip(code, cell, lastPt); return; }
    if (tipCode === code || (settled && headingIntoTip())) return;
    clearTimeout(switchTimer); switchTimer = setTimeout(() => showTip(code, cell, lastPt), 40);
  }
  function onHexMove(ev) {
    if (narrow() || ev.pointerType === 'touch') return;
    if (dismissedAt) {
      if (stillDismissed(ev)) return;
      // The pointer has moved on since Escape, so reopen for the province under it.
      const cell = !tipCode && ev.target.closest?.('.hex');
      if (cell) { lastPt = { x: ev.clientX, y: ev.clientY }; showTip(cell.dataset.code, cell, lastPt); return; }
    }
    const prev = lastPt; lastPt = { x: ev.clientX, y: ev.clientY };
    if (!tipCode) return;
    if (settled && headingIntoTip(prev)) { clearTimeout(switchTimer); return; }
    if (!followFrame) followFrame = requestAnimationFrame(() => { followFrame = 0; if (tipCode && lastPt) placeTipAt(lastPt); });
    restSoon();
  }
  // True when the pointer, having rested, is travelling towards the open tooltip.
  function headingIntoTip(prev) {
    const tip = $('provinceTip'); if (tip.hidden || !lastPt || !restPt) return false;
    const r = tip.getBoundingClientRect(), from = prev || restPt;
    const nx = Math.max(r.left, Math.min(lastPt.x, r.right)) - lastPt.x, ny = Math.max(r.top, Math.min(lastPt.y, r.bottom)) - lastPt.y;
    const dx = lastPt.x - from.x, dy = lastPt.y - from.y;
    return Math.hypot(lastPt.x - restPt.x, lastPt.y - restPt.y) < SETTLE_RADIUS && (dx * nx + dy * ny >= 0);
  }
  function onHexLeave() { clearTimeout(switchTimer); setHover(''); hidePill(); scheduleHide(); }
  function scheduleHide() { clearTimeout(hideTimer); hideTimer = setTimeout(() => hideTip(), 280); }
  function placeTipAt(pt) {
    const tip = $('provinceTip'), pad = 12, w = tip.offsetWidth, h = tip.offsetHeight;
    let left = pt.x + TIP_GAP; if (left + w > innerWidth - pad) left = pt.x - TIP_GAP - w; if (left < pad) left = pad;
    const top = Math.max(pad, Math.min(innerHeight - h - pad, pt.y - 32));
    tip.style.left = left + 'px'; tip.style.top = top + 'px';
  }
  function showTip(code, cell, pt) {
    const p = provinceOf(code), tip = $('provinceTip');
    tipCode = code; tip.innerHTML = provinceDetail(p, 'tip'); tip.hidden = false;
    tip.setAttribute('role', 'dialog'); tip.setAttribute('aria-label', ptitle(p));
    tip.style.maxHeight = Math.min(600 + 50 * typeUp(), innerHeight - 24) + 'px';
    if (pt) { placeTipAt(pt); restSoon(); return; }
    settle(true); restPt = null;
    const anchor = cell.querySelector('polygon').getBoundingClientRect();
    placeTipAt({ x: anchor.right - TIP_GAP + 6, y: anchor.top + anchor.height / 2 });
  }
  function hideTip(immediate) { clearTimeout(hideTimer); clearTimeout(switchTimer); clearTimeout(restTimer); tipCode = ''; settle(false); $('provinceTip').hidden = true; if (immediate) hidePill(); }

  function activateProvince(code, fromPointer) {
    hideTip(true);
    if (isM()) { showProvince(code); return; }
    if (state.province === code && !state.district) { setState({ province: '' }); return; }
    setState({ province: code, district: '', candidate: '' });
    if (!fromPointer) document.querySelector('#mapHeading .map-back')?.focus();
  }
  // Phones: a province opens on the map view, its constituencies on the map and its results in the panel under it.
  function showProvince(code) {
    if (!state.province || mPanelSize === 'peek') mPanelSize = 'half';
    setState({ province: code, district: '', candidate: '', mView: 'map' });
    $('context').scrollTop = 0;
  }

  function onMapKey(ev) {
    const cell = ev.target.closest('.hex'); if (!cell) return;
    const code = cell.dataset.code;
    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); activateProvince(code, false); return; }
    if (ev.key === 'Escape') { if (tipCode) { hideTip(); dismissTip(); ev.stopPropagation(); } return; }
    const dir = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }[ev.key];
    if (!dir) return;
    ev.preventDefault();
    const cur = tiles.find(x => x.code === code);
    let best = null;
    for (const o of tiles) {
      if (o === cur) continue;
      const dx = o.cx - cur.cx, dy = o.cy - cur.cy, along = dx * dir[0] + dy * dir[1], dist = Math.hypot(dx, dy);
      if (along <= 0 || along / dist < 0.45) continue;
      const score = dist / (along / dist);
      if (!best || score < best.score) best = { o, score };
    }
    if (!best) return;
    d3.select('#hexmap').selectAll('g.hex').attr('tabindex', -1);
    const next = document.querySelector('#hexmap g.hex[data-code="' + best.o.code + '"]');
    next.setAttribute('tabindex', 0); next.focus();
  }

  /* ---------- context panel ---------- */
  /* The panel moves like a hierarchy: going deeper (country → province → constituency) the new page slides in
     from the right, going back up it comes from the left, and a sideways step (another province) rises into
     place. A change that keeps the same page, such as a highlighted party, is patched in place instead, so the
     rows fade to their new highlight and the scroll position stays put. */
  let ctxView = '';
  function renderContext() {
    const box = $('context'); box.setAttribute('tabindex', '-1');
    const r = state.district && D.byId.get(state.district), p = !r && state.province && provinceOf(state.province);
    const view = r ? 'd:' + r.id : p ? 'p:' + p.code : 'n:' + state.region;
    const html = r ? crumbs(r.provinceCode, r) + districtDetail(r, 'panel') : p ? crumbs(state.province) + provinceDetail(p, 'panel') : nationalContext();
    const was = ctxView; ctxView = view;
    if (view === was) { morph(box, html); return; }
    box.innerHTML = html; box.scrollTop = 0;
    if (!was) return;
    const depth = v => ({ d: 2, p: 1, n: 0 })[v[0]];
    box.classList.remove('ctx-fwd', 'ctx-back', 'ctx-swap');
    replay(box, depth(view) > depth(was) ? 'ctx-fwd' : depth(view) < depth(was) ? 'ctx-back' : 'ctx-swap', 450);
  }
  function crumbs(code, r) {
    // Phones: the bar is also the panel's handle (drag it up or down) and has a button that expands or shrinks the panel.
    const m = isM(), big = mPanelSize === 'full';
    return '<nav class="crumbs" aria-label="' + t('ตำแหน่ง', 'Breadcrumb') + '">' + (m ? '<span class="m-grab" aria-hidden="true"></span>' : '') + '<button type="button" data-act="unset" data-v="province">' + t('ทั่วประเทศ', 'Nationwide') + '</button><span aria-hidden="true">›</span>' +
      (r ? '<button type="button" data-act="province" data-v="' + code + '">' + esc(pname(code)) + '</button><span aria-hidden="true">›</span><b>' + t('เขต ', 'Constituency ') + r.number + '</b>' : '<b>' + esc(pname(code)) + '</b>') +
      (m ? '<button type="button" class="icon-btn m-size" data-act="m-panel" aria-label="' + (big ? t('ย่อรายละเอียดเพื่อดูแผนที่', 'Shrink the details to see the map') : t('ขยายรายละเอียดเต็มจอ', 'Expand the details')) + '">' + (big ? ICON.collapse : ICON.expand) + '</button>' : '') +
      '<button type="button" class="icon-btn crumb-close" data-act="unset" data-v="' + (r ? 'district' : 'province') + '" aria-label="' + t('ปิดรายละเอียด', 'Close details') + '">' + ICON.x + '</button></nav>';
  }
  function parliamentBar() {
    const top = D.seatParties.slice(0, 8), rest = D.seatParties.slice(8), restSeats = rest.reduce((s, p) => s + p.totalSeats, 0);
    const segs = [...top.map(p => ({ name: p.name, seats: p.totalSeats, color: p.color })), { name: t('อื่น ๆ ', 'Others ') + rest.length + t(' พรรค', ''), seats: restSeats, color: '#94a3b8', other: true }];
    return '<div class="parl"><div class="parl-bar" role="img" aria-label="' + esc(segs.map(s => s.name + ' ' + s.seats).join(', ')) + '">' + segs.map(s => '<span style="flex:' + s.seats + ';--c:' + s.color + '" title="' + esc(s.name + ' ' + s.seats) + '"' + (state.party && state.party !== s.name ? ' class="dim"' : '') + '>' + (s.seats >= 40 ? s.seats : '') + '</span>').join('') + '</div><span class="parl-mark" style="left:' + (CFG().majority / CFG().totalSeats * 100) + '%"><i></i>' + t('เสียงข้างมาก ', 'Majority ') + CFG().majority + '</span>' +
      '<ul class="parl-legend">' + segs.map(s => '<li>' + (s.other ? '<i class="dot" style="--c:#94a3b8"></i>' : dot(s.name)) + (s.other ? esc(s.name) : '<button type="button" data-act="party" data-v="' + esc(s.name) + '">' + esc(s.name) + '</button>') + ' <b>' + s.seats + '</b></li>').join('') + '</ul></div>';
  }
  // The panel beside the national map: the House and the closest races. (The list of every province, coloured by its
  // leading party, was removed on 7 Nov 2026: the map shows the same thing, and the map itself, search and the
  // province filter still reach every province by keyboard.)
  function nationalContext() {
    const rows = scopeRows(), close = rows.filter(r => Number.isFinite(r.marginPct)).sort((a, b) => a.marginPct - b.marginPct).slice(0, 6);
    return '<div class="ctx"><header class="ctx-head"><h2>' + t('สภาผู้แทนราษฎร ' + CFG().totalSeats + ' ที่นั่ง', 'The ' + CFG().totalSeats + '-seat House') + '</h2></header>' + parliamentBar() +
      '<section class="ctx-sec"><h3>' + t('เขตที่ชนะกันสูสีที่สุด', 'Closest races') + (state.region ? ' · ' + esc(rname(state.region)) : '') + '</h3><ol class="close-list">' + close.map(r => '<li><button type="button" data-act="district" data-v="' + r.id + '"><span class="who"><b>' + esc(dname(r)) + '</b><small>' + dot(r.winnerParty) + esc(r.winnerParty) + t(' ชนะ ', ' beat ') + esc(r.runner.party) + '</small></span><span class="num">' + fmtP(r.marginPct) + '<small>' + fmt(r.marginVotes) + t(' คะแนน', ' votes') + '</small></span></button></li>').join('') + '</ol><p class="caveat">' + t('ส่วนต่างน้อยหมายถึงการแข่งขันสูสี ไม่ได้บ่งชี้ความผิดปกติ', 'A small margin means a competitive race; it is not evidence of irregularity.') + '</p></section></div>';
  }

  /* ---------- sheet (mobile province / constituency details; analysis details on small screens) ---------- */
  let sheetStack = [], sheetReturn = null;
  function openSheet(item, push) {
    if (!push) sheetStack = [];
    if (!$('sheet').hidden && push) sheetStack.push(state.detail || null);
    else if ($('sheet').hidden) sheetReturn = document.activeElement;
    state.detail = item; renderSheet();
    $('sheet').hidden = false; document.body.classList.add('sheet-open');
    $('sheetClose').focus();
    if (isM()) { hideChartTip(); armBack(); }
  }
  function renderSheet() {
    const item = state.detail; if (!item) return;
    let title = '', body = '';
    if (item.kind === 'mapmode') { title = t('สีบนแผนที่แสดงอะไร', 'What the map colours show'); body = mapModeSheet(); }
    else if (item.kind === 'province') { const p = provinceOf(item.id); title = ptitle(p); body = provinceDetail(p, 'sheet'); }
    else if (item.kind === 'district') { const r = D.byId.get(item.id); title = dname(r); body = districtDetail(r, 'sheet'); }
    else if (item.kind === 'custom' && E69.analysis?.sheetContent) { const c = E69.analysis.sheetContent(item); title = c.title; body = c.html; }
    $('sheetTitle').textContent = title; $('sheetBody').innerHTML = body; $('sheetBody').scrollTop = 0;
    const back = $('sheetBack'); back.hidden = !sheetStack.length; back.innerHTML = ICON.back + t('ย้อนกลับ', 'Back');
    $('sheet').classList.toggle('as-drawer', !narrow() && state.page === 'analysis');
  }
  function closeSheet() {
    if ($('sheet').hidden) return;
    $('sheet').hidden = true; document.body.classList.remove('sheet-open'); sheetStack = []; state.detail = null;
    if (sheetReturn && document.contains(sheetReturn)) sheetReturn.focus(); sheetReturn = null;
  }
  $('sheetBack').addEventListener('click', () => { const prev = sheetStack.pop(); if (prev) { state.detail = prev; renderSheet(); } });

  /* ---------- search ---------- */
  let searchItems = [], results = [], active = -1;
  // ECT area text, e.g. "อำเภอเมืองนครราชสีมา (เฉพาะหนองจะบก หมื่นไวย)": base name, short name, and the sub-areas
  // listed after "เฉพาะ" (only). Places after "ยกเว้น" (except) lie outside the constituency and are not indexed.
  function zoneParts(z) {
    const m = /^(.*?)\s*\((.*)\)\s*$/.exec(z), base = (m ? m[1] : z).trim(), paren = m ? m[2].trim() : '';
    return { base, short: base.replace(/^(กิ่งอำเภอ|อำเภอ|เขต)/, ''), partial: !!paren, paren,
      only: /^เฉพาะ/.test(paren) ? paren.replace(/^เฉพาะ/, '').split(/\s+/).filter(Boolean) : [] };
  }
  const norm = s => String(s || '').toLocaleLowerCase('th').normalize('NFC').replace(/[\s.\-–·,]/g, '').replace(/^จังหวัด/, '').replace(/^พรรค/, '');
  const stripTitle = s => String(s).replace(/^(นางสาว|นาง|นาย|ว่าที่ร้อยตรีหญิง|ว่าที่ร้อยตรี|ว่าที่ ร\.ต\.|ดร\.|พันตำรวจโท|พลตำรวจตรี)\s*/, '');
  function buildSearch() {
    const aliases = { '10': ['กทม', 'กรุงเทพ', 'bkk'], '30': ['โคราช', 'korat'], '14': ['อยุธยา', 'ayutthaya'], '50': ['chiangmai'], '80': ['นครศรี', 'เมืองคอน'], '77': ['ประจวบ'], '11': ['ปากน้ำ'], '34': ['อุบล'], '41': ['อุดร'], '84': ['สุราษฎร์', 'surat'] };
    const areas = [], seen = new Set();
    for (const r of D.rows) for (const z of r.zone || []) {
      const p = zoneParts(z), key = r.id + '|' + p.base;
      if (seen.has(key)) continue; seen.add(key);
      areas.push({ type: 'area', id: r.id, area: p.base, partial: p.partial, subs: p.only, terms: [p.base, p.short, ...p.only].map(norm) });
    }
    searchItems = [
      ...D.provinces.map(p => ({ type: 'province', id: p.code, terms: [p.name, p.nameEn, p.abbr, ...(aliases[p.code] || [])].map(norm) })),
      ...D.parties.map(p => ({ type: 'party', id: p.name, terms: [p.name, 'พรรค' + p.name, p.leader].map(norm) })),
      ...D.rows.map(r => ({ type: 'district', id: r.id, terms: [r.province + 'เขต' + r.number, r.province + r.number, (r.provinceEn || '') + r.number, (r.provinceEn || '') + 'constituency' + r.number, (r.provinceAbbr || '') + r.number, r.id].map(norm) })),
      ...areas,
      ...D.rows.flatMap(r => r.candidates.map(c => ({ type: 'candidate', id: r.id, cid: c.officialCandidateId, name: c.name, party: c.party, terms: [c.name, stripTitle(c.name)].map(norm) }))),
    ];
  }
  function itemLabel(it) {
    if (it.type === 'province') { const p = provinceOf(it.id); return ['<b>' + esc(pname(p)) + '</b><small>' + esc(lang === 'en' ? p.name : p.nameEn) + ' · ' + p.count + t(' เขต', ' constituencies') + '</small>', t('จังหวัด', 'Province')]; }
    if (it.type === 'party') { const p = D.partyIndex.get(it.id); return [dot(p.name) + '<b>' + esc(p.name) + '</b><small>' + p.totalSeats + t(' ที่นั่ง', ' seats') + '</small>', t('พรรค', 'Party')]; }
    if (it.type === 'district') { const r = D.byId.get(it.id); return ['<b>' + esc(dname(r)) + '</b><small>' + dot(r.winnerParty) + esc(r.winnerName || '') + '</small>', t('เขต', 'Constituency')]; }
    if (it.type === 'area') {
      const r = D.byId.get(it.id), sub = it.matched >= 2 ? it.subs[it.matched - 2] : '';
      return ['<b>' + (sub ? esc(sub) + ' <span class="sr-in">' + t('ใน', 'in') + '</span> ' : '') + esc(it.area) + (it.partial && !sub ? ' <span class="sr-in">' + t('(บางส่วน)', '(part)') + '</span>' : '') + '</b><small>' + esc(dname(r)) + ' ' + dot(r.winnerParty) + esc(r.winnerParty || '') + '</small>', t('พื้นที่', 'Area')];
    }
    const r = D.byId.get(it.id); return [face({ officialCandidateId: it.cid }, it.party, 'xs') + '<span class="sr-text"><b>' + nm(it.name) + '</b><small>' + dot(it.party) + esc(it.party) + ' · ' + esc(dname(r)).replace(/ (\S+)$/, '&nbsp;$1') + '</small></span>', t('ผู้สมัคร', 'Candidate')];
  }
  function suggest() {
    const q = norm($('search').value), box = $('searchResults');
    if (!q) { closeSearch(); return; }
    const scored = [];
    for (const it of searchItems) {
      let s = Infinity, m = -1;
      it.terms.forEach((term, i) => { if (!term) return; const v = term === q ? 0 : term.startsWith(q) ? 1 : term.includes(q) ? 2 : Infinity; if (v < s) { s = v; m = i; } });
      if (s < Infinity) scored.push({ it, s, m });
    }
    const order = { province: 0, district: 1, area: 2, party: 3, candidate: 4 }, quota = { province: 4, district: 5, area: 8, party: 3, candidate: 6 };
    scored.sort((a, b) => a.s - b.s || order[a.it.type] - order[b.it.type]);
    results = scored.filter(x => quota[x.it.type]-- > 0).slice(0, 18).map(x => ({ ...x.it, matched: x.m })); active = -1;
    box.innerHTML = results.length ? results.map((it, i) => { const [label, kind] = itemLabel(it); return '<div role="option" id="sr' + i + '" class="sr" data-i="' + i + '" aria-selected="false"><span class="sr-main">' + label + '</span><span class="sr-kind' + (it.type === 'candidate' ? ' sr-only' : '') + '">' + kind + '</span></div>'; }).join('') : '<p class="sr-empty">' + t('ไม่พบผล ลองพิมพ์ชื่อจังหวัด ชื่อเขตหรืออำเภอ เลขเขต ชื่อผู้สมัคร หรือพรรค', 'No match. Try a province, district or amphoe name, constituency number, candidate or party.') + '</p>';
    if (box.hidden) replay(box, 'sr-open', 300);   // the list drops open once, not on every keystroke
    box.hidden = false; $('search').setAttribute('aria-expanded', 'true');
  }
  function closeSearch() { $('searchResults').hidden = true; $('search').setAttribute('aria-expanded', 'false'); $('search').removeAttribute('aria-activedescendant'); active = -1; }
  // Constituencies that match a query, best first: by province and number, by a place inside them, or by a candidate.
  // Used by the comparison's own search box (e69-analysis.js). Each constituency appears once, with what matched.
  function findDistricts(query, limit = 8) {
    const q = norm(query); if (!q) return [];
    const order = { district: 0, area: 1, candidate: 2 }, best = new Map();
    for (const it of searchItems) {
      if (!(it.type in order)) continue;
      let s = Infinity, m = -1;
      it.terms.forEach((term, i) => { if (!term) return; const v = term === q ? 0 : term.startsWith(q) ? 1 : term.includes(q) ? 2 : Infinity; if (v < s) { s = v; m = i; } });
      if (s === Infinity) continue;
      const rank = s * 3 + order[it.type], had = best.get(it.id);
      if (had && had.rank <= rank) continue;
      const sub = it.type === 'area' && m >= 2 ? it.subs[m - 2] : '';
      best.set(it.id, { id: it.id, rank, type: it.type, why: it.type === 'area' ? (sub ? sub + t(' ใน', ' in ') : '') + it.area + (it.partial && !sub ? t(' (บางส่วน)', ' (part)') : '') : it.type === 'candidate' ? it.name + ' (' + it.party + ')' : '' });
    }
    return [...best.values()].sort((a, b) => a.rank - b.rank || Number(D.byId.get(a.id).provinceCode) - Number(D.byId.get(b.id).provinceCode) || D.byId.get(a.id).number - D.byId.get(b.id).number).slice(0, limit);
  }
  function choose(i) {
    const it = results[i]; if (!it) return;
    closeSearch(); $('search').value = '';
    if (it.type === 'province') { if (isM() && state.page === 'overview') showProvince(it.id); else setState({ province: it.id, district: '', candidate: '' }); }
    else if (it.type === 'party') { setState({ party: it.id }); revealPartyCard(it.id); }
    else openDistrict(it.id, it.cid || '');
    closeNav();
  }
  // From search or a list (not a click on the map itself): the map flies to the province if needed, then the
  // constituency pulses; a chosen candidate's row glides into view in the detail panel and flashes.
  function openDistrict(id, cid) {
    const r = D.byId.get(id); if (!r) return;
    if (state.page === 'analysis') { setState({ district: id, candidate: cid || '' }); E69.analysis?.showDetail?.(id); return; }
    pulseId = id;
    // Phones: the map view with the constituency in the panel under it.
    if (isM()) { if (!state.province || mPanelSize === 'peek') mPanelSize = 'half'; setState({ province: r.provinceCode, district: id, candidate: cid || '', mView: 'map' }); }
    else setState({ province: r.provinceCode, district: id, candidate: cid || '' });
    if (cid) requestAnimationFrame(() => {
      const row = $('context').querySelector('.cand-list .is-cur'); if (!row) return;
      row.scrollIntoView({ block: 'center', behavior: calmMotion() ? 'auto' : 'smooth' });
      replay(row, 'flash', 1400);
    });
  }
  // Bring a party's card into view when the cards sit in a sideways-scrolling strip.
  function revealPartyCard(name) {
    const strip = $('partyCards'), card = strip && [...strip.children].find(c => c.dataset.v === name);
    if (!card || strip.scrollWidth <= strip.clientWidth + 1) return;
    const shift = card.getBoundingClientRect().left - strip.getBoundingClientRect().left - (strip.clientWidth - card.offsetWidth) / 2;
    strip.scrollTo({ left: Math.max(0, strip.scrollLeft + shift), behavior: calmMotion() ? 'auto' : 'smooth' });
  }
  $('search').addEventListener('input', suggest);
  $('search').addEventListener('focus', () => { if ($('search').value) suggest(); });
  $('search').addEventListener('keydown', ev => {
    if (ev.key === 'Escape') { closeSearch(); return; }
    if (ev.key === 'Enter') { ev.preventDefault(); if ($('searchResults').hidden) suggest(); choose(Math.max(0, active)); return; }
    if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
    ev.preventDefault(); if ($('searchResults').hidden) suggest(); if (!results.length) return;
    active = (active + (ev.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
    $('searchResults').querySelectorAll('[role=option]').forEach((o, i) => o.setAttribute('aria-selected', String(i === active)));
    $('search').setAttribute('aria-activedescendant', 'sr' + active); $('sr' + active)?.scrollIntoView({ block: 'nearest' });
  });
  // A result is chosen by a click (on a phone, a tap): a finger can then scroll the list without choosing the result
  // it landed on, and no second click falls through to whatever lies under the closed panel. Pressing the mouse button
  // on a result must not take the keyboard focus out of the search box.
  $('searchResults').addEventListener('pointerdown', ev => { if (ev.pointerType === 'mouse' && ev.target.closest('[data-i]')) ev.preventDefault(); });
  $('searchResults').addEventListener('click', ev => { const o = ev.target.closest('[data-i]'); if (o) choose(Number(o.dataset.i)); });
  document.addEventListener('pointerdown', ev => { if (!ev.target.closest('.search-wrap')) closeSearch(); });

  /* ---------- state, events, navigation ---------- */
  function setState(patch, opts) {
    Object.assign(state, patch);
    if (Object.hasOwn(patch, 'region') && state.province && provinceOf(state.province).region !== state.region && state.region) { state.province = ''; state.district = ''; }
    if (Object.hasOwn(patch, 'province') && !patch.province) { state.district = ''; state.candidate = ''; }
    render(opts);
  }
  E69.setState = setState;
  function setPage(page, chart) {
    if (page !== 'overview' && page !== 'analysis') page = 'overview';
    hideTip(true); hideChartTip();
    // A link to one chart opens it: large in the four-chart overview on the desktop, as the chart on screen on a phone.
    if (state.page !== page) { closeSheet(); state.page = page; if (chart) { state.analysisTab = 'core'; state.mobileChart = chart; state.coreFocus = chart; } render(); $('main').scrollTop = 0; }
    else if (chart) setState({ analysisTab: 'core', mobileChart: chart, coreFocus: chart });
    if (location.hash !== '#' + page) history.replaceState(null, '', '#' + page);
    closeNav();
  }
  function render() {
    if (lens && !lens.closing) lensCancel();   // the map is about to change under the finger
    document.documentElement.lang = lang;
    document.title = (state.page === 'overview' ? t('ภาพรวม', 'Overview') : t('วิเคราะห์ข้อมูล', 'Data Analysis')) + ' · Election ' + CFG().brandNumber;
    // Phones: which view is on screen (summary, map or analysis); set first, so the map is measured at its real size.
    if (isM()) document.body.dataset.mview = state.page === 'analysis' ? 'analysis' : state.mView; else delete document.body.dataset.mview;
    renderSidebar(); renderTopbar();
    $('pageOverview').hidden = state.page !== 'overview'; $('pageAnalysis').hidden = state.page !== 'analysis';
    const was = document.body.dataset.page; document.body.dataset.page = state.page;
    if (state.page === 'overview') renderOverview(); else E69.analysis?.render(was === 'analysis');
    if (!$('sheet').hidden) renderSheet();
    if (isM()) { renderTabbar(); armBack(); }
  }
  function clearAll() {
    hideTip(true); hideChartTip(); closeSheet(); closeSearch(); closeDrawer(); lensDone(); $('search').value = '';
    state = defaults(); instantMap = true; legendOpen = false; mPanelSize = 'half';
    if ($('hexmap')) { stopMapAnimations(); camera = d3.zoomIdentity; d3.select('#hexmap').call(zoomBehavior.transform, d3.zoomIdentity); }
    E69.analysis?.reset?.();
    history.replaceState(null, '', '#overview');
    render(); closeNav();
  }
  function openNav() { document.body.classList.add('nav-open'); $('scrim').hidden = false; $('menuBtn').setAttribute('aria-expanded', 'true'); $('main').inert = true; $('closeNav').focus(); }
  function closeNav() { closePanel(); if (!document.body.classList.contains('nav-open')) return; document.body.classList.remove('nav-open'); $('scrim').hidden = true; $('menuBtn').setAttribute('aria-expanded', 'false'); $('main').inert = false; $('menuBtn').focus(); }

  /* ---------- phones: tab bar, search-and-filters panel, menu drawer, back button, tapping charts ---------- */
  // Five tabs within reach of the thumb: the summary and the map (the two halves of the overview page), the analysis
  // page, the House (the majority builder with who governs now, which is one of the analysis charts) and one panel
  // that opens above the tab bar: search, with the shared filters under it. The colour theme, the data status and the
  // sources are in a drawer that slides in from the left edge (the menu button at the top left of the screen).
  // (Until 13 Nov 2026 search and filters were two tabs, and the settings sat under the filters.)
  let mPanel = '', mPanelSize = 'half', mDrawer = false, mLastChart = 'seats';
  const onHouse = () => state.page === 'analysis' && state.mobileChart === 'coalition';
  function renderTabbar() {
    const bar = $('mTabbar'); if (!isM()) return;
    if (state.mobileChart !== 'coalition') mLastChart = state.mobileChart;
    const cur = mPanel || (onHouse() ? 'house' : state.page === 'analysis' ? 'analysis' : state.mView === 'map' ? 'map' : 'summary');
    const n = [state.region, state.party, state.province].filter(Boolean).length;
    const items = [['summary', t('สรุปผล', 'Summary'), ICON.overview], ['map', t('แผนที่', 'Map'), ICON.map], ['analysis', t('วิเคราะห์', 'Analysis'), ICON.analysis], ['house', t('สภา', 'House'), ICON.house], ['search', t('ค้นหา/กรอง', 'Find/filter'), ICON.find]];
    morph(bar, items.map(([k, label, icon]) => {
      const panel = k === 'search', on = k === cur;
      const full = k === 'house' ? t('สภา: ฝ่ายรัฐบาล ฝ่ายค้าน และการรวมเสียง', 'The House: government, opposition and majorities')
        : panel ? t('ค้นหาและตัวกรอง', 'Search and filters') + (n ? ' · ' + t('ตัวกรองที่ใช้อยู่ ', 'filters in use: ') + n : '') : '';
      return '<button type="button" class="m-tab" data-act="m-tab" data-v="' + k + '"' + (panel ? ' aria-expanded="' + on + '" aria-controls="sidebar"' : on ? ' aria-current="page"' : '') + (full ? ' aria-label="' + esc(full) + '"' : '') +
        '><span class="ic">' + icon + '</span><span class="lb">' + label + '</span>' + (panel && n ? '<span class="m-badge" aria-hidden="true">' + n + '</span>' : '') + '</button>';
    }).join(''));
  }
  function mTab(v) {
    if (v === 'search') { if (mPanel) closePanel(true); else openPanel(); return; }
    closePanel(); hideChartTip();
    const toTop = el => el.scrollTo({ top: 0, behavior: calmMotion() ? 'auto' : 'smooth' });   // tapping the current tab goes back to the top
    if (v === 'house' || v === 'analysis') {
      // The House tab opens the majority builder; the analysis tab goes back to the chart that was on screen before it.
      const chart = v === 'house' ? 'coalition' : state.mobileChart === 'coalition' ? mLastChart : state.mobileChart;
      if (state.page === 'analysis' && state.mobileChart === chart) { toTop($('pageAnalysis')); return; }
      state.mobileChart = chart;
      if (v === 'house') { state.analysisTab = 'coalition'; state.coreFocus = ''; }   // the same chart if the screen later turns into the desktop layout
      if (state.page !== 'analysis') setPage('analysis'); else { closeSheet(); render(); $('pageAnalysis').scrollTop = 0; }
      return;
    }
    if (state.page !== 'overview') { state.mView = v; setPage('overview'); return; }
    if (state.mView !== v) setState({ mView: v });
    else if (v === 'summary') toTop($('pageOverview'));
  }
  // Search and filters: one panel between the top of the screen and the tab bar. The search box is not focused on
  // opening, because the keyboard would cover the filters under it; while results are listed they take the whole panel.
  function openPanel() {
    if (!isM()) return;
    hideChartTip(); closeDrawer(); if (!$('sheet').hidden) closeSheet();
    mPanel = 'search';
    document.body.classList.add('m-panel-search');
    $('mPanelTitle').textContent = t('ค้นหาและตัวกรอง', 'Search and filters');
    $('sidebar').setAttribute('aria-label', $('mPanelTitle').textContent);
    $('main').inert = true; $('sidebar').scrollTop = 0;
    renderTabbar();
    if ($('search').value) suggest();
    $('mPanelClose').focus({ preventScroll: true });
    armBack();
  }
  function closePanel(refocus) {
    if (!mPanel) return;
    mPanel = '';
    document.body.classList.remove('m-panel-search');
    $('main').inert = false; closeSearch();
    $('sidebar').setAttribute('aria-label', t('เมนูหลัก', 'Main menu'));
    renderTabbar();
    if (refocus) document.querySelector('#mTabbar [data-v="search"]')?.focus();
  }
  // The menu drawer: colour theme (same as device, light, dark), when the data was loaded with a refresh button, and
  // the sources. It opens from the button at the top left and closes with its own button, a tap beside it, a swipe to
  // the left, Escape or the phone's back button.
  let drawerTimer = 0, drawerDrag = null;
  function openDrawer() {
    if (!isM() || mDrawer) return;
    hideChartTip(); closePanel(); lensCancel(); if (!$('sheet').hidden) closeSheet();
    mDrawer = true; clearTimeout(drawerTimer);
    const box = $('mDrawer'); box.classList.remove('is-closing'); box.querySelector('.m-drawer-panel').style.transform = ''; box.hidden = false;
    $('mMenuBtn').setAttribute('aria-expanded', 'true');
    $('main').inert = true; $('mTabbar').inert = true;
    renderPhoneSettings();
    $('mDrawerClose').focus({ preventScroll: true });
    armBack();
  }
  function closeDrawer(refocus) {
    if (!mDrawer) return;
    mDrawer = false;
    const box = $('mDrawer'), panel = box.querySelector('.m-drawer-panel'), done = () => { box.hidden = true; box.classList.remove('is-closing'); };
    $('mMenuBtn').setAttribute('aria-expanded', 'false');
    $('main').inert = !!mPanel; $('mTabbar').inert = false;
    clearTimeout(drawerTimer); panel.style.transform = '';
    if (calmMotion() || !isM()) done(); else { box.classList.add('is-closing'); drawerTimer = setTimeout(done, 220); }
    if (refocus) $('mMenuBtn').focus({ preventScroll: true });
  }
  function renderPhoneSettings() {
    const box = $('mSettings'); if (!box || !DS || !isM()) return;
    morph(box, '<div class="m-set"><span class="side-label">' + t('ธีมสี', 'Colour theme') + '</span><div class="m-theme" role="radiogroup" aria-label="' + t('ธีมสี', 'Colour theme') + '">' +
      ['system', 'light', 'dark'].map(v => '<button type="button" role="radio" aria-checked="' + (themeChoice === v) + '" data-act="theme" data-v="' + v + '">' + THEME_ICON[v] + '<span>' + themeName(v) + '</span></button>').join('') + '</div></div>' +
      '<div class="m-set"><span class="side-label">' + t('ข้อมูล', 'Data') + '</span><div class="m-data"><span>' + (refreshing ? t('กำลังอัปเดต…', 'Updating…') : t('อัปเดตล่าสุด ', 'Last updated ') + '<b>' + esc(clockText(DS.loadedAt)) + '</b>') + '</span>' +
      '<button type="button" class="ghost-btn' + (refreshing ? ' is-loading' : '') + '" data-act="refresh-data"' + (refreshing ? ' disabled' : '') + '>' + ICON.refresh + t('อัปเดตข้อมูล', 'Refresh') + '</button></div>' +
      '<p class="m-about">' + t('ผลอย่างเป็นทางการจาก ' + CFG().sourceTh + ' ณ ', 'Official results from the ' + CFG().sourceEn + ' as of ') + esc(thaiDate(D.updatedAt)) + '</p></div>' +
      '<div class="m-set"><span class="side-label">' + t('เกี่ยวกับข้อมูล', 'About the data') + '</span><button type="button" class="m-row" data-act="sources"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/></svg><span><b>' + t('ที่มาข้อมูลและวิธีอ่าน', 'Sources & how to read') + '</b><small>' + t('แหล่งข้อมูล นิยามตัวเลข และผลการตรวจสอบ', 'Data sources, definitions and checks') + '</small></span>' + ICON.next + '</button></div>');
  }
  $('mDrawer').addEventListener('pointerdown', ev => { if (mDrawer && ev.isPrimary) drawerDrag = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, on: false }; });
  addEventListener('pointermove', ev => {
    const g = drawerDrag; if (!g || ev.pointerId !== g.id) return;
    const dx = ev.clientX - g.x, dy = ev.clientY - g.y;
    if (!g.on && dx < -12 && Math.abs(dx) > Math.abs(dy) * 1.2) g.on = true;
    if (g.on) $('mDrawer').querySelector('.m-drawer-panel').style.transform = 'translateX(' + Math.min(0, dx) + 'px)';
  }, { passive: true });
  const endDrawerDrag = ev => {
    const g = drawerDrag; if (!g || ev.pointerId !== g.id) return;
    drawerDrag = null; if (!g.on) return;
    dropClick = performance.now() + 400;   // the swipe must not also press the button it started on
    if (ev.type === 'pointerup' && ev.clientX - g.x < -70) closeDrawer(true); else $('mDrawer').querySelector('.m-drawer-panel').style.transform = '';
  };
  addEventListener('pointerup', endDrawerDrag); addEventListener('pointercancel', endDrawerDrag);
  // The panel under the map: a peek (the header only), half the screen, or the full screen (the map stays sized as
  // for half, so it does not have to be redrawn on the way back).
  function setPanel(size) { if (mPanelSize === size) return; mPanelSize = size; render(); if (size === 'peek') $('context').scrollTop = 0; }
  let drag = null, dropClick = 0;
  $('pageOverview').addEventListener('pointerdown', ev => {
    if (!isM() || state.mView !== 'map' || matchMedia('(orientation: landscape)').matches) return;
    const bar = ev.target.closest('#context .crumbs'); if (!bar || ev.target.closest('.icon-btn')) return;
    drag = { y: ev.clientY, id: ev.pointerId, moved: false, onButton: !!ev.target.closest('button') };
  });
  addEventListener('pointermove', ev => { if (drag && ev.pointerId === drag.id && Math.abs(ev.clientY - drag.y) > 8) drag.moved = true; }, { passive: true });
  addEventListener('pointerup', ev => {
    if (!drag || ev.pointerId !== drag.id) return;
    const dy = ev.clientY - drag.y, d = drag; drag = null;
    const order = ['peek', 'half', 'full'], i = order.indexOf(mPanelSize);
    // A drag that started on a crumb must not also follow it: drop a click that arrives right after the release.
    if (d.moved && Math.abs(dy) > 30) { if (d.onButton) dropClick = performance.now() + 400; setPanel(order[Math.max(0, Math.min(2, i + (dy < 0 ? 1 : -1)))]); }
    else if (!d.moved && !d.onButton && mPanelSize === 'peek') setPanel('half');
  });
  addEventListener('pointercancel', () => { drag = null; });
  document.addEventListener('click', ev => { if (dropClick && performance.now() < dropClick) { dropClick = 0; ev.stopPropagation(); ev.preventDefault(); } }, true);
  // Drag a sheet down by its header to close it.
  let sheetDrag = null;
  $('sheet').addEventListener('pointerdown', ev => { if (!isM() || !ev.target.closest('.sheet-head') || ev.target.closest('button')) return; sheetDrag = { y: ev.clientY, id: ev.pointerId }; });
  $('sheet').addEventListener('pointermove', ev => { if (!sheetDrag || ev.pointerId !== sheetDrag.id) return; const dy = Math.max(0, ev.clientY - sheetDrag.y); $('sheet').querySelector('.sheet-panel').style.transform = dy ? 'translateY(' + dy + 'px)' : ''; });
  const endSheetDrag = ev => { if (!sheetDrag || ev.pointerId !== sheetDrag.id) return; const dy = ev.clientY - sheetDrag.y; sheetDrag = null; $('sheet').querySelector('.sheet-panel').style.transform = ''; if (ev.type === 'pointerup' && dy > 80) closeSheet(); };
  $('sheet').addEventListener('pointerup', endSheetDrag); $('sheet').addEventListener('pointercancel', endSheetDrag);

  // Back button. The site keeps one history entry while a phone is "inside" it (a panel, a sheet, a province, the map
  // or the analysis); back closes the topmost layer or steps up one level, and the entry comes back while there is
  // still somewhere to go back to. Without it the phone's back button (or the iPhone's edge swipe) left the site.
  let backArmed = false;
  const deep = () => isM() && !!(mPanel || mDrawer || !$('sheet').hidden || $('sourcesDialog').open || !$('chartTip').hidden || state.district || state.province || state.page === 'analysis' || state.mView === 'map');
  function armBack() { if (!backArmed && deep()) { try { history.pushState({ e69: 'inside' }, ''); backArmed = true; } catch (e) { /* history unavailable */ } } }
  addEventListener('popstate', () => {
    if (!backArmed) return;
    backArmed = false;
    if (!isM()) return;
    if ($('sourcesDialog').open) $('sourcesDialog').close();
    else if (mDrawer) closeDrawer(true);
    else if (!$('chartTip').hidden) hideChartTip();
    else if (!$('sheet').hidden) { if (sheetStack.length) $('sheetBack').click(); else closeSheet(); }
    else if (mPanel) closePanel(true);
    else if (state.page === 'analysis') { state.mView = 'summary'; setPage('overview'); }
    else if (state.district) setState({ district: '', candidate: '' });
    else if (state.province) setState({ province: '' });
    else if (state.mView === 'map') setState({ mView: 'summary' });
    armBack();
  });

  // Tap to inspect. A chart shows a mark's tooltip on hover and acts on click. On a phone the first tap on a mark opens
  // its tooltip (the chart's own hover code runs, as if pointed at) and the tooltip's button, or a second tap on the
  // same mark, does what a click does. Taps on buttons inside a chart, and on places without a tooltip, act at once.
  let inspectKey = '', inspectAt = null;
  document.addEventListener('click', ev => {
    if (!isM() || !ev.isTrusted) return;
    const target = ev.target instanceof Element ? ev.target : null, box = target && target.closest('#pageAnalysis .chart-box');
    if (!box || target.closest('button, a, select, input, label')) return;
    inspecting = true; tipSource = '';
    try { target.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true, clientX: ev.clientX, clientY: ev.clientY, pointerType: 'mouse', isPrimary: true })); } finally { inspecting = false; }
    const now = $('chartTip').hidden ? '' : tipSource;
    if (!now) { hideChartTip(); inspectKey = ''; return; }
    if (now !== inspectKey) {
      inspectKey = now; inspectAt = { target, x: ev.clientX, y: ev.clientY }; ev.stopPropagation(); ev.preventDefault();
      if (box.contains(document.activeElement) && document.activeElement !== box) document.activeElement.blur();   // a tap focuses the mark; no focus ring for a finger
      armBack(); return;
    }
    inspectKey = ''; hideChartTip();   // the same mark again: let the click through
  }, true);
  function inspectAct() {
    const at = inspectAt; inspectKey = ''; inspectAt = null; hideChartTip();
    if (at && document.contains(at.target)) at.target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: at.x, clientY: at.y }));
  }

  // The layout follows the screen: turning a phone or resizing a window across the line switches it.
  phoneQuery.addEventListener('change', () => {
    document.documentElement.classList.toggle('m', isM());
    closePanel(); closeDrawer(); lensDone(); hideChartTip(); hideTip(true);
    if (!$('sheet').hidden) closeSheet();
    if (!isM()) { const ov = document.querySelector('#pageOverview .ov'); if (ov) delete ov.dataset.panel; }
    if (D) { renderMapCredit(state.province && provinceOf(state.province)); legendHtml = ''; render(); }
  });

  // Result of scripts/recheck_ect.py, which compares every figure with the live ECT website (check_* in election.csv).
  function liveCheckHtml() {
    const c = DS.reference.liveCheck; if (!c) return '';
    let host = c.source; try { host = new URL(c.source).host; } catch (e) { /* keep the text as written */ }
    return '<section><h3>' + t('ตรวจเทียบกับเว็บไซต์ กกต.', 'Checked against the ECT website') + '</h3><p>' +
      t('ตรวจเมื่อ ', 'Checked on ') + esc(thaiDate(c.checkedAt)) + t(' กับ ', ' against ') + '<a href="' + esc(c.source) + '" target="_blank" rel="noopener">' + esc(host) + '</a> ' +
      t('(ข้อมูล กกต. ปรับปรุงล่าสุด ', '(ECT last update ') + esc(thaiDate(c.liveLastUpdate)) + ') ' +
      t('เทียบทุกค่าของ ', 'comparing every value for ') + fmt(c.compared.constituencies) + t(' เขต ', ' constituencies, ') + fmt(c.compared.candidates) + t(' ผู้สมัคร และ ', ' candidates and ') + fmt(c.compared.parties) + t(' พรรค พบความต่าง ', ' parties: ') + '<b>' + fmt(c.differences) + '</b>' + t(' รายการ', c.differences === 1 ? ' difference' : ' differences') + '</p><p class="caveat">' +
      t('ข้อมูลต้นทางเองมียอดบัตรดี + บัตรเสีย + ไม่เลือกผู้ใด ต่างจากผู้มาใช้สิทธิ 1–3 ใบใน ', 'In the source itself, valid + invalid + no-vote ballots differ from turnout by 1–3 ballots in ') + c.ballotGaps + t(' เขต (บัตรแบ่งเขต) และ ', ' constituencies (constituency ballot) and ') + c.listBallotGaps + t(' เขต (บัญชีรายชื่อ) ระบบแสดงตามที่ กกต. ประกาศและมีหมายเหตุในรายละเอียดเขต', ' (party-list). The dashboard shows ECT\'s published values and flags them in each constituency\'s detail.') + '</p></section>';
  }
  // Which parties govern now is not an election result: it has its own source and the date it was last checked.
  function houseSourceHtml() {
    const h = CFG().house || {}; if (!D.parties.some(p => p.side)) return '';
    const text = t(h.sourceTh, h.sourceEn || h.sourceTh) || t('ข้อมูลในไฟล์ parties.csv', 'the parties.csv file');
    return '<li>' + t('ฝ่ายรัฐบาลและฝ่ายค้านในกราฟ "รวมเสียงตั้งรัฐบาล": ', 'Government and opposition in the "Building a majority" chart: ') + (h.sourceUrl ? '<a href="' + esc(h.sourceUrl) + '" target="_blank" rel="noopener">' + esc(text) + '</a>' : esc(text)) +
      '<small>' + (h.checkedAt ? ' · ' + t('ตรวจสอบล่าสุด ', 'last checked ') + '<span class="nw">' + esc(thaiDate(h.checkedAt)) + '</span>' : '') + ' · ' + t('ไม่ใช่ข้อมูลจาก กกต. และเปลี่ยนได้หลังจากวันที่ตรวจสอบ จำนวนเสียงนับตามผลเลือกตั้ง', 'not ECT data, and it can change after that date; seats are counted as elected') + '</small></li>';
  }
  function sourcesHtml() {
    const checks = D.validate(), ok = checks.filter(c => c.ok).length;
    const src = (D.raw.sources || []).map(s => '<li><a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.name) + '</a><small>' + [esc(s.publisher || ''), t('ดึงข้อมูล ', 'retrieved ') + '<span class="nw">' + esc(String(s.retrievedAt || '').slice(0, 10)) + '</span>'].filter(Boolean).map(x => ' · ' + x).join('') + '</small></li>').join('');
    const hex = DS.reference.hexMap || window.E69_REFERENCE.hexMap;
    return '<section><h3>' + t('แหล่งข้อมูล', 'Data sources') + '</h3><ul class="src-list">' + src +
      '<li>' + hexCredit('<a href="' + esc(hex.repository) + '" target="_blank" rel="noopener">Hex Map of Thailand</a>') + '<small> · ' + t('ไฟล์ ', 'archive ') + esc(hex.archive) + ' · SHA-256 ' + esc(hex.sha256.slice(0, 16)) + '… · ' + t('ไม่พบไฟล์สัญญาอนุญาตในชุดต้นทาง ใช้ผังเพื่อการศึกษาพร้อมอ้างอิงที่มา', 'no licence file in the archive; layout used for coursework with attribution') + '</small></li>' +
      '<li>' + t('ขอบเขตเขตเลือกตั้ง (แผนที่รายเขต): ', 'Constituency boundaries (province maps): ') + '<a href="' + SHAPE_SOURCE + '" target="_blank" rel="noopener">Thai-ECT-election-map</a> ' + t('โดย Kittapat Ratanaphupha', 'by Kittapat Ratanaphupha') + '<small> · ' + t('สัญญาอนุญาต MIT · ขอบเขตโดยประมาณ ไม่ใช่แผนที่ทางการของ กกต.', 'MIT License · approximate, not an official ECT map') + '</small></li>' +
      '<li>' + t('ชื่อจังหวัดภาษาอังกฤษ: ตารางชื่อจังหวัดในชุด Thailand Hex Map (data/provinces-visited.csv)', 'English province names: the province table shipped with Thailand Hex Map (data/provinces-visited.csv)') + '</li>' +
      houseSourceHtml() +
      '<li>' + t('ภาพบุคคลพรรค: ภาพแคนดิเดตนายกรัฐมนตรีจากระบบรายงาน กกต. (ectreport69.ect.go.th)', 'Party figures: PM-candidate portraits from the ECT reporting system (ectreport69.ect.go.th)') + '</li>' +
      (CFG().candidatePhotos ? '<li>' + t('ภาพผู้สมัครแบบแบ่งเขต: ภาพทางการจากระบบรายงาน กกต. ตัดพื้นหลังและจัดขนาดใบหน้าให้เท่ากันแบบภาพหัวหน้าพรรค ปรับแสงเพียงเล็กน้อย ไม่ได้ตกแต่งใบหน้า ผู้ที่ไม่มีภาพแสดงเป็นรูปสัญลักษณ์', 'Constituency candidates: official ECT photos, background removed and faces scaled to one size as for the party figures, with only slight light adjustment and no retouching; a plain figure marks anyone without a photo') + '</li>' : '') +
      '<li>' + t('ไอคอน: ดัดแปลงจาก Lucide (ISC License)', 'Icons adapted from Lucide (ISC License)') + '</li></ul></section>' +
      '<section><h3>' + t('นิยามที่ใช้', 'Definitions') + '</h3><ul>' +
      '<li>' + t('อัตราการใช้สิทธิ = Σผู้มาใช้สิทธิ ÷ Σผู้มีสิทธิ × 100 (รวมตัวเศษและตัวส่วนก่อนหาร ไม่เฉลี่ยร้อยละรายเขต) ใช้ยอดผู้มาใช้สิทธิของบัตรแบบแบ่งเขต', 'Turnout = Σ voters ÷ Σ eligible × 100, summing numerators and denominators first (no averaging of percentages); uses the constituency-ballot turnout count') + '</li>' +
      '<li>' + t('ส่วนต่าง = คะแนนผู้ชนะ − คะแนนอันดับสอง; ร้อยละส่วนต่าง = ส่วนต่าง ÷ บัตรดีแบบแบ่งเขต × 100', 'Margin = winner votes − runner-up votes; margin % = margin ÷ valid constituency ballots × 100') + '</li>' +
      '<li>' + t('สัดส่วนคะแนนผู้สมัคร = คะแนน ÷ บัตรดีแบบแบ่งเขต; สัดส่วนบัญชีรายชื่อ = คะแนน ÷ บัตรดีบัญชีรายชื่อ; ส่วนต่างสองบัตรแสดงเป็นจุดเปอร์เซ็นต์', 'Candidate share = votes ÷ valid constituency ballots; list share = votes ÷ valid party-list ballots; differences are in percentage points') + '</li>' +
      '<li>' + t('บัตรเสียแสดงแยกตามชนิดบัตร (แบบแบ่งเขต / บัญชีรายชื่อ) ไม่นำมารวมกัน', 'Invalid ballots are reported per ballot type (constituency / party-list), never combined') + '</li>' +
      '<li>' + t('ที่นั่งบัญชีรายชื่อจัดสรรระดับประเทศ จึงไม่แบ่งลงจังหวัดหรือภูมิภาค', 'Party-list seats are allocated nationally and are never split by province or region') + '</li>' +
      '<li>' + t('เกินครึ่งสภา = ' + CFG().majority + ' ที่นั่งขึ้นไป จากทั้งหมด ' + CFG().totalSeats + ' ที่นั่ง (ส.ส.เขตรวมกับบัญชีรายชื่อ)', 'A majority of the House = ' + CFG().majority + ' or more of the ' + CFG().totalSeats + ' seats (constituency and party-list together)') + '</li>' +
      '<li>' + t('อันดับผู้สมัครใช้คะแนนแบบแบ่งเขตของแต่ละคน; คะแนนที่ทิ้งห่าง = คะแนนผู้ชนะ − คะแนนอันดับสองของเขตเดียวกัน', 'Candidate rankings use each candidate\'s constituency votes; a lead = the winner\'s votes − the runner-up\'s in the same constituency') + '</li></ul></section>' +
      liveCheckHtml() +
      '<section><h3>' + t('การตรวจสอบภายในขณะเปิดหน้า', 'Integrity checks run on load') + ' <small>' + ok + '/' + checks.length + '</small></h3><ul class="checks">' + checks.map(c => '<li class="' + (c.note ? 'note' : c.ok ? 'ok' : 'bad') + '"><b>' + (c.note ? 'ℹ' : c.ok ? '✓' : '✗') + '</b> ' + esc(c.detail) + '</li>').join('') + '</ul></section>' +
      '<section><h3>' + t('ข้อควรระวังในการตีความ', 'Reading responsibly') + '</h3><ul>' +
      '<li>' + t('แผนที่หกเหลี่ยมให้ทุกจังหวัดมีขนาดเท่ากัน จึงบิดเบือนพื้นที่และตำแหน่งจริง', 'The hex map gives every province the same size, distorting real area and position') + '</li>' +
      '<li>' + t('ข้อมูลระดับจังหวัดและเขตไม่บอกพฤติกรรมของผู้ลงคะแนนรายบุคคล', 'Province and constituency totals say nothing about individual voters') + '</li>' +
      '<li>' + t('กราฟรวมเสียงตั้งรัฐบาลนับจากจำนวนที่นั่งเท่านั้น ไม่ได้บอกว่าพรรคใดจะร่วมรัฐบาลกันจริง', 'The majority builder only counts seats; it does not say which parties would in fact govern together') + '</li>' +
      '<li>' + t('เขตที่ชนะกันสูสีไม่ใช่หลักฐานของความผิดปกติ', 'Close races are not evidence of irregularities') + '</li></ul></section>';
  }

  document.addEventListener('click', ev => {
    if (!ev.target.closest('#themeMenu')) closeThemeMenu();
    const a = ev.target.closest('[data-act]'); if (!a) return;
    const act = a.dataset.act, v = a.dataset.v;
    if (a.tagName === 'A') ev.preventDefault();
    switch (act) {
      case 'page': setPage(v, a.dataset.chart); break;
      case 'party': setState({ party: state.party === v ? '' : v }); if (state.party && !a.closest('#partyCards')) revealPartyCard(v); break;
      case 'province': hideTip(true); if (isM() && state.page === 'overview') { showProvince(v); break; } setState({ province: v, district: '', candidate: '' }); if (state.page === 'overview') $('context').scrollTop = 0; break;
      case 'district': hideTip(true); if (state.page === 'analysis') { setState({ district: v }); E69.analysis?.showDetail?.(v); } else openDistrict(v); break;
      case 'unset': {
        const patch = { [v]: v === 'brush' ? null : '' };
        if (v === 'district') patch.candidate = '';
        setState(patch); break;
      }
      case 'zoom': {
        const drill = state.province && distZoom && !$('distmap').hasAttribute('hidden'), behavior = drill ? distZoom : zoomBehavior;
        d3.select(drill ? '#distmap' : '#hexmap').transition().duration(250).call(behavior.scaleBy, v === 'in' ? 1.5 : 1 / 1.5); break;
      }
      case 'map-reset': resetMap(); break;
      case 'legend-toggle': legendOpen = !legendOpen; $('mapLegend').classList.toggle('open', legendOpen); a.setAttribute('aria-expanded', String(legendOpen)); break;
      case 'lang': if (v !== lang) { lang = v; try { localStorage.setItem('e69-language', lang); } catch (e) { /* ignore */ } d3.selectAll('#hexmap g.hex').each(d => { d.opts = null; }); hideTip(true); render(); if (!$('sourcesDialog').hidden && $('sourcesDialog').open) $('sourcesBody').innerHTML = sourcesHtml(); } break;
      case 'clear-all': clearAll(); break;
      case 'refresh-data': refreshData(); break;
      case 'theme-menu': if ($('themeList').hidden) openThemeMenu(); else closeThemeMenu(); break;
      case 'theme': setTheme(v); closeThemeMenu(true); break;
      case 'sources': $('sourcesTitle').innerHTML = t('ที่มาข้อมูล นิยาม และ<span class="nw">การตรวจสอบ</span>', 'Sources, definitions and checks'); $('sourcesBody').innerHTML = sourcesHtml(); closeDrawer(); $('sourcesDialog').showModal(); closeNav(); if (isM()) armBack(); break;
      case 'sheet-close': closeSheet(); break;
      case 'goto-map': { const r = D.byId.get(v); closeSheet(); state.page = 'overview'; history.replaceState(null, '', '#overview'); if (isM()) { state.mView = 'map'; mPanelSize = 'half'; } setState({ province: r.provinceCode, district: v }); break; }
      // phones
      case 'm-tab': mTab(v); break;
      case 'm-panel-close': closePanel(true); break;
      case 'm-drawer': if (mDrawer) closeDrawer(true); else openDrawer(); break;
      case 'm-drawer-close': closeDrawer(true); break;
      case 'm-example': $('search').value = v; $('search').focus(); suggest(); break;
      case 'm-mapmode': openSheet({ kind: 'mapmode' }); break;
      case 'm-setmode': closeSheet(); setState({ mapMode: v }); break;
      case 'm-panel': setPanel(mPanelSize === 'full' ? 'half' : mPanelSize === 'peek' ? 'half' : 'full'); break;
      case 'tip-close': inspectKey = ''; hideChartTip(); break;
      case 'tip-act': inspectAct(); break;
      default: E69.analysis?.onAction?.(act, v, a, ev);
    }
  });
  document.addEventListener('change', ev => {
    const id = ev.target.id, v = ev.target.value;
    if (id === 'fRegion') setState({ region: v, brush: null });
    else if (id === 'fProvince') { if (v && isM() && state.page === 'overview') { closePanel(); showProvince(v); } else setState({ province: v, district: '', candidate: '' }); }
    else if (id === 'fParty') setState({ party: v });
    else if (id === 'mapMode') setState({ mapMode: v });
    else E69.analysis?.onChange?.(id, v, ev);
  });
  document.addEventListener('keydown', ev => {
    if (ev.key !== 'Escape') return;
    if (!$('themeList').hidden) { closeThemeMenu(true); return; }
    if (tipCode) { hideTip(true); dismissTip(); return; }
    if (!$('sheet').hidden) { closeSheet(); return; }
    if (mDrawer) { closeDrawer(true); return; }
    if (mPanel) { closePanel(true); return; }
    if (isM() && !$('chartTip').hidden) { inspectKey = ''; hideChartTip(); return; }
    if (document.body.classList.contains('nav-open')) { closeNav(); return; }
    // Analysis, desktop: Escape steps back from a chart opened large to the four-chart overview.
    if (state.page === 'analysis' && !isM() && state.analysisTab === 'core' && state.coreFocus && !ev.target.closest('input,select,dialog')) { E69.analysis?.onAction?.('an-unfocus'); return; }
    if (state.page === 'overview' && (state.district || state.province) && !ev.target.closest('input,select,dialog')) setState(state.district ? { district: '', candidate: '' } : { province: '' });
  });
  $('provinceTip').addEventListener('pointerenter', () => { clearTimeout(hideTimer); clearTimeout(switchTimer); });
  $('provinceTip').addEventListener('pointerleave', ev => { if (ev.relatedTarget && ev.relatedTarget.closest?.('#hexmap .hex')) return; scheduleHide(); });
  $('provinceTip').addEventListener('click', () => { const code = tipCode; if (code) activateProvince(code, true); });
  $('menuBtn').addEventListener('click', openNav); $('closeNav').addEventListener('click', closeNav); $('scrim').addEventListener('click', closeNav);
  $('sourcesClose').addEventListener('click', () => $('sourcesDialog').close());
  $('sourcesDialog').addEventListener('click', ev => { if (ev.target === $('sourcesDialog')) $('sourcesDialog').close(); });
  addEventListener('hashchange', () => { const p = location.hash.slice(1); if ((p === 'overview' || p === 'analysis') && p !== state.page) setPage(p); });
  addEventListener('resize', () => { hideTip(true); lensCancel(); positionPill(); if (!$('sheet').hidden) $('sheet').classList.toggle('as-drawer', !narrow() && state.page === 'analysis'); if (!narrow()) closeNav(); });
  $('main').addEventListener('scroll', () => { if (tipCode) hideTip(true); hidePill(); }, { passive: true });

  /* ---------- colour theme control ---------- */
  // One icon button beside the language flags (sun or moon, for what is on screen) opens a three-way menu: same as
  // the device, light or dark. Arrow keys move through the menu; Escape or a click elsewhere closes it.
  const THEME_ICON = {
    light: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>',
    dark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>',
    system: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
  };
  const themeName = v => ({ system: t('ตามระบบของเครื่อง', 'Same as device'), light: t('สว่าง', 'Light'), dark: t('มืด', 'Dark') })[v];
  function renderThemeControl() {
    const now = isDark() ? 'dark' : 'light', label = t('ธีมสี: ', 'Colour theme: ') + themeName(themeChoice) + (themeChoice === 'system' ? ' (' + themeName(now) + ')' : '');
    $('themeBtn').innerHTML = THEME_ICON[now] + '<span class="sr-only">' + esc(label) + '</span>'; $('themeBtn').title = label;
    $('themeList').setAttribute('aria-label', t('ธีมสี', 'Colour theme'));
    $('themeList').innerHTML = ['system', 'light', 'dark'].map(v => '<button type="button" role="menuitemradio" tabindex="-1" data-act="theme" data-v="' + v + '" aria-checked="' + (themeChoice === v) + '">' + THEME_ICON[v] + '<span>' + themeName(v) + '</span></button>').join('');
    renderPhoneSettings();
  }
  function openThemeMenu() {
    $('themeList').hidden = false; $('themeBtn').setAttribute('aria-expanded', 'true');
    ($('themeList').querySelector('[aria-checked=true]') || $('themeList').firstElementChild).focus();
  }
  function closeThemeMenu(refocus) {
    if ($('themeList').hidden) return;
    $('themeList').hidden = true; $('themeBtn').setAttribute('aria-expanded', 'false');
    if (refocus) $('themeBtn').focus();
  }
  $('themeList').addEventListener('keydown', ev => {
    const items = [...$('themeList').querySelectorAll('[role=menuitemradio]')], i = items.indexOf(document.activeElement);
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); items[(i + (ev.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus(); }
    else if (ev.key === 'Tab') closeThemeMenu();
  });
  function setTheme(choice) {
    themeChoice = choice;
    try { if (choice === 'system') localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, choice); } catch (e) { /* the choice then lasts for this visit */ }
    applyTheme();
  }
  function applyTheme() {
    const next = themeChoice === 'system' ? (darkQuery.matches ? 'dark' : 'light') : themeChoice, changed = document.documentElement.dataset.theme !== next;
    document.documentElement.dataset.theme = next;
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', next === 'dark' ? '#08161e' : '#effaff');
    renderThemeControl();
    if (changed && DS) repaintTheme();
  }
  // Colours baked into the drawing (party colours, ramps, tie stripes) are rebuilt for the new theme; selections stay.
  function repaintTheme() {
    D = buildD(DS); E69.D = D; districtScales = null; buildSearch();
    d3.select('#hexmap defs').selectAll('pattern').remove();
    hideTip(true); hideChartTip(); render();
  }
  darkQuery.addEventListener('change', () => { if (themeChoice === 'system') applyTheme(); });
  applyTheme();

  /* ---------- pointer light ---------- */
  // Menu items, tabs, buttons, chips, KPI tiles and party cards hold a soft light under the mouse: e69.css draws it at
  // --mx/--my. One listener for the page, at most one update per frame, mouse and pen only.
  const SPOT = '.nav-item, .an-tabs button, .seg button, .icon-btn, .map-reset, .clear-all, .ghost-btn, .chip, .others-row, .close-list button, .theme-list button, .kpi, .party-card, button.lg-item, .pd-list li > button, .sr, .brush-list li button, .prov-bars button';
  let spotEvent = null, spotFrame = 0;
  document.addEventListener('pointermove', ev => {
    if (ev.pointerType === 'touch') return;
    spotEvent = ev;
    if (spotFrame) return;
    spotFrame = requestAnimationFrame(() => {
      spotFrame = 0;
      const el = spotEvent.target instanceof Element ? spotEvent.target.closest(SPOT) : null;
      if (!el) return;
      const r = el.getBoundingClientRect(), k = el.offsetWidth ? r.width / el.offsetWidth : 1;   // the chosen party card is drawn 5% larger
      el.style.setProperty('--mx', ((spotEvent.clientX - r.left) / k).toFixed(1) + 'px');
      el.style.setProperty('--my', ((spotEvent.clientY - r.top) / k).toFixed(1) + 'px');
    });
  }, { passive: true });

  Object.assign(E69, { $, esc, fmt, fmtP, fmtPP, t, lang: () => lang, pname, ptitle, rname, dname, dot, face, nm, thaiDate, chartTip, hideChartTip, provinceDetail, districtDetail, openSheet, closeSheet, narrow, coarse, isM, render, scopeRows, isRegionIn, findDistricts,
    ramps, colors, isDark, typeUp, inkOn: fill => luminance(d3.color(fill).formatHex()) > 0.33 ? '#102631' : '#fff',
    data: () => D, config: () => DS.config, dataMode: () => DS.mode, loadedAt: () => DS.loadedAt, refresh: () => refreshData() });

  /* ---------- data loading and refresh ---------- */
  // Beside the refresh icon: when the data on screen was read (opening the page or pressing refresh).
  let refreshing = false, noteTimer = 0;
  function clockText(when) {
    const hm = when.toLocaleTimeString(lang === 'en' ? 'en-GB' : 'th-TH', { hour: '2-digit', minute: '2-digit', hour12: false });
    return (when.toDateString() === new Date().toDateString() ? '' : thaiDate(when.toISOString()) + ' ') + hm + t(' น.', '');
  }
  function renderDataStatus() {
    if (!DS) return;
    const when = DS.loadedAt;
    $('updatedAt').innerHTML = '<span class="ua-label">' + (refreshing ? t('กำลังอัปเดต…', 'Updating…') : t('อัปเดตล่าสุด', 'Last updated')) + '</span><b class="ua-time">' + esc(clockText(when)) + '</b>';
    $('refreshLabel').textContent = t('อัปเดตข้อมูลให้เป็นปัจจุบัน', 'Refresh the data');
    $('refreshBtn').title = t('อัปเดตข้อมูลให้เป็นปัจจุบัน (ล่าสุด ', 'Refresh the data (last updated ') + thaiDate(when.toISOString()) + ' ' + when.toLocaleTimeString(lang === 'en' ? 'en-GB' : 'th-TH', { hour12: false }) + ')';
    renderPhoneSettings();
  }
  function showNote(message, failed) {
    const note = $('refreshNote'), toast = $('mToast'); clearTimeout(noteTimer);
    note.textContent = message; note.classList.toggle('is-failed', !!failed); note.hidden = false;
    // Phones show the same note as a toast above the tab bar (the refresh button is in the menu drawer there).
    if (isM()) { toast.textContent = message; toast.classList.toggle('is-failed', !!failed); toast.hidden = false; }
    // A success note clears quickly; a failure stays longer because it names the file, row and column to fix.
    noteTimer = setTimeout(() => { note.hidden = true; toast.hidden = true; }, failed ? 9000 : 2000);
  }
  // What a refresh brought in: constituencies whose figures differ, and whether party details changed.
  const districtPrint = r => [r.eligible, r.turnout, r.invalid, r.noVote, r.partyListTurnout, r.partyListValidVotes, r.partyListInvalid, r.partyListNoVote, r.zone.join(';'),
    ...r.candidates.map(c => c.number + ':' + c.name + ':' + c.party + ':' + c.votes).sort(), ...Object.entries(r.partyList || {}).map(e => e.join(':')).sort()].join('|');
  const partyPrint = list => JSON.stringify(list.map(p => [p.name, p.color, p.totalSeats, p.constituencySeats, p.listSeats, p.principal, p.leader, p.portrait && [p.portrait.name, p.portrait.src]]));
  function whatChanged(before, after) {
    let n = before.rows.filter(r => !after.byId.has(r.id)).length;
    for (const r of after.rows) { const old = before.byId.get(r.id); if (!old || districtPrint(old) !== districtPrint(r)) n++; }
    return { districts: n, parties: partyPrint(before.parties) !== partyPrint(after.parties), settings: JSON.stringify({ ...before.raw.summary }) !== JSON.stringify({ ...after.raw.summary }) };
  }
  // Selections that point at something no longer in the data are dropped; everything else stays as the user left it.
  function keepValidState() {
    if (state.province && !D.provinceByCode.has(state.province)) Object.assign(state, { province: '', district: '', candidate: '' });
    if (state.district && !D.byId.has(state.district)) Object.assign(state, { district: '', candidate: '' });
    if (state.candidate && !D.byId.get(state.district)?.candidates.some(c => c.officialCandidateId === state.candidate)) state.candidate = '';
    if (state.party && !D.partyIndex.has(state.party)) state.party = '';
    state.compare = state.compare.filter(id => D.byId.has(id));
    if (state.brush) { const ids = state.brush.ids.filter(id => D.byId.has(id)); state.brush = ids.length ? { ...state.brush, ids } : null; }
  }
  // The refresh button re-reads the election files, bypassing every cache, and redraws in place.
  async function refreshData() {
    if (refreshing || !DS) return;
    refreshing = true; $('refreshBtn').disabled = true; $('refreshBtn').classList.add('is-loading'); renderDataStatus();
    try {
      const next = await window.E69Source.load({ fresh: true });
      // Another election (or another map) was made active: start from a clean page instead of morphing one into the other.
      if (next.config.id !== DS.config.id || next.config.districtShapes !== DS.config.districtShapes || JSON.stringify(next.reference.tiles) !== JSON.stringify(DS.reference.tiles)) { location.reload(); return; }
      const nextD = buildD(next), change = whatChanged(D, nextD);
      DS = next; D = nextD; E69.D = D;
      keepValidState(); districtScales = null; buildSearch();
      d3.selectAll('#hexmap g.hex').each(d => { d.opts = null; });
      refreshMotion = change.districts > 0 || change.parties;
      hideTip(true); hideChartTip(); render();
      const parts = [change.districts ? t('ข้อมูลเปลี่ยน ' + fmt(change.districts) + ' เขต', fmt(change.districts) + (change.districts === 1 ? ' constituency changed' : ' constituencies changed')) : '', change.parties ? t('ข้อมูลพรรคเปลี่ยน', 'party details changed') : ''].filter(Boolean);
      showNote(t('อัปเดตแล้ว · ', 'Updated · ') + (parts.length ? parts.join(' · ') : change.settings ? t('ข้อมูลสรุปเปลี่ยน', 'summary changed') : t('ข้อมูลยังเหมือนเดิม', 'no changes')));
    } catch (error) {
      console.error(error);
      showNote(t('อัปเดตไม่สำเร็จ ยังแสดงข้อมูลเดิม', 'Update failed; still showing the previous data') + (error instanceof window.E69Source.DataError ? ' · ' + error.message : ''), true);
    } finally {
      refreshing = false; $('refreshBtn').disabled = false; $('refreshBtn').classList.remove('is-loading'); renderDataStatus();
    }
  }
  function start(ds) {
    DS = ds;
    D = buildD(ds);
    E69.D = D;
    document.querySelector('meta[name=description]')?.setAttribute('content', 'Election ' + CFG().brandNumber + ' — สำรวจและวิเคราะห์ผลเลือกตั้ง สส. ' + electionDay() + ' จากข้อมูล ' + CFG().sourceTh + ' ผ่านแผนที่ ' + ds.reference.tiles.length + ' จังหวัด การ์ดพรรค และกราฟวิเคราะห์เชิงโต้ตอบ');
    buildSearch();
    const h = location.hash.slice(1); if (h === 'analysis') state.page = 'analysis';
    render();
    window.__e69Ready = true;
  }
  function showLoadError(error) {
    console.error(error);
    $('pageOverview').innerHTML = '<p class="load-error">เปิดข้อมูลไม่ได้ กรุณาตรวจว่าแตกไฟล์ชุดเว็บไซต์ครบ / Unable to load the election data. Make sure every file was extracted.' +
      (error instanceof window.E69Source?.DataError ? '<br><small>' + esc(error.message) + '</small>' : '') + '</p>';
  }
  // Label fitting measures text with the bundled Noto Sans Thai font, so wait briefly for it before the first render.
  function whenFontsReady() {
    if (!document.fonts?.load) return Promise.resolve();
    const loaded = Promise.all(['400 14px "Noto Sans Thai"', '600 14px "Noto Sans Thai"'].map(f => document.fonts.load(f))).catch(() => {});
    return Promise.race([loaded, new Promise(r => setTimeout(r, 1500))]);
  }
  function boot() {
    Promise.all([window.E69Source.load(), whenFontsReady()]).then(([ds]) => {
      start(ds);
      // If the font arrives after the time limit, re-measure labels with the real metrics.
      document.fonts?.ready?.then(() => { d3.selectAll('#hexmap g.hex').each(d => { d.opts = null; }); layoutLabels(); });
    }).catch(showLoadError);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else setTimeout(boot);
})();
