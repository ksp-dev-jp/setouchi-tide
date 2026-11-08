// =====================================================================
// 年間潮見表(印刷用)
//
//   /{pref}/{station}/{YYYY}/      地点ごとの1年分。A4縦で2か月ずつ、6枚に収まる
//   /tool/shiomihyo-nenkan/        地点を選ぶページ
//
// 公式観測点だけを出す。近似地点は観測点の値の補正なので、1年分を紙にしても
// 観測点のページと同じ内容になる。
// PDF は生成せず、ブラウザの印刷から「PDFに保存」してもらう。このリポジトリは
// 依存パッケージなしの静的サイトジェネレータなので PDF ライブラリは入れていない。
// =====================================================================

import { SITE } from '../config.mjs';
import { page, esc, attr, ad } from './html.mjs';
import { paths, abs, pref, yearTable } from './routes.mjs';
import { REGIONS } from './stations.mjs';
import { stationLabel } from './station-quality.mjs';
import { tideDayLight } from './tide.mjs';
import { celestialData } from './astro.mjs';
import { dayKeyOf, addDays, daysInMonth, fmtHM, WD } from './util.mjs';
import { HOLIDAYS } from './holidays.mjs';
import { bigLowDays } from './tools.mjs';
import { ATARI_GUIDE } from './guide-atari.mjs';
import { trailFor, recentOf, withPref } from './pages.mjs';

export const YEAR_HUB_SLUG = 'shiomihyo-nenkan';
export const YEAR_UPDATED = '2026-11-08';

// 印刷の余白はこのページだけに効かせる(ほかのページの印刷を変えないため)
const PRINT_HEAD = '<style>@page { size: A4 portrait; margin: 9mm; }</style>';

const printButton = `<p class="yt-actions"><button type="button" class="yt-print" onclick="window.print()">印刷 / PDFで保存</button>
<span class="note">A4縦で6枚です。PDFにするときは、印刷画面の送信先で「PDFに保存」を選んでください。</span></p>`;

function extremeCells(list, mark) {
  const cells = [];
  for (let i = 0; i < 2; i++) {
    const e = list[i];
    if (!e) { cells.push('<td></td>'); continue; }
    const big = mark && fmtHM(e.time) === mark;
    cells.push(`<td${big ? ' class="big"' : ''}>${big ? '★' : ''}${fmtHM(e.time)}<i>${Math.round(e.level)}</i></td>`);
  }
  return cells.join('');
}

function monthBlock(st, y, m0, byDay, marks) {
  const start = Date.UTC(y, m0, 1);
  const rows = [];
  for (let i = 0; i < daysInMonth(y, m0); i++) {
    const d = addDays(start, i);
    const ymd = dayKeyOf(d);
    const t = tideDayLight(st, byDay, d);
    if (!t) throw new Error(`${st.name}: ${ymd} の潮位データがありません`);
    const wd = new Date(d).getUTCDay();
    const cls = HOLIDAYS[ymd] || wd === 0 ? 'sun' : wd === 6 ? 'sat' : '';
    const shio = celestialData(st, d).shio;
    rows.push(`<tr${cls ? ` class="${cls}"` : ''}><th scope="row">${i + 1}</th><td>${WD[wd]}</td>`
      + `<td${shio === '大潮' ? ' class="oh"' : ''}>${esc(shio)}</td>`
      + `${extremeCells(t.highs)}${extremeCells(t.lows, marks.get(ymd))}</tr>`);
  }
  return `<section class="yt-month">
  <h2>${esc(stationLabel(st))}　${y}年${m0 + 1}月</h2>
  <table class="yt">
    <thead><tr><th>日</th><th>曜</th><th>潮</th><th colspan="2">満潮</th><th colspan="2">干潮</th></tr></thead>
    <tbody>${rows.join('')}</tbody>
  </table>
</section>`;
}

// 年間の集計。本文の要約と description に使う。
function yearStats(st, y, byDay, big) {
  let oh = 0, maxRange = 0, maxDay = null;
  const n = (Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1)) / 86400000;
  for (let i = 0; i < n; i++) {
    const d = addDays(Date.UTC(y, 0, 1), i);
    if (celestialData(st, d).shio === '大潮') oh++;
    const t = tideDayLight(st, byDay, d);
    if (t && t.range > maxRange) { maxRange = t.range; maxDay = dayKeyOf(d); }
  }
  return { oh, maxRange, maxDay, bigDays: big ? big.days.length : 0 };
}

const md = ymd => `${Number(ymd.slice(5, 7))}月${Number(ymd.slice(8, 10))}日`;

export function yearPage({ st, y, byDay }) {
  const p = pref(st.pref);
  const name = stationLabel(st);
  const n = (Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1)) / 86400000;
  const big = bigLowDays(st, byDay, Date.UTC(y, 0, 1), n);
  const marks = new Map(big ? big.days.map(d => [d.ymd, fmtHM(d.t)]) : []);
  const s = yearStats(st, y, byDay, big);

  const pairs = [];
  for (let m0 = 0; m0 < 12; m0 += 2) {
    pairs.push(`<div class="yt-pair">${monthBlock(st, y, m0, byDay, marks)}${monthBlock(st, y, m0 + 1, byDay, marks)}</div>`);
  }

  const lowest = big ? [...big.days].sort((a, b) => a.lv - b.lv)[0] : null;
  const summary = `${withPref(st)}の${y}年は、大潮が${s.oh}日あります。1日の干満差がいちばん大きいのは${md(s.maxDay)}で${s.maxRange}cmです。`
    + (lowest ? `明るいうちに大きく引く日は${s.bigDays}日で、いちばん低いのは${md(lowest.ymd)}の${fmtHM(lowest.t)}（${Math.round(lowest.lv)}cm）です。` : '');
  const description = `${withPref(st)}の${y}年の潮見表。1年分の満潮・干潮の時刻と潮位、潮回りを、A4で印刷・PDF保存できる形にまとめました。${summary}`;

  const body = `
<article class="yt-page">
  <header class="st-hd">
    <p class="st-eyebrow"><a href="${attr(paths.pref(p))}">${esc(p.name)}</a>　<a href="${attr(paths.station(st))}">${esc(name)}</a></p>
    <h1>${esc(name)}の潮見表　${y}年<span class="h1-sub">（年間・印刷用）</span></h1>
  </header>
  <p class="lead yt-intro">${esc(summary)}</p>
  ${printButton}
  <p class="note yt-legend">数字は左が時刻、右が潮位(cm)です。★は明るいうちに大きく引く日の干潮です（日の出の1時間後から日の入りの1時間前までの干潮のうち、年間で低いほう1割）。</p>
  ${pairs.join('\n')}
  <p class="src-note">出典：<a href="${attr(SITE.JMA_CREDIT_URL)}" rel="nofollow noopener" target="_blank">${esc(SITE.JMA_CREDIT)}</a>（${y}年の推算値）をもとに${esc(SITE.NAME)}で作成。潮位表は予測で、実際の潮位は気圧や風で<a href="${attr(paths.guide(ATARI_GUIDE.slug))}">ずれることがあります</a>。</p>
  <p class="more yt-actions"><a href="${attr(paths.tool(YEAR_HUB_SLUG))}">ほかの地点の年間潮見表</a></p>
  ${ad('footer')}
</article>`;

  return page({
    title: `${name}の潮見表 ${y}年（年間・印刷用）${'｜'}1年分の満潮・干潮${'｜'}${SITE.NAME}`,
    description,
    canonical: abs.year(st, y),
    fileBase: `${name}_${y}`,
    headerArt: p.id === 'okinawa' ? 'okinawa' : p.region,
    bodyClass: 'year-page',
    head: PRINT_HEAD,
    trail: trailFor(st, { name: `${y}年`, href: paths.year(st, y), abs: abs.year(st, y) }),
    recentStation: recentOf(st),
  }, body);
}

export function yearHubPage({ y, stations }) {
  const title = `${y}年の潮見表`;
  const description = `全国${stations.length}の気象庁観測点について、${y}年1年分の満潮・干潮の時刻と潮位を、A4で印刷・PDF保存できる形にまとめました。地点を選んでください。`;
  const groups = REGIONS.map(r => {
    const prefs = r.prefs.map(pid => {
      const list = stations.filter(s => s.pref === pid);
      if (!list.length) return '';
      return `<h3>${esc(pref(pid).name)}</h3><p class="yt-links">${list.map(s =>
        `<a href="${attr(paths.year(s, y))}">${esc(stationLabel(s))}</a>`).join('')}</p>`;
    }).join('');
    return prefs ? `<section class="blk"><div class="blk-hd"><h2>${esc(r.name)}</h2></div>${prefs}</section>` : '';
  }).join('\n');

  const body = `
<article>
  <header class="st-hd">
    <h1>${esc(title)}<span class="h1-sub">（全国${stations.length}地点・年間・印刷用）</span></h1>
    <p class="lede">1年分の満潮・干潮を、紙やPDFで手元に置けます</p>
  </header>
  <p>気象庁の潮位表をもとに、${y}年1月から12月までの満潮・干潮の時刻と潮位、潮回りを地点ごとに1ページにまとめました。A4縦で2か月ずつ、全部で6枚です。電波の弱い堤防や船の上でも見られるよう、紙やPDFにしておけます。</p>
  <p>昼間に大きく引く干潮には★を付けています。潮干狩りや磯遊びの日取りを先に決めるときの目安になります。</p>
  ${groups}
  <p class="src-note">出典：<a href="${attr(SITE.JMA_CREDIT_URL)}" rel="nofollow noopener" target="_blank">${esc(SITE.JMA_CREDIT)}</a>（${y}年の推算値）をもとに${esc(SITE.NAME)}で作成。</p>
  ${ad('footer')}
</article>`;

  return page({
    title: `${title}（全国${stations.length}地点・年間・印刷用）${'｜'}${SITE.NAME}`,
    description,
    canonical: abs.tool(YEAR_HUB_SLUG),
    trail: [
      { name: '全国', href: paths.home(), abs: abs.home() },
      { name: title, href: paths.tool(YEAR_HUB_SLUG), abs: abs.tool(YEAR_HUB_SLUG) },
    ],
  }, body);
}

// 地点ページのタブから参照する
export const yearHref = (st) => paths.year(st, yearTable.year);
