// =====================================================================
// 地点ごとの「潮の特徴」
//
// 地点ページの本文は、その日の満潮・干潮の数値が変わるだけの定型文だった。
// ここでは気象庁の年次潮位表を1年ぶん集計した値(lib/tide-profile.mjs)から、
// 地点ごとに必ず違う事実を文章にする。全国・県内での順位、最高・最低潮位の日、
// 昼に潮が大きく引く季節、最寄りの観測点との満潮時刻の差など。
//
// 地点ページでは短い要約を常時表示し、集計の詳細は折りたたみに置く。
// =====================================================================

import { esc, attr } from './html.mjs';
import { scaleWord, typeSentence } from './area-notes.mjs';
import { fmtHM } from './util.mjs';

const md = k => `${Number(k.slice(5, 7))}月${Number(k.slice(8, 10))}日`;

function rankSentence(ctx) {
  const { sp, name, rank, total, prefName, prefAvg, prefRank, prefN } = ctx;
  let s = `${name}の${ctx.year}年の推算値を通年で集計すると、1日の干満差は平均${sp.avg}cm、`
    + `大潮のころで${sp.spring}cm前後、小潮のころで${sp.neap}cm前後です。`
    + `全国の公式観測点${total}地点の中では干満差が大きいほうから${rank}番目で、${scaleWord(sp.avg)}にあたります。`;
  if (prefN > 1 && prefAvg) {
    const diff = sp.avg - prefAvg;
    s += Math.abs(diff) <= prefAvg * 0.1
      ? `${esc(prefName)}の観測点${prefN}地点の平均（${prefAvg}cm）とほぼ同じ大きさです。`
      : `${esc(prefName)}の観測点${prefN}地点の平均（${prefAvg}cm）より${Math.abs(diff)}cm${diff > 0 ? '大きく' : '小さく'}、県内では${prefRank}番目です。`;
  }
  return s;
}

function extremeSentence({ sp, year }) {
  if (!sp.hi || !sp.lo) return '';
  return `${year}年でいちばん潮位が高くなるのは${md(sp.hi.date)} ${fmtHM(sp.hi.time)}の${sp.hi.level}cm、`
    + `いちばん低くなるのは${md(sp.lo.date)} ${fmtHM(sp.lo.time)}の${sp.lo.level}cmで、1年間の海面の上下の幅は${sp.hi.level - sp.lo.level}cmです。`
    + (sp.maxDate ? `1日の干満差が最も大きくなるのは${md(sp.maxDate)}（${sp.max}cm）です。` : '');
}

function seasonSentence({ sp, guideHref }) {
  if (!sp.dayLowMonth) return '';
  let s = `日中（6〜18時）の干潮が年間で最も低くなるのは<b>${sp.dayLowMonth}月</b>で、潮位${sp.dayLowLevel}cmまで下がる日があります。`;
  if (sp.nightLowMonth && sp.nightLowMonth !== sp.dayLowMonth) {
    s += `夜間（18時〜翌6時）の干潮が最も低くなるのは${sp.nightLowMonth}月（${sp.nightLowLevel}cm）です。`;
  }
  if (sp.avg < 50) {
    s += `ただしこの地点は干満差そのものが小さく、季節による干潮の低さの違いも数十cmにとどまります。大きく潮が引くことを前提にした潮干狩りの計画には向きません。`;
  } else if (sp.dayLowMonth >= 3 && sp.dayLowMonth <= 8) {
    s += `春から夏にかけて昼間に大きく潮が引く、潮干狩りや磯遊びの日取りを決めやすい地点です。`;
  } else {
    s += `昼間にいちばん大きく潮が引くのは秋から冬で、全国的に多い「春から夏の昼に大きく引く」傾向とは時期が異なります。`;
  }
  if (guideHref) s += `季節によって干潮の時間帯が変わる理由は<a href="${attr(guideHref)}">季節で変わる干潮の時間帯</a>で解説しています。`;
  return s;
}

function neighborSentence({ nb }) {
  if (!nb) return '';
  const kmTxt = nb.km < 1 ? '1km未満' : `約${Math.round(nb.km)}km`;
  const n = esc(nb.name);
  let s = `最寄りの観測点は${n}（${kmTxt}）です。`;
  const sameTime = nb.lag != null && Math.abs(nb.lag) <= 5;
  if (nb.lag != null) {
    s += sameTime
      ? `満潮の時刻は${n}とほぼ同じで、`
      : `この地点の満潮は${n}より平均で約${Math.abs(nb.lag)}分${nb.lag > 0 ? '早く' : '遅く'}、`;
  }
  const ratio = nb.avg ? nb.ownAvg / nb.avg : 1;
  if (ratio >= 0.9 && ratio <= 1.1) {
    s += `干満差${sameTime ? 'も' : 'は'}ほぼ同じ大きさです。`;
  } else {
    s += `平均の干満差は${n}の${ratio.toFixed(1)}倍です。`;
    if (ratio >= 1.3 || ratio <= 0.77) {
      s += `距離が近くても潮の大きさがはっきり違うので、行き先がこの2地点の間にあるときは、同じ海に面しているほうを参考にしてください。`;
    }
  }
  return s;
}

// 年間統計と近隣との差を、詳細を開かなくても読める3文にまとめる。
export function stationNoteSummary(ctx) {
  const { sp, year, rank, total, nb } = ctx;
  const parts = [`${esc(ctx.name)}の${year}年の平均干満差は${sp.avg}cmで、全国${total}観測点中、大きいほうから${rank}番目です。`];
  if (sp.dayLowMonth) parts.push(`日中（6〜18時）の干潮が年間で最も低くなるのは${sp.dayLowMonth}月です。`);
  if (nb) {
    const diff = sp.avg - nb.avg;
    const comparison = Math.abs(diff) <= nb.avg * 0.1 ? 'ほぼ同じ' : `平均で${Math.abs(diff)}cm${diff > 0 ? '大きい' : '小さい'}`;
    parts.push(`最寄りの${esc(nb.name)}と比べると、干満差は${comparison}です。`);
  }
  return parts.join('');
}

export function stationNoteChart({ sp }) {
  const rows = [['年間平均', sp.avg], ['大きい日', sp.spring], ['小さい日', sp.neap]];
  const max = Math.max(1, ...rows.map(([, value]) => value));
  return `<figure class="station-profile-chart" aria-label="年間の干満差の比較"><div class="visual-bars">`
    + rows.map(([label, value]) => `<div class="visual-bar-row"><span>${label}</span><div class="visual-bar-track"><i style="width:${(value / max * 100).toFixed(1)}%"></i></div><b>${value}cm</b></div>`).join('')
    + `</div><figcaption class="note">大きい日・小さい日は、年間の干満差の上位10%・下位10%の日の平均です。</figcaption></figure>`;
}

// ctx: { sp, year, name, rank, total, prefName, prefAvg, prefRank, prefN, nb, guideHref }
//   sp: stationProfile() の戻り値
//   nb: { name, km, lag, avg, ownAvg } または null
export function stationNoteHtml(ctx) {
  const { sp, year } = ctx;
  const ps = [
    rankSentence({ ...ctx, name: esc(ctx.name) }),
    typeSentence(sp.diurnalPct),
    extremeSentence(ctx),
    seasonSentence(ctx),
    neighborSentence(ctx),
  ].filter(Boolean).map(s => `<p>${s}</p>`).join('\n');

  const row = (k, v) => `<tr><th scope="row">${k}</th><td>${v}</td></tr>`;
  const table = `<div class="tw"><table class="prefsum">
    <thead><tr><th>指標（${year}年）</th><th>値</th></tr></thead>
    <tbody>
      ${row('平均の干満差', `${sp.avg} cm（全国${ctx.total}地点中 ${ctx.rank}位）`)}
      ${row('大潮のころ / 小潮のころ', `約 ${sp.spring} cm / 約 ${sp.neap} cm`)}
      ${sp.maxDate ? row('年間で最も大きい干満差', `${sp.max} cm（${md(sp.maxDate)}）`) : ''}
      ${sp.hi ? row('年間の最高潮位', `${sp.hi.level} cm（${md(sp.hi.date)} ${fmtHM(sp.hi.time)}）`) : ''}
      ${sp.lo ? row('年間の最低潮位', `${sp.lo.level} cm（${md(sp.lo.date)} ${fmtHM(sp.lo.time)}）`) : ''}
      ${sp.dayLowMonth ? row('日中の干潮が最も低い月', `${sp.dayLowMonth}月（${sp.dayLowLevel} cm）`) : ''}
      ${row('満潮が1日1回だけの日', `年間の ${sp.diurnalPct}%`)}
    </tbody>
  </table></div>`;

  return `<div class="prose station-profile">${ps}</div>
${table}
<p class="note">気象庁 ${year}年 潮位表の推算値（${sp.days}日分）から集計しています。潮位はこの地点の基準面からの高さで、ほかの地点の潮位と数値どうしを直接比べることはできません。</p>`;
}
