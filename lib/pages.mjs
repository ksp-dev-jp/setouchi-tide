// =====================================================================
// ページテンプレート
//
// title / description には必ずその地点・その日の実数値を入れる。
// 「広島の潮見表」だけのタイトルが760枚並ぶと互いに共食いするため、
// 満潮時刻・干潮時刻・干満差といった一意な数字で差をつける。
// =====================================================================

import { SITE, url, asset, absUrl } from '../config.mjs';
import { page, esc, attr, ad, pager, viewTabs, section } from './html.mjs';
import {
  tideGraph, extremeTable, flowBlock, tideGrid, sunMoon, weatherBlock,
  shioBadge, weekTable, monthCalendar, stationList, coords, nowBox, forecastLinks, activityModeBlock,
} from './components.mjs';
import { fmtHM, WD, pad2, weekdayColor, addDays, dayKeyOf } from './util.mjs';
import { paths, abs, pref, region, regionOf, prefStations, regionPrefs, regionStationCount, stationSlug, uniqueName } from './routes.mjs';
import { movingWindows } from './tide.mjs';
import { isCoastSupplement, stationLabel, stationMarkerClass, stationMarkerLabel, stationQuality } from './station-quality.mjs';
import { PREF_GUIDES } from './pref-guides.mjs';
import { REGION_GUIDES } from './region-guides.mjs';
import { springLowLabel, springLowRangeLabel } from './tide-profile.mjs';
import { EXPERIENCE_STATIONS, TSURIARUKI_GUIDE, CHANNEL_URL } from './guide-tsuriaruki.mjs';
import { GUIDES, guideBySlug } from './guides.mjs';

const SEP = '｜';

function trailFor(st, extra) {
  const p = pref(st.pref), r = regionOf(st);
  const t = [
    { name: '全国', href: paths.home(), abs: abs.home() },
    { name: r.name, href: paths.region(r), abs: abs.region(r) },
    { name: p.name, href: paths.pref(p), abs: abs.pref(p) },
    { name: stationLabel(st), href: paths.station(st), abs: abs.station(st) },
  ];
  if (extra) t.push(extra);
  return t;
}

// 「最近見た地点」用。app.js がページ読込時にこれを localStorage に積む。
function recentOf(st) {
  return { n: stationLabel(st), h: paths.station(st), p: pref(st.pref).name };
}

function mapStation(st, current = false) {
  return { n: stationLabel(st), la: st.lat, lo: st.lon, h: paths.station(st), m: stationMarkerClass(st), c: current ? 1 : 0 };
}

function srcNote(st) {
  if (!st.jmaAnchor) {
    // 表示名と験潮所名が違う地点(例: 下関 ⇔ 弟子待)は、どの観測点の値かを明示する。
    const gauge = st.jmaName && st.jmaName !== st.name
      ? `気象庁での験潮所名は<b>${esc(st.jmaName)}</b>です。` : '';
    return `<p class="src-note">この地点は気象庁の公式潮位観測点です。表示している潮位は気象庁の推算値そのものです。${gauge}</p>`;
  }
  const adj = (st.damp !== 1 || st.dz !== 0)
    ? `振幅 ${st.damp.toFixed(2)}倍・基準面 ${st.dz >= 0 ? '+' : ''}${st.dz}cm の補正を掛けています。`
    : `補正は掛けず、観測点の値をそのまま表示しています。`;
  const dist = st.jmaKm != null
    ? `（約${st.jmaKm < 1 ? '1km未満' : Math.round(st.jmaKm) + 'km'}）` : '';
  const coastSupplement = isCoastSupplement(st);
  const osm = st.id.startsWith('n') && !coastSupplement
    ? `地点の位置情報は<a href="https://www.openstreetmap.org/copyright" rel="noopener" target="_blank">OpenStreetMap</a>のデータを参照しています。` : '';
  const coast = coastSupplement
    ? '地点は沿岸形状から補完しています。港名を推測した地点ではありません。' : '';
  const quality = stationQuality(st);
  const qualityNote = quality === 'low'
    ? `参照点が遠い、または海域差が大きい可能性があるため、<b>△参考地点</b>として表示しています。現地の潮見表・海況と必ず併用してください。`
    : `既存の潮汐差・距離の安全基準を満たした<b>○精度確認済み近似地点</b>です。`;
  return `<p class="src-note">この地点には公式観測点がないため、最寄りの気象庁観測点<b>${esc(st.jmaName || st.jma)}</b>${dist}の推算値を参照しています。${adj}${qualityNote}${coast}${osm}</p>`;
}

// 気象庁「潮位観測情報」による実測との偏差(速報値)。st.deviationは
// build.mjsが該当観測点だけに一度だけ計算して載せている
// ({deviationCm, obsCm, astroCm, hh, mm} または未対応地点はnull)。
function deviationNote(st) {
  const dv = st.deviation;
  if (!dv) return '';
  const sign = dv.deviationCm > 0 ? '+' : '';
  const dir = dv.deviationCm > 0 ? '高く' : dv.deviationCm < 0 ? '低く' : '同じ高さで';
  const diff = dv.deviationCm === 0 ? '' : `<b>${sign}${dv.deviationCm}cm</b> `;
  return `<p class="dev-note">気象庁「潮位観測情報」によると、実測潮位は天文潮位より${diff}${dir}なっています（${pad2(dv.hh)}:${pad2(dv.mm)}時点・速報値）。</p>`;
}

// description には必ず県名を入れる（「広島県広島の…」）。
// uniqueName が同名対策で既に県名から始まる地点は重ねない。
function displayName(st) {
  return isCoastSupplement(st) ? stationLabel(st) : uniqueName(st);
}

function withPref(st) {
  const p = pref(st.pref), n = displayName(st);
  return n.startsWith(p.name) ? n : p.name + n;
}

// h1 直下に置く要約段落。検索結果・AI要約への引用を想定し、満潮/干潮の
// 時刻や潮回りなど description と同じ内容を、可視の本文として書く。
// 数値は data- 属性やテーブルのセルにしか無いと、静的HTMLしか読まない
// クローラや生成AIには実質「答えが書かれていない」ページに見えるため。
function lead(text) {
  return `<p class="lead">${text}</p>`;
}

// 当日ページは、判断に必要な潮汐と天気を最初に集約する。細かな数値や
// 根拠は消さずに開閉式へ入れ、必要なときだけ読み進められるようにする。
function disclosure(title, note, inner, open = false) {
  return `<details class="fold"${open ? ' open' : ''}>
  <summary><span class="fold-title">${esc(title)}</span>${note ? `<span class="fold-note">${esc(note)}</span>` : ''}</summary>
  <div class="fold-body">${inner}</div>
</details>`;
}

function flowText(ws) {
  if (!ws.length) return '';
  return `潮位が速く変化する時間帯は${ws.map(w => `${w.fromStr}〜${w.toStr}`).join('、')}です（当日の最大変化速度に対する目安）。`;
}

function extremeSummary(day) {
  const h = day.highs.map(e => fmtHM(e.time)).join('・');
  const l = day.lows.map(e => fmtHM(e.time)).join('・');
  return { h: h || '—', l: l || '—' };
}

// ---------------------------------------------------------------------
// 地点ハブの主役ブロック（PC = 左に地図・右に潮汐、スマホ = 潮汐が先）
//
// DOM は「潮汐(数字→グラフ) → 地図」の順に置き、PC でだけ CSS の order で
// 地図を左へ回す。スマホでスクロールして最初に出るべきなのは満潮・干潮の
// 数字とタイドグラフであって地図ではないため。読み上げと検索エンジンに
// 渡る順序もこちらが正しい。
//
// 地図に載せるのは自分と近隣地点。近隣はクリックでその地点へ飛べるので、
// 「近くの地点」リストと同じ内部リンクを地図側からも張ることになる。
// ---------------------------------------------------------------------
// dayNav: グラフの前日/翌日リンク。日別ページを作っていないときは
// 呼び出し側が null を渡す（存在しない URL へ張らないため）。
function splitBlock(st, day, cel, neighbors, dayMs, dayNav, ymd, fc, contextHtml = '') {
  const pts = [
    mapStation(st, true),
    ...neighbors.map(x => mapStation(x.st)),
  ];
  return `<section class="tide-dashboard">
  <div class="split-info">
    ${nowBox(day)}
    <div class="stats">
      <div><span class="k">最高（補間）</span><b>${day.max}<small>cm</small></b></div>
      <div><span class="k">最低（補間）</span><b>${day.min}<small>cm</small></b></div>
      <div><span class="k">干満差</span><b>${day.range}<small>cm</small></b></div>
    </div>
    ${tideGraph(day, cel, {
      current: `${new Date(dayMs).getUTCMonth() + 1}/${new Date(dayMs).getUTCDate()} ${WD[cel.wd]}`,
      prev: dayNav && dayNav.prev ? { href: dayNav.prev, label: '前日' } : null,
      next: dayNav && dayNav.next ? { href: dayNav.next, label: '翌日' } : null,
    })}
  </div>
  <aside class="tide-aside" aria-label="潮汐と天気の要点">
    <section class="tide-aside-block">
      <h2>潮汐の時刻</h2>
      ${extremeTable(day)}
    </section>
    ${contextHtml ? `<section class="tide-aside-block tide-context">${contextHtml}</section>` : ''}
    <section class="tide-aside-block">
      <h2>天気・海象</h2>
      ${weatherBlock(st, ymd, fc)}
    </section>
  </aside>
  <details class="map-details">
    <summary>周辺地点を地図で見る</summary>
    <div class="map" data-map data-fit-max="12" data-stations="${attr(JSON.stringify(pts))}"></div>
    <p class="note">濃い点がこの地点、薄い点が近くの地点です。点をクリックするとその地点の潮見表に移ります。</p>
  </details>
</section>`;
}

// ---------------------------------------------------------------------
// ヘッダーの釣果情報リンク（外部サイトへのリンクのみ。自前ではデータを持たない）
//
// X (旧Twitter) の検索APIは有料化されており、投稿の取得・埋め込みはできない。
// 代わりに検索結果ページへのディープリンクを置く。アングラーズは県単位の
// URLパターンが確認できている(/prefectures/{都道府県コード})一方、
// 地点名でのキーワード検索は完全一致しないことがあるため、
// 確実に内容のある県ページへのリンクにとどめる。
//
// 広島県のみ先行実装（config.mjs のような全県対応は都道府県コードの
// 対応表が要るため、需要を見てから広げる）。
// ---------------------------------------------------------------------
const ANGLERS_PREF_CODE = {
  hokkaido:1, aomori:2, iwate:3, miyagi:4, akita:5, yamagata:6, fukushima:7,
  ibaraki:8, chiba:12, tokyo:13, kanagawa:14, niigata:15, toyama:16, ishikawa:17,
  fukui:18, shizuoka:22, aichi:23, mie:24, kyoto:26, osaka:27, hyogo:28,
  okayama:33, hiroshima:34, yamaguchi:35, tokushima:36, kagawa:37, ehime:38,
  kochi:39, fukuoka:40, saga:41, nagasaki:42, kumamoto:43, oita:44, miyazaki:45,
  kagoshima:46, okinawa:47,
};

// X は地点名だけだと同名の港や一般語まで拾いやすい。広島県では、
// 実際に釣行先として一緒に語られやすい海域名を地域ごとに足す。
// 他県を展開するときも、この関数へ語群を追加すれば同じ導線を使える。
function fishingSearchFor(st) {
  // 各地点から最も近い二地点も検索語に加える。港名だけの検索より投稿を拾いやすく、
  // 県単位への展開でも個別の語群メンテナンスを必要としない。
  const coastSupplement = isCoastSupplement(st);
  const near = prefStations(st.pref)
    .filter(s => s.id !== st.id && !isCoastSupplement(s))
    .sort((a, b) => (a.lat - st.lat) ** 2 + (a.lon - st.lon) ** 2 - ((b.lat - st.lat) ** 2 + (b.lon - st.lon) ** 2))
    .slice(0, coastSupplement ? 3 : 2)
    .map(stationLabel);
  const terms = [...new Set(coastSupplement ? near : [stationLabel(st), ...near])];
  const query = `(${terms.map(t => `"${t}"`).join(' OR ')}) 釣 -filter:replies`;
  return { href: `https://x.com/search?q=${encodeURIComponent(query)}&f=live`, label: `Xで${terms.join('・')}周辺を検索` };
}

function fishingDestinations(st) {
  const anglersCode = ANGLERS_PREF_CODE[st.pref];
  return {
    anglersUrl: anglersCode ? `https://anglers.jp/prefectures/${anglersCode}` : '',
    search: fishingSearchFor(st),
  };
}

// 地点ページの「面している海」。県ページの手書きの海域区分と、同じ海域の
// 観測点の年間平均の干満差、この地点の大潮のころの干潮時刻を出す。
function seaBlock(st, sea) {
  if (!sea) return '';
  const p = pref(st.pref);
  const low = springLowLabel(sea.springLow);
  const mates = sea.mates.length
    ? `<p>同じ海域の観測点：${sea.mates.map(m => `<a href="${attr(paths.station(m.st))}">${esc(stationLabel(m.st))}</a>（平均${m.avg}cm）`).join('、')}</p>`
    : '';
  const exp = EXPERIENCE_STATIONS.get(st.name);
  const expNote = exp
    ? `<p class="note">運営者は${esc(exp[0])}の釣り場（${esc(exp[1])}）を歩いて水深を測っています。潮位で水深を補正したときの記録は<a href="${attr(paths.guide(TSURIARUKI_GUIDE.slug))}">釣り場の水深は潮で3m変わる</a>にまとめています。</p>`
    : '';
  return `<h3 class="sub">面している海</h3>
<div class="prose station-sea">
<p>${esc(stationLabel(st))}は、${esc(p.name)}の<b>${esc(sea.name)}</b>に面した観測点です。${sea.note}${low ? `この地点の大潮のころの干潮は<b>${esc(low)}</b>です。` : ''}</p>
${mates}
<p class="more"><a href="${attr(paths.pref(p))}">${esc(p.name)}の海域ごとの違い</a></p>
</div>
${expNote}`;
}

// 地点ページ共通のサイド/フッター部品
function relatedBlock(st, neighbors) {
  const p = pref(st.pref), r = regionOf(st);
  const others = prefStations(st.pref).filter(s => s.id !== st.id).slice(0, 40);
  return section('近くの地点', 'NEARBY', `
${stationList(neighbors.map(n => ({
    href: paths.station(n.st), name: stationLabel(n.st), kana: n.st.kana,
    official: !n.st.jmaAnchor, tier: stationMarkerClass(n.st), note: n.km < 1 ? '1km未満' : `約${Math.round(n.km)}km`,
  })), 'near')}
<h3 class="sub">${esc(p.name)}の他の地点</h3>
${stationList(others.map(s => ({
    href: paths.station(s), name: stationLabel(s), kana: s.kana, official: !s.jmaAnchor, tier: stationMarkerClass(s),
  })), 'cols')}
<p class="more"><a href="${attr(paths.pref(p))}">${esc(p.name)}の潮見表 一覧</a>　<a href="${attr(paths.region(r))}">${esc(r.name)}地方の一覧</a></p>`);
}

// ---------------------------------------------------------------------
// 地点ハブ（当日）
// ---------------------------------------------------------------------
export function stationPage(ctx) {
  const { st, day, cel, ymd, dayMs, weekRows, neighbors, fc, noindex, dayHref, dayNav, profile } = ctx;
  const p = pref(st.pref);
  const s = extremeSummary(day);
  const d = new Date(dayMs);
  const dateJa = `${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
  const fishing = fishingDestinations(st);
  const quickLinks = [
    { href: fishing.search.href, icon: 'x', label: 'X', title: `${fishing.search.label}（外部サイト）` },
    ...(fishing.anglersUrl ? [{
      href: fishing.anglersUrl, icon: 'hook', label: 'アングラーズ',
      title: `アングラーズで${p.name}の釣果を見る（外部サイト）`,
    }] : []),
  ];

  const title = `${displayName(st)}の潮見表・タイドグラフ${SEP}今日(${dateJa})の満潮 ${s.h}・干潮 ${s.l}${SEP}${SITE.NAME}`;
  const description = `${withPref(st)}の今日の潮汐。満潮 ${s.h}、干潮 ${s.l}、干満差 ${day.range}cm、${cel.shio}。`
    + `10分毎の潮位・潮がよく動く時間帯・日の出入・月齢を気象庁の公式推算値から掲載しています。`;

  const body = `
<article>
  <div class="station-control">
    <div class="station-identity">
      <header class="st-hd">
        <p class="st-eyebrow"><a href="${attr(paths.pref(p))}">${esc(p.name)}</a></p>
        <h1>${esc(stationLabel(st))}の潮見表</h1>
        ${st.kana ? `<p class="kana">${esc(st.kana)}</p>` : ''}
      </header>
      <div class="station-date">
        <span class="date">${d.getUTCFullYear()}年${dateJa}<span class="wd" style="color:${weekdayColor(cel.wd)}">（${WD[cel.wd]}）</span></span>
        <span class="station-place">● ${esc(p.name)} ${esc(stationLabel(st))}</span>
      </div>
    </div>
    ${viewTabs([
      { label: '今日', active: true },
      { label: '1週間', href: paths.week(st) },
      { label: '1か月', href: paths.month(st, ymd.slice(0, 7)) },
    ], forecastLinks(st, fc, quickLinks))}
  </div>

  ${splitBlock(st, day, cel, neighbors, dayMs, dayNav, ymd, fc, `
    <p class="station-meta">${coords(st)}<span class="badge ${stationMarkerClass(st)}">${stationMarkerLabel(st)}</span>
      <button type="button" class="fav-toggle" data-favorite-toggle aria-pressed="false"><img class="favorite-ic" data-favorite-icon src="${attr(asset('icons/woodblock/favoriteOutline.png'))}" data-off-src="${attr(asset('icons/woodblock/favoriteOutline.png'))}" data-on-src="${attr(asset('icons/woodblock/favorite.png'))}" width="18" height="18" alt="" aria-hidden="true" decoding="async"><span data-favorite-label>お気に入りに追加</span></button>${shioBadge(cel.shio)}
      ${dayHref ? `<a class="detail" href="${attr(dayHref)}">この日を詳しく</a>` : ''}</p>
    ${lead(`${dateJa}（${WD[cel.wd]}）の${withPref(st)}の潮汐は、満潮が${s.h}、干潮が${s.l}です。`
      + `<a href="${attr(paths.guide('oshio-koshio'))}">潮回り</a>は${cel.shio}、干満差は${day.range}cmです。${flowText(movingWindows(day.levels))}`)}
  `)}

  ${disclosure('用途別モード', '釣り・潮干狩り・サーフ・調査・航海',
    activityModeBlock(st, day, cel, fc, true))}

  ${disclosure('気象・海象の詳細', '予報文・更新時刻', section('気象・海象', 'WEATHER & SEA', weatherBlock(st, ymd, fc)))}

  ${disclosure('潮がよく動く時間帯', '10分値から算出した客観指標',
    section('潮がよく動く時間帯', 'TIDE HEIGHT CHANGE', flowBlock(day),
      `<a class="blk-more" href="${attr(paths.guide('ugoku-jikantai'))}">この指標について</a>`))}
  ${disclosure('10分毎の潮位', '全144時点・cm',
    section('10分毎の潮位', 'TIDE HEIGHTS · 10-MIN · CM', tideGrid(day),
      `<a class="blk-more" href="${attr(paths.guide('mikata'))}">数値の読み方</a>`))}
  ${disclosure('日の出入・月', '太陽と月齢',
    section('日の出入・月', 'SUN & MOON', sunMoon(cel),
      `<a class="blk-more" href="${attr(paths.guide('jikoku-mainichi-kawaru'))}">時刻が毎日変わる理由</a>`))}
  ${disclosure('先一週間の潮汐', '潮汐＋一週間の天気',
    section('これからの7日間', '7-DAY', weekTable(weekRows)
      + `<p class="more"><a href="${attr(paths.week(st))}">週間潮見表をひらく</a>　<a href="${attr(paths.month(st, ymd.slice(0, 7)))}">${ymd.slice(0, 4)}年${Number(ymd.slice(5, 7))}月のカレンダー</a></p>`))}

  ${profile ? section('この地点の潮の特徴', '',
    `<p class="station-profile-summary">${profile.summary}</p>`
    + profile.chart
    + seaBlock(st, profile.sea)
    + disclosure('年間集計の詳細', `${profile.year}年の推算値から集計`, profile.html)) : ''}

  ${disclosure('周辺地点・出典', '近くの地点とデータについて', relatedBlock(st, neighbors) + deviationNote(st) + srcNote(st))}
  ${ad('header')}
  ${ad('graph')}
  ${ad('footer')}
</article>`;

  return page({
    title, description,
    canonical: abs.station(st),
    bodyClass: 'station-page',
    headerArt: p.id === 'okinawa' ? 'okinawa' : p.region,
    fileBase: `${stationLabel(st)}_${ymd}`,
    trail: trailFor(st),
    recentStation: recentOf(st),
    ld: [stationLd(st, day, cel, ymd, ymd)],
    head: leafletHead(),
    scripts: leafletScripts(),
    noindex,
  }, body);
}

// ---------------------------------------------------------------------
// 日別ページ
//
// 地図は載せない。地点ハブと同じものを日別15ページぶん置くと Leaflet を
// 8千ページに配ることになり、内容の追加ぶんに見合わない。場所を知りたい
// ときは同じ地点のハブへ1クリックで戻れる。
// ---------------------------------------------------------------------
export function dayPage(ctx) {
  const { st, day, cel, ymd, dayMs, prev, next, isToday, monthDays, fc, dateModified, noindex } = ctx;
  const p = pref(st.pref);
  const s = extremeSummary(day);
  const d = new Date(dayMs);
  const Y = d.getUTCFullYear(), M = d.getUTCMonth() + 1, D = d.getUTCDate();
  const dateJa = `${Y}年${M}月${D}日`;
  const ws = movingWindows(day.levels);

  const title = `${displayName(st)}の潮見表 ${dateJa}(${WD[cel.wd]})${SEP}満潮 ${s.h} 干潮 ${s.l}${SEP}${SITE.NAME}`;
  const description = `${withPref(st)}の${dateJa}の潮汐。満潮 ${s.h}、干潮 ${s.l}、干満差 ${day.range}cm、${cel.shio}、月齢 ${cel.age.toFixed(1)}。`
    + (ws.length ? `潮がよく動くのは ${ws.map(w => w.fromStr + '〜' + w.toStr).join('、')}。` : '')
    + `10分毎の潮位を気象庁の公式推算値から掲載。`;

  const body = `
<article>
  <header class="st-hd">
    <p class="st-eyebrow"><a href="${attr(paths.pref(p))}">${esc(p.name)}</a>　<a href="${attr(paths.station(st))}">${esc(stationLabel(st))}</a></p>
    <h1>${esc(stationLabel(st))}の潮見表　${dateJa}<span class="wd" style="color:${weekdayColor(cel.wd)}">（${WD[cel.wd]}）</span></h1>
    <p class="meta">${shioBadge(cel.shio)}${isToday ? '<span class="badge today">今日</span>' : ''}<span class="badge ${stationMarkerClass(st)}">${stationMarkerLabel(st)}</span></p>
  </header>

  ${lead(`${dateJa}（${WD[cel.wd]}）の${withPref(st)}の潮汐は、満潮が${s.h}、干潮が${s.l}です。`
    + `<a href="${attr(paths.guide('oshio-koshio'))}">潮回り</a>は${cel.shio}、干満差は${day.range}cm、月齢は${cel.age.toFixed(1)}です。${flowText(ws)}`)}

  ${viewTabs([
    { label: '1日', active: true },
    { label: '1週間', href: paths.week(st) },
    { label: '1か月', href: paths.month(st, ymd.slice(0, 7)) },
  ], forecastLinks(st, fc))}

  ${pager(
    prev ? { href: prev.href, label: '‹ ' + prev.label } : null,
    `${M}/${D}`,
    next ? { href: next.href, label: next.label + ' ›' } : null,
  )}

  ${isToday ? nowBox(day) : ''}

  <div class="stats">
    <div><span class="k">最高（補間）</span><b>${day.max}<small>cm</small></b></div>
    <div><span class="k">最低（補間）</span><b>${day.min}<small>cm</small></b></div>
    <div><span class="k">干満差</span><b>${day.range}<small>cm</small></b></div>
    <div><span class="k">月齢</span><b>${cel.age.toFixed(1)}</b></div>
  </div>

  ${tideGraph(day, cel, {
    current: `${M}/${D} ${WD[cel.wd]}`,
    prev: prev ? { href: prev.href, label: '前日' } : null,
    next: next ? { href: next.href, label: '翌日' } : null,
  })}
  ${extremeTable(day)}
  ${disclosure('用途別モード', '釣り・潮干狩り・サーフ・調査・航海',
    activityModeBlock(st, day, cel, fc, isToday))}
  ${ad('header')}

  ${section('潮がよく動く時間帯', 'TIDE HEIGHT CHANGE', flowBlock(day),
    `<a class="blk-more" href="${attr(paths.guide('ugoku-jikantai'))}">この指標について</a>`)}
  ${section('10分毎の潮位', 'TIDE HEIGHTS · 10-MIN · CM', tideGrid(day),
    `<a class="blk-more" href="${attr(paths.guide('mikata'))}">数値の読み方</a>`)}
  ${ad('graph')}
  ${section('日の出入・月', 'SUN & MOON', sunMoon(cel),
    `<a class="blk-more" href="${attr(paths.guide('jikoku-mainichi-kawaru'))}">時刻が毎日変わる理由</a>`)}
  ${section('気象・海象', 'WEATHER & SEA', weatherBlock(st, ymd, fc))}

  ${section(`${Y}年${M}月の他の日`, 'THIS MONTH', `<ul class="daylinks">${monthDays.map(m =>
    m.href
      ? `<li${m.ymd === ymd ? ' class="on"' : ''}><a href="${attr(m.href)}">${m.d}</a></li>`
      : `<li class="off"><span>${m.d}</span></li>`).join('')}</ul>
    <p class="more"><a href="${attr(paths.month(st, ymd.slice(0, 7)))}">${Y}年${M}月のカレンダーを見る</a>
    <span class="note-inline">灰色の日は個別ページを用意していません。カレンダーで満潮・干潮を確認できます。</span></p>`)}

  ${srcNote(st)}
  <p class="more"><a href="${attr(paths.station(st))}">${esc(stationLabel(st))}の潮見表トップへ</a></p>
  ${ad('footer')}
</article>`;

  return page({
    title, description,
    // 今日の日付ページは地点ハブと内容が重なるので、常設URLである
    // ハブ側に集約する。過去日・未来日は自分自身を正とする。
    canonical: isToday ? abs.station(st) : abs.day(st, ymd),
    fileBase: `${stationLabel(st)}_${ymd}`,
    headerArt: p.id === 'okinawa' ? 'okinawa' : p.region,
    trail: trailFor(st, { name: `${M}月${D}日`, href: paths.day(st, ymd), abs: abs.day(st, ymd) }),
    recentStation: recentOf(st),
    ld: [stationLd(st, day, cel, ymd, dateModified)],
    noindex,
  }, body);
}

// ---------------------------------------------------------------------
// 週間ページ
// ---------------------------------------------------------------------
export function weekPage(ctx) {
  const { st, rows, ymd, noindex } = ctx;
  const p = pref(st.pref);
  const first = rows[0], last = rows[rows.length - 1];
  const fd = new Date(first.dayMs), ld = new Date(last.dayMs);
  const span = `${fd.getUTCMonth() + 1}月${fd.getUTCDate()}日〜${ld.getUTCMonth() + 1}月${ld.getUTCDate()}日`;
  const shios = [...new Set(rows.map(r => r.cel.shio))].join('・');
  const withRange = rows.filter(r => r.day);
  const maxRow = withRange.reduce((a, b) => (!a || b.day.range > a.day.range ? b : a), null);
  const maxRowJa = maxRow ? `${new Date(maxRow.dayMs).getUTCMonth() + 1}月${new Date(maxRow.dayMs).getUTCDate()}日` : '';

  const title = `${displayName(st)}の週間潮見表${SEP}${span}の満潮・干潮時刻${SEP}${SITE.NAME}`;
  const description = `${withPref(st)}の${span}の潮汐一覧。${shios}。各日の満潮・干潮の時刻と潮位、月齢を気象庁の公式推算値から掲載しています。`;

  const body = `
<article>
  <header class="st-hd">
    <p class="st-eyebrow"><a href="${attr(paths.pref(p))}">${esc(p.name)}</a>　<a href="${attr(paths.station(st))}">${esc(stationLabel(st))}</a></p>
    <h1>${esc(stationLabel(st))}の週間潮見表</h1>
    <p class="meta">${esc(span)}</p>
  </header>

  ${lead(`${span}の${withPref(st)}の潮汐は${shios}です。`
    + (maxRow ? `この期間で干満差が最も大きいのは${maxRowJa}で、${maxRow.day.range}cmです。` : ''))}

  ${viewTabs([
    { label: '今日', href: paths.station(st) },
    { label: '1週間', active: true },
    { label: '1か月', href: paths.month(st, ymd.slice(0, 7)) },
  ], forecastLinks(st, rows.map(r => r.fc).find(Boolean) || null))}
  ${weekTable(rows, true)}
  ${ad('header')}
  <p class="more">日付をクリックすると、その日の10分毎の潮位とタイドグラフが開きます。「潮がよく動く時間帯」は<a href="${attr(paths.guide('ugoku-jikantai'))}">この指標について</a>で解説しています。</p>
  ${srcNote(st)}
  ${ad('footer')}
</article>`;

  return page({
    title, description,
    canonical: abs.week(st),
    fileBase: `${stationLabel(st)}_週間`,
    headerArt: p.id === 'okinawa' ? 'okinawa' : p.region,
    trail: trailFor(st, { name: '週間', href: paths.week(st), abs: abs.week(st) }),
    recentStation: recentOf(st),
    noindex,
  }, body);
}

// ---------------------------------------------------------------------
// 月間ページ
// ---------------------------------------------------------------------
export function monthPage(ctx) {
  const { st, ym, cells, prev, next, months, stats, fc, noindex } = ctx;
  const p = pref(st.pref);
  const [Y, M] = ym.split('-').map(Number);

  const title = `${displayName(st)}の潮見表 ${Y}年${M}月${SEP}1か月の満潮・干潮カレンダー${SEP}${SITE.NAME}`;
  const description = `${withPref(st)}の${Y}年${M}月の潮汐カレンダー。大潮は${stats.ohshio}日、`
    + `月内の最大干満差は${stats.maxRange}cm（${stats.maxRangeDay}日）。各日の満潮・干潮の時刻と潮位を気象庁の公式推算値から掲載しています。`;

  const body = `
<article>
  <header class="st-hd">
    <p class="st-eyebrow"><a href="${attr(paths.pref(p))}">${esc(p.name)}</a>　<a href="${attr(paths.station(st))}">${esc(stationLabel(st))}</a></p>
    <h1>${esc(stationLabel(st))}の潮見表　${Y}年${M}月</h1>
  </header>

  ${lead(`${Y}年${M}月の${withPref(st)}の潮汐は、大潮が${stats.ohshio}日あります。`
    + `月内で最も干満差が大きいのは${stats.maxRangeDay}日で、${stats.maxRange}cmです。`)}

  ${viewTabs([
    { label: '今日', href: paths.station(st) },
    { label: '1週間', href: paths.week(st) },
    { label: '1か月', active: true },
  ], forecastLinks(st, fc))}
  <nav class="month-strip" aria-label="月を選択">${months.map(m => m.active
    ? `<span class="month-chip on"><small>${m.year}年</small>${m.month}月</span>`
    : `<a class="month-chip" href="${attr(m.href)}"><small>${m.year}年</small>${m.month}月</a>`).join('')}</nav>
  ${pager(
    prev ? { href: prev.href, label: '‹ ' + prev.label } : null,
    `${Y}年${M}月`,
    next ? { href: next.href, label: next.label + ' ›' } : null,
  )}
  ${monthCalendar(cells)}
  <p class="note">上向きの青いアイコン＝満潮、下向きの茶色いアイコン＝干潮。数値は潮位(cm)。日付をクリックするとその日の10分毎の潮位が開きます。</p>
  ${ad('header')}
  ${srcNote(st)}
  ${ad('footer')}
</article>`;

  return page({
    title, description,
    canonical: abs.month(st, ym),
    fileBase: `${stationLabel(st)}_${ym}`,
    headerArt: p.id === 'okinawa' ? 'okinawa' : p.region,
    trail: trailFor(st, { name: `${Y}年${M}月`, href: paths.month(st, ym), abs: abs.month(st, ym) }),
    recentStation: recentOf(st),
    noindex,
  }, body);
}

// 都道府県ページの潮汐の解説。文章は lib/pref-guides.mjs の手書き、
// 表の数値は毎ビルド気象庁の潮位表から集計した観測点ごとの年間値。
// 観測点は海域ごとにまとめて並べ、同じ県の中の海の違いを見せる。
function prefGuideSection(p, guide, stats) {
  if (!guide) return '';
  const byName = new Map(stats.map(x => [x.st.name, x]));
  const groups = guide.coasts.map(c => ({ ...c, rows: c.stations.map(n => byName.get(n)).filter(Boolean) }))
    .filter(c => c.rows.length);
  // 干潮時刻は2つを改行で並べる(スマホの幅で1行に収まらないため)。
  const lowCell = sp => (springLowLabel(sp.springLow) || '日によって変わる').split('・').map(esc).join('<br>');
  const cell = sp => sp ? `<td>${sp.avg} cm</td><td>${sp.spring} cm</td><td>${lowCell(sp)}</td>`
    : '<td>—</td><td>—</td><td>—</td>';
  return section(`${p.name}の潮汐`, 'TIDE PROFILE', `
    <div class="prose">${guide.intro.map(t => `<p>${t}</p>`).join('\n')}</div>
    <h3 class="sub">海域ごとの違い</h3>
    <div class="prose">${groups.map(c => `<p><b>${esc(c.name)}</b>（${c.rows.map(x => esc(stationLabel(x.st))).join('・')}）　${c.note}</p>`).join('\n')}</div>
    <div class="tw"><table class="prefsum coastsum">
      <thead><tr><th>観測点</th><th>平均の干満差</th><th>大潮のころ</th><th>大潮のころの干潮</th></tr></thead>
      ${groups.map(c => `<tbody>
        <tr class="grp"><th colspan="4" scope="rowgroup">${esc(c.name)}</th></tr>
        ${c.rows.map(x => `<tr><th scope="row"><a href="${attr(paths.station(x.st))}">${esc(stationLabel(x.st))}</a></th>${cell(x.sp)}</tr>`).join('')}
      </tbody>`).join('')}
    </table></div>
    <p class="note">気象庁 ${stats[0]?.year ?? ''}年 潮位表の推算値（365日分）から観測点ごとに集計しています。「大潮のころ」は干満差が年間の上位1割の日の平均、「大潮のころの干潮」はその日の干潮時刻の平均です。</p>
    <h3 class="sub">${esc(p.name)}で潮見表を見るときのポイント</h3>
    <div class="prose"><ul>${guide.tips.map(t => `<li>${t}</li>`).join('')}</ul></div>`);
}

// 地方ページの潮汐の解説。県境をまたいだ海の単位で観測点をまとめ、
// 海ごとに干満差・満潮1日1回の日の割合・大潮の干潮時刻の幅を並べる。
// 文章は lib/region-guides.mjs の手書き、表の数値は毎ビルドの集計。
function regionGuideSection(r, guide, stats) {
  if (!guide) return '';
  const byName = new Map(stats.map(x => [x.st.name, x]));
  const seas = guide.seas.map(s => ({ ...s, rows: s.stations.map(n => byName.get(n)).filter(x => x?.sp) }))
    .filter(s => s.rows.length);
  const span = (rows, f, unit) => {
    const v = rows.map(f);
    const lo = Math.min(...v), hi = Math.max(...v);
    return lo === hi ? `${lo}${unit}` : `${lo}〜${hi}${unit}`;
  };
  // 幅の狭い画面で折り返さないよう「ごろ」を省き、注記で目安だと断る。
  const lowCell = rows => (springLowRangeLabel(rows.map(x => x.sp.springLow)) || '一定しない')
    .replace(/ごろ/g, '').split('・').map(esc).join('<br>');
  return section(`${r.name}地方の潮汐`, 'TIDE PROFILE', `
    <div class="prose">${guide.intro.map(t => `<p>${t}</p>`).join('\n')}</div>
    <h3 class="sub">海ごとの違い</h3>
    <div class="prose">${seas.map(s => `<p><b>${esc(s.name)}</b>（${s.rows.map(x => `<a href="${attr(paths.station(x.st))}">${esc(stationLabel(x.st))}</a>`).join('・')}）　${s.note}</p>`).join('\n')}</div>
    <div class="tw"><table class="prefsum coastsum seasum">
      <thead><tr><th>海域</th><th>平均の干満差 <small>cm</small></th><th>満潮1日1回の日</th><th>大潮のころの干潮</th></tr></thead>
      <tbody>${seas.map(s => `<tr>
        <th scope="row">${esc(s.name)}<br><small>${s.rows.length}地点</small></th>
        <td>${span(s.rows, x => x.sp.avg, '')}</td>
        <td>${span(s.rows, x => x.sp.diurnalPct, '%')}</td>
        <td>${lowCell(s.rows)}</td>
      </tr>`).join('')}</tbody>
    </table></div>
    <p class="note">気象庁 ${stats[0]?.year ?? ''}年 潮位表の推算値（365日分）から観測点ごとに集計し、海域内の最小〜最大を示しています。「大潮のころの干潮」は干満差が年間の上位1割の日の干潮時刻で、30分単位のおおよその時刻です。</p>
    <h3 class="sub">${esc(r.name)}地方で潮見表を見るときのポイント</h3>
    <div class="prose"><ul>${guide.tips.map(t => `<li>${t}</li>`).join('')}</ul></div>`);
}

// 地方ページの県別比較。同じ地方でも面する海で干満差が変わることを、
// 数字を並べて見せる。
function prefCompareTable(list) {
  if (!list || list.length < 2) return '';
  const rows = [...list].sort((a, b) => b.pf.avg - a.pf.avg);
  return `<div class="tw"><table class="prefsum">
    <thead><tr><th>都道府県</th><th>地点</th><th>平均の干満差</th><th>年間最大</th><th>満潮1回の日</th></tr></thead>
    <tbody>${rows.map(x => `<tr>
      <th scope="row"><a href="${attr(paths.pref(x.p))}">${esc(x.p.name)}</a></th>
      <td>${x.pf.n}</td><td>${x.pf.avg} cm</td><td>${x.pf.max} cm</td><td>${x.pf.diurnalPct}%</td>
    </tr>`).join('')}</tbody>
  </table></div>
  <p class="note">平均の干満差が大きい順。同じ地方でも、面している海によってこれだけ変わります。</p>`;
}

// 地図の凡例。配信している地点の種類が変わると凡例も変わる。
const MARK_NOTE = SITE.LEAN
  ? '掲載しているのはすべて気象庁の公式観測点（●基準点）です。'
  : '●は気象庁の基準点、○は精度確認済みの近似地点、△は参照点が遠い参考地点です。';

// 地点の内訳表示。配信対象を公式観測点だけに絞っているあいだ(SITE.LEAN)は
// ○△が0件になるので、「○近似地点 0 / △参考地点 0」と書かずに省く。
function qualityBreakdown(official, approx, low) {
  const parts = [`●基準点 ${official}`];
  if (approx) parts.push(`○近似地点 ${approx}`);
  if (low) parts.push(`△参考地点 ${low}`);
  return parts.join(' / ');
}

// ---------------------------------------------------------------------
// 都道府県ページ
// ---------------------------------------------------------------------
export function prefPage(ctx) {
  const { p, r, rows, ymd, dateJa, profile, stationStats = [] } = ctx;
  const official = rows.filter(x => !x.st.jmaAnchor).length;
  const low = rows.filter(x => stationQuality(x.st) === 'low').length;
  const accurateApprox = rows.length - official - low;

  const title = `${p.name}の潮見表・タイドグラフ${SEP}${rows.length}地点の満潮・干潮時刻${SEP}${SITE.NAME}`;
  const description = `${p.name}沿岸${rows.length}地点（公式観測点${official}）の潮汐。${dateJa}の各地点の満潮・干潮時刻と干満差を一覧で掲載。`
    + (profile ? `${p.name}の干満差は平均${profile.avg}cm、年間最大${profile.max}cm。` : '')
    + `気象庁の公式推算値による10分毎の潮位、潮がよく動く時間帯も地点ごとに見られます。`;

  const body = `
<article>
  <header class="st-hd">
    <p class="st-eyebrow"><a href="${attr(paths.region(r))}">${esc(r.name)}地方</a></p>
    <h1>${esc(p.name)}の潮見表・タイドグラフ</h1>
    <p class="meta">${rows.length}地点（${qualityBreakdown(official, accurateApprox, low)}）</p>
  </header>

  ${lead(`${dateJa}の${p.name}沿岸${rows.length}地点の潮見表です。`
    + (accurateApprox || low
      ? `●基準点${official}地点、○精度確認済み近似地点${accurateApprox}地点、△参考地点${low}地点を掲載しています。`
      : `すべて気象庁の公式観測点（●基準点）です。`))}

  <div class="split pin">
    <div class="split-info">
      ${section(`${dateJa}の${p.name}沿岸`, 'TODAY', `
      <div class="tw"><table class="prefsum">
        <thead><tr><th>地点</th><th>潮名</th><th>満潮 <small>cm</small></th><th>干潮 <small>cm</small></th><th>干満差</th></tr></thead>
        <tbody>${rows.map(x => `<tr>
          <th scope="row"><a href="${attr(paths.station(x.st))}"><span class="dot ${stationMarkerClass(x.st)}"></span>${esc(stationLabel(x.st))}</a></th>
          <td>${shioBadge(x.cel.shio)}</td>
          <td class="hi">${x.day ? x.day.highs.map(e => fmtHM(e.time) + ' <small>' + Math.round(e.level) + '</small>').join('<br>') : '—'}</td>
          <td class="lo">${x.day ? x.day.lows.map(e => fmtHM(e.time) + ' <small>' + Math.round(e.level) + '</small>').join('<br>') : '—'}</td>
          <td class="rg">${x.day ? x.day.range + '<small>cm</small>' : '—'}</td>
        </tr>`).join('')}</tbody>
      </table></div>`)}
    </div>
    <div class="split-map">
      ${section('地図から選ぶ', 'MAP', `<div class="map" data-map data-stations="${attr(JSON.stringify(rows.map(x => ({
        ...mapStation(x.st),
      }))))}"></div>
      <p class="note">点をクリックするとその地点の潮見表に移ります。${MARK_NOTE}</p>`)}
    </div>
  </div>
  ${ad('header')}
  ${prefGuideSection(p, PREF_GUIDES[p.id], stationStats)}
  <p class="more"><a href="${attr(paths.region(r))}">${esc(r.name)}地方の他の県</a>　<a href="${attr(paths.home())}">全国の一覧</a></p>
  ${ad('footer')}
</article>`;

  return page({
    title, description,
    canonical: abs.pref(p),
    fileBase: `${p.name}_${ymd}`,
    headerArt: p.id === 'okinawa' ? 'okinawa' : p.region,
    trail: [
      { name: '全国', href: paths.home(), abs: abs.home() },
      { name: r.name, href: paths.region(r), abs: abs.region(r) },
      { name: p.name, href: paths.pref(p), abs: abs.pref(p) },
    ],
    head: leafletHead(),
    scripts: leafletScripts(),
  }, body);
}

// ---------------------------------------------------------------------
// 地方ページ
// ---------------------------------------------------------------------
export function regionPage(ctx) {
  const { r, prefs, count, allStations, profile, prefProfiles, stationStats = [] } = ctx;
  const title = `${r.name}地方の潮見表・タイドグラフ${SEP}${count}地点${SEP}${SITE.NAME}`;
  const description = `${r.name}地方沿岸${count}地点の潮見表。${prefs.map(p => p.name).join('・')}の満潮・干潮時刻、`
    + (profile ? `地方全体の干満差は平均${profile.avg}cm、年間最大${profile.max}cm。` : '')
    + `10分毎の潮位、タイドグラフを気象庁の公式推算値から掲載しています。`;

  const body = `
<article>
  <header class="st-hd">
    <h1>${esc(r.name)}地方の潮見表・タイドグラフ</h1>
    <p class="meta">${count}地点</p>
  </header>
  ${prefs.map(p => section(p.name, '', stationList(
    prefStations(p.id).map(s => ({ href: paths.station(s), name: stationLabel(s), kana: s.kana, official: !s.jmaAnchor, tier: stationMarkerClass(s) })), 'cols'),
    `<a class="blk-more" href="${attr(paths.pref(p))}">${esc(p.name)}の一覧</a>`)).join('')}
  ${ad('graph')}
  ${section('地図から選ぶ', 'MAP', `<div class="map" data-map data-stations="${attr(JSON.stringify(allStations.map(s => ({
    ...mapStation(s),
  }))))}"></div>`)}
  ${regionGuideSection(r, REGION_GUIDES[r.id], stationStats)}
  ${prefProfiles && prefProfiles.length > 1
    ? section('県ごとの干満差', 'BY PREFECTURE', prefCompareTable(prefProfiles))
    : ''}
  <p class="more"><a href="${attr(paths.home())}">全国の一覧へ</a></p>
  ${ad('footer')}
</article>`;

  return page({
    title, description,
    canonical: abs.region(r),
    headerArt: r.id,
    trail: [
      { name: '全国', href: paths.home(), abs: abs.home() },
      { name: r.name, href: paths.region(r), abs: abs.region(r) },
    ],
    head: leafletHead(),
    scripts: leafletScripts(),
  }, body);
}

// ---------------------------------------------------------------------
// トップ
// ---------------------------------------------------------------------

// トップから直接たどれるようにするガイド。全件はガイド一覧へ。
const HOME_GUIDES = ['ugoku-jikantai', 'mikata', 'oshio-koshio', 'kisetsu-kanchou', 'kanmansa-chiikisa', 'umibe-anzen'];

// 全国の観測点を1年分集計した傾向。地方・県ページの解説と同じ数値の全国版。
// national: build.mjs の { year, pf, regions }。rangeRank: 平均の干満差の上位・下位の観測点。
function nationalTrendSection(national, rangeRank) {
  if (!national?.pf) return '';
  const { year, pf, regions } = national;
  const stRow = x => `<li><a href="${attr(paths.station(x.st))}">${esc(stationLabel(x.st))}</a>（${esc(pref(x.st.pref).name)}）${x.avg} cm</li>`;
  const ranks = rangeRank ? `<div class="rank-pair">
    <div><h3>干満差が大きい観測点</h3><ol>${rangeRank.top.map(stRow).join('')}</ol></div>
    <div><h3>干満差が小さい観測点</h3><ol>${rangeRank.bottom.map(stRow).join('')}</ol></div>
  </div>` : '';
  const rows = [...(regions || [])].sort((a, b) => b.pf.avg - a.pf.avg);
  const table = rows.length > 1 ? `<div class="tw"><table class="prefsum">
    <thead><tr><th>地方</th><th>地点</th><th>平均の干満差</th><th>年間最大</th><th>満潮1回の日</th></tr></thead>
    <tbody>${rows.map(x => `<tr>
      <th scope="row"><a href="${attr(paths.region(x.r))}">${esc(x.r.name)}</a></th>
      <td>${x.pf.n}</td><td>${x.pf.avg} cm</td><td>${x.pf.max} cm</td><td>${x.pf.diurnalPct}%</td>
    </tr>`).join('')}</tbody>
  </table></div>` : '';
  return section(`全国の潮の傾向（${year}年）`, 'TRENDS', `<div class="prose">
    <p>気象庁の${year}年の潮位表から、全国${pf.n}か所の観測点の1年分の推算値を当サイトで集計しました。1日の干満差は全国平均で<b>${pf.avg} cm</b>、大潮のころで${pf.spring} cm、小潮のころで${pf.neap} cmです。1年のうちで最も大きい日の干満差を観測点ごとに比べると、${esc(pf.maxStation)}の${pf.max} cmから${esc(pf.minStation)}の${pf.min} cmまで開きがあり、同じ日本の海でも潮の大きさは場所によって大きく違います。</p>
    ${ranks}
  </div>
  ${table}
  <p class="note">平均の干満差は、その日の満潮の最高と干潮の最低の差を1年分平均した値です。「満潮1回の日」は満潮が1日1回以下の日の割合で、干満差の小さい北海道や日本海側で高くなる傾向があります。地域差の理由は<a href="${attr(paths.guide('kanmansa-chiikisa'))}">干満差は地域でこんなに違う</a>で解説しています。</p>`);
}

export function homePage(ctx) {
  const { regions, total, official, allStations, dateJa, activities, national, rangeRank } = ctx;
  const low = allStations.filter(s => stationQuality(s) === 'low').length;
  const accurateApprox = total - official - low;
  const title = `${SITE.NAME}${SEP}気象庁公式データによる全国${total}地点の潮見表・タイドグラフ`;
  const description = `全国${total}地点（気象庁公式観測点${official}）の潮見表・タイドグラフ。`
    + `満潮・干潮の時刻と潮位、10分毎の潮位、潮がよく動く時間帯、日の出入・月齢を無料で掲載。${dateJa}現在。`;

  const body = `
<article>
  <header class="home-hd">
    <h1>全国の潮見表・タイドグラフ</h1>
    <p class="meta">全${total}地点（${qualityBreakdown(official, accurateApprox, low)}）</p>
    <form class="home-search" data-home-search role="search">
      <label for="home-station-search">地点を検索</label>
      <div class="home-search-row">
        <input id="home-station-search" type="search" data-home-search-input placeholder="地点名・都道府県名（例: 広島、宮島）" autocomplete="off">
        <button type="submit">検索</button>
      </div>
      <button type="button" class="home-locate" data-home-locate>現在地に近い地点を探す</button>
      <p class="home-locate-status" data-home-locate-status role="status"></p>
    </form>
    <section class="home-saved" data-home-saved hidden aria-label="よく見る地点"></section>
  </header>
  <div id="areas"></div>
  <div class="split wide-map">
    <div class="split-info">
      ${section('地方から選ぶ', 'AREAS', `<ul class="regions">${regions.map(r =>
        `<li><a href="${attr(paths.region(r.r))}"><span class="rn">${esc(r.r.name)}</span><span class="rc">${r.count}地点</span></a></li>`).join('')}</ul>`)}
    </div>
    <div class="split-map">
      ${section('地図から選ぶ', 'MAP', `<div class="map tall" data-map data-fit="japan" data-stations="${attr(JSON.stringify(allStations.map(s => ({
        ...mapStation(s),
      }))))}"></div>
      <p class="note">全${total}地点。${MARK_NOTE}</p>`)}
    </div>
  </div>
  ${ad('header')}
  ${section('特徴', 'FEATURES', `<ul class="feat">
    <li><b>潮がよく動く時間帯</b>は当サイト独自の指標です。10分毎の潮位から変化速度(cm/h)を求め、その日・その地点で潮位が速く変化する区間を抜き出しています。海水の流速を示すものではありません（<a href="${attr(paths.guide('ugoku-jikantai'))}">算出方法</a>）。</li>
    <li><b>この地点の潮の特徴</b>として、観測点ごとに1年分の推算値を集計し、大潮・小潮のころの干満差、全国での順位、日中に最も潮が引く月、近くの観測点との満潮時刻のずれを解説しています。</li>
    <li><b>10分毎の潮位</b>は毎時値を三次スプラインで補間し、1日144点を表とグラフで読めるようにしています。表はコピー・CSVで書き出せます。</li>
    <li>元データは<b>気象庁 潮位表の推算値</b>です。${SITE.LEAN ? '掲載しているのは気象庁の潮位観測点だけで、' : ''}満潮・干潮の時刻と潮位は公表値を使い、上記の指標や集計は当サイトで計算しています。</li>
  </ul>`)}
  ${ad('graph')}
  ${section('用途から選ぶ', '', `<ul class="guide-list">${activities.map(a =>
    `<li><a href="${attr(paths.activity(a.slug))}">${esc(a.title)}</a><span class="note">${esc(a.tagline)}</span></li>`).join('')}</ul>`)}
  ${nationalTrendSection(national, rangeRank)}
  ${section('潮汐のガイド', 'GUIDE', `<ul class="guide-list">${HOME_GUIDES.map(guideBySlug).filter(Boolean).map(g =>
    `<li><a href="${attr(paths.guide(g.slug))}">${esc(g.title)}</a><span class="note">${esc(g.description)}</span></li>`).join('')}</ul>`,
    `<a class="blk-more" href="${attr(paths.guideIndex())}">すべてのガイド（${GUIDES.length}本）</a>`)}
  ${ad('footer')}
</article>`;

  return page({
    title, description,
    canonical: abs.home(),
    trail: null,
    ld: [{
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: SITE.NAME,
      alternateName: SITE.NAME_EN,
      url: abs.home(),
      description: SITE.TAGLINE,
      inLanguage: 'ja',
    }],
    bodyClass: 'home-page',
    head: leafletHead(),
    scripts: leafletScripts(),
  }, body);
}

export function aboutPage() {
  const title = `このサイトについて${SEP}${SITE.NAME}`;
  const description = `${SITE.NAME}のデータ出典・計算方法・免責について。潮位も天気も気象庁の公表データによります。`;
  const body = `
<article class="prose">
  <h1>このサイトについて</h1>
  <p>大潮・小潮の仕組みや潮見表の読み方など、基礎的な内容は<a href="${attr(paths.guideIndex())}">潮見表・潮汐のガイド</a>にまとめています。ここではデータの出典や計算方法について説明します。</p>
  <h2>データの出典</h2>
  <p>潮位は<a href="${attr(SITE.JMA_CREDIT_URL)}" rel="nofollow noopener" target="_blank">気象庁 潮位表</a>の公式推算値です。年次の潮位表ファイルを取得し、毎時の推算値を掲載しています。</p>
  <p>10分毎の潮位は、毎時値を三次スプライン（自然境界）で補間したものです。満潮・干潮の時刻と潮位は補間値ではなく、気象庁が公表している値をそのまま使っています。</p>
  <p>天気・風・波・気温・降水確率は<a href="${attr(SITE.JMA_FC_CREDIT_URL)}" rel="nofollow noopener" target="_blank">気象庁 天気予報</a>を加工して作成しています。地点ごとに、同じ都道府県内で最寄りの予報区（一次細分区域）の予報を割り当てています。気温は最寄りのアメダス地点の値で、3日先以降は都道府県の代表地点の値になります。どの地点の値かは各ページに書いています。</p>
  <p>今日・明日・明後日は短期予報、3日先から7日先までは週間予報にもとづいています。週間予報の天気と降水確率は都道府県単位でしか発表されないため、県内のどの地点でも同じ値になります。気象庁の天気予報は7日先までなので、それより先の日と過去の日には天気を表示していません（潮位は推算値なので通年で表示されます）。</p>
  <p>天気予報は1日1回、サイトを再生成するときに取得しています。各ページに気象庁の発表時刻を書いているのはこのためで、閲覧している時点の最新の発表とは異なる場合があります。最新の予報は<a href="${attr(SITE.JMA_FC_CREDIT_URL)}" rel="nofollow noopener" target="_blank">気象庁のページ</a>で確認してください。</p>
  <h2>掲載している地点</h2>
  ${SITE.LEAN
    ? `<p>気象庁が潮位表を公表している観測点そのもの（全国239か所）だけを掲載しています。表示している潮位は、その観測点の推算値をそのまま使ったものです。</p>
  <p>観測点のない港などについて、最寄りの観測点の値を参照した「近似地点」を掲載していた時期がありますが、参照元と数値が変わらない地点が大半で、独立したページとして出す意味が乏しいため取りやめました。近似の考え方と限界は<a href="${attr(paths.guide('kinji-chiten-seido'))}">近似地点の潮位はどこまで信用できるか</a>で説明しています。</p>`
    : `<p>気象庁の潮位観測点がある地点は「公式観測点」として、推算値をそのまま表示しています。</p>
  <p>観測点のない港などは「近似地点」として、最寄りの観測点の値を参照しています。最寄り観測点の割り当ては、半島を挟んだ反対側の観測点と結びつく事故を避けるため、半径25km内にある観測点の干満差のばらつきが25%以内である場所に限っています。どの観測点を参照しても値が変わらない場所だけを残した、ということです。</p>`}
  <h2>潮がよく動く時間帯について</h2>
  <p>10分毎の補間潮位の前後差から変化速度(cm/h)を求め、当日の最大変化速度の60%以上で40分以上続く区間を抜き出しています。単位は海面が上下する速さで、海水の流速・流向の予測ではありません。干満差の異なる地点でもその日なりの変化を読めるよう、当日の最大値に対する比率を使っています。算出方法と限界は<a href="${attr(paths.guide('ugoku-jikantai'))}">潮がよく動く時間帯とは</a>で解説しています。</p>
  <h2>表の書き出しについて</h2>
  <p>満潮・干潮の一覧、10分毎の潮位、週間表、月間カレンダー、都道府県の地点別一覧には、それぞれ右上に「コピー」「CSV」のボタンが付いています。「コピー」はタブ区切りでクリップボードに入るので、Excel やスプレッドシートのセルにそのまま貼り付けられます。「CSV」は同じ内容をファイルとして保存します。</p>
  <p>CSV には UTF-8 の BOM を付けています。これが無いと Excel が文字コードを取り違え、地点名や見出しが文字化けするためです。</p>
  <p>満潮・干潮は日によって1日1回のことも3回のこともあるため、セル内に詰め込まず「満潮1時刻・満潮1潮位cm・満潮2時刻…」と列に開いて書き出しています。10分毎の潮位は、画面では24行×6列の表ですが、書き出しでは1行1時刻（日付・時刻・潮位cm）にしています。この形でないとグラフや関数にかけられないためです。</p>
  <p>書き出したデータの元は気象庁の推算値です。再配布・二次利用の際は出典を明記してください。</p>
  <h2>簡易API(JSON)</h2>
  <p>各地点のデータを <code>/api/{都道府県}/{地点名}.json</code> というURLでも配信しています。地点ページのURL（例: <code>/hiroshima/広島/</code>）の <code>hiroshima/広島</code> の部分がそのまま <code>都道府県/地点名</code> に対応するので、末尾を <code>.json</code> に変えるだけでアクセスできます。クエリパラメータは受け付けず、当サイトが生成しているのと同じ日数ぶん（今日を含む前後の日付。今日だけ10分毎の潮位も含みます）を1ファイルにまとめて返します。認証やレート制限は設けていませんが、更新はサイト全体のビルドと同じく1日1回です。</p>

  <h2>広告とプライバシー</h2>
  <p>当サイトの広告配信と Cookie の取り扱いについては<a href="${attr(url('privacy'))}">プライバシーポリシー</a>をご覧ください。</p>
  <h2>運営者</h2>
  <p>${esc(SITE.OPERATOR_NAME)}が個人で企画・開発・運営しています。</p>
  ${SITE.OPERATOR_PROFILE ? `<p>${esc(SITE.OPERATOR_PROFILE)}</p>` : ''}
  <p>釣歩記では2020年から2021年にかけて、瀬戸内海を中心に13府県・約120か所の釣り場を歩き、水中映像と水深の測量を公開しました。測った水深を潮位で補正していた方法は<a href="${attr(paths.guide(TSURIARUKI_GUIDE.slug))}">釣り場の水深は潮で3m変わる</a>で、動画は<a href="${attr(CHANNEL_URL)}" rel="noopener" target="_blank">YouTube「釣歩記（つりあるき）」</a>で見られます。</p>
  <h2>このサイトを作った理由</h2>
  <p>気象庁は全国の潮位観測点ごとに、1年分の潮位の推算値を公表しています。ただし公表されている形式は、毎時の数値と満潮・干潮の時刻が並んだ表で、釣りや潮干狩りの予定を立てるときにそのまま読むには手間がかかります。</p>
  <p>${esc(SITE.NAME)}は、この公式データを「10分毎の潮位」「潮がよく動く時間帯」「その日の天気」と一緒に1ページで確認でき、さらに地点ごとの潮の性格（干満差の大きさ、昼間に大きく潮が引く季節、近くの観測点との違い）まで読めるようにするために作りました。</p>
  <h2>編集方針</h2>
  <ul>
    <li>潮位の数値は気象庁の推算値だけを使い、独自の補正や予想は加えていません。</li>
    <li>地点ページの「この地点の潮の特徴」と、都道府県・地方ページの潮汐の解説は、気象庁の潮位表を1年分集計した値から作っています。数値はサイトを更新するたびに計算し直しています。</li>
    <li><a href="${attr(paths.guideIndex())}">ガイド記事</a>と<a href="${attr(paths.activityIndex())}">用途別のページ</a>は運営者が執筆しています。潮汐の仕組みや安全に関わる内容は、気象庁・海上保安庁などの公的機関が公開している情報にもとづいて書いています。</li>
    <li>誤りのご指摘をいただいた場合は内容を確認し、次回のサイト更新で修正します。</li>
  </ul>
  <h2>更新履歴</h2>
  <ul>
    <li>2026年7月 — 瀬戸内海沿岸の潮見表として開発を開始</li>
    <li>2026年8月2日 — japantide.com で全国版として公開</li>
    <li>2026年8月 — 潮汐のガイド記事を公開（8月中に13本）</li>
    <li>2026年9月8日 — 掲載地点を気象庁の公式観測点239か所に整理し、都道府県・地方ページに潮汐の解説を追加</li>
    <li>2026年9月13日 — 地点ごとの「この地点の潮の特徴」、用途別ページの解説、ガイド記事7本を追加</li>
    <li>2026年10月4〜5日 — 都道府県・地方ページの解説を海域ごとの内容に書き直し、各地点ページに「面している海」を追加。運営者の釣り場測量の経験をまとめたガイド記事を公開</li>
  </ul>
  ${SITE.CONTACT_URL ? `<h2>お問い合わせ</h2>
  <p>データの誤りのご指摘、掲載内容についてのご連絡は<a href="${attr(SITE.CONTACT_URL)}" rel="nofollow noopener" target="_blank">お問い合わせフォーム</a>からお願いします。</p>
` : ''}  <h2>免責</h2>
  <p>掲載している潮位は推算値であり、実測値とは異なります。気圧・風・河川流入などの影響で実際の潮位は上下します。航行・遊泳・釣行などの安全に関わる判断は、必ず現地の状況と公的機関が発表する情報にもとづいて行ってください。当サイトの情報の利用によって生じた損害について、運営者は責任を負いません。</p>
</article>`;
  return page({
    title, description,
    canonical: absUrl('about'),
    trail: [
      { name: '全国', href: paths.home(), abs: abs.home() },
      { name: 'このサイトについて', href: url('about'), abs: absUrl('about') },
    ],
  }, body);
}

// AdSense のポリシーは、第三者配信事業者による Cookie 使用とオプトアウト手段の
// 明示を求めている。ADSENSE_CLIENT が空で広告を出していないあいだも、審査に
// 出す時点でこのページが存在している必要があるため、常に出力する。
export function privacyPage() {
  const title = `プライバシーポリシー${SEP}${SITE.NAME}`;
  const description = `${SITE.NAME}における広告配信・Cookie・アクセス解析の取り扱いについて。`;
  const body = `
<article class="prose">
  <h1>プライバシーポリシー</h1>
  <h2>運営者</h2>
  <p>当サイトは${esc(SITE.OPERATOR_NAME)}が個人で運営しています。</p>
  <h2>広告の配信について</h2>
  <p>当サイトでは、第三者配信の広告サービス（Google AdSense）による広告を掲載します。</p>
  <p>Google などの第三者配信事業者は、Cookie を使用して、利用者が当サイトや他のサイトに過去にアクセスした際の情報にもとづいて広告を配信します。詳しくは<a href="https://policies.google.com/technologies/ads" rel="nofollow noopener" target="_blank">広告 – ポリシーと規約 – Google</a>をご覧ください。</p>
  <p>パーソナライズ広告は<a href="https://myadcenter.google.com/" rel="nofollow noopener" target="_blank">Google の広告設定</a>で無効にできます。第三者配信事業者の Cookie は<a href="https://www.aboutads.info/choices/" rel="nofollow noopener" target="_blank">aboutads.info</a>から無効にできます。</p>
  <p>広告サービスの利用に伴い、Googleなどの第三者がIPアドレス、閲覧ページのURL、Cookieやその他の識別子を取得し、広告の配信・効果測定・不正防止等に利用する場合があります。<a href="https://policies.google.com/technologies/partner-sites?hl=ja" rel="noopener" target="_blank">Googleのサービスを使用するサイトやアプリから収集した情報の利用</a>もご確認ください。</p>
  <h2>端末内に保存する情報</h2>
  <p>お気に入り、最近見た地点、用途別モードの設定は、ブラウザのlocalStorageに保存します。当サイトの処理では、これらの保存値を運営者のサーバーへ送信しません。ブラウザのサイトデータを削除すると保存内容も消えます。</p>
  <h2>現在地に近い地点の検索</h2>
  <p>現在地検索は、ボタンを押してブラウザの位置情報取得を許可した場合にだけ使います。取得した緯度・経度は、ブラウザ内で最寄りの掲載地点を計算するために使用します。当サイトの処理では座標を保存せず、運営者のサーバーや広告サービスに座標を送信しません。許可しなくても地点名検索や地方一覧を利用できます。</p>
  <h2>埋め込み動画（YouTube）</h2>
  <p>一部の記事には、運営者が YouTube に公開している動画を埋め込んでいます。ページを開いた時点では動画のサムネイル画像だけを YouTube のサーバー（i.ytimg.com）から読み込み、再生ボタンを押したときに初めてプレーヤーを読み込みます。プレーヤーはプライバシー強化モード（youtube-nocookie.com）で配信されますが、再生すると YouTube（Google）が Cookie などを使用する場合があります。詳しくは<a href="https://policies.google.com/privacy?hl=ja" rel="nofollow noopener" target="_blank">Google プライバシーポリシー</a>をご覧ください。</p>
${SITE.GA_ID ? `  <h2>アクセス解析</h2>
  <p>当サイトは、アクセス状況を把握するために Google アナリティクスを利用しています。Google アナリティクスは Cookie を使用してトラフィックデータを収集しますが、収集されるデータは匿名であり、個人を特定するものではありません。</p>
  <p>収集を停止したい場合は、ブラウザの Cookie 設定、または<a href="https://tools.google.com/dlpage/gaoptout" rel="nofollow noopener" target="_blank">Google アナリティクス オプトアウト アドオン</a>から行えます。</p>
` : ''}  <h2>アクセスログ</h2>
  <p>当サイトは GitHub Pages 上の静的なファイルとして配信されており、当サイトの運営者が閲覧者のアクセスログを取得・保存することはありません。</p>
  <h2>掲載内容の免責</h2>
  <p>掲載しているデータの出典と免責については<a href="${attr(url('about'))}">このサイトについて</a>に記載しています。</p>
${SITE.CONTACT_URL ? `  <h2>お問い合わせ</h2>
  <p>本ポリシーに関するお問い合わせは<a href="${attr(SITE.CONTACT_URL)}" rel="nofollow noopener" target="_blank">お問い合わせフォーム</a>からお願いします。</p>
` : ''}  <h2>改定</h2>
  <p>最終更新日：2026年10月5日。本ポリシーの内容は、必要に応じて予告なく変更することがあります。</p>
</article>`;
  return page({
    title, description,
    canonical: absUrl('privacy'),
    trail: [
      { name: '全国', href: paths.home(), abs: abs.home() },
      { name: 'プライバシーポリシー', href: url('privacy'), abs: absUrl('privacy') },
    ],
  }, body);
}

// GitHub Pages はビルド出力の直下にある 404.html を任意の未知パスへの
// アクセス時にそのまま返す(dist/404/index.html ではなく dist/404.html)。
// 日別ページは DAYS_BACK/DAYS_FWD の窓から外れると消えるため、検索エンジンや
// 古い外部リンク経由で毎日一定数の404が発生する。GitHub Pagesの汎用画面
// (英語・導線なし)のままだと迷子になるので、検索とトップへの導線を出す。
// canonical・trail は持たない(この1ファイルが無数のURLで返るため、
// 特定のURLを指すcanonicalを書くとかえって誤ったシグナルになる)。
export function notFoundPage() {
  const title = `ページが見つかりません${SEP}${SITE.NAME}`;
  const description = `お探しのページが見つかりませんでした。${SITE.NAME}のトップから地点を検索できます。`;
  const body = `
<article class="prose">
  <h1>ページが見つかりません</h1>
  <p>お探しのページは見つかりませんでした。URLが変更されたか、日別ページの掲載期間（当日から前後数日）を過ぎて削除された可能性があります。</p>
  <p>右上の「地点を検索」から地点名で探すか、<a href="${attr(paths.home())}">トップページ</a>から都道府県・地方を辿ってください。</p>
</article>`;
  return page({
    title, description,
    canonical: abs.home(),
    noindex: true,
    // 中身の無いページに広告を出すのは AdSense の禁止事項。404 は
    // スクリプトも枠も出さない。
    ads: false,
    side: false,
  }, body);
}

// ---------------------------------------------------------------------
// 部品
// ---------------------------------------------------------------------
function leafletHead() {
  return `<link rel="stylesheet" href="${attr(asset('vendor/leaflet/leaflet.css'))}">`;
}
function leafletScripts() {
  return `<script src="${attr(asset('vendor/leaflet/leaflet.js'))}" defer></script>`;
}

// ymd: このページが扱う日(YYYY-MM-DD)。dateModified はページ本文の lastmod と
// 揃える(過去日・予報の無い未来日は静的な推算値だけなのでその日自体、
// 予報がある日は毎日天気欄が更新されるので呼び出し側で today を渡す)。
function stationLd(st, day, cel, ymd, dateModified) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: `${stationLabel(st)}の潮位推算値`,
    // Google の Dataset は description が50〜5000文字でないと無効になる
    // (旧文は27〜34文字で全ページ不適合だった。Search Console のデータ
    // セットレポートで「description の文字列長が無効」として検出された)。
    // ymd を入れて日別ページごとに違う説明文にしている。
    description: `${stationLabel(st)}（${pref(st.pref).name}）の${ymd}の潮位データセット。気象庁の潮位表による10分ごとの推算潮位と、満潮・干潮の時刻・潮位、干満差を収録しています。`,
    creator: { '@type': 'Organization', name: '気象庁' },
    publisher: {
      '@type': 'Organization', name: SITE.NAME, url: abs.home(),
      founder: { '@type': 'Person', name: SITE.OPERATOR_NAME },
    },
    isAccessibleForFree: true,
    license: SITE.JMA_CREDIT_URL,
    temporalCoverage: ymd,
    dateModified,
    spatialCoverage: {
      '@type': 'Place',
      name: stationLabel(st),
      containedInPlace: { '@type': 'AdministrativeArea', name: pref(st.pref).name },
      geo: { '@type': 'GeoCoordinates', latitude: st.lat, longitude: st.lon },
    },
    variableMeasured: [
      { '@type': 'PropertyValue', name: '最高潮位', value: day.max, unitCode: 'CMT' },
      { '@type': 'PropertyValue', name: '最低潮位', value: day.min, unitCode: 'CMT' },
      { '@type': 'PropertyValue', name: '干満差', value: day.range, unitCode: 'CMT' },
    ],
  };
}
