// =====================================================================
// よくある質問（短く言い切る答え）
//
// 検索や AI の回答にそのまま引用されやすいよう、1問1答で、日付と数字を
// 言い切る一文にする。答えはすべてそのページに載っている推算値から作り、
// 推測や一般論は書かない。FAQPage の構造化データも同じ文から作る。
// =====================================================================

import { esc } from './html.mjs';
import { stationLabel } from './station-quality.mjs';
import { fmtHM, WD } from './util.mjs';

const md = ms => {
  const d = new Date(ms);
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日(${WD[d.getUTCDay()]})`;
};

// 6〜18時の干潮のうちいちばん低いもの
function daytimeLow(day) {
  const lows = (day?.lows || []).filter(e => e.time >= 6 && e.time <= 18);
  return lows.length ? lows.reduce((a, b) => (b.level < a.level ? b : a)) : null;
}

// ahead: [{ ms, shio, day }] 今日から先の日を順に。day は tideDayLight の結果
export function stationFaq({ st, day, shio, dayMs, ahead }) {
  const name = stationLabel(st);
  const items = [];

  const times = list => list.map(e => fmtHM(e.time)).join('と');
  items.push({
    q: `${name}の今日の満潮・干潮は何時ですか？`,
    a: `${md(dayMs)}の${name}は、満潮が${times(day.highs) || 'ありません'}、干潮が${times(day.lows) || 'ありません'}です。干満差は${day.range}cm、潮回りは${shio}です。`,
  });

  // 大潮: 今日が大潮ならいつまで続くか、そうでなければ次はいつからか
  const runFrom = i => {
    let j = i;
    while (j + 1 < ahead.length && ahead[j + 1].shio === '大潮') j++;
    return [ahead[i].ms, ahead[j].ms];
  };
  let oh = null;
  if (ahead[0]?.shio === '大潮') {
    const [, to] = runFrom(0);
    oh = to === ahead[0].ms ? `今日（${md(dayMs)}）が大潮です。` : `今日（${md(dayMs)}）は大潮で、${md(to)}まで続きます。`;
  } else {
    const i = ahead.findIndex(x => x.shio === '大潮');
    if (i > 0) {
      const [from, to] = runFrom(i);
      oh = from === to ? `次の大潮は${md(from)}です。` : `次の大潮は${md(from)}から${md(to)}までです。`;
    }
  }
  if (oh) items.push({ q: `${name}の次の大潮はいつですか？`, a: `${oh}潮回りは月の満ち欠けで決まり、全国で同じ日になります。` });

  // これから先で、昼間いちばん引く日
  let best = null;
  for (const x of ahead) {
    const l = daytimeLow(x.day);
    if (l && (!best || l.level < best.l.level)) best = { ms: x.ms, l };
  }
  if (best) {
    items.push({
      q: `${name}でこれから${ahead.length}日のうち、昼間にいちばん潮が引くのはいつですか？`,
      a: `${md(best.ms)}の${fmtHM(best.l.time)}で、潮位は${Math.round(best.l.level)}cmの予測です（6時から18時までの干潮のうち、いちばん低いもの）。`,
    });
  }

  items.push({
    q: `${name}の潮見表のデータはどこから来ていますか？`,
    a: st.jmaAnchor
      ? `${name}には気象庁の公式観測点がないため、最寄りの公式観測点「${st.jmaName || st.jma}」の推算値（気象庁 潮位表）を${st.damp !== 1 || st.dz !== 0 ? 'もとに、この地点向けに補正した値を' : 'そのまま'}載せています。現地とは時刻や潮位がずれることがあります。毎日自動で更新しています。`
      : `気象庁が公表している潮位表の推算値（観測点「${st.jmaName || name}」）をそのまま載せています。毎日自動で更新しています。`,
  });
  return items;
}

// yearPage と同じ集計値から作る
export function yearFaq({ st, y, stats, lowest }) {
  const name = stationLabel(st);
  const d = ymd => md(Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10))));
  const items = [
    { q: `${y}年の${name}の大潮は何日ありますか？`, a: `${y}年の${name}の大潮は${stats.oh}日です。` },
    { q: `${y}年に${name}で干満差がいちばん大きい日はいつですか？`, a: `${d(stats.maxDay)}で、干満差は${stats.maxRange}cmです。` },
  ];
  if (lowest) {
    items.push({
      q: `${y}年に${name}で、明るいうちにいちばん潮が引く日はいつですか？`,
      a: `${d(lowest.ymd)}の${fmtHM(lowest.t)}で、潮位は${Math.round(lowest.lv)}cmの予測です。明るいうちに大きく引く日は、${y}年に${stats.bigDays}日あります。`,
    });
  }
  return items;
}

export function faqSection(items) {
  if (!items.length) return '';
  return `<section class="blk faq">
  <div class="blk-hd"><h2>よくある質問</h2></div>
  <dl class="faq-list">${items.map(x => `<dt>${esc(x.q)}</dt><dd>${esc(x.a)}</dd>`).join('')}</dl>
</section>`;
}

export function faqLd(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(x => ({ '@type': 'Question', name: x.q, acceptedAnswer: { '@type': 'Answer', text: x.a } })),
  };
}

