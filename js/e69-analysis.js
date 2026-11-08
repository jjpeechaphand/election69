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
    ['core', t('ภาพรวม 4 กราฟ', 'Four main charts'), ['seats', 'rivals', 'tiers', 'ballots']],
    ['region', t('คะแนนแต่ละภาค', 'Votes by region'), ['region']],
    ['density', t('เมืองกับชนบท', 'Cities and countryside'), ['density']],
    ['compare', t('เปรียบเทียบเขตที่สนใจ', 'Compare constituencies'), ['compare']],
  ];
  const MOBILE_TABS = () => [['seats', t('คะแนนกับที่นั่ง', 'Votes and seats')], ['rivals', t('ใครชนะใคร', 'Who beat whom')], ['tiers', t('ส.ส.เขตกับบัญชีรายชื่อ', 'Constituency vs list seats')], ['ballots', t('คะแนนคนกับคะแนนพรรค', 'Candidate vs party votes')], ['region', t('คะแนนแต่ละภาค', 'Votes by region')], ['density', t('เมืองกับชนบท', 'Cities and countryside')], ['compare', t('เปรียบเทียบเขตที่สนใจ', 'Compare constituencies')]];
  const CMP_MAX = 3;   // constituencies the comparison holds, all picked by the reader

  /* ---------- chart definitions ---------- */
  // Each label is grouped with its control (.ctl) so a wrapping toolbar never leaves a label at the end of a line.
  const seg = (k, opts, label) => '<span class="ctl"><span class="ctl-label">' + label + '</span><span class="seg" role="group" aria-label="' + esc(label) + '">' + opts.map(([v, l]) => '<button type="button" data-act="an-set" data-k="' + k + '" data-v="' + v + '" aria-pressed="' + (String(S()[k]) === v) + '">' + l + '</button>').join('') + '</span></span>';
  const sel = (k, opts, label) => '<span class="ctl"><label class="ctl-label" for="ctl-' + k + '">' + label + '</label><select id="ctl-' + k + '" data-k="' + k + '">' + opts.map(([v, l]) => '<option value="' + esc(v) + '"' + (String(S()[k]) === v ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></span>';
  const scopeLabel = () => S().region ? E.rname(S().region) : t('ทั้งประเทศ', 'nationwide');

  // Four questions, four chart types chosen for their data: two quantities in one unit per party → a scatter against
  // the "seats = votes" line (A); the spread of one quantity over 400 constituencies → a histogram (B); one measure in
  // two tiers per party, where the ranks swap → a slope chart (C); one signed difference per party or constituency →
  // diverging bars from zero (D).
  const CH = {
    // Each card's line under the title (q) is the chart's main finding, computed from the data on screen.
    seats: {
      title: () => t('แต่ละพรรคได้ที่นั่งเกินหรือขาดจากคะแนนเสียงที่ได้แค่ไหน?', 'Did each party win more or fewer seats than its share of the vote?'),
      q: () => seatInsight(),
      controls: () => { const c = E.config(); return seg('seatTier', [['const', t('ส.ส.เขต ' + c.constituencySeats, 'Constituency ' + c.constituencySeats)], ['list', t('บัญชีรายชื่อ ' + c.listSeats, 'Party list ' + c.listSeats)], ['all', t('ทั้งสภา ' + c.totalSeats, 'Whole House ' + c.totalSeats)]], t('ที่นั่ง', 'Seats')); },
      foot: () => seatFoot(),
      draw: drawSeats, table: tableSeats,
    },
    // Replaced "how close were the races" (a margin histogram readers could not use, 7 Nov 2026).
    rivals: {
      title: () => t('ผู้ชนะแต่ละเขตชนะพรรคไหนมา?', 'Which party did each winner beat?'),
      q: () => rivalInsight(),
      controls: () => '',
      foot: () => rivalFoot(),
      draw: drawRivals, table: tableRivals,
    },
    // Replaced "did the winners win a majority" (7 Nov 2026): where each party's seats came from. The two tiers pull
    // in opposite directions for the two largest parties, which a slope from one tier to the other shows as crossing lines.
    tiers: {
      title: () => t('แต่ละพรรคได้ ส.ส. มาจากเขตหรือจากบัญชีรายชื่อ?', 'Did each party win its seats in constituencies or from the party list?'),
      q: () => tierInsight(),
      controls: () => '',
      foot: () => tierFoot(),
      draw: drawTiers, table: tableTiers,
    },
    ballots: {
      title: () => t('พรรคไหนได้คะแนนเพราะตัวผู้สมัคร พรรคไหนได้เพราะชื่อพรรค?', 'Which parties drew votes through their candidates, and which through the party name?'),
      q: () => ballotInsight(),
      controls: () => seg('ballotMode', [['party', t('รายพรรค', 'By party')], ['district', t('รายเขต', 'By constituency')]], t('ระดับ', 'Level')) + seg('ballotUnit', [['share', t('สัดส่วน %', 'Share %')], ['votes', t('คะแนนดิบ', 'Raw votes')]], t('หน่วย', 'Unit')) +
        (S().ballotMode === 'party' ? sel('ballotSort', [['seats', t('ขนาดพรรค (ที่นั่ง)', 'Party size (seats)')], ['gap', t('ส่วนต่าง (พรรค − ผู้สมัคร)', 'Gap (list − candidate)')], ['list', t('คะแนนบัญชีรายชื่อ', 'List share')], ['cand', t('คะแนนผู้สมัคร', 'Candidate share')]], t('เรียง', 'Sort'))
          : sel('ballotSort', [['gap', t('บัญชีสูงกว่าผู้สมัครมากสุด', 'List above candidate most')], ['gapAsc', t('ผู้สมัครสูงกว่าบัญชีมากสุด', 'Candidate above list most')], ['abs', t('ต่างกันมากสุด (ค่าสัมบูรณ์)', 'Largest absolute gap')]], t('เรียง', 'Sort')) + sel('ballotTop', [['15', '15'], ['30', '30'], ['all', t('ทั้งหมด', 'All')]], t('จำนวน', 'Rows'))),
      foot: () => ballotFoot(), draw: drawBallots, table: tableBallots, scroll: () => true,
    },
    region: {
      title: () => t('แต่ละภูมิภาคมีรูปแบบคะแนนของพรรคการเมืองแตกต่างกันอย่างไร?', 'How do party voting patterns differ by region?'),
      q: () => regionInsight(),
      controls: () => sel('heatMetric', [['list', t('สัดส่วนคะแนนบัญชีรายชื่อ (%)', 'Party-list vote share (%)')], ['cand', t('สัดส่วนคะแนนผู้สมัคร (%)', 'Candidate vote share (%)')], ['seats', t('จำนวนเขตที่ชนะ', 'Constituencies won')], ['seatShare', t('สัดส่วนเขตที่ชนะ (%)', 'Share of constituencies won (%)')]], t('ตัวชี้วัด', 'Metric')) + seg('heatSort', [['region', t('ลำดับภูมิภาค', 'Region order')], ['party', t('ตามพรรคที่เลือก', 'By selected party')]], t('เรียงแถว', 'Row order')),
      foot: () => '<span>' + t('คลิกช่องเพื่อเลือกทั้งภูมิภาคและพรรค หรือคลิกหัวแถวและหัวคอลัมน์เพื่อเลือกอย่างใดอย่างหนึ่ง · ', 'Click a cell to pick a region and a party, or a row or column header to pick one · ') + t('สัดส่วนรายภูมิภาคคิดจากคะแนนพรรครวมหารด้วยบัตรดีรวมของบัตรชนิดเดียวกัน ไม่ใช่ค่าเฉลี่ยร้อยละรายเขต สียิ่งเข้มค่ายิ่งสูง ใช้สเกลเดียวทั้งตาราง', 'Regional shares divide total party votes by total valid ballots of the same type, not an average of percentages. Darker means higher, on one scale for the whole table.') + '</span>',
      draw: drawRegion, table: null, html: true,
    },
    // Was a scatter for one party at a time, which opened on a party with no pattern (r = 0.07). The summary shows
    // every major party at once; the province scatter stays one click away.
    density: {
      title: () => t('คนเมืองกับคนชนบทเลือกพรรคต่างกันไหม?', 'Do cities and the countryside vote differently?'),
      q: () => densityInsight(),
      controls: () => { const s = S(), party = densityParty(); return seg('densityView', [['groups', t('สรุปรายพรรค', 'Party summary')], ['provinces', t('รายจังหวัด', 'By province')]], t('มุมมอง', 'View')) + seg('densityBallot', [['partyList', t('บัญชีรายชื่อ', 'Party-list')], ['constituency', t('แบ่งเขต', 'Constituency')]], t('บัตร', 'Ballot')) +
        (s.densityView === 'provinces' ? '<span class="ctl"><label class="ctl-label" for="ctl-densityParty">' + t('พรรค', 'Party') + '</label><select id="ctl-densityParty">' + D.seatParties.map(p => '<option value="' + esc(p.name) + '"' + (p.name === party ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('') + '</select></span>' + seg('densityScale', [['log', t('ลอการิทึม', 'Log')], ['linear', t('เชิงเส้น', 'Linear')]], t('สเกล', 'Scale')) : ''); },
      foot: () => densityFoot(),
      draw: el => (S().densityView === 'provinces' ? drawDensity : drawDensityGroups)(el),
      table: () => S().densityView === 'provinces' ? tableDensity() : tableDensityGroups(),
    },
    compare: {
      title: () => t('เขตที่คุณเลือกต่างกันอย่างไร?', 'How do the constituencies you picked differ?'),
      q: () => compareInsight(),
      controls: () => compareControls(), foot: () => '<span>' + t('เลือกจังหวัดแล้วเลือกเขต เปรียบเทียบได้ 2–' + CMP_MAX + ' เขต หรือกด “เพิ่มในการเปรียบเทียบ” ในรายละเอียดเขต · แถบของตัวชี้วัดเดียวกันใช้สเกลเดียวกัน', 'Pick a province, then a constituency; compare 2–' + CMP_MAX + ', or use “Add to comparison” in a constituency detail · bars for one metric share one scale') + '</span>',
      draw: drawCompare, table: null, html: true,
    },
  };

  function brushFoot() {
    const b = S().brush; if (!b) return '';
    return '<span><b>' + esc(b.label) + '</b> · ' + b.ids.length + t(' เขต', ' constituencies') + ' <button type="button" class="tbl-toggle" data-act="brush-list">' + t('ดูรายชื่อเขต', 'List them') + '</button> <button type="button" class="tbl-toggle" data-act="unset" data-v="brush">' + t('ล้างการเลือก', 'Clear') + '</button></span>';
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
      Object.assign(it, { lx: pick.x, ly: pick.y, anchor: pick.anchor });
    }
    return items;
  }
  // A scatter of seat share against vote share, one dot per party, on one scale. Dots on the dashed line won seats in
  // proportion to their votes; a dot above it won more, below it fewer, and the short stem to the line is the gap.
  function drawSeats(el) {
    const s = S(), { list } = seatVoteRows(), W = el.clientWidth, H = el.clientHeight;
    if (!list.length) return emptyState(el, t('ไม่มีข้อมูล', 'No data'));
    const top = d3.max(list, d => Math.max(d.seatPct, d.votePct)) || 1, room = yTitleRoom(d3.scaleLinear([0, top * 1.06]).nice());
    const m = { t: 12, r: 14, b: 36, l: room.left }, iw = Math.max(80, W - m.l - m.r), ih = Math.max(60, H - m.t - m.b);
    const x = d3.scaleLinear([0, top * 1.06], [0, iw]).nice(), y = d3.scaleLinear([0, x.domain()[1]], [ih, 0]);
    const svg = svgFor(el, W, H).attr('role', 'img').attr('aria-label', t('สัดส่วนที่นั่งเทียบกับสัดส่วนคะแนน: ', 'Seat share against vote share: ') + list.slice(0, 8).map(d => d.name + ' ' + fmtP(d.votePct, 1) + ' → ' + fmtP(d.seatPct, 1)).join(', '));
    const g = svg.append('g').attr('transform', 'translate(' + m.l + ',' + m.t + ')'), mx = x.domain()[1];
    // Above the line: more seats than votes (shaded); the line itself: seats = votes.
    g.append('path').attr('d', 'M0,' + ih + 'L' + iw + ',' + y(mx) + 'L0,' + y(mx) + 'Z').attr('fill', C().band).attr('opacity', 0.7);
    const tx = Math.max(2, Math.floor(iw / 70)), ty = Math.max(2, Math.floor(ih / 45));
    g.append('g').attr('class', 'grid').call(d3.axisLeft(y).ticks(ty).tickSize(-iw).tickFormat(''));
    g.append('g').attr('class', 'axis').attr('transform', 'translate(0,' + ih + ')').call(d3.axisBottom(x).ticks(tx).tickFormat(v => v + '%'));
    g.append('g').attr('class', 'axis').call(d3.axisLeft(y).ticks(ty).tickFormat(v => v + '%'));
    g.append('text').attr('class', 'axis-title').attr('x', iw).attr('y', ih + 30).attr('text-anchor', 'end').text(t('สัดส่วนคะแนน →', 'vote share →'));
    g.append('text').attr('class', 'axis-title').attr('transform', 'rotate(-90)').attr('x', 0).attr('y', room.title).attr('text-anchor', 'end').text(t('สัดส่วนที่นั่ง →', 'seat share →'));
    g.append('line').attr('x1', 0).attr('y1', ih).attr('x2', x(mx)).attr('y2', y(mx)).attr('stroke', C().text3).attr('stroke-width', 1.2).attr('stroke-dasharray', '5 4');
    const note = (txt, px, py, anchor) => g.append('text').attr('x', px).attr('y', py).attr('text-anchor', anchor).attr('font-size', 11).attr('font-weight', 600).attr('fill', C().text3).text(txt);
    note(t('ได้ที่นั่งเกินคะแนน', 'more seats than votes'), 8, 14, 'start');
    note(t('ได้ที่นั่งน้อยกว่าคะแนน', 'fewer seats than votes'), iw - 6, ih - 8, 'end');
    note(t('ที่นั่ง = คะแนน', 'seats = votes'), x(mx * 0.78) + 6, y(mx * 0.78) + 14, 'start').attr('font-weight', 500);
    // Small parties draw first and smaller, so the large ones sit on top.
    const big = d => d.seats >= 10 || d.votePct >= 3, order = list.slice().sort((a, b) => a.seats - b.seats || a.votePct - b.votePct);
    const dots = g.selectAll('g.pt').data(order).join('g').attr('class', d => 'pt mark' + (s.party && s.party !== d.name ? ' dim' : '')).attr('data-seats', d => d.seats)
      .attr('transform', d => 'translate(' + x(d.votePct) + ',' + y(d.seatPct) + ')').style('cursor', 'pointer').attr('role', 'button').attr('aria-pressed', d => String(s.party === d.name))
      .attr('aria-label', d => d.name + ': ' + t('คะแนน ', 'votes ') + fmtP(d.votePct, 1) + ', ' + t('ที่นั่ง ', 'seats ') + fmtP(d.seatPct, 1) + ' (' + d.seats + ')');
    dots.append('line').attr('y2', d => y(d.votePct) - y(d.seatPct)).attr('stroke', d => d.color).attr('stroke-width', d => big(d) ? 2.4 : 1.2).attr('stroke-opacity', 0.55).attr('stroke-linecap', 'round');
    dots.append('circle').attr('r', d => big(d) ? 7 : 4).attr('fill', d => d.color).attr('stroke', C().ring).attr('stroke-width', 1.6);
    dots.append('circle').attr('r', 14).attr('fill', 'transparent');   // easier to point at
    // Names for the larger parties, with how many points they won above or below their votes.
    const lab = d => d.name + ' ' + pts(d.gap);
    const items = list.filter(big).map(d => ({ d, x: x(d.votePct), y: y(d.seatPct), w: textW(lab(d), 11.5) + 2, h: 14, spots: [[11, 0, 'start'], [-11, 0, 'end'], [0, -15, 'middle'], [0, 16, 'middle'], [11, -12, 'start'], [11, 12, 'start'], [-11, -12, 'end'], [-11, 12, 'end']] }));
    placeLabels(items, { x0: 0, x1: iw, y0: 0, y1: ih }, list.filter(big).map(d => ({ x0: x(d.votePct) - 8, x1: x(d.votePct) + 8, y0: y(d.seatPct) - 8, y1: y(d.seatPct) + 8 })));
    g.append('g').attr('class', 'pt-labels').attr('pointer-events', 'none').selectAll('text').data(items).join('text').attr('class', d => 'mark' + (s.party && s.party !== d.d.name ? ' dim' : ''))
      .attr('x', d => d.lx).attr('y', d => d.ly).attr('dy', '.35em').attr('text-anchor', d => d.anchor).attr('font-size', 11.5).attr('font-weight', d => s.party === d.d.name ? 700 : 600)
      .attr('fill', C().text).attr('paint-order', 'stroke').attr('stroke', C().ring).attr('stroke-width', 3).attr('stroke-linejoin', 'round').text(d => lab(d.d));
    const pick = (ev, d) => E.setState({ party: s.party === d.name ? '' : d.name });
    dots.on('pointermove', (ev, d) => E.chartTip(ev, '<b>' + esc(d.name) + '</b>' + tipRows([[t('สัดส่วนคะแนน', 'Vote share'), fmtP(d.votePct, 1) + ' (' + fmt(d.votes) + ')'], [t('สัดส่วนที่นั่ง', 'Seat share'), fmtP(d.seatPct, 1) + ' (' + d.seats + ')'], [t('ที่นั่งเกิน/ขาดจากคะแนน', 'Seats above/below votes'), pts(d.gap) + t(' จุด', ' pts')]]) + '<small>' + t('คลิกเพื่อไฮไลต์พรรคทุกกราฟ', 'Click to highlight this party everywhere') + '</small>'))
      .on('pointerleave', E.hideChartTip).on('click', pick);
    keyActivate(dots, pick);
  }
  function tableSeats() {
    return '<table><thead><tr><th>' + t('พรรค', 'Party') + '</th><th class="n">' + t('คะแนน', 'Votes') + '</th><th class="n">' + t('สัดส่วนคะแนน', 'Vote share') + '</th><th class="n">' + t('ที่นั่ง', 'Seats') + '</th><th class="n">' + t('สัดส่วนที่นั่ง', 'Seat share') + '</th><th class="n">' + t('ต่าง (จุด)', 'Gap (pts)') + '</th></tr></thead><tbody>' +
      seatVoteRows().list.map(d => '<tr><td>' + E.dot(d.name) + esc(d.name) + '</td><td class="n">' + fmt(d.votes) + '</td><td class="n">' + fmtP(d.votePct, 1) + '</td><td class="n"><b>' + d.seats + '</b></td><td class="n">' + fmtP(d.seatPct, 1) + '</td><td class="n">' + pts(d.gap) + '</td></tr>').join('') + '</tbody></table>';
  }

  /* ---------- highlight semantics shared by constituency charts ---------- */
  function highlighter() {
    const s = S(), b = brushSet();
    if (!b && !s.party && !s.province) return null;
    return r => (!b || b.has(r.id)) && (!s.party || r.winnerParty === s.party) && (!s.province || r.provinceCode === s.province);
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
  function rivalFoot() {
    return '<span>' + t('ซ้าย: พรรคของผู้ชนะ · ขวา: พรรคที่ได้อันดับสอง · ความหนาของแถบ = จำนวนเขต · คลิกแถบเพื่อเลือกเขตชุดนั้น · คลิกชื่อพรรคเพื่อไฮไลต์พรรค', 'Left: the winner\'s party · right: the runner-up\'s party · band thickness = constituencies · click a band to select those constituencies, a party to highlight it') + scopeNote() + '</span>' + brushFoot();
  }
  function drawRivals(el) {
    const s = S(), { rows, flows, left, right } = rivalData(), W = el.clientWidth, H = el.clientHeight;
    if (!rows.length) return emptyState(el, t('ไม่มีเขตในตัวกรองนี้', 'No constituencies in this filter'));
    const color = p => p === OTHER ? C().text4 : E.D.colorOf(p);
    const lLabel = d => rivalName(d.party) + ' ' + d.n, rLabel = d => d.n + ' ' + rivalName(d.party);
    const nw = 12, m = { t: 30, b: 6, l: Math.min(170, d3.max(left, d => textW(lLabel(d), 12)) + 16), r: Math.min(170, d3.max(right, d => textW(rLabel(d), 12)) + 16) };
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
    const head = (x, anchor, txt) => g.append('text').attr('x', x).attr('y', -14).attr('text-anchor', anchor).attr('font-size', 12).attr('font-weight', 700).attr('fill', C().text2).text(txt);
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
      .attr('role', 'button').attr('aria-pressed', f => String(f.key === picked)).attr('aria-label', f => bandName(f) + ' ' + f.n + t(' เขต', ' constituencies'));
    // Nodes and their names (moved apart where nodes are thin, with a short tick back to the node).
    const nodeG = g.append('g');
    const drawSide = (nodes, x, isLeft) => {
      const sel = nodeG.selectAll('g.' + (isLeft ? 'l' : 'r')).data(nodes).join('g').attr('class', d => (isLeft ? 'l' : 'r') + ' rv-node mark' + (s.party && d.party !== s.party && !picked ? ' dim' : '')).style('cursor', d => d.party === OTHER ? 'default' : 'pointer');
      sel.append('rect').attr('x', x).attr('y', d => d.y0).attr('width', nw).attr('height', d => Math.max(1.5, d.y1 - d.y0)).attr('rx', 2).attr('fill', d => color(d.party));
      const labels = spread(nodes.map(d => ({ d, y: (d.y0 + d.y1) / 2 })), 15, 6, ih - 4), lx = isLeft ? x - 7 : x + nw + 7, dir = isLeft ? -1 : 1;
      sel.append('path').attr('d', d => { const l = labels.find(v => v.d === d); return 'M' + (isLeft ? x : x + nw) + ',' + l.y + 'L' + (lx - 3 * dir) + ',' + l.ly; }).attr('stroke', C().text4).attr('fill', 'none').attr('opacity', d => { const l = labels.find(v => v.d === d); return Math.abs(l.ly - l.y) > 2 ? 1 : 0; });
      sel.append('text').attr('x', lx).attr('y', d => labels.find(v => v.d === d).ly).attr('dy', '.35em').attr('text-anchor', isLeft ? 'end' : 'start').attr('font-size', 12)
        .attr('font-weight', d => d.party === s.party ? 700 : 500).attr('fill', d => d.party === OTHER ? C().text3 : C().text).text(isLeft ? lLabel : rLabel);
      return sel;
    };
    const lNodes = drawSide(left, x0, true), rNodes = drawSide(right, x1, false);
    // Counts inside bands thick enough to hold them, just right of the winner's node.
    g.append('g').attr('pointer-events', 'none').selectAll('text').data(flows.filter(f => (f.ly1 - f.ly0) >= 13 && lit(f))).join('text').attr('x', a + 5).attr('y', f => (f.ly0 + f.ly1) / 2).attr('dy', '.35em')
      .attr('font-size', 11).attr('font-weight', 700).attr('fill', C().text).attr('paint-order', 'stroke').attr('stroke', C().ring).attr('stroke-width', 3).attr('stroke-linejoin', 'round').text(f => f.n);
    const med = list => d3.median(list, r => r.marginPct);
    const nameList = d => d.parties.map(([p, n]) => p + ' ' + n).join(', ');
    bands.on('pointermove', (ev, f) => E.chartTip(ev, '<b>' + esc(bandName(f)) + '</b>' + tipRows([[t('จำนวนเขต', 'Constituencies'), f.n], [t('ชนะกันห่าง (มัธยฐาน)', 'Median margin'), fmtP(med(f.rows), 1)]]) +
      '<small>' + esc(f.rows.slice().sort((p, q) => p.marginPct - q.marginPct).slice(0, 3).map(r => shortName(r) + ' (' + fmtP(r.marginPct, 1) + ')').join(', ')) + (f.n > 3 ? ' …' : '') + '</small><br><small>' + (f.key === picked ? t('คลิกเพื่อยกเลิกการเลือก', 'Click to clear the selection') : t('คลิกเพื่อเลือกเขตชุดนี้', 'Click to select these constituencies')) + '</small>'))
      .on('pointerleave', E.hideChartTip);
    const pickBand = (ev, f) => { E.hideChartTip(); E.setState({ brush: f.key === picked ? null : { source: 'rivals', key: f.key, ids: f.rows.map(r => r.id), label: bandName(f) } }); };
    bands.on('click', pickBand); keyActivate(bands, pickBand);
    const nodeTip = (ev, d) => {
      if (d.party === OTHER) return E.chartTip(ev, '<b>' + t('พรรคอื่น', 'Other parties') + '</b><small>' + esc(nameList(d)) + '</small>');
      const won = rows.filter(r => r.winnerParty === d.party).length, second = rows.filter(r => r.runner.party === d.party).length;
      E.chartTip(ev, '<b>' + esc(d.party) + '</b>' + tipRows([[t('ชนะ', 'Won'), won + t(' เขต', '')], [t('ได้อันดับสอง', 'Second'), second + t(' เขต', '')], [t('ติดสองอันดับแรก', 'Top two'), (won + second) + t(' เขต', '')]]) + '<small>' + t('คลิกเพื่อไฮไลต์พรรคทุกกราฟ', 'Click to highlight this party everywhere') + '</small>');
    };
    const pickNode = (ev, d) => { if (d.party !== OTHER) E.setState({ party: s.party === d.party ? '' : d.party, brush: picked ? null : s.brush }); };
    for (const sel of [lNodes, rNodes]) { sel.on('pointermove', nodeTip).on('pointerleave', E.hideChartTip).on('click', pickNode); keyActivate(sel.filter(d => d.party !== OTHER).attr('role', 'button').attr('aria-label', d => d.party + ': ' + d.n), pickNode); }
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
    const s = S(), rows = tierRows(), W = el.clientWidth, H = el.clientHeight, c = E.config();
    if (!rows.length) return emptyState(el, t('ไม่มีข้อมูล', 'No data'));
    const tight = W < 520, pc = v => Math.round(v) + '%';
    const left = r => r.label + ' ' + r.cs + (tight ? '' : ' (' + pc(r.cp) + ')'), right = r => tight ? String(r.ls) : r.ls + ' (' + pc(r.lp) + ') ' + r.label;
    const m = { t: 42, b: 12, l: Math.min(200, d3.max(rows, r => textW(left(r), 12)) + 18), r: Math.min(200, d3.max(rows, r => textW(right(r), 12)) + 18) };
    const iw = Math.max(60, W - m.l - m.r), ih = Math.max(60, H - m.t - m.b);
    const y = d3.scaleLinear([0, d3.max(rows, r => Math.max(r.cp, r.lp)) || 1], [ih, 0]).nice();
    const { topC, topL } = tierLeaders(rows), lead = new Set([topC, topL].filter(Boolean).map(r => r.key));
    const svg = svgFor(el, W, H).attr('role', 'img').attr('aria-label', t('ส.ส.แบ่งเขตกับ ส.ส.บัญชีรายชื่อของแต่ละพรรค: ', 'Constituency and party-list seats by party: ') + rows.map(r => r.label + ' ' + r.cs + ' / ' + r.ls).join(', '));
    const g = svg.append('g').attr('transform', 'translate(' + m.l + ',' + m.t + ')');
    g.append('g').attr('class', 'grid').call(d3.axisLeft(y).ticks(Math.max(2, Math.floor(ih / 45))).tickSize(-iw).tickFormat(''));
    [[0, 'start', t('ส.ส.แบ่งเขต', 'Constituency'), c.constituencySeats], [iw, 'end', t('ส.ส.บัญชีรายชื่อ', 'Party list'), c.listSeats]].forEach(([px, anchor, head, n]) => {
      g.append('line').attr('x1', px).attr('x2', px).attr('y1', -4).attr('y2', ih).attr('stroke', C().text3).attr('stroke-width', 1.2);
      g.append('text').attr('x', px).attr('y', -26).attr('text-anchor', anchor).attr('font-size', 12.5).attr('font-weight', 700).attr('fill', C().text).text(head);
      g.append('text').attr('x', px).attr('y', -12).attr('text-anchor', anchor).attr('font-size', 11).attr('fill', C().text3).text(t('% ของ ' + n + ' ที่นั่ง', '% of ' + n + ' seats'));
    });
    const dim = r => !!s.party && s.party !== r.key, heavy = r => s.party ? s.party === r.key : lead.has(r.key);
    const order = rows.slice().sort((a, b) => (b.other ? 1 : 0) - (a.other ? 1 : 0) || (heavy(a) ? 1 : 0) - (heavy(b) ? 1 : 0) || a.total - b.total);
    const grp = g.selectAll('g.tier').data(order).join('g').attr('class', r => 'tier mark' + (dim(r) ? ' dim' : '')).attr('data-key', r => r.key).style('cursor', r => r.other ? 'default' : 'pointer');
    grp.filter(r => !r.other).attr('role', 'button').attr('aria-pressed', r => String(s.party === r.key)).attr('aria-label', r => r.label + ': ' + t('ส.ส.เขต ', 'constituency ') + r.cs + ', ' + t('บัญชีรายชื่อ ', 'party list ') + r.ls);
    const across = sel => sel.attr('x1', 0).attr('y1', r => y(r.cp)).attr('x2', iw).attr('y2', r => y(r.lp));
    across(grp.append('line')).attr('stroke', 'transparent').attr('stroke-width', 14);   // easier to point at
    across(grp.append('line').attr('class', 'tier-line')).attr('stroke', r => r.color).attr('stroke-width', r => heavy(r) ? 4 : 2.2).attr('stroke-opacity', r => heavy(r) ? 1 : 0.7).attr('stroke-dasharray', r => r.other ? '5 4' : null).attr('stroke-linecap', 'round');
    for (const [cx, v] of [[0, 'cp'], [iw, 'lp']]) grp.append('circle').attr('cx', cx).attr('cy', r => y(r[v])).attr('r', r => heavy(r) ? 5.5 : 4).attr('fill', r => r.color).attr('stroke', C().ring).attr('stroke-width', 1.5);
    // End labels, nudged apart where shares are close; a short tick joins a moved label to its point.
    const labels = g.append('g').attr('class', 'tier-labels');
    for (const side of ['l', 'r']) {
      const list = spread(rows.map(r => ({ r, y: y(side === 'l' ? r.cp : r.lp) })), 15, -6, ih + 6), ax = side === 'l' ? 0 : iw, dir = side === 'l' ? -1 : 1;
      const lg = labels.selectAll('g.' + side).data(list).join('g').attr('class', d => side + ' mark' + (dim(d.r) ? ' dim' : ''));
      lg.append('path').attr('d', d => 'M' + ax + ',' + d.y + 'L' + (ax + 6 * dir) + ',' + d.ly + 'L' + (ax + 8 * dir) + ',' + d.ly).attr('fill', 'none').attr('stroke', C().text4).attr('stroke-width', 1).attr('opacity', d => Math.abs(d.ly - d.y) > 1 ? 1 : 0);
      lg.append('text').attr('x', ax + 10 * dir).attr('y', d => d.ly).attr('dy', '.35em').attr('text-anchor', side === 'l' ? 'end' : 'start').attr('font-size', 12)
        .attr('font-weight', d => heavy(d.r) ? 700 : 500).attr('fill', d => d.r.other ? C().text3 : C().text).text(d => side === 'l' ? left(d.r) : right(d.r));
    }
    const tip = (ev, r) => E.chartTip(ev, '<b>' + esc(r.label) + '</b>' + tipRows([[t('ส.ส.แบ่งเขต', 'Constituency seats'), r.cs + ' (' + fmtP(r.cp, 1) + t(' ของ ', ' of ') + c.constituencySeats + ')'], [t('ส.ส.บัญชีรายชื่อ', 'Party-list seats'), r.ls + ' (' + fmtP(r.lp, 1) + t(' ของ ', ' of ') + c.listSeats + ')'], [t('รวม', 'Total'), r.total + t(' ที่นั่ง', ' seats') + (r.total ? ' · ' + t('มาจากเขต ', 'from constituencies ') + fmtP(r.cs / r.total * 100, 0) : '')]]) +
      '<small>' + (r.other ? esc(r.parties.map(p => p.name + ' ' + p.totalSeats).join(', ')) : t('คลิกเพื่อไฮไลต์พรรคทุกกราฟ', 'Click to highlight this party everywhere')) + '</small>');
    const pick = (ev, r) => { if (!r.other) E.setState({ party: s.party === r.key ? '' : r.key }); };
    grp.on('pointermove', tip).on('pointerleave', E.hideChartTip).on('click', pick);
    keyActivate(grp.filter(r => !r.other), pick);
  }
  function tableTiers() {
    const c = E.config();
    return '<table><thead><tr><th>' + t('พรรค', 'Party') + '</th><th class="n">' + t('ส.ส.เขต', 'Constituency') + '</th><th class="n">' + t('% ของ ', '% of ') + c.constituencySeats + '</th><th class="n">' + t('บัญชีรายชื่อ', 'Party list') + '</th><th class="n">' + t('% ของ ', '% of ') + c.listSeats + '</th><th class="n">' + t('รวม', 'Total') + '</th></tr></thead><tbody>' +
      D.seatParties.map(p => '<tr><td>' + E.dot(p.name) + esc(p.name) + '</td><td class="n">' + p.constituencySeats + '</td><td class="n">' + fmtP(p.constituencySeats / c.constituencySeats * 100, 1) + '</td><td class="n">' + p.listSeats + '</td><td class="n">' + fmtP(p.listSeats / c.listSeats * 100, 1) + '</td><td class="n"><b>' + p.totalSeats + '</b></td></tr>').join('') + '</tbody></table>';
  }

  /* ---------- D: two ballots, diverging bars ---------- */
  function ballotData() {
    const s = S(), scope = E.scopeRows(), votes = s.ballotUnit === 'votes';
    if (s.ballotMode === 'party') {
      const names = D.principal.map(p => p.name); if (s.party && !names.includes(s.party)) names.push(s.party);
      const data = names.map(name => D.pairedBallots(scope, name)).filter(d => d.n > 0).map(d => ({ key: d.party, label: d.party, party: d.party, a: votes ? d.candidateVotes : d.candidateShare, b: votes ? d.listVotes : d.listShare, gap: votes ? d.voteGap : d.ppGap, d }));
      const k = s.ballotSort === 'list' ? 'b' : s.ballotSort === 'cand' ? 'a' : 'gap', seats = p => D.partyIndex.get(p.party)?.totalSeats || 0;
      return { rows: data.sort(s.ballotSort === 'gap' || s.ballotSort === 'list' || s.ballotSort === 'cand' ? (p, q) => q[k] - p[k] : (p, q) => seats(q) - seats(p)), all: data, missing: 0, total: data.length };
    }
    const b = brushSet(), base = scope.filter(r => !b || b.has(r.id));
    const all = base.map(r => { const c = D.comparison(r, s.party || ''); return { key: r.id, label: shortName(r), r, party: c.party, a: votes ? c.candidateVotes : c.candidateShare, b: votes ? c.listVotes : c.listShare, gap: votes ? c.voteGap : c.ppGap, c }; });
    const ok = all.filter(x => finite(x.gap) && finite(x.a) && finite(x.b));
    const sorter = { gap: (p, q) => q.gap - p.gap, gapAsc: (p, q) => p.gap - q.gap, abs: (p, q) => Math.abs(q.gap) - Math.abs(p.gap) }[s.ballotSort] || ((p, q) => q.gap - p.gap);
    ok.sort(sorter);
    return { rows: s.ballotTop === 'all' ? ok : ok.slice(0, Number(s.ballotTop) || 15), all: ok, missing: all.length - ok.length, total: all.length, available: ok.length };
  }
  // A big positive candidate lead suggests a personal or local vote; a party-list lead, votes for the party name.
  function ballotInsight() {
    const s = S();
    if (s.ballotMode === 'party') {
      const ds = D.principal.map(p => D.pairedBallots(E.scopeRows(), p.name)).filter(d => d.n >= 20 && finite(d.ppGap));
      const cand = d3.least(ds, d => d.ppGap), party = d3.greatest(ds, d => d.ppGap);
      if (!cand) return '';
      return t('ผู้สมัครของ', 'Candidates of ') + '<b>' + esc(cand.party) + '</b>' + t('ได้คะแนนมากกว่าคะแนนพรรคตัวเอง ', ' out-polled their own party list by ') + '<b>' + Math.abs(cand.ppGap).toFixed(1) + t(' จุด', ' points') + '</b>' +
        (party && party.ppGap > 0 ? ' · <b>' + esc(party.party) + '</b>' + t('กลับกัน คะแนนพรรคสูงกว่าผู้สมัคร ', ' is the reverse: its party list out-polled its candidates by ') + '<b>' + party.ppGap.toFixed(1) + t(' จุด', ' points') + '</b>' : '');
    }
    const { all } = ballotData(); if (!all.length) return '';
    return t('ใน ', 'In ') + '<b>' + all.filter(d => d.gap < 0).length + '/' + all.length + t(' เขต', '') + '</b>' + t('ที่เทียบได้ ผู้สมัครได้คะแนนมากกว่าคะแนนพรรค', ' comparable constituencies the candidate out-polled the party list') + ' (' + (s.party ? esc(s.party) : t('พรรคของผู้ชนะแต่ละเขต', 'each winner\'s party')) + ')';
  }
  function ballotFoot() {
    const s = S(), { missing, total, available } = ballotData();
    const legend = '<span>' + t('แท่งไปทางขวา: บัตรเลือกพรรคได้มากกว่า · ทางซ้าย: บัตรเลือกผู้สมัครได้มากกว่า', 'Bars right: the party-list ballot drew more · left: the candidate ballot drew more') + ' · ' + (s.ballotMode === 'party' ? t('คลิกพรรคเพื่อดูรายเขต · นับเฉพาะเขตที่พรรคส่งผู้สมัคร', 'click a party for its constituencies · only where it fielded a candidate') : t('รายเขต: ', 'by constituency: ') + (s.party ? esc(s.party) : t('พรรคของผู้ชนะแต่ละเขต', 'each winner\'s party')) + (s.brush ? t(' · เฉพาะเขตที่ลากเลือก', ' · brushed only') : '')) + scopeNote() + '</span>';
    if (s.ballotMode === 'party') return legend;
    return legend + '<span>' + t('แสดง ', 'Showing ') + Math.min(available, s.ballotTop === 'all' ? available : Number(s.ballotTop)) + '/' + available + t(' เขตที่เทียบได้', ' comparable') + (missing ? ' ' + t('ไม่มีผู้สมัครของพรรคหรือข้อมูลไม่ครบ ', 'no party candidate or incomplete data in ') + missing + '/' + total + t(' เขต (ไม่แทนด้วยศูนย์)', ' (not treated as zero)') : '') + '</span>';
  }
  // Diverging bars from zero: right when the party-list ballot drew more than the party's candidates, left when the
  // candidates drew more; the bar is the gap, in percentage points (or votes), in the party's colour.
  function drawBallots(el) {
    const s = S(), { rows } = ballotData(), W = el.clientWidth, votes = s.ballotUnit === 'votes';
    if (!rows.length) return emptyState(el, t('ไม่มีข้อมูลที่เทียบได้ในขอบเขตนี้', 'Nothing comparable in this scope'));
    // Rows keep a readable height; when the card is short the chart scrolls inside its own box.
    const H = Math.max(el.clientHeight, rows.length * 26 + 70);
    const amount = g => votes ? fmt(Math.abs(g)) : Math.abs(g).toFixed(1) + t(' จุด', ' pts');
    const ext = d3.max(rows, d => Math.abs(d.gap)) || 1, room = d3.max(rows, d => textW(amount(d.gap), 11.5)) + 10;
    const m = { t: 30, r: 10, b: 36, l: Math.min(170, Math.max(...rows.map(d => textW(d.label, 12))) + 16) }, iw = Math.max(80, W - m.l - m.r), ih = H - m.t - m.b;
    const x = d3.scaleLinear([-ext, ext], [room, iw - room]), y = d3.scaleBand(rows.map(d => d.key), [0, ih]).padding(0.28), x0 = x(0);
    const svg = svgFor(el, W, H).attr('role', 'img').attr('aria-label', t('ส่วนต่างระหว่างคะแนนบัญชีรายชื่อกับคะแนนผู้สมัคร แท่งไปทางขวาเมื่อคะแนนพรรคมากกว่า', 'Gap between party-list and candidate votes; bars go right where the party list drew more'));
    const g = svg.append('g').attr('transform', 'translate(' + m.l + ',' + m.t + ')');
    g.append('text').attr('x', x0 - 8).attr('y', -12).attr('text-anchor', 'end').attr('font-size', 11.5).attr('font-weight', 600).attr('fill', C().text2).text(t('← ผู้สมัครได้มากกว่าพรรค', '← candidates ahead'));
    g.append('text').attr('x', x0 + 8).attr('y', -12).attr('font-size', 11.5).attr('font-weight', 600).attr('fill', C().text2).text(t('พรรคได้มากกว่าผู้สมัคร →', 'party list ahead →'));
    const ticks = Math.max(2, Math.floor(iw / 90));
    g.append('g').attr('class', 'grid').call(d3.axisBottom(x).ticks(ticks).tickSize(ih).tickFormat(''));
    g.append('g').attr('class', 'axis').attr('transform', 'translate(0,' + ih + ')').call(d3.axisBottom(x).ticks(ticks).tickFormat(v => votes ? d3.format('~s')(Math.abs(v)) : String(Math.abs(v))));
    g.append('text').attr('class', 'axis-title').attr('x', iw).attr('y', ih + 30).attr('text-anchor', 'end').text(votes ? t('ส่วนต่าง (คะแนน)', 'gap (votes)') : t('ส่วนต่าง (จุดเปอร์เซ็นต์)', 'gap (percentage points)'));
    const hl = s.ballotMode === 'district' ? highlighter() : null;
    const row = g.selectAll('g.row').data(rows).join('g').attr('class', d => 'row mark' + ((s.ballotMode === 'party' && s.party && s.party !== d.party) || (hl && d.r && !hl(d.r) && !s.brush) ? ' dim' : '')).attr('transform', d => 'translate(0,' + (y(d.key) + y.bandwidth() / 2) + ')').style('cursor', 'pointer').attr('role', 'button')
      .attr('aria-label', d => d.label + ': ' + (d.gap >= 0 ? t('พรรคได้มากกว่า ', 'party list ahead by ') : t('ผู้สมัครได้มากกว่า ', 'candidates ahead by ')) + amount(d.gap));
    row.append('rect').attr('x', -m.l).attr('y', -y.step() / 2).attr('width', W).attr('height', y.step()).attr('fill', d => s.district && d.key === s.district ? C().band : 'transparent');
    row.append('text').attr('x', -8).attr('dy', '.35em').attr('text-anchor', 'end').attr('font-size', 12).attr('fill', C().text).attr('font-weight', d => d.key === s.district || d.party === s.party && s.ballotMode === 'party' ? 700 : 500).text(d => d.label);
    row.append('rect').attr('class', 'gap-bar').attr('x', d => Math.min(x0, x(d.gap))).attr('y', -y.bandwidth() / 2).attr('width', d => Math.max(1.5, Math.abs(x(d.gap) - x0))).attr('height', y.bandwidth()).attr('rx', 3).attr('fill', d => E.D.colorOf(d.party));
    row.append('text').attr('x', d => d.gap >= 0 ? x(d.gap) + 6 : x(d.gap) - 6).attr('dy', '.35em').attr('text-anchor', d => d.gap >= 0 ? 'start' : 'end').attr('font-size', 11.5).attr('font-weight', 600).attr('fill', C().text2).text(d => amount(d.gap));
    g.append('line').attr('x1', x0).attr('x2', x0).attr('y1', -4).attr('y2', ih).attr('stroke', C().text).attr('stroke-width', 1.2);
    row.on('pointermove', (ev, d) => E.chartTip(ev, '<b>' + esc(d.r ? E.dname(d.r) : d.label) + '</b>' + (d.r ? '<br><small>' + E.dot(d.party) + esc(d.party) + (s.party ? '' : t(' (พรรคผู้ชนะ)', ' (winner)')) + '</small>' : '') + tipRows([[t('บัตรเลือกผู้สมัคร', 'Candidate ballot'), (votes ? fmt(d.a) : fmtP(d.a))], [t('บัตรเลือกพรรค', 'Party-list ballot'), (votes ? fmt(d.b) : fmtP(d.b))], [t('ส่วนต่าง (พรรค − ผู้สมัคร)', 'Gap (list − candidate)'), votes ? fmtPP(d.gap, 0) : fmtPP(d.gap) + ' pp']].concat(d.d ? [[t('เขตที่ส่งผู้สมัคร', 'Constituencies contested'), d.d.n]] : [])) + '<small>' + (d.r ? t('คลิกเพื่อดูรายละเอียดเขต', 'Click for constituency details') : t('คลิกเพื่อดูรายเขตของพรรคนี้', 'Click to see this party by constituency')) + '</small>'))
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

  /* ---------- cities and countryside (province density) ---------- */
  // Summary: provinces sorted by population density and cut into three groups holding about the same number of
  // eligible voters (sparse, middle, dense); each party's vote share in each group. Per province: the scatter.
  const densityProvinces = () => { const s = S(); return D.provinces.filter(p => (!s.region || p.region === s.region) && finite(p.density) && p.density > 0 && finite(p.eligible.value)); };
  function densityGroups() {
    const provs = densityProvinces().sort((a, b) => a.density - b.density);
    if (provs.length < 6) return null;
    const total = d3.sum(provs, p => p.eligible.value), groups = [[], [], []];
    let cum = 0;
    for (const p of provs) { groups[Math.min(2, Math.floor((cum + p.eligible.value / 2) / total * 3))].push(p); cum += p.eligible.value; }
    if (groups.some(g => !g.length)) return null;
    return groups.map(g => ({ provinces: g, summary: D.summarize(g.flatMap(p => p.ids.map(id => D.byId.get(id)))), lo: g[0].density, hi: g.at(-1).density }));
  }
  const GROUP_NAMES = () => [t('จังหวัดเบาบาง', 'Sparse provinces'), t('ปานกลาง', 'Middle'), t('จังหวัดหนาแน่น', 'Dense provinces')];
  function densitySummary() {
    const s = S(), groups = densityGroups(); if (!groups) return null;
    const names = D.principal.map(p => p.name).slice(0, 7); if (s.party && !names.includes(s.party)) names.push(s.party);
    const rows = names.map(name => { const v = groups.map(g => D.share(g.summary, name, s.densityBallot).value); return { name, v, gap: v[2] - v[0] }; }).filter(d => d.v.every(finite) && (d3.max(d.v) >= 3 || d.name === s.party));   // parties under 3% everywhere only add clutter
    return { groups, rows: rows.sort((a, b) => b.gap - a.gap) };
  }
  // The scatter opens on the party whose share follows density most closely, unless one is chosen.
  const strongest = new Map();
  function densityParty() {
    const s = S(); if (s.party || s.densityParty) return s.party || s.densityParty;
    const key = s.densityBallot + '|' + s.region;
    if (!strongest.has(key)) {
      const provs = densityProvinces(), xs = provs.map(p => Math.log10(p.density));
      const best = d3.greatest(D.principal.slice(0, 6), p => Math.abs(pearson(xs, provs.map(x => D.share(x, p.name, s.densityBallot).value)) || 0));
      strongest.set(key, (best || D.seatParties[0]).name);
    }
    return strongest.get(key);
  }
  function densityRows() {
    const s = S(), party = densityParty();
    return densityProvinces().map(p => ({ p, density: p.density, share: D.share(p, party, s.densityBallot).value, eligible: p.eligible.value })).filter(d => finite(d.share));
  }
  const strength = r => Math.abs(r) < 0.1 ? t('แทบไม่มีความสัมพันธ์', 'almost no relationship') : Math.abs(r) < 0.3 ? t('สัมพันธ์อ่อน', 'a weak relationship') : Math.abs(r) < 0.5 ? t('สัมพันธ์ปานกลาง', 'a moderate relationship') : t('สัมพันธ์ชัด', 'a clear relationship');
  function densityInsight() {
    const s = S();
    if (s.densityView === 'provinces') {
      const rows = densityRows(), r = pearson(rows.map(d => Math.log10(d.density)), rows.map(d => d.share)), party = densityParty();
      if (r === null) return '';
      return '<b>' + esc(party) + '</b>: r = <b>' + r.toFixed(2) + '</b> ' + strength(r) + (Math.abs(r) >= 0.1 ? ' · ' + (r > 0 ? t('จังหวัดยิ่งหนาแน่น ยิ่งได้คะแนนมาก', 'the denser the province, the higher its share') : t('จังหวัดยิ่งหนาแน่น ยิ่งได้คะแนนน้อย', 'the denser the province, the lower its share')) : '');
    }
    const sum = densitySummary(); if (!sum || !sum.rows.length) return t('เลือกทั้งประเทศหรือภูมิภาคที่มีจังหวัดมากพอ (อย่างน้อย 6 จังหวัด)', 'Choose nationwide or a region with at least 6 provinces');
    const urb = sum.rows[0], rur = sum.rows.at(-1), say = (d, a, b) => '<b>' + esc(d.name) + '</b>' + t('ได้ ', ' takes ') + '<b>' + fmtP(d.v[a], 1) + '</b>' + t(' ใน' + GROUP_NAMES()[a] + ' เทียบ ', ' in ' + GROUP_NAMES()[a].toLowerCase() + ' against ') + fmtP(d.v[b], 1) + t(' ใน' + GROUP_NAMES()[b], ' in ' + GROUP_NAMES()[b].toLowerCase());
    return say(urb, 2, 0) + (rur !== urb && rur.gap < -1 ? ' · ' + say(rur, 0, 2) : '');
  }
  function densityFoot() {
    const s = S();
    if (s.densityView !== 'provinces') {
      const groups = densityGroups(), names = GROUP_NAMES();
      return '<span>' + (groups ? t('แบ่งจังหวัดเป็น 3 กลุ่มตามความหนาแน่นประชากร (สสช. 2567) ให้แต่ละกลุ่มมีผู้มีสิทธิใกล้กัน: ', 'Provinces split into three groups by population density (NSO 2024), each with about the same number of voters: ') + groups.map((g, i) => names[i] + ' ' + fmt(g.lo) + '–' + fmt(g.hi) + t(' คน/ตร.กม. (', '/km² (') + g.provinces.length + t(' จังหวัด)', ' provinces)')).join(' · ') + '<br>' : '') + t('คลิกพรรคเพื่อดูรายจังหวัด · ข้อมูลระดับจังหวัด ไม่บอกพฤติกรรมรายบุคคล', 'Click a party to see its provinces · province-level data says nothing about individuals') + '</span>';
    }
    const rows = densityRows(), xs = rows.map(d => s.densityScale === 'log' ? Math.log10(d.density) : d.density), r = pearson(xs, rows.map(d => d.share));
    return '<span>' + t('หนึ่งจุดคือหนึ่งจังหวัด ขนาดตามจำนวนผู้มีสิทธิ เส้นคือแนวโน้ม · ', 'One dot per province, sized by eligible voters; the line is the trend · ') + 'r = <b>' + (r === null ? '—' : r.toFixed(2)) + '</b> (' + (s.densityScale === 'log' ? 'log₁₀ ' : '') + t('ความหนาแน่น, n = ', 'density, n = ') + rows.length + t(' จังหวัด', ' provinces') + ') ' + t('ข้อมูลระดับจังหวัด ไม่ใช่ความหนาแน่นรายเขต และไม่บอกพฤติกรรมรายบุคคล ความสัมพันธ์ไม่ใช่เหตุและผล', 'Province-level data, not constituency density; it says nothing about individuals, and correlation is not causation.') + '</span>';
  }
  function drawDensityGroups(el) {
    const s = S(), sum = densitySummary(), W = el.clientWidth, H = el.clientHeight;
    if (!sum || !sum.rows.length) return emptyState(el, t('เลือกทั้งประเทศหรือภูมิภาคที่มีหลายจังหวัด (อย่างน้อย 6 จังหวัด)', 'Choose nationwide or a region with at least 6 provinces'));
    const { rows } = sum, names = GROUP_NAMES();
    const words = d => (d.gap >= 0 ? t('เมือง +', 'dense +') : t('ชนบท +', 'sparse +')) + Math.abs(d.gap).toFixed(1) + t(' จุด', ' pts');
    const m = { t: 26, r: Math.min(130, d3.max(rows, d => textW(words(d), 11.5)) + 16), b: 30, l: Math.min(150, Math.max(...rows.map(d => textW(d.name, 12))) + 16) };
    const iw = Math.max(60, W - m.l - m.r), ih = Math.max(40, H - m.t - m.b);
    const y = d3.scaleBand(rows.map(d => d.name), [0, ih]).padding(0.3), x = d3.scaleLinear([0, d3.max(rows, d => d3.max(d.v)) || 1], [0, iw]).nice();
    const svg = svgFor(el, W, H).attr('role', 'img').attr('aria-label', t('สัดส่วนคะแนนของแต่ละพรรคในจังหวัดเบาบาง ปานกลาง และหนาแน่น', 'Each party\'s vote share in sparse, middle and dense provinces'));
    // Key: hollow = sparse, half-filled = middle, solid = dense.
    const mark = (sel, i, c) => sel.append('circle').attr('r', i === 2 ? 6 : 5).attr('fill', i === 0 ? C().ring : c).attr('fill-opacity', i === 1 ? 0.45 : 1).attr('stroke', i === 2 ? C().ring : c).attr('stroke-width', i === 2 ? 1.5 : 2);
    const lg = svg.append('g').attr('transform', 'translate(' + m.l + ',10)').attr('font-size', 11.5);
    let lx = 0;
    names.forEach((n, i) => { mark(lg.append('g').attr('transform', 'translate(' + (lx + 5) + ',0)'), i, C().text3); lg.append('text').attr('x', lx + 14).attr('dy', '.35em').attr('fill', C().text2).text(n); lx += 30 + textW(n, 11.5); });
    const g = svg.append('g').attr('transform', 'translate(' + m.l + ',' + m.t + ')');
    const ticks = Math.max(2, Math.floor(iw / 70));
    g.append('g').attr('class', 'grid').call(d3.axisBottom(x).ticks(ticks).tickSize(ih).tickFormat(''));
    g.append('g').attr('class', 'axis').attr('transform', 'translate(0,' + ih + ')').call(d3.axisBottom(x).ticks(ticks).tickFormat(v => v + '%'));
    const row = g.selectAll('g.row').data(rows).join('g').attr('class', d => 'row mark' + (s.party && s.party !== d.name ? ' dim' : '')).attr('transform', d => 'translate(0,' + (y(d.name) + y.bandwidth() / 2) + ')').style('cursor', 'pointer').attr('role', 'button')
      .attr('aria-label', d => d.name + ': ' + d.v.map((v, i) => names[i] + ' ' + fmtP(v, 1)).join(', '));
    row.append('rect').attr('x', -m.l).attr('y', -y.step() / 2).attr('width', W).attr('height', y.step()).attr('fill', 'transparent');
    row.append('line').attr('x1', d => x(d3.min(d.v))).attr('x2', d => x(d3.max(d.v))).attr('stroke', d => E.D.colorOf(d.name)).attr('stroke-opacity', 0.4).attr('stroke-width', 3).attr('stroke-linecap', 'round');
    [0, 1, 2].forEach(i => row.each(function (d) { mark(d3.select(this).append('g').attr('transform', 'translate(' + x(d.v[i]) + ',0)'), i, E.D.colorOf(d.name)); }));
    row.append('text').attr('x', -8).attr('dy', '.35em').attr('text-anchor', 'end').attr('font-size', 12).attr('font-weight', d => s.party === d.name ? 700 : 500).attr('fill', C().text).text(d => d.name);
    row.append('text').attr('x', d => x(d3.max(d.v)) + 10).attr('dy', '.35em').attr('font-size', 11.5).attr('font-weight', 600).attr('fill', d => Math.abs(d.gap) >= 2 ? C().text : C().text3).text(words);
    const open = (ev, d) => { E.hideChartTip(); E.setState({ party: d.name, densityParty: d.name, densityView: 'provinces' }); };
    row.on('pointermove', (ev, d) => E.chartTip(ev, '<b>' + esc(d.name) + '</b>' + tipRows(d.v.map((v, i) => [names[i] + ' (' + fmt(sum.groups[i].lo) + '–' + fmt(sum.groups[i].hi) + ')', fmtP(v, 1)])) + '<small>' + t('คลิกเพื่อดูรายจังหวัดของพรรคนี้', 'Click to see this party province by province') + '</small>'))
      .on('pointerleave', E.hideChartTip).on('click', open);
    keyActivate(row, open);
  }
  function tableDensityGroups() {
    const sum = densitySummary(); if (!sum) return '<p class="empty-state">' + t('จังหวัดไม่พอสำหรับแบ่งกลุ่ม', 'Not enough provinces to group') + '</p>';
    const names = GROUP_NAMES();
    return '<table><thead><tr><th>' + t('พรรค', 'Party') + '</th>' + names.map(n => '<th class="n">' + n + '</th>').join('') + '<th class="n">' + t('หนาแน่น − เบาบาง', 'Dense − sparse') + '</th></tr></thead><tbody>' +
      sum.rows.map(d => '<tr><td>' + E.dot(d.name) + esc(d.name) + '</td>' + d.v.map(v => '<td class="n">' + fmtP(v, 1) + '</td>').join('') + '<td class="n">' + pts(d.gap) + '</td></tr>').join('') + '</tbody></table>';
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
    // Trend line: least squares on the axis's own scale (log or linear density), drawn under the dots.
    if (rows.length > 2) {
      const u = d => s.densityScale === 'log' ? Math.log10(d.density) : d.density, us = rows.map(u), mu = d3.mean(us), mv = d3.mean(rows, d => d.share);
      const slope = d3.sum(rows, d => (u(d) - mu) * (d.share - mv)) / (d3.sum(us, v => (v - mu) ** 2) || 1), back = v => s.densityScale === 'log' ? 10 ** v : v, [u0, u1] = d3.extent(us);
      g.append('line').attr('x1', x(back(u0))).attr('x2', x(back(u1))).attr('y1', y(mv + slope * (u0 - mu))).attr('y2', y(mv + slope * (u1 - mu))).attr('stroke', E.D.colorOf(party)).attr('stroke-width', 2).attr('stroke-dasharray', '6 4').attr('stroke-opacity', 0.8).attr('pointer-events', 'none');
    }
    const sorted = rows.slice().sort((a, b) => b.eligible - a.eligible);
    g.append('g').selectAll('circle').data(sorted).join('circle').attr('class', d => 'mark' + (s.province && s.province !== d.p.code ? ' dim' : '')).attr('cx', d => x(d.density)).attr('cy', d => y(d.share)).attr('r', d => rad(d.eligible)).attr('fill', d => REGION_COLORS[d.p.region]).attr('fill-opacity', 0.78).attr('stroke', C().ring).attr('stroke-width', 1.5);
    const labelled = new Set([s.province, d3.greatest(rows, d => d.share)?.p.code, d3.least(rows, d => d.share)?.p.code, d3.greatest(rows, d => d.density)?.p.code].filter(Boolean));
    g.append('g').selectAll('text').data(rows.filter(d => labelled.has(d.p.code))).join('text').attr('x', d => x(d.density) + rad(d.eligible) + 4).attr('y', d => y(d.share) + 4).attr('font-size', 11).attr('font-weight', d => d.p.code === s.province ? 700 : 500).attr('fill', C().text).attr('text-anchor', d => x(d.density) > iw - 110 ? 'end' : 'start').attr('dx', d => x(d.density) > iw - 110 ? -2 * rad(d.eligible) - 8 : 0).text(d => E.pname(d.p)).attr('pointer-events', 'none');
    const regs = [...new Set(rows.map(d => d.p.region))];
    const lg = g.append('g').attr('font-size', 11).attr('pointer-events', 'none');
    regs.forEach((k, i) => { lg.append('circle').attr('cx', 6).attr('cy', 6 + i * 16).attr('r', 4.5).attr('fill', REGION_COLORS[k]); lg.append('text').attr('x', 15).attr('y', 10 + i * 16).attr('fill', C().text2).text(E.rname(k)); });
    const delaunay = d3.Delaunay.from(rows, d => x(d.density), d => y(d.share)), ring = g.append('circle').attr('fill', 'none').attr('stroke', C().text).attr('stroke-width', 2).attr('opacity', 0).attr('pointer-events', 'none');
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
  // The reader picks every constituency (2 to CMP_MAX); nothing is added for them.
  function compareControls() {
    const s = S(), full = s.compare.length >= CMP_MAX, provs = D.provinces.slice().sort((a, b) => E.pname(a).localeCompare(E.pname(b), E.lang() === 'en' ? 'en' : 'th'));
    const p = cmpProvince && D.provinceByCode.get(cmpProvince);
    return '<span class="ctl"><label class="ctl-label" for="cmpProvince">' + t('จังหวัด', 'Province') + '</label><select id="cmpProvince"' + (full ? ' disabled' : '') + '><option value="">' + t('เลือกจังหวัด', 'Choose province') + '</option>' + provs.map(x => '<option value="' + x.code + '"' + (x.code === cmpProvince ? ' selected' : '') + '>' + esc(E.pname(x)) + '</option>').join('') + '</select></span>' +
      '<span class="ctl"><label class="ctl-label" for="cmpDistrict">' + t('เขต', 'Constituency') + '</label><select id="cmpDistrict"' + (p && !full ? '' : ' disabled') + '><option value="">' + (full ? t('ครบ ' + CMP_MAX + ' เขตแล้ว', 'All ' + CMP_MAX + ' picked') : t('เลือกเขตเพื่อเพิ่ม', 'Choose to add')) + '</option>' + (p ? p.ids.map(id => { const r = D.byId.get(id); return '<option value="' + id + '"' + (s.compare.includes(id) ? ' disabled' : '') + '>' + t('เขต ', 'No. ') + r.number + ' · ' + esc(r.winnerParty || '') + '</option>'; }).join('') : '') + '</select></span>' +
      '<span class="ctl-label cmp-count">' + t('เลือกแล้ว ', 'Picked ') + '<b>' + s.compare.length + '/' + CMP_MAX + '</b>' + (full ? t(' · ลบเขตออกก่อนเพื่อเลือกเขตอื่น', ' · remove one to pick another') : '') + '</span>' +
      (s.compare.length ? '<span class="cmp-tags">' + s.compare.map(id => '<button type="button" class="chip" data-act="compare-remove" data-v="' + id + '" aria-label="' + esc(t('เอาออก: ', 'Remove: ') + E.dname(D.byId.get(id))) + '">' + esc(E.dname(D.byId.get(id))) + '<span aria-hidden="true">×</span></button>').join('') + '</span>' : '');
  }
  function compareInsight() {
    const list = S().compare.map(id => D.byId.get(id)).filter(Boolean);
    if (list.length < 2) return t('เลือกเขตที่สนใจเองได้ 2–' + CMP_MAX + ' เขต แล้วดูว่าต่างกันตรงไหน', 'Pick 2–' + CMP_MAX + ' constituencies yourself and see where they differ');
    const hiT = d3.greatest(list, r => r.turnoutPct), loT = d3.least(list, r => r.turnoutPct), close = d3.least(list, r => r.marginPct);
    return t('ใช้สิทธิสูงสุด ', 'Highest turnout ') + '<b>' + esc(shortName(hiT)) + ' ' + fmtP(hiT.turnoutPct, 1) + '</b>' + t(' ต่ำสุด ', ', lowest ') + '<b>' + esc(shortName(loT)) + ' ' + fmtP(loT.turnoutPct, 1) + '</b> · ' + t('สูสีที่สุด ', 'closest race ') + '<b>' + esc(shortName(close)) + '</b>' + t(' ห่าง ', ', margin ') + fmtP(close.marginPct, 1);
  }
  function drawCompare(el) {
    const s = S(), list = s.compare.map(id => D.byId.get(id)).filter(Boolean);
    if (!list.length) { el.innerHTML = '<p class="empty-state">' + t('ยังไม่ได้เลือกเขต — เลือกจังหวัดแล้วเลือกเขตด้านบน เปรียบเทียบได้ 2–' + CMP_MAX + ' เขต', 'No constituencies yet — pick a province, then a constituency, above (2–' + CMP_MAX + ')') + '</p>'; return; }
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
    el.innerHTML = '<div class="cmp">' + (list.length < 2 ? '<p class="na-box">' + t('เลือกอีกอย่างน้อย 1 เขตเพื่อเปรียบเทียบ', 'Pick at least one more constituency to compare') + '</p>' : '') + rowsHtml + ranks + '<p class="caveat">' + t('แถบในแต่ละตัวชี้วัดใช้สเกลเดียวกันทุกเขต · สีแถบ = พรรคผู้ชนะของเขต', 'Bars within a metric share one scale · bar colour = winning party') + '</p></div>';
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
    if (act === 'an-set') { const k = el.dataset.k; let val = v; if (k === 'ballotTop') val = String(v); const patch = { [k]: val }; if (k === 'ballotMode') patch.ballotSort = v === 'party' ? 'seats' : 'abs'; E.setState(patch); }
    else if (act === 'an-table') { tableOn.has(v) ? tableOn.delete(v) : tableOn.add(v); A.render(); }
    else if (act === 'brush-list') { if (matchMedia('(min-width: 1280px)').matches) E.setState({ anDetail: { kind: 'brush' } }); else E.openSheet({ kind: 'custom', what: 'brush' }); }
    else if (act === 'an-detail-close') E.setState({ anDetail: null });
    else if (act === 'an-region') E.setState({ region: s.region === v ? '' : v, brush: null });
    else if (act === 'an-cell') E.setState({ region: v, party: el.dataset.p, brush: null });
    else if (act === 'compare-add') { if (!s.compare.includes(v) && s.compare.length < CMP_MAX) E.setState({ compare: [...s.compare, v] }); }
    else if (act === 'compare-remove') E.setState({ compare: s.compare.filter(id => id !== v) });
  };
  A.onChange = (id, v, ev) => {
    const k = ev.target.dataset.k;
    if (k) { E.setState({ [k]: v }); return; }
    if (id === 'ctl-densityParty') E.setState({ party: v, densityParty: v });
    else if (id === 'cmpProvince') { cmpProvince = v; A.render(); }
    else if (id === 'cmpDistrict' && v) { const s = S(); if (!s.compare.includes(v) && s.compare.length < CMP_MAX) E.setState({ compare: [...s.compare, v] }); }
  };
})();
