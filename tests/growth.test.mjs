import test from 'node:test';
import assert from 'node:assert/strict';
import { TIDE_STATIONS } from '../lib/stations.mjs';
import { paths, hasYearTable, yearTable } from '../lib/routes.mjs';
import { embedPage } from '../lib/embed.mjs';
import { SPOTS, seasonOf, spotDays } from '../lib/shiohigari-spots.mjs';

const official = TIDE_STATIONS.find(s => s.name === '呉' && !s.jmaAnchor);
const approx = TIDE_STATIONS.find(s => s.jmaAnchor);

test('年間潮見表は年が決まっているときの公式観測点だけ', () => {
  const save = yearTable.year;
  try {
    yearTable.year = null;
    assert.equal(hasYearTable(official), false);
    yearTable.year = 2027;
    assert.equal(hasYearTable(official), true);
    assert.equal(hasYearTable(approx), false);
    assert.ok(paths.year(official, 2027).endsWith('/2027/'));
  } finally {
    yearTable.year = save;
  }
});

test('埋め込みは noindex で、地点ページへ nofollow なしでリンクする', () => {
  const levels = Array.from({ length: 145 }, (_, i) => 100 + Math.sin(i / 20) * 80);
  const html = embedPage({
    st: official, shio: '大潮', dayMs: Date.UTC(2026, 10, 8),
    day: {
      levels,
      highs: [{ time: 9, level: 300 }],
      lows: [{ time: 3.5, level: 40 }, { time: 15, level: 90 }],
    },
  });
  assert.ok(html.includes('name="robots" content="noindex"'));
  assert.ok(html.includes('09:00') && html.includes('15:00') && html.includes('大潮'));
  assert.equal(html.includes('nofollow'), false);
  assert.equal(html.includes('<script'), false);
});

test('潮干狩りのシーズンは次の3〜6月', () => {
  assert.deepEqual(seasonOf('2026-11-08'), { year: 2027, from: '2027-03-01', to: '2027-06-30' });
  assert.equal(seasonOf('2027-05-01').year, 2027);
  assert.equal(seasonOf('2027-07-01').year, 2028);
  const big = { days: [{ ymd: '2027-02-28' }, { ymd: '2027-03-01' }, { ymd: '2027-06-30' }, { ymd: '2027-07-01' }] };
  assert.deepEqual(spotDays(big, seasonOf('2026-11-08')).map(d => d.ymd), ['2027-03-01', '2027-06-30']);
});

test('潮干狩り場はすべて公式観測点に対応し、出典がある', () => {
  for (const s of SPOTS) {
    assert.ok(TIDE_STATIONS.some(t => t.jma === s.jma && !t.jmaAnchor), s.name);
    assert.match(s.source.url, /^https:/, s.name);
    assert.ok(s.last && s.fee, s.name);
  }
});
