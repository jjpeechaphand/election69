/* Data Analysis page: graph-first workspace with coordinated views.
   Global filter = region (restricts constituencies); highlights = party, province, selected constituency;
   selected subset ("brush") = the constituencies of one band picked in the who-beat-whom flow chart. */
(function () {
  'use strict';
  const E = window.E69, A = E.analysis = {};
  const S = () => E.state();
  const t = (th, en) => E.t(th, en);
  const esc = v => E.esc(v);
  const C = () => E.colors();   // chart colours for the current light/dark theme (PALETTE in e69-app.js)
  const tableOn = new Set();
  let D, ro, redrawTimer, cmpProvince = '', refocus = '';
  const finite = Number.isFinite;
  const fmt = v => E.fmt(v), fmtP = (v, k) => E.fmtP(v, k), fmtPP = (v, k) => E.fmtPP(v, k);
  let measureCtx;
  const textW = (s, px = 12) => { measureCtx = measureCtx || document.createElement('canvas').getContext('2d'); measureCtx.font = px + 'px ' + getComputedStyle(document.body).fontFamily; return measureCtx.measureText(s).width; };
  // Room for a rotated y-axis title left of the percentage ticks: a left margin and the title's offset that keep a
  // few pixels between the title, the widest tick label and the chart's edge. Ticks depend on the domain only.
  const yTitleRoom = (scale, px = 12) => { const w = d3.max(scale.ticks(5), v => textW(v + '%', px)) || 0; return { left: Math.round(34 + w + 1.2 * (px - 12)), title: -Math.round(18 + w) }; };
  const shortName = r => (E.lang() === 'en' ? (r.provinceEn || r.province) : r.province) + ' ' + r.number;
  const brushSet = () => S().brush ? new Set(S().brush.ids) : null;
  const tipRows = rows => rows.map(([k, v]) => '<div class="tt-row"><span>' + k + '</span><span>' + v + '</span></div>').join('');

  /* ---------- tabs ---------- */
  // Names say what each view answers, in everyday words. The desktop has five tabs: the four-chart overview (four
  // previews; a click opens one large) and four views of their own. A phone shows the same eight charts one at a time.
  const CORE = ['seats', 'rivals', 'tiers', 'ranks'];
  const ORDER = [...CORE, 'region', 'records', 'coalition', 'compare'];
  const NAMES = () => ({ seats: t('คะแนนกับที่นั่ง', 'Votes and seats'), rivals: t('ใครชนะใคร', 'Who beat whom'), tiers: t('ส.ส.เขตกับบัญชีรายชื่อ', 'Constituency vs list seats'), ranks: t('อันดับของแต่ละพรรค', 'Finishing places'),
    region: t('คะแนนแต่ละภาค', 'Votes by region'), records: t('ที่สุดของผู้สมัคร', 'Candidate records'), coalition: t('รวมเสียงตั้งรัฐบาล', 'Building a majority'), compare: t('เปรียบเทียบเขตที่สนใจ', 'Compare constituencies') });
  const DESKTOP_TABS = () => { const n = NAMES(); return [['core', t('ภาพรวม 4 กราฟ', 'Four main charts'), CORE], ...ORDER.slice(CORE.length).map(id => [id, n[id], [id]])]; };
  const MOBILE_TABS = () => { const n = NAMES(); return ORDER.map(id => [id, n[id]]); };
  const CMP_MAX = 3;   // constituencies the comparison holds, all picked by the reader

  /* ---------- chart definitions ---------- */
  // Each label is grouped with its control (.ctl) so a wrapping toolbar never leaves a label at the end of a line.
  const seg = (k, opts, label) => '<span class="ctl"><span class="ctl-label">' + label + '</span><span class="seg" role="group" aria-label="' + esc(label) + '">' + opts.map(([v, l]) => '<button type="button" data-act="an-set" data-k="' + k + '" data-v="' + v + '" aria-pressed="' + (String(S()[k]) === v) + '">' + l + '</button>').join('') + '</span></span>';
  const sel = (k, opts, label) => '<span class="ctl"><label class="ctl-label" for="ctl-' + k + '">' + label + '</label><select id="ctl-' + k + '" data-k="' + k + '">' + opts.map(([v, l]) => '<option value="' + esc(v) + '"' + (String(S()[k]) === v ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></span>';
  const scopeLabel = () => S().region ? E.rname(S().region) : t('ทั้งประเทศ', 'nationwide');

  // Four questions about how the parties did, four chart types chosen for their data: two quantities in one unit per
  // party → a scatter against the "seats = votes" line (A); which party beat which in every constituency → a flow
  // chart (B); one measure in two tiers per party, where the ranks swap → a slope chart (C); how often each party's
  // candidates came first, second or third → stacked bars (D). On tabs of their own: a region × party heatmap, the
  // ranked candidate records, the House as a hemicycle for adding parties up to a majority, and the reader's own
  // comparison of constituencies.
  const CH = {
    // Each card's line under the title (q) is the chart's main finding, computed from the data on screen; `brief` is
    // the same finding in a few words, for the previews of the four-chart overview.
    seats: {
      title: () => t('แต่ละพรรคได้ที่นั่งเกินหรือขาดจากคะแนนเสียงที่ได้แค่ไหน?', 'Did each party win more or fewer seats than its share of the vote?'),
      q: () => seatInsight(), brief: () => seatBrief(),
      controls: () => { const c = E.config(); return seg('seatTier', [['const', t('ส.ส.เขต ' + c.constituencySeats, 'Constituency ' + c.constituencySeats)], ['list', t('บัญชีรายชื่อ ' + c.listSeats, 'Party list ' + c.listSeats)], ['all', t('ทั้งสภา ' + c.totalSeats, 'Whole House ' + c.totalSeats)]], t('ที่นั่ง', 'Seats')); },
      foot: () => seatFoot(),
      draw: drawSeats, table: tableSeats,
    },
    // Replaced "how close were the races" (a margin histogram readers could not use, 7 Nov 2026).
    rivals: {
      title: () => t('ผู้ชนะแต่ละเขตชนะพรรคไหนมา?', 'Which party did each winner beat?'),
      q: () => rivalInsight(), brief: () => rivalBrief(),
      controls: () => '',
      foot: () => rivalFoot(),
      draw: drawRivals, table: tableRivals,
    },
    // Replaced "did the winners win a majority" (7 Nov 2026): where each party's seats came from. The two tiers pull
    // in opposite directions for the two largest parties, which a slope from one tier to the other shows as crossing lines.
    tiers: {
      title: () => t('แต่ละพรรคได้ ส.ส. มาจากเขตหรือจากบัญชีรายชื่อ?', 'Did each party win its seats in constituencies or from the party list?'),
      q: () => tierInsight(), brief: () => tierBrief(),
      controls: () => '',
      foot: () => tierFoot(),
      draw: drawTiers, table: tableTiers,
    },
    // The fourth chart of the overview since 12 Nov 2026, when the majority builder moved to a tab of its own. It ties
    // the other three together: a party that is second or third in most places has votes everywhere and few seats (A),
    // is the usual runner-up (B) and collects party-list seats instead (C).
    ranks: {
      title: () => t('ผู้สมัครของแต่ละพรรคชนะ ได้ที่สอง หรือที่สาม กี่เขต?', 'How many seats did each party\'s candidates win, or finish second or third in?'),
      q: () => rankInsight(), brief: () => rankBrief(),
      controls: () => '',
      foot: () => rankFoot(),
      draw: drawRanks, table: tableRanks,
    },
    // Replaced "candidate votes against party votes" (11 Nov 2026): it told the story of the two charts before it a
    // third time. What a reader asks next is who can govern, which the seat totals answer once they can be added up.
    // A tab of its own since 12 Nov 2026: a different question from the four charts of the overview.
    coalition: {
      title: () => t('รวมพรรคไหนบ้าง<span class="nw">ถึงจะได้เสียง</span><span class="nw">เกินครึ่งสภา?</span>', 'Which parties add up to a majority of the House?'),
      q: () => coalInsight(),
      controls: () => '',   // its menu of ready-made sets sits beside the drawing, above the party list
      foot: () => coalFoot(),
      draw: drawCoalition, table: tableCoalition, html: true,
    },
    region: {
      title: () => t('แต่ละภูมิภาคมีรูปแบบคะแนนของพรรคการเมืองแตกต่างกันอย่างไร?', 'How do party voting patterns differ by region?'),
      q: () => regionInsight(),
      controls: () => sel('heatMetric', [['list', t('สัดส่วนคะแนนบัญชีรายชื่อ (%)', 'Party-list vote share (%)')], ['cand', t('สัดส่วนคะแนนผู้สมัคร (%)', 'Candidate vote share (%)')], ['seats', t('จำนวนเขตที่ชนะ', 'Constituencies won')], ['seatShare', t('สัดส่วนเขตที่ชนะ (%)', 'Share of constituencies won (%)')]], t('ตัวชี้วัด', 'Metric')) + seg('heatSort', [['region', t('ลำดับภูมิภาค', 'Region order')], ['party', t('ตามพรรคที่เลือก', 'By selected party')]], t('เรียงแถว', 'Row order')),
      foot: () => '<span>' + t('คลิกช่องเพื่อเลือกทั้งภูมิภาคและพรรค หรือคลิกหัวแถวและหัวคอลัมน์เพื่อเลือกอย่างใดอย่างหนึ่ง · ', 'Click a cell to pick a region and a party, or a row or column header to pick one · ') + t('สัดส่วนรายภูมิภาคคิดจากคะแนนพรรครวมหารด้วยบัตรดีรวมของบัตรชนิดเดียวกัน ไม่ใช่ค่าเฉลี่ยร้อยละรายเขต สียิ่งเข้มค่ายิ่งสูง ใช้สเกลเดียวทั้งตาราง', 'Regional shares divide total party votes by total valid ballots of the same type, not an average of percentages. Darker means higher, on one scale for the whole table.') + '</span>',
      draw: drawRegion, table: null, html: true,
    },
    // Replaced "cities and the countryside" (11 Nov 2026), a province-level correlation readers got little from. The
    // records are about people: every other chart counts parties or constituencies, this one names the candidates at
    // the extremes, ranked on one measure at a time.
    records: {
      title: () => t('<span class="nw">ใครได้คะแนนมากที่สุด</span> <span class="nw">ใครชนะขาด</span> <span class="nw">ใครชนะเฉียดฉิว?</span>', 'Who won the most votes, the biggest win, the narrowest?'),
      q: () => recordInsight(),
      controls: () => { const rows = sel('recordTop', [['10', '10'], ['20', '20'], ['50', '50']], t('จำนวน', 'Rows')); return E.isM() ? '<div class="ctl-pair">' + sel('recordBy', recordNames(true), t('จัดอันดับตาม', 'Rank by')) + rows + '</div>' : seg('recordBy', recordNames(false), t('จัดอันดับ', 'Ranking')) + rows; },
      foot: () => recordFoot(),
      draw: drawRecords, table: tableRecords, html: true,
    },
    // Redrawn 12 Nov 2026 as a side-by-side table (one column per constituency, the same facts on the same row), with
    // the picker inside it: the reader could not tell what the two menus and five bars per metric were for.
    compare: {
      title: () => t('เขตที่คุณเลือกต่างกันอย่างไร?', 'How do the constituencies you picked differ?'),
      q: () => compareInsight(),
      controls: () => '', foot: () => compareFoot(),
      draw: drawCompare, table: null, html: true,
    },
  };

  function brushFoot() {
    const b = S().brush; if (!b) return '';
    return '<span><b>' + esc(b.label) + '</b> · ' + b.ids.length + t(' เขต', ' constituencies') + ' <button type="button" class="tbl-toggle" data-act="brush-list">' + t('ดูรายชื่อเขต', 'List them') + '</button> <button type="button" class="tbl-toggle" data-act="unset" data-v="brush">' + t('ล้างการเลือก', 'Clear') + '</button></span>';
  }

  /* ---------- page render ---------- */
  // Desktop, any window size: five tabs. The first is the four-chart overview, four previews that always share the
  // window (each: its name, its finding in a few words, the drawing). A click on a preview opens that chart large, with
  // its question, controls, notes and table; a bar above it leads back to the four or across to the other three.
  // A phone shows the eight charts one at a time (see phoneNav).
  let renderedPhone = null, COMPACT = false, zoom = null;
  const curTab = () => DESKTOP_TABS().find(x => x[0] === S().analysisTab) || DESKTOP_TABS()[0];
  function visibleCharts() {
    const s = S();
    if (E.isM()) return [ORDER.includes(s.mobileChart) ? s.mobileChart : 'seats'];
    const tab = curTab();
    return tab[0] === 'core' && CORE.includes(s.coreFocus) ? [s.coreFocus] : tab[2];
  }
  const inOverview = () => !E.isM() && visibleCharts().length > 1;
  // In a preview a click anywhere opens the chart large, so its marks show their tooltip but take no click of their
  // own. Each draw function reads COMPACT once, while it draws, and builds its tooltip hints with hintOf(compact).
  const hintOf = compact => s => '<small>' + (compact ? t('คลิกเพื่อขยายกราฟนี้', 'Click to enlarge this chart') : s) + '</small>';
  const EXPAND = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 3h6v6M21 3l-7 7M9 21H3v-6M3 21l7-7"/></svg>';
  function tileHtml(id, c) {
    const name = NAMES()[id];
    return '<section class="card chart-card tile" id="card-' + id + '" data-act="an-focus" data-v="' + id + '" aria-labelledby="h-' + id + '"><div class="tile-head"><h2 id="h-' + id + '">' + name + '</h2>' +
      '<button type="button" class="tile-open" data-act="an-focus" data-v="' + id + '" aria-label="' + esc(t('ขยายกราฟ: ', 'Enlarge the chart: ') + name) + '" title="' + t('ขยายกราฟนี้ให้ใหญ่ พร้อมตัวเลือกและคำอธิบาย', 'Open this chart large, with its options and notes') + '">' + EXPAND + '<span>' + t('ขยาย', 'Enlarge') + '</span></button>' +
      '<p class="tile-q">' + c.brief() + '</p></div><div class="chart-box" id="box-' + id + '"></div></section>';
  }
  // Above a chart opened large: back to the four, or straight to one of the other three.
  function focusBar(id) {
    const n = NAMES();
    return '<div class="an-focusbar"><button type="button" class="an-back" data-act="an-unfocus">' + ARROW(-1) + t('กลับไปภาพรวม 4 กราฟ', 'Back to the four charts') + '</button>' +
      '<div class="an-switch" role="group" aria-label="' + t('กราฟในภาพรวม', 'Charts of the overview') + '">' + CORE.map(c => '<button type="button" data-act="an-focus" data-v="' + c + '" aria-pressed="' + (c === id) + '">' + n[c] + '</button>').join('') + '</div></div>';
  }
  function cardHtml(id) {
    const c = CH[id], tile = inOverview(), table = !tile && tableOn.has(id) && c.table, scroll = c.scroll?.();
    if (E.isM()) return phoneCardHtml(id, c, table, scroll);
    if (tile) return tileHtml(id, c);
    return '<section class="card chart-card" id="card-' + id + '" aria-labelledby="h-' + id + '"><div class="card-head"><div><h2 id="h-' + id + '">' + c.title() + '</h2><p class="chart-q">' + c.q() + '</p></div></div>' +
      '<div class="chart-ctl">' + c.controls() + '</div>' +
      (table ? '<div class="table-view" id="box-' + id + '">' + c.table() + '</div>' : '<div class="chart-box' + (scroll ? ' scroll' : '') + (c.html ? ' html' : '') + '" id="box-' + id + '"></div>') +
      '<div class="chart-foot">' + c.foot() + (c.table ? ' <button type="button" class="tbl-toggle" data-act="an-table" data-v="' + id + '">' + (table ? t('กลับไปดูกราฟ', 'Back to chart') : t('ดูเป็นตาราง', 'View as table')) + '</button>' : '') + '</div></section>';
  }
  /* Phones: one chart at a time, chosen from a bar that stays at the top (previous, the chart's name with its number,
     next; the name opens a list of all eight with their questions). Under each chart: the selection (if any), the
     table view as a button, and how to read the chart folded away. Words for the mouse ("click") say "tap". */
  const tapWords = s => E.isM() ? s.replace(/คลิก/g, 'แตะ').replace(/\bClick\b/g, 'Tap').replace(/\bclick\b/g, 'tap') : s;
  const ARROW = d => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + (d < 0 ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6') + '"/></svg>';
  function phoneNav(id) {
    const list = MOBILE_TABS(), i = Math.max(0, list.findIndex(x => x[0] === id));
    return '<nav class="an-nav" aria-label="' + t('เลือกกราฟ', 'Choose a chart') + '">' +
      '<button type="button" class="an-step" data-act="an-step" data-v="-1"' + (i <= 0 ? ' disabled' : '') + ' aria-label="' + t('กราฟก่อนหน้า', 'Previous chart') + '">' + ARROW(-1) + '</button>' +
      '<button type="button" class="an-pick" data-act="an-picker" aria-haspopup="dialog" aria-label="' + esc(t('กราฟที่ ' + (i + 1) + ' จาก ' + list.length + ': ' + list[i][1] + ' · แตะเพื่อเลือกกราฟอื่น', 'Chart ' + (i + 1) + ' of ' + list.length + ': ' + list[i][1] + ' · tap to choose another')) + '"><span class="n">' + (i + 1) + '/' + list.length + '</span><b>' + list[i][1] + '</b></button>' +
      '<button type="button" class="an-step" data-act="an-step" data-v="1"' + (i >= list.length - 1 ? ' disabled' : '') + ' aria-label="' + t('กราฟถัดไป', 'Next chart') + '">' + ARROW(1) + '</button></nav>';
  }
  function phoneCardHtml(id, c, table, scroll) {
    const brush = id === 'rivals' || id === 'ranks' ? brushFoot() : '', foot = brush ? c.foot().replace(brush, '') : c.foot();
    return '<section class="card chart-card" id="card-' + id + '" aria-labelledby="h-' + id + '"><div class="card-head"><div><h2 id="h-' + id + '">' + c.title() + '</h2><p class="chart-q">' + c.q() + '</p></div></div>' +
      '<div class="chart-ctl">' + c.controls() + '</div>' +
      (table ? '<div class="table-view" id="box-' + id + '">' + c.table() + '</div>' : '<div class="chart-box' + (scroll ? ' scroll' : '') + (c.html ? ' html' : '') + '" id="box-' + id + '"></div>') +
      '<div class="chart-foot">' + (brush ? '<div class="m-brush">' + tapWords(brush) + '</div>' : '') +
      (c.table ? '<button type="button" class="tbl-toggle" data-act="an-table" data-v="' + id + '">' + (table ? t('กลับไปดูกราฟ', 'Back to chart') : t('ดูเป็นตาราง', 'View as table')) + '</button>' : '') +
      '<details class="m-howto"><summary>' + t('วิธีอ่านกราฟนี้', 'How to read this chart') + '</summary><div>' + tapWords(foot) + '</div></details></div></section>';
  }
  const chartsPickerHtml = () => {
    const cur = visibleCharts()[0];
    return '<ul class="m-pick">' + MOBILE_TABS().map(([id, label], i) => '<li><button type="button" data-act="an-set" data-k="mobileChart" data-v="' + id + '"' + (id === cur ? ' aria-current="true"' : '') + '><span class="n">' + (i + 1) + '</span><b>' + label + '</b><small>' + CH[id].title() + '</small></button></li>').join('') + '</ul>';
  };
  // `continuing` is true when the analysis page was already on screen before this render.
  let renderedLayout = '';
  A.render = function (continuing) {
    D = E.D;
    const phone = E.isM();
    if (phone) E.hideChartTip();   // a tooltip opened by a tap belongs to the drawing being replaced
    const s = S(), tab = curTab()[0], vis = visibleCharts(), grid = vis.length > 1, wide = matchMedia('(min-width: 1280px)').matches;
    const focus = !phone && !grid && tab === 'core' ? vis[0] : '';   // a chart of the overview opened large
    renderedPhone = phone;
    const tabs = DESKTOP_TABS().map(([id, label]) => '<button type="button" role="tab" aria-selected="' + (tab === id) + '" data-act="an-set" data-k="analysisTab" data-v="' + id + '">' + label + '</button>').join('');
    // The four previews keep the whole width; details open beside a chart only once it is large or on a tab of its own.
    const detail = wide && !grid && s.anDetail && (s.anDetail.kind !== 'district' || s.anDetail.id === s.district) && (s.anDetail.kind !== 'brush' || s.brush) ? detailHtml(s.anDetail) : '';
    const page = document.getElementById('pageAnalysis');
    const keepScroll = page.scrollTop;
    // Same charts as before (a party highlighted, a sort or filter changed): the old drawing is kept on top as a
    // ghost and dissolves once the new one is drawn underneath, instead of the charts blanking and redrawing.
    // A different set of charts (another tab, a detail panel opening) rises into place instead; a preview that was
    // clicked grows into the large chart, and shrinks back into its place on the way out (growFrom).
    const layout = [phone, vis.join(), detail ? s.anDetail.kind + ':' + (s.anDetail.id || '') : '', [...tableOn].join(), E.lang()].join('|');
    const grow = zoom && !calm() ? zoom : null; zoom = null;
    const old = continuing && !calm() && !grow ? page.querySelector('.an > .an-body') : null, same = layout === renderedLayout;
    renderedLayout = layout;
    page.innerHTML = '<div class="an">' + (phone ? phoneNav(vis[0]) : '<div class="an-tabs" role="tablist" aria-label="' + t('มุมมองการวิเคราะห์', 'Analysis views') + '">' + tabs + '</div>' + (focus ? focusBar(focus) : '')) +
      '<div class="an-body' + (detail ? ' with-detail' : '') + '"><div class="' + (grid ? 'an-grid' : 'an-single') + '">' + vis.map(cardHtml).join('') + '</div>' + (detail ? '<aside class="card an-detail" id="anDetail" aria-label="' + t('รายละเอียด', 'Details') + '">' + detail + '</aside>' : '') + '</div></div>';
    page.scrollTop = keepScroll;
    const ghost = old && same ? keepAsGhost(old) : null;
    if (old && !same) page.querySelector('.an-body').classList.add('an-enter');
    if (grow) growFrom(grow);
    requestAnimationFrame(() => { drawAll(); if (ghost) { void getComputedStyle(ghost).opacity; ghost.classList.add('fading'); } });
    if (!ro && 'ResizeObserver' in window) { ro = new ResizeObserver(() => { clearTimeout(redrawTimer); redrawTimer = setTimeout(() => { if (S().page !== 'analysis') return; if (E.isM() !== renderedPhone) A.render(); else drawAll(); }, 120); }); ro.observe(page); }
  };
  const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  // A chart that opens large grows out of its preview, and shrinks back into it on the way out, so the reader sees
  // where it came from and where it went. `z.rect` is where the card was on screen before the page was redrawn.
  function growFrom(z) {
    const el = document.getElementById('card-' + z.id); if (!el || !el.animate) return;
    const to = el.getBoundingClientRect(), f = z.rect; if (!to.width || !to.height) return;
    el.style.zIndex = 4;
    const a = el.animate([{ transformOrigin: '0 0', transform: 'translate(' + (f.left - to.left) + 'px,' + (f.top - to.top) + 'px) scale(' + f.width / to.width + ',' + f.height / to.height + ')' }, { transformOrigin: '0 0', transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.2, .7, .2, 1)' });
    a.onfinish = a.oncancel = () => { el.style.zIndex = ''; };
    if (z.out) { el.classList.add('is-zoom'); el.parentElement.classList.add('an-settle'); }   // the other three fade back in around it
  }
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
    const tiles = inOverview();
    for (const id of visibleCharts()) {
      const el = document.getElementById('box-' + id); if (!el || !tiles && tableOn.has(id) && CH[id].table) continue;
      el.innerHTML = '';
      COMPACT = tiles;   // read by the draw functions: fewer words, no clicks of their own
      try { CH[id].draw(el); } catch (err) { console.error(err); el.innerHTML = '<p class="empty-state">' + t('วาดกราฟไม่สำเร็จ', 'Could not draw this chart') + '</p>'; } finally { COMPACT = false; }
    }
    if (refocus) { const again = E.isM() ? null : document.querySelector(refocus); refocus = ''; if (again && !again.disabled) again.focus({ preventScroll: true }); }
  }
  A.reset = () => { tableOn.clear(); cmpProvince = ''; cmpQuery = ''; };

  function svgFor(el, w, h) {
    return d3.select(el).append('svg').attr('width', w).attr('height', h).attr('viewBox', [0, 0, w, h].join(' '));
  }
  function emptyState(el, msg) { el.innerHTML = '<p class="empty-state">' + msg + '</p>'; }
  function keyActivate(sel, fn) { sel.attr('tabindex', 0).on('keydown', (ev, d) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); fn(ev, d); } }); }

  /* ---------- A: votes and seats ---------- */
  // Each party's share of the vote beside its share of the seats. In the constituency tier the most votes in a seat
  // takes all of it, so the leading party gains seats beyond its votes; the party list is shared out by votes.
  // "Whole House" sets all 500 seats against the party-list vote, the nationwide measure of support for a party.
  function seatVoteRows() {
    const s = S(), c = E.config(), tier = s.seatTier || 'const';
    const seatsOf = p => tier === 'const' ? p.constituencySeats : tier === 'list' ? p.listSeats : p.totalSeats;
    const seatTotal = tier === 'const' ? c.constituencySeats : tier === 'list' ? c.listSeats : c.totalSeats;
    const voteTotal = tier === 'const' ? D.national.valid.value : D.national.listValid.value, votesOf = p => tier === 'const' ? p.candVotes : p.listVotes;
    const all = D.parties.map(p => ({ name: p.name, color: p.color, seats: seatsOf(p) || 0, votes: votesOf(p) || 0 }))
      .map(d => Object.assign(d, { seatPct: d.seats / seatTotal * 100, votePct: d.votes / voteTotal * 100 })).filter(d => d.seats > 0 || d.votePct >= 1);
    all.forEach(d => { d.gap = d.seatPct - d.votePct; });
    all.sort((a, b) => b.seats - a.seats || b.votePct - a.votePct);
    return { list: all, all, tier, seatTotal };
  }
  const pts = v => (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toFixed(1);
  function seatInsight() {
    const { all, tier } = seatVoteRows(), won = all.filter(d => d.seats > 0);
    if (tier === 'list') return t('บัญชีรายชื่อแบ่งที่นั่งตามสัดส่วนคะแนน ทุกพรรคได้ที่นั่งห่างจากคะแนนไม่เกิน ', 'Party-list seats follow the vote: every party is within ') + '<b>' + d3.max(won, d => Math.abs(d.gap)).toFixed(1) + t(' จุด', ' points') + '</b>' + t('', ' of its vote share');
    const up = d3.greatest(won, d => d.gap), down = d3.least(all.filter(d => d.votePct >= 3), d => d.gap);
    const say = d => '<b>' + esc(d.name) + '</b>' + t('ได้ที่นั่ง ', ' won ') + '<b>' + fmtP(d.seatPct, 1) + '</b>' + t(' จากคะแนน ', ' of the seats with ') + '<b>' + fmtP(d.votePct, 1) + '</b>' + t('', ' of the vote');
    return say(up) + (down && down !== up && down.gap < -1 ? ' · ' + say(down) : '');
  }
  // The same finding in a few words, for the preview: which seats are counted, then the party that gained most.
  function seatBrief() {
    const { all, tier } = seatVoteRows(), won = all.filter(d => d.seats > 0);
    const head = { const: t('ส.ส.เขต ', 'Constituencies: '), list: t('บัญชีรายชื่อ ', 'Party list: '), all: t('ทั้งสภา ', 'Whole House: ') }[tier];
    if (!won.length) return '';
    if (tier === 'list') return head + t('ที่นั่งตามคะแนน ต่างไม่เกิน ', 'seats follow votes, within ') + '<b>' + d3.max(won, d => Math.abs(d.gap)).toFixed(1) + t(' จุด', ' pts') + '</b>';
    const up = d3.greatest(won, d => d.gap);
    return head + '<b>' + esc(up.name) + '</b>' + t(' ได้ที่นั่ง ', ' won ') + '<b>' + fmtP(up.seatPct, 1) + '</b>' + t(' จากคะแนน ', ' of seats on ') + '<b>' + fmtP(up.votePct, 1) + '</b>' + t('', ' of votes');
  }
  function seatFoot() {
    const tier = S().seatTier || 'const', c = E.config(), bad = D.seatParties.filter(p => p.totalSeats !== p.constituencySeats + p.listSeats);
    const how = { const: t('คะแนนผู้สมัครของพรรครวมทุกเขต ÷ บัตรดีแบบแบ่งเขต เทียบกับเขตที่ชนะ ÷ ' + c.constituencySeats, 'the party\'s candidate votes ÷ valid constituency ballots, against constituencies won ÷ ' + c.constituencySeats),
      list: t('คะแนนบัญชีรายชื่อ ÷ บัตรดีบัญชีรายชื่อ เทียบกับที่นั่งบัญชีรายชื่อ ÷ ' + c.listSeats, 'party-list votes ÷ valid party-list ballots, against list seats ÷ ' + c.listSeats),
      all: t('ที่นั่งทั้งสภา ÷ ' + c.totalSeats + ' เทียบกับคะแนนบัญชีรายชื่อ (บัตรเลือกพรรค) ซึ่งบอกความนิยมพรรคทั่วประเทศ', 'all seats ÷ ' + c.totalSeats + ' against party-list votes, the nationwide measure of support') }[tier];
    return '<span>' + how + (bad.length ? ' · ⚠ ' + bad.map(p => p.name).join(', ') : '') + (S().region ? ' · ' + t('ตัวกรองภูมิภาคไม่ใช้กับกราฟนี้', 'the region filter does not apply here') : '') + '</span>';
  }
  const scopeNote = () => S().region ? ' · ' + t('ขอบเขต: ', 'scope: ') + scopeLabel() : '';
  // Labels placed greedily: each tries a few spots around its anchor and takes the first that overlaps no earlier label
  // or mark and stays inside the plot; if none is free it keeps the first spot. `spots` are [dx, dy, anchor] offsets.
  function placeLabels(items, bounds, marks) {
    const taken = marks.slice(), hit = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
    for (const it of items) {
      let pick = null;
      for (const [dx, dy, anchor] of it.spots) {
        const x = it.x + dx, y = it.y + dy, x0 = anchor === 'end' ? x - it.w : anchor === 'middle' ? x - it.w / 2 : x, box = { x0, x1: x0 + it.w, y0: y - it.h / 2, y1: y + it.h / 2 };
        const inside = box.x0 >= bounds.x0 && box.x1 <= bounds.x1 && box.y0 >= bounds.y0 && box.y1 <= bounds.y1;
        if (inside && !taken.some(b => hit(b, box))) { pick = { x, y, anchor, box }; break; }
        if (!pick) pick = { x, y, anchor, box, fallback: true };
      }
      if (!pick.fallback) taken.push(pick.box);
      Object.assign(it, { lx: pick.x, ly: pick.y, anchor: pick.anchor, crowded: !!pick.fallback });
    }
    return items;
  }
  // A scatter of seat share against vote share, one dot per party, on one scale. Dots on the dashed line won seats in
  // proportion to their votes; a dot above it won more, below it fewer, and the short stem to the line is the gap.
  function drawSeats(el) {
    const s = S(), { list } = seatVoteRows(), W = el.clientWidth, H = el.clientHeight, compact = COMPACT, hint = hintOf(compact), up = E.typeUp(), small = compact && (W < 400 || H < 210);
    if (!list.length) return emptyState(el, t('ไม่มีข้อมูล', 'No data'));
    const top = d3.max(list, d => Math.max(d.seatPct, d.votePct)) || 1, room = yTitleRoom(d3.scaleLinear([0, top * 1.06]).nice(), 12 + up);
    const m = { t: compact ? 8 : 12, r: 14, b: (compact ? 32 : 36) + Math.round(3 * up), l: room.left }, iw = Math.max(80, W - m.l - m.r), ih = Math.max(60, H - m.t - m.b);
    const x = d3.scaleLinear([0, top * 1.06], [0, iw]).nice(), y = d3.scaleLinear([0, x.domain()[1]], [ih, 0]);
    const svg = svgFor(el, W, H).attr('role', 'img').attr('aria-label', t('สัดส่วนที่นั่งเทียบกับสัดส่วนคะแนน: ', 'Seat share against vote share: ') + list.slice(0, 8).map(d => d.name + ' ' + fmtP(d.votePct, 1) + ' → ' + fmtP(d.seatPct, 1)).join(', '));
    const g = svg.append('g').attr('transform', 'translate(' + m.l + ',' + m.t + ')'), mx = x.domain()[1];
    // Above the line: more seats than votes (shaded); the line itself: seats = votes.
    g.append('path').attr('d', 'M0,' + ih + 'L' + iw + ',' + y(mx) + 'L0,' + y(mx) + 'Z').attr('fill', C().band).attr('opacity', 0.7);
    const tx = Math.max(2, Math.floor(iw / 70)), ty = Math.max(2, Math.floor(ih / 45));
    g.append('g').attr('class', 'grid').call(d3.axisLeft(y).ticks(ty).tickSize(-iw).tickFormat(''));
    g.append('g').attr('class', 'axis').attr('transform', 'translate(0,' + ih + ')').call(d3.axisBottom(x).ticks(tx).tickFormat(v => v + '%'));
    g.append('g').attr('class', 'axis').call(d3.axisLeft(y).ticks(ty).tickFormat(v => v + '%'));
    g.append('text').attr('class', 'axis-title').attr('x', iw).attr('y', ih + (compact ? 28 : 30) + Math.round(2 * up)).attr('text-anchor', 'end').text(t('สัดส่วนคะแนน →', 'vote share →'));
    g.append('text').attr('class', 'axis-title').attr('transform', 'rotate(-90)').attr('x', 0).attr('y', room.title).attr('text-anchor', 'end').text(t('สัดส่วนที่นั่ง →', 'seat share →'));
    g.append('line').attr('x1', 0).attr('y1', ih).attr('x2', x(mx)).attr('y2', y(mx)).attr('stroke', C().text3).attr('stroke-width', 1.2).attr('stroke-dasharray', '5 4');
    const note = (txt, px, py, anchor) => g.append('text').attr('x', px).attr('y', py).attr('text-anchor', anchor).attr('font-size', 11 + up).attr('font-weight', 600).attr('fill', C().text3).text(txt);
    // A very small preview keeps the shaded half and the line, and leaves their words to the large chart.
    if (!small) { note(t('ได้ที่นั่งเกินคะแนน', 'more seats than votes'), 8, 14 + up, 'start'); note(t('ได้ที่นั่งน้อยกว่าคะแนน', 'fewer seats than votes'), iw - 6, ih - 8, 'end'); }
    if (!small) note(t('ที่นั่ง = คะแนน', 'seats = votes'), x(mx * 0.78) + 6, y(mx * 0.78) + 14, 'start').attr('font-weight', 500);
    // Small parties draw first and smaller, so the large ones sit on top.
    const big = d => d.seats >= 10 || d.votePct >= 3, order = list.slice().sort((a, b) => a.seats - b.seats || a.votePct - b.votePct);
    const dots = g.selectAll('g.pt').data(order).join('g').attr('class', d => 'pt mark' + (s.party && s.party !== d.name ? ' dim' : '')).attr('data-seats', d => d.seats)
      .attr('transform', d => 'translate(' + x(d.votePct) + ',' + y(d.seatPct) + ')')
      .attr('aria-label', d => d.name + ': ' + t('คะแนน ', 'votes ') + fmtP(d.votePct, 1) + ', ' + t('ที่นั่ง ', 'seats ') + fmtP(d.seatPct, 1) + ' (' + d.seats + ')');
    if (!compact) dots.style('cursor', 'pointer').attr('role', 'button').attr('aria-pressed', d => String(s.party === d.name));
    dots.append('line').attr('y2', d => y(d.votePct) - y(d.seatPct)).attr('stroke', d => d.color).attr('stroke-width', d => big(d) ? 2.4 : 1.2).attr('stroke-opacity', 0.55).attr('stroke-linecap', 'round');
    dots.append('circle').attr('r', d => big(d) ? 7 : 4).attr('fill', d => d.color).attr('stroke', C().ring).attr('stroke-width', 1.6);
    dots.append('circle').attr('r', 14).attr('fill', 'transparent');   // easier to point at
    // Names for the larger parties, with how many points they won above or below their votes.
    const lab = d => small ? d.name : d.name + ' ' + pts(d.gap);
    const items = list.filter(big).map(d => ({ d, x: x(d.votePct), y: y(d.seatPct), w: textW(lab(d), 11.5 + up) + 2, h: 14 + up, spots: [[11, 0, 'start'], [-11, 0, 'end'], [0, -15 - up, 'middle'], [0, 16 + up, 'middle'], [11, -12 - up, 'start'], [11, 12 + up, 'start'], [-11, -12 - up, 'end'], [-11, 12 + up, 'end']] }));
    placeLabels(items, { x0: 0, x1: iw, y0: 0, y1: ih }, list.filter(big).map(d => ({ x0: x(d.votePct) - 8, x1: x(d.votePct) + 8, y0: y(d.seatPct) - 8, y1: y(d.seatPct) + 8 })));
    // A preview leaves out a name that has no free place; the large chart keeps every one.
    g.append('g').attr('class', 'pt-labels').attr('pointer-events', 'none').selectAll('text').data(compact ? items.filter(d => !d.crowded) : items).join('text').attr('class', d => 'mark' + (s.party && s.party !== d.d.name ? ' dim' : ''))
      .attr('x', d => d.lx).attr('y', d => d.ly).attr('dy', '.35em').attr('text-anchor', d => d.anchor).attr('font-size', 11.5 + up).attr('font-weight', d => s.party === d.d.name ? 700 : 600)
      .attr('fill', C().text).attr('paint-order', 'stroke').attr('stroke', C().ring).attr('stroke-width', 3).attr('stroke-linejoin', 'round').text(d => lab(d.d));
    const pick = (ev, d) => E.setState({ party: s.party === d.name ? '' : d.name });
    dots.on('pointermove', (ev, d) => E.chartTip(ev, '<b>' + esc(d.name) + '</b>' + tipRows([[t('สัดส่วนคะแนน', 'Vote share'), fmtP(d.votePct, 1) + ' (' + fmt(d.votes) + ')'], [t('สัดส่วนที่นั่ง', 'Seat share'), fmtP(d.seatPct, 1) + ' (' + d.seats + ')'], [t('ที่นั่งเกิน/ขาดจากคะแนน', 'Seats above/below votes'), pts(d.gap) + t(' จุด', ' pts')]]) + hint(t('คลิกเพื่อไฮไลต์พรรคทุกกราฟ', 'Click to highlight this party everywhere'))))
      .on('pointerleave', E.hideChartTip);
    if (!compact) { dots.on('click', pick); keyActivate(dots, pick); }
  }
  function tableSeats() {
    return '<table><thead><tr><th>' + t('พรรค', 'Party') + '</th><th class="n">' + t('คะแนน', 'Votes') + '</th><th class="n">' + t('สัดส่วนคะแนน', 'Vote share') + '</th><th class="n">' + t('ที่นั่ง', 'Seats') + '</th><th class="n">' + t('สัดส่วนที่นั่ง', 'Seat share') + '</th><th class="n">' + t('ต่าง (จุด)', 'Gap (pts)') + '</th></tr></thead><tbody>' +
      seatVoteRows().list.map(d => '<tr><td>' + E.dot(d.name) + esc(d.name) + '</td><td class="n">' + fmt(d.votes) + '</td><td class="n">' + fmtP(d.votePct, 1) + '</td><td class="n"><b>' + d.seats + '</b></td><td class="n">' + fmtP(d.seatPct, 1) + '</td><td class="n">' + pts(d.gap) + '</td></tr>').join('') + '</tbody></table>';
  }

  /* ---------- B: who beat whom (winner's party → runner-up's party) ---------- */
  // Replaced the margin histogram (7 Nov 2026), which readers could not use. Every constituency is in effect a contest
  // between its winner and its runner-up; a flow chart (Sankey) joins the winner's party (left) to the runner-up's party
  // (right), each band as thick as its number of constituencies. It answers who the main challenger was and which
  // contests decided the election, nationwide or (with the region filter) in one region. Parties with only a few
  // finishes on one side share an "others" node there; a highlighted party always keeps its own.
  const OTHER = '__other';
  let rivalDraws = 0;
  function rivalData() {
    const s = S(), rows = E.scopeRows().filter(r => r.winnerParty && r.runner && r.runner.party);
    const minN = Math.max(3, Math.round(rows.length * 0.025));
    const side = key => { const n = d3.rollup(rows, v => v.length, key); return { n, keep: new Set([...n].filter(([p, c]) => c >= minN || p === s.party).map(([p]) => p)) }; };
    const W = side(r => r.winnerParty), R = side(r => r.runner.party);
    const wKey = r => W.keep.has(r.winnerParty) ? r.winnerParty : OTHER, rKey = r => R.keep.has(r.runner.party) ? r.runner.party : OTHER;
    const byKey = new Map();
    for (const r of rows) { const k = wKey(r) + '|' + rKey(r); if (!byKey.has(k)) byKey.set(k, { key: k, w: wKey(r), r: rKey(r), rows: [] }); byKey.get(k).rows.push(r); }
    const flows = [...byKey.values()].map(f => Object.assign(f, { n: f.rows.length }));
    const nodes = (key, sideInfo) => d3.rollups(rows, v => v.length, key).sort((a, b) => (a[0] === OTHER) - (b[0] === OTHER) || b[1] - a[1])
      .map(([party, n]) => ({ party, n, parties: party === OTHER ? [...sideInfo.n].filter(([p]) => !sideInfo.keep.has(p)).sort((a, b) => b[1] - a[1]) : null }));
    return { rows, flows, left: nodes(wKey, W), right: nodes(rKey, R) };
  }
  const rivalName = p => p === OTHER ? t('พรรคอื่น', 'Others') : p;
  const bandName = f => rivalName(f.w) + t(' ชนะ ', ' beat ') + rivalName(f.r);
  function rivalInsight() {
    const s = S(), { rows } = rivalData(); if (!rows.length) return '';
    const most = (list, key) => d3.greatest(d3.rollups(list, v => v.length, key), d => d[1]);
    if (s.party) {
      const won = rows.filter(r => r.winnerParty === s.party), second = rows.filter(r => r.runner.party === s.party);
      const a = won.length && most(won, r => r.runner.party), b = second.length && most(second, r => r.winnerParty);
      const part1 = won.length ? '<b>' + esc(s.party) + '</b>' + t(' ชนะ ', ' won ') + '<b>' + won.length + t(' เขต', '') + '</b>' + t(' ส่วนใหญ่ชนะ ', ', mostly against ') + esc(a[0]) + ' (' + a[1] + ')'
        : '<b>' + esc(s.party) + '</b>' + t('ไม่ได้ชนะเขตใด', ' won no constituency');
      const part2 = second.length ? t('ได้อันดับสอง ', 'second in ') + '<b>' + second.length + t(' เขต', '') + '</b>' + t(' ส่วนใหญ่แพ้ ', ', mostly behind ') + esc(b[0]) + ' (' + b[1] + ')' : t('ไม่ได้อันดับสองในเขตใด', 'never second');
      return part1 + ' · ' + part2;
    }
    const pairs = d3.rollups(rows, v => v, r => [r.winnerParty, r.runner.party].sort().join('|')).sort((a, b) => b[1].length - a[1].length);
    const [k, list] = pairs[0], [p, q] = k.split('|'), pw = list.filter(r => r.winnerParty === p).length;
    const [first, second, wins] = pw >= list.length - pw ? [p, q, pw] : [q, p, list.length - pw];
    const ru = most(rows, r => r.runner.party);
    return t('คู่ชิงที่พบบ่อยที่สุดคือ ', 'The most common contest was ') + '<b>' + esc(first) + '</b>' + t(' กับ ', ' against ') + '<b>' + esc(second) + '</b>' + t(' ใน ', ' in ') + '<b>' + list.length + t(' จาก ', ' of ') + rows.length + t(' เขต', '') + '</b> (' + esc(first) + t('ชนะ ', ' won ') + wins + ') · ' +
      '<b>' + esc(ru[0]) + '</b>' + t('ได้อันดับสองมากที่สุด ', ' came second most often, in ') + '<b>' + ru[1] + t(' เขต', '') + '</b>';
  }
  function rivalBrief() {
    const s = S(), { rows } = rivalData(); if (!rows.length) return '';
    if (s.party) {
      const won = rows.filter(r => r.winnerParty === s.party).length, second = rows.filter(r => r.runner.party === s.party).length;
      return '<b>' + esc(s.party) + '</b>' + t(' ชนะ ', ' won ') + '<b>' + won + '</b>' + t(' เขต ได้ที่สอง ', ', came second in ') + '<b>' + second + '</b>' + t(' เขต', '');
    }
    const [k, list] = d3.rollups(rows, v => v, r => [r.winnerParty, r.runner.party].sort().join('|')).sort((a, b) => b[1].length - a[1].length)[0];
    const [p, q] = k.split('|'), pw = list.filter(r => r.winnerParty === p).length, [first, second] = pw >= list.length - pw ? [p, q] : [q, p];
    return '<b>' + esc(first) + '</b>' + t(' กับ ', ' against ') + '<b>' + esc(second) + '</b>' + t(' ชิงกัน ', ' in ') + '<b>' + list.length + '</b>' + t(' จาก ', ' of ') + rows.length + t(' เขต', ' seats');
  }
  function rivalFoot() {
    return '<span>' + t('ซ้าย: พรรคของผู้ชนะ · ขวา: พรรคที่ได้อันดับสอง · ความหนาของแถบ = จำนวนเขต · คลิกแถบเพื่อเลือกเขตชุดนั้น · คลิกชื่อพรรคเพื่อไฮไลต์พรรค', 'Left: the winner\'s party · right: the runner-up\'s party · band thickness = constituencies · click a band to select those constituencies, a party to highlight it') + scopeNote() + '</span>' + brushFoot();
  }
  function drawRivals(el) {
    const s = S(), { rows, flows, left, right } = rivalData(), W = el.clientWidth, H = el.clientHeight, compact = COMPACT, hint = hintOf(compact), up = E.typeUp(), fs = (compact && W < 400 ? 11 : 12) + up;
    if (!rows.length) return emptyState(el, t('ไม่มีเขตในตัวกรองนี้', 'No constituencies in this filter'));
    const color = p => p === OTHER ? C().text4 : E.D.colorOf(p);
    const lLabel = d => rivalName(d.party) + ' ' + d.n, rLabel = d => d.n + ' ' + rivalName(d.party);
    const nw = compact && W < 400 ? 9 : 12, m = { t: (compact ? 24 : 30) + Math.round(up), b: (compact ? 9 : 6) + Math.round(2.4 * up), l: Math.min(170 + 12 * up, d3.max(left, d => textW(lLabel(d), fs)) + 16), r: Math.min(170 + 12 * up, d3.max(right, d => textW(rLabel(d), fs)) + 16) };
    const x0 = m.l, x1 = Math.max(x0 + nw + 60, W - m.r - nw), ih = Math.max(60, H - m.t - m.b);
    const pad = Math.max(3, Math.min(10, ih * 0.03));
    const ky = Math.min((ih - pad * (left.length - 1)) / rows.length, (ih - pad * (right.length - 1)) / rows.length);
    const place = nodes => { let y = 0; for (const d of nodes) { d.y0 = y; d.y1 = y + d.n * ky; y = d.y1 + pad; } const off = (ih - (y - pad)) / 2; for (const d of nodes) { d.y0 += off; d.y1 += off; } };
    place(left); place(right);
    const Lx = new Map(left.map(d => [d.party, d])), Rx = new Map(right.map(d => [d.party, d]));
    // Bands leave each node in the order of the nodes they reach, so they cross as little as possible.
    for (const d of left) { let y = d.y0; for (const f of flows.filter(f => f.w === d.party).sort((a, b) => Rx.get(a.r).y0 - Rx.get(b.r).y0)) { f.ly0 = y; y += f.n * ky; f.ly1 = y; } }
    for (const d of right) { let y = d.y0; for (const f of flows.filter(f => f.r === d.party).sort((a, b) => Lx.get(a.w).y0 - Lx.get(b.w).y0)) { f.ry0 = y; y += f.n * ky; f.ry1 = y; } }
    const svg = svgFor(el, W, H).attr('role', 'img').attr('aria-label', t('ผู้ชนะแต่ละพรรคชนะพรรคไหน: ', 'Who beat whom: ') + flows.slice().sort((a, b) => b.n - a.n).slice(0, 6).map(f => bandName(f) + ' ' + f.n).join(', '));
    const g = svg.append('g').attr('transform', 'translate(0,' + m.t + ')');
    const head = (x, anchor, txt) => g.append('text').attr('x', x).attr('y', compact ? -10 : -14).attr('text-anchor', anchor).attr('font-size', fs).attr('font-weight', 700).attr('fill', C().text2).text(txt);
    head(x0 + nw, 'end', t('ผู้ชนะ', 'Winner'));
    head(x1, 'start', t('ได้อันดับสอง', 'Runner-up'));
    // Bands, shaded from the winner's colour to the runner-up's.
    const id = 'rv' + (++rivalDraws) + '-', defs = svg.append('defs'), a = x0 + nw, b = x1, xm = (a + b) / 2;
    flows.forEach((f, i) => { const gr = defs.append('linearGradient').attr('id', id + i).attr('gradientUnits', 'userSpaceOnUse').attr('x1', a).attr('x2', b); gr.append('stop').attr('offset', '0%').attr('stop-color', color(f.w)); gr.append('stop').attr('offset', '100%').attr('stop-color', color(f.r)); f.fill = 'url(#' + id + i + ') ' + color(f.w); });
    const picked = s.brush?.source === 'rivals' ? s.brush.key : '', lit = f => picked ? f.key === picked : !s.party || f.w === s.party || f.r === s.party;
    const path = f => 'M' + a + ',' + f.ly0 + 'C' + xm + ',' + f.ly0 + ' ' + xm + ',' + f.ry0 + ' ' + b + ',' + f.ry0 + 'L' + b + ',' + f.ry1 + 'C' + xm + ',' + f.ry1 + ' ' + xm + ',' + f.ly1 + ' ' + a + ',' + f.ly1 + 'Z';
    const order = flows.slice().sort((p, q) => lit(p) - lit(q) || q.n - p.n);   // lit bands on top, thin ones over thick
    const bands = g.append('g').selectAll('path').data(order).join('path').attr('class', f => 'rv-band mark' + (lit(f) ? '' : ' dim') + (f.key === picked ? ' is-picked' : '')).attr('data-key', f => f.key).attr('data-n', f => f.n)
      .attr('d', path).attr('fill', f => f.fill).attr('stroke', f => s.district && f.rows.some(r => r.id === s.district) ? C().text : 'none').attr('stroke-width', 1.5)
      .attr('aria-label', f => bandName(f) + ' ' + f.n + t(' เขต', ' constituencies'));
    if (!compact) bands.attr('role', 'button').attr('aria-pressed', f => String(f.key === picked));
    // Nodes and their names (moved apart where nodes are thin, with a short tick back to the node).
    const nodeG = g.append('g');
    const drawSide = (nodes, x, isLeft) => {
      const sel = nodeG.selectAll('g.' + (isLeft ? 'l' : 'r')).data(nodes).join('g').attr('class', d => (isLeft ? 'l' : 'r') + ' rv-node mark' + (s.party && d.party !== s.party && !picked ? ' dim' : '')).style('cursor', d => compact ? null : d.party === OTHER ? 'default' : 'pointer');
      sel.append('rect').attr('x', x).attr('y', d => d.y0).attr('width', nw).attr('height', d => Math.max(1.5, d.y1 - d.y0)).attr('rx', 2).attr('fill', d => color(d.party));
      const labels = spread(nodes.map(d => ({ d, y: (d.y0 + d.y1) / 2 })), 15 + up, 6, ih - 4), lx = isLeft ? x - 7 : x + nw + 7, dir = isLeft ? -1 : 1;
      sel.append('path').attr('d', d => { const l = labels.find(v => v.d === d); return 'M' + (isLeft ? x : x + nw) + ',' + l.y + 'L' + (lx - 3 * dir) + ',' + l.ly; }).attr('stroke', C().text4).attr('fill', 'none').attr('opacity', d => { const l = labels.find(v => v.d === d); return Math.abs(l.ly - l.y) > 2 ? 1 : 0; });
      sel.append('text').attr('x', lx).attr('y', d => labels.find(v => v.d === d).ly).attr('dy', '.35em').attr('text-anchor', isLeft ? 'end' : 'start').attr('font-size', fs)
        .attr('font-weight', d => d.party === s.party ? 700 : 500).attr('fill', d => d.party === OTHER ? C().text3 : C().text).text(isLeft ? lLabel : rLabel);
      return sel;
    };
    const lNodes = drawSide(left, x0, true), rNodes = drawSide(right, x1, false);
    // Counts inside bands thick enough to hold them, just right of the winner's node.
    g.append('g').attr('pointer-events', 'none').selectAll('text').data(flows.filter(f => (f.ly1 - f.ly0) >= 13 + up && lit(f))).join('text').attr('x', a + 5).attr('y', f => (f.ly0 + f.ly1) / 2).attr('dy', '.35em')
      .attr('font-size', 11 + up).attr('font-weight', 700).attr('fill', C().text).attr('paint-order', 'stroke').attr('stroke', C().ring).attr('stroke-width', 3).attr('stroke-linejoin', 'round').text(f => f.n);
    const med = list => d3.median(list, r => r.marginPct);
    const nameList = d => d.parties.map(([p, n]) => p + ' ' + n).join(', ');
    bands.on('pointermove', (ev, f) => E.chartTip(ev, '<b>' + esc(bandName(f)) + '</b>' + tipRows([[t('จำนวนเขต', 'Constituencies'), f.n], [t('ชนะกันห่าง (มัธยฐาน)', 'Median margin'), fmtP(med(f.rows), 1)]]) +
      '<small>' + esc(f.rows.slice().sort((p, q) => p.marginPct - q.marginPct).slice(0, 3).map(r => shortName(r) + ' (' + fmtP(r.marginPct, 1) + ')').join(', ')) + (f.n > 3 ? ' …' : '') + '</small><br>' + hint(f.key === picked ? t('คลิกเพื่อยกเลิกการเลือก', 'Click to clear the selection') : t('คลิกเพื่อเลือกเขตชุดนี้', 'Click to select these constituencies'))))
      .on('pointerleave', E.hideChartTip);
    const pickBand = (ev, f) => { E.hideChartTip(); E.setState({ brush: f.key === picked ? null : { source: 'rivals', key: f.key, ids: f.rows.map(r => r.id), label: bandName(f) } }); };
    if (!compact) { bands.on('click', pickBand); keyActivate(bands, pickBand); }
    const nodeTip = (ev, d) => {
      if (d.party === OTHER) return E.chartTip(ev, '<b>' + t('พรรคอื่น', 'Other parties') + '</b><small>' + esc(nameList(d)) + '</small>');
      const won = rows.filter(r => r.winnerParty === d.party).length, second = rows.filter(r => r.runner.party === d.party).length;
      E.chartTip(ev, '<b>' + esc(d.party) + '</b>' + tipRows([[t('ชนะ', 'Won'), won + t(' เขต', '')], [t('ได้อันดับสอง', 'Second'), second + t(' เขต', '')], [t('ติดสองอันดับแรก', 'Top two'), (won + second) + t(' เขต', '')]]) + hint(t('คลิกเพื่อไฮไลต์พรรคทุกกราฟ', 'Click to highlight this party everywhere')));
    };
    const pickNode = (ev, d) => { if (d.party !== OTHER) E.setState({ party: s.party === d.party ? '' : d.party, brush: picked ? null : s.brush }); };
    for (const sel of [lNodes, rNodes]) { sel.on('pointermove', nodeTip).on('pointerleave', E.hideChartTip); if (!compact) { sel.on('click', pickNode); keyActivate(sel.filter(d => d.party !== OTHER).attr('role', 'button').attr('aria-label', d => d.party + ': ' + d.n), pickNode); } }
  }
  function tableRivals() {
    const { rows } = rivalData(), pairs = d3.rollups(rows, v => v, r => r.winnerParty, r => r.runner.party).flatMap(([w, rs]) => rs.map(([r, list]) => ({ w, r, list }))).sort((a, b) => b.list.length - a.list.length);
    return '<table><thead><tr><th>' + t('ผู้ชนะ', 'Winner') + '</th><th>' + t('อันดับสอง', 'Runner-up') + '</th><th class="n">' + t('จำนวนเขต', 'Constituencies') + '</th><th class="n">' + t('ชนะกันห่าง (มัธยฐาน)', 'Median margin') + '</th></tr></thead><tbody>' +
      pairs.map(p => '<tr><td>' + E.dot(p.w) + esc(p.w) + '</td><td>' + E.dot(p.r) + esc(p.r) + '</td><td class="n"><b>' + p.list.length + '</b></td><td class="n">' + fmtP(d3.median(p.list, r => r.marginPct), 1) + '</td></tr>').join('') + '</tbody></table>';
  }

  /* ---------- C: constituency seats against party-list seats ---------- */
  // One line per party from its share of the constituency seats (left) to its share of the party-list seats (right).
  // Shares, not counts, because the tiers differ in size (400 and 100 seats); the counts are in the labels. Parties
  // with fewer than 10 seats in all share one dashed line (a highlighted small party gets its own). The parties that
  // lead each tier are drawn heavier, so a reversal between them reads as two lines crossing.
  function tierRows() {
    const c = E.config(), s = S(), own = p => p.totalSeats >= 10 || p.name === s.party;
    const rows = D.seatParties.filter(own).map(p => ({ key: p.name, label: p.name, color: p.color, cs: p.constituencySeats, ls: p.listSeats, total: p.totalSeats }));
    const rest = D.seatParties.filter(p => !own(p));
    if (rest.length) rows.push({ key: '__rest', label: t('พรรคอื่น ' + rest.length + ' พรรค', rest.length + ' other parties'), color: C().text4, other: true, parties: rest, cs: d3.sum(rest, p => p.constituencySeats), ls: d3.sum(rest, p => p.listSeats), total: d3.sum(rest, p => p.totalSeats) });
    rows.forEach(r => { r.cp = r.cs / c.constituencySeats * 100; r.lp = r.ls / c.listSeats * 100; });
    return rows;
  }
  function tierLeaders(rows) {
    const named = rows.filter(r => !r.other);
    return { topC: d3.greatest(named, r => r.cs), topL: d3.greatest(named, r => r.ls) };
  }
  function tierInsight() {
    const { topC, topL } = tierLeaders(tierRows());
    if (!topC || !topL) return '';
    const n = (v, p) => '<b>' + v + '</b>' + t(' ที่นั่ง', ' seats') + ' (' + fmtP(p, 0) + ')';
    if (topC === topL) return '<b>' + esc(topC.label) + '</b>' + t('ได้มากที่สุดทั้ง ส.ส.เขต ', ' leads both tiers: ') + n(topC.cs, topC.cp) + t(' และบัญชีรายชื่อ ', ' and ') + n(topC.ls, topC.lp);
    return '<b>' + esc(topC.label) + '</b>' + t('ได้ ส.ส.เขตมากที่สุด ', ' won the most constituencies, ') + n(topC.cs, topC.cp) + t(' แต่บัญชีรายชื่อ ', ' but from the list only ') + n(topC.ls, topC.lp) +
      ' · <b>' + esc(topL.label) + '</b>' + t('กลับกัน ได้บัญชีรายชื่อมากที่สุด ', ' is the reverse: the most list seats, ') + n(topL.ls, topL.lp) + t(' แต่ ส.ส.เขต ', ' but constituencies ') + n(topL.cs, topL.cp);
  }
  function tierBrief() {
    const { topC, topL } = tierLeaders(tierRows()); if (!topC || !topL) return '';
    if (topC === topL) return '<b>' + esc(topC.label) + '</b>' + t(' นำทั้ง ส.ส.เขต ', ' leads both: constituencies ') + '<b>' + topC.cs + '</b>' + t(' และบัญชีรายชื่อ ', ', list ') + '<b>' + topC.ls + '</b>';
    return '<b>' + esc(topC.label) + '</b>' + t(' นำ ส.ส.เขต ', ' leads in constituencies, ') + '<b>' + topC.cs + '</b> · <b>' + esc(topL.label) + '</b>' + t(' นำบัญชีรายชื่อ ', ' on the list, ') + '<b>' + topL.ls + '</b>';
  }
  function tierFoot() {
    const c = E.config();
    return '<span>' + t('ซ้าย: % ของ ส.ส.แบ่งเขต ' + c.constituencySeats + ' ที่นั่ง · ขวา: % ของ ส.ส.บัญชีรายชื่อ ' + c.listSeats + ' ที่นั่ง · ตัวเลขคือจำนวนที่นั่ง · คลิกเส้นเพื่อไฮไลต์พรรค', 'Left: % of the ' + c.constituencySeats + ' constituency seats · right: % of the ' + c.listSeats + ' list seats · numbers are seats · click a line to highlight a party') +
      (S().region ? ' · ' + t('ตัวกรองภูมิภาคไม่ใช้กับกราฟนี้ (บัญชีรายชื่อจัดสรรทั้งประเทศ)', 'the region filter does not apply here (list seats are national)') : '') + '</span>';
  }
  // Moves end labels apart (top to bottom) so no two are closer than `gap`, keeping them within [lo, hi].
  function spread(items, gap, lo, hi) {
    const o = items.slice().sort((a, b) => a.y - b.y);
    o.forEach((d, i) => { d.ly = i ? Math.max(d.y, o[i - 1].ly + gap) : Math.max(lo, d.y); });
    const over = o.length ? o[o.length - 1].ly - hi : 0;
    if (over > 0) { o[o.length - 1].ly -= over; for (let i = o.length - 2; i >= 0; i--) o[i].ly = Math.min(o[i].ly, o[i + 1].ly - gap); }
    return items;
  }
  function drawTiers(el) {
    const s = S(), rows = tierRows(), W = el.clientWidth, H = el.clientHeight, c = E.config(), compact = COMPACT, hint = hintOf(compact), up = E.typeUp(), low = compact && H < 230 + 10 * up;
    if (!rows.length) return emptyState(el, t('ไม่มีข้อมูล', 'No data'));
    const tight = W < 520 + 30 * up, pc = v => Math.round(v) + '%';
    const left = r => r.label + ' ' + r.cs + (tight ? '' : ' (' + pc(r.cp) + ')'), right = r => W < 400 ? String(r.ls) : tight ? r.ls + ' ' + r.label : r.ls + ' (' + pc(r.lp) + ') ' + r.label;
    // A low preview keeps one line of column heads; a narrow one uses their short names so the two never meet.
    const m = { t: (low ? 24 : 42) + Math.round(low ? up : 2 * up), b: (compact ? 11 : 12) + Math.round(3 * up), l: Math.min(200 + 14 * up, d3.max(rows, r => textW(left(r), 12 + up)) + 18), r: Math.min(200 + 14 * up, d3.max(rows, r => textW(right(r), 12 + up)) + 18) };
    const iw = Math.max(60, W - m.l - m.r), ih = Math.max(60, H - m.t - m.b);
    const y = d3.scaleLinear([0, d3.max(rows, r => Math.max(r.cp, r.lp)) || 1], [ih, 0]).nice();
    const { topC, topL } = tierLeaders(rows), lead = new Set([topC, topL].filter(Boolean).map(r => r.key));
    const svg = svgFor(el, W, H).attr('role', 'img').attr('aria-label', t('ส.ส.แบ่งเขตกับ ส.ส.บัญชีรายชื่อของแต่ละพรรค: ', 'Constituency and party-list seats by party: ') + rows.map(r => r.label + ' ' + r.cs + ' / ' + r.ls).join(', '));
    const g = svg.append('g').attr('transform', 'translate(' + m.l + ',' + m.t + ')');
    g.append('g').attr('class', 'grid').call(d3.axisLeft(y).ticks(Math.max(2, Math.floor(ih / 45))).tickSize(-iw).tickFormat(''));
    const brief = iw < 210;
    [[0, 'start', brief ? t('ส.ส.เขต', 'Constituency') : t('ส.ส.แบ่งเขต', 'Constituency'), c.constituencySeats], [iw, 'end', brief ? t('บัญชีรายชื่อ', 'List') : t('ส.ส.บัญชีรายชื่อ', 'Party list'), c.listSeats]].forEach(([px, anchor, head, n]) => {
      g.append('line').attr('x1', px).attr('x2', px).attr('y1', -4).attr('y2', ih).attr('stroke', C().text3).attr('stroke-width', 1.2);
      g.append('text').attr('x', px).attr('y', low ? -10 : -26 - up).attr('text-anchor', anchor).attr('font-size', (low ? 12 : 12.5) + up).attr('font-weight', 700).attr('fill', C().text).text(head);
      if (!low) g.append('text').attr('x', px).attr('y', -12).attr('text-anchor', anchor).attr('font-size', 11 + up).attr('fill', C().text3).text(brief ? t('% ของ ' + n, '% of ' + n) : t('% ของ ' + n + ' ที่นั่ง', '% of ' + n + ' seats'));
    });
    const dim = r => !!s.party && s.party !== r.key, heavy = r => s.party ? s.party === r.key : lead.has(r.key);
    const order = rows.slice().sort((a, b) => (b.other ? 1 : 0) - (a.other ? 1 : 0) || (heavy(a) ? 1 : 0) - (heavy(b) ? 1 : 0) || a.total - b.total);
    const grp = g.selectAll('g.tier').data(order).join('g').attr('class', r => 'tier mark' + (dim(r) ? ' dim' : '')).attr('data-key', r => r.key).style('cursor', r => compact ? null : r.other ? 'default' : 'pointer');
    if (!compact) grp.filter(r => !r.other).attr('role', 'button').attr('aria-pressed', r => String(s.party === r.key));
    grp.filter(r => !r.other).attr('aria-label', r => r.label + ': ' + t('ส.ส.เขต ', 'constituency ') + r.cs + ', ' + t('บัญชีรายชื่อ ', 'party list ') + r.ls);
    const across = sel => sel.attr('x1', 0).attr('y1', r => y(r.cp)).attr('x2', iw).attr('y2', r => y(r.lp));
    across(grp.append('line')).attr('stroke', 'transparent').attr('stroke-width', 14);   // easier to point at
    across(grp.append('line').attr('class', 'tier-line')).attr('stroke', r => r.color).attr('stroke-width', r => heavy(r) ? 4 : 2.2).attr('stroke-opacity', r => heavy(r) ? 1 : 0.7).attr('stroke-dasharray', r => r.other ? '5 4' : null).attr('stroke-linecap', 'round');
    for (const [cx, v] of [[0, 'cp'], [iw, 'lp']]) grp.append('circle').attr('cx', cx).attr('cy', r => y(r[v])).attr('r', r => heavy(r) ? 5.5 : 4).attr('fill', r => r.color).attr('stroke', C().ring).attr('stroke-width', 1.5);
    // End labels, nudged apart where shares are close; a short tick joins a moved label to its point.
    const labels = g.append('g').attr('class', 'tier-labels');
    for (const side of ['l', 'r']) {
      const list = spread(rows.map(r => ({ r, y: y(side === 'l' ? r.cp : r.lp) })), 15 + up, -6, ih + 6 - Math.round(up)), ax = side === 'l' ? 0 : iw, dir = side === 'l' ? -1 : 1;
      const lg = labels.selectAll('g.' + side).data(list).join('g').attr('class', d => side + ' mark' + (dim(d.r) ? ' dim' : ''));
      lg.append('path').attr('d', d => 'M' + ax + ',' + d.y + 'L' + (ax + 6 * dir) + ',' + d.ly + 'L' + (ax + 8 * dir) + ',' + d.ly).attr('fill', 'none').attr('stroke', C().text4).attr('stroke-width', 1).attr('opacity', d => Math.abs(d.ly - d.y) > 1 ? 1 : 0);
      lg.append('text').attr('x', ax + 10 * dir).attr('y', d => d.ly).attr('dy', '.35em').attr('text-anchor', side === 'l' ? 'end' : 'start').attr('font-size', 12 + up)
        .attr('font-weight', d => heavy(d.r) ? 700 : 500).attr('fill', d => d.r.other ? C().text3 : C().text).text(d => side === 'l' ? left(d.r) : right(d.r));
    }
    const tip = (ev, r) => E.chartTip(ev, '<b>' + esc(r.label) + '</b>' + tipRows([[t('ส.ส.แบ่งเขต', 'Constituency seats'), r.cs + ' (' + fmtP(r.cp, 1) + t(' ของ ', ' of ') + c.constituencySeats + ')'], [t('ส.ส.บัญชีรายชื่อ', 'Party-list seats'), r.ls + ' (' + fmtP(r.lp, 1) + t(' ของ ', ' of ') + c.listSeats + ')'], [t('รวม', 'Total'), r.total + t(' ที่นั่ง', ' seats') + (r.total ? ' · ' + t('มาจากเขต ', 'from constituencies ') + fmtP(r.cs / r.total * 100, 0) : '')]]) +
      (r.other ? '<small>' + esc(r.parties.map(p => p.name + ' ' + p.totalSeats).join(', ')) + '</small>' + (compact ? '<br>' + hint('') : '') : hint(t('คลิกเพื่อไฮไลต์พรรคทุกกราฟ', 'Click to highlight this party everywhere'))));
    const pick = (ev, r) => { if (!r.other) E.setState({ party: s.party === r.key ? '' : r.key }); };
    grp.on('pointermove', tip).on('pointerleave', E.hideChartTip);
    if (!compact) { grp.on('click', pick); keyActivate(grp.filter(r => !r.other), pick); }
  }
  function tableTiers() {
    const c = E.config();
    return '<table><thead><tr><th>' + t('พรรค', 'Party') + '</th><th class="n">' + t('ส.ส.เขต', 'Constituency') + '</th><th class="n">' + t('% ของ ', '% of ') + c.constituencySeats + '</th><th class="n">' + t('บัญชีรายชื่อ', 'Party list') + '</th><th class="n">' + t('% ของ ', '% of ') + c.listSeats + '</th><th class="n">' + t('รวม', 'Total') + '</th></tr></thead><tbody>' +
      D.seatParties.map(p => '<tr><td>' + E.dot(p.name) + esc(p.name) + '</td><td class="n">' + p.constituencySeats + '</td><td class="n">' + fmtP(p.constituencySeats / c.constituencySeats * 100, 1) + '</td><td class="n">' + p.listSeats + '</td><td class="n">' + fmtP(p.listSeats / c.listSeats * 100, 1) + '</td><td class="n"><b>' + p.totalSeats + '</b></td></tr>').join('') + '</tbody></table>';
  }

  /* ---------- D: finishing places (won, second, third) ---------- */
  // The fourth chart of the overview since 12 Nov 2026. One bar per party, as long as the constituencies it contested:
  // won, second and third in the party's colour from full to pale, everything lower in grey. It shows reach. A party
  // that is in the first three almost everywhere but seldom first has votes without seats (A), is the usual runner-up
  // (B) and takes its seats from the party list (C). The region filter applies.
  const RANK_NAMES = short => short ? [t('ชนะ', 'Won'), t('ที่ 2', '2nd'), t('ที่ 3', '3rd'), t('ที่ 4+', '4th+')] : [t('ชนะ', 'Won'), t('ที่สอง', 'Second'), t('ที่สาม', 'Third'), t('อันดับ 4 ลงไป', 'Fourth or lower')];
  const RANK_DID = () => [t('ชนะ', 'won'), t('ได้ที่สอง', 'second'), t('ได้ที่สาม', 'third'), t('ได้อันดับ 4 ลงไป', 'fourth or lower')];
  function rankData() {
    const s = S(), scope = E.scopeRows().filter(r => r.winner && !r.tied), by = new Map();
    for (const r of scope) {
      r.candidates.filter(c => finite(c.votes)).sort((a, b) => b.votes - a.votes).forEach((c, i) => {
        let o = by.get(c.party);
        if (!o) by.set(c.party, o = { party: c.party, n: 0, p: [0, 0, 0, 0], ids: [[], [], [], []] });
        const k = Math.min(i, 3); o.n++; o.p[k]++; o.ids[k].push(r.id);
      });
    }
    const all = [...by.values()].map(o => Object.assign(o, { top3: o.p[0] + o.p[1] + o.p[2], color: D.colorOf(o.party) }))
      .sort((a, b) => b.p[0] - a.p[0] || b.top3 - a.top3 || b.n - a.n || a.party.localeCompare(b.party, 'th'));
    // Drawn: every party that won a seat here, or was in the first three often enough to matter, or is highlighted.
    const min = Math.max(2, Math.round(scope.length * 0.02));
    return { all, rows: all.filter(o => o.p[0] > 0 || o.top3 >= min || o.party === s.party), total: scope.length };
  }
  function rankInsight() {
    const s = S(), { all } = rankData(); if (!all.length) return '';
    const B = v => '<b>' + v + '</b>', N = o => '<b>' + esc(o.party) + '</b>', of = o => t(' จาก ', ' of the ') + o.n + t(' เขตที่ส่ง', ' it contested');
    if (s.party) {
      const o = all.find(x => x.party === s.party);
      if (!o) return B(esc(s.party)) + t(' ไม่ได้ส่งผู้สมัครในขอบเขตนี้', ' fielded no candidate in this scope');
      return N(o) + t(' ส่งผู้สมัคร ', ' contested ') + B(o.n) + t(' เขต ชนะ ', ' constituencies: won ') + B(o.p[0]) + t(' ได้ที่สอง ', ', second in ') + B(o.p[1]) + t(' ที่สาม ', ', third in ') + B(o.p[2]) +
        ' · ' + t('ติดสามอันดับแรก ', 'in the first three in ') + B(fmtP(o.top3 / o.n * 100, 0)) + t(' ของเขตที่ส่ง', ' of them');
    }
    const reach = d3.greatest(all, o => o.top3), wins = all[0];
    if (reach === wins) return N(wins) + t(' ชนะ ', ' won ') + B(wins.p[0]) + t(' เขต และติดสามอันดับแรก ', ' and was in the first three in ') + B(wins.top3) + of(wins);
    return N(reach) + t('ติดสามอันดับแรกมากที่สุด ', ' was in the first three most often, in ') + B(reach.top3) + of(reach) + t(' แต่ชนะ ', ', but won ') + B(reach.p[0]) +
      ' · ' + N(wins) + t('ชนะมากที่สุด ', ' won the most, ') + B(wins.p[0]) + of(wins);
  }
  function rankBrief() {
    const s = S(), { all } = rankData(), o = s.party ? all.find(x => x.party === s.party) : d3.greatest(all, x => x.top3);
    if (!o) return '';
    return '<b>' + esc(o.party) + '</b>' + t(' ติดสามอันดับแรก ', ' in the first three in ') + '<b>' + o.top3 + '</b>' + t(' เขต ชนะ ', ', won ') + '<b>' + o.p[0] + '</b>';
  }
  function rankFoot() {
    return '<span>' + t('ความยาวแท่ง = จำนวนเขตที่พรรคส่งผู้สมัคร · สีเข้ม = ชนะ จางลง = ที่สองและที่สาม สีเทา = อันดับ 4 ลงไป · คลิกช่วงของแท่งเพื่อเลือกเขตชุดนั้น คลิกชื่อพรรคเพื่อไฮไลต์พรรค',
      'Bar length = constituencies the party contested · solid = won, paler = second and third, grey = fourth or lower · click a part of a bar to select those constituencies, a party name to highlight the party') + scopeNote() + '</span>' + brushFoot();
  }
  function drawRanks(el) {
    const s = S(), data = rankData(), W = el.clientWidth, H = el.clientHeight, compact = COMPACT, hint = hintOf(compact), up = E.typeUp();
    if (!data.rows.length) return emptyState(el, t('ไม่มีเขตในตัวกรองนี้', 'No constituencies in this filter'));
    const fs = (compact && W < 400 ? 11 : 12) + up, m = { t: (compact ? 24 : 32) + Math.round(up), r: 14, b: (compact ? 22 : 38) + Math.round(1.6 * up), l: 0 };
    // A preview shows as many of the largest parties as fit at a readable height; the large chart shows them all.
    let rows = data.rows;
    if (compact) {
      const floor = Math.max(2, Math.round(data.total * 0.05));   // in the first three in at least one constituency in twenty
      rows = rows.filter(o => o.top3 >= floor).slice(0, Math.max(3, Math.min(8, Math.floor((H - m.t - m.b) / (23 + up)))));
      if (!rows.length) rows = data.rows.slice(0, 3);
      const mine = s.party && data.rows.find(o => o.party === s.party);
      if (mine && !rows.includes(mine)) rows[rows.length - 1] = mine;
    }
    m.l = Math.min(170 + 12 * up, d3.max(rows, o => textW(o.party, fs)) + 16);
    const iw = Math.max(60, W - m.l - m.r), ih = Math.max(40, H - m.t - m.b);
    const x = d3.scaleLinear([0, Math.max(1, data.total)], [0, iw]), y = d3.scaleBand(rows.map(o => o.party), [0, ih]).paddingInner(0.3).paddingOuter(0.14), bh = Math.min(28, y.bandwidth());
    const slim = Math.max(5, Math.round(bh * 0.34)), hOf = k => k < 3 ? bh : slim;   // fourth or lower: a slim track, not a fourth strength
    // Rank is the strength of the party's own colour (full, then two paler steps towards the card); the rest is grey.
    const K = [1, 0.55, 0.27], shade = (c, k) => d3.interpolateRgb(C().ring, c)(K[k]), fillOf = (o, k) => k < 3 ? shade(o.color, k) : C().mutedBar;
    const svg = svgFor(el, W, H).attr('role', 'img').attr('aria-label', t('จำนวนเขตที่ผู้สมัครของแต่ละพรรคชนะ ได้ที่สอง และได้ที่สาม: ', 'Constituencies each party won, came second in and came third in: ') + rows.slice(0, 6).map(o => o.party + ' ' + o.p.slice(0, 3).join(' / ')).join(', '));
    // Key, in a neutral ink: the three strengths, then the grey of everything lower. Short words where it is narrow.
    const keyW = list => d3.sum(list, n => 15 + textW(n, fs - 0.5) + 12) - 12;
    const names = keyW(RANK_NAMES(false)) <= W - 12 ? RANK_NAMES(false) : RANK_NAMES(true), full = RANK_NAMES(false);
    const key = svg.append('g').attr('transform', 'translate(' + Math.max(6, Math.min(m.l, W - keyW(names) - 6)) + ',' + (compact ? 10 : 12) + ')').attr('font-size', fs - 0.5).attr('pointer-events', 'none');
    let kx = 0;
    names.forEach((n, k) => {
      key.append('rect').attr('x', kx).attr('y', k < 3 ? -5.5 : -2.5).attr('width', 11).attr('height', k < 3 ? 11 : 5).attr('rx', 2.5).attr('fill', k < 3 ? shade(C().text2, k) : C().mutedBar);
      key.append('text').attr('x', kx + 15).attr('dy', '.35em').attr('fill', C().text2).text(n);
      kx += 15 + textW(n, fs - 0.5) + 12;
    });
    const g = svg.append('g').attr('transform', 'translate(' + m.l + ',' + m.t + ')');
    const ticks = x.ticks(Math.max(2, Math.floor(iw / 80))).filter(Number.isInteger);
    g.append('g').attr('class', 'grid').call(d3.axisBottom(x).tickValues(ticks).tickSize(ih).tickFormat(''));
    g.append('g').attr('class', 'axis').attr('transform', 'translate(0,' + ih + ')').call(d3.axisBottom(x).tickValues(ticks).tickFormat(d3.format('d')).tickSizeOuter(0));
    if (!compact) g.append('text').attr('class', 'axis-title').attr('x', iw).attr('y', ih + 32 + Math.round(1.4 * up)).attr('text-anchor', 'end').text(t('จำนวนเขตที่ส่งผู้สมัคร →', 'constituencies contested →'));
    const picked = s.brush?.source === 'ranks' ? s.brush.key : '';
    const row = g.selectAll('g.rk').data(rows).join('g').attr('class', o => 'rk mark' + (s.party && s.party !== o.party ? ' dim' : '')).attr('data-party', o => o.party).attr('transform', o => 'translate(0,' + (y(o.party) + y.bandwidth() / 2) + ')');
    const label = row.append('text').attr('class', 'rk-name').attr('x', -9).attr('dy', '.35em').attr('text-anchor', 'end').attr('font-size', fs).attr('font-weight', o => s.party === o.party ? 700 : 500).attr('fill', C().text).text(o => o.party);
    const segs = row.selectAll('g.rk-seg').data(o => { let at = 0; return o.p.map((n, k) => { const d = { o, k, n, x0: at, key: o.party + '|' + k }; at += n; return d; }).filter(d => d.n > 0); }).join('g')
      .attr('class', d => 'rk-seg mark' + (picked && picked !== d.key ? ' dim' : '')).attr('data-k', d => d.k).attr('data-n', d => d.n).attr('aria-label', d => d.o.party + ' ' + full[d.k] + ' ' + d.n + t(' เขต', ' constituencies'));
    // A 2 px gap of the card's own colour separates the parts of a bar.
    segs.append('rect').attr('class', 'seg-bar').attr('x', d => x(d.x0) + (d.x0 ? 1 : 0)).attr('y', d => -hOf(d.k) / 2).attr('width', d => Math.max(1, x(d.n) - (d.x0 ? 2 : 1))).attr('height', d => hOf(d.k)).attr('rx', 2.5).attr('fill', d => fillOf(d.o, d.k))
      .attr('stroke', d => d.key === picked ? C().text : 'none').attr('stroke-width', 1.5);
    segs.filter(d => x(d.n) >= textW(String(d.n), fs - 0.5) + 8).append('text').attr('x', d => x(d.x0) + x(d.n) / 2).attr('dy', '.35em').attr('text-anchor', 'middle').attr('font-size', fs - 0.5).attr('font-weight', d => d.k === 0 ? 700 : 600)
      .attr('fill', d => d.k < 3 ? E.inkOn(fillOf(d.o, d.k)) : C().text3).attr('pointer-events', 'none').text(d => d.n)
      .filter(d => d.k === 3).attr('paint-order', 'stroke').attr('stroke', C().ring).attr('stroke-width', 5).attr('stroke-linejoin', 'round');   // the figure sits in a gap of the slim track
    segs.append('rect').attr('x', d => x(d.x0)).attr('y', -y.step() / 2).attr('width', d => Math.max(2, x(d.n))).attr('height', y.step()).attr('fill', 'transparent');   // easier to point at
    const pct = (v, o) => v + ' (' + fmtP(v / o.n * 100, 0) + ')';
    segs.on('pointermove', (ev, d) => E.chartTip(ev, '<b>' + esc(d.o.party) + ' · ' + full[d.k] + ' ' + d.n + t(' เขต', '') + '</b>' +
      tipRows([[t('ส่งผู้สมัคร', 'Contested'), d.o.n + t(' เขต', '')], ...full.map((n, k) => [n, pct(d.o.p[k], d.o)]), [t('ติดสามอันดับแรก', 'In the first three'), pct(d.o.top3, d.o)]]) +
      hint(d.key === picked ? t('คลิกเพื่อยกเลิกการเลือก', 'Click to clear the selection') : t('คลิกเพื่อเลือกเขตชุดนี้', 'Click to select these constituencies')))).on('pointerleave', E.hideChartTip);
    label.on('pointermove', (ev, o) => E.chartTip(ev, '<b>' + esc(o.party) + '</b>' + tipRows([[t('ส่งผู้สมัคร', 'Contested'), o.n + t(' เขต', '')], ...full.map((n, k) => [n, pct(o.p[k], o)]), [t('ติดสามอันดับแรก', 'In the first three'), pct(o.top3, o)]]) +
      hint(t('คลิกเพื่อไฮไลต์พรรคทุกกราฟ', 'Click to highlight this party everywhere')))).on('pointerleave', E.hideChartTip);
    if (compact) return;
    const did = RANK_DID();
    const pickSeg = (ev, d) => { E.hideChartTip(); E.setState({ brush: d.key === picked ? null : { source: 'ranks', key: d.key, ids: d.o.ids[d.k].slice(), label: d.o.party + t(' ', ': ') + did[d.k] } }); };
    const pickParty = (ev, o) => E.setState({ party: s.party === o.party ? '' : o.party });
    segs.style('cursor', 'pointer').attr('role', 'button').attr('aria-pressed', d => String(d.key === picked)).on('click', pickSeg); keyActivate(segs, pickSeg);
    label.style('cursor', 'pointer').attr('role', 'button').attr('aria-pressed', o => String(s.party === o.party)).on('click', pickParty); keyActivate(label, pickParty);
  }
  function tableRanks() {
    const { all } = rankData(), names = RANK_NAMES(false);
    return '<table><thead><tr><th>' + t('พรรค', 'Party') + '</th><th class="n">' + t('ส่งผู้สมัคร (เขต)', 'Contested') + '</th>' + names.map(n => '<th class="n">' + n + '</th>').join('') + '<th class="n">' + t('ติดสามอันดับแรก', 'In the first three') + '</th></tr></thead><tbody>' +
      all.map(o => '<tr><td>' + E.dot(o.party) + esc(o.party) + '</td><td class="n">' + o.n + '</td>' + o.p.map((v, k) => '<td class="n">' + (k ? v : '<b>' + v + '</b>') + '</td>').join('') + '<td class="n">' + o.top3 + ' (' + fmtP(o.top3 / o.n * 100, 0) + ')</td></tr>').join('') + '</tbody></table>';
  }

  /* ---------- building a majority (the House as a hemicycle) ---------- */
  // Replaced the two-ballot bars (11 Nov 2026), which told the votes-and-seats and seat-tier stories a third time.
  // No party holds a majority alone, so the reader puts parties together until their seats pass half of the House.
  // One dot is one seat. The parties picked fill the hemicycle from the left; an even House has exactly half of its
  // dots on each side of the dashed centre line, so a majority is the colour crossing that line and one seat short is
  // the colour stopping at it. Seats only: nothing here says which parties would in fact govern together.
  // The parties picked. Until the reader picks, the government of the day (when the dataset names it), else the
  // largest party.
  const coalMembers = () => {
    const have = new Set(D.seatParties.map(p => p.name)), c = S().coalition;
    if (Array.isArray(c)) return c.filter(n => have.has(n));
    const gov = D.seatParties.filter(p => p.side === 'gov');
    return (gov.length ? gov : D.seatParties.slice(0, 1)).map(p => p.name);
  };
  function coalData() {
    const cfg = E.config(), on = new Set(coalMembers());
    const all = D.seatParties.map(p => ({ name: p.name, seats: p.totalSeats, cons: p.constituencySeats, list: p.listSeats, color: p.color, on: on.has(p.name) }));
    const members = all.filter(p => p.on), rest = all.filter(p => !p.on), seats = d3.sum(members, p => p.seats);
    return { total: cfg.totalSeats, need: cfg.majority, all, members, rest, seats, short: cfg.majority - seats };
  }
  const coalToggle = name => { const cur = coalMembers(); E.setState({ coalition: cur.includes(name) ? cur.filter(n => n !== name) : [...cur, name] }); };
  // Who governs now. parties.csv says which side of the House each party is on (house_side) and election.csv when that
  // was last checked and where it comes from (house_*). Seats are the election result, so the government, the
  // opposition and any party on neither side add up to the whole House. (They replaced a list of ready-made
  // majorities on 12 Nov 2026: what readers wanted here was the real one.)
  function houseSides() {
    const g = { gov: [], opp: [], other: [] };
    for (const p of D.seatParties) if (g[p.side]) g[p.side].push(p);
    if (!g.gov.length && !g.opp.length) return null;
    const c = E.config().house || {}, pack = (key, list) => ({ key, list, n: list.length, seats: d3.sum(list, p => p.totalSeats), names: list.map(p => p.name) });
    return { gov: pack('gov', g.gov), opp: pack('opp', g.opp), other: pack('other', g.other), checkedAt: c.checkedAt || '',
      note: t(c.noteTh || '', c.noteEn || c.noteTh || ''), source: t(c.sourceTh || '', c.sourceEn || c.sourceTh || ''), url: c.sourceUrl || '' };
  }
  const BLOC_NAMES = () => ({ gov: t('ฝ่ายรัฐบาล', 'Government'), opp: t('ฝ่ายค้าน', 'Opposition'), other: t('ไม่อยู่ทั้งสองฝ่าย', 'On neither side') });
  const sameSet = (a, b) => a.length === b.length && a.every(n => b.includes(n));
  // A side's parties in words, each with its seats. Parties with a single seat share one mention: named in full, or
  // only counted when `brief` (a short window).
  function blocText(b, brief) {
    const big = b.list.filter(p => p.totalSeats > 1), ones = b.list.filter(p => p.totalSeats === 1);
    const head = big.map(p => '<span class="nw">' + esc(p.name) + ' <b>' + p.totalSeats + '</b></span>').join(' · ');
    if (!ones.length) return head;
    const tail = brief && ones.length > 2 ? t('พรรค 1 ที่นั่งอีก ' + ones.length + ' พรรค', ones.length + ' more parties with 1 seat each')
      : t('พรรคละ 1 ที่นั่ง: ', '1 seat each: ') + ones.map(p => '<span class="nw">' + esc(p.name) + '</span>').join(t(' ', ', '));
    return (head ? head + ' · ' : '') + tail;
  }
  // Under the two cards: the seats on neither side and why, when this was last checked, and the source.
  const blocNote = s => [s.other.n ? t('อีก ' + s.other.seats + ' เสียงไม่อยู่ทั้งสองฝ่าย', 'Another ' + s.other.seats + ' seats are on neither side') + (s.note ? ': ' + s.note : ' (' + s.other.list.map(p => p.name + ' ' + p.totalSeats).join(', ') + ')') : s.note,
    s.checkedAt ? t('ตรวจสอบล่าสุด ', 'last checked ') + E.thaiDate(s.checkedAt) : '', t('นับตามจำนวน ส.ส. จากผลเลือกตั้ง', 'seats as elected')].filter(Boolean);
  const blocNoteHtml = s => blocNote(s).map(esc).join(' · ') + (s.url ? ' · <a href="' + esc(s.url) + '" target="_blank" rel="noopener" title="' + esc(s.source) + '">' + t('ที่มา', 'source') + '</a>' : s.source ? ' · ' + esc(s.source) : '');
  // `slim` (a narrow card): the number of parties moves down a line so that the name and the seats share the first.
  function blocCard(b, brief, pressed, slim) {
    const need = E.config().majority, gap = b.seats - need, count = b.n + t(' พรรค', b.n === 1 ? ' party' : ' parties');
    return '<button type="button" class="coal-bloc" data-act="coal-bloc" data-v="' + b.key + '" aria-pressed="' + pressed + '" title="' + t('คลิกเพื่อแสดงฝ่ายนี้ในรูปสภา', 'Click to show this side in the House') + '">' +
      '<span class="bh"><b>' + BLOC_NAMES()[b.key] + '</b>' + (slim ? '' : '<small>' + count + '</small>') + '<strong>' + b.seats + '<small>' + t(' เสียง', ' seats') + '</small></strong></span>' +
      '<span class="bs">' + (slim ? count + ' · ' : '') + (gap > 0 ? t('เกินครึ่งสภา (' + need + ') อยู่ ' + gap + ' เสียง', gap + ' more than a majority (' + need + ') needs') : gap === 0 ? t('เกินครึ่งสภาพอดี (' + need + ')', 'exactly a majority (' + need + ')') : t('ไม่ถึงครึ่งสภา ขาดอีก ' + -gap + ' เสียง', -gap + ' short of a majority (' + need + ')')) + '</span>' +
      '<span class="bl">' + blocText(b, brief) + '</span></button>';
  }
  function coalBlocs(sides, brief, slim) {
    const cur = coalMembers();
    return '<div class="coal-now"><p class="coal-nowh">' + t('ตอนนี้ใครเป็นรัฐบาล ใครเป็นฝ่ายค้าน', 'Who governs now, and who is in opposition') + '</p><div class="coal-blocs">' +
      [sides.gov, sides.opp].map(b => blocCard(b, brief, sameSet(cur, b.names), slim)).join('') + '</div><p class="coal-nownote">' + blocNoteHtml(sides) + '</p></div>';
  }
  // The finding follows the parties picked: how far they are from a majority and what would close the gap, or, once
  // past it, which of them it cannot do without.
  function coalInsight() {
    const { total, need, all, members, rest, seats, short } = coalData(), en = E.lang() === 'en';
    const B = v => '<b>' + v + '</b>', N = p => '<b>' + esc(p.name) + '</b>', target = ' (' + need + t(' จาก ', ' of ') + total + ')';
    if (!all.length) return '';
    if (!members.length) return t('ยังไม่ได้เลือกพรรค · ต้องได้ ', 'No party picked yet · a majority takes ') + B(need) + t(' จาก ', ' of ') + total + t(' ที่นั่งจึงจะเกินครึ่งสภา', ' seats') +
      (all[0].seats >= need ? t(' ซึ่ง ', ', which ') + N(all[0]) + t(' ทำได้พรรคเดียว', ' holds alone') : t(' และไม่มีพรรคใดทำได้ด้วยตัวเอง', ', and no party holds one alone'));
    const sides = houseSides(), picked = members.map(p => p.name), bloc = !sides ? '' : sameSet(picked, sides.gov.names) ? 'gov' : sameSet(picked, sides.opp.names) ? 'opp' : '';
    const lead = bloc ? (en ? (bloc === 'gov' ? 'The government of the day, ' : 'The opposition of the day, ') + B(members.length) + (members.length === 1 ? ' party, holds ' : ' parties, holds ') + B(seats) + ' seats'
        : (bloc === 'gov' ? 'ฝ่ายรัฐบาลตอนนี้ ' : 'ฝ่ายค้านตอนนี้ ') + B(members.length) + ' พรรค รวม ' + B(seats) + ' ที่นั่ง')
      : en ? (members.length === 1 ? N(members[0]) + ' holds ' : 'The ' + B(members.length) + ' parties picked hold ') + B(seats) + ' seats'
        : (members.length === 1 ? N(members[0]) + ' มี ' : B(members.length) + ' พรรคที่เลือกรวมได้ ') + B(seats) + ' ที่นั่ง';
    if (short > 0) {
      const done = rest.filter(p => p.seats >= short), near = rest.find(p => p.seats < short && short - p.seats <= 3);
      let next;
      if (done.length === rest.length) next = t('เพิ่มพรรคใดก็ได้อีกพรรคเดียวก็เกินครึ่ง', 'any one more party makes a majority');
      else if (done.length) {
        const names = done.slice(0, 3).map(N), more = done.length - names.length;
        const list = names.length > 1 ? names.slice(0, -1).join(', ') + t(' หรือ ', ' or ') + names.at(-1) : names[0];
        next = t('เพิ่ม ', 'adding ') + list + (more > 0 ? t(' หรืออีก ' + more + ' พรรค', ' or one of ' + more + ' others') : '') + t(' พรรคเดียวก็เกินครึ่ง', ' alone would reach it');
      } else {
        let k = 0, sum = seats;
        for (const p of rest) { if (sum >= need) break; sum += p.seats; k++; }
        next = t('ต้องเพิ่มอีกอย่างน้อย ', 'it takes at least ') + B(k) + t(' พรรค', ' more parties');
      }
      const miss = near && done.length !== rest.length ? t(' ส่วน ', '; with ') + N(near) + t(' จะได้ ', ' it would be ') + (seats + near.seats) + t(' ขาดอีก ', ', ') + (short - near.seats) + t('', ' short') : '';
      return lead + t(' ยังขาดอีก ', ', ') + B(short) + t(' จึงจะเกินครึ่งสภา', ' short of a majority') + target + ' · ' + next + miss;
    }
    const extra = seats - need, piv = members.filter(p => seats - p.seats < need);
    const tail = members.length === 1 ? '' : ' · ' + (piv.length === members.length ? t('ขาดพรรคใดพรรคหนึ่งไป เสียงจะไม่ถึงครึ่ง', 'losing any one of them would end the majority')
      : !piv.length ? t('ถอนพรรคใดพรรคหนึ่งออก เสียงก็ยังเกินครึ่ง', 'it would survive any one party leaving')
        : t('พรรคที่ขาดไม่ได้: ', 'it cannot do without ') + piv.slice(0, 3).map(N).join(', ') + (piv.length > 3 ? t(' และอีก ' + (piv.length - 3) + ' พรรค', ' and ' + (piv.length - 3) + ' more') : ''));
    return lead + t(' เกินครึ่งสภาแล้ว', ', a majority') + (extra > 0 ? t(' มากกว่าที่ต้องใช้ ', ', ') + B(extra) + t(' ที่นั่ง', ' more than needed') : t(' แบบพอดี', ' with none to spare')) + target + tail;
  }
  // Above the party list: what a click on a party does and a button that empties the selection. Where the two cards
  // do not fit under the House (a small desktop window), two short buttons stand in for them.
  const RESET = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>';
  function coalTools(phone, roomy, sides) {
    const now = coalMembers(), names = BLOC_NAMES();
    const clear = '<button type="button" class="coal-clear" data-act="coal-clear"' + (now.length ? '' : ' disabled') + ' title="' + t('ล้างการเลือก', 'Clear the selection') + '" aria-label="' + t('ล้างการเลือก', 'Clear the selection') + '">' + RESET + (phone || roomy ? '<span>' + t('ล้าง', 'Clear') + '</span>' : '') + '</button>';
    if (roomy || phone) return '<div class="coal-tools roomy"><span class="coal-h">' + (phone ? t('แตะพรรคเพื่อเพิ่มหรือเอาออกเอง', 'Tap a party to add or remove it') : t('คลิกพรรคเพื่อเพิ่มหรือเอาออก', 'Click a party to add or remove it')) + '</span>' + clear + '</div>';
    return '<div class="coal-tools">' + (sides ? '<span class="coal-quick">' + [sides.gov, sides.opp].map(b => '<button type="button" class="coal-chip" data-act="coal-bloc" data-v="' + b.key + '" aria-pressed="' + sameSet(now, b.names) + '" title="' +
      esc(names[b.key] + t(' ตอนนี้: ', ' now: ') + b.list.map(p => p.name + ' ' + p.totalSeats).join(', ')) + '">' + (b.key === 'gov' ? t('รัฐบาล', 'Gov.') : t('ฝ่ายค้าน', 'Opp.')) + ' <b>' + b.seats + '</b></button>').join('') + '</span>' : '<span></span>') + clear + '</div>';
  }
  function coalFoot() {
    const cfg = E.config(), sides = houseSides();
    return '<span>' + t('หนึ่งจุดคือ 1 ที่นั่ง จาก ' + cfg.totalSeats + ' · สีเข้มคือพรรคที่เลือก เรียงจากซ้าย · คลิกชื่อพรรคหรือจุดเพื่อเพิ่มหรือเอาออก', 'One dot is one of ' + cfg.totalSeats + ' seats · solid dots are the parties picked, from the left · click a party or a dot to add or remove it') + ' · ' +
      (sides ? t('ฝ่ายรัฐบาลและฝ่ายค้านคือสถานะจริง' + (sides.checkedAt ? ' ณ ' + E.thaiDate(sides.checkedAt) : '') + ' ส่วนการเลือกพรรคเองนับที่นั่งเท่านั้น ไม่ได้บอกว่าพรรคใดจะร่วมรัฐบาลกันจริง', 'the government and the opposition are the real ones' + (sides.checkedAt ? ' as of ' + E.thaiDate(sides.checkedAt) : '') + '; your own picks only count seats, not who would in fact govern together')
        : t('นับที่นั่งเท่านั้น ไม่ได้บอกว่าพรรคใดจะร่วมรัฐบาลกันจริง', 'seats only, not who would in fact govern together')) +
      (S().region ? ' · ' + t('ตัวกรองภูมิภาคไม่ใช้กับกราฟนี้', 'the region filter does not apply here') : '') + '</span>';
  }
  // Seats of a hemicycle in order from the left: rows of dots between an inner and an outer radius, each row holding an
  // even number in proportion to its length, so an even House has exactly half of its seats on each side of the centre.
  function hemicycle(n, R, r0) {
    let best = null;
    for (let K = 2; K <= 40; K++) { const d = (R - r0) / (K - 1), q = Math.min(d, Math.PI * K * (R + r0) / 2 / n); if (!best || q > best.q) best = { K, d, q }; }
    const { K, d, q } = best, radii = d3.range(K).map(k => r0 + k * d), sum = d3.sum(radii);
    const counts = radii.map(r => Math.max(2, 2 * Math.round(n * r / sum / 2)));
    let diff = n - d3.sum(counts);
    for (let k = K - 1, guard = 0; Math.abs(diff) >= 2 && guard < 2000; k = (k + K - 1) % K, guard++) { const step = diff > 0 ? 2 : -2; if (counts[k] + step >= 2) { counts[k] += step; diff -= step; } }
    if (diff) counts[K - 1] += diff;   // an odd House: the extra seat sits on the centre line of the outer row
    const seats = [];
    radii.forEach((r, k) => { for (let j = 0; j < counts[k]; j++) { const f = (j + 0.5) / counts[k], a = Math.PI * (1 - f); seats.push({ f, k, x: r * Math.cos(a), y: -r * Math.sin(a) }); } });
    seats.sort((a, b) => a.f - b.f || a.k - b.k);
    return { seats, rad: Math.max(1.4, q / 2 - 1), halves: n % 2 === 0 && counts.every(c => c % 2 === 0) };
  }
  const CARET = up => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + (up ? 'm18 15-6-6-6 6' : 'm6 9 6 6 6-6') + '"/></svg>';
  function drawCoalition(el) {
    const s = S(), { total, need, all, members, rest, seats, short } = coalData();
    if (!all.length) return emptyState(el, t('ไม่มีข้อมูลที่นั่ง', 'No seat data'));
    // Beside each other when there is room. On a phone the box grows with its content: held upright the House sits
    // above the party list; held sideways it stays in view on the left while the list scrolls past on the right.
    const phone = E.isM(), W = el.clientWidth, H = el.clientHeight, land = phone && W >= 560 && matchMedia('(orientation: landscape)').matches;
    const stack = phone ? !land : W < 400, tight = !phone && !stack && H < 250, roomy = !phone && !stack && H >= 380 && W >= 700;
    const sideW = stack ? W : Math.round(land ? W * 0.44 : roomy ? Math.min(340, Math.max(250, W * 0.28)) : Math.min(330, Math.max(156, W * 0.36))), figW = stack ? W - 8 : W - sideW - (roomy ? 40 : 26), up = E.typeUp(), top = 22 + Math.round(up);
    // Who governs now sits under the House where there is room (a tab of its own, or a phone). The cards are laid out
    // first and measured, and the House takes the height that is left; a short window only counts the one-seat parties.
    const sides = houseSides(), under = !!sides && (roomy || phone), brief = roomy && (H < 560 || figW < 560);
    // The list shows as many parties as fit (the ones picked, then the largest); the others fold into one row.
    const rowH = tight ? 24 : roomy ? 30 : 28, toolH = tight ? 34 : 40, capBase = phone ? 10 : Math.max(3, Math.floor((H - toolH - rowH) / (rowH + 2))), cap = s.coalMore ? all.length : capBase;
    const keep = new Set(members.map(p => p.name));
    for (const p of all) { if (keep.size >= cap) break; keep.add(p.name); }
    const shown = all.filter(p => keep.has(p.name)), hid = all.filter(p => !keep.has(p.name));
    const row = p => {
      const sum = p.on ? seats - p.seats : seats + p.seats;
      const tip = p.on ? t('เอาออกแล้วเหลือ ' + sum + ' ที่นั่ง', 'Without it: ' + sum + ' seats') : t('เพิ่มแล้วรวมเป็น ' + sum + ' ที่นั่ง', 'With it: ' + sum + ' seats') + (sum >= need ? t(' เกินครึ่ง', ', a majority') : t(' ขาดอีก ' + (need - sum), ', ' + (need - sum) + ' short'));
      return '<li><button type="button" class="coal-p' + (s.party === p.name ? ' hl' : '') + '" data-act="coal-toggle" data-v="' + esc(p.name) + '" aria-pressed="' + p.on + '" title="' + esc(p.name + ' ' + p.seats + ' · ' + tip) + '" style="--c:' + esc(p.color) + ';--k:' + E.inkOn(p.color) + '"><span class="box" aria-hidden="true"></span><span class="pn">' + esc(p.name) + '</span><b>' + p.seats + '</b></button></li>';
    };
    const more = hid.length ? '<button type="button" class="coal-more" data-act="coal-more" aria-expanded="false">' + t('อีก ' + hid.length + ' พรรค · ' + d3.sum(hid, p => p.seats) + ' ที่นั่ง', hid.length + ' more · ' + d3.sum(hid, p => p.seats) + ' seats') + CARET(false) + '</button>'
      : s.coalMore && all.length > capBase ? '<button type="button" class="coal-more" data-act="coal-more" aria-expanded="true">' + t('ย่อรายการ', 'Show fewer') + CARET(true) + '</button>' : '';
    const blocs = under ? coalBlocs(sides, brief, !phone && figW < 540) : '';
    // A long selection (the government's 16 parties) can make the list scroll: it keeps its place when redrawn.
    const was = el.querySelector('.coal-side'), keepTop = was ? was.scrollTop : 0;
    el.innerHTML = '<div class="coal' + (stack ? ' vert' : '') + (land ? ' land' : '') + (phone && stack && W < 320 ? ' one' : '') + (tight ? ' tight' : '') + (roomy ? ' roomy' : '') + '"><div class="coal-main"' + (roomy ? ' style="width:' + figW + 'px"' : '') + '><div class="coal-fig"></div>' + (land ? '' : blocs) + '</div>' +
      '<div class="coal-side"' + (stack ? '' : ' style="width:' + sideW + 'px"') + '>' + (land ? blocs : '') + coalTools(phone, roomy, sides) + '<ul class="coal-list" aria-label="' + t('พรรคที่มีที่นั่งในสภา กดเพื่อเพิ่มหรือเอาออกจากการรวมเสียง', 'Parties with seats: press to add or remove') + '">' + shown.map(row).join('') + '</ul>' + more + '</div></div>';

    const sideEl = el.querySelector('.coal-side');
    if (!phone) {
      const fade = () => sideEl.classList.toggle('more-below', sideEl.scrollHeight - sideEl.scrollTop > sideEl.clientHeight + 2);
      sideEl.scrollTop = keepTop; fade(); sideEl.addEventListener('scroll', fade, { passive: true });
    }
    const nowEl = under && !phone ? el.querySelector('.coal-now') : null, nowH = nowEl ? nowEl.offsetHeight + 6 : 0;
    const R = Math.round(Math.max(64, Math.min(figW / 2 - 4, phone ? 220 : H - top - 10 - nowH, roomy ? 400 : 330))), figH = R + top + 8, cx = figW / 2, cy = top + R, r0 = R * 0.4;
    const hem = hemicycle(total, R - 4, r0), order = members.concat(rest);
    let used = 0;
    for (const p of order) { p.dots = hem.seats.slice(used, used + p.seats); used += p.seats; }
    const label = t('รูปสภา ' + total + ' ที่นั่ง: ', 'The House of ' + total + ' seats: ') + (members.length ? members.map(p => p.name + ' ' + p.seats).join(' + ') + ' = ' + seats : t('ยังไม่ได้เลือกพรรค', 'no party picked')) + ' · ' + (short > 0 ? t('ขาดอีก ' + short + ' จึงจะเกินครึ่ง', short + ' short of a majority') : t('เกินครึ่งแล้ว', 'a majority'));
    const svg = d3.select(el).select('.coal-fig').append('svg').attr('width', figW).attr('height', figH).attr('viewBox', [0, 0, figW, figH].join(' ')).style('width', figW + 'px').style('height', figH + 'px').attr('role', 'img').attr('aria-label', label);
    const groups = svg.append('g').attr('transform', 'translate(' + cx + ',' + cy + ')').selectAll('g').data(order).join('g').attr('class', p => 'cp ' + (p.on ? 'on' : 'off') + (s.party === p.name ? ' hl' : '')).attr('data-party', p => p.name).attr('data-seats', p => p.seats).attr('fill', p => p.color).attr('stroke', p => p.color);
    groups.selectAll('circle').data(p => p.dots).join('circle').attr('cx', d => d.x.toFixed(2)).attr('cy', d => d.y.toFixed(2)).attr('r', hem.rad.toFixed(2));
    if (used < hem.seats.length) svg.append('g').attr('transform', 'translate(' + cx + ',' + cy + ')').attr('fill', 'none').attr('stroke', C().text4).selectAll('circle').data(hem.seats.slice(used)).join('circle').attr('cx', d => d.x.toFixed(2)).attr('cy', d => d.y.toFixed(2)).attr('r', (hem.rad - 0.5).toFixed(2));
    if (hem.halves) {
      svg.append('line').attr('x1', cx).attr('x2', cx).attr('y1', top - 6).attr('y2', cy - r0 + hem.rad + 3).attr('stroke', C().text2).attr('stroke-width', 1.2).attr('stroke-dasharray', '4 3').attr('pointer-events', 'none');
      svg.append('text').attr('x', cx).attr('y', 11 + Math.round(up / 2)).attr('text-anchor', 'middle').attr('font-size', 11.5 + up).attr('font-weight', 600).attr('fill', C().text2).attr('pointer-events', 'none').text(t('เลยเส้นประนี้ = เกินครึ่งสภา (' + need + ' ที่นั่ง)', 'Past this line = a majority (' + need + ' seats)'));
    }
    // In the hollow of the hemicycle: the seats put together, and how far that is from a majority.
    const small = (R < 190 ? 12 : 13.5) + up, done = short <= 0, base = small + 8, inner = r0 - hem.rad - 3;
    // The largest figure that stays clear of the innermost row: its top corners must lie inside the hollow.
    let big = Math.round(Math.min(52, R * 0.22));
    while (big > 14 && Math.hypot(textW(String(seats), big) * 0.56, base + big * 0.74) > inner) big--;
    svg.append('text').attr('class', 'coal-num').attr('x', cx).attr('y', cy - base).attr('text-anchor', 'middle').attr('font-size', big).attr('font-weight', 700).attr('fill', C().text).attr('pointer-events', 'none').text(seats);
    svg.append('text').attr('class', 'coal-state' + (done ? ' ok' : '')).attr('x', cx).attr('y', cy - 3).attr('text-anchor', 'middle').attr('font-size', small).attr('font-weight', 600).attr('pointer-events', 'none').text(done ? t('✓ เกินครึ่งแล้ว', '✓ Majority') : t('ขาดอีก ' + short, short + ' short'));

    // Pointing anywhere near a dot finds its party; the party's seats and its row in the list light up together.
    const flat = [];
    order.forEach(p => p.dots.forEach(d => flat.push({ p, x: cx + d.x, y: cy + d.y })));
    const finder = d3.Delaunay.from(flat, d => d.x, d => d.y), reach = Math.max(12, hem.rad * 3);
    const partyAt = ev => { const [px, py] = d3.pointer(ev, svg.node()), d = flat[finder.find(px, py)]; return d && Math.hypot(d.x - px, d.y - py) <= reach ? d.p : null; };
    const buttons = d3.select(el).selectAll('.coal-p');
    const light = name => { groups.classed('hot', p => p.name === name); buttons.classed('hot', function () { return this.dataset.v === name; }); };
    const tipHtml = p => {
      const sum = p.on ? seats - p.seats : seats + p.seats;
      return '<b>' + esc(p.name) + '</b>' + tipRows([[t('ที่นั่งทั้งหมด', 'Seats'), p.seats + ' (' + fmtP(p.seats / total * 100, 1) + t(' ของสภา)', ' of the House)')], [t('ส.ส.เขต · บัญชีรายชื่อ', 'Constituency · list'), p.cons + ' · ' + p.list],
        [p.on ? t('ถ้าเอาออก เหลือ', 'Without it') : t('ถ้าเพิ่ม รวมเป็น', 'With it'), sum + (sum >= need ? t(' (เกินครึ่ง)', ' (a majority)') : t(' (ขาดอีก ' + (need - sum) + ')', ' (' + (need - sum) + ' short)'))]]) +
        '<small>' + (p.on ? t('คลิกเพื่อเอาพรรคนี้ออก', 'Click to remove this party') : t('คลิกเพื่อเพิ่มพรรคนี้', 'Click to add this party')) + '</small>';
    };
    svg.on('pointermove', ev => { const p = partyAt(ev); svg.style('cursor', p ? 'pointer' : null); light(p ? p.name : ''); if (p) E.chartTip(ev, tipHtml(p)); else E.hideChartTip(); })
      .on('pointerleave', ev => { light(''); E.hideChartTip(ev); })
      .on('click', ev => { const p = partyAt(ev); if (p) { E.hideChartTip(); coalToggle(p.name); } });
    buttons.on('pointerenter', function () { light(this.dataset.v); }).on('pointerleave', () => light(''));
  }
  function tableCoalition() {
    const { total, need, all, seats, short } = coalData(), sides = houseSides(), names = BLOC_NAMES(), sideOf = new Map(D.seatParties.map(p => [p.name, p.side]));
    return '<table><thead><tr><th>' + t('พรรค', 'Party') + '</th>' + (sides ? '<th>' + t('ฝ่ายในสภาตอนนี้', 'Side now') + '</th>' : '') + '<th class="n">' + t('ส.ส.เขต', 'Constituency') + '</th><th class="n">' + t('บัญชีรายชื่อ', 'Party list') + '</th><th class="n">' + t('รวม', 'Total') + '</th><th class="n">' + t('% ของสภา', '% of House') + '</th><th>' + t('การรวมเสียง', 'In the group') + '</th></tr></thead><tbody>' +
      all.map(p => '<tr><td>' + E.dot(p.name) + esc(p.name) + '</td>' + (sides ? '<td>' + (names[sideOf.get(p.name)] || '—') + '</td>' : '') + '<td class="n">' + p.cons + '</td><td class="n">' + p.list + '</td><td class="n"><b>' + p.seats + '</b></td><td class="n">' + fmtP(p.seats / total * 100, 1) + '</td><td><button type="button" class="tbl-toggle" data-act="coal-toggle" data-v="' + esc(p.name) + '" aria-pressed="' + p.on + '">' + (p.on ? t('✓ เลือกอยู่ (กดเพื่อเอาออก)', '✓ Picked (press to remove)') : t('กดเพื่อเพิ่ม', 'Press to add')) + '</button></td></tr>').join('') +
      '<tr><td><b>' + t('รวมพรรคที่เลือก', 'Parties picked') + '</b></td>' + (sides ? '<td></td>' : '') + '<td class="n"></td><td class="n"></td><td class="n"><b>' + seats + '</b></td><td class="n">' + fmtP(seats / total * 100, 1) + '</td><td>' + (short > 0 ? t('ขาดอีก ' + short + ' จึงจะเกินครึ่ง (' + need + ')', short + ' short of a majority (' + need + ')') : t('เกินครึ่งแล้ว (ต้องได้ ' + need + ')', 'A majority (' + need + ' needed)')) + '</td></tr></tbody></table>' +
      (sides ? '<table class="coal-sets"><thead><tr><th>' + t('ตอนนี้ในสภา', 'In the House now') + '</th><th>' + t('พรรค', 'Parties') + '</th><th class="n">' + t('เสียง', 'Seats') + '</th><th></th></tr></thead><tbody>' +
        [sides.gov, sides.opp, sides.other].filter(b => b.n).map(b => '<tr><td><b>' + names[b.key] + '</b> <small>' + b.n + t(' พรรค', b.n === 1 ? ' party' : ' parties') + '</small></td><td class="wrap">' + b.list.map(p => esc(p.name) + ' ' + p.totalSeats).join(' · ') + '</td><td class="n"><b>' + b.seats + '</b></td><td>' +
          (b.key === 'other' ? '' : '<button type="button" class="tbl-toggle" data-act="coal-bloc" data-v="' + b.key + '">' + t('แสดงในรูปสภา', 'Show in the House') + '</button>') + '</td></tr>').join('') + '</tbody></table><p class="caveat coal-tnote">' + blocNoteHtml(sides) + '</p>' : '');
  }

  /* ---------- regional heatmap (HTML table: the table view is the chart) ---------- */
  function heatValue(g, party) {
    const m = S().heatMetric, seats = g.seats.find(x => x.party === party)?.count || 0;
    if (m === 'seats') return { v: seats, text: String(seats), num: seats, den: g.count };
    if (m === 'seatShare') return { v: seats / g.count * 100, text: fmtP(seats / g.count * 100, 1), num: seats, den: g.count };
    const sh = D.share(g, party, m === 'list' ? 'partyList' : 'constituency');
    return { v: sh.value, text: fmtP(sh.value, 1), num: sh.votes, den: sh.denominator };
  }
  // Which party leads each region on the metric shown.
  function regionInsight() {
    const parties = D.principal.map(p => p.name), lead = new Map();
    for (const g of D.regions) {
      let best = null;
      for (const p of parties) { const h = heatValue(g, p); if (finite(h.v) && (!best || h.v > best.v)) best = { p, v: h.v }; }
      if (best) lead.set(best.p, [...(lead.get(best.p) || []), g.name]);
    }
    const where = r => r === 'กรุงเทพมหานคร' ? t('กรุงเทพฯ', 'Bangkok') : t('ภาค', '') + E.rname(r);
    return t('ผู้นำแต่ละภูมิภาคตามตัวชี้วัดนี้: ', 'Leader in each region on this metric: ') + [...lead].sort((a, b) => b[1].length - a[1].length).map(([p, regs]) => '<b>' + esc(p) + '</b> ' + (regs.length > 2 ? regs.length + t(' จาก ', ' of ') + D.regions.length + t(' ภูมิภาค', ' regions') : regs.map(where).join(t(' และ', ' and ')))).join(' · ');
  }
  function drawRegion(el) {
    const s = S(), parties = D.principal.map(p => p.name); if (s.party && !parties.includes(s.party)) parties.push(s.party);
    const nat = Object.assign({}, D.national, { name: '__all', count: D.rows.length });
    let regs = D.regions.slice();
    if (s.heatSort === 'party' && s.party) regs.sort((a, b) => (heatValue(b, s.party).v || 0) - (heatValue(a, s.party).v || 0));
    const all = [...regs, nat], max = d3.max(all, g => d3.max(parties, p => heatValue(g, p).v)) || 1;
    const ramp = E.ramps().teal, color = v => finite(v) ? ramp(0.04 + 0.86 * v / max) : C().seatBase;   // a party-free hue (see RAMPS in e69-app.js)
    // Dark mode's ramp runs dark to bright, so the label colour follows each cell's own brightness there.
    const ink = v => E.isDark() ? E.inkOn(color(v)) : finite(v) && v / max > 0.55 ? '#fff' : '#102631';
    el.innerHTML = (E.isM() ? '<p class="m-scroll-hint">' + t('ปัดตารางเพื่อดูพรรคอื่นทางขวา', 'Swipe the table to see more parties') + ' <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg></p>' : '') + '<div class="heat-wrap"><table class="heat"><thead><tr><th scope="col"><span class="heat-corner">' + t('ภูมิภาค \\ พรรค', 'Region \\ party') + '</span></th>' + parties.map(p => '<th scope="col"><button type="button" data-act="party" data-v="' + esc(p) + '" aria-pressed="' + (s.party === p) + '" class="' + (s.party === p ? 'on' : '') + '">' + E.dot(p) + esc(p) + '</button></th>').join('') + '</tr></thead><tbody>' +
      all.map(g => '<tr class="' + (g.name === '__all' ? 'nat' : '') + (s.region === g.name ? ' on' : '') + '"><th scope="row">' + (g.name === '__all' ? t('ทั้งประเทศ', 'Nationwide') : '<button type="button" data-act="an-region" data-v="' + esc(g.name) + '" aria-pressed="' + (s.region === g.name) + '">' + esc(E.rname(g.name)) + ' <small>' + g.count + t(' เขต', '') + '</small></button>') + '</th>' +
        parties.map(p => { const h = heatValue(g, p); return '<td class="' + (s.party === p ? 'colon' : '') + '" style="background:' + color(h.v) + ';color:' + ink(h.v) + '">' + (g.name === '__all' ? '<span>' + h.text + '</span>' : '<button type="button" data-act="an-cell" data-v="' + esc(g.name) + '" data-p="' + esc(p) + '" title="' + esc(E.rname(g.name) + ' · ' + p + ': ' + h.text + ' (' + fmt(h.num) + ' / ' + fmt(h.den) + ')') + '">' + h.text + '</button>') + '</td>'; }).join('') + '</tr>').join('') +
      '</tbody></table></div>' + regionDetail();
    // Phones: the "swipe for more parties" hint only when the table is wider than the screen.
    const hint = el.querySelector('.m-scroll-hint'), wrap = el.querySelector('.heat-wrap');
    if (hint && wrap.scrollWidth <= wrap.clientWidth + 1) hint.remove();
  }
  function regionDetail() {
    const s = S(); if (!s.region) return '<p class="caveat heat-detail">' + tapWords(t('เลือกภูมิภาค (คลิกชื่อแถวหรือช่อง) เพื่อดูรายจังหวัด', 'Pick a region (row header or cell) to see its provinces')) + '</p>';
    const g = D.regions.find(r => r.name === s.region); if (!g) return '';
    const m = s.heatMetric, party = s.party || g.seats[0]?.party;
    const provs = g.provinces.map(code => D.provinceByCode.get(code)).map(p => ({ p, h: heatValue(p, party) })).sort((a, b) => (b.h.v || 0) - (a.h.v || 0));
    const max = d3.max(provs, x => x.h.v) || 1;
    return '<div class="heat-detail"><h3>' + esc(E.rname(g.name)) + ' · ' + E.dot(party) + esc(party) + (s.party ? '' : t(' (พรรคที่ชนะเขตมากที่สุดในภูมิภาค)', ' (party with most seats in region)')) + ' · ' + esc({ list: t('สัดส่วนบัญชีรายชื่อ', 'list share'), cand: t('สัดส่วนผู้สมัคร', 'candidate share'), seats: t('เขตที่ชนะ', 'seats won'), seatShare: t('สัดส่วนเขตที่ชนะ', 'share of seats') }[m]) + '</h3><ol class="prov-bars">' +
      provs.map(({ p, h }) => '<li><button type="button" data-act="province" data-v="' + p.code + '"><span>' + esc(E.pname(p)) + '</span><span class="bar"><i style="width:' + (100 * (h.v || 0) / max) + '%;--c:' + esc(D.colorOf(party)) + '"></i></span><b>' + h.text + '</b></button></li>').join('') + '</ol></div>';
  }

  /* ---------- candidate records ---------- */
  // Replaced the cities-and-countryside chart (11 Nov 2026). Every other chart counts parties or constituencies; this
  // one names the candidates at the extremes. Each ranking is one measure over the candidates in scope (the region,
  // the province or the flow-chart selection in force, and one party's candidates when a party is highlighted), so a
  // ranked bar per candidate is all it needs: the photo, party and constituency say who it is, the line under them
  // names the rival and both totals.
  const REC_KEYS = ['votes', 'margin', 'close', 'loser', 'low'];
  const recordNames = long => [
    ['votes', long ? t('คะแนนมากที่สุด', 'Most votes') : t('คะแนนมากสุด', 'Most votes')],
    ['margin', long ? t('ชนะขาดที่สุด (ทิ้งอันดับสองมากที่สุด)', 'Biggest wins (widest lead)') : t('ชนะขาด', 'Biggest wins')],
    ['close', long ? t('ชนะเฉียดฉิวที่สุด', 'Closest wins') : t('ชนะเฉียดฉิว', 'Closest wins')],
    ['loser', long ? t('แพ้ทั้งที่ได้คะแนนสูง', 'Lost despite a high vote') : t('แพ้คะแนนสูง', 'Best losers')],
    ['low', long ? t('ชนะด้วยคะแนนน้อยที่สุด', 'Won with the fewest votes') : t('ชนะคะแนนน้อย', 'Lowest winners')]];
  const place = r => E.lang() === 'en' ? shortName(r) : r.province + ' เขต ' + r.number;
  const regionWord = r => r === 'กรุงเทพมหานคร' ? t('กรุงเทพฯ', 'Bangkok') : t('ภาค', '') + E.rname(r);
  // Every candidate with a counted result, with the rival that matters: the runner-up for a winner, the winner for
  // everyone else. A seat without a declared winner has no ranking. A winner's lead is ranked as a share of the valid
  // ballots (the margin the overview page uses for "won by under 5%" and its closest races), with the votes beside it.
  let recCache = null;
  function recordPool() {
    if (recCache && recCache.D === D) return recCache.list;
    const list = [];
    for (const r of D.rows) {
      if (!r.winner || r.tied || !(r.validVotes > 0)) continue;
      const cs = r.candidates.filter(c => finite(c.votes)).sort((a, b) => b.votes - a.votes), first = cs[0], second = cs[1] || null, lead = second ? first.votes - second.votes : null;
      cs.forEach((c, i) => list.push({ c, r, win: i === 0, votes: c.votes, share: c.votes / r.validVotes * 100, lead: i === 0 ? lead : null, leadPct: i === 0 && second ? (finite(r.marginPct) ? r.marginPct : lead / r.validVotes * 100) : null, rival: i === 0 ? second : first }));
    }
    recCache = { D, list };
    return list;
  }
  const recordGeo = () => { const s = S(), b = brushSet(); return x => (!s.region || x.r.region === s.region) && (!s.province || x.r.provinceCode === s.province) && (!b || b.has(x.r.id)); };
  function recordData() {
    const s = S(), by = REC_KEYS.includes(s.recordBy) ? s.recordBy : 'votes', field = recordPool().filter(recordGeo()), pool = s.party ? field.filter(x => x.c.party === s.party) : field;
    const lead = by === 'margin' || by === 'close', winners = pool.filter(x => x.win && (!lead || finite(x.leadPct)));
    const all = by === 'votes' ? pool.slice().sort((a, b) => b.votes - a.votes) : by === 'margin' ? winners.sort((a, b) => b.leadPct - a.leadPct) : by === 'close' ? winners.sort((a, b) => a.leadPct - b.leadPct)
      : by === 'loser' ? pool.filter(x => !x.win).sort((a, b) => b.votes - a.votes) : winners.sort((a, b) => a.votes - b.votes);
    return { by, lead, field, all, rows: all.slice(0, Number(s.recordTop) || 10), value: x => lead ? x.leadPct : x.votes };
  }
  function recordScope() {
    const s = S(), bits = [], p = s.province && D.provinceByCode.get(s.province);
    if (p) bits.push(E.ptitle(p)); else if (s.region) bits.push(regionWord(s.region));
    if (s.brush) bits.push(s.brush.label + ' (' + s.brush.ids.length + t(' เขต', ' seats') + ')');
    if (s.party) bits.push(t('พรรค', '') + s.party);
    return bits;
  }
  function recordInsight() {
    const d = recordData(), x = d.rows[0], B = v => '<b>' + v + '</b>', scope = recordScope(), tail = scope.length ? ' · ' + t('เฉพาะ ', 'within ') + scope.map(esc).join(' · ') : '';
    if (!x) return t('ไม่มีผู้สมัครที่เข้าเงื่อนไขนี้', 'No candidate fits this ranking') + tail;
    const winners = d.field.filter(y => y.win), who = y => B(esc(y.c.name)) + ' (' + esc(y.c.party) + ', ' + esc(place(y.r)) + ')';
    let a, b = '';
    if (d.by === 'votes') {
      a = who(x) + t(' ได้คะแนนมากที่สุด ', ' won the most votes, ') + B(fmt(x.votes)) + t(' คะแนน', '');
      const low = d3.least(winners, y => y.votes);
      if (x.win && low && low !== x && low.votes > 0) b = t('มากเป็น ', '') + B((x.votes / low.votes).toFixed(1)) + t(' เท่าของผู้ชนะที่ได้คะแนนน้อยที่สุด (', ' times the lowest winning total (') + fmt(low.votes) + ')';
    } else if (d.by === 'margin') {
      a = who(x) + t(' ชนะขาดที่สุด ทิ้งอันดับสอง ', ' won by the widest lead, ') + B(fmtP(x.leadPct, 1)) + t(' ของบัตรดี (', ' of valid ballots (') + fmt(x.lead) + t(' คะแนน)', ' votes)');
      if (d.all.length >= 4) b = t('ครึ่งหนึ่งของ ', 'half of the ') + B(d.all.length) + t(' เขตในอันดับนี้ชนะกันเกิน ', ' seats ranked here were won by more than ') + B(fmtP(d3.median(d.all, y => y.leadPct), 1));
    } else if (d.by === 'close') {
      a = B(esc(place(x.r))) + t(' สูสีที่สุด ', ' was the closest: ') + B(esc(x.c.name)) + ' (' + esc(x.c.party) + ')' + t(' ชนะเพียง ', ' won by just ') + B(fmt(x.lead)) + t(' คะแนน หรือ ', ' votes, ') + B(fmtP(x.leadPct, 2)) + t(' ของบัตรดี', ' of valid ballots');
      const n = d.all.filter(y => y.leadPct < 1).length;
      if (n > 1) b = B(n) + t(' เขตชนะกันไม่ถึง 1%', ' seats were won by under 1%');
    } else if (d.by === 'loser') {
      a = who(x) + t(' ได้ ', ' polled ') + B(fmt(x.votes)) + t(' คะแนนแต่แพ้', ' and still lost');
      const n = winners.filter(y => y.votes < x.votes).length;
      if (n) b = t('มากกว่าคะแนนของผู้ชนะใน ', 'more than the winners of ') + B(n) + t(' จาก ', ' of ') + B(winners.length) + t(' เขต', ' seats');
    } else {
      a = who(x) + t(' ชนะด้วยคะแนนน้อยที่สุด ', ' won with the fewest votes, ') + B(fmt(x.votes)) + ' (' + fmtP(x.share, 1) + t(' ของบัตรดีในเขต)', ' of valid ballots)');
      const n = d.field.filter(y => !y.win && y.votes > x.votes).length;
      if (n) b = t('ผู้สมัครที่แพ้ ', '') + B(fmt(n)) + t(' คนได้คะแนนมากกว่านี้', ' losing candidates polled more');
    }
    return a + (b ? ' · ' + b : '') + tail;
  }
  function recordFoot() {
    const d = recordData(), s = S();
    return '<span>' + t('แถบยาวตามตัวเลขทางขวา สีแถบคือพรรคของผู้สมัคร · คลิกแถวเพื่อดูผลทั้งเขต · เลือกภูมิภาค จังหวัด หรือพรรคจากตัวกรองเพื่อดูอันดับเฉพาะกลุ่ม',
      'Bars follow the figure on the right, in the candidate\'s party colour · click a row for the whole constituency · pick a region, province or party in the filters to rank within it') +
      (d.lead ? ' · ' + t('ส่วนต่าง = คะแนนที่ทิ้งห่างอันดับสอง ÷ บัตรดีของเขต (เกณฑ์เดียวกับหน้าภาพรวม) ส่วนต่างน้อยคือการแข่งขันสูสี ไม่ใช่หลักฐานของความผิดปกติ', 'lead = votes ahead of the runner-up ÷ valid ballots (as on the overview page); a small lead means a close race, not an irregularity') : '') + '</span>' +
      '<span>' + t('แสดง ', 'Showing ') + d.rows.length + t(' จาก ', ' of ') + fmt(d.all.length) + (d.by === 'votes' || d.by === 'loser' ? t(' คน', ' candidates') : t(' เขต', ' seats')) +
      (s.brush ? ' <button type="button" class="tbl-toggle" data-act="unset" data-v="brush">' + t('ล้างชุดเขตที่เลือกไว้', 'Clear the selected constituencies') + '</button>' : '') + '</span>';
  }
  const recordEmpty = () => t('ไม่มีผู้สมัครที่เข้าเงื่อนไขนี้ในขอบเขตที่เลือก ลองล้างตัวกรองพรรคหรือพื้นที่', 'No candidate fits this ranking in the scope chosen; try clearing the party or area filter');
  // One row per candidate: rank, photo, who and where, the rival with both totals, then a bar and the figure it shows.
  function drawRecords(el) {
    const s = S(), d = recordData();
    if (!d.rows.length) return emptyState(el, recordEmpty());
    const max = d3.max(d.rows, d.value) || 1;
    const gap = t('ส่วนต่างจากอันดับสอง (% ของบัตรดี)', 'Lead over the runner-up (% of valid ballots)');
    const head = { votes: t('คะแนนที่ได้', 'Votes won'), margin: gap, close: gap, loser: t('คะแนนที่ได้ (แต่แพ้)', 'Votes won (and lost)'), low: t('คะแนนที่ได้ (และชนะ)', 'Votes won (and elected)') }[d.by];
    el.innerHTML = '<div class="rec-wrap"><div class="rec-head" aria-hidden="true"><span>' + t('อันดับ · ผู้สมัคร', 'Rank · candidate') + '</span><span>' + head + '</span></div><ol class="rec">' + d.rows.map((x, i) => {
      const r = x.r, c = x.c, v = d.value(x), rv = x.rival;
      const vs = rv ? (x.win ? t('ชนะ ', 'beat ') : t('แพ้ ', 'lost to ')) + esc(rv.name) + ' (' + esc(rv.party) + ') · <span class="nw">' + fmt(x.votes) + t(' ต่อ ', ' to ') + fmt(rv.votes) + '</span>' : t('ไม่มีคู่แข่ง', 'unopposed');
      // The figure ranked, and beside it the same result in the other unit: a lead in % with its votes, votes with their share.
      const figure = d.lead ? fmtP(v, d.by === 'close' ? 2 : 1) : fmt(v);
      const note = d.lead ? t('ห่าง ' + fmt(x.lead) + ' คะแนน', fmt(x.lead) + ' votes ahead') : '<span class="u">' + t('คะแนน · ', 'votes · ') + '</span>' + fmtP(x.share, 1) + t(' ของบัตรดี', ' of valid');
      return '<li' + (s.district === r.id ? ' class="is-cur"' : '') + '><button type="button" class="rec-row" data-act="district" data-v="' + r.id + '">' +
        '<span class="rk">' + (i + 1) + '</span>' + E.face(c, c.party, 'md') +
        '<span class="who"><b>' + E.nm(c.name) + '</b><span class="at">' + E.dot(c.party) + esc(c.party) + ' · ' + esc(place(r)) + '</span><span class="vs">' + vs + '</span></span>' +
        '<span class="bar" aria-hidden="true"><i style="width:' + Math.max(0.8, 100 * v / max).toFixed(2) + '%;--c:' + esc(D.colorOf(c.party)) + '"></i></span>' +
        '<span class="num"><b>' + figure + '</b><small>' + note + '</small></span></button></li>';
    }).join('') + '</ol></div>';
  }
  function tableRecords() {
    const d = recordData();
    if (!d.rows.length) return '<p class="empty-state">' + recordEmpty() + '</p>';
    return '<table><thead><tr><th class="n">#</th><th>' + t('ผู้สมัคร', 'Candidate') + '</th><th>' + t('พรรค', 'Party') + '</th><th>' + t('เขต', 'Constituency') + '</th><th>' + t('ผล', 'Result') + '</th><th class="n">' + t('คะแนน', 'Votes') + '</th><th class="n">' + t('% ของบัตรดี', '% of valid') + '</th><th class="n">' + t('ห่างคู่แข่ง (คะแนน)', 'Gap to rival (votes)') + '</th><th class="n">' + t('ห่างคู่แข่ง (% ของบัตรดี)', 'Gap to rival (% of valid)') + '</th></tr></thead><tbody>' +
      d.rows.map((x, i) => '<tr><td class="n">' + (i + 1) + '</td><td>' + esc(x.c.name) + '</td><td>' + E.dot(x.c.party) + esc(x.c.party) + '</td><td>' + esc(place(x.r)) + '</td><td>' + (x.win ? t('ชนะ', 'Won') : t('แพ้', 'Lost')) + '</td><td class="n">' + fmt(x.votes) + '</td><td class="n">' + fmtP(x.share, 1) + '</td><td class="n">' + (x.rival ? fmtPP(x.votes - x.rival.votes, 0) : '—') + '</td><td class="n">' + (x.rival ? fmtPP((x.votes - x.rival.votes) / x.r.validVotes * 100, 2) + '%' : '—') + '</td></tr>').join('') + '</tbody></table>';
  }

  /* ---------- constituency comparison ---------- */
  // Up to CMP_MAX constituencies side by side, the way shoppers compare products: one column each, the same fact on
  // the same row, and one scale for the bars of a row, so a difference is read by looking across. The reader picks
  // every constituency (nothing is added for them), from a search box or by province; each choice lists the places
  // inside the constituency, because few people know theirs by its number.
  let cmpQuery = '';
  const cmpPicked = () => S().compare.map(id => D.byId.get(id)).filter(Boolean);
  // Places inside a constituency, without the words "อำเภอ" and "เขต" (which would read as a constituency number).
  const areasOf = r => (r.zone || []).map(z => z.replace(/\s*\(.*\)\s*$/, '').replace(/^(กิ่งอำเภอ|อำเภอ|เขต)/, '')).filter((v, i, a) => v && a.indexOf(v) === i);
  const listTop = r => Object.entries(r.partyList || {}).filter(([, v]) => finite(v) && v > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const pct2 = v => fmtP(v, v < 1 ? 2 : 1);
  function compareInsight() {
    const list = cmpPicked(), n = list.length, B = v => '<b>' + v + '</b>';
    if (!n) return t('เลือก 2–' + CMP_MAX + ' เขตที่สนใจ แล้วอ่านเทียบกันทีละแถว: ใครชนะ ชนะห่างแค่ไหน คะแนนผู้สมัคร คะแนนพรรค และการใช้สิทธิ', 'Pick 2–' + CMP_MAX + ' constituencies and read them row by row: who won and by how much, the candidates, the party vote and turnout');
    if (n < 2) return t('เลือกอีกอย่างน้อย 1 เขต เพื่อเทียบกับ ', 'Pick at least one more to set beside ') + B(esc(shortName(list[0])));
    const parties = d3.rollups(list.filter(r => r.winnerParty), v => v.length, r => r.winnerParty).sort((a, b) => b[1] - a[1]);
    const who = !parties.length ? '' : parties.length === 1 ? B(esc(parties[0][0])) + t(' ชนะทั้ง ' + n + ' เขต', ' won all ' + n)
      : t('ผู้ชนะมาจาก ', 'The winners come from ') + B(parties.length) + t(' พรรค: ', ' parties: ') + parties.map(([p, k]) => esc(p) + ' ' + k + t(' เขต', '')).join(t(' ', ', '));
    const rated = list.filter(r => finite(r.marginPct)), close = d3.least(rated, r => r.marginPct), far = d3.greatest(rated, r => r.marginPct);
    const gap = close && far && close !== far ? t('สูสีที่สุด ', 'closest: ') + B(esc(shortName(close))) + t(' ห่าง ', ', won by ') + pct2(close.marginPct) + ' · ' + t('ขาดที่สุด ', 'widest: ') + B(esc(shortName(far))) + t(' ห่าง ', ', by ') + pct2(far.marginPct) : '';
    return [who, gap].filter(Boolean).join(' · ');
  }
  function compareFoot() {
    return '<span>' + t('แถบในแถวเดียวกันใช้สเกลเดียวกัน จึงเทียบความยาวข้ามเขตได้ · เพิ่มเขตได้จากช่อง “เพิ่มเขต” หรือปุ่ม “เพิ่มในการเปรียบเทียบ” ในรายละเอียดเขต',
      'Bars in one row share one scale, so their lengths compare across constituencies · add constituencies in the “Add” box or with “Add to comparison” in a constituency detail') + '</span>';
  }
  const X_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  function compareTable(list) {
    const n = list.length, nat = D.national, na = '<span class="na">' + t('ไม่มีข้อมูล', 'Not available') + '</span>';
    const prov = r => E.lang() === 'en' ? r.provinceEn || r.province : r.province;
    const bar = (v, max, color) => '<span class="bar" aria-hidden="true"><i style="width:' + Math.max(0, Math.min(100, 100 * v / max)).toFixed(2) + '%;--c:' + esc(color) + '"></i></span>';
    // One scale for both vote rows (candidates and parties), rounded up to the next ten, so the two rows compare too.
    const shares = list.flatMap(r => [...r.candidates.slice(0, 3).map(c => c.votes / r.validVotes * 100), ...listTop(r).map(([, v]) => v / r.listValid * 100)]).filter(finite);
    const maxShare = Math.min(100, Math.max(10, Math.ceil((d3.max(shares) || 0) / 10) * 10)), maxMargin = Math.max(10, d3.max(list, r => r.marginPct) || 0);
    const rated = list.filter(r => finite(r.marginPct)), closest = rated.length > 1 && d3.least(rated, r => r.marginPct) !== d3.greatest(rated, r => r.marginPct) ? d3.least(rated, r => r.marginPct) : null;
    const turned = list.filter(r => finite(r.turnoutPct)), busiest = turned.length > 1 && d3.least(turned, r => r.turnoutPct) !== d3.greatest(turned, r => r.turnoutPct) ? d3.greatest(turned, r => r.turnoutPct) : null;
    const tag = s => '<em class="cmp-tag">' + s + '</em>';
    const item = (color, label, v) => '<li><span class="lb">' + label + '</span><b>' + fmtP(v, 1) + '</b>' + bar(v, maxShare, color) + '</li>';
    const cells = {
      winner: r => r.winner && !r.tied ? '<div class="cmp-win">' + E.face(r.winner, r.winnerParty, 'md') + '<span class="who"><b>' + E.nm(r.winnerName) + '</b><span class="pt">' + E.dot(r.winnerParty) + esc(r.winnerParty) + '</span><span class="v">' + fmt(r.winnerVotes) + t(' คะแนน · ', ' votes · ') + fmtP(r.winnerShare, 1) + '</span></span></div>'
        : '<span class="na">' + (r.tied ? t('คะแนนอันดับหนึ่งเท่ากัน', 'First place is tied') : t('ยังไม่มีผู้ชนะ', 'No winner yet')) + '</span>',
      margin: r => !finite(r.marginPct) ? na : '<div class="cmp-big"><b>' + pct2(r.marginPct) + '</b><span>' + fmt(r.marginVotes) + t(' คะแนน', ' votes') + '</span>' + (r === closest ? tag(t('สูสีที่สุด', 'Closest')) : '') + '</div>' + bar(r.marginPct, maxMargin, D.colorOf(r.winnerParty)) +
        (r.runner ? '<p class="cmp-sub">' + t('อันดับสอง: ', 'Second: ') + esc(r.runner.name) + ' <span class="nw">(' + esc(r.runner.party) + ')</span></p>' : ''),
      cands: r => {
        const top = r.candidates.slice(0, 3), more = r.candidates.length - top.length, rest = 100 - d3.sum(top, c => c.votes) / r.validVotes * 100;
        return '<ol class="cmp-list">' + top.map(c => item(D.colorOf(c.party), E.dot(c.party) + '<span class="nm">' + esc(c.name) + '</span> <small>' + esc(c.party) + '</small>', c.votes / r.validVotes * 100)).join('') + '</ol>' +
          (more > 0 ? '<p class="cmp-sub">' + t('อีก ' + more + ' คน รวมกัน ', more + ' more, together ') + fmtP(Math.max(0, rest), 1) + '</p>' : '');
      },
      list: r => {
        const top = listTop(r), lead = top[0] && top[0][0];
        if (!top.length || !(r.listValid > 0)) return na;
        return '<ol class="cmp-list">' + top.map(([p, v]) => item(D.colorOf(p), E.dot(p) + '<span class="nm">' + esc(p) + '</span>', v / r.listValid * 100)).join('') + '</ol>' +
          (r.winnerParty ? '<p class="cmp-sub' + (lead === r.winnerParty ? '' : ' diff') + '">' + (lead === r.winnerParty ? t('พรรคที่นำ ตรงกับพรรคของผู้ชนะ', 'The leading party is the winner\'s') : t('พรรคที่นำ เป็นคนละพรรคกับผู้ชนะ', 'The leading party is not the winner\'s')) + '</p>' : '');
      },
      turnout: r => !finite(r.turnoutPct) ? na : '<div class="cmp-big"><b>' + fmtP(r.turnoutPct, 1) + '</b>' + (r === busiest ? tag(t('มากที่สุด', 'Highest')) : '') + '</div><span class="cmp-ref" style="--ref:' + nat.turnoutRate.value.toFixed(2) + '%">' + bar(r.turnoutPct, 100, C().accentBar) + '</span>' +
        '<p class="cmp-sub">' + fmt(r.turnout) + t(' จากผู้มีสิทธิ ', ' of ') + fmt(r.eligible) + t(' คน', ' eligible') + '</p>',
      spoilt: r => '<dl class="cmp-kv"><div><dt>' + t('บัตรเสีย', 'Invalid') + '</dt><dd>' + fmtP(r.invalid / r.turnout * 100, 1) + ' <small>' + fmt(r.invalid) + t(' ใบ', '') + '</small></dd></div><div><dt>' + t('ไม่เลือกผู้ใด', 'No vote') + '</dt><dd>' + fmtP(r.noVote / r.turnout * 100, 1) + ' <small>' + fmt(r.noVote) + t(' ใบ', '') + '</small></dd></div></dl>',
    };
    const rows = [
      ['winner', t('ผู้ชนะ', 'Winner'), ''],
      ['margin', t('ชนะห่าง<span class="nw">อันดับสอง</span>', 'Lead over second place'), t('% ของบัตรดีในเขต', '% of valid ballots')],
      ['cands', t('ผู้สมัคร <span class="nw">3 อันดับแรก</span>', 'Top three candidates'), t('% ของบัตรดี <span class="nw">บัตรเลือกผู้สมัคร</span>', '% of valid constituency ballots')],
      ['list', t('บัตรเลือกพรรค <span class="nw">3 อันดับแรก</span>', 'Top three parties'), t('% ของบัตรดี <span class="nw">บัญชีรายชื่อ</span>', '% of valid party-list ballots')],
      ['turnout', t('ผู้มาใช้สิทธิ', 'Turnout'), '<span class="nw">' + t('ขีด = ทั้งประเทศ ', 'tick = nationwide ') + fmtP(nat.turnoutRate.value, 1) + '</span>'],
      ['spoilt', t('บัตรเสีย · <span class="nw">ไม่เลือกผู้ใด</span>', 'Invalid · no vote'), '<span class="nw">' + t('บัตรเลือกผู้สมัคร', 'constituency ballot') + '</span> · <span class="nw">' + t('ทั้งประเทศ ', 'nationwide ') + fmtP(nat.invalidRate.value, 1) + t(' และ ', ' and ') + fmtP(nat.noVote.value / nat.turnout.value * 100, 1) + '</span>'],
    ];
    return '<table class="cmpt"><colgroup><col class="lab">' + list.map(() => '<col>').join('') + '</colgroup><thead><tr><td class="cmp-corner"></td>' +
      list.map(r => '<th scope="col" data-id="' + r.id + '"><div class="cmp-colhead"><span class="cmp-name"><b>' + esc(prov(r)) + '</b> ' + t('เขต ', 'No. ') + r.number + '</span><button type="button" class="cmp-x" data-act="compare-remove" data-v="' + r.id + '" title="' + t('เอาเขตนี้ออก', 'Remove this constituency') + '" aria-label="' + esc(t('เอาออก: ', 'Remove: ') + E.dname(r)) + '">' + X_ICON + '</button></div>' +
        '<p class="cmp-areas">' + esc(areasOf(r).join(' · ')) + '</p><button type="button" class="tbl-toggle" data-act="district" data-v="' + r.id + '">' + t('ดูผลทั้งเขต', 'See the full result') + '</button></th>').join('') + '</tr></thead><tbody>' +
      rows.map(([key, head, note]) => '<tr class="r-' + key + '"><th scope="row"><b>' + head + '</b>' + (note ? '<small>' + note + '</small>' : '') + '</th>' + list.map(r => '<td data-name="' + esc(shortName(r)) + '">' + cells[key](r) + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
  }
  // Choices that add a constituency: its number (or full name, in search results), the places inside it and who won.
  function pickerRows(ids, why) {
    const s = S(), full = s.compare.length >= CMP_MAX;
    return '<ul class="cmp-opts">' + ids.map((id, i) => {
      const r = D.byId.get(id), on = s.compare.includes(id), note = why && why[i];
      return '<li><button type="button" data-act="compare-add" data-v="' + id + '"' + (on || full ? ' disabled' : '') + '><span class="t"><b>' + (why ? esc(shortName(r)) : t('เขต ', 'No. ') + r.number) + '</b>' + (on ? '<em>' + t('เลือกแล้ว', 'Picked') + '</em>' : '<i aria-hidden="true">+</i>') + '</span>' +
        '<span class="a">' + (note ? '<mark>' + esc(note) + '</mark> ' : '') + esc(areasOf(r).join(' · ')) + '</span><span class="w">' + E.dot(r.winnerParty) + esc(r.winnerParty || '—') + (r.winnerParty ? t(' ชนะ', ' won') : '') + '</span></button></li>';
    }).join('') + '</ul>';
  }
  function pickerBody() {
    if (cmpQuery.trim()) {
      const hits = E.findDistricts(cmpQuery, 12);
      return hits.length ? pickerRows(hits.map(h => h.id), hits.map(h => h.why)) : '<p class="cmp-none">' + t('ไม่พบเขตที่ตรงกับคำค้น ลองพิมพ์ชื่อจังหวัด อำเภอ หรือชื่อผู้สมัคร', 'No constituency matches. Try a province, a district or a candidate\'s name.') + '</p>';
    }
    const p = cmpProvince && D.provinceByCode.get(cmpProvince);
    return p ? pickerRows(p.ids) : '<p class="cmp-none">' + t('พิมพ์ค้นหา หรือเลือกจังหวัด แล้วกดเขตที่ต้องการ', 'Search, or choose a province, then press a constituency') + '</p>';
  }
  function comparePicker(n) {
    const provs = D.provinces.slice().sort((a, b) => E.pname(a).localeCompare(E.pname(b), E.lang() === 'en' ? 'en' : 'th')), left = CMP_MAX - n;
    return '<aside class="cmp-pick" aria-label="' + t('เลือกเขตมาเปรียบเทียบ', 'Pick constituencies to compare') + '"><h3>' + (n ? t('เพิ่มเขต', 'Add a constituency') + ' <small>' + t('ได้อีก ' + left + ' เขต', left + ' more') + '</small>' : t('เลือกเขตแรก', 'Pick the first constituency')) + '</h3>' +
      '<label class="cmp-find"><span class="sr-only">' + t('ค้นหาเขต', 'Search constituencies') + '</span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg><input type="search" id="cmpSearch" autocomplete="off" placeholder="' + t('ค้นหา: อำเภอ เขต หรือผู้สมัคร', 'Search: a place or a candidate') + '" value="' + esc(cmpQuery) + '"></label>' +
      '<label class="cmp-prov"><span>' + t('หรือเลือกจากจังหวัด', 'or browse a province') + '</span><select id="cmpProvince" aria-label="' + t('เลือกจังหวัดเพื่อดูเขตเลือกตั้ง', 'Choose a province to list its constituencies') + '"><option value="">' + t('เลือกจังหวัด', 'Choose a province') + '</option>' + provs.map(x => '<option value="' + x.code + '"' + (x.code === cmpProvince ? ' selected' : '') + '>' + esc(E.pname(x)) + ' (' + x.count + ')</option>').join('') + '</select></label>' +
      '<div class="cmp-results" id="cmpResults">' + pickerBody() + '</div></aside>';
  }
  // Nothing picked yet: the box that picks the first constituency, and beside it the empty places of the others, each
  // listing the rows the table will have, so the page already reads as columns to fill.
  const CMP_ROWS = () => [t('ผู้ชนะ', 'Winner'), t('ชนะห่างอันดับสอง', 'Lead over second place'), t('ผู้สมัคร 3 อันดับแรก', 'Top three candidates'), t('บัตรเลือกพรรค 3 อันดับแรก', 'Top three parties'), t('ผู้มาใช้สิทธิ', 'Turnout'), t('บัตรเสีย · ไม่เลือกผู้ใด', 'Invalid · no vote')];
  const compareIntro = () => '<div class="cmp-ghosts" aria-hidden="true">' + [[2, t('เลือกต่อจากเขตแรก', 'pick it after the first')], [3, t('ถ้าต้องการเทียบสามเขต', 'if you want a third')]].map(([k, note]) =>
    '<div class="cmp-ghost"><b>' + t('เขตที่ ' + k, 'Constituency ' + k) + '</b><small>' + note + '</small><ul>' + CMP_ROWS().map(r => '<li>' + r + '</li>').join('') + '</ul></div>').join('') + '</div>';
  function drawCompare(el) {
    const list = cmpPicked(), n = list.length;
    // In a narrow box (a small desktop window) the adding box lies across the top instead of beside the table.
    el.innerHTML = '<div class="cmpx n' + n + (!E.isM() && el.clientWidth < 820 ? ' stacked' : '') + '">' + (n ? '<div class="cmp-scroll">' + compareTable(list) + '</div>' + (n < CMP_MAX ? comparePicker(n) : '') : comparePicker(0) + compareIntro()) + '</div>';
    // The search box filters as the reader types (only the list under it is redrawn, so the box keeps its cursor);
    // Enter adds the first match.
    const input = el.querySelector('#cmpSearch'), box = el.querySelector('#cmpResults');
    if (!input) return;
    input.addEventListener('input', () => { cmpQuery = input.value; box.innerHTML = pickerBody(); });
    input.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); box.querySelector('button:not(:disabled)')?.click(); } else if (ev.key === 'Escape' && input.value) { ev.stopPropagation(); input.value = ''; cmpQuery = ''; box.innerHTML = pickerBody(); } });
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
  A.sheetContent = item => item.what === 'brush' ? { title: S().brush?.label || '', html: brushListHtml() }
    : item.what === 'charts' ? { title: t('เลือกกราฟ', 'Choose a chart'), html: chartsPickerHtml() } : { title: '', html: '' };
  // Beside the chart on a wide screen; as a panel over the page on a narrower one, and over the four previews, which
  // keep the whole width.
  const docked = () => matchMedia('(min-width: 1280px)').matches && !inOverview();
  A.showDetail = id => {
    if (docked()) E.setState({ anDetail: { kind: 'district', id } });
    else E.openSheet({ kind: 'district', id }, false);
  };

  A.onAction = (act, v, el) => {
    const s = S();
    if (act === 'an-set') {
      const k = el.dataset.k, inSheet = !!el.closest('#sheet');
      if (E.isM() && k === 'mobileChart' && inSheet) E.closeSheet();   // the chart list closes before the page redraws
      E.hideChartTip();
      // A tab always opens at its start: the first one on its four previews, with no detail panel left beside them.
      E.setState(k === 'analysisTab' ? { analysisTab: v, coreFocus: '', anDetail: v === 'core' ? null : s.anDetail } : { [k]: v });
      if (E.isM() && k === 'mobileChart') document.getElementById('pageAnalysis').scrollTop = 0;
    }
    // Four-chart overview (desktop): a preview opens large; the bar above a large chart leads back or across.
    else if (act === 'an-focus') {
      if (E.isM() || !CORE.includes(v) || s.coreFocus === v && curTab()[0] === 'core') return;
      const card = document.getElementById('card-' + v);
      zoom = card ? { id: v, rect: card.getBoundingClientRect() } : null;   // null when crossing from another large chart
      E.hideChartTip(); refocus = '.an-back';
      E.setState({ analysisTab: 'core', coreFocus: v });
    }
    else if (act === 'an-unfocus') {
      const id = s.coreFocus, card = document.getElementById('card-' + id);
      if (!id) return;
      zoom = card ? { id, rect: card.getBoundingClientRect(), out: true } : null;
      E.hideChartTip(); refocus = '#card-' + id + ' .tile-open';
      E.setState({ coreFocus: '', anDetail: null });
    }
    else if (act === 'an-step') {   // phones: previous / next chart
      const list = MOBILE_TABS().map(x => x[0]), i = list.indexOf(visibleCharts()[0]), j = Math.max(0, Math.min(list.length - 1, i + Number(v)));
      if (j !== i) { E.setState({ mobileChart: list[j] }); document.getElementById('pageAnalysis').scrollTop = 0; }
    }
    else if (act === 'an-picker') E.openSheet({ kind: 'custom', what: 'charts' });
    else if (act === 'an-table') { tableOn.has(v) ? tableOn.delete(v) : tableOn.add(v); A.render(); }
    else if (act === 'brush-list') { if (docked()) E.setState({ anDetail: { kind: 'brush' } }); else E.openSheet({ kind: 'custom', what: 'brush' }); }
    else if (act === 'an-detail-close') E.setState({ anDetail: null });
    else if (act === 'an-region') E.setState({ region: s.region === v ? '' : v, brush: null });
    else if (act === 'an-cell') E.setState({ region: v, party: el.dataset.p, brush: null });
    else if (act === 'compare-add') {
      if (s.compare.includes(v) || s.compare.length >= CMP_MAX) return;
      if (el && el.closest('.cmp-pick')) refocus = cmpQuery.trim() ? '#cmpSearch' : '#cmpProvince';   // ready for the next pick
      E.setState({ compare: [...s.compare, v] });
    }
    else if (act === 'compare-remove') E.setState({ compare: s.compare.filter(id => id !== v) });
    // Majority builder. The control that was pressed is redrawn with the chart; the keyboard goes back to it.
    else if (act === 'coal-toggle') { refocus = '#card-coalition [data-act="coal-toggle"][data-v="' + v.replace(/["\\]/g, '\\$&') + '"]'; coalToggle(v); }
    else if (act === 'coal-clear') { refocus = '#card-coalition .coal-p'; E.setState({ coalition: [] }); }
    else if (act === 'coal-bloc') { const sides = houseSides(), b = sides && sides[v]; if (b) { refocus = '#card-coalition [data-act="coal-bloc"][data-v="' + v + '"]'; E.setState({ coalition: b.names.slice() }); } }
    else if (act === 'coal-more') { refocus = '#card-coalition [data-act="coal-more"]'; E.setState({ coalMore: !s.coalMore }); }
  };
  A.onChange = (id, v, ev) => {
    const k = ev.target.dataset.k;
    if (k) { E.setState({ [k]: v }); return; }
    if (id === 'cmpProvince') { cmpProvince = v; cmpQuery = ''; refocus = '#cmpProvince'; A.render(true); }
  };
})();
