// =====================================================================
// ツール:水深計算(/tool/suishin/)と潮干狩りカレンダー(/tool/shiohigari-calendar/)
//
// どちらも公式観測点(239)だけを扱う。近似地点は観測点の値を補正した
// 推定なので、そこからさらに水深や「大きく引く日」を出すと誤差が重なる。
//
// 計算はブラウザで行い、ビルドでは材料の JSON だけを書く(sitemap には載せない)。
//   data/tide/{コード}.json   毎時の推算潮位(今日から最大1年)と実測のずれ
//   data/shiohigari.json      地点ごとの「明るいうちに大きく引く日」
// HTML 側には JS が無くても読める集計(地方ごとの日付、月ごとの日数、計算例)
// を書き、地点ごとの詳しい結果だけを JS で出す。
//
// 実測のずれ(lib/observed-stats.mjs)は、年平均が年によって大きく動く地点
// (unstable)では月平均の補正が当てにならないため使わない。
// =====================================================================

import { SITE, asset } from '../config.mjs';
import { page, esc, attr, section, ad } from './html.mjs';
import { paths, abs, pref, regionOf } from './routes.mjs';
import { REGIONS } from './stations.mjs';
import { stationLabel } from './station-quality.mjs';
import { tideDay, tideDayLight, fillNulls } from './tide.mjs';
import { celestialData } from './astro.mjs';
import { dayKeyOf, dayMsOf, addDays, fmtHM, WD } from './util.mjs';
import { HOLIDAYS } from './holidays.mjs';
import { observedStatsFor } from './station-observed.mjs';
import { ATARI_GUIDE, GENBO_URL } from './guide-atari.mjs';

export const DEPTH_SLUG = 'suishin';
export const CALENDAR_SLUG = 'shiohigari-calendar';
export const TOOLS_UPDATED = '2026-10-25';
const SUISAN_URL = 'https://www.data.jma.go.jp/kaiyou/db/tide/suisan/index.php';

export const tideDataPath = st => `data/tide/${st.jma}.json`;
export const CALENDAR_DATA = 'data/shiohigari.json';
const LIGHT_MARGIN = 1;   // 時間

const md = ymd => `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}`;
const ymdJa = ymd => `${ymd.slice(0, 4)}年${Number(ymd.slice(5, 7))}月${Number(ymd.slice(8, 10))}日`;
const wdOf = ymd => new Date(dayMsOf(ymd)).getUTCDay();
const restOf = ymd => HOLIDAYS[ymd] || (wdOf(ymd) === 0 || wdOf(ymd) === 6 ? WD[wdOf(ymd)] : '');
const dayLabel = ymd => `${md(ymd)}(${WD[wdOf(ymd)]})`;
const signed = v => (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v);

// 実測のずれのうち、ツールで使う分。unstable の地点は使わない。
function usableObserved(st) {
  const o = observedStatsFor(st);
  return o && !o.unstable ? o : null;
}

// fromMs から続けてデータがある日数(maxDays まで)
export function availableDays(byDay, fromMs, maxDays) {
  let n = 0;
  while (n < maxDays && byDay[dayKeyOf(addDays(fromMs, n))]) n++;
  return n;
}

// ---------------------------------------------------------------------
// 水深計算の材料
// ---------------------------------------------------------------------

// h は毎時の推算潮位を日をまたいで並べたもの(n日 × 24 + 1点)。i日目の
// 0〜24時は h[24i .. 24i+24] で、地点ページ(lib/tide.mjs の tideDay)と
// 同じく25点の自然三次スプラインで補間すれば同じ曲線になる。
export function tideJSON(st, byDay, fromMs, nDays) {
  const h = [];
  for (let i = 0; i < nDays; i++) h.push(...byDay[dayKeyOf(addDays(fromMs, i))].hourly);
  const next = byDay[dayKeyOf(addDays(fromMs, nDays))];
  h.push(next ? next.hourly[0] : h[h.length - 1]);
  fillNulls(h);
  const o = usableObserved(st);
  return {
    s: dayKeyOf(fromMs), n: nDays, h,
    mm: o ? o.monthMean.map(v => (v == null ? null : Math.round(v))) : null,
    p95: o ? o.p95 : null,
  };
}

// ---------------------------------------------------------------------
// 潮干狩りカレンダーの材料
// ---------------------------------------------------------------------

// 日の出の1時間後から日の入りの1時間前までの干潮のうち、いちばん低いものを
// その日の値にし(干潮の前後に明るい時間が残る日に限るため)、
// 期間中の低いほう1割に入る日を「明るいうちに大きく引く日」とする。
// 地点ページの年間集計(lib/tide-profile.mjs の bigLow)と同じ考え方で、
// 期間を「今日から1年」に、日中を「6〜18時」から日の出・日の入りに変えた。
export function bigLowDays(st, byDay, fromMs, nDays) {
  const all = [];
  for (let i = 0; i < nDays; i++) {
    const dayMs = addDays(fromMs, i);
    const t = tideDayLight(st, byDay, dayMs);
    if (!t) continue;
    const cel = celestialData(st, dayMs);
    const lows = t.lows.filter(e => e.time >= cel.sunrise + LIGHT_MARGIN && e.time <= cel.sunset - LIGHT_MARGIN);
    if (!lows.length) continue;
    const e = lows.reduce((a, b) => (b.level < a.level ? b : a));
    all.push({ ymd: dayKeyOf(dayMs), t: e.time, lv: e.level, shio: cel.shio });
  }
  if (all.length < 30) return null;
  const lv = all.map(d => d.lv).sort((a, b) => a - b);
  const cut = lv[Math.floor(lv.length * 0.1)];
  return { cut, days: all.filter(d => d.lv <= cut) };
}

// 地点ごとの結果 rows = [{ st, big }] から、ページに書く集計を作る。
export function calendarSummary(rows) {
  const byRegion = REGIONS.map(r => {
    const list = rows.filter(x => regionOf(x.st).id === r.id);
    const count = new Map();
    for (const x of list) for (const d of x.big.days) count.set(d.ymd, (count.get(d.ymd) || 0) + 1);
    // 地方の観測点の半数以上で大きく引く日
    const need = Math.ceil(list.length / 2);
    const days = [...count].filter(([, c]) => c >= need).map(([ymd]) => ymd).sort();
    return { r, n: list.length, days };
  }).filter(x => x.n);

  // 月ごとの延べ日数(全地点)。12か月の窓なので同じ月が2回は来ない。
  const months = new Map();
  for (const x of rows) for (const d of x.big.days) {
    const ym = d.ymd.slice(0, 7);
    months.set(ym, (months.get(ym) || 0) + 1);
  }
  return { byRegion, months: [...months].sort((a, b) => a[0].localeCompare(b[0])) };
}

export function calendarJSON(rows, from, to) {
  return {
    from, to,
    hol: Object.fromEntries(Object.entries(HOLIDAYS).filter(([k]) => k >= from && k <= to)),
    st: rows.map(({ st, big }) => {
      const o = usableObserved(st);
      return {
        n: stationLabel(st), r: regionOf(st).id, p: pref(st.pref).name, h: paths.station(st),
        mm: o ? o.monthMean.map(v => (v == null ? null : Math.round(v))) : null,
        d: big.days.map(d => [d.ymd, fmtHM(d.t), d.lv, d.shio]),
      };
    }),
  };
}

// ---------------------------------------------------------------------
// 共通部品
// ---------------------------------------------------------------------

// 地方 → 都道府県 の optgroup で並べた地点の選択肢
function stationOptions(stations, value) {
  const groups = [];
  for (const r of REGIONS) for (const pid of r.prefs) {
    const list = stations.filter(s => s.pref === pid);
    if (list.length) groups.push({ label: pref(pid).name, list });
  }
  return groups.map(g => `<optgroup label="${attr(g.label)}">${g.list.map(s =>
    `<option value="${attr(value(s))}" data-r="${attr(regionOf(s).id)}">${esc(stationLabel(s))}</option>`).join('')}</optgroup>`).join('');
}

function trail(title, slug) {
  return [
    { name: '全国', href: paths.home(), abs: abs.home() },
    { name: title, href: paths.tool(slug), abs: abs.tool(slug) },
  ];
}

function appLd(name, description, slug) {
  return {
    '@context': 'https://schema.org', '@type': 'WebApplication', name, description,
    url: abs.tool(slug), applicationCategory: 'UtilityApplication', operatingSystem: 'Any',
    inLanguage: 'ja', isAccessibleForFree: true,
  };
}

const sources = `<div class="guide-sources"><h2>出典</h2><ul>
  <li><a href="${attr(SUISAN_URL)}" rel="noopener" target="_blank">気象庁：潮位表（推算潮位）</a></li>
  <li><a href="${attr(GENBO_URL)}" rel="noopener" target="_blank">気象庁：潮汐観測資料</a>（実測とのずれの集計に使用）</li>
</ul></div>`;

// ---------------------------------------------------------------------
// 水深計算ページ
// ---------------------------------------------------------------------

// example: { st, byDay, dayMs } 計算例に使う地点と日(ビルド日)
export function depthToolPage({ stations, example, from, nDays }) {
  const title = '水深計算ツール';
  const description = '海図の水深と気象庁の潮位表から、指定した日時のおおよその水深を計算します。全国約70地点では、実測10年分の「潮見表とのずれ」で補正した値もあわせて出します。';
  const observedN = stations.filter(s => usableObserved(s)).length;
  const to = dayKeyOf(addDays(dayMsOf(from), nDays - 1));

  // 計算例:ビルド日の例示地点の干潮・満潮
  let exampleHtml = '';
  const ex = example && tideDay(example.st, example.byDay, example.dayMs);
  if (ex && ex.lows.length && ex.highs.length) {
    const lo = ex.lows.reduce((a, b) => (b.level < a.level ? b : a));
    const hi = ex.highs.reduce((a, b) => (b.level > a.level ? b : a));
    const D = 2;
    const m = cm => (D + cm / 100).toFixed(1);
    const o = usableObserved(example.st);
    const mon = new Date(example.dayMs).getUTCMonth();
    const mm = o && o.monthMean[mon] != null ? Math.round(o.monthMean[mon]) : null;
    exampleHtml = `<p>たとえば${esc(stationLabel(example.st))}の${dayLabel(dayKeyOf(example.dayMs))}は、干潮が${fmtHM(lo.time)}に${lo.level}cm、満潮が${fmtHM(hi.time)}に${hi.level}cmです。海図で水深${D}.0mの場所は、干潮時に約${m(lo.level)}m、満潮時に約${m(hi.level)}mになります。</p>
${mm != null ? `<p>${esc(stationLabel(example.st))}の${mon + 1}月は、実測の潮位が潮見表より平均${Math.abs(mm)}cm${mm >= 0 ? '高め' : '低め'}でした（2016〜2025年）。この分を足すと、干潮時は約${m(lo.level + mm)}mです。</p>` : ''}`;
  }

  const body = `
<article>
  <header class="st-hd">
    <h1>${esc(title)}</h1>
    <p class="lede">海図の水深 ＋ その時刻の潮位 ＝ おおよその水深</p>
  </header>
  <p>海図や釣り場の案内に書かれた水深は、潮がいちばん引いたときの深さです。実際の水深は潮位のぶんだけ深くなり、干満差の大きい場所では同じ日のうちに数mも変わります。地点と日時を選ぶと、気象庁の潮位表からその時刻の潮位を出し、水深に足します。</p>
  <form class="tool-form" id="depth-tool" data-src-base="${attr(asset('data/tide/'))}" onsubmit="return false">
    <label>海図の水深<span class="tool-in"><input type="number" name="depth" step="0.1" min="-5" max="200" value="2.0" inputmode="decimal" required> m</span></label>
    <label>潮位の地点<select name="st" required><option value="">選んでください</option>${stationOptions(stations, s => s.jma)}</select></label>
    <label>日付<input type="date" name="date" min="${from}" max="${to}" value="${from}" required></label>
    <label>時刻<input type="time" name="time" step="600" value="12:00" required></label>
    <button type="submit" class="tool-go">計算する</button>
  </form>
  <div class="tool-result" id="depth-result" aria-live="polite"><p class="note">地点を選ぶと計算します。計算はこのブラウザの中で行い、入力した値は送信しません。</p></div>
  <noscript><p class="note">このツールは JavaScript で計算します。JavaScript が使えない場合は、地点ページの10分毎の潮位を海図の水深に足してください。</p></noscript>
  <p class="note">選べる期間は${ymdJa(from)}〜${ymdJa(to)}です。地点は気象庁の潮位表がある全国${stations.length}の観測点で、そのうち${observedN}地点では実測のずれによる補正もあわせて出します。</p>
  ${ad('graph')}
  <div class="prose">
    <h2>計算のしかた</h2>
    <p>水深は「海図の水深 ＋ 潮位」で求めます。海図の水深は<b>最低水面</b>（その場所でほぼこれより下がらない潮位）からの深さで、気象庁の潮位表の潮位は<b>潮位表基準面</b>からの高さです。潮位表基準面は多くの観測点で最低水面とほぼ同じ高さにとってあるため、2つを足すとその時刻のおおよその水深になります（<a href="${attr(paths.guide('kijunmen-hyoukou'))}">潮位の「cm」は何の高さ？</a>）。</p>
    ${exampleHtml}
    <p>潮位は気象庁の毎時の推算値を、地点ページのグラフと同じ方法（三次スプライン）で補間しています。選んだ時刻の水深に加えて、その日の干潮・満潮のときの水深も出します。</p>
    <h2>実測のずれで補正する</h2>
    <p>潮位表は月と太陽の引力から計算した予測で、実際の潮位は気圧・風・水温によって予測からずれます。全国の観測点の実測を10年分集計すると、ずれには季節の傾向があり、多くの地点で夏から秋は高め、冬から春は低めです（<a href="${attr(paths.guide(ATARI_GUIDE.slug))}">潮見表はどれくらい当たる？</a>）。</p>
    <p>実測のある${observedN}地点では、選んだ月の平均のずれを足した水深と、その地点で95%の時間が収まったずれの幅もあわせて出します。台風や強い低気圧が来ている日は、この幅を超えて高くなることがあります。</p>
    <h2>使うときの注意</h2>
    <ul>
      <li>潮位表基準面と海図の最低水面が数十cmずれている観測点もあります。浅い場所ほど、この差の影響が大きくなります。</li>
      <li>選んだ観測点から離れた場所では、潮の時刻や高さが変わります。湾の奥や河口では特に差が出ます。</li>
      <li>釣り場の案内やブログの水深は、どの潮位のときに測ったかが書かれていないことが多く、海図の水深ほど当てになりません。</li>
      <li>波の高さは含みません。<b>船の航行や安全の判断には使わないでください。</b>航海には海上保安庁の海図と潮汐表を使ってください。</li>
    </ul>
  </div>
  ${sources}
  <p class="more"><a href="${attr(paths.tool(CALENDAR_SLUG))}">潮干狩りカレンダー（全国・今後12か月）</a></p>
  ${ad('footer')}
</article>`;
  return page({
    title: `${title}｜海図の水深と潮位から計算｜${SITE.NAME}`,
    description,
    canonical: abs.tool(DEPTH_SLUG),
    trail: trail(title, DEPTH_SLUG),
    ld: [appLd(title, description, DEPTH_SLUG)],
  }, body);
}

// ---------------------------------------------------------------------
// 潮干狩りカレンダーページ
// ---------------------------------------------------------------------

function dayChip(ymd) {
  const cls = HOLIDAYS[ymd] || wdOf(ymd) === 0 ? 'hol' : wdOf(ymd) === 6 ? 'sat' : '';
  return `<span class="cal-d${cls ? ' ' + cls : ''}"${HOLIDAYS[ymd] ? ` title="${attr(HOLIDAYS[ymd])}"` : ''}>${dayLabel(ymd)}</span>`;
}

function regionTable(sum) {
  return sum.byRegion.map(x => {
    const months = new Map();
    for (const d of x.days) {
      const ym = d.slice(0, 7);
      (months.get(ym) || months.set(ym, []).get(ym)).push(d);
    }
    const rest = x.days.filter(restOf).length;
    const rows = [...months].map(([ym, ds]) =>
      `<tr><th scope="row">${Number(ym.slice(5))}月</th><td>${ds.map(dayChip).join(' ')}</td></tr>`).join('');
    return `<h3>${esc(x.r.name)}<span class="note">（${x.n}地点・${x.days.length}日、うち土日祝${rest}日）</span></h3>
${x.days.length ? `<div class="tw"><table class="prefsum cal-tbl"><tbody>${rows}</tbody></table></div>`
      : `<p class="note">この地方では、半数以上の観測点で同じ日に大きく引く日がありませんでした。地点ごとの日付は上の「地点を選ぶ」で確認できます。</p>`}`;
  }).join('\n');
}

function monthTable(sum, total) {
  const max = Math.max(...sum.months.map(([, c]) => c));
  const rows = sum.months.map(([ym, c]) => `<tr><th scope="row">${ym.slice(0, 4)}年${Number(ym.slice(5))}月</th>
<td class="rg">${c.toLocaleString('ja-JP')}</td><td class="cal-bar"><span style="width:${Math.round(c / max * 100)}%"></span></td></tr>`).join('');
  return `<div class="tw"><table class="prefsum">
  <thead><tr><th>月</th><th>延べ日数</th><th></th></tr></thead><tbody>${rows}</tbody>
</table></div>
<p class="note">全国${total}観測点の「明るいうちに大きく引く日」を月ごとに足した数。1地点で1日を1と数えます。</p>`;
}

// rows: [{ st, big }]  from/to: 'YYYY-MM-DD'
export function shiohigariCalendarPage({ rows, from, to }) {
  const title = '潮干狩りカレンダー';
  const description = `全国${rows.length}の観測点について、今後12か月のうち明るいうちに大きく潮が引く日を、気象庁の潮位表から一覧にしました。土日・祝日の印と、実測から見た「例年この時期は表より高め・低め」の注記つきです。`;
  const sum = calendarSummary(rows);
  const top = [...sum.months].sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([ym]) => `${Number(ym.slice(5))}月`);
  const restAll = rows.reduce((a, x) => a + x.big.days.filter(d => restOf(d.ymd)).length, 0);
  const all = rows.reduce((a, x) => a + x.big.days.length, 0);

  const body = `
<article>
  <header class="st-hd">
    <h1>${esc(title)}<span class="h1-sub">（全国・今後12か月）</span></h1>
    <p class="lede">明るいうちに大きく引く日を、地点ごとに一覧にしました</p>
  </header>
  <p>潮干狩りは、干潮の潮位が低い日ほど干潟が広く現れます。ただし大きく引く干潮が夜中に来る日もあるので、<b>日の出の1時間後から日の入りの1時間前までの干潮</b>だけを比べ、${ymdJa(from)}〜${ymdJa(to)}の期間で各地点の低いほう1割に入る日を「大きく引く日」としました。1地点あたりおよそ${Math.round(all / rows.length)}日です。</p>
  <p>全国${rows.length}観測点を合わせると、大きく引く日が多いのは${top.join('・')}です。延べ${all.toLocaleString('ja-JP')}日のうち土日・祝日は${restAll.toLocaleString('ja-JP')}日（${Math.round(restAll / all * 100)}%）でした。</p>
  ${section('地点を選ぶ', '', `<form class="tool-form" id="shc-tool" data-src="${attr(asset(CALENDAR_DATA))}" onsubmit="return false">
    <label>地方<select name="r"><option value="">すべて</option>${REGIONS.filter(r => sum.byRegion.some(x => x.r.id === r.id)).map(r =>
      `<option value="${attr(r.id)}">${esc(r.name)}</option>`).join('')}</select></label>
    <label>地点<select name="st"><option value="">選んでください</option>${stationOptions(rows.map(x => x.st), s => rows.findIndex(x => x.st === s))}</select></label>
    <label class="tool-check"><input type="checkbox" name="rest"> 土日・祝日だけ</label>
  </form>
  <div class="tool-result" id="shc-result" aria-live="polite"><p class="note">地点を選ぶと、その地点の大きく引く日を一覧にします。</p></div>
  <noscript><p class="note">地点ごとの一覧は JavaScript で表示します。下の地方ごとの一覧と、各地点ページの月間カレンダーもあわせてご覧ください。</p></noscript>`)}
  ${ad('graph')}
  ${section('地方ごとの大きく引く日', '', `<p>地方の観測点の半数以上で、同じ日に大きく引く日です。<span class="cal-d sat">土曜</span>と<span class="cal-d hol">日曜・祝日</span>に印を付けています。</p>
${regionTable(sum)}`)}
  ${section('月ごとの日数', '', monthTable(sum, rows.length))}
  <div class="prose">
    <h2>実測のずれの注記について</h2>
    <p>潮位表は予測で、実際の潮位は季節によって予測より高めや低めになります。全国の観測点の実測10年分では、夏から秋は高め、冬から春は低めの地点が多くなっています（<a href="${attr(paths.guide(ATARI_GUIDE.slug))}">潮見表はどれくらい当たる？</a>）。実測のある地点では、その月の平均のずれが3cm以上あるときに「例年この月は表より◯cm高め（低め）」と注記します。高めの月は、潮位表の数字ほどは引かないと考えてください。</p>
    <h2>出かける前に</h2>
    <ul>
      <li>観測点から離れた浜では、干潮の時刻が数十分ずれることがあります。当日の時刻は<a href="${attr(paths.activity('shiohigari'))}">潮干狩りの潮見表</a>から近い地点を選んで確認してください。</li>
      <li>貝の採取には漁業権や採ってよい量の決まりがあり、春から初夏は貝毒による自粛の呼びかけが出ることがあります。</li>
      <li>干潮の潮位が同じでも、干潟がどこまで出るかは浜によって違います。</li>
    </ul>
  </div>
  ${sources}
  <p class="more"><a href="${attr(paths.tool(DEPTH_SLUG))}">水深計算ツール</a></p>
  ${ad('footer')}
</article>`;
  return page({
    title: `${title}（全国・今後12か月）｜明るいうちに大きく引く日｜${SITE.NAME}`,
    description,
    canonical: abs.tool(CALENDAR_SLUG),
    trail: trail(title, CALENDAR_SLUG),
    ld: [appLd(title, description, CALENDAR_SLUG)],
  }, body);
}
