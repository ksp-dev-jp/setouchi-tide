import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseYear } from '../lib/jma.mjs';
import { TIDE_STATIONS } from '../lib/stations.mjs';
import { dayMsOf, dayKeyOf, addDays, todayJSTMs } from '../lib/util.mjs';
import { celestialData } from '../lib/astro.mjs';
import { HOLIDAYS, HOLIDAY_YEARS } from '../lib/holidays.mjs';
import { tideJSON, bigLowDays, availableDays, calendarJSON, depthToolPage, shiohigariCalendarPage } from '../lib/tools.mjs';

const off = code => TIDE_STATIONS.find(s => s.jma === code && !s.jmaAnchor);
// 潮位表のキャッシュ(.cache/jma)がある環境でだけ走らせる
function byDayOf(code) {
  const out = {};
  for (const y of [2026, 2027]) {
    const p = `.cache/jma/${y}/${code}.txt`;
    if (!fs.existsSync(p)) return null;
    Object.assign(out, parseYear(fs.readFileSync(p, 'latin1'), y));
  }
  return out;
}
const FROM = dayMsOf('2026-10-25');

test('祝日一覧が今日から1年先まである', () => {
  const end = Number(dayKeyOf(addDays(todayJSTMs(), 365)).slice(0, 4));
  assert.ok(HOLIDAY_YEARS.includes(end), `lib/holidays.mjs に ${end}年 を足してください`);
  // 振替休日は月〜水曜、それ以外の日曜の祝日には翌日の振替休日がある
  for (const [k, name] of Object.entries(HOLIDAYS)) {
    const w = new Date(dayMsOf(k)).getUTCDay();
    if (name === '振替休日') assert.ok(w >= 1 && w <= 3, k);
    if (w === 0) assert.ok(Object.keys(HOLIDAYS).some(x => x > k && HOLIDAYS[x] === '振替休日' && dayMsOf(x) - dayMsOf(k) <= 3 * 86400000), k);
  }
});

test('水深計算の毎時潮位は日ごとの25点を切り出せる形になっている', { skip: !byDayOf('TK') }, () => {
  const byDay = byDayOf('TK');
  const n = availableDays(byDay, FROM, 365);
  assert.ok(n >= 300);
  const j = tideJSON(off('TK'), byDay, FROM, n);
  assert.equal(j.h.length, n * 24 + 1);
  assert.deepEqual(j.h.slice(24 * 3, 24 * 3 + 24), byDay[dayKeyOf(addDays(FROM, 3))].hourly);
  assert.equal(j.mm.length, 12);
  assert.ok(j.p95 > 0);
});

test('実測が無い地点・ずれが年で大きく動く地点では補正を出さない', { skip: !byDayOf('Q9') || !byDayOf('CS') }, () => {
  assert.equal(tideJSON(off('Q9'), byDayOf('Q9'), FROM, 30).mm, null);
  assert.equal(tideJSON(off('CS'), byDayOf('CS'), FROM, 30).mm, null);
});

test('大きく引く日は明るい時間の干潮で、明るい干潮のある日の約1割', { skip: !byDayOf('Q8') }, () => {
  const st = off('Q8');
  const big = bigLowDays(st, byDayOf('Q8'), FROM, 365);
  assert.ok(big.days.length >= 20 && big.days.length <= 45, String(big.days.length));
  for (const d of big.days) {
    const cel = celestialData(st, dayMsOf(d.ymd));
    assert.ok(d.t >= cel.sunrise + 1 && d.t <= cel.sunset - 1, d.ymd);
    assert.ok(d.lv <= big.cut);
  }
});

test('ツールの2ページに入力欄・出典・注意があり、値の欠けが無い', { skip: !byDayOf('TK') || !byDayOf('Q8') }, () => {
  const tk = off('TK'), q8 = off('Q8');
  const depth = depthToolPage({ stations: [tk, q8], from: '2026-10-25', nDays: 365,
    example: { st: tk, byDay: byDayOf('TK'), dayMs: FROM } });
  for (const s of ['id="depth-tool"', 'data-src-base=', '海図の水深', '最低水面', '航行や安全の判断には使わないでください', '気象庁：潮汐観測資料']) {
    assert.ok(depth.includes(s), s);
  }
  assert.match(depth, /海図で水深2\.0mの場所は、干潮時に約[\d.]+m/);
  const rows = [tk, q8].map(st => ({ st, big: bigLowDays(st, byDayOf(st.jma), FROM, 365) }));
  const cal = shiohigariCalendarPage({ rows, from: '2026-10-25', to: '2027-10-24' });
  for (const s of ['id="shc-tool"', '地方ごとの大きく引く日', '月ごとの日数', '2026年10月25日〜2027年10月24日']) {
    assert.ok(cal.includes(s), s);
  }
  for (const html of [depth, cal]) assert.ok(!html.includes('undefined') && !html.includes('NaN'));
  const j = calendarJSON(rows, '2026-10-25', '2027-10-24');
  assert.equal(j.st[1].n, '広島');
  assert.equal(j.st[1].mm, null);
  assert.ok(Object.keys(j.hol).every(k => k >= '2026-10-25' && k <= '2027-10-24'));
});
