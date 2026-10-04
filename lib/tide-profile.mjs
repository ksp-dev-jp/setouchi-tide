// =====================================================================
// 地域・地点の潮汐プロファイル
//
// 都道府県・地方・地点の解説文を書くための実測値。気象庁の年次潮位表は
// ビルドで既に全部読み込んであるので、そこから集計するだけで済む。
//
// 解説を人手のテンプレ文だけで埋めるとどの県も同じ文章になるが、
// ここで出す数値は地域・地点ごとに必ず違う。文章はこの数値に従って組み立てる。
// =====================================================================

import { stationLabel } from './station-quality.mjs';

// 日中とみなす時間帯。潮干狩り・磯遊びで「明るいうちに潮が引くか」を見るため。
const DAY_FROM = 6, DAY_TO = 18;

// year を渡すとその年の日だけを使う。月間ページを1年先まで出す設定では
// 2年ぶんの潮位表が読み込まれているため、年をまたいで平均しないようにする。
function daysOf(byDay, year) {
  const keys = Object.keys(byDay).sort();
  return year ? keys.filter(k => k.startsWith(`${year}-`)) : keys;
}

// 1観測点の年間統計。干満差はその日の満潮の最高と干潮の最低の差。
// 極値が片方しか無い日(日周潮の日)は毎時値の最大-最小で代用する。
export function stationProfile(byDay, year) {
  const ranges = [];
  let diurnal = 0, days = 0;
  let maxRange = -Infinity, maxDate = null;
  let hi = null, lo = null;
  const dayLow = new Array(12).fill(null), nightLow = new Array(12).fill(null);

  for (const k of daysOf(byDay, year)) {
    const d = byDay[k];
    if (!d || !d.hourly) continue;
    const ex = d.extremes || [];
    const highs = ex.filter(e => e.type === '満潮');
    const lows = ex.filter(e => e.type === '干潮');
    const hourly = d.hourly.filter(v => v != null);
    if (!hourly.length) continue;
    const range = highs.length && lows.length
      ? Math.max(...highs.map(e => e.level)) - Math.min(...lows.map(e => e.level))
      : Math.max(...hourly) - Math.min(...hourly);
    ranges.push(range);
    if (range > maxRange) { maxRange = range; maxDate = k; }
    if (highs.length <= 1) diurnal++;
    days++;

    for (const e of highs) if (!hi || e.level > hi.level) hi = { level: e.level, date: k, time: e.time };
    const m = Number(k.slice(5, 7)) - 1;
    for (const e of lows) {
      if (!lo || e.level < lo.level) lo = { level: e.level, date: k, time: e.time };
      const box = e.time >= DAY_FROM && e.time < DAY_TO ? dayLow : nightLow;
      if (box[m] == null || e.level < box[m]) box[m] = e.level;
    }
  }
  if (!days) return null;

  // 大潮のころ(干満差が年間の上位1割の日)の干潮時刻。地点ごとにほぼ
  // 決まった時刻になる(潮汐の月潮間隔)。
  const cut = [...ranges].sort((a, b) => a - b)[Math.floor(ranges.length * 0.9)];
  const springLows = [];
  for (const k of daysOf(byDay, year)) {
    const d = byDay[k];
    if (!d || !d.hourly) continue;
    const ex = d.extremes || [];
    const highs = ex.filter(e => e.type === '満潮'), lows = ex.filter(e => e.type === '干潮');
    if (!highs.length || !lows.length) continue;
    if (Math.max(...highs.map(e => e.level)) - Math.min(...lows.map(e => e.level)) < cut) continue;
    for (const e of lows) springLows.push(e.time);
  }
  const springLow = springLowTimes(springLows);

  const sorted = [...ranges].sort((a, b) => a - b);
  const mean = a => Math.round(a.reduce((x, y) => x + y, 0) / a.length);
  const tenth = Math.max(1, Math.round(sorted.length * 0.1));
  const argmin = arr => arr.reduce((best, v, i) => (v != null && (best < 0 || v < arr[best]) ? i : best), -1);
  const dm = argmin(dayLow), nm = argmin(nightLow);
  return {
    days,
    avg: mean(ranges),
    max: sorted[sorted.length - 1],
    maxDate,
    // 大潮・小潮のころの目安。年間の上位1割・下位1割の平均を使う。
    spring: mean(sorted.slice(-tenth)),
    neap: mean(sorted.slice(0, tenth)),
    diurnalPct: Math.round(diurnal / days * 100),
    hi, lo,
    // 日中/夜間の干潮が年間で最も低くなる月(1〜12)とその潮位
    dayLowMonth: dm >= 0 ? dm + 1 : null, dayLowLevel: dm >= 0 ? dayLow[dm] : null,
    nightLowMonth: nm >= 0 ? nm + 1 : null, nightLowLevel: nm >= 0 ? nightLow[nm] : null,
    // 大潮のころの1日2回の干潮時刻 [時, 時]。定まらない地点は null。
    springLow,
  };
}

// 主太陰半日周潮(M2)の周期。干潮・満潮の間隔の平均。
const M2_HOURS = 12.42;

// 時刻(時)の円周上の平均とばらつき(標準偏差, 時間)。period 時間で一周する。
function circular(times, period) {
  let x = 0, y = 0;
  for (const t of times) {
    const a = t / period * 2 * Math.PI;
    x += Math.cos(a); y += Math.sin(a);
  }
  const r = Math.hypot(x, y) / times.length;
  const mean = ((Math.atan2(y, x) / (2 * Math.PI) * period) + period) % period;
  const sd = r > 0 ? Math.sqrt(-2 * Math.log(r)) * period / (2 * Math.PI) : Infinity;
  return { mean, sd };
}

// 大潮のころの干潮時刻を、1日2回の干潮それぞれについて求める。
// 外洋では2回の干潮が約12時間25分おきに来るが、瀬戸内海の備讃瀬戸の
// ように浅い海では間隔が崩れる(朝5時ごろと夕方18時ごろ、など)。
// そこでまず周期12.42時間で大まかな位相を出し、各干潮をその位相に近い組と
// 約12時間後の組に振り分けてから、組ごとに24時間周期で平均する。
// どちらかの組が2時間以上ばらつく地点(日周潮の強い日本海側など)は null。
export function springLowTimes(times) {
  if (times.length < 20) return null;
  const h0 = circular(times, M2_HOURS).mean;
  const dist = (t, c) => { const d = Math.abs(t - c) % 24; return Math.min(d, 24 - d); };
  const a = [], b = [];
  for (const t of times) {
    const near = [h0, h0 + M2_HOURS, h0 + 2 * M2_HOURS].map(c => dist(t, c % 24));
    (near[1] < Math.min(near[0], near[2]) ? b : a).push(t);
  }
  if (a.length < 8 || b.length < 8) return null;
  const ca = circular(a, 24), cb = circular(b, 24);
  if (ca.sd > 2 || cb.sd > 2) return null;
  return [ca.mean, cb.mean].sort((p, q) => p - q);
}

// 大潮のころの干潮時刻を「5時ごろ・17時半ごろ」のように書く。30分単位に丸める。
export function springLowLabel(pair) {
  if (!pair) return null;
  const mins = pair.map(x => (Math.round(x * 2) * 30) % 1440).sort((p, q) => p - q);
  return mins.map(m => `${Math.floor(m / 60)}時${m % 60 ? '半' : ''}ごろ`).join('・');
}

// stations: その地域の観測点。jma: build.mjs が読み込んだ潮位表。
export function areaProfile(stations, jma, year) {
  const rows = [];
  for (const st of stations) {
    const byDay = jma[st.jma];
    if (!byDay) continue;
    const p = stationProfile(byDay, year);
    if (p) rows.push({ st, ...p });
  }
  if (!rows.length) return null;
  const mean = f => Math.round(rows.reduce((a, r) => a + f(r), 0) / rows.length);
  const top = rows.reduce((a, b) => (a.max > b.max ? a : b));
  const bottom = rows.reduce((a, b) => (a.max < b.max ? a : b));
  // 日中の干潮が最も低くなる月の最頻値(地域の季節傾向)
  const monthCount = new Array(12).fill(0), nightCount = new Array(12).fill(0);
  for (const r of rows) {
    if (r.dayLowMonth) monthCount[r.dayLowMonth - 1]++;
    if (r.nightLowMonth) nightCount[r.nightLowMonth - 1]++;
  }
  const modeIdx = monthCount.indexOf(Math.max(...monthCount));
  return {
    n: rows.length,
    avg: mean(r => r.avg),
    spring: mean(r => r.spring),
    neap: mean(r => r.neap),
    diurnalPct: mean(r => r.diurnalPct),
    max: top.max, maxStation: stationLabel(top.st),
    min: bottom.max, minStation: stationLabel(bottom.st),
    dayLowMonthMode: monthCount[modeIdx] ? modeIdx + 1 : null,
    dayLowMonthCount: monthCount,
    nightLowMonthCount: nightCount,
  };
}

// 月ごとの地点数(areaProfile の dayLowMonthCount など)を、多い順に上位 k 件。
export function topMonths(counts, k = 3) {
  return counts.map((c, i) => ({ m: i + 1, c })).filter(x => x.c).sort((a, b) => b.c - a.c).slice(0, k);
}

// from〜to 月(1〜12。from > to なら年をまたぐ)に入る地点数の合計。
export function monthShare(counts, from, to) {
  let s = 0;
  for (let m = 1; m <= 12; m++) {
    const inside = from <= to ? m >= from && m <= to : m >= from || m <= to;
    if (inside) s += counts[m - 1];
  }
  return s;
}

// 2観測点の満潮時刻の差(分)。b が a より遅ければ正。同じ日の満潮どうしを
// 3時間以内で最も近いものと対にして、その中央値をとる。日周潮の日は
// 対にならない満潮が出るが、中央値なので外れ値に引きずられない。
export function highTideLag(a, b, year) {
  const diffs = [];
  for (const k of daysOf(a, year)) {
    const ha = (a[k]?.extremes || []).filter(e => e.type === '満潮');
    const hb = (b[k]?.extremes || []).filter(e => e.type === '満潮');
    for (const x of ha) {
      let best = null;
      for (const y of hb) if (best == null || Math.abs(y.time - x.time) < Math.abs(best)) best = y.time - x.time;
      if (best != null && Math.abs(best) <= 3) diffs.push(best * 60);
    }
  }
  if (diffs.length < 100) return null;
  diffs.sort((p, q) => p - q);
  return Math.round(diffs[diffs.length >> 1]);
}
