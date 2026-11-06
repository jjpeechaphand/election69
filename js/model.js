(function (root) {
  'use strict';
  const VERSION = 2;
  const SNAPSHOT_SCHEMA = 'election69-snapshot-2';
  const SCENARIO_FIELDS = ['eligible','turnout','invalid','noVote','candidates','partyList'];
  const OCR_FIELDS = ['ocrCandidates','ocrPartyList','ocrTotal','ocrValid','ocrInvalid','ocrNoVote','ocrTurnout','ocrEligible',
    'ocrAvailable','ocrPartyListAvailable','ocrImportedAt','ocrImportSource',
    'ocrConstituencyImportedAt','ocrConstituencyImportSource','ocrPartyListImportedAt','ocrPartyListImportSource'];
  // Official 2026 province names and constituency counts; deliberately not editable through imports.
  const REGISTRY = Object.freeze({"10":["กรุงเทพมหานคร",33],"11":["สมุทรปราการ",8],"12":["นนทบุรี",8],"13":["ปทุมธานี",8],"14":["พระนครศรีอยุธยา",5],"15":["อ่างทอง",2],"16":["ลพบุรี",4],"17":["สิงห์บุรี",1],"18":["ชัยนาท",2],"19":["สระบุรี",4],"20":["ชลบุรี",10],"21":["ระยอง",5],"22":["จันทบุรี",3],"23":["ตราด",1],"24":["ฉะเชิงเทรา",4],"25":["ปราจีนบุรี",3],"26":["นครนายก",2],"27":["สระแก้ว",3],"30":["นครราชสีมา",16],"31":["บุรีรัมย์",10],"32":["สุรินทร์",8],"33":["ศรีสะเกษ",9],"34":["อุบลราชธานี",11],"35":["ยโสธร",3],"36":["ชัยภูมิ",7],"37":["อำนาจเจริญ",2],"38":["บึงกาฬ",3],"39":["หนองบัวลำภู",3],"40":["ขอนแก่น",11],"41":["อุดรธานี",10],"42":["เลย",4],"43":["หนองคาย",3],"44":["มหาสารคาม",6],"45":["ร้อยเอ็ด",8],"46":["กาฬสินธุ์",6],"47":["สกลนคร",7],"48":["นครพนม",4],"49":["มุกดาหาร",2],"50":["เชียงใหม่",10],"51":["ลำพูน",2],"52":["ลำปาง",4],"53":["อุตรดิตถ์",3],"54":["แพร่",3],"55":["น่าน",3],"56":["พะเยา",3],"57":["เชียงราย",7],"58":["แม่ฮ่องสอน",2],"60":["นครสวรรค์",6],"61":["อุทัยธานี",2],"62":["กำแพงเพชร",4],"63":["ตาก",3],"64":["สุโขทัย",4],"65":["พิษณุโลก",5],"66":["พิจิตร",3],"67":["เพชรบูรณ์",6],"70":["ราชบุรี",5],"71":["กาญจนบุรี",5],"72":["สุพรรณบุรี",5],"73":["นครปฐม",6],"74":["สมุทรสาคร",4],"75":["สมุทรสงคราม",1],"76":["เพชรบุรี",3],"77":["ประจวบคีรีขันธ์",3],"80":["นครศรีธรรมราช",9],"81":["กระบี่",3],"82":["พังงา",2],"83":["ภูเก็ต",3],"84":["สุราษฎร์ธานี",7],"85":["ระนอง",1],"86":["ชุมพร",3],"90":["สงขลา",9],"91":["สตูล",2],"92":["ตรัง",4],"93":["พัทลุง",3],"94":["ปัตตานี",5],"95":["ยะลา",3],"96":["นราธิวาส",5]});
  Object.values(REGISTRY).forEach(Object.freeze);
  const isNumber = value => typeof value === 'number' && Number.isFinite(value);
  const nullableNumber = value => {
    if (value === null || value === undefined || typeof value === 'string' && !value.trim()) return null;
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    const n = Number(value); return Number.isFinite(n) ? n : null;
  };
  const count = value => { const n = nullableNumber(value); return Number.isSafeInteger(n) && n >= 0 ? n : null; };
  const validCount = value => Number.isSafeInteger(value) && value >= 0;
  const plainObject = value => !!value && typeof value === 'object' && !Array.isArray(value)
    && [null, Object.prototype].includes(Object.getPrototypeOf(value));
  const safeName = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 500
    && !['__proto__', 'prototype', 'constructor'].includes(value.trim()) && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value);
  const ratio = (a, b) => isNumber(a) && isNumber(b) && b > 0 ? a / b : null;
  const percent = (a, b) => { const value = ratio(a, b); return value === null ? null : value * 100; };
  const clone = value => {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(clone);
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  };
  const deepFreeze = value => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(deepFreeze); Object.freeze(value);
    }
    return value;
  };

  function calculate(input) {
    const candidates = (Array.isArray(input.candidates) ? input.candidates : []).map(c => ({ ...c, votes: count(c.votes) }))
      .sort((a, b) => (b.votes ?? -1) - (a.votes ?? -1) || Number(a.number) - Number(b.number));
    const total = candidates.reduce((sum, c) => sum + (c.votes ?? 0), 0);
    const complete = candidates.length > 0 && candidates.every(c => c.votes !== null) && Number.isSafeInteger(total);
    const validVotes = complete ? total : null;
    const winner = complete && validVotes > 0 ? candidates[0] : null;
    const runner = winner && candidates.length > 1 ? candidates[1] : null;
    const marginVotes = winner && runner ? winner.votes - runner.votes : null;
    const tied = marginVotes === 0;
    const winningListVotes = winner && Object.hasOwn(input.partyList || {}, winner.party) ? count(input.partyList[winner.party]) : null;
    const splitGap = isNumber(winningListVotes) && winner && !tied ? winningListVotes - winner.votes : null;
    const invalid = count(input.invalid), noVote = count(input.noVote), turnout = count(input.turnout);
    const auditNumerator = isNumber(invalid) && isNumber(noVote) && Number.isSafeInteger(invalid + noVote) ? invalid + noVote : null;
    const auditRisk = marginVotes === 0 && auditNumerator > 0 ? Infinity : ratio(auditNumerator, marginVotes);
    const losingVotes = winner && !tied ? validVotes - winner.votes : null;
    const wasted = isNumber(losingVotes) && isNumber(invalid) ? losingVotes + invalid : null;
    const ocrTotal = count(input.ocrTotal), officialTotal = count(input.officialTotal);
    const ocrRecords = input.ocrCandidates;
    const ocrEvidenceSum = Array.isArray(ocrRecords) && ocrRecords.length > 0 && ocrRecords.every(c => validCount(c.votes)) ? ocrRecords.reduce((sum,c)=>sum+c.votes,0) : null;
    const officialOcrDiscrepancy = officialTotal !== null && ocrTotal !== null ? Math.abs(officialTotal - ocrTotal) : null;
    const scenarioOcrDiscrepancy = validVotes !== null && ocrTotal !== null ? Math.abs(validVotes - ocrTotal) : null;
    const enp = validVotes > 0 ? 1 / candidates.reduce((sum, c) => sum + (c.votes / validVotes) ** 2, 0) : null;
    return {
      ...input, candidates, winner, runner, tied, validVotes, invalid, noVote, turnout, marginVotes,
      winnerParty: winner && !tied ? winner.party : null, winnerName: winner && !tied ? winner.name : null,
      marginPct: percent(marginVotes, validVotes), splitGap, splitRatio: percent(splitGap, validVotes),
      wastedPct: percent(wasted, turnout), auditRisk, auditRiskIndex: auditRisk,
      auditRiskUnbounded: auditRisk === Infinity, enp, invalidPct: percent(invalid, turnout),
      ocrDiscrepancy: officialOcrDiscrepancy, officialOcrDiscrepancy, scenarioOcrDiscrepancy,
      ocrEvidenceSum, ocrAggregateBalance: ocrTotal !== null && ocrEvidenceSum !== null ? ocrTotal - ocrEvidenceSum : null,
      comparisonBasis: input.locallyEdited ? 'สถานการณ์แก้ไขในเครื่อง; ค่าต้นทาง กกต. คงเดิม' : 'ผล กกต. เทียบ OCR ตามแหล่งที่มาที่ระบุ',
      ballotBalance: isNumber(validVotes) && isNumber(invalid) && isNumber(noVote) && isNumber(turnout)
        ? validVotes + invalid + noVote - turnout : null,
    };
  }

  // `registry` ({code: [province name, constituency count]}) defaults to the 2569 ECT registry; an election
  // dataset loaded from data/<election>/provinces.csv passes its own.
  function validateDistrict(d, registry = REGISTRY) {
    if (!plainObject(d)) throw Error('รูปแบบเขตเลือกตั้งต้องเป็นออบเจ็กต์');
    if (typeof d.id !== 'string' || !/^[1-9]\d_[1-9]\d?$/.test(d.id)) throw Error('รหัสเขตต้องเป็นรหัสจังหวัด_เลขเขต เช่น 10_1 ห้ามเติมศูนย์นำหน้า');
    if (typeof d.provinceCode !== 'string' || d.provinceCode !== d.id.split('_')[0]
      || !Number.isSafeInteger(d.number) || d.number !== Number(d.id.split('_')[1])) throw Error(`${d.id}: รหัสจังหวัดหรือเลขเขตไม่ตรงกับ id`);
    const registered = registry[d.provinceCode];
    if (!registered || d.number > registered[1] || d.province !== registered[0]) throw Error(`${d.id}: ชื่อจังหวัดหรือเลขเขตไม่ตรงทะเบียนจังหวัด`);
    for (const field of ['eligible', 'turnout', 'invalid', 'noVote', 'officialTotal', 'ocrTotal', 'ocrValid', 'ocrInvalid', 'ocrNoVote', 'ocrTurnout']) {
      const value = d[field];
      if (value !== null && value !== undefined && (!isNumber(value) || !Number.isSafeInteger(value) || value < 0)) throw Error(`${d.id}: ${field} ต้องเป็นจำนวนเต็มไม่ติดลบ หรือ null`);
    }
    if (!Array.isArray(d.candidates) || d.candidates.length > 200) throw Error(`${d.id}: candidates ต้องมีไม่เกิน 200 รายการ`);
    const numbers = new Set();
    for (const candidate of d.candidates) {
      if (!plainObject(candidate) || !safeName(candidate.name) || !safeName(candidate.party)) throw Error(`${d.id}: ต้องระบุชื่อผู้สมัครและพรรคที่ถูกต้อง`);
      if (!Number.isSafeInteger(candidate.number) || candidate.number < 1 || numbers.has(candidate.number)) throw Error(`${d.id}: หมายเลขผู้สมัครต้องเป็นจำนวนเต็มบวกและไม่ซ้ำ`);
      numbers.add(candidate.number);
      if (!Number.isSafeInteger(candidate.votes) || candidate.votes < 0) throw Error(`${d.id}: คะแนนผู้สมัครต้องเป็นจำนวนเต็มไม่ติดลบ`);
    }
    if (!Number.isSafeInteger(d.candidates.reduce((sum,c) => sum + c.votes,0))) throw Error(`${d.id}: ผลรวมคะแนนเกินขอบเขตจำนวนเต็มที่ปลอดภัย`);
    if (!plainObject(d.partyList)) throw Error(`${d.id}: partyList ต้องเป็นออบเจ็กต์ชื่อพรรค:คะแนน`);
    for (const [party, votes] of Object.entries(d.partyList)) {
      if (!safeName(party) || (votes !== null && !validCount(votes))) throw Error(`${d.id}: คะแนนบัญชีรายชื่อไม่ถูกต้อง`);
    }
    if (!Number.isSafeInteger(Object.values(d.partyList).reduce((sum,votes)=>sum+(votes??0),0))) throw Error(`${d.id}: ผลรวมบัญชีรายชื่อเกินขอบเขตที่ปลอดภัย`);
    if (validCount(d.invalid) && validCount(d.noVote) && !Number.isSafeInteger(d.invalid+d.noVote)) throw Error(`${d.id}: ผลรวมบัตรเสียและไม่เลือกผู้ใดเกินขอบเขตที่ปลอดภัย`);
    return true;
  }

  function validateDataset(rows, knownIds, registry) {
    if (!Array.isArray(rows) || !rows.length || rows.length > 1000) throw Error('ชุดข้อมูลต้องมีเขตเลือกตั้ง 1–1,000 รายการ');
    const ids = new Set();
    for (const d of rows) {
      validateDistrict(d, registry);
      if (ids.has(d.id)) throw Error(`รหัสเขตซ้ำ: ${d.id}`);
      if (knownIds && !knownIds.has(d.id)) throw Error(`ไม่พบเขต ${d.id} ในทะเบียน 400 เขตของ กกต.`);
      ids.add(d.id);
    }
    return true;
  }

  function validateEvidence(d, source = null) {
    if (Object.hasOwn(d,'ocrCandidates')) {
      if (!Array.isArray(d.ocrCandidates)) throw Error(`${d.id}: ocrCandidates ต้องเป็นอาร์เรย์`);
      // The immutable OCR baseline itself contains malformed candidate numbers. Preserve exact
      // source evidence, while requiring newly introduced evidence to satisfy the strict schema.
      if (!source || !sameValue(d.ocrCandidates,source.ocrCandidates)) validateDistrict({...d,candidates:d.ocrCandidates});
    }
    if (Object.hasOwn(d,'ocrPartyList')) validateDistrict({...d,partyList:d.ocrPartyList});
    for (const key of ['ocrAvailable','ocrPartyListAvailable']) {
      if (Object.hasOwn(d,key) && typeof d[key] !== 'boolean') throw Error(`${d.id}: ${key} ต้องเป็น boolean`);
    }
    if (Object.hasOwn(d,'ocrEligible') && d.ocrEligible !== null && !validCount(d.ocrEligible)) throw Error(`${d.id}: ocrEligible ไม่ถูกต้อง`);
    for (const key of ['ocrImportedAt','ocrConstituencyImportedAt','ocrPartyListImportedAt']) if (Object.hasOwn(d,key) && (typeof d[key] !== 'string' || !Number.isFinite(Date.parse(d[key])))) throw Error(`${d.id}: วันที่นำเข้า OCR ไม่ถูกต้อง`);
    for (const key of ['ocrImportSource','ocrConstituencyImportSource','ocrPartyListImportSource']) if (Object.hasOwn(d,key) && !safeName(d[key])) throw Error(`${d.id}: ชื่อไฟล์ OCR ไม่ถูกต้อง`);
    return true;
  }

  function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stableValue(value[k])]));
    return value;
  }
  const sameValue = (a,b) => JSON.stringify(stableValue(a)) === JSON.stringify(stableValue(b));
  const candidateValues = rows => (rows || []).map(c=>({number:c.number,name:c.name,party:c.party,votes:c.votes})).sort((a,b)=>a.number-b.number);
  function fieldChanged(a,b,key) {
    return key === 'candidates' || key === 'ocrCandidates'
      ? !sameValue(candidateValues(a[key]),candidateValues(b[key])) : !sameValue(a[key],b[key]);
  }
  function snapshotRow(incoming, source) {
    const next = clone(source);
    for (const key of [...SCENARIO_FIELDS,...OCR_FIELDS]) if (Object.hasOwn(incoming,key)) next[key] = clone(incoming[key]);
    validateDistrict(next); validateEvidence(next,source);
    next.locallyEdited = SCENARIO_FIELDS.some(key=>fieldChanged(next,source,key));
    next.ocrEdited = OCR_FIELDS.some(key=>fieldChanged(next,source,key));
    if (next.locallyEdited && typeof incoming.scenarioUpdatedAt === 'string' && Number.isFinite(Date.parse(incoming.scenarioUpdatedAt))) next.scenarioUpdatedAt = incoming.scenarioUpdatedAt;
    return next;
  }

  function sourceDateOf(officialRows, expected) {
    const date = expected ?? officialRows[0]?.updatedAt;
    if (typeof date !== 'string' || !Number.isFinite(Date.parse(date))) throw Error('ต้องระบุวันที่ชุดข้อมูลต้นทาง กกต. สำหรับ snapshot');
    return date;
  }

  function createSnapshot(rows, officialRows, sourceDate, options = {}) {
    validateDataset(officialRows);
    const sources = new Map(officialRows.map(d=>[d.id,d]));
    validateDataset(rows,new Set(sources.keys()));
    const normalized = rows.map(d=>snapshotRow(d,sources.get(d.id)));
    const saved = options.changedOnly ? normalized.filter(d=>d.locallyEdited || d.ocrEdited) : normalized;
    const date = sourceDateOf(officialRows,sourceDate);
    return {schemaVersion:SNAPSHOT_SCHEMA,version:VERSION,sourceSnapshot:date,sourceDate:date,
      savedAt:new Date().toISOString(),districts:saved,
      scenarioCount:normalized.filter(d=>d.locallyEdited).length,ocrEditedCount:normalized.filter(d=>d.ocrEdited).length};
  }

  function restoreSnapshot(input, officialRows, expectedSourceDate, currentRows = officialRows) {
    let saved = input;
    if (typeof saved === 'string') { try { saved = JSON.parse(saved); } catch { throw Error('Snapshot JSON ไม่ถูกต้อง'); } }
    if (!plainObject(saved)) throw Error('Snapshot ต้องเป็นออบเจ็กต์');
    const legacyLocal = !saved.schemaVersion && saved.version === VERSION && typeof saved.sourceDate === 'string';
    if (![SNAPSHOT_SCHEMA,'election69-working-1'].includes(saved.schemaVersion) && !legacyLocal) throw Error('ไม่รองรับ schema ของ snapshot');
    if (saved.version !== undefined && saved.version !== VERSION) throw Error('เวอร์ชัน snapshot ไม่ตรงกับระบบ');
    validateDataset(officialRows); validateDataset(currentRows,new Set(officialRows.map(d=>d.id)));
    const expected = sourceDateOf(officialRows,expectedSourceDate), received = saved.sourceSnapshot ?? saved.sourceDate;
    if (received !== expected || saved.sourceDate !== undefined && saved.sourceDate !== expected) throw Error('วันที่ต้นทาง snapshot ไม่ตรงชุด กกต. ปัจจุบัน จึงไม่นำข้อมูลมาปะปน');
    if (!Array.isArray(saved.districts) || saved.districts.length > officialRows.length) throw Error('Snapshot districts ไม่ถูกต้อง');
    if (saved.districts.length) validateDataset(saved.districts,new Set(officialRows.map(d=>d.id)));
    const patches = new Map(saved.districts.map(d=>[d.id,d])), sources = new Map(officialRows.map(d=>[d.id,d]));
    // Validate every incoming patch before any result is exposed; no input is mutated.
    for (const d of saved.districts) validateEvidence(d,sources.get(d.id));
    const rows = currentRows.map(d=>snapshotRow(patches.get(d.id) || d,sources.get(d.id)));
    const editedCount = rows.filter(d=>d.locallyEdited).length, ocrEditedCount = rows.filter(d=>d.ocrEdited).length;
    return {rows,count:saved.districts.length,kind:'snapshot',editedCount,ocrEditedCount,
      warnings:['คืนสำเนาสถานการณ์และหลักฐาน OCR แล้ว; ค่าต้นทาง กกต. และแหล่งอ้างอิงยึดชุดต้นฉบับปัจจุบัน']};
  }

  function defaultState() {
    return {
      mode: 'strategy',
      dataProcessing: { province: '', region: '', party: '', partyMode: 'support', splitUnit: 'pp', quality: 'all', maxMargin: 100, minRisk: 0, sort: 'urban' },
      visualMapping: { map: 'geo', stream: 'stream', detached: [], densityScale: 'log', supportBallot: 'constituency', auditMetric: 'ocrTotal' },
      visualRendering: { selected: null, brush: null, brushIds: null, hovered: null, lens: [.3, .65], lensPower: 1, vertical: 1 },
    };
  }

  function urbanCompare(a, b) {
    const knownA = isNumber(a.density) && a.density >= 0, knownB = isNumber(b.density) && b.density >= 0;
    if (knownA !== knownB) return knownA ? -1 : 1;
    if (!knownA) return a.id.localeCompare(b.id, 'en', { numeric: true });
    return (a.density ?? 0) - (b.density ?? 0) || a.id.localeCompare(b.id, 'en', { numeric: true });
  }

  function sortRows(rows, order, filters = {}) {
    const field = { margin: 'marginPct', split: 'splitGap', invalid: 'invalidPct', risk: 'auditRisk', ocr: 'ocrDiscrepancy' }[order];
    if (!field && !['support','quality'].includes(order)) return [...rows].sort(urbanCompare);
    const values = new Map(rows.map(row => {
      let value = row[field];
      if (order === 'support' || order === 'split' && (filters.party || filters.splitUnit)) {
        const comparison = row.comparison && row.comparison.party === (filters.party || row.winnerParty || row.winner?.party)
          ? row.comparison : partyComparison(row, filters.party);
        value = order === 'support' ? filters.supportBallot === 'partyList' ? comparison.listShare : comparison.candidateShare : filters.splitUnit === 'votes' ? comparison.voteGap : comparison.ppGap;
      } else if (order === 'quality') {
        const quality = row.qualityInfo || row.qualityMetrics || dataQuality(row);
        value = quality.hasOCR && quality.officialReferenceAvailable ? quality.scoreMismatchCount : null;
      }
      return [row,value];
    }));
    return [...rows].sort((a, b) => {
      const av = values.get(a), bv = values.get(b);
      const known = value => isNumber(value) || field === 'auditRisk' && value === Infinity;
      const knownA = known(av), knownB = known(bv);
      if (knownA !== knownB) return knownA ? -1 : 1;
      if (!knownA) return urbanCompare(a,b);
      const result = order === 'margin' ? av - bv : bv - av;
      return (Number.isNaN(result) ? 0 : result) || urbanCompare(a, b);
    });
  }

  function filterRows(rows, filters) {
    // Preserve legacy direct callers; the shared application state always makes
    // the new support/wins choice explicit, with support as the UI default.
    const partyMode = filters && Object.hasOwn(filters,'partyMode') ? filters.partyMode : 'wins';
    filters = { ...defaultState().dataProcessing, ...(filters || {}) };
    return sortRows(rows.filter(d => (!filters.province || d.provinceCode === filters.province)
      && (!filters.region || d.region === filters.region)
      && (!filters.party || partyMode === 'support' || (!d.tied && d.winner?.party === filters.party))
      && (filters.maxMargin === 100 || d.marginPct !== null && d.marginPct <= filters.maxMargin)
      && (filters.minRisk === 0 || d.auditRisk !== null && d.auditRisk >= filters.minRisk)
      && qualityMatches(d,filters.quality)), filters.sort, filters);
  }

  function completeSum(values) {
    if (!Array.isArray(values) || !values.length || !values.every(validCount)) return null;
    const sum = values.reduce((total,value)=>total+value,0);
    return Number.isSafeInteger(sum) ? sum : null;
  }

  function partyComparison(row, selectedParty = '') {
    const calculated = calculate(row), scenario = !!row.locallyEdited;
    const party = selectedParty || (!calculated.tied ? calculated.winner?.party : null);
    const candidates = party ? calculated.candidates.filter(candidate=>candidate.party===party) : [];
    const candidatePresent = candidates.length > 0;
    const candidateVotes = candidatePresent ? completeSum(candidates.map(candidate=>candidate.votes)) : null;
    const listVotes = party && Object.hasOwn(row.partyList || {},party) ? count(row.partyList[party]) : null;
    const candidateSum = completeSum(calculated.candidates.map(candidate=>candidate.votes));
    const listSum = completeSum(Object.values(row.partyList || {}));
    let candidateDenominator, listDenominator, candidateDenominatorSource, listDenominatorSource;
    if (scenario) {
      candidateDenominator = candidateSum; listDenominator = listSum;
      candidateDenominatorSource = 'scenario-candidate-sum'; listDenominatorSource = 'scenario-party-list-sum';
    } else {
      candidateDenominator = count(row.officialValid ?? row.reportedValidVotes);
      candidateDenominatorSource = candidateDenominator === null ? 'candidate-sum' : 'official-valid-constituency';
      if (candidateDenominator === null) candidateDenominator = candidateSum;
      listDenominator = count(row.partyListValidVotes);
      listDenominatorSource = listDenominator === null ? 'party-list-sum' : 'official-valid-party-list';
      if (listDenominator === null) listDenominator = listSum;
    }
    const candidateShare = percent(candidateVotes,candidateDenominator), listShare = percent(listVotes,listDenominator);
    const voteGap = candidateVotes !== null && listVotes !== null ? listVotes-candidateVotes : null;
    const ppGap = candidateShare !== null && listShare !== null ? listShare-candidateShare : null;
    const reason = !party ? 'ไม่สามารถระบุพรรคสำหรับเปรียบเทียบได้' : !candidatePresent ? 'ไม่พบผู้สมัครของพรรคนี้ในเขต ไม่แทนข้อมูลที่ขาดด้วยศูนย์'
      : candidateVotes === null ? 'คะแนนผู้สมัครไม่ครบ' : listVotes === null ? 'ไม่มีคะแนนบัญชีรายชื่อของพรรคนี้'
      : candidateDenominator === null || listDenominator === null ? 'ข้อมูลตัวหารบัตรดีไม่ครบ'
      : candidateDenominator === 0 || listDenominator === 0 ? 'ไม่มีบัตรดีสำหรับคำนวณสัดส่วน' : null;
    return {party:party || null,basis:selectedParty?'selected-party':'winner-party',candidatePresent,candidateCount:candidates.length,candidateVotes,listVotes,
      candidateDenominator,listDenominator,candidateValid:candidateDenominator,listValid:listDenominator,candidateShare,listShare,voteGap,ppGap,
      candidateDenominatorSource,listDenominatorSource,reason,missingReason:reason,scenario};
  }

  function qualityMatches(row, filter = 'all') {
    if (!filter || filter === 'all') return true;
    const q = row.qualityInfo || row.qualityMetrics || dataQuality(row);
    if (filter === 'review') return q.needsReview;
    if (filter === 'missing') return !q.candidateOCRAvailable || !q.partyListOCRAvailable;
    if (filter === 'mismatch') return q.scoreMismatchCount > 0 || q.absoluteAggregateDifference > 0 || q.partyListScoreMismatchCount > 0 || q.partyListAggregateDifference !== null && q.partyListAggregateDifference !== undefined && q.partyListAggregateDifference !== 0;
    if (filter === 'unmatched') return q.unmatchedOfficialCount > 0 || q.unmatchedOCRCount > 0 || q.ambiguousCount > 0 || q.sourceUnmatchedOCRCount > 0;
    if (filter === 'number') return q.numberDifferenceCount > 0 || q.candidateNumberIssueCount > 0;
    return true;
  }

  function aggregateProvinceSupport(rows, party, ballot = 'constituency') {
    if (!['constituency','partyList'].includes(ballot)) throw Error('ชนิดบัตรต้องเป็น constituency หรือ partyList');
    if (!party) return [];
    const ids = new Set(), groups = new Map();
    for (const row of rows) {
      if (ids.has(row.id)) throw Error('พบเขตซ้ำในการรวมผลระดับจังหวัด: '+row.id);
      ids.add(row.id);
      if (!groups.has(row.provinceCode)) groups.set(row.provinceCode,[]);
      groups.get(row.provinceCode).push(row);
    }
    return [...groups].map(([provinceCode, scoped])=>{
      let votes=0,denominator=0,missingCount=0,candidateMissingCount=0,includedDistrictCount=0;
      for (const row of scoped) {
        const c=partyComparison(row,party);
        if (!c.candidatePresent) candidateMissingCount++;
        const n=ballot==='partyList'?c.listVotes:c.candidatePresent?c.candidateVotes:0;
        const d=ballot==='partyList'?c.listDenominator:c.candidateDenominator;
        if (n===null || d===null || !validCount(n) || !validCount(d)) {missingCount++;continue;}
        votes+=n;denominator+=d;includedDistrictCount++;
      }
      const densities=[...new Set(scoped.map(d=>d.density).filter(d=>isNumber(d)&&d>=0))];
      const years=[...new Set(scoped.map(d=>d.densityYear).filter(d=>d!==null&&d!==undefined))];
      const safe=Number.isSafeInteger(votes)&&Number.isSafeInteger(denominator);
      const candidatePresent=candidateMissingCount<scoped.length, available=ballot==='partyList'||candidatePresent;
      return {provinceCode,province:scoped[0].province,party,ballot,density:densities.length===1?densities[0]:null,densityYear:years.length===1?years[0]:null,
        densityConflict:densities.length>1,votes:includedDistrictCount&&safe&&available?votes:null,denominator:includedDistrictCount&&safe?denominator:null,
        share:includedDistrictCount&&safe&&available?percent(votes,denominator):null,districtIds:scoped.map(d=>d.id),districtCount:scoped.length,includedDistrictCount,candidatePresent,
        missingCount,candidateMissingCount,partialProvince:scoped.length!==(REGISTRY[provinceCode]?.[1] || scoped.length),scenario:scoped.some(d=>d.locallyEdited),
        aggregation:'ผลรวมคะแนนพรรค ÷ ผลรวมบัตรดีของชนิดบัตรเดียวกันในเขตที่อยู่ในตัวกรอง × 100',
        coverage:percent(includedDistrictCount,scoped.length),candidateCoverage:percent(scoped.length-candidateMissingCount,scoped.length)};
    }).sort((a,b)=>Number(a.provinceCode)-Number(b.provinceCode));
  }

  function lens(x, start, end, magnification = 1) {
    x = Math.max(0,Math.min(1,isNumber(x) ? x : 0));
    const a = Math.max(0, Math.min(.99, isNumber(start) ? start : 0)), b = Math.max(a + .001, Math.min(1, isNumber(end) ? end : 1));
    const m = Math.max(1, Math.min(100, isNumber(magnification) ? magnification : 1)), length = a + (b - a) * m + 1 - b;
    return (x < a ? x : x <= b ? a + (x - a) * m : a + (b - a) * m + x - b) / length;
  }

  function parseCSV(text) {
    if (typeof text !== 'string' || text.length > 25_000_000) throw Error('CSV ต้องเป็นข้อความขนาดไม่เกิน 25 MB');
    const rows = []; let row = [], field = '', state = 'start';
    const input = text.replace(/^\uFEFF/, '');
    const finishField = () => { row.push(field); field = ''; state = 'start'; };
    const finishRow = () => { finishField(); if (row.some(value => value !== '')) rows.push(row); row = []; };
    for (let i = 0; i < input.length; i++) {
      const c = input[i];
      if (state === 'quoted') {
        if (c === '"') {
          if (input[i + 1] === '"') { field += '"'; i++; } else state = 'closed';
        } else field += c;
      } else if (c === ',') finishField();
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && input[i + 1] === '\n') i++; finishRow();
      } else if (c === '"') {
        if (state !== 'start') throw Error('CSV มีเครื่องหมายคำพูดภายในช่องที่ไม่ได้ครอบด้วยคำพูด');
        state = 'quoted';
      } else {
        if (state === 'closed') throw Error('CSV มีข้อความหลังเครื่องหมายคำพูดปิด');
        field += c; state = 'unquoted';
      }
    }
    if (state === 'quoted') throw Error('CSV มีเครื่องหมายคำพูดที่ไม่ปิด');
    finishRow();
    if (rows.length < 2) throw Error('CSV ต้องมีหัวตารางและข้อมูล');
    const headers = rows.shift().map(s => s.trim());
    if (headers.some(h => !safeName(h)) || new Set(headers).size !== headers.length) throw Error('CSV มีชื่อคอลัมน์ว่าง ไม่ถูกต้อง หรือซ้ำ');
    return rows.map((values, i) => {
      if (values.length !== headers.length) throw Error(`CSV แถว ${i + 2} มีจำนวนคอลัมน์ไม่ตรงหัวตาราง`);
      return Object.fromEntries(headers.map((h, index) => [h, values[index]]));
    });
  }

  function csvToDistricts(text, baseline) {
    const records = parseCSV(text), byId = new Map(baseline.map(d => [d.id, d])), groups = new Map();
    const repeated = new Map();
    const integer = (value, label, allowNull = true) => {
      if (value === '' && allowNull) return null;
      if (!/^\d+$/.test(value) || !validCount(Number(value))) throw Error(`${label}: ต้องเป็นจำนวนเต็มไม่ติดลบ`);
      return Number(value);
    };
    const assignConsistent = (d, key, value) => {
      const signature = `${d.id}:${key}`, serialized = JSON.stringify(value);
      if (repeated.has(signature) && repeated.get(signature) !== serialized) throw Error(`${d.id}: ค่า ${key} ขัดแย้งกันระหว่างแถว CSV`);
      repeated.set(signature,serialized); d[key] = value;
    };
    const safeFormat = records.some(r => Object.hasOwn(r, '_format'));
    if (safeFormat && records.some(r => r._format !== 'election69-csv-v2')) throw Error('รูปแบบ CSV export ไม่ตรงกัน');
    const decodeText = value => safeFormat && value.startsWith("'") ? value.slice(1) : value;
    for (const row of records) {
      if (!row.id || !Object.hasOwn(row, 'name') || !Object.hasOwn(row, 'party') || !Object.hasOwn(row, 'votes') || !Object.hasOwn(row, 'number')) throw Error('CSV ต้องมี id,number,name,party,votes และอาจมี listVotes,invalid,noVote,turnout,ocrTotal');
      if (!byId.has(row.id)) throw Error(`ไม่พบรหัสเขต ${row.id}`);
      if (!groups.has(row.id)) groups.set(row.id, { ...clone(byId.get(row.id)), candidates: [] });
      const d = groups.get(row.id);
      if (row.partyListJSON) {
        let partyList; try { partyList = JSON.parse(row.partyListJSON); } catch { throw Error(`${d.id}: partyListJSON ไม่ถูกต้อง`); }
        assignConsistent(d,'partyList',partyList);
      }
      if (row.rowType && !['candidate','district'].includes(row.rowType)) throw Error('CSV rowType ต้องเป็น candidate หรือ district');
      if (row.rowType !== 'district') {
        const name = decodeText(row.name), party = decodeText(row.party);
        if (!safeName(name) || !safeName(party)) throw Error(`${d.id}: ชื่อผู้สมัครหรือพรรคไม่ถูกต้อง`);
        d.candidates.push({ number: integer(row.number,'หมายเลขผู้สมัคร',false), name, party, votes: integer(row.votes,'คะแนนผู้สมัคร',false) });
        if (Object.hasOwn(row,'listVotes')) {
          const vote = integer(row.listVotes,'คะแนนบัญชีรายชื่อ');
          const key = `${d.id}:list:${party}`;
          if (repeated.has(key) && repeated.get(key) !== vote) throw Error(`${d.id}: คะแนนบัญชีรายชื่อพรรคเดียวกันขัดแย้งกัน`);
          if (!plainObject(d.partyList)) throw Error('partyListJSON ต้องเป็นออบเจ็กต์');
          const fullPartyList = repeated.has(`${d.id}:partyList`), hasParty = Object.hasOwn(d.partyList,party);
          if (fullPartyList && (hasParty ? d.partyList[party] !== vote : vote !== null)) throw Error(`${d.id}: listVotes ไม่ตรง partyListJSON`);
          repeated.set(key,vote);
          if (!fullPartyList || hasParty || vote !== null) d.partyList[party] = vote;
        }
      } else if ([row.number,row.name,row.party,row.votes].some(Boolean)) throw Error('แถว district ต้องเว้นคอลัมน์ผู้สมัครว่าง');
      for (const key of ['eligible','invalid','noVote','turnout','ocrTotal']) if (Object.hasOwn(row,key)) assignConsistent(d,key,integer(row[key],key));
    }
    const rows = [...groups.values()]; validateDataset(rows,new Set(byId.keys())); return rows;
  }

  function importData(text, filename, baseline, officialBaseline = baseline) {
    if (typeof text !== 'string' || text.length > 25_000_000) throw Error('ไฟล์นำเข้าต้องมีขนาดไม่เกิน 25 MB');
    validateDataset(baseline);
    validateDataset(officialBaseline);
    let rows, kind = 'working';
    if (/\.csv$/i.test(filename)) rows = csvToDistricts(text, baseline);
    else {
      let input;
      try { input = JSON.parse(text); } catch { throw Error('JSON ไม่ถูกต้อง: ตรวจรูปแบบไฟล์ก่อนนำเข้า'); }
      if (plainObject(input) && ([SNAPSHOT_SCHEMA,'election69-working-1'].includes(input.schemaVersion)
        || !input.schemaVersion && input.version === VERSION && typeof input.sourceDate === 'string')) {
        return restoreSnapshot(input,officialBaseline,undefined,baseline);
      }
      if (plainObject(input) && Object.hasOwn(input,'province_name') && Object.hasOwn(input,'constituency_number')) {
        if (!Number.isSafeInteger(input.constituency_number) || input.constituency_number < 1) throw Error('OCR เลขเขตต้องเป็นจำนวนเต็มบวก');
        const province = input.province_name === 'Sakon Nakhon' ? 'สกลนคร' : input.province_name;
        const current = baseline.find(d => d.province === province && d.number === input.constituency_number);
        if (!current) throw Error('ไม่พบจังหวัดและเขตของไฟล์ OCR ในทะเบียน');
        if (input.province_code !== undefined && String(input.province_code) !== current.provinceCode) throw Error('OCR รหัสจังหวัดไม่ตรงกับชื่อจังหวัด');
        const d = clone(current), section = input.summary_by_section ?? {};
        if (!plainObject(section)) throw Error('OCR summary_by_section ต้องเป็นออบเจ็กต์');
        const results = input.type === 'constituency' ? (input.matched_candidates || input.results) : (input.matched_parties || input.results);
        if (!Array.isArray(results) || !results.length || results.length > 200) throw Error('OCR ต้องมีผลคะแนน 1–200 รายการ');
        for (const result of results) if (!plainObject(result) || !validCount(result.votes) || !safeName(result.party)) throw Error('OCR มีคะแนนหรือชื่อพรรคไม่ถูกต้อง');
        const total = results.reduce((sum,r) => sum+r.votes,0);
        if (!Number.isSafeInteger(total)) throw Error('OCR ผลรวมคะแนนเกินขอบเขตที่ปลอดภัย');
        if (input.type === 'party_list') {
          if (new Set(results.map(r=>r.party)).size !== results.length) throw Error('OCR มีชื่อพรรคซ้ำ');
          d.ocrPartyList = Object.fromEntries(results.map(r => [r.party,r.votes]));
          d.ocrPartyListAvailable = true;
        } else if (input.type === 'constituency') {
          validateDistrict({...d,candidates:results});
          d.ocrCandidates = clone(results); d.ocrTotal = total; d.ocrAvailable = true;
          d.ocrValid = section['4.1'] ?? null; d.ocrInvalid = section['4.2'] ?? null; d.ocrNoVote = section['4.3'] ?? null; d.ocrTurnout = section['1.2'] ?? null;
        } else throw Error('OCR ต้องระบุ type เป็น constituency หรือ party_list');
        d.ocrImportedAt = new Date().toISOString(); d.ocrImportSource = String(filename || 'ไฟล์นำเข้า');
        const ballotPrefix = input.type === 'party_list' ? 'ocrPartyList' : 'ocrConstituency';
        d[ballotPrefix + 'ImportedAt'] = d.ocrImportedAt; d[ballotPrefix + 'ImportSource'] = d.ocrImportSource;
        rows = [d]; kind = 'ocr';
      } else rows = Array.isArray(input) ? input : input?.districts;
    }
    validateDataset(rows, new Set(baseline.map(d => d.id)));
    const incoming = new Map(rows.map(d => [d.id,d])), official = new Map(officialBaseline.map(d=>[d.id,d]));
    const workingFields = ['eligible','turnout','invalid','noVote','candidates','partyList','ocrTotal'];
    const ocrFields = OCR_FIELDS;
    const merged = baseline.map(d => {
      const source = official.get(d.id);
      if (!source) throw Error(`ไม่พบเขต ${d.id} ในชุดต้นทาง กกต.`);
      const next = clone(d), imported = incoming.get(d.id);
      // Authoritative source fields can never be replaced by a working-file import.
      for (const key of ['officialTotal','officialValid','officialTurnout','officialSource','reportedValidVotes','sourceFiles','updatedAt','dataBasis','officialNotes']) {
        if (Object.hasOwn(source,key)) next[key] = clone(source[key]);
      }
      if (imported) {
        for (const key of kind === 'ocr' ? ocrFields : workingFields) if (Object.hasOwn(imported,key)) next[key] = clone(imported[key]);
        next.locallyEdited = kind === 'working' || !!d.locallyEdited;
        if (kind === 'working') next.scenarioUpdatedAt = new Date().toISOString();
      }
      return next;
    });
    validateDataset(merged,new Set(official.keys()));
    return { rows: merged, count: rows.length, kind,
      warnings: kind === 'working' ? ['นำเข้าเป็นสถานการณ์ในเครื่อง; ค่าต้นทาง กกต. และข้อมูลอ้างอิงคงเดิม'] : ['OCR นำเข้าเป็นหลักฐานอีกฉบับ; ค่าคะแนน กกต. คงเดิม'] };
  }

  function csvExport(rows) {
    validateDataset(rows);
    const columns = ['id','number','name','party','votes','listVotes','eligible','turnout','invalid','noVote','ocrTotal','rowType','partyListJSON','_format'];
    const safeText = value => /^[\s]*[=+\-@]/.test(value) || /^['\t\r\n]/.test(value) ? "'"+value : value;
    const escape = value => '"' + String(value ?? '').replaceAll('"', '""') + '"';
    const lines = [columns.join(',')];
    for (const d of rows) {
      const candidates = d.candidates.length ? d.candidates : [null];
      candidates.forEach((c,index) => lines.push([d.id,c?.number,c?safeText(c.name):'',c?safeText(c.party):'',c?.votes,
        c?d.partyList[c.party]:null,d.eligible,d.turnout,d.invalid,d.noVote,d.ocrTotal,c?'candidate':'district',
        index===0?JSON.stringify(d.partyList):'','election69-csv-v2'].map(escape).join(',')));
    }
    return '\uFEFF' + lines.join('\r\n');
  }

  const normalizeIdentity = value => String(value || '').normalize('NFC').replace(/[\s.·]/g, '').replace(/^(นางสาว|นาง|นาย)/, '');
  const candidateIdentity = candidate => normalizeIdentity(candidate.name) + '|' + normalizeIdentity(candidate.party);
  function matchOCRCandidates(district) {
    const identity = candidateIdentity;
    const ocr = district.ocrCandidates || [], official = district.candidates || [], used = new Set();
    const matches = official.map(candidate => {
      const key = identity(candidate), possible = ocr.map((record, index) => ({ record, index })).filter(item => identity(item.record) === key);
      const uniqueOfficial = official.filter(item => identity(item) === key).length === 1;
      if (uniqueOfficial && possible.length === 1 && !used.has(possible[0].index)) {
        const found = possible[0]; used.add(found.index);
        return { candidate, ocr: found.record, ocrIndex: found.index, method: 'unique-name-party', numberDisagrees: found.record.number !== candidate.number };
      }
      return { candidate, ocr: null, ocrIndex: null, method: 'unresolved', numberDisagrees: false };
    });
    return { matches, unmatchedOCR: ocr.filter((_, index) => !used.has(index)), numberIssues: matches.filter(item => item.numberDisagrees).length };
  }

  function dataQuality(row, officialRow = null) {
    const reference = officialRow || (!row.locallyEdited ? row : null);
    const candidateOCRAvailable = row.ocrAvailable !== false && Array.isArray(row.ocrCandidates) && row.ocrCandidates.length > 0;
    const partyListOCRAvailable = row.ocrPartyListAvailable !== false && plainObject(row.ocrPartyList) && Object.keys(row.ocrPartyList).length > 0;
    const official = reference?.candidates || [], ocr = candidateOCRAvailable ? row.ocrCandidates : [];
    const matched = matchOCRCandidates({candidates:official,ocrCandidates:ocr});
    const frequency = (items,key) => items.reduce((map,item)=>{const k=key(item);map.set(k,(map.get(k)||0)+1);return map;},new Map());
    const officialIdentities=frequency(official,candidateIdentity),ocrIdentities=frequency(ocr,candidateIdentity),ocrNumbers=frequency(ocr,item=>item.number);
    const ambiguous = item => (officialIdentities.get(candidateIdentity(item)) || 0)>1 || (ocrIdentities.get(candidateIdentity(item)) || 0)>1;
    const labels = {'exact-match':'ชื่อ พรรค และคะแนนตรงกัน','number-difference':'จับคู่ชื่อและพรรคได้ แต่หมายเลขต่างกัน','score-mismatch':'จับคู่ชื่อและพรรคได้ แต่คะแนนต่างกัน',
      'ambiguous-match':'พบชื่อและพรรคซ้ำ ยังยืนยันคู่ไม่ได้','unmatched-official':'ยังจับคู่รายการ กกต. ไม่ได้','unmatched-ocr':'ยังจับคู่รายการ OCR ไม่ได้','missing-ocr':'ไม่มีข้อมูล OCR','unverified-score':'คะแนนไม่ครบ ยังเปรียบเทียบไม่ได้'};
    const records = matched.matches.map(item=>{
      const ectVotes=count(item.candidate.votes),ocrVotes=count(item.ocr?.votes);
      const difference=item.ocr&&ectVotes!==null&&ocrVotes!==null?ectVotes-ocrVotes:null;
      const status=!candidateOCRAvailable?'missing-ocr':!item.ocr?ambiguous(item.candidate)?'ambiguous-match':'unmatched-official'
        :difference===null?'unverified-score':difference!==0?'score-mismatch':item.numberDisagrees?'number-difference':'exact-match';
      return {...item,ectVotes,ocrVotes,difference,absoluteDifference:difference===null?null:Math.abs(difference),status,statusLabel:labels[status],matchMethod:item.method};
    });
    const unmatchedOCRRecords=matched.unmatchedOCR.map(ocr=>({ocr,status:ambiguous(ocr)?'ambiguous-match':'unmatched-ocr',statusLabel:labels[ambiguous(ocr)?'ambiguous-match':'unmatched-ocr']}));
    // Upstream observations excluded from matched_candidates remain a separate
    // evidence population. They never enter canonical totals or match coverage.
    const sourceUnmatchedOCRRecords=(reference?.ocrUnmatchedSourceCandidates || row.ocrUnmatchedSourceCandidates || []).map(ocr=>({ocr:clone(ocr),status:'unmatched-source',statusLabel:'รายการที่ต้นทาง OCR แยกไว้ ยังไม่ยืนยันคู่กับ กกต.'}));
    const sourceUnmatchedOCRCount=sourceUnmatchedOCRRecords.length;
    const matchedCount=records.filter(item=>item.ocr).length;
    const unmatchedOfficialCount=candidateOCRAvailable?records.filter(item=>!item.ocr).length:0,unmatchedOCRCount=unmatchedOCRRecords.length;
    const ambiguousCount=records.filter(item=>item.status==='ambiguous-match').length;
    const ambiguousOCRCount=unmatchedOCRRecords.filter(item=>item.status==='ambiguous-match').length;
    const numberDifferenceCount=records.filter(item=>item.numberDisagrees).length;
    const scoreMismatchCount=records.filter(item=>item.difference!==null&&item.difference!==0).length;
    const unverifiedScoreCount=records.filter(item=>item.status==='unverified-score').length;
    const scoreDifferences=records.filter(item=>item.difference!==null).map(item=>item.absoluteDifference);
    const matchedScoreAbsoluteDifference=scoreDifferences.length?scoreDifferences.reduce((sum,n)=>sum+n,0):null;
    const candidateNumberIssueCount=ocr.filter(item=>!Number.isSafeInteger(item.number)||item.number<1||ocrNumbers.get(item.number)>1).length;
    const officialTotal=count(reference?.officialTotal ?? row.officialTotal),ocrTotal=count(row.ocrTotal);
    const aggregateDifference=officialTotal!==null&&ocrTotal!==null?officialTotal-ocrTotal:null;
    const absoluteAggregateDifference=aggregateDifference===null?null:Math.abs(aggregateDifference);
    const availableNumber=value=>count(value);
    const reconcile=(valid,invalid,noVote,turnout)=>[valid,invalid,noVote,turnout].every(v=>v!==null)?valid+invalid+noVote-turnout:null;
    const reconciliationDifference=reference?reconcile(availableNumber(reference.officialValid ?? reference.reportedValidVotes),availableNumber(reference.invalid),availableNumber(reference.noVote),availableNumber(reference.officialTurnout ?? reference.turnout)):null;
    const partyListReconciliationDifference=reference?reconcile(availableNumber(reference.partyListValidVotes),availableNumber(reference.partyListInvalid),availableNumber(reference.partyListNoVote),availableNumber(reference.partyListTurnout)):null;
    const listOfficial=reference?.partyList || {},listOCR=partyListOCRAvailable?row.ocrPartyList:{};
    const listNames=[...new Set([...Object.keys(listOfficial),...Object.keys(listOCR)])];
    const partyListRecords=listNames.map(party=>{
      const hasOfficial=Object.hasOwn(listOfficial,party),hasOCR=Object.hasOwn(listOCR,party),ectVotes=hasOfficial?count(listOfficial[party]):null,ocrVotes=hasOCR?count(listOCR[party]):null;
      const difference=ectVotes!==null&&ocrVotes!==null?ectVotes-ocrVotes:null;
      const status=!partyListOCRAvailable?'missing-ocr':!hasOfficial?'unmatched-ocr':!hasOCR?'unmatched-official':difference===null?'unverified-score':difference===0?'exact-match':'score-mismatch';
      return {party,ectVotes,ocrVotes,difference,absoluteDifference:difference===null?null:Math.abs(difference),status,statusLabel:labels[status]};
    });
    const partyListScoreMismatchCount=partyListRecords.filter(item=>item.status==='score-mismatch').length;
    const partyListUnmatchedCount=partyListOCRAvailable?partyListRecords.filter(item=>['unmatched-ocr','unmatched-official'].includes(item.status)).length:0;
    const partyListUnverifiedScoreCount=partyListRecords.filter(item=>item.status==='unverified-score').length;
    const ocrListTotal=partyListOCRAvailable?completeSum(Object.values(listOCR)):null,officialListTotal=count(reference?.partyListValidVotes);
    const partyListAggregateDifference=officialListTotal!==null&&ocrListTotal!==null?officialListTotal-ocrListTotal:null;
    const reconciliationCount=[reconciliationDifference,partyListReconciliationDifference].filter(value=>value!==null&&value!==0).length;
    const needsReview=!reference||!candidateOCRAvailable||!partyListOCRAvailable||aggregateDifference===null||absoluteAggregateDifference>0||scoreMismatchCount>0
      ||unmatchedOfficialCount>0||unmatchedOCRCount>0||ambiguousCount>0||numberDifferenceCount>0||candidateNumberIssueCount>0||unverifiedScoreCount>0
      ||partyListScoreMismatchCount>0||partyListUnmatchedCount>0||partyListUnverifiedScoreCount>0||partyListAggregateDifference!==null&&partyListAggregateDifference!==0||reconciliationCount>0||sourceUnmatchedOCRCount>0;
    const status=!reference?'unverified-reference':!candidateOCRAvailable||!partyListOCRAvailable?'missing':needsReview?'review':'matched';
    const statusLabel={'unverified-reference':'ไม่มีชุดต้นทาง กกต. สำหรับยืนยันรายการ','missing':'หลักฐาน OCR ยังไม่ครบ','review':'มีรายการที่ควรตรวจสอบเพิ่มเติม','matched':'รายการที่เปรียบเทียบได้ตรงกัน'}[status];
    return {status,statusLabel,needsReview,hasOCR:candidateOCRAvailable,candidateOCRAvailable,partyListOCRAvailable,officialReferenceAvailable:!!reference,
      coverage:candidateOCRAvailable&&reference?percent(matchedCount,official.length):null,officialCandidateCount:official.length,ocrCandidateCount:ocr.length,
      matchedCount,unmatchedOfficialCount,unmatchedOCRCount,ambiguousCount,ambiguousOCRCount,numberDifferenceCount,scoreMismatchCount,unverifiedScoreCount,candidateNumberIssueCount,
      exactMatchCount:records.filter(item=>item.status==='exact-match').length,matchedScoreAbsoluteDifference,matchedScoreDifference:matchedScoreAbsoluteDifference,
      aggregateDifference,absoluteAggregateDifference,officialTotal,ocrTotal,reconciliationDifference,partyListReconciliationDifference,reconciliationCount,
      partyListScoreMismatchCount,partyListUnmatchedCount,partyListUnverifiedScoreCount,partyListAggregateDifference,records,unmatchedOCRRecords,partyListRecords,sourceUnmatchedOCRCount,sourceUnmatchedOCRRecords,
      sourceFiles:clone(row.sourceFiles || reference?.sourceFiles || []),officialSource:reference?.officialSource || row.officialSource || null,
      snapshotDate:reference?.updatedAt || row.updatedAt || null,matchRule:'จับคู่ชื่อและพรรคหลังปรับช่องว่างและคำนำหน้า เฉพาะคู่ที่ไม่ซ้ำ ไม่ยืนยันด้วยหมายเลขอย่างเดียว',
      sourceVersionNote:'ผล กกต. และ OCR อาจเป็นคนละช่วงปรับปรุงข้อมูล วันที่ต่างกันยังไม่พิสูจน์ว่าเป็นสาเหตุของความต่าง'};
  }

  const api = { VERSION, SNAPSHOT_SCHEMA, REGISTRY, isNumber, nullableNumber, ratio, percent, clone, deepFreeze, calculate, matchOCRCandidates, partyComparison, dataQuality, aggregateProvinceSupport,
    validateDistrict, validateDataset, validateEvidence, createSnapshot, restoreSnapshot,
    defaultState, urbanCompare, sortRows, filterRows, lens, parseCSV, csvToDistricts, importData, csvExport };
  root.ElectionModel = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
