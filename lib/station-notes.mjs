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
import { typeSentence } from './area-notes.mjs';
import { fmtHM } from './util.mjs';

const md = k => `${Number(k.slice(5, 7))}月${Number(k.slice(8, 10))}日`;

// 日中に大きく引く日がいちばん多い月 { m, n }。同数なら早い月。
function peakMonth(bigLow) {
  return bigLow.months.reduce((best, n, i) => (n > best.n ? { m: i + 1, n } : best), { m: 0, n: 0 });
}

// 日数の85%以上を含む最短の連続した期間(年をまたいでもよい)。
// 1〜2日だけ離れた月に出る日があっても、中心の時期を示せるようにする。
function monthSpan(months) {
  const total = months.reduce((a, b) => a + b, 0);
  let best = null;
  for (let i = 0; i < 12; i++) {
    let sum = 0;
    for (let len = 1; len <= 12; len++) {
      sum += months[(i + len - 1) % 12];
      if (sum < total * 0.85) continue;
      if (!best || len < best.len || (len === best.len && sum > best.sum)) best = { start: i, len, sum };
      break;
    }
  }
  return { from: best.start + 1, to: (best.start + best.len - 1) % 12 + 1, len: best.len };
}

function seasonSentence({ sp, guideHref }) {
  if (!sp.dayLowMonth) return '';
  let s = `日中（6〜18時）の干潮が年間で最も低くなるのは<b>${sp.dayLowMonth}月</b>で、潮位${sp.dayLowLevel}cmまで下がる日があります。`;
  if (sp.nightLowMonth && sp.nightLowMonth !== sp.dayLowMonth) {
    s += `夜間（18時〜翌6時）の干潮が最も低くなるのは${sp.nightLowMonth}月（${sp.nightLowLevel}cm）です。`;
  }
  const bl = sp.bigLow;
  if (bl && bl.days) {
    const top = peakMonth(bl);
    const span = monthSpan(bl.months);
    s += `日中の干潮が潮位${bl.level}cm以下まで下がる日は年間${bl.days}日あり、`
      + (span.len <= 7
        ? `おもに${span.from}月から${span.to}月にかけて現れます。`
        : `時期は1年の広い範囲に散らばっています。`)
      + `最も多いのは${top.m}月（${top.n}日）です。`;
  }
  if (sp.avg < 50) {
    s += `ただし平均の干満差が${sp.avg}cmと小さく、大きく引く日でもふだんの干潮との差は数十cmです。`;
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
  const top = sp.bigLow?.days ? peakMonth(sp.bigLow) : null;
  if (top) parts.push(`明るいうちに潮位${sp.bigLow.level}cm以下まで引く日がいちばん多いのは${top.m}月（${top.n}日）です。`);
  else if (sp.dayLowMonth) parts.push(`日中（6〜18時）の干潮が年間で最も低くなるのは${sp.dayLowMonth}月です。`);
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
    + `</div><figcaption class="note">大きい日・小さい日＝年間の上位・下位1割の日の平均。</figcaption></figure>`;
}

// ctx: { sp, year, name, rank, total, prefName, prefAvg, prefRank, prefN, nb, guideHref }
//   sp: stationProfile() の戻り値
//   nb: { name, km, lag, avg, ownAvg } または null
export function stationNoteHtml(ctx) {
  const { sp, year } = ctx;
  // 平均・順位・最高最低潮位は下の表で読めるので、文章では表に出ない
  // 傾向(潮汐型・季節・最寄りとの差)だけを書く。
  const ps = [
    typeSentence(sp.diurnalPct),
    seasonSentence(ctx),
    neighborSentence(ctx),
  ].filter(Boolean).map(s => `<p>${s}</p>`).join('\n');

  const row = (k, v) => `<tr><th scope="row">${k}</th><td>${v}</td></tr>`;
  const table = `<div class="tw"><table class="prefsum">
    <thead><tr><th>指標（${year}年）</th><th>値</th></tr></thead>
    <tbody>
      ${row('平均の干満差', `${sp.avg} cm（全国${ctx.total}地点中 ${ctx.rank}位）`)}
      ${ctx.prefN > 1 && ctx.prefAvg ? row(`${esc(ctx.prefName)}の中で`, `${ctx.prefN}地点中 ${ctx.prefRank}位（県の平均 ${ctx.prefAvg} cm）`) : ''}
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
<p class="note">気象庁 ${year}年 潮位表の推算値（${sp.days}日分）から集計。潮位の基準面は地点ごとに違うため、潮位の数値は他の地点と直接比べられません。</p>`;
}
