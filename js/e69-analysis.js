/* Data Analysis page: graph-first workspace with coordinated views.
   Global filter = region (restricts constituencies); highlights = party, province, selected constituency;
   brushed subset = constituencies selected by dragging in the margin histogram or the scatterplot. */
(function () {
  'use strict';
  const E = window.E69, A = E.analysis = {};
  const S = () => E.state();
  const t = (th, en) => E.t(th, en);
  const esc = v => E.esc(v);
  const ACCENT = '#0284c7', MUTED_BAR = '#dfe6ee';
  const REGION_COLORS = { 'กรุงเทพมหานคร': '#4e79a7', 'กลาง': '#f28e2b', 'ตะวันออก': '#59a14f', 'ตะวันตก': '#b07aa1', 'เหนือ': '#e15759', 'ตะวันออกเฉียงเหนือ': '#76b7b2', 'ใต้': '#edc948' };
  const tableOn = new Set();
  let D, ro, redrawTimer, cmpProvince = '';
  const finite = Number.isFinite;
  const fmt = v => E.fmt(v), fmtP = (v, k) => E.fmtP(v, k), fmtPP = (v, k) => E.fmtPP(v, k);
  let measureCtx;
  const textW = (s, px = 12) => { measureCtx = measureCtx || document.createElement('canvas').getContext('2d'); measureCtx.font = px + 'px ' + getComputedStyle(document.body).fontFamily; return measureCtx.measureText(s).width; };
  // Room for a rotated y-axis title left of the percentage ticks: a left margin and the title's offset that keep a
  // few pixels between the title, the widest tick label and the chart's edge. Ticks depend on the domain only.
  const yTitleRoom = scale => { const w = d3.max(scale.ticks(5), v => textW(v + '%', 12)) || 0; return { left: Math.round(30 + w), title: -Math.round(18 + w) }; };
  const pearson = (xs, ys) => { const n = xs.length; if (n < 3) return null; const mx = d3.mean(xs), my = d3.mean(ys); let a = 0, b = 0, c = 0; for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; a += dx * dy; b += dx * dx; c += dy * dy; } return b && c ? a / Math.sqrt(b * c) : null; };
  const shortName = r => (E.lang() === 'en' ? (r.provinceEn || r.province) : r.province) + ' ' + r.number;
  const brushSet = () => S().brush ? new Set(S().brush.ids) : null;
  const tipRows = rows => rows.map(([k, v]) => '<div class="tt-row"><span>' + k + '</span><span>' + v + '</span></div>').join('');

  /* ---------- tabs ---------- */
  // Tab names say what each view answers, in everyday words.
  const DESKTOP_TABS = () => [
    ['core', t('ภาพรวม 4 กราฟ', 'Four main charts'), ['seats', 'margin', 'scatter', 'ballots']],
    ['region', t('คะแนนแต่ละภาค', 'Votes by region'), ['region']],
    ['density', t('ประชากรหนาแน่นกับคะแนนพรรค', 'Population density and votes'), ['density']],
    ['compare', t('เปรียบเทียบเขตที่สนใจ', 'Compare constituencies'), ['compare']],
  ];
  const MOBILE_TABS = () => [['seats', t('ที่นั่งของแต่ละพรรค', 'Seats by party')], ['margin', t('ชนะกันห่างแค่ไหน', 'How close races were')], ['scatter', t('คนมาใช้สิทธิกับความสูสี', 'Turnout and closeness')], ['ballots', t('คะแนนคนกับคะแนนพรรค', 'Candidate vs party votes')], ['region', t('คะแนนแต่ละภาค', 'Votes by region')], ['density', t('ประชากรหนาแน่นกับคะแนนพรรค', 'Density and votes')], ['compare', t('เปรียบเทียบเขตที่สนใจ', 'Compare constituencies')]];

  /* ---------- chart definitions ---------- */
  // Each label is grouped with its control (.ctl) so a wrapping toolbar never leaves a label at the end of a line.
  const seg = (k, opts, label) => '<span class="ctl"><span class="ctl-label">' + label + '</span><span class="seg" role="group" aria-label="' + esc(label) + '">' + opts.map(([v, l]) => '<button type="button" data-act="an-set" data-k="' + k + '" data-v="' + v + '" aria-pressed="' + (String(S()[k]) === v) + '">' + l + '</button>').join('') + '</span></span>';
  const sel = (k, opts, label) => '<span class="ctl"><label class="ctl-label" for="ctl-' + k + '">' + label + '</label><select id="ctl-' + k + '" data-k="' + k + '">' + opts.map(([v, l]) => '<option value="' + esc(v) + '"' + (String(S()[k]) === v ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></span>';
  const scopeLabel = () => S().region ? E.rname(S().region) : t('ทั้งประเทศ', 'nationwide');

  const CH = {
    seats: {
      badge: 'A',
      title: () => t('พรรคไหนได้ที่นั่งมากที่สุด และมาจาก สส.เขตกับบัญชีรายชื่อเท่าไร?', 'Which party won most seats, and how many from constituencies vs party lists?'),
      q: () => t('ที่นั่งทั้งประเทศ ' + E.config().totalSeats + ' ที่นั่ง ไม่เปลี่ยนตามตัวกรองภูมิภาค', 'All ' + E.config().totalSeats + ' national seats; the region filter does not apply'),
      controls: () => seg('seatSort', [['total', t('รวม', 'Total')], ['cons', t('สส.เขต', 'Const.')], ['list', t('บัญชีรายชื่อ', 'List')]], t('เรียงตาม', 'Sort')) + seg('seatTop', [['5', '5'], ['10', '10'], ['all', t('ทุกพรรค', 'All')]], t('แสดง', 'Show')),
      foot: () => { const bad = D.seatParties.filter(p => p.totalSeats !== p.constituencySeats + p.listSeats); return '<span>' + (bad.length ? '⚠ ' + bad.map(p => p.name).join(', ') : '✓ ' + t('ตรวจแล้วว่าที่นั่งรวมเท่ากับ สส.เขต บวกบัญชีรายชื่อทุกพรรค รวม ' + E.config().totalSeats + ' ที่นั่ง', 'Checked: for every party, total equals constituency plus list seats, ' + E.config().totalSeats + ' in all')) + (S().region ? ' ' + t('ตัวกรองภูมิภาคไม่ใช้กับกราฟนี้ เพราะบัญชีรายชื่อจัดสรรระดับประเทศ', 'Region filter does not apply: list seats are allocated nationally') : '') + '</span>'; },
      draw: drawSeats, table: tableSeats,
    },
    margin: {
      badge: 'B',
      title: () => t('เขตเลือกตั้งต่าง ๆ ชนะกันสูสีมากน้อยแค่ไหน?', 'How close were the races?'),
      q: () => t('ลากบนกราฟเพื่อเลือกช่วง แล้วดูเขตเหล่านั้นในกราฟอื่น ขอบเขต: ', 'Drag across the bars to select a range and follow it in the other charts. Scope: ') + scopeLabel(),
      controls: () => seg('marginMetric', [['pct', t('% ของบัตรดี', '% of valid')], ['votes', t('คะแนน', 'votes')]], t('หน่วย', 'Unit')) + '<span class="ctl"><span class="ctl-label">' + t('ช่วงด่วน', 'Quick range') + '</span><span class="seg">' + [['0,5', '< 5%'], ['5,10', '5–10%'], ['10,20', '10–20%']].map(([v, l]) => '<button type="button" data-act="brush-preset" data-v="' + v + '">' + l + '</button>').join('') + '</span></span>',
      foot: () => { const rows = E.scopeRows().filter(r => finite(r.marginPct)), med = d3.median(rows, r => r.marginPct); return '<span>' + t('มัธยฐาน ', 'Median ') + '<b>' + fmtP(med) + '</b> ' + t('ชนะกันไม่ถึง 5% ', 'Under 5%: ') + '<b>' + rows.filter(r => r.marginPct < 5).length + '</b>/' + rows.length + t(' เขต', ' constituencies') + '<br>' + t('ส่วนต่างคือคะแนนอันดับหนึ่งลบอันดับสอง หารด้วยบัตรดีแบบแบ่งเขต ความสูสีไม่ใช่หลักฐานของความผิดปกติ', 'Margin is first minus second place, divided by valid constituency ballots. A close race is not evidence of irregularity.') + '</span>' + brushFoot(); },
      draw: drawMargin, table: tableMargin,
    },
    scatter: {
      badge: 'C',
      title: () => t('อัตราการใช้สิทธิสัมพันธ์กับความสูสีของผลเลือกตั้งหรือไม่?', 'Is turnout related to how competitive a race was?'),
      q: () => t('หนึ่งจุดคือหนึ่งเขต ลากเพื่อเลือกกลุ่ม คลิกจุดเพื่อดูรายละเอียด ขอบเขต: ', 'Each dot is a constituency. Drag to select a group, click a dot for details. Scope: ') + scopeLabel(),
      controls: () => seg('scatterColor', [['winner', t('พรรคผู้ชนะ', 'Winning party')], ['region', t('ภูมิภาค', 'Region')]], t('สีจุด', 'Colour')),
      foot: () => { const rows = E.scopeRows().filter(r => finite(r.turnoutPct) && finite(r.marginPct)), r = pearson(rows.map(d => d.turnoutPct), rows.map(d => d.marginPct)); return '<span>' + t('สหสัมพันธ์เพียร์สัน ', 'Pearson ') + '<b>r = ' + (r === null ? '—' : r.toFixed(2)) + '</b> (n = ' + rows.length + ') ' + t('ความสัมพันธ์ไม่ใช่ความเป็นเหตุเป็นผล', 'Correlation is not causation.') + '</span>' + brushFoot(); },
      draw: drawScatter, table: tableScatter,
    },
    ballots: {
      badge: 'D',
      title: () => t('คะแนนผู้สมัครกับคะแนนบัญชีรายชื่อของพรรคเดียวกันแตกต่างกันอย่างไร?', 'How do a party\'s candidate and party-list votes differ?'),
      q: () => (S().ballotMode === 'party' ? t('ดัมเบล รายพรรค · คลิกพรรคเพื่อเจาะดูรายเขต · ', 'Dumbbell by party · click a party to drill into constituencies · ') : t('ดัมเบล รายเขต · ', 'Dumbbell by constituency · ') + (S().party ? esc(S().party) : t('พรรคของผู้ชนะแต่ละเขต', 'each winner\'s party')) + (S().brush ? t(' · เฉพาะเขตที่ลากเลือก', ' · brushed constituencies only') : '') + ' · ') + scopeLabel(),
      controls: () => seg('ballotMode', [['party', t('รายพรรค', 'By party')], ['district', t('รายเขต', 'By constituency')]], t('ระดับ', 'Level')) + seg('ballotUnit', [['share', t('สัดส่วน %', 'Share %')], ['votes', t('คะแนนดิบ', 'Raw votes')]], t('หน่วย', 'Unit')) +
        (S().ballotMode === 'party' ? sel('ballotSort', [['gap', t('ส่วนต่าง (บัญชี − ผู้สมัคร)', 'Gap (list − candidate)')], ['list', t('คะแนนบัญชีรายชื่อ', 'List share')], ['cand', t('คะแนนผู้สมัคร', 'Candidate share')]], t('เรียง', 'Sort'))
          : sel('ballotSort', [['gap', t('บัญชีสูงกว่าผู้สมัครมากสุด', 'List above candidate most')], ['gapAsc', t('ผู้สมัครสูงกว่าบัญชีมากสุด', 'Candidate above list most')], ['abs', t('ต่างกันมากสุด (ค่าสัมบูรณ์)', 'Largest absolute gap')]], t('เรียง', 'Sort')) + sel('ballotTop', [['15', '15'], ['30', '30'], ['all', t('ทั้งหมด', 'All')]], t('จำนวน', 'Rows'))),
      foot: () => ballotFoot(), draw: drawBallots, table: tableBallots, scroll: () => true,
    },
    region: {
      title: () => t('แต่ละภูมิภาคมีรูปแบบคะแนนของพรรคการเมืองแตกต่างกันอย่างไร?', 'How do party voting patterns differ by region?'),
      q: () => t('คลิกช่องเพื่อเลือกทั้งภูมิภาคและพรรค หรือคลิกหัวแถวและหัวคอลัมน์เพื่อเลือกอย่างใดอย่างหนึ่ง', 'Click a cell to pick a region and a party, or a row or column header to pick one'),
      controls: () => sel('heatMetric', [['list', t('สัดส่วนคะแนนบัญชีรายชื่อ (%)', 'Party-list vote share (%)')], ['cand', t('สัดส่วนคะแนนผู้สมัคร (%)', 'Candidate vote share (%)')], ['seats', t('จำนวนเขตที่ชนะ', 'Constituencies won')], ['seatShare', t('สัดส่วนเขตที่ชนะ (%)', 'Share of constituencies won (%)')]], t('ตัวชี้วัด', 'Metric')) + seg('heatSort', [['region', t('ลำดับภูมิภาค', 'Region order')], ['party', t('ตามพรรคที่เลือก', 'By selected party')]], t('เรียงแถว', 'Row order')),
      foot: () => '<span>' + t('สัดส่วนรายภูมิภาคคิดจากคะแนนพรรครวมหารด้วยบัตรดีรวมของบัตรชนิดเดียวกัน ไม่ใช่ค่าเฉลี่ยร้อยละรายเขต สียิ่งเข้มค่ายิ่งสูง ใช้สเกลเดียวทั้งตาราง', 'Regional shares divide total party votes by total valid ballots of the same type, not an average of percentages. Darker means higher, on one scale for the whole table.') + '</span>',
      draw: drawRegion, table: null, html: true,
    },
    density: {
      title: () => t('ความหนาแน่นประชากรของจังหวัดสัมพันธ์กับสัดส่วนคะแนนของพรรคอย่างไร?', 'How does province population density relate to a party\'s vote share?'),
      q: () => t('หนึ่งจุดคือหนึ่งจังหวัด ขนาดจุดตามจำนวนผู้มีสิทธิ ความหนาแน่นจาก สสช. ปี 2567 ขอบเขต: ', 'Each dot is a province, sized by eligible voters. NSO density 2024. Scope: ') + scopeLabel(),
      controls: () => { const party = densityParty(); return '<span class="ctl"><label class="ctl-label" for="ctl-densityParty">' + t('พรรค', 'Party') + '</label><select id="ctl-densityParty">' + D.seatParties.map(p => '<option value="' + esc(p.name) + '"' + (p.name === party ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('') + '</select></span>' + seg('densityBallot', [['partyList', t('บัญชีรายชื่อ', 'Party-list')], ['constituency', t('แบ่งเขต', 'Constituency')]], t('บัตร', 'Ballot')) + seg('densityScale', [['log', t('ลอการิทึม', 'Log')], ['linear', t('เชิงเส้น', 'Linear')]], t('สเกล', 'Scale')); },
      foot: () => densityFoot(), draw: drawDensity, table: tableDensity,
    },
    compare: {
      title: () => t('เขตที่สนใจต่างกันอย่างไร?', 'How do selected constituencies differ?'),
      q: () => t('เลือกได้สูงสุด 4 เขต แถบของตัวชี้วัดเดียวกันใช้สเกลเดียวกัน', 'Up to 4 constituencies; bars for the same metric share one scale'),
      controls: () => compareControls(), foot: () => '<span>' + t('เพิ่มเขตจากช่องเลือกด้านบน หรือปุ่ม “เพิ่มในการเปรียบเทียบ” ในรายละเอียดเขต', 'Add constituencies above or via “Add to comparison” in a constituency detail') + '</span>',
      draw: drawCompare, table: null, html: true,
    },
  };

  function brushFoot() {
    const b = S().brush; if (!b) return '';
    return '<span><b>' + esc(b.label) + '</b> · ' + b.ids.length + t(' เขต', ' constituencies') + ' <button type="button" class="tbl-toggle" data-act="brush-list">' + t('ดูรายชื่อเขต', 'List them') + '</button> <button type="button" class="tbl-toggle" data-act="unset" data-v="brush">' + t('ล้างช่วง', 'Clear') + '</button></span>';
  }

  /* ---------- page render ---------- */
  // Phones and smaller windows show one large chart at a time so the page never needs to scroll.
  const singleMode = () => E.narrow() || matchMedia('(max-width: 1279px), (max-height: 860px)').matches;
  let renderedSingle = null;
  function visibleCharts() {
    const s = S();
    if (singleMode()) return [s.mobileChart in CH ? s.mobileChart : 'seats'];
    return (DESKTOP_TABS().find(x => x[0] === s.analysisTab) || DESKTOP_TABS()[0])[2];
  }
  function cardHtml(id) {
    const c = CH[id], table = tableOn.has(id) && c.table, scroll = c.scroll?.();
    return '<section class="card chart-card" id="card-' + id + '" aria-labelledby="h-' + id + '"><div class="card-head"><div><h2 id="h-' + id + '">' + c.title() + '</h2><p class="chart-q">' + c.q() + '</p></div></div>' +
      '<div class="chart-ctl">' + c.controls() + '</div>' +
      (table ? '<div class="table-view" id="box-' + id + '">' + c.table() + '</div>' : '<div class="chart-box' + (scroll ? ' scroll' : '') + (c.html ? ' html' : '') + '" id="box-' + id + '"></div>') +
      '<div class="chart-foot">' + c.foot() + (c.table ? ' <button type="button" class="tbl-toggle" data-act="an-table" data-v="' + id + '">' + (table ? t('กลับไปดูกราฟ', 'Back to chart') : t('ดูเป็นตาราง', 'View as table')) + '</button>' : '') + '</div></section>';
  }
  // `continuing` is true when the analysis page was already on screen before this render.
  let renderedLayout = '';
  A.render = function (continuing) {
    D = E.D;
    const s = S(), single = singleMode(), vis = visibleCharts(), wide = matchMedia('(min-width: 1280px)').matches;
    renderedSingle = single;
    const tabs = single ? MOBILE_TABS().map(([id, label]) => '<button type="button" role="tab" aria-selected="' + (vis[0] === id) + '" data-act="an-set" data-k="mobileChart" data-v="' + id + '">' + label + '</button>').join('')
      : DESKTOP_TABS().map(([id, label]) => '<button type="button" role="tab" aria-selected="' + (s.analysisTab === id) + '" data-act="an-set" data-k="analysisTab" data-v="' + id + '">' + label + '</button>').join('');
    const detail = wide && s.anDetail && (s.anDetail.kind !== 'district' || s.anDetail.id === s.district) && (s.anDetail.kind !== 'brush' || s.brush) ? detailHtml(s.anDetail) : '';
    const page = document.getElementById('pageAnalysis');
    const keepScroll = page.scrollTop;
    // Same charts as before (a party highlighted, a sort or filter changed): the old drawing is kept on top as a
    // ghost and dissolves once the new one is drawn underneath, instead of the charts blanking and redrawing.
    // A different set of charts (another tab, a detail panel opening) rises into place instead.
    const layout = [single, vis.join(), detail ? s.anDetail.kind + ':' + (s.anDetail.id || '') : '', [...tableOn].join(), E.lang()].join('|');
    const old = continuing && !calm() ? page.querySelector('.an > .an-body') : null, same = layout === renderedLayout;
    renderedLayout = layout;
    page.innerHTML = '<div class="an"><div class="an-tabs' + (single ? ' many' : '') + '" role="tablist" aria-label="' + t('มุมมองการวิเคราะห์', 'Analysis views') + '">' + tabs + '</div>' +
      '<div class="an-body' + (detail ? ' with-detail' : '') + '"><div class="' + (vis.length > 1 ? 'an-grid' : 'an-single') + '">' + vis.map(cardHtml).join('') + '</div>' + (detail ? '<aside class="card an-detail" id="anDetail" aria-label="' + t('รายละเอียด', 'Details') + '">' + detail + '</aside>' : '') + '</div></div>';
    page.scrollTop = keepScroll;
    const ghost = old && same ? keepAsGhost(old) : null;
    if (old && !same) page.querySelector('.an-body').classList.add('an-enter');
    requestAnimationFrame(() => { drawAll(); if (ghost) { void getComputedStyle(ghost).opacity; ghost.classList.add('fading'); } });
    if (!ro && 'ResizeObserver' in window) { ro = new ResizeObserver(() => { clearTimeout(redrawTimer); redrawTimer = setTimeout(() => { if (S().page !== 'analysis') return; if (singleMode() !== renderedSingle) A.render(); else drawAll(); }, 120); }); ro.observe(page); }
  };
  const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  function keepAsGhost(old) {
    const an = document.querySelector('#pageAnalysis .an'), body = an.querySelector('.an-body');
    old.querySelectorAll('[id],[data-act]').forEach(e => { e.removeAttribute('id'); e.removeAttribute('data-act'); });
    old.classList.add('an-ghost'); old.classList.remove('an-enter'); old.setAttribute('aria-hidden', 'true'); old.inert = true;
    Object.assign(old.style, { top: body.offsetTop + 'px', left: body.offsetLeft + 'px', width: body.offsetWidth + 'px', height: body.offsetHeight + 'px' });
    an.append(old);
    setTimeout(() => old.remove(), 700);
    return old;
  }
  function drawAll() {
    if (S().page !== 'analysis') return;
    for (const id of visibleCharts()) {
      const el = document.getElementById('box-' + id); if (!el || tableOn.has(id) && CH[id].table) continue;
      el.innerHTML = '';
      try { CH[id].draw(el); } catch (err) { console.error(err); el.innerHTML = '<p class="empty-state">' + t('วาดกราฟไม่สำเร็จ', 'Could not draw this chart') + '</p>'; }
    }
  }
  A.reset = () => { tableOn.clear(); cmpProvince = ''; };

  function svgFor(el, w, h) {
    return d3.select(el).append('svg').attr('width', w).attr('height', h).attr('viewBox', [0, 0, w, h].join(' '));
  }
  function emptyState(el, msg) { el.innerHTML = '<p class="empty-state">' + msg + '</p>'; }
  function keyActivate(sel, fn) { sel.attr('tabindex', 0).on('keydown', (ev, d) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); fn(ev, d); } }); }

  /* ---------- A: seats ---------- */
  function seatList() {
    const s = S(), key = { total: 'totalSeats', cons: 'constituencySeats', list: 'listSeats' }[s.seatSort] || 'totalSeats';
    const list = D.seatParties.slice().sort((a, b) => b[key] - a[key] || b.totalSeats - a.totalSeats || a.name.localeCompare(b.name, 'th'));
    return s.seatTop === 'all' ? list : list.slice(0, Number(s.seatTop) || 10);
  }
  function drawSeats(el) {
    const s = S(), list = seatList(), W = el.clientWidth, H = el.clientHeight;
    const m = { t: 30, r: 44, b: 26, l: Math.min(150, Math.max(...list.map(p => textW(p.name, 12))) + 16) };
    const iw = Math.max(40, W - m.l - m.r), ih = Math.max(40, H - m.t - m.b);
    const y = d3.scaleBand(list.map(p => p.name), [0, ih]).paddingInner(0.3).paddingOuter(0.15), bh = Math.min(24, y.bandwidth()), off = (y.bandwidth() - bh) / 2;
    const x = d3.scaleLinear([0, d3.max(list, p => p.totalSeats) || 1], [0, iw]).nice();
    const svg = svgFor(el, W, H).attr('role', 'img').attr('aria-label', t('ที่นั่งรายพรรค: ', 'Seats by party: ') + list.map(p => p.name + ' ' + p.totalSeats).join(', '));
    const lg = svg.append('g').attr('transform', 'translate(' + m.l + ',8)').attr('font-size', 11.5);
    lg.append('rect').attr('width', 12).attr('height', 10).attr('rx', 2).attr('fill', '#475569');
    lg.append('text').attr('x', 17).attr('y', 9).text(t('สส.แบ่งเขต', 'Constituency')).attr('fill', '#334155');
    const lx = 22 + textW(t('สส.แบ่งเขต', 'Constituency'), 11.5) + 14;
    lg.append('rect').attr('x', lx).attr('width', 12).attr('height', 10).attr('rx', 2).attr('fill', '#47556966').attr('stroke', '#475569');
    lg.append('text').attr('x', lx + 17).attr('y', 9).text(t('บัญชีรายชื่อ (สีอ่อน)', 'Party-list (lighter)')).attr('fill', '#334155');
    const g = svg.append('g').attr('transform', 'translate(' + m.l + ',' + m.t + ')');
    g.append('g').attr('class', 'grid').call(d3.axisBottom(x).ticks(Math.max(2, Math.floor(iw / 70))).tickSize(ih).tickFormat(''));
    g.append('g').attr('class', 'axis').attr('transform', 'translate(0,' + ih + ')').call(d3.axisBottom(x).ticks(Math.max(2, Math.floor(iw / 70))));
    const rows = g.selectAll('g.row').data(list).join('g').attr('class', p => 'row mark' + (s.party && s.party !== p.name ? ' dim' : '')).attr('transform', p => 'translate(0,' + (y(p.name) + off) + ')').style('cursor', 'pointer')
      .attr('role', 'button').attr('aria-pressed', p => String(s.party === p.name)).attr('aria-label', p => p.name + ' ' + p.totalSeats + t(' ที่นั่ง: เขต ', ' seats: constituency ') + p.constituencySeats + t(' บัญชีรายชื่อ ', ', list ') + p.listSeats);
    rows.append('rect').attr('x', -m.l).attr('y', -(y.step() - bh) / 2).attr('width', m.l + iw + m.r).attr('height', y.step()).attr('fill', 'transparent');
    rows.append('rect').attr('height', bh).attr('rx', 3).attr('width', p => x(p.constituencySeats)).attr('fill', p => p.color);
    rows.append('rect').attr('height', bh).attr('rx', 3).attr('x', p => x(p.constituencySeats) + (p.constituencySeats ? 2 : 0)).attr('width', p => Math.max(0, x(p.totalSeats) - x(p.constituencySeats) - (p.constituencySeats ? 2 : 0))).attr('fill', p => p.color).attr('fill-opacity', 0.38).attr('stroke', p => p.color).attr('stroke-width', 1.2);
    rows.append('text').attr('x', -8).attr('y', bh / 2).attr('dy', '.35em').attr('text-anchor', 'end').attr('font-size', 12).attr('font-weight', p => s.party === p.name ? 700 : 500).attr('fill', '#0f172a').text(p => p.name);
    rows.append('text').attr('x', p => x(p.totalSeats) + 6).attr('y', bh / 2).attr('dy', '.35em').attr('font-size', 12).attr('font-weight', 700).attr('fill', '#0f172a').text(p => p.totalSeats);
    rows.on('pointermove', (ev, p) => E.chartTip(ev, '<b>' + esc(p.name) + '</b>' + tipRows([[t('รวม', 'Total'), p.totalSeats + ' (' + fmtP(p.totalSeats / 5, 1) + ')'], [t('สส.แบ่งเขต', 'Constituency'), p.constituencySeats], [t('บัญชีรายชื่อ', 'Party-list'), p.listSeats], [t('คะแนนบัญชีรายชื่อ', 'List votes'), fmt(p.listVotes)]]) + '<small>' + t('คลิกเพื่อไฮไลต์พรรคทุกกราฟ', 'Click to highlight this party everywhere') + '</small>'))
      .on('pointerleave', E.hideChartTip).on('click', (ev, p) => E.setState({ party: s.party === p.name ? '' : p.name }));
    keyActivate(rows, (ev, p) => E.setState({ party: s.party === p.name ? '' : p.name }));
  }
  function tableSeats() {
    return '<table><thead><tr><th>' + t('พรรค', 'Party') + '</th><th class="n">' + t('สส.เขต', 'Const.') + '</th><th class="n">' + t('บัญชีรายชื่อ', 'List') + '</th><th class="n">' + t('รวม', 'Total') + '</th><th class="n">% ' + t('ของสภา', 'of House') + '</th></tr></thead><tbody>' +
      seatList().map(p => '<tr><td>' + E.dot(p.name) + esc(p.name) + '</td><td class="n">' + p.constituencySeats + '</td><td class="n">' + p.listSeats + '</td><td class="n"><b>' + p.totalSeats + '</b></td><td class="n">' + fmtP(p.totalSeats / 5, 1) + '</td></tr>').join('') + '</tbody></table>';
  }

  /* ---------- highlight semantics shared by constituency charts ---------- */
  function highlighter() {
    const s = S(), b = brushSet();
    if (!b && !s.party && !s.province) return null;
    return r => (!b || b.has(r.id)) && (!s.party || r.winnerParty === s.party) && (!s.province || r.provinceCode === s.province);
  }
  function highlightLabel() {
    const s = S(), parts = [];
    if (s.brush) parts.push(s.brush.label);
    if (s.party) parts.push(t('ชนะโดย ', 'won by ') + s.party);
    if (s.province) parts.push(E.pname(s.province));
    return parts.join(' · ');
  }

  /* ---------- B: margin histogram ---------- */
  function marginSetup() {
    const s = S(), rows = E.scopeRows(), metric = s.marginMetric, val = r => metric === 'votes' ? r.marginVotes : r.marginPct;
    const usable = rows.filter(r => finite(val(r))), max = d3.max(usable, val) || 1;
    const step = metric === 'votes' ? d3.tickIncrement(0, max, 26) > 0 ? d3.tickIncrement(0, max, 26) : 1000 : 2.5;
    const top = Math.ceil(max / step) * step || step, edges = d3.range(0, top + step / 2, step);
    const bins = d3.bin().value(val).domain([0, top]).thresholds(edges.slice(1, -1))(usable);
    return { rows: usable, val, step, top, bins, metric };
  }
  function setMarginBrush(a, b) {
    const { rows, val, top, metric } = marginSetup();
    const ids = rows.filter(r => val(r) >= a && (val(r) < b || (b >= top && val(r) <= b))).map(r => r.id);
    const unit = metric === 'votes' ? t(' คะแนน', ' votes') : '%';
    E.setState({ brush: { source: 'margin', metric, range: [a, b], ids, label: t('ส่วนต่าง ', 'Margin ') + fmt(a) + '–' + (metric === 'votes' ? fmt(b) : +b.toFixed(1)) + unit } });
  }
  function drawMargin(el) {
    const s = S(), { rows, val, step, top, bins, metric } = marginSetup(), W = el.clientWidth, H = el.clientHeight;
    if (!rows.length) return emptyState(el, t('ไม่มีเขตในตัวกรองนี้', 'No constituencies in this filter'));
    const m = { t: 22, r: 14, b: 42, l: 40 }, iw = W - m.l - m.r, ih = H - m.t - m.b;
    const hl = highlighter(), x = d3.scaleLinear([0, top], [0, iw]), y = d3.scaleLinear([0, d3.max(bins, b => b.length) || 1], [ih, 0]).nice();
    const svg = svgFor(el, W, H).attr('role', 'img').attr('aria-label', t('ฮิสโทแกรมส่วนต่างคะแนนของ ', 'Histogram of victory margins for ') + rows.length + t(' เขต', ' constituencies'));
    const g = svg.append('g').attr('transform', 'translate(' + m.l + ',' + m.t + ')');
    g.append('g').attr('class', 'grid').call(d3.axisLeft(y).ticks(5).tickSize(-iw).tickFormat(''));
    g.append('g').attr('class', 'axis').call(d3.axisLeft(y).ticks(5));
    g.append('g').attr('class', 'axis').attr('transform', 'translate(0,' + ih + ')').call(d3.axisBottom(x).ticks(Math.max(3, Math.floor(iw / 60))).tickFormat(v => metric === 'votes' ? d3.format('~s')(v) : v + '%'));
    g.append('text').attr('class', 'axis-title').attr('x', iw).attr('y', ih + 34).attr('text-anchor', 'end').text(metric === 'votes' ? t('ส่วนต่างคะแนน (คะแนน)', 'Victory margin (votes)') : t('ส่วนต่างคะแนน (% ของบัตรดีแบบแบ่งเขต)', 'Victory margin (% of valid constituency ballots)'));
    g.append('text').attr('class', 'axis-title').attr('x', -m.l + 2).attr('y', -10).text(t('จำนวนเขต', 'Constituencies')).attr('font-size', 11);
    const color = s.party && !s.brush ? E.D.colorOf(s.party) : ACCENT;
    const bars = g.append('g').selectAll('g').data(bins).join('g').attr('class', 'mark');
    bars.append('rect').attr('x', b => x(b.x0) + 1).attr('width', b => Math.max(1, x(b.x1) - x(b.x0) - 2)).attr('y', b => y(b.length)).attr('height', b => ih - y(b.length)).attr('rx', 2).attr('fill', hl ? MUTED_BAR : ACCENT);
    if (hl) bars.append('rect').attr('x', b => x(b.x0) + 1).attr('width', b => Math.max(1, x(b.x1) - x(b.x0) - 2)).attr('y', b => y(b.filter(hl).length)).attr('height', b => ih - y(b.filter(hl).length)).attr('rx', 2).attr('fill', color);
    const cur = s.district && rows.find(r => r.id === s.district);
    if (cur) {
      const cx = x(val(cur));
      g.append('line').attr('x1', cx).attr('x2', cx).attr('y1', 0).attr('y2', ih).attr('stroke', '#0f172a').attr('stroke-width', 1.5);
      g.append('path').attr('d', d3.symbol(d3.symbolTriangle, 70)()).attr('transform', 'translate(' + cx + ',' + (ih + 7) + ')').attr('fill', '#0f172a');
      g.append('text').attr('x', Math.min(iw - 4, cx + 5)).attr('y', 10).attr('font-size', 11).attr('text-anchor', cx > iw - 90 ? 'end' : 'start').attr('fill', '#0f172a').text(shortName(cur));
    }
    const brush = d3.brushX().extent([[0, 0], [iw, ih]]);
    const bg = g.append('g').attr('class', 'brush').call(brush);
    if (s.brush && s.brush.source === 'margin' && s.brush.metric === metric) bg.call(brush.move, [x(s.brush.range[0]), x(Math.min(top, s.brush.range[1]))]);
    brush.on('end', ev => {
      if (!ev.sourceEvent) return;
      if (!ev.selection) {
        const [px] = d3.pointer(ev.sourceEvent, g.node()), v = x.invert(px), bin = bins.find(b => v >= b.x0 && v < b.x1);
        if (bin && !(s.brush?.source === 'margin' && s.brush.range[0] === bin.x0 && s.brush.range[1] === bin.x1)) setMarginBrush(bin.x0, bin.x1);
        else if (s.brush?.source === 'margin') E.setState({ brush: null });
        return;
      }
      const [a, b] = ev.selection.map(x.invert), lo = Math.max(0, Math.floor(a / step) * step), hi = Math.min(top, Math.max(lo + step, Math.ceil(b / step) * step));
      setMarginBrush(lo, hi);
    });
    bg.on('pointermove.tip', ev => {
      const [px] = d3.pointer(ev, g.node()), v = x.invert(px), bin = bins.find(b => v >= b.x0 && v < b.x1);
      if (!bin) return E.hideChartTip();
      const closest = bin.slice().sort((a, b) => val(a) - val(b)).slice(0, 3);
      const unit = metric === 'votes' ? '' : '%';
      E.chartTip(ev, '<b>' + fmt(bin.x0) + '–' + (metric === 'votes' ? fmt(bin.x1) : +bin.x1.toFixed(1)) + unit + '</b>' + tipRows([[t('จำนวนเขต', 'Constituencies'), bin.length]].concat(hl ? [[highlightLabel(), bin.filter(hl).length]] : [])) + (closest.length ? '<small>' + closest.map(r => esc(shortName(r)) + ' (' + (metric === 'votes' ? fmt(val(r)) : fmtP(val(r), 1)) + ')').join(', ') + '</small><br>' : '') + '<small>' + t('คลิกเพื่อเลือกช่วงนี้ · ลากเพื่อเลือกหลายช่วง', 'Click to select this bin · drag for a range') + '</small>');
    }).on('pointerleave.tip', E.hideChartTip);
  }
  function tableMargin() {
    const { bins, metric } = marginSetup(), hl = highlighter();
    return '<table><thead><tr><th>' + t('ช่วงส่วนต่าง', 'Margin range') + '</th><th class="n">' + t('จำนวนเขต', 'Constituencies') + '</th>' + (hl ? '<th class="n">' + esc(highlightLabel()) + '</th>' : '') + '</tr></thead><tbody>' +
      bins.map(b => '<tr><td>' + fmt(b.x0) + '–' + (metric === 'votes' ? fmt(b.x1) : +b.x1.toFixed(1)) + (metric === 'votes' ? '' : '%') + '</td><td class="n">' + b.length + '</td>' + (hl ? '<td class="n">' + b.filter(hl).length + '</td>' : '') + '</tr>').join('') + '</tbody></table>';
  }

  /* ---------- C: turnout vs margin scatter ---------- */
  function drawScatter(el) {
    const s = S(), rows = E.scopeRows().filter(r => finite(r.turnoutPct) && finite(r.marginPct)), W = el.clientWidth, H = el.clientHeight;
    if (!rows.length) return emptyState(el, t('ไม่มีเขตในตัวกรองนี้', 'No constituencies in this filter'));
    const yRoom = yTitleRoom(d3.scaleLinear([0, d3.max(rows, r => r.marginPct)]).nice());
    const m = { t: 12, r: 16, b: 40, l: yRoom.left }, iw = W - m.l - m.r, ih = H - m.t - m.b;
    const x = d3.scaleLinear(d3.extent(rows, r => r.turnoutPct), [0, iw]).nice(), y = d3.scaleLinear([0, d3.max(rows, r => r.marginPct)], [ih, 0]).nice();
    const hl = highlighter(), colorOf = r => s.scatterColor === 'region' ? REGION_COLORS[r.region] || '#94a3b8' : E.D.colorOf(r.winnerParty);
    const svg = svgFor(el, W, H).attr('role', 'img').attr('aria-label', t('กราฟกระจายอัตราการใช้สิทธิกับส่วนต่างคะแนน ', 'Scatterplot of turnout versus margin, ') + rows.length + t(' เขต', ' constituencies'));
    const g = svg.append('g').attr('transform', 'translate(' + m.l + ',' + m.t + ')');
    g.append('g').attr('class', 'grid').call(d3.axisLeft(y).ticks(5).tickSize(-iw).tickFormat(''));
    g.append('g').attr('class', 'grid').attr('transform', 'translate(0,' + ih + ')').call(d3.axisBottom(x).ticks(6).tickSize(-ih).tickFormat(''));
    g.append('g').attr('class', 'axis').call(d3.axisLeft(y).ticks(5).tickFormat(v => v + '%'));
    g.append('g').attr('class', 'axis').attr('transform', 'translate(0,' + ih + ')').call(d3.axisBottom(x).ticks(6).tickFormat(v => v + '%'));
    g.append('text').attr('class', 'axis-title').attr('x', iw).attr('y', ih + 34).attr('text-anchor', 'end').text(t('อัตราการใช้สิทธิ (ผู้มาใช้สิทธิ ÷ ผู้มีสิทธิ)', 'Turnout (voters ÷ eligible)'));
    g.append('text').attr('class', 'axis-title').attr('transform', 'rotate(-90)').attr('x', 0).attr('y', yRoom.title).attr('text-anchor', 'end').text(t('ส่วนต่างคะแนน (%)', 'Victory margin (%)'));
    const ordered = rows.slice().sort((a, b) => (hl ? hl(a) - hl(b) : 0));
    g.append('g').selectAll('circle').data(ordered).join('circle').attr('class', r => 'mark' + (hl && !hl(r) ? ' dim' : '')).attr('cx', r => x(r.turnoutPct)).attr('cy', r => y(r.marginPct)).attr('r', 4.3).attr('fill', colorOf).attr('stroke', '#fff').attr('stroke-width', 1);
    const cur = s.district && rows.find(r => r.id === s.district);
    if (cur) g.append('circle').attr('cx', x(cur.turnoutPct)).attr('cy', y(cur.marginPct)).attr('r', 8.5).attr('fill', 'none').attr('stroke', '#0f172a').attr('stroke-width', 2.5).attr('pointer-events', 'none');
    const ring = g.append('circle').attr('r', 7.5).attr('fill', 'none').attr('stroke', '#0f172a').attr('stroke-width', 1.5).attr('pointer-events', 'none').attr('opacity', 0);
    // legend (top parties or regions), direct and selective
    const counts = d3.rollups(rows, v => v.length, r => s.scatterColor === 'region' ? r.region : r.winnerParty).sort((a, b) => b[1] - a[1]);
    const items = counts.slice(0, 6).map(([k, n]) => [k, n, s.scatterColor === 'region' ? REGION_COLORS[k] : E.D.colorOf(k)]);
    const lg = g.append('g').attr('font-size', 11).attr('pointer-events', 'none');
    let ly = 4;
    items.forEach(([k, n, c]) => { const label = (s.scatterColor === 'region' ? E.rname(k) : k) + ' ' + n; const w = textW(label, 11) + 22; lg.append('rect').attr('x', iw - w - 2).attr('y', ly - 2).attr('width', w + 4).attr('height', 17).attr('fill', '#ffffffd9'); lg.append('circle').attr('cx', iw - w + 6).attr('cy', ly + 6.5).attr('r', 4.5).attr('fill', c); lg.append('text').attr('x', iw - w + 15).attr('y', ly + 10.5).attr('fill', '#334155').text(label); ly += 17; });
    if (counts.length > 6) lg.append('text').attr('x', iw).attr('y', ly + 10).attr('text-anchor', 'end').attr('fill', '#64748b').text(t('+ อีก ', '+ ') + (counts.length - 6) + t(' กลุ่ม', ' more'));
    const delaunay = d3.Delaunay.from(rows, r => x(r.turnoutPct), r => y(r.marginPct));
    const nearest = (px, py) => { const i = delaunay.find(px, py), r = rows[i]; return r && Math.hypot(x(r.turnoutPct) - px, y(r.marginPct) - py) <= 24 ? r : null; };
    const brush = d3.brush().extent([[0, 0], [iw, ih]]);
    const bg = g.append('g').attr('class', 'brush').call(brush);
    if (s.brush && s.brush.source === 'scatter') { const [[a, b], [c, d]] = s.brush.rect; bg.call(brush.move, [[x(a), y(d)], [x(c), y(b)]]); }
    brush.on('end', ev => {
      if (!ev.sourceEvent) return;
      if (!ev.selection) {
        const [px, py] = d3.pointer(ev.sourceEvent, g.node()), r = nearest(px, py);
        if (r) { E.setState({ district: r.id }); A.showDetail(r.id); }
        else if (s.brush?.source === 'scatter') E.setState({ brush: null });
        return;
      }
      const [[x0, y0], [x1, y1]] = ev.selection, tx = [x.invert(x0), x.invert(x1)], my = [y.invert(y1), y.invert(y0)];
      const ids = rows.filter(r => r.turnoutPct >= tx[0] && r.turnoutPct <= tx[1] && r.marginPct >= my[0] && r.marginPct <= my[1]).map(r => r.id);
      E.setState({ brush: { source: 'scatter', rect: [[tx[0], my[0]], [tx[1], my[1]]], ids, label: t('ใช้สิทธิ ', 'Turnout ') + tx[0].toFixed(1) + '–' + tx[1].toFixed(1) + '% · ' + t('ส่วนต่าง ', 'margin ') + my[0].toFixed(1) + '–' + my[1].toFixed(1) + '%' } });
    });
    bg.on('pointermove.tip', ev => {
      const [px, py] = d3.pointer(ev, g.node()), r = nearest(px, py);
      if (!r) { ring.attr('opacity', 0); E.hideChartTip(); return; }
      ring.attr('cx', x(r.turnoutPct)).attr('cy', y(r.marginPct)).attr('opacity', 1);
      E.chartTip(ev, '<b>' + esc(E.ptitle(E.D.provinceByCode.get(r.provinceCode))) + ' · ' + t('เขต ', 'No. ') + r.number + '</b>' + tipRows([[t('ผู้ชนะ', 'Winner'), esc(r.winnerName)], [t('พรรค', 'Party'), E.dot(r.winnerParty) + esc(r.winnerParty)], [t('อัตราการใช้สิทธิ', 'Turnout'), fmtP(r.turnoutPct)], [t('ส่วนต่าง', 'Margin'), fmtP(r.marginPct) + ' (' + fmt(r.marginVotes) + ')'], [t('อันดับสอง', 'Runner-up'), esc(r.runner?.party || '—')]]) + '<small>' + t('คลิกเพื่อดูรายละเอียด', 'Click for details') + '</small>');
    }).on('pointerleave.tip', () => { ring.attr('opacity', 0); E.hideChartTip(); });
  }
  function tableScatter() {
    const rows = E.scopeRows().slice().sort((a, b) => a.marginPct - b.marginPct), hl = highlighter();
    return '<table><thead><tr><th>' + t('เขต', 'Constituency') + '</th><th>' + t('พรรคผู้ชนะ', 'Winner') + '</th><th class="n">' + t('ใช้สิทธิ', 'Turnout') + '</th><th class="n">' + t('ส่วนต่าง', 'Margin') + '</th></tr></thead><tbody>' +
      rows.filter(r => !hl || hl(r)).map(r => '<tr><td><button type="button" class="tbl-toggle" data-act="district" data-v="' + r.id + '">' + esc(E.dname(r)) + '</button></td><td>' + E.dot(r.winnerParty) + esc(r.winnerParty) + '</td><td class="n">' + fmtP(r.turnoutPct) + '</td><td class="n">' + fmtP(r.marginPct) + '</td></tr>').join('') + '</tbody></table>';
  }

  /* ---------- D: two-ballot dumbbell ---------- */
  function ballotData() {
    const s = S(), scope = E.scopeRows(), votes = s.ballotUnit === 'votes';
    if (s.ballotMode === 'party') {
      const names = D.principal.map(p => p.name); if (s.party && !names.includes(s.party)) names.push(s.party);
      const data = names.map(name => D.pairedBallots(scope, name)).filter(d => d.n > 0).map(d => ({ key: d.party, label: d.party, party: d.party, a: votes ? d.candidateVotes : d.candidateShare, b: votes ? d.listVotes : d.listShare, gap: votes ? d.voteGap : d.ppGap, d }));
      const k = s.ballotSort === 'list' ? 'b' : s.ballotSort === 'cand' ? 'a' : 'gap';
      return { rows: data.sort((p, q) => q[k] - p[k]), missing: 0, total: data.length };
    }
    const b = brushSet(), base = scope.filter(r => !b || b.has(r.id));
    const all = base.map(r => { const c = D.comparison(r, s.party || ''); return { key: r.id, label: shortName(r), r, party: c.party, a: votes ? c.candidateVotes : c.candidateShare, b: votes ? c.listVotes : c.listShare, gap: votes ? c.voteGap : c.ppGap, c }; });
    const ok = all.filter(x => finite(x.gap) && finite(x.a) && finite(x.b));
    const sorter = { gap: (p, q) => q.gap - p.gap, gapAsc: (p, q) => p.gap - q.gap, abs: (p, q) => Math.abs(q.gap) - Math.abs(p.gap) }[s.ballotSort] || ((p, q) => q.gap - p.gap);
    ok.sort(sorter);
    return { rows: s.ballotTop === 'all' ? ok : ok.slice(0, Number(s.ballotTop) || 15), missing: all.length - ok.length, total: all.length, available: ok.length };
  }
  function ballotFoot() {
    const s = S(), { missing, total, available } = ballotData();
    const legend = '<span>● ' + t('บัตรผู้สมัคร (แบ่งเขต)', 'Candidate (constituency) ballot') + ' &nbsp;○ ' + t('บัตรพรรค (บัญชีรายชื่อ)', 'Party-list ballot') + ' &nbsp;' + t('ส่วนต่างคือบัญชีรายชื่อลบผู้สมัคร', 'gap is list minus candidate') + (s.ballotUnit === 'share' ? t(' (จุดเปอร์เซ็นต์)', ' (percentage points)') : '') + '</span>';
    if (s.ballotMode === 'party') return legend + '<span>' + t('รวมเฉพาะเขตที่พรรคส่งผู้สมัคร แต่ละบัตรใช้ตัวหารบัตรดีของตนเอง', 'Only constituencies where the party fielded a candidate; each ballot uses its own valid-ballot denominator') + '</span>';
    return legend + '<span>' + t('แสดง ', 'Showing ') + Math.min(available, s.ballotTop === 'all' ? available : Number(s.ballotTop)) + '/' + available + t(' เขตที่เทียบได้', ' comparable') + (missing ? ' ' + t('ไม่มีผู้สมัครของพรรคหรือข้อมูลไม่ครบ ', 'no party candidate or incomplete data in ') + missing + '/' + total + t(' เขต (ไม่แทนด้วยศูนย์)', ' (not treated as zero)') : '') + '</span>';
  }
  function drawBallots(el) {
    const s = S(), { rows } = ballotData(), W = el.clientWidth, votes = s.ballotUnit === 'votes';
    if (!rows.length) return emptyState(el, t('ไม่มีข้อมูลที่เทียบได้ในขอบเขตนี้', 'Nothing comparable in this scope'));
    // Rows keep a readable height; when the card is short the chart scrolls inside its own box.
    const H = Math.max(el.clientHeight, rows.length * 26 + 50);
    const m = { t: 10, r: 70, b: 32, l: Math.min(170, Math.max(...rows.map(d => textW(d.label, 12))) + 16) }, iw = W - m.l - m.r, ih = H - m.t - m.b;
    const x = d3.scaleLinear([0, d3.max(rows, d => Math.max(d.a, d.b)) || 1], [0, iw]).nice(), y = d3.scaleBand(rows.map(d => d.key), [0, ih]).padding(0.25);
    const svg = svgFor(el, W, H).attr('role', 'img').attr('aria-label', t('ดัมเบลเปรียบเทียบคะแนนผู้สมัครกับบัญชีรายชื่อ', 'Dumbbell comparing candidate and party-list votes'));
    const g = svg.append('g').attr('transform', 'translate(' + m.l + ',' + m.t + ')');
    g.append('g').attr('class', 'grid').call(d3.axisBottom(x).ticks(Math.max(2, Math.floor(iw / 80))).tickSize(ih).tickFormat(''));
    g.append('g').attr('class', 'axis').attr('transform', 'translate(0,' + ih + ')').call(d3.axisBottom(x).ticks(Math.max(2, Math.floor(iw / 80))).tickFormat(v => votes ? d3.format('~s')(v) : v + '%'));
    const hl = s.ballotMode === 'district' ? highlighter() : null;
    const row = g.selectAll('g.row').data(rows).join('g').attr('class', d => 'row mark' + ((s.ballotMode === 'party' && s.party && s.party !== d.party) || (hl && d.r && !hl(d.r) && !s.brush) ? ' dim' : '')).attr('transform', d => 'translate(0,' + (y(d.key) + y.bandwidth() / 2) + ')').style('cursor', 'pointer').attr('role', 'button')
      .attr('aria-label', d => d.label + ': ' + t('ผู้สมัคร ', 'candidate ') + (votes ? fmt(d.a) : fmtP(d.a)) + ', ' + t('บัญชีรายชื่อ ', 'list ') + (votes ? fmt(d.b) : fmtP(d.b)));
    row.append('rect').attr('x', -m.l).attr('y', -y.step() / 2).attr('width', W).attr('height', y.step()).attr('fill', d => s.district && d.key === s.district ? '#e0f2fe' : 'transparent');
    row.append('text').attr('x', -8).attr('dy', '.35em').attr('text-anchor', 'end').attr('font-size', 12).attr('fill', '#0f172a').attr('font-weight', d => d.key === s.district || d.party === s.party && s.ballotMode === 'party' ? 700 : 500).text(d => d.label);
    row.append('line').attr('x1', d => x(Math.min(d.a, d.b))).attr('x2', d => x(Math.max(d.a, d.b))).attr('stroke', '#94a3b8').attr('stroke-width', 2.5).attr('stroke-linecap', 'round');
    row.append('circle').attr('cx', d => x(d.a)).attr('r', 6).attr('fill', d => E.D.colorOf(d.party)).attr('stroke', '#fff').attr('stroke-width', 2);
    row.append('circle').attr('cx', d => x(d.b)).attr('r', 5.5).attr('fill', '#fff').attr('stroke', d => E.D.colorOf(d.party)).attr('stroke-width', 2.5);
    row.append('text').attr('x', d => x(Math.max(d.a, d.b)) + 10).attr('dy', '.35em').attr('font-size', 11.5).attr('font-weight', 600).attr('fill', '#334155').text(d => votes ? fmtPP(d.gap, 0) : fmtPP(d.gap, 1) + (s.ballotMode === 'party' ? ' pp' : ''));
    row.on('pointermove', (ev, d) => E.chartTip(ev, '<b>' + esc(d.r ? E.dname(d.r) : d.label) + '</b>' + (d.r ? '<br><small>' + E.dot(d.party) + esc(d.party) + (s.party ? '' : t(' (พรรคผู้ชนะ)', ' (winner)')) + '</small>' : '') + tipRows([[t('● ผู้สมัคร', '● Candidate'), (votes ? fmt(d.a) : fmtP(d.a))], [t('○ บัญชีรายชื่อ', '○ Party-list'), (votes ? fmt(d.b) : fmtP(d.b))], [t('ส่วนต่าง', 'Gap'), votes ? fmtPP(d.gap, 0) : fmtPP(d.gap) + ' pp']].concat(d.d ? [[t('เขตที่ส่งผู้สมัคร', 'Constituencies contested'), d.d.n]] : [])) + '<small>' + (d.r ? t('คลิกเพื่อดูรายละเอียดเขต', 'Click for constituency details') : t('คลิกเพื่อดูรายเขตของพรรคนี้', 'Click to see this party by constituency')) + '</small>'))
      .on('pointerleave', E.hideChartTip)
      .on('click', (ev, d) => { E.hideChartTip(); if (d.r) { E.setState({ district: d.r.id }); A.showDetail(d.r.id); } else E.setState({ party: d.party, ballotMode: 'district', ballotSort: 'abs' }); });
    keyActivate(row, (ev, d) => { if (d.r) { E.setState({ district: d.r.id }); A.showDetail(d.r.id); } else E.setState({ party: d.party, ballotMode: 'district', ballotSort: 'abs' }); });
  }
  function tableBallots() {
    const s = S(), { rows } = ballotData(), votes = s.ballotUnit === 'votes';
    return '<table><thead><tr><th>' + (s.ballotMode === 'party' ? t('พรรค', 'Party') : t('เขต', 'Constituency')) + '</th><th class="n">' + t('ผู้สมัคร', 'Candidate') + '</th><th class="n">' + t('บัญชีรายชื่อ', 'List') + '</th><th class="n">' + t('ส่วนต่าง', 'Gap') + '</th></tr></thead><tbody>' +
      rows.map(d => '<tr><td>' + E.dot(d.party) + esc(d.r ? E.dname(d.r) : d.label) + '</td><td class="n">' + (votes ? fmt(d.a) : fmtP(d.a)) + '</td><td class="n">' + (votes ? fmt(d.b) : fmtP(d.b)) + '</td><td class="n">' + (votes ? fmtPP(d.gap, 0) : fmtPP(d.gap) + ' pp') + '</td></tr>').join('') + '</tbody></table>';
  }

  /* ---------- regional heatmap (HTML table: the table view is the chart) ---------- */
  function heatValue(g, party) {
    const m = S().heatMetric, seats = g.seats.find(x => x.party === party)?.count || 0;
    if (m === 'seats') return { v: seats, text: String(seats), num: seats, den: g.count };
    if (m === 'seatShare') return { v: seats / g.count * 100, text: fmtP(seats / g.count * 100, 1), num: seats, den: g.count };
    const sh = D.share(g, party, m === 'list' ? 'partyList' : 'constituency');
    return { v: sh.value, text: fmtP(sh.value, 1), num: sh.votes, den: sh.denominator };
  }
  function drawRegion(el) {
    const s = S(), parties = D.principal.map(p => p.name); if (s.party && !parties.includes(s.party)) parties.push(s.party);
    const nat = Object.assign({}, D.national, { name: '__all', count: D.rows.length });
    let regs = D.regions.slice();
    if (s.heatSort === 'party' && s.party) regs.sort((a, b) => (heatValue(b, s.party).v || 0) - (heatValue(a, s.party).v || 0));
    const all = [...regs, nat], max = d3.max(all, g => d3.max(parties, p => heatValue(g, p).v)) || 1;
    const color = v => finite(v) ? E.ramps.teal(0.04 + 0.86 * v / max) : '#f1f5f9';   // a party-free hue (see RAMPS in e69-app.js)
    const ink = v => finite(v) && v / max > 0.55 ? '#fff' : '#0f172a';
    el.innerHTML = '<div class="heat-wrap"><table class="heat"><thead><tr><th scope="col"><span class="heat-corner">' + t('ภูมิภาค \\ พรรค', 'Region \\ party') + '</span></th>' + parties.map(p => '<th scope="col"><button type="button" data-act="party" data-v="' + esc(p) + '" aria-pressed="' + (s.party === p) + '" class="' + (s.party === p ? 'on' : '') + '">' + E.dot(p) + esc(p) + '</button></th>').join('') + '</tr></thead><tbody>' +
      all.map(g => '<tr class="' + (g.name === '__all' ? 'nat' : '') + (s.region === g.name ? ' on' : '') + '"><th scope="row">' + (g.name === '__all' ? t('ทั้งประเทศ', 'Nationwide') : '<button type="button" data-act="an-region" data-v="' + esc(g.name) + '" aria-pressed="' + (s.region === g.name) + '">' + esc(E.rname(g.name)) + ' <small>' + g.count + t(' เขต', '') + '</small></button>') + '</th>' +
        parties.map(p => { const h = heatValue(g, p); return '<td class="' + (s.party === p ? 'colon' : '') + '" style="background:' + color(h.v) + ';color:' + ink(h.v) + '">' + (g.name === '__all' ? '<span>' + h.text + '</span>' : '<button type="button" data-act="an-cell" data-v="' + esc(g.name) + '" data-p="' + esc(p) + '" title="' + esc(E.rname(g.name) + ' · ' + p + ': ' + h.text + ' (' + fmt(h.num) + ' / ' + fmt(h.den) + ')') + '">' + h.text + '</button>') + '</td>'; }).join('') + '</tr>').join('') +
      '</tbody></table></div>' + regionDetail();
  }
  function regionDetail() {
    const s = S(); if (!s.region) return '<p class="caveat heat-detail">' + t('เลือกภูมิภาค (คลิกชื่อแถวหรือช่อง) เพื่อดูรายจังหวัด', 'Pick a region (row header or cell) to see its provinces') + '</p>';
    const g = D.regions.find(r => r.name === s.region); if (!g) return '';
    const m = s.heatMetric, party = s.party || g.seats[0]?.party;
    const provs = g.provinces.map(code => D.provinceByCode.get(code)).map(p => ({ p, h: heatValue(p, party) })).sort((a, b) => (b.h.v || 0) - (a.h.v || 0));
    const max = d3.max(provs, x => x.h.v) || 1;
    return '<div class="heat-detail"><h3>' + esc(E.rname(g.name)) + ' · ' + E.dot(party) + esc(party) + (s.party ? '' : t(' (พรรคที่ชนะเขตมากที่สุดในภูมิภาค)', ' (party with most seats in region)')) + ' · ' + esc({ list: t('สัดส่วนบัญชีรายชื่อ', 'list share'), cand: t('สัดส่วนผู้สมัคร', 'candidate share'), seats: t('เขตที่ชนะ', 'seats won'), seatShare: t('สัดส่วนเขตที่ชนะ', 'share of seats') }[m]) + '</h3><ol class="prov-bars">' +
      provs.map(({ p, h }) => '<li><button type="button" data-act="province" data-v="' + p.code + '"><span>' + esc(E.pname(p)) + '</span><span class="bar"><i style="width:' + (100 * (h.v || 0) / max) + '%;--c:' + esc(D.colorOf(party)) + '"></i></span><b>' + h.text + '</b></button></li>').join('') + '</ol></div>';
  }

  /* ---------- density scatter (province level) ---------- */
  function densityParty() { const s = S(); return s.party || s.densityParty || D.seatParties[0].name; }
  function densityRows() {
    const s = S(), party = densityParty();
    return D.provinces.filter(p => !s.region || p.region === s.region).map(p => ({ p, density: p.density, share: D.share(p, party, s.densityBallot).value, eligible: p.eligible.value })).filter(d => finite(d.density) && d.density > 0 && finite(d.share));
  }
  function densityFoot() {
    const s = S(), rows = densityRows(), xs = rows.map(d => s.densityScale === 'log' ? Math.log10(d.density) : d.density), r = pearson(xs, rows.map(d => d.share));
    return '<span>r = <b>' + (r === null ? '—' : r.toFixed(2)) + '</b> (' + (s.densityScale === 'log' ? 'log₁₀ ' : '') + t('ความหนาแน่น, n = ', 'density, n = ') + rows.length + t(' จังหวัด', ' provinces') + ') ' + t('ข้อมูลระดับจังหวัด ไม่ใช่ความหนาแน่นรายเขต และไม่บอกพฤติกรรมรายบุคคล ความสัมพันธ์ไม่ใช่เหตุและผล', 'Province-level data, not constituency density; it says nothing about individuals, and correlation is not causation.') + '</span>';
  }
  function drawDensity(el) {
    const s = S(), rows = densityRows(), party = densityParty(), W = el.clientWidth, H = el.clientHeight;
    if (!rows.length) return emptyState(el, t('ไม่มีข้อมูลจังหวัดในตัวกรองนี้', 'No provinces in this filter'));
    const yRoom = yTitleRoom(d3.scaleLinear([0, d3.max(rows, d => d.share) * 1.08 || 1]).nice());
    const m = { t: 14, r: 18, b: 40, l: yRoom.left }, iw = W - m.l - m.r, ih = H - m.t - m.b;
    const ext = d3.extent(rows, d => d.density), x = s.densityScale === 'log' ? d3.scaleLog([ext[0] * 0.85, ext[1] * 1.15], [0, iw]) : d3.scaleLinear([0, ext[1] * 1.05], [0, iw]);
    const y = d3.scaleLinear([0, d3.max(rows, d => d.share) * 1.08 || 1], [ih, 0]).nice(), rad = d3.scaleSqrt([0, d3.max(rows, d => d.eligible)], [3, 13]);
    const svg = svgFor(el, W, H).attr('role', 'img').attr('aria-label', t('กราฟกระจายความหนาแน่นประชากรกับสัดส่วนคะแนน ', 'Density versus vote share for ') + party);
    const g = svg.append('g').attr('transform', 'translate(' + m.l + ',' + m.t + ')');
    const xt = s.densityScale === 'log' ? [20, 50, 100, 200, 500, 1000, 2000, 5000].filter(v => v >= x.domain()[0] && v <= x.domain()[1]) : x.ticks(6);
    g.append('g').attr('class', 'grid').call(d3.axisLeft(y).ticks(5).tickSize(-iw).tickFormat(''));
    g.append('g').attr('class', 'axis').call(d3.axisLeft(y).ticks(5).tickFormat(v => v + '%'));
    g.append('g').attr('class', 'axis').attr('transform', 'translate(0,' + ih + ')').call(d3.axisBottom(x).tickValues(xt).tickFormat(d3.format(',')));
    g.append('text').attr('class', 'axis-title').attr('x', iw).attr('y', ih + 34).attr('text-anchor', 'end').text(t('ความหนาแน่นประชากร (คน/ตร.กม., ', 'Population density (people/km², ') + (s.densityScale === 'log' ? t('สเกลลอการิทึม', 'log scale') : t('สเกลเชิงเส้น', 'linear')) + ')');
    g.append('text').attr('class', 'axis-title').attr('transform', 'rotate(-90)').attr('y', yRoom.title).attr('text-anchor', 'end').text(party + ' · ' + (s.densityBallot === 'partyList' ? t('สัดส่วนบัญชีรายชื่อ', 'list share') : t('สัดส่วนผู้สมัคร', 'candidate share')));
    const sorted = rows.slice().sort((a, b) => b.eligible - a.eligible);
    g.append('g').selectAll('circle').data(sorted).join('circle').attr('class', d => 'mark' + (s.province && s.province !== d.p.code ? ' dim' : '')).attr('cx', d => x(d.density)).attr('cy', d => y(d.share)).attr('r', d => rad(d.eligible)).attr('fill', d => REGION_COLORS[d.p.region]).attr('fill-opacity', 0.78).attr('stroke', '#fff').attr('stroke-width', 1.5);
    const labelled = new Set([s.province, d3.greatest(rows, d => d.share)?.p.code, d3.least(rows, d => d.share)?.p.code, d3.greatest(rows, d => d.density)?.p.code].filter(Boolean));
    g.append('g').selectAll('text').data(rows.filter(d => labelled.has(d.p.code))).join('text').attr('x', d => x(d.density) + rad(d.eligible) + 4).attr('y', d => y(d.share) + 4).attr('font-size', 11).attr('font-weight', d => d.p.code === s.province ? 700 : 500).attr('fill', '#0f172a').attr('text-anchor', d => x(d.density) > iw - 110 ? 'end' : 'start').attr('dx', d => x(d.density) > iw - 110 ? -2 * rad(d.eligible) - 8 : 0).text(d => E.pname(d.p)).attr('pointer-events', 'none');
    const regs = [...new Set(rows.map(d => d.p.region))];
    const lg = g.append('g').attr('font-size', 11).attr('pointer-events', 'none');
    regs.forEach((k, i) => { lg.append('circle').attr('cx', 6).attr('cy', 6 + i * 16).attr('r', 4.5).attr('fill', REGION_COLORS[k]); lg.append('text').attr('x', 15).attr('y', 10 + i * 16).attr('fill', '#334155').text(E.rname(k)); });
    const delaunay = d3.Delaunay.from(rows, d => x(d.density), d => y(d.share)), ring = g.append('circle').attr('fill', 'none').attr('stroke', '#0f172a').attr('stroke-width', 2).attr('opacity', 0).attr('pointer-events', 'none');
    const hit = g.append('rect').attr('width', iw).attr('height', ih).attr('fill', 'transparent');
    const near = ev => { const [px, py] = d3.pointer(ev, g.node()), d = rows[delaunay.find(px, py)]; return d && Math.hypot(x(d.density) - px, y(d.share) - py) <= Math.max(24, rad(d.eligible) + 6) ? d : null; };
    hit.on('pointermove', ev => { const d = near(ev); if (!d) { ring.attr('opacity', 0); E.hideChartTip(); return; } ring.attr('cx', x(d.density)).attr('cy', y(d.share)).attr('r', rad(d.eligible) + 3).attr('opacity', 1); E.chartTip(ev, '<b>' + esc(E.ptitle(d.p)) + '</b><br><small>' + esc(E.rname(d.p.region)) + '</small>' + tipRows([[t('ความหนาแน่น (', 'Density (') + (d.p.densityYear || '—') + ')', fmt(d.density) + t(' คน/ตร.กม.', ' /km²')], [esc(party), fmtP(d.share)], [t('ผู้มีสิทธิ', 'Eligible'), fmt(d.eligible)]]) + '<small>' + t('คลิกเพื่อเลือกจังหวัด', 'Click to select the province') + '</small>'); })
      .on('pointerleave', () => { ring.attr('opacity', 0); E.hideChartTip(); })
      .on('click', ev => { const d = near(ev); if (d) E.setState({ province: s.province === d.p.code ? '' : d.p.code }); });
  }
  function tableDensity() {
    const rows = densityRows().sort((a, b) => b.density - a.density), party = densityParty();
    return '<table><thead><tr><th>' + t('จังหวัด', 'Province') + '</th><th>' + t('ภูมิภาค', 'Region') + '</th><th class="n">' + t('ความหนาแน่น', 'Density') + '</th><th class="n">' + esc(party) + '</th></tr></thead><tbody>' + rows.map(d => '<tr><td>' + esc(E.pname(d.p)) + '</td><td>' + esc(E.rname(d.p.region)) + '</td><td class="n">' + fmt(d.density) + '</td><td class="n">' + fmtP(d.share) + '</td></tr>').join('') + '</tbody></table>';
  }

  /* ---------- constituency comparison ---------- */
  function compareControls() {
    const s = S(), provs = D.provinces.slice().sort((a, b) => E.pname(a).localeCompare(E.pname(b), E.lang() === 'en' ? 'en' : 'th'));
    const p = cmpProvince && D.provinceByCode.get(cmpProvince);
    return '<span class="ctl"><label class="ctl-label" for="cmpProvince">' + t('จังหวัด', 'Province') + '</label><select id="cmpProvince"><option value="">' + t('เลือกจังหวัด', 'Choose province') + '</option>' + provs.map(x => '<option value="' + x.code + '"' + (x.code === cmpProvince ? ' selected' : '') + '>' + esc(E.pname(x)) + '</option>').join('') + '</select></span>' +
      '<span class="ctl"><label class="ctl-label" for="cmpDistrict">' + t('เขต', 'Constituency') + '</label><select id="cmpDistrict"' + (p ? '' : ' disabled') + '><option value="">' + t('เลือกเขตเพื่อเพิ่ม', 'Choose to add') + '</option>' + (p ? p.ids.map(id => { const r = D.byId.get(id); return '<option value="' + id + '"' + (s.compare.includes(id) ? ' disabled' : '') + '>' + t('เขต ', 'No. ') + r.number + ' · ' + esc(r.winnerParty || '') + '</option>'; }).join('') : '') + '</select></span>' +
      '<button type="button" class="ghost-btn" data-act="compare-close3">' + t('+ 3 เขตที่สูสีที่สุด', '+ 3 closest races') + '</button>' +
      (s.compare.length ? '<span class="cmp-tags">' + s.compare.map(id => '<button type="button" class="chip" data-act="compare-remove" data-v="' + id + '">' + esc(E.dname(D.byId.get(id))) + '<span aria-hidden="true">×</span></button>').join('') + '</span>' : '');
  }
  function drawCompare(el) {
    const s = S(), list = s.compare.map(id => D.byId.get(id)).filter(Boolean);
    if (!list.length) { el.innerHTML = '<p class="empty-state">' + t('ยังไม่ได้เลือกเขต — เลือกจังหวัดและเขตด้านบน หรือกด “+ 3 เขตที่สูสีที่สุด”', 'No constituencies yet — choose above or press “+ 3 closest races”') + '</p>'; return; }
    const metrics = [
      ['turnoutPct', t('อัตราการใช้สิทธิ', 'Turnout'), r => r.turnoutPct, [0, 100]],
      ['winnerShare', t('สัดส่วนคะแนนผู้ชนะ', 'Winner vote share'), r => r.winnerShare, [0, 100]],
      ['marginPct', t('ส่วนต่างชนะ', 'Victory margin'), r => r.marginPct, [0, Math.max(10, d3.max(list, r => r.marginPct))]],
      ['invalidPct', t('บัตรเสีย (แบบแบ่งเขต) ÷ ผู้มาใช้สิทธิ', 'Invalid constituency ballots ÷ turnout'), r => r.invalidPct, [0, Math.max(5, d3.max(list, r => r.invalidPct))]],
      ['gap', t('ส่วนต่างสองบัตรของพรรคผู้ชนะ (บัญชี − ผู้สมัคร, จุด)', 'Winner party two-ballot gap (list − candidate, pp)'), r => D.comparison(r, r.winnerParty).ppGap, null],
    ];
    const gapMax = Math.max(5, d3.max(list, r => Math.abs(D.comparison(r, r.winnerParty).ppGap || 0)));
    const rowsHtml = metrics.map(([key, label, get, dom]) => '<div class="cmp-metric"><h4>' + label + '</h4>' + list.map(r => {
      const v = get(r);
      if (!finite(v)) return '<div class="cmp-row"><span>' + esc(shortName(r)) + '</span><span class="na">' + t('ไม่มีข้อมูล', 'n/a') + '</span><b>—</b></div>';
      if (!dom) { const w = 50 * Math.abs(v) / gapMax; return '<div class="cmp-row"><span>' + esc(shortName(r)) + '</span><span class="bar div"><i style="' + (v >= 0 ? 'left:50%' : 'left:' + (50 - w) + '%') + ';width:' + w + '%;--c:' + esc(D.colorOf(r.winnerParty)) + '"></i></span><b>' + fmtPP(v) + '</b></div>'; }
      return '<div class="cmp-row"><span>' + esc(shortName(r)) + '</span><span class="bar"><i style="width:' + (100 * (v - dom[0]) / (dom[1] - dom[0])) + '%;--c:' + esc(D.colorOf(r.winnerParty)) + '"></i></span><b>' + fmtP(v) + '</b></div>';
    }).join('') + '</div>').join('');
    const ranks = '<div class="cmp-metric"><h4>' + t('อันดับผู้สมัคร (สัดส่วนของบัตรดีแบบแบ่งเขต)', 'Candidate ranking (share of valid constituency ballots)') + '</h4>' + list.map(r => {
      const top = r.candidates.slice(0, 4), rest = r.validVotes - top.reduce((sum, c) => sum + c.votes, 0);
      return '<div class="cmp-stack"><span>' + esc(shortName(r)) + '</span><span class="stack">' + top.map(c => '<i style="flex:' + c.votes + ';--c:' + esc(D.colorOf(c.party)) + '" title="' + esc(c.name + ' · ' + c.party + ' · ' + fmtP(c.votes / r.validVotes * 100)) + '">' + (c.votes / r.validVotes > 0.12 ? fmtP(c.votes / r.validVotes * 100, 0) : '') + '</i>').join('') + '<i class="rest" style="flex:' + Math.max(0, rest) + '" title="' + esc(t('ผู้สมัครอื่น', 'Other candidates') + ' ' + fmtP(rest / r.validVotes * 100)) + '"></i></span><small>' + top.map((c, i) => (i + 1) + '. ' + esc(c.name) + ' (' + esc(c.party) + ')').join(' · ') + '</small></div>';
    }).join('') + '</div>';
    el.innerHTML = '<div class="cmp">' + rowsHtml + ranks + '<p class="caveat">' + t('แถบในแต่ละตัวชี้วัดใช้สเกลเดียวกันทุกเขต · สีแถบ = พรรคผู้ชนะของเขต', 'Bars within a metric share one scale · bar colour = winning party') + '</p></div>';
  }

  /* ---------- details (docked on wide screens, sheet otherwise) ---------- */
  function detailHtml(item) {
    if (item.kind === 'district') { const r = D.byId.get(item.id); if (!r) return ''; return '<div class="an-detail-head"><b>' + t('รายละเอียดเขต', 'Constituency detail') + '</b><button type="button" class="icon-btn" data-act="an-detail-close" aria-label="' + t('ปิด', 'Close') + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>' + E.districtDetail(r, 'panel'); }
    if (item.kind === 'brush') return '<div class="an-detail-head"><b>' + esc(S().brush?.label || '') + '</b><button type="button" class="icon-btn" data-act="an-detail-close" aria-label="' + t('ปิด', 'Close') + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>' + brushListHtml();
    return '';
  }
  function brushListHtml() {
    const b = S().brush; if (!b) return '<p class="empty-state">' + t('ยังไม่มีช่วงที่เลือก', 'No brushed range') + '</p>';
    const rows = b.ids.map(id => D.byId.get(id)).filter(Boolean).sort((p, q) => p.marginPct - q.marginPct);
    return '<p class="caveat" style="padding:0 14px">' + rows.length + t(' เขต เรียงตามส่วนต่างน้อยไปมาก', ' constituencies, smallest margin first') + '</p><ol class="brush-list">' + rows.map(r => '<li><button type="button" data-act="district" data-v="' + r.id + '"><span class="who"><b>' + esc(E.dname(r)) + '</b><small>' + E.dot(r.winnerParty) + esc(r.winnerName) + ' · ' + esc(r.winnerParty) + '</small></span><span class="num">' + fmtP(r.marginPct) + '<small>' + t('ใช้สิทธิ ', 'turnout ') + fmtP(r.turnoutPct, 1) + '</small></span></button></li>').join('') + '</ol>';
  }
  A.sheetContent = item => item.what === 'brush' ? { title: S().brush?.label || '', html: brushListHtml() } : { title: '', html: '' };
  A.showDetail = id => {
    if (matchMedia('(min-width: 1280px)').matches) E.setState({ anDetail: { kind: 'district', id } });
    else E.openSheet({ kind: 'district', id }, false);
  };

  A.onAction = (act, v, el) => {
    const s = S();
    if (act === 'an-set') { const k = el.dataset.k; let val = v; if (k === 'seatTop' || k === 'ballotTop') val = String(v); const patch = { [k]: val }; if (k === 'ballotMode') patch.ballotSort = v === 'party' ? 'gap' : 'abs'; if (k === 'marginMetric' && s.brush?.source === 'margin') patch.brush = null; E.setState(patch); }
    else if (act === 'an-table') { tableOn.has(v) ? tableOn.delete(v) : tableOn.add(v); A.render(); }
    else if (act === 'brush-preset') { const [a, b] = v.split(',').map(Number); if (s.marginMetric !== 'pct') S().marginMetric = 'pct'; setMarginBrush(a, b); }
    else if (act === 'brush-list') { if (matchMedia('(min-width: 1280px)').matches) E.setState({ anDetail: { kind: 'brush' } }); else E.openSheet({ kind: 'custom', what: 'brush' }); }
    else if (act === 'an-detail-close') E.setState({ anDetail: null });
    else if (act === 'an-region') E.setState({ region: s.region === v ? '' : v, brush: null });
    else if (act === 'an-cell') E.setState({ region: v, party: el.dataset.p, brush: null });
    else if (act === 'compare-add') { if (!s.compare.includes(v)) E.setState({ compare: [...s.compare, v].slice(-4) }); }
    else if (act === 'compare-remove') E.setState({ compare: s.compare.filter(id => id !== v) });
    else if (act === 'compare-close3') { const close = E.scopeRows().filter(r => finite(r.marginPct) && !s.compare.includes(r.id)).sort((a, b) => a.marginPct - b.marginPct).slice(0, 3).map(r => r.id); E.setState({ compare: [...s.compare, ...close].slice(-4), analysisTab: 'compare', mobileChart: 'compare' }); }
  };
  A.onChange = (id, v, ev) => {
    const k = ev.target.dataset.k;
    if (k) { E.setState({ [k]: v }); return; }
    if (id === 'ctl-densityParty') E.setState({ party: v, densityParty: v });
    else if (id === 'cmpProvince') { cmpProvince = v; A.render(); }
    else if (id === 'cmpDistrict' && v) { const s = S(); if (!s.compare.includes(v)) E.setState({ compare: [...s.compare, v].slice(-4) }); }
  };
})();
