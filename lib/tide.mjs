// =====================================================================
// 潮位データの組み立て
//
// 気象庁の毎時値(24点)を三次スプラインで10分刻み(144点)に補間し、
// 近似地点には damp/dz 補正を掛ける。ロジックは既存 tide-jma.js と同一で、
// 入力が HTML パース結果から年次テキストのパース結果に変わっただけ。
// =====================================================================

import { dayKeyOf, addDays, fmtHM } from './util.mjs';

// ---------------------------------------------------------------------
// 三次スプライン（自然境界）
// ---------------------------------------------------------------------
function naturalCubicSpline(xs, ys) {
  const n = xs.length;
  if (n < 2) return () => ys[0];
  const h = xs.slice(1).map((x, i) => x - xs[i]);
  const alpha = new Array(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    alpha[i] = (3 / h[i]) * (ys[i + 1] - ys[i]) - (3 / h[i - 1]) * (ys[i] - ys[i - 1]);
  }
  // トーマス法
  const l = new Array(n).fill(1), mu = new Array(n).fill(0), z = new Array(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    l[i] = 2 * (xs[i + 1] - xs[i - 1]) - h[i - 1] * mu[i - 1];
    mu[i] = h[i] / l[i];
    z[i] = (alpha[i] - h[i - 1] * z[i - 1]) / l[i];
  }
  const c = new Array(n).fill(0), b = new Array(n - 1).fill(0), d = new Array(n - 1).fill(0);
  for (let j = n - 2; j >= 0; j--) {
    c[j] = z[j] - mu[j] * c[j + 1];
    b[j] = (ys[j + 1] - ys[j]) / h[j] - h[j] * (c[j + 1] + 2 * c[j]) / 3;
    d[j] = (c[j + 1] - c[j]) / (3 * h[j]);
  }
  return function (x) {
    let lo = 0, hi = n - 2;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (xs[m] <= x) lo = m; else hi = m - 1; }
    const i = Math.max(0, Math.min(lo, n - 2));
    const dx = x - xs[i];
    return ys[i] + b[i] * dx + c[i] * dx * dx + d[i] * dx * dx * dx;
  };
}

function hourlyTo10min(hourly25) {
  const spline = naturalCubicSpline(hourly25.map((_, i) => i), hourly25);
  const out = [];
  for (let i = 0; i < 144; i++) out.push(Math.round(spline(i / 6)));
  return out;
}

// 欠測(null)を前後の実測値から線形補間で埋める
function fillNulls(arr) {
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] == null) {
      let p = i - 1; while (p >= 0 && arr[p] == null) p--;
      let n = i + 1; while (n < arr.length && arr[n] == null) n++;
      arr[i] = (p >= 0 && n < arr.length)
        ? Math.round(arr[p] + (arr[n] - arr[p]) * (i - p) / (n - p))
        : (p >= 0 ? arr[p] : (n < arr.length ? arr[n] : 200));
    }
  }
}

// 公式観測点がない地点向けの近隣補正。
// その日の平均潮位を基準に damp(振幅倍率)と dz(レベル補正)を適用する。
// dphase(位相差)は実データでの検証ができていないため適用しない。
function applyAnchor(hourly, extremes, st) {
  const valid = hourly.filter(v => v != null);
  const mean = valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : 200;
  const xform = v => Math.round(mean + st.dz + st.damp * (v - mean));
  return {
    hourly: hourly.map(xform),
    extremes: extremes.map(e => ({
      type: e.type,
      time: e.time,
      level: Math.round(mean + st.dz + st.damp * (e.level - mean)),
    })),
  };
}

// ---------------------------------------------------------------------
// 1日分の潮位
// ---------------------------------------------------------------------

// byDay: jma.mjs が返す { 'YYYY-MM-DD': {hourly, extremes} }
// 戻り値の levels は 10分刻み144点、extremes は満干潮の配列。
export function tideDay(st, byDay, dayMs) {
  const cur = byDay[dayKeyOf(dayMs)];
  if (!cur) return null;

  const hrs = cur.hourly.slice();
  // 25点目(翌日0時)。無ければ当日最終値で延長する。
  const next = byDay[dayKeyOf(addDays(dayMs, 1))];
  hrs.push(next && next.hourly[0] != null ? next.hourly[0] : hrs[hrs.length - 1]);
  fillNulls(hrs);

  let hourly = hrs, extremes = cur.extremes;
  if (st.jmaAnchor && (st.damp !== 1 || st.dz !== 0)) {
    const r = applyAnchor(hrs, cur.extremes, st);
    hourly = r.hourly;
    extremes = r.extremes;
  }

  const levels = hourlyTo10min(hourly);
  const highs = extremes.filter(e => e.type === '満潮');
  const lows = extremes.filter(e => e.type === '干潮');

  // max/min は 10分毎の系列そのものの最大・最小。
  // 満潮値と一致しない日がある点に注意すること。前日の満潮から下げている
  // 途中で日付が変わると、0時の潮位がその日の満潮位より高くなる
  // (例: 広島 2026-08-02 は満潮 338cm に対し 0時が 366cm)。
  // グラフの縦軸と10分毎グリッドはこの系列を描くので、
  // 「最高潮位」として満潮値を出すと画面内で数字が食い違う。
  //
  // 一方 干満差 は満潮位−干潮位という定義が定着しているので、
  // 極値がある日は極値から算出し、無い日だけ系列の振幅で代用する。
  const max = Math.max(...levels), min = Math.min(...levels);
  const range = (highs.length && lows.length)
    ? Math.round(Math.max(...highs.map(e => e.level)) - Math.min(...lows.map(e => e.level)))
    : max - min;

  return {
    levels, extremes, highs, lows, max, min, range,
    source: st.jmaAnchor ? 'jma-anchor' : 'jma',
  };
}

// 週間一覧・月カレンダー・県別サマリ用の軽量版。
// 満干潮と干満差しか使わない箇所で 144点のスプライン補間を回すのは無駄なので、
// 極値だけを近似地点補正した結果を返す。11,000ページ分では効いてくる。
export function tideDayLight(st, byDay, dayMs) {
  const cur = byDay[dayKeyOf(dayMs)];
  if (!cur) return null;

  let extremes = cur.extremes;
  if (st.jmaAnchor && (st.damp !== 1 || st.dz !== 0)) {
    extremes = applyAnchor(cur.hourly, cur.extremes, st).extremes;
  }
  const highs = extremes.filter(e => e.type === '満潮');
  const lows = extremes.filter(e => e.type === '干潮');
  const range = (highs.length && lows.length)
    ? Math.round(Math.max(...highs.map(e => e.level)) - Math.min(...lows.map(e => e.level)))
    : 0;
  return { extremes, highs, lows, range };
}

// ---------------------------------------------------------------------
// 潮位変化速度（この実装の独自指標）
//
// 釣りで効くのは「満潮の時刻」そのものより「潮がよく動く時間帯」なので、
// 10分刻みの潮位を微分して cm/h に直し、変化の大きい帯を抜き出す。
// 10分毎データを持っているからこそ出せる値で、他の潮汐サイトは
// 満干潮4点しか持たないため原理的に同じものを出せない。
// ---------------------------------------------------------------------

// 各10分点における変化速度(cm/h)。中央差分。
export function flowRates(levels) {
  const n = levels.length;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = levels[Math.max(0, i - 1)];
    const b = levels[Math.min(n - 1, i + 1)];
    const span = (Math.min(n - 1, i + 1) - Math.max(0, i - 1)) / 6;   // 時間
    out[i] = span > 0 ? (b - a) / span : 0;
  }
  return out;
}

// 変化速度が閾値を超える連続区間を「よく動く時間帯」として返す。
// 閾値はその日の最大速度の 60% とし、干満差の小さい日本海側でも
// その地点なりの「動く時間」が出るようにしている。
export function movingWindows(levels, minMinutes = 40) {
  const rates = flowRates(levels);
  const peak = Math.max(...rates.map(Math.abs));
  if (peak < 1) return [];
  const th = peak * 0.6;

  const out = [];
  let start = -1, dir = 0;
  for (let i = 0; i <= rates.length; i++) {
    const r = i < rates.length ? rates[i] : 0;
    const d = Math.abs(r) >= th ? Math.sign(r) : 0;
    if (d !== dir) {
      if (dir !== 0 && start >= 0 && (i - start) * 10 >= minMinutes) {
        const seg = rates.slice(start, i);
        out.push({
          from: start / 6,
          to: i / 6,
          fromStr: fmtHM(start / 6),
          toStr: fmtHM(i / 6 >= 24 ? 23.99 : i / 6),
          dir: dir > 0 ? '上げ' : '下げ',
          peak: Math.round(Math.max(...seg.map(Math.abs))),
        });
      }
      start = d !== 0 ? i : -1;
      dir = d;
    }
  }
  return out;
}

// いま上げ潮か下げ潮か（クライアント側の現在時刻表示にも使う）
export function flowLabel(rate) {
  if (rate > 3) return '上げ潮';
  if (rate < -3) return '下げ潮';
  return '変化小';
}
