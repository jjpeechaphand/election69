/* Shared aggregation layer: one calculation source for map tooltips, province panels,
   constituency details and analysis charts. Reads the frozen ECT snapshot; never mutates it. */
(function (root) {
  'use strict';
  const REGION_ORDER = ['กรุงเทพมหานคร', 'กลาง', 'ตะวันออก', 'ตะวันตก', 'เหนือ', 'ตะวันออกเฉียงเหนือ', 'ใต้'];
  const REGION_EN = { 'กรุงเทพมหานคร': 'Bangkok', 'กลาง': 'Central', 'ตะวันออก': 'East', 'ตะวันตก': 'West', 'เหนือ': 'North', 'ตะวันออกเฉียงเหนือ': 'Northeast', 'ใต้': 'South' };
  const isCount = v => Number.isSafeInteger(v) && v >= 0;
  const pct = (a, b) => Number.isFinite(a) && Number.isFinite(b) && b > 0 ? a / b * 100 : null;
  const byThai = (a, b) => String(a).localeCompare(String(b), 'th');

  // Sum a count field; missing values are reported, never treated as zero.
  function total(rows, key) {
    let value = 0, n = 0;
    for (const r of rows) if (isCount(r[key])) { value += r[key]; n++; }
    return { value: n ? value : null, n, of: rows.length, complete: n === rows.length };
  }
  // Rate from aggregated numerator and denominator over rows where both are present.
  function rate(rows, numKey, denKey) {
    let num = 0, den = 0, n = 0;
    for (const r of rows) if (isCount(r[numKey]) && isCount(r[denKey])) { num += r[numKey]; den += r[denKey]; n++; }
    return { value: n ? pct(num, den) : null, numerator: n ? num : null, denominator: n ? den : null, n, of: rows.length, complete: n === rows.length };
  }

  function seatTable(rows, colorOf) {
    const counts = new Map();
    let unresolved = 0;
    for (const r of rows) {
      if (r.winnerParty) counts.set(r.winnerParty, (counts.get(r.winnerParty) || 0) + 1);
      else unresolved++;
    }
    const seats = [...counts].map(([party, count]) => ({ party, count, color: colorOf(party) }))
      .sort((a, b) => b.count - a.count || byThai(a.party, b.party));
    return { seats, unresolved };
  }

  function partyVotes(rows) {
    const cand = new Map(), list = new Map();
    for (const r of rows) {
      for (const c of r.candidates) if (isCount(c.votes)) cand.set(c.party, (cand.get(c.party) || 0) + c.votes);
      for (const [p, v] of Object.entries(r.partyList || {})) if (isCount(v)) list.set(p, (list.get(p) || 0) + v);
    }
    return { cand, list };
  }

  function summarize(rows, colorOf) {
    const { seats, unresolved } = seatTable(rows, colorOf);
    const votes = partyVotes(rows);
    return {
      count: rows.length,
      eligible: total(rows, 'eligible'), turnout: total(rows, 'turnout'),
      turnoutRate: rate(rows, 'turnout', 'eligible'),
      invalid: total(rows, 'invalid'), noVote: total(rows, 'noVote'), valid: total(rows, 'validVotes'),
      invalidList: total(rows, 'partyListInvalid'), noVoteList: total(rows, 'partyListNoVote'), listValid: total(rows, 'partyListValidVotes'),
      invalidRate: rate(rows, 'invalid', 'turnout'),
      seats, unresolved, leaders: seats.filter(s => s.count === seats[0]?.count).map(s => s.party),
      candVotes: votes.cand, listVotes: votes.list,
      closeRaces: rows.filter(r => Number.isFinite(r.marginPct) && r.marginPct < 5).length,
    };
  }

  // Aggregate vote share: party votes summed over the rows divided by the same rows' valid ballots.
  function share(summary, party, ballot) {
    const votes = ballot === 'partyList' ? summary.listVotes.get(party) || 0 : summary.candVotes.get(party) || 0;
    const den = ballot === 'partyList' ? summary.listValid : summary.valid;
    return { value: den.complete ? pct(votes, den.value) : null, votes, denominator: den.value, complete: den.complete };
  }

  function build(raw, M, ref, portraits) {
    if (!raw || !Array.isArray(raw.districts) || !M) throw Error('Election data or model is unavailable');
    // Province names and constituency counts come with the election dataset (data/<election>/provinces.csv);
    // the older single-file snapshot falls back to the 2569 registry built into model.js.
    const registry = raw.registry || M.REGISTRY;
    M.validateDataset(raw.districts, undefined, registry);
    const partyIndex = new Map(raw.parties.map(p => [p.name, p]));
    const colorOf = name => partyIndex.get(name)?.color || '#8a94a6';
    const nameEn = code => ref?.provinceNameEn?.[code] || null;
    const rows = raw.districts.map(d => {
      const demo = ref?.density?.[d.provinceCode];
      const r = M.calculate({ ...d, density: demo?.density ?? null, densityYear: demo?.year ?? null });
      r.provinceEn = nameEn(d.provinceCode);
      r.regionEn = REGION_EN[d.region] || d.region;
      r.turnoutPct = pct(r.turnout, r.eligible);
      r.winnerVotes = r.winner && !r.tied ? r.winner.votes : null;
      r.winnerShare = r.winner && !r.tied ? pct(r.winner.votes, r.validVotes) : null;
      r.listValid = isCount(d.partyListValidVotes) ? d.partyListValidVotes : null;
      // ECT publishes ballot counts that occasionally differ from turnout by 1–3 ballots; keep the source values, expose the gap.
      r.ballotGap = [r.validVotes, r.invalid, r.noVote, r.turnout].every(isCount) ? r.validVotes + r.invalid + r.noVote - r.turnout : null;
      r.listBallotGap = [d.partyListValidVotes, d.partyListInvalid, d.partyListNoVote, d.partyListTurnout].every(isCount) ? d.partyListValidVotes + d.partyListInvalid + d.partyListNoVote - d.partyListTurnout : null;
      return Object.freeze(r);
    }).sort((a, b) => Number(a.provinceCode) - Number(b.provinceCode) || a.number - b.number);
    const byId = new Map(rows.map(r => [r.id, r]));

    const grouped = new Map();
    for (const r of rows) { if (!grouped.has(r.provinceCode)) grouped.set(r.provinceCode, []); grouped.get(r.provinceCode).push(r); }
    const provinces = [...grouped].map(([code, list]) => {
      const s = summarize(list, colorOf);
      return Object.assign(s, {
        code, name: list[0].province, nameEn: nameEn(code), abbr: list[0].provinceAbbr, region: list[0].region, regionEn: REGION_EN[list[0].region],
        registryCount: registry[code]?.[1] ?? null, ids: list.map(r => r.id),
        density: ref?.density?.[code]?.density ?? null, densityYear: ref?.density?.[code]?.year ?? null,
        winners: list.map(r => ({
          id: r.id, number: r.number, resolved: !!r.winnerParty, tied: r.tied,
          name: r.winnerName, party: r.winnerParty, votes: r.winnerVotes, share: r.winnerShare,
          runnerName: r.runner?.name ?? null, runnerParty: r.runner?.party ?? null, runnerVotes: r.runner?.votes ?? null,
          marginVotes: r.marginVotes, marginPct: r.marginPct,
        })),
      });
    });
    const provinceByCode = new Map(provinces.map(p => [p.code, p]));

    const regions = REGION_ORDER.filter(name => rows.some(r => r.region === name)).map(name => {
      const list = rows.filter(r => r.region === name);
      return Object.assign(summarize(list, colorOf), { name, nameEn: REGION_EN[name], ids: list.map(r => r.id), provinces: provinces.filter(p => p.region === name).map(p => p.code) });
    });
    const national = summarize(rows, colorOf);

    const parties = raw.parties.map(p => ({
      ...p, portrait: portraits?.[p.name] || null,
      candVotes: national.candVotes.get(p.name) || 0, listVotes: national.listVotes.get(p.name) || 0,
      candidateCount: rows.filter(r => r.candidates.some(c => c.party === p.name)).length,
    }));
    const seatParties = parties.filter(p => p.totalSeats > 0).sort((a, b) => b.totalSeats - a.totalSeats || b.constituencySeats - a.constituencySeats || byThai(a.name, b.name));
    const principal = parties.filter(p => p.principal).sort((a, b) => b.totalSeats - a.totalSeats || byThai(a.name, b.name));

    const comparisonCache = new Map();
    function comparison(row, party) {
      const key = party || '';
      if (!comparisonCache.has(key)) comparisonCache.set(key, new Map());
      const cache = comparisonCache.get(key);
      if (!cache.has(row.id)) cache.set(row.id, M.partyComparison(row, party || undefined));
      return cache.get(row.id);
    }
    // Paired two-ballot totals: only constituencies where the party fielded a candidate.
    function pairedBallots(scopeRows, party) {
      let cand = 0, candDen = 0, list = 0, listDen = 0, n = 0, missing = 0;
      for (const r of scopeRows) {
        const c = comparison(r, party);
        if (!c.candidatePresent) { missing++; continue; }
        if (![c.candidateVotes, c.candidateDenominator, c.listVotes, c.listDenominator].every(isCount)) { missing++; continue; }
        cand += c.candidateVotes; candDen += c.candidateDenominator; list += c.listVotes; listDen += c.listDenominator; n++;
      }
      const candidateShare = n ? pct(cand, candDen) : null, listShare = n ? pct(list, listDen) : null;
      return { party, n, missing, candidateVotes: n ? cand : null, listVotes: n ? list : null, candidateDenominator: candDen, listDenominator: listDen,
        candidateShare, listShare, ppGap: candidateShare !== null && listShare !== null ? listShare - candidateShare : null, voteGap: n ? list - cand : null };
    }

    function validate() {
      const checks = [];
      const add = (id, ok, detail) => checks.push({ id, ok: !!ok, detail });
      // Expected sizes come from the election's own settings: seats per ballot and the province registry.
      const s = raw.summary || {}, seatsCons = s.constituencySeats ?? 400, seatsAll = s.totalSeats ?? seatsCons + (s.listSeats ?? 100), provinceCount = Object.keys(registry).length;
      add('districts', rows.length === seatsCons && byId.size === seatsCons, rows.length + ' constituencies, ' + byId.size + ' unique IDs');
      add('provinces', provinces.length === provinceCount && provinces.every(p => p.count === p.registryCount), provinces.length + ' provinces; constituency counts match ECT registry');
      add('province-seat-integrity', provinces.every(p => p.seats.reduce((s, x) => s + x.count, 0) + p.unresolved === p.count), 'seats won + unresolved = constituencies in every province');
      add('party-constituency-seats', parties.every(p => national.seats.find(s => s.party === p.name)?.count === p.constituencySeats || (!national.seats.find(s => s.party === p.name) && p.constituencySeats === 0)), 'derived constituency wins equal ECT seat table');
      add('party-total-seats', parties.every(p => p.totalSeats === p.constituencySeats + p.listSeats) && parties.reduce((t, p) => t + p.totalSeats, 0) === seatsAll, 'total = constituency + party-list for every party; Σ = ' + seatsAll);
      add('winner-order', rows.every(r => !r.winner || !r.runner || (r.winner.votes >= r.runner.votes && r.marginVotes === r.winner.votes - r.runner.votes)), 'winner ≥ runner-up and margin = difference');
      add('national-turnout', national.turnout.value === s.turnout && national.eligible.value === s.eligible, 'Σ turnout ' + national.turnout.value + ' / Σ eligible ' + national.eligible.value);
      add('national-invalid', national.invalid.value === s.invalid, 'Σ constituency invalid ballots ' + national.invalid.value);
      add('national-valid', national.valid.value === s.validVotes, 'Σ constituency valid ballots ' + national.valid.value);
      add('party-list-votes', parties.every(p => !isCount(p.officialListVotes) || p.officialListVotes === p.listVotes), 'Σ district party-list votes = ECT party totals');
      // The ECT party table reports 0 constituency votes for a few small parties whose candidates do
      // appear in district results; those source-level gaps are listed rather than hidden.
      const gaps = parties.filter(p => isCount(p.officialConstituencyVotes) && p.officialConstituencyVotes !== p.candVotes);
      add('constituency-votes', gaps.every(p => p.officialConstituencyVotes === 0), 'Σ candidate votes by party = ECT party totals' + (gaps.length ? '; ECT party table shows 0 for ' + gaps.map(p => p.name + ' (' + p.candVotes + ' in district results)').join(', ') : ''));
      const nonZero = gapKey => rows.filter(r => r[gapKey] !== null && r[gapKey] !== 0);
      const missing = ['eligible', 'turnout', 'invalid', 'noVote', 'validVotes', 'listValid'].filter(f => rows.some(r => r[f] === null || r[f] === undefined));
      add('missing-values', missing.length === 0, missing.length ? 'missing: ' + missing.join(', ') : 'no missing counts in ' + rows.length + ' constituencies (eligible, turnout, valid, invalid, no-vote, party-list valid)');
      add('turnout-within-eligible', rows.every(r => !isCount(r.turnout) || !isCount(r.eligible) || r.turnout <= r.eligible), 'turnout never exceeds eligible voters');
      const ballotGaps = nonZero('ballotGap'), listGaps = nonZero('listBallotGap');
      checks.push({ id: 'ballot-reconciliation', ok: true, note: true, detail: 'valid + invalid + no-vote = turnout except ' + ballotGaps.length + ' constituencies (constituency ballot) and ' + listGaps.length + ' (party-list) where ECT figures differ by ' + Math.max(0, ...ballotGaps.map(r => Math.abs(r.ballotGap)), ...listGaps.map(r => Math.abs(r.listBallotGap))) + ' ballots at most; source values kept' });
      const tiles = ref?.tiles || [];
      add('hex-tiles', tiles.length === provinceCount && new Set(tiles.map(t => t.code)).size === provinceCount && new Set(tiles.map(t => t.x + ',' + t.y)).size === provinceCount && tiles.every(t => provinceByCode.has(t.code)), tiles.length + ' tiles, unique positions, mapped to ECT codes');
      return checks;
    }

    return { raw, rows, byId, provinces, provinceByCode, regions, national, parties, partyIndex, seatParties, principal,
      colorOf, comparison, pairedBallots, share, summarize: list => summarize(list, colorOf), validate,
      REGION_ORDER, REGION_EN, updatedAt: raw.summary?.updatedAt || null, electionDate: raw.electionDate };
  }

  const api = { build, total, rate, pct, share, REGION_ORDER, REGION_EN };
  root.E69Data = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
