#!/usr/bin/env node
/**
 * 꿀퀴즈 인더바이블 — 배포 전 검증
 * 사용법: node verify.mjs
 *
 * 1) days/index.json 과 days/*.json 의 짝이 맞는지
 * 2) 각 날짜 파일의 구조가 온전한지
 * 3) 출제 규격 위반 경고
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';

const errors = [];
const warns  = [];

/* 판정례 11(해설 절 표기)은 2026-09-07 확정. 그 이전 날짜에는 적용하지 않는다. */
const RULE11_FROM = '2026-09-07';

if (!existsSync('days')) {
  console.error('✗ days/ 폴더가 없습니다. honeybible 폴더에서 실행하세요.');
  process.exit(1);
}
if (!existsSync('index.html')) {
  warns.push('index.html 이 이 폴더에 없습니다.');
}

/* ── 1. 목록 ─────────────────────────────────── */
let list;
try {
  list = JSON.parse(readFileSync('days/index.json', 'utf-8'));
} catch (e) {
  console.error('✗ days/index.json 을 읽을 수 없습니다: ' + e.message);
  console.error('  JSON 문법(쉼표, 따옴표)을 확인하세요.');
  process.exit(1);
}
const listed = (list.days || []).map(d => d.date);
if (listed.length === 0) errors.push('days/index.json 의 days 배열이 비어 있습니다.');

const files = readdirSync('days')
  .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
  .map(f => f.replace('.json', ''));

for (const k of listed)
  if (!files.includes(k)) errors.push(`index.json 에 ${k} 가 있는데 days/${k}.json 파일이 없습니다.`);
for (const k of files)
  if (!listed.includes(k)) warns.push(`days/${k}.json 파일이 있는데 index.json 목록에 없습니다. 화면에 뜨지 않습니다.`);

/* ── 2. 각 날짜 ──────────────────────────────── */
const report = [];

for (const k of files) {
  const at = (m) => `[${k}] ${m}`;
  let day;
  try {
    day = JSON.parse(readFileSync(`days/${k}.json`, 'utf-8'));
  } catch (e) {
    errors.push(at('JSON 문법 오류 — ' + e.message));
    continue;
  }

  const [y, m, d] = k.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d)
    errors.push(at('존재하지 않는 날짜입니다.'));

  if (day.date !== k) errors.push(at(`파일 안의 date("${day.date}")가 파일명과 다릅니다.`));
  if (!day.passage)   errors.push(at('passage 가 없습니다.'));

  const inList = (list.days || []).find(x => x.date === k);
  if (inList && inList.passage !== day.passage)
    warns.push(at('index.json 의 passage 와 날짜 파일의 passage 가 다릅니다.'));

  const M = day.memory;
  if (!M) errors.push(at('memory 가 없습니다.'));
  else {
    if (!M.text)    errors.push(at('memory.text 가 없습니다.'));
    if (!M.cite)    errors.push(at('memory.cite 가 없습니다.'));
    if (!M.closing) warns.push(at('memory.closing 이 없습니다.'));
  }

  const Q = day.quiz;
  if (!Array.isArray(Q) || Q.length === 0) {
    errors.push(at('quiz 배열이 없거나 비어 있습니다.'));
    continue;
  }
  if (Q.length > 10) errors.push(at(`문항이 ${Q.length}개입니다. 최대 10개입니다.`));
  if (Q.length < 10) warns.push(at(`문항이 ${Q.length}개입니다. 기본은 10개입니다.`));

  Q.forEach((q, i) => {
    const w = (msg) => `[${k}] ${i + 1}번 — ${msg}`;
    for (const f of ['ref', 'q', 'hintRef', 'hintText', 'note'])
      if (!q[f] || !String(q[f]).trim()) errors.push(w(`${f} 가 비어 있습니다.`));

    if (!Array.isArray(q.opts)) { errors.push(w('opts 가 배열이 아닙니다.')); return; }
    if (q.opts.length < 2) errors.push(w('보기가 2개 미만입니다.'));
    if (q.opts.length > 4) warns.push(w(`보기가 ${q.opts.length}개입니다. 3개를 권장합니다.`));
    if (new Set(q.opts).size !== q.opts.length) errors.push(w('보기 중 중복이 있습니다.'));
    if (q.opts.some(o => !String(o).trim())) errors.push(w('빈 보기가 있습니다.'));

    if (!Number.isInteger(q.a)) errors.push(w('a 가 정수가 아닙니다.'));
    else if (q.a < 0 || q.a >= q.opts.length) errors.push(w(`a=${q.a} 가 보기 범위를 벗어났습니다.`));

    /* 출제 규격 경고 */
    if (q.note && q.note.length < 60)  warns.push(w('해설이 짧습니다. 4~6문장을 권장합니다.'));
    if (q.note && q.note.length > 560) warns.push(w('해설이 깁니다. 폰에서 길게 느껴집니다.'));
    if (q.note && /해야 합니다|하십시오|합시다/.test(q.note))
      warns.push(w('해설이 명령형으로 닫혔습니다. 서술 또는 소망형으로 바꾸세요.'));
    if (q.note && !/\([가-힣]+\s?\d+:\d+/.test(q.note) && k >= RULE11_FROM)
      warns.push(w('해설에 절 표기가 없습니다. 판정례 11 — (창 19:16) 형식으로 붙이세요.'));
    if (q.hintText && q.hintText.length < 10)
      warns.push(w('hintText 가 너무 짧습니다. 개역개정 전문이 맞는지 확인하세요.'));
  });

  report.push({ k, n: Q.length, p: day.passage });
}

/* ── 3. 보고 ─────────────────────────────────── */
report.sort((a, b) => b.k.localeCompare(a.k));
console.log('\n꿀퀴즈 인더바이블 — 검증 결과\n' + '─'.repeat(46));
console.log(`등록된 날짜 ${report.length}일`);
for (const r of report) console.log(`  ${r.k}  ${String(r.n).padStart(2)}문항  ${r.p}`);
console.log('─'.repeat(46));

if (warns.length) {
  console.log(`\n△ 경고 ${warns.length}건 (배포는 가능합니다)`);
  warns.forEach(w => console.log('  · ' + w));
}
if (errors.length) {
  console.log(`\n✗ 오류 ${errors.length}건 — 올리지 마세요`);
  errors.forEach(e => console.log('  · ' + e));
  console.log('');
  process.exit(1);
}

console.log('\n✓ 통과. 올려도 좋습니다.');
console.log('  git add -A && git commit -m "..." && git push\n');
