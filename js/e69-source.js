/* Election data source. All election data lives in editable CSV files under data/: data/elections.csv lists the
   elections and marks the one to show, and each election has its own folder with one file per topic (settings,
   parties, provinces, constituencies, candidates, party-list votes, sources). On a web server the files are fetched
   directly, so a saved edit appears on the next page load or press of the refresh button. Opened from disk
   (file://) the browser cannot fetch files, so data/bundle.js, which embeds the same CSV text (built by
   scripts/build_data_bundle.py), is read instead. Either way the tables are turned into the structures that
   e69-data.js builds the dashboard from. */
(function (root) {
  'use strict';
  const BASE = 'data/';
  const TOPICS = ['election.csv', 'parties.csv', 'provinces.csv', 'constituencies.csv', 'candidates.csv', 'party_list_votes.csv', 'sources.csv'];
  const OPTIONAL = new Set(['sources.csv']);
  const REGIONS = ['กรุงเทพมหานคร', 'กลาง', 'ตะวันออก', 'ตะวันตก', 'เหนือ', 'ตะวันออกเฉียงเหนือ', 'ใต้'];

  // Errors name the file, row and column in Thai so whoever edited the data can find the cell.
  class DataError extends Error {}
  const at = (file, row, column) => file + (row ? ' แถว ' + row : '') + (column ? ' คอลัมน์ ' + column : '');
  const fail = (where, message) => { throw new DataError(where + ': ' + message); };

  /* ---------- CSV (RFC 4180: quoted fields, doubled quotes, line breaks inside quotes, BOM, CRLF or LF) ---------- */
  function parseCSV(text) {
    const s = String(text ?? '').replace(/^﻿/, ''), rows = [];
    let row = [], field = '', quoted = false;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (quoted) {
        if (ch !== '"') field += ch;
        else if (s[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else if (ch === '"' && field === '') quoted = true;
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\n' || ch === '\r') { row.push(field); rows.push(row); row = []; field = ''; if (ch === '\r' && s[i + 1] === '\n') i++; }
      else field += ch;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows;
  }
  // A header may carry a Thai label and the machine key in brackets, e.g. "คะแนน (votes)"; plain headers are kept as is.
  const headerKey = h => { const m = /\(([A-Za-z][A-Za-z0-9_]*)\)\s*$/.exec(h); return m ? m[1] : String(h).trim(); };
  function table(text, file) {
    const rows = parseCSV(text);
    if (!rows.length) fail(file, 'ไฟล์ว่าง');
    const keys = rows[0].map(headerKey);
    const records = [];
    rows.slice(1).forEach((cells, i) => {
      if (cells.every(c => !String(c).trim())) return;   // blank lines are ignored
      const r = { __row: i + 2 };
      keys.forEach((k, j) => { r[k] = cells[j] ?? ''; });
      records.push(r);
    });
    return { keys, headers: rows[0], rows: records };
  }
  const text = v => String(v ?? '').trim();
  // Whole numbers; Excel's thousands separators and stray spaces are accepted. Blank means "no value yet" (null).
  function int(v, where, required) {
    const s = text(v).replace(/[,\s ]/g, '');
    if (!s) { if (required) fail(where, 'ต้องใส่ตัวเลข (ใส่ 0 ถ้ายังไม่มี)'); return null; }
    if (!/^\d+$/.test(s)) fail(where, 'ต้องเป็นจำนวนเต็มไม่ติดลบ แต่พบ "' + text(v) + '"');
    const n = Number(s); if (!Number.isSafeInteger(n)) fail(where, 'ตัวเลขใหญ่เกินไป');
    return n;
  }
  function decimal(v, where) {
    const s = text(v).replace(/[,\s ]/g, '');
    if (!s) return null;
    const n = Number(s); if (!Number.isFinite(n) || n < 0) fail(where, 'ต้องเป็นตัวเลขไม่ติดลบ แต่พบ "' + text(v) + '"');
    return n;
  }
  const yes = v => /^(ใช่|yes|y|true|1|x|✓)$/i.test(text(v));
  const list = v => text(v).split('|').map(x => x.trim()).filter(Boolean);
  const stripTitle = name => text(name).replace(/^(นางสาว|นาง|นาย)\s*/, '');

  /* ---------- elections.csv: which election folder to show ---------- */
  function elections(csv) {
    const found = table(csv, 'elections.csv').rows.map(r => ({ row: r.__row, id: text(r.id), nameTh: text(r.name_th), nameEn: text(r.name_en), folder: text(r.folder) || text(r.id), active: yes(r.active) })).filter(e => e.id);
    if (!found.length) fail('elections.csv', 'ไม่มีรายการการเลือกตั้ง');
    for (const e of found) if (!/^[\w-]+$/.test(e.folder)) fail(at('elections.csv', e.row, 'folder'), 'ชื่อโฟลเดอร์ใช้ได้เฉพาะตัวอักษรอังกฤษ ตัวเลข _ และ -');
    return found;
  }
  // ?election=<id> in the address previews another election without changing which one is marked active.
  function chooseElection(list) {
    const wanted = new URLSearchParams(root.location?.search || '').get('election');
    return list.find(e => e.id === wanted) || list.find(e => e.active) || list[list.length - 1];
  }

  /* ---------- one election's files → dashboard structures ---------- */
  function toDataset(files, entry, all) {
    const path = name => entry.folder + '/' + name;
    const read = name => { const t = files[path(name)]; if (t == null && !OPTIONAL.has(name)) fail(path(name), 'ไม่พบไฟล์'); return t; };

    // election.csv: one setting per row (key, value, note)
    const s = {};
    for (const r of table(read('election.csv'), path('election.csv')).rows) if (text(r.key)) s[text(r.key)] = text(r.value);
    const sAt = key => at(path('election.csv'), null, key);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s.election_date || '') || !Number.isFinite(Date.parse(s.election_date))) fail(sAt('election_date'), 'ต้องเป็นวันที่แบบ ปี ค.ศ.-เดือน-วัน เช่น 2026-02-08');
    if (s.source_updated_at && !Number.isFinite(Date.parse(s.source_updated_at))) fail(sAt('source_updated_at'), 'อ่านวันเวลาไม่ได้ ใช้รูปแบบ 2026-02-08T21:30:00+07:00 หรือ 2026-02-08');
    const year = Number(s.election_date.slice(0, 4)), constituencySeats = int(s.constituency_seats, sAt('constituency_seats'), true), listSeats = int(s.list_seats, sAt('list_seats'), true);
    const totalSeats = int(s.total_seats, sAt('total_seats')) ?? constituencySeats + listSeats;
    const check = s.check_date ? { checkedAt: s.check_date, source: s.check_url || '', liveLastUpdate: s.check_source_updated || null,
      compared: { constituencies: int(s.check_constituencies, sAt('check_constituencies')), candidates: int(s.check_candidates, sAt('check_candidates')), parties: int(s.check_parties, sAt('check_parties')) },
      differences: int(s.check_differences, sAt('check_differences')), ballotGaps: int(s.check_ballot_gaps, sAt('check_ballot_gaps')), listBallotGaps: int(s.check_list_ballot_gaps, sAt('check_list_ballot_gaps')) } : null;
    const config = {
      id: s.election_id || entry.id, folder: entry.folder, nameTh: entry.nameTh, nameEn: entry.nameEn,
      date: s.election_date, year, beYear: year + 543, brandNumber: String(year + 543).slice(-2),
      totalSeats, constituencySeats, listSeats, majority: Math.floor(totalSeats / 2) + 1,
      sourceTh: s.source_name_th || 'กกต.', sourceEn: s.source_name_en || 'ECT', sourceUpdatedAt: s.source_updated_at || null,
      countedPercent: decimal(s.counted_percent, sAt('counted_percent')),
      official: { eligible: int(s.official_eligible, sAt('official_eligible')), turnout: int(s.official_turnout, sAt('official_turnout')), valid: int(s.official_valid, sAt('official_valid')),
        invalid: int(s.official_invalid, sAt('official_invalid')), noVote: int(s.official_no_vote, sAt('official_no_vote')) },
      districtShapes: s.district_shapes || 'district-shapes.js', densitySource: s.density_source || '', check,
      elections: (all || [entry]).map(e => ({ id: e.id, nameTh: e.nameTh, nameEn: e.nameEn, active: e.active })),
    };

    // provinces.csv
    const pFile = path('provinces.csv'), provinces = new Map(), spots = new Set();
    for (const r of table(read('provinces.csv'), pFile).rows) {
      const w = c => at(pFile, r.__row, c), code = text(r.code);
      if (!/^[1-9]\d$/.test(code)) fail(w('code'), 'รหัสจังหวัดต้องเป็นเลขสองหลัก เช่น 10');
      if (provinces.has(code)) fail(w('code'), 'รหัสจังหวัดซ้ำ ' + code);
      if (!text(r.name_th)) fail(w('name_th'), 'ต้องใส่ชื่อจังหวัด');
      if (!REGIONS.includes(text(r.region))) fail(w('region'), 'ภาคต้องเป็นหนึ่งใน ' + REGIONS.join(', '));
      const x = int(r.hex_col, w('hex_col'), true), y = int(r.hex_row, w('hex_row'), true);
      if (spots.has(x + ',' + y)) fail(w('hex_col'), 'ตำแหน่งบนแผนที่ซ้ำกับจังหวัดอื่น'); spots.add(x + ',' + y);
      provinces.set(code, { code, name: text(r.name_th), nameEn: text(r.name_en) || null, abbr: text(r.abbr), codeEn: text(r.code_en), region: text(r.region),
        count: int(r.constituencies, w('constituencies'), true), x, y, density: decimal(r.density, w('density')), population: int(r.population, w('population')), year: int(r.density_year, w('density_year')) });
    }

    // parties.csv
    const fFile = path('parties.csv'), parties = [], partyNames = new Set();
    for (const r of table(read('parties.csv'), fFile).rows) {
      const w = c => at(fFile, r.__row, c), name = text(r.name);
      if (!name) fail(w('name'), 'ต้องใส่ชื่อพรรค');
      if (partyNames.has(name)) fail(w('name'), 'ชื่อพรรคซ้ำ "' + name + '"'); partyNames.add(name);
      if (!/^#[0-9a-f]{6}$/i.test(text(r.color))) fail(w('color'), 'สีต้องเป็นรหัสแบบ #RRGGBB เช่น #0F1E64');
      parties.push({ name, number: int(r.number, w('number')), color: text(r.color), partyLeader: text(r.party_leader), pm: list(r.pm_candidates),
        showCard: yes(r.show_card), cardPerson: text(r.card_person), cardIsPm: yes(r.card_is_pm_candidate), photo: text(r.photo), photoFallback: text(r.photo_fallback),
        constituencySeats: int(r.constituency_seats, w('constituency_seats')), listSeats: int(r.list_seats, w('list_seats')),
        officialListVotes: int(r.official_list_votes, w('official_list_votes')), officialConstituencyVotes: int(r.official_constituency_votes, w('official_constituency_votes')), ectId: text(r.ect_id) });
    }

    // constituencies.csv
    const cFile = path('constituencies.csv'), districts = [], byId = new Map();
    for (const r of table(read('constituencies.csv'), cFile).rows) {
      const w = c => at(cFile, r.__row, c), id = text(r.id), m = /^([1-9]\d)_([1-9]\d?)$/.exec(id);
      if (!m) fail(w('id'), 'รหัสเขตต้องเป็น รหัสจังหวัด_เลขเขต เช่น 10_1 (ไม่เติมศูนย์นำหน้า)');
      const prov = provinces.get(m[1]);
      if (!prov) fail(w('id'), 'ไม่พบจังหวัดรหัส ' + m[1] + ' ใน provinces.csv');
      if (byId.has(id)) fail(w('id'), 'รหัสเขตซ้ำ ' + id);
      const number = Number(m[2]);
      if (number > prov.count) fail(w('id'), prov.name + ' มี ' + prov.count + ' เขตตาม provinces.csv แต่พบเขตที่ ' + number);
      const valid = int(r.valid, w('valid')), turnout = int(r.turnout, w('turnout'));
      const d = { id, provinceCode: prov.code, province: prov.name, provinceAbbr: prov.abbr, provinceEnglishCode: prov.codeEn, number, region: prov.region,
        zone: list(r.areas), eligible: int(r.eligible, w('eligible')), turnout, invalid: int(r.invalid, w('invalid')), noVote: int(r.no_vote, w('no_vote')),
        reportedValidVotes: valid, officialValid: valid, officialTotal: valid, officialTurnout: turnout, partyList: {}, candidates: [],
        partyListTurnout: int(r.list_turnout, w('list_turnout')), partyListValidVotes: int(r.list_valid, w('list_valid')),
        partyListInvalid: int(r.list_invalid, w('list_invalid')), partyListNoVote: int(r.list_no_vote, w('list_no_vote')), updatedAt: config.sourceUpdatedAt };
      districts.push(d); byId.set(id, d);
    }

    // candidates.csv
    const kFile = path('candidates.csv');
    for (const r of table(read('candidates.csv'), kFile).rows) {
      const w = c => at(kFile, r.__row, c), d = byId.get(text(r.constituency_id));
      if (!d) fail(w('constituency_id'), 'ไม่พบเขต "' + text(r.constituency_id) + '" ใน constituencies.csv');
      const party = text(r.party), name = text(r.name), number = int(r.number, w('number'), true);
      if (!partyNames.has(party)) fail(w('party'), 'ไม่พบพรรค "' + party + '" ใน parties.csv (ชื่อต้องตรงกันทุกตัวอักษร)');
      if (!name) fail(w('name'), 'ต้องใส่ชื่อผู้สมัคร');
      if (number < 1 || d.candidates.some(c => c.number === number)) fail(w('number'), 'หมายเลขผู้สมัครในเขต ' + d.id + ' ต้องเป็นเลขบวกและไม่ซ้ำ');
      d.candidates.push({ number, name, party, votes: int(r.votes, w('votes'), true), officialCandidateId: (d.provinceEnglishCode || d.provinceCode) + '_' + d.number + '_' + number });
    }

    // party_list_votes.csv: one row per constituency, one column per party (the header is the party name)
    const lFile = path('party_list_votes.csv'), lt = table(read('party_list_votes.csv'), lFile);
    const listColumns = lt.keys.filter(k => k !== 'constituency_id');
    for (const k of listColumns) if (!partyNames.has(k)) fail(at(lFile, 1), 'หัวคอลัมน์ "' + k + '" ไม่ตรงกับชื่อพรรคใน parties.csv');
    for (const r of lt.rows) {
      const d = byId.get(text(r.constituency_id));
      if (!d) fail(at(lFile, r.__row, 'constituency_id'), 'ไม่พบเขต "' + text(r.constituency_id) + '" ใน constituencies.csv');
      for (const party of listColumns) { const v = int(r[party], at(lFile, r.__row, party)); if (v !== null) d.partyList[party] = v; }
    }

    // Constituency seats default to the winners counted from candidates.csv when left blank.
    const wins = new Map();
    for (const d of districts) {
      const c = d.candidates.slice().sort((a, b) => b.votes - a.votes || a.number - b.number);
      if (c.length && c[0].votes > 0 && !(c[1] && c[1].votes === c[0].votes)) wins.set(c[0].party, (wins.get(c[0].party) || 0) + 1);
    }
    const rawParties = parties.map(p => {
      const cons = p.constituencySeats ?? wins.get(p.name) ?? 0, listS = p.listSeats ?? 0;
      return { id: p.ectId || p.name, name: p.name, number: p.number, color: p.color, leader: p.partyLeader || p.pm[0] || stripTitle(p.cardPerson),
        partyLeader: p.partyLeader || null, pmCandidates: p.pm.map(n => ({ name: n })), listSeats: listS, constituencySeats: cons, totalSeats: cons + listS,
        officialListVotes: p.officialListVotes, officialConstituencyVotes: p.officialConstituencyVotes, principal: p.showCard };
    });
    const portraits = {};
    for (const p of parties) if (p.photo || p.photoFallback) portraits[p.name] = { name: p.cardPerson || p.pm[0] || '', src: p.photo || p.photoFallback, fallback: p.photoFallback, verifiedPMCandidate: p.cardIsPm };

    const sourceText = read('sources.csv');
    const sources = sourceText == null ? [] : table(sourceText, path('sources.csv')).rows.map((r, i) => ({ id: 'source-' + (i + 1), name: text(r.name), url: text(r.url),
      publisher: text(r.publisher) || null, retrievedAt: text(r.retrieved_at) || null, updatedAt: text(r.updated_at) || null, type: text(r.type) || null, note: text(r.note) || null }));
    // National totals as announced (for the integrity checks); where left blank, the constituency sums stand in.
    const sum = key => districts.every(d => d[key] !== null) ? districts.reduce((t, d) => t + d[key], 0) : null;
    const o = config.official;
    const summary = { eligible: o.eligible ?? sum('eligible'), turnout: o.turnout ?? sum('turnout'), validVotes: o.valid ?? sum('reportedValidVotes'), invalid: o.invalid ?? sum('invalid'),
      noVote: o.noVote ?? sum('noVote'), updatedAt: config.sourceUpdatedAt, countedPct: config.countedPercent, totalSeats, constituencySeats, listSeats };
    const registry = Object.fromEntries([...provinces.values()].map(p => [p.code, [p.name, p.count]]));
    const raw = { schemaVersion: 'csv-1', election: config.id, electionDate: config.date, districts, parties: rawParties, sources, summary, registry };
    // Tiles in map order (row by row, north to south), the order screen readers meet them in.
    const reference = { tiles: [...provinces.values()].sort((a, b) => a.y - b.y || a.x - b.x).map(p => ({ code: p.code, x: p.x, y: p.y })),
      provinceNameEn: Object.fromEntries([...provinces.values()].map(p => [p.code, p.nameEn])),
      density: Object.fromEntries([...provinces.values()].filter(p => p.density !== null).map(p => [p.code, { density: p.density, year: p.year, population: p.population, source: config.densitySource, scope: 'province' }])),
      hexMap: root.E69_REFERENCE?.hexMap || null, liveCheck: check };
    return { config, raw, reference, portraits };
  }

  /* ---------- reading the files ---------- */
  const fromDisk = () => root.location?.protocol === 'file:';
  function fetchText(url, fresh) {
    // A fresh read skips both the browser cache and any server cache in front of it.
    return fetch(fresh ? url + '?t=' + Date.now() : url, { cache: fresh ? 'no-store' : 'no-cache' })
      .then(r => { if (!r.ok) throw new DataError(url + ': อ่านไฟล์ไม่ได้ (HTTP ' + r.status + ')'); return r.text(); });
  }
  async function fromServer(fresh) {
    const files = { 'elections.csv': await fetchText(BASE + 'elections.csv', fresh) };
    const all = elections(files['elections.csv']), entry = chooseElection(all);
    await Promise.all(TOPICS.map(name => fetchText(BASE + entry.folder + '/' + name, fresh)
      .then(t => { files[entry.folder + '/' + name] = t; }, err => { if (!OPTIONAL.has(name)) throw err; })));
    return { files, entry, all };
  }
  function fromBundle(fresh) {
    return new Promise((resolve, reject) => {
      if (root.E69_DATA_BUNDLE && !fresh) { resolve(root.E69_DATA_BUNDLE); return; }
      const s = document.createElement('script');
      s.src = BASE + 'bundle.js' + (fresh ? '?t=' + Date.now() : '');
      s.onload = () => { s.remove(); root.E69_DATA_BUNDLE ? resolve(root.E69_DATA_BUNDLE) : reject(new DataError('data/bundle.js ไม่มีข้อมูล')); };
      s.onerror = () => { s.remove(); reject(new DataError('อ่าน data/bundle.js ไม่ได้ (สร้างด้วย scripts/build_data_bundle.py)')); };
      document.head.append(s);
    }).then(bundle => { const all = elections(bundle.files['elections.csv']); return { files: bundle.files, entry: chooseElection(all), all, builtAt: bundle.builtAt }; });
  }
  // Loads the election to show. `fresh` (the refresh button) bypasses every cache. Served pages read the CSV
  // files themselves and fall back to the bundle only if the files cannot be fetched.
  async function load(options) {
    const fresh = !!options?.fresh;
    let got = null, mode = 'csv';
    if (!fromDisk()) {
      try { got = await fromServer(fresh); } catch (err) { if (err instanceof DataError && !/HTTP|fetch/i.test(err.message)) throw err; console.warn('ใช้ data/bundle.js แทนไฟล์ CSV:', err.message); }
    }
    if (!got) { got = await fromBundle(fresh); mode = 'bundle'; }
    return Object.assign(toDataset(got.files, got.entry, got.all), { mode, loadedAt: new Date() });
  }

  const api = { load, toDataset, parseCSV, table, elections, chooseElection, headerKey, DataError, TOPICS, BASE };
  root.E69Source = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
