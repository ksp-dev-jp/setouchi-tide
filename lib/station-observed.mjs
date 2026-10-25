// =====================================================================
// 地点ページの「潮見表と実際の潮位のずれ」
//
// 気象庁「潮汐観測資料」の毎時潮位偏差を10年分集計した値
// (lib/observed-stats.mjs)から、その地点で潮見表がどれだけ当たるかを書く。
// 実測のある観測点(約70)だけに出し、無い地点では節ごと出さない。
// 他の地点の値を流用して「この地点のずれ」のように見せることはしない。
//
// 要約(2〜3文)は常に表示し、月別・年別の表と過去最大のずれは折りたたみに置く。
// 全国記事(lib/guide-atari.mjs)と同じ集計なので、順位の母集団も同じ
// (unstable の地点を除いた地点)にそろえる。
// =====================================================================

import { attr, esc } from './html.mjs';
import { paths } from './routes.mjs';
import { TIDE_STATIONS } from './stations.mjs';
import { OBSERVED_STATS } from './observed-stats.mjs';
import { TYPHOONS, ATARI_GUIDE } from './guide-atari.mjs';

const official = new Set(TIDE_STATIONS.filter(s => !s.jmaAnchor).map(s => s.jma));
const ranked = Object.entries(OBSERVED_STATS)
  .filter(([c, v]) => official.has(c) && !v.unstable)
  .sort((a, b) => b[1].share20 - a[1].share20)
  .map(([c]) => c);

const fix1 = v => (Math.round(v * 10) / 10).toFixed(1);
const signed = v => (v > 0 ? '+' : v < 0 ? '−' : '±') + fix1(Math.abs(v));
const fmtAt = at => {
  const [d, h] = at.split(' ');
  const [y, m, dd] = d.split('-').map(Number);
  return `${y}年${m}月${dd}日${parseInt(h, 10)}時`;
};
const cause = at => TYPHOONS[at.slice(0, 10)] || '';

export function observedStatsFor(st) {
  if (st.jmaAnchor) return null;
  return OBSERVED_STATS[st.jma] || null;
}

// 実測のあった年の範囲。観測が途中で止まった地点(銚子漁港・能登)で、
// 集計期間全体の実測があるように書かないため。
function span(v) {
  const ys = Object.entries(v.yearMean).filter(([, y]) => y != null).map(([y]) => y);
  return ys[0] === ys.at(-1) ? `${ys[0]}年` : `${ys[0]}〜${ys.at(-1)}年`;
}

function summary(name, o) {
  const rank = ranked.indexOf(o.st);
  const parts = [`${esc(name)}では${span(o.v)}の実測で、潮位が潮見表から<b>20cm以上ずれた時間は${fix1(o.v.share20)}%</b>でした。`];
  parts.push(rank >= 0
    ? `全国${ranked.length}地点のうち、ずれやすいほうから${rank + 1}番目です。95%の時間は潮見表の<b>±${o.v.p95}cm</b>以内に収まっています。`
    : `95%の時間は潮見表の<b>±${o.v.p95}cm</b>以内に収まっています。`);
  // 月平均のずれが3cm以上ある月のうち、いちばん大きい月を1つだけ書く。
  const mm = o.v.monthMean.map((v, i) => ({ v, m: i + 1 })).filter(x => x.v != null);
  const big = mm.sort((a, b) => Math.abs(b.v) - Math.abs(a.v))[0];
  if (big && Math.abs(big.v) >= 3) {
    parts.push(`${big.m}月は平均して潮見表より${fix1(Math.abs(big.v))}cm${big.v > 0 ? '高め' : '低め'}です。`);
  }
  return parts.join('');
}

function caveat(o) {
  if (!o.v.unstable) return '';
  if (o.v.coverage < 70) {
    return `<p class="note">この地点は期間中に観測のあった時間が${fix1(o.v.coverage)}%と少ないため、全国の比較には含めていません。</p>`;
  }
  return `<p class="note">この地点は年平均のずれが年によって${fix1(o.v.yearSpread)}cm動いています。地盤の上下など、潮位の予測とは別の要因の影響が大きいと考えられるため、全国の比較には含めていません。</p>`;
}

function details(o) {
  const v = o.v;
  const monthRows = v.monthMean.map((m, i) =>
    `<tr><th scope="row">${i + 1}月</th><td class="rg">${m == null ? '—' : signed(m)}</td><td class="rg">${v.monthHigh20[i] == null ? '—' : fix1(v.monthHigh20[i]) + '%'}</td><td class="rg">${v.monthLow20[i] == null ? '—' : fix1(v.monthLow20[i]) + '%'}</td></tr>`).join('');
  const years = Object.entries(v.yearMean).filter(([, y]) => y != null);
  const ext = (label, e, sign) => {
    const c = cause(e.at);
    return `<tr><th scope="row">${label}</th><td class="${sign > 0 ? 'hi' : 'lo'}">${sign > 0 ? '+' : '−'}${Math.abs(e.cm)}cm</td><td>${esc(fmtAt(e.at))}${c ? `（${esc(c)}）` : ''}</td></tr>`;
  };
  return `<div class="tw"><table class="prefsum">
  <thead><tr><th>月</th><th>平均のずれ</th><th>20cm以上高い</th><th>20cm以上低い</th></tr></thead>
  <tbody>${monthRows}</tbody>
</table></div>
<p class="note">平均のずれは「実測 − 潮見表」の月平均（cm）。＋は実測のほうが高かったことを表します。割合はその月の時間のうち、ずれが20cmを超えた時間の割合です。</p>
<div class="tw"><table class="prefsum">
  <thead><tr><th>年</th>${years.map(([y]) => `<th>${y}</th>`).join('')}</tr></thead>
  <tbody><tr><th scope="row">平均のずれ</th>${years.map(([, y]) => `<td class="rg">${signed(y)}</td>`).join('')}</tr></tbody>
</table></div>
<div class="tw"><table class="prefsum">
  <thead><tr><th>過去最大</th><th>潮見表との差</th><th>日時</th></tr></thead>
  <tbody>${ext('高いほう', v.maxHigh, 1)}${ext('低いほう', v.maxLow, -1)}</tbody>
</table></div>
<p class="note">出典：気象庁 潮汐観測資料の毎時潮位偏差（${span(v)}、欠測を除く${v.hours.toLocaleString('ja-JP')}時間）。毎時の値なので、ピークの瞬間はこれより大きかった可能性があります。</p>`;
}

// disclosure は pages.mjs の折りたたみ部品。循環 import を避けるため引数で受け取る。
export function observedBlock(st, name, disclosure) {
  const v = observedStatsFor(st);
  if (!v) return '';
  const o = { st: st.jma, v };
  return `<p class="station-observed-summary">${summary(name, o)}</p>
${caveat(o)}
${disclosure('月別・年別のずれ', `${span(v)}の実測から集計`, details(o))}
<p class="more"><a href="${attr(paths.guide(ATARI_GUIDE.slug))}">全国の集計：潮見表はどれくらい当たる？</a></p>`;
}
