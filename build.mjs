// =====================================================================
// 静的サイトのビルド
//
//   node build.mjs            全ページ生成
//   node build.mjs --sample   1県ぶんだけ生成（動作確認用・数秒で終わる）
//
// 生成物は dist/ に出る。リポジトリにはコミットせず、GitHub Actions が
// Pages の artifact として直接アップロードする。
// =====================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SITE, url, asset, absUrl } from './config.mjs';
import { TIDE_STATIONS, REGIONS, PREFS, JMA_STN_NAME } from './lib/stations.mjs';
import { loadYears } from './lib/jma.mjs';
import { loadForecast } from './lib/forecast.mjs';
import { loadDeviations } from './lib/deviation.mjs';
import { tideDay, tideDayLight } from './lib/tide.mjs';
import { celestialData } from './lib/astro.mjs';
import {
  todayJSTMs, dayKeyOf, monthKeyOf, dayMsOf, addDays, addMonths,
  daysInMonth, pad2, DAY,
} from './lib/util.mjs';
import { SERVED_STATIONS } from './lib/serve-stations.mjs';
import { paths, abs, pref, region, regionOf, prefStations, regionPrefs, regionStationCount, stationSlug, validateStations } from './lib/routes.mjs';
import {
  stationPage, dayPage, weekPage, monthPage, prefPage, regionPage, homePage, aboutPage,
  privacyPage, notFoundPage,
} from './lib/pages.mjs';
import { GUIDES, guidePage, guideIndexPage } from './lib/guides.mjs';
import { ACTIVITIES, activityPage, activityIndexPage } from './lib/activities.mjs';
import { stationApiJSON } from './lib/api.mjs';
import { areaProfile, stationProfile, highTideLag } from './lib/tide-profile.mjs';
import { stationNoteHtml, stationNoteSummary, stationNoteChart } from './lib/station-notes.mjs';
import { PREF_GUIDES } from './lib/pref-guides.mjs';
import { esc } from './lib/html.mjs';
import { stationLabel } from './lib/station-quality.mjs';
import { stationQuality } from './lib/station-quality.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, 'dist');
const SAMPLE = process.argv.includes('--sample');

// ---------------------------------------------------------------------
// 出力
// ---------------------------------------------------------------------
let written = 0;
const allUrls = [];
const seenUrls = new Set();

// lastmod は「今日ビルドした」ではなく「このURLの内容が実際に変わりうる日」を
// 渡す。省略時は todayKey (ビルド日)。これは当日スナップショット系のページ
// (トップ・地方・県・地点ハブ・週間) にだけ正しい既定値で、日別・月間・
// about/privacy の呼び出し側では個別に計算した値を渡す。全URLに一律で
// 今日の日付を書くと、Search Console が「毎日全ページ更新」という虚偽の
// シグナルとして学習し、lastmod 自体を無視するようになるため。
function write(u, html, { sitemap = true, changefreq = 'daily', priority = 0.6, lastmod } = {}) {
  // 同じ URL に2回書くと先に書いたページが黙って消える。生成数とファイル数が
  // ずれるだけなので気づきにくい。ここで落とす。
  if (seenUrls.has(u)) throw new Error(`URL が重複しています: ${u}`);
  seenUrls.add(u);

  const rel = u.startsWith(SITE.BASE) ? u.slice(SITE.BASE.length) : u;
  const dir = path.join(DIST, rel.replace(/^\/+|\/+$/g, ''));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');
  written++;
  if (sitemap) allUrls.push({ loc: SITE.ORIGIN + encodePath(u), changefreq, priority, lastmod: lastmod || todayKey });
}

// API(JSON)は個別ページではないので sitemap に載せない。write() とは別に
// 「ディレクトリの中の index.html」ではなく「{slug}.json という単独ファイル」
// として書く。
function writeJSON(relPath, obj) {
  const full = path.join(DIST, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(obj), 'utf8');
}

// 日本語セグメントを含むパスを sitemap / canonical 用に percent-encode する
function encodePath(u) {
  return u.split('/').map(encodeURIComponent).join('/');
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}

// ---------------------------------------------------------------------
// 距離（近隣地点の算出）
// ---------------------------------------------------------------------
function km(a, b) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function neighborsOf(st, pool, n = 6) {
  return pool
    .filter(s => s.id !== st.id)
    .map(s => ({ st: s, km: km(st, s) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, n);
}

// ---------------------------------------------------------------------
// 生成対象の日付
// ---------------------------------------------------------------------
const today = todayJSTMs();
const todayKey = dayKeyOf(today);

// SITE.DAY_PAGES が false のときは日別ページを作らない。日別の内容は
// 地点ハブ(当日)・週間(7日)・月間カレンダーで尽きており、日付だけ差し替えた
// 同型のページを地点数ぶん積んでも足すものが無いため(config.mjs の LEAN 参照)。
const dayList = [];
if (SITE.DAY_PAGES) {
  for (let i = -SITE.DAYS_BACK; i <= SITE.DAYS_FWD; i++) dayList.push(addDays(today, i));
}

// 日別ページを作る日。月カレンダーや日リンクは、この集合にある日だけ
// リンクにする。存在しないページへ張ると 4万件超のリンク切れになる。
const dayPageKeys = new Set(dayList.map(dayKeyOf));

const weekList = [];
for (let i = 0; i < 7; i++) weekList.push(addDays(today, i));

const monthList = [];
for (let i = -SITE.MONTHS_BACK; i <= SITE.MONTHS_FWD; i++) monthList.push(addMonths(today, i));

// 月カレンダーで必要になる全日を含めた、データ取得が要る日の集合
const neededDays = new Set([...dayList, ...weekList].map(dayKeyOf));
for (const m of monthList) {
  const d = new Date(m);
  const n = daysInMonth(d.getUTCFullYear(), d.getUTCMonth());
  for (let i = 0; i < n; i++) neededDays.add(dayKeyOf(addDays(m, i)));
}
// 週間表・日別ページの前後リンク用に少し外側も持っておく
neededDays.add(dayKeyOf(addDays(today, SITE.DAYS_FWD + 1)));
neededDays.add(dayKeyOf(addDays(today, -SITE.DAYS_BACK - 1)));

const years = [...new Set([...neededDays].map(k => Number(k.slice(0, 4))))].sort();

// ---------------------------------------------------------------------
// 本体
// ---------------------------------------------------------------------
const t0 = Date.now();

validateStations();

// 配信対象は SERVED_STATIONS（SITE.LEAN のときは公式観測点だけ）。
// TIDE_STATIONS は「知っている地点の全部」で、スラッグ採番と出典表示に使う。
const stations = SAMPLE
  ? SERVED_STATIONS.filter(s => s.pref === 'hiroshima')
  : SERVED_STATIONS;

// 観測点名・最寄り観測点までの距離（近似地点の出典表示に使う）
const officialByCode = new Map(TIDE_STATIONS.filter(s => !s.jmaAnchor).map(s => [s.jma, s]));
for (const s of TIDE_STATIONS) {
  s.jmaName = JMA_STN_NAME[s.jma] || s.jma;
  if (s.jmaAnchor) {
    const official = officialByCode.get(s.jma);
    if (official) s.jmaKm = km(s, official);
  }
}

const codes = [...new Set(stations.map(s => s.jma))];
console.log(`気象庁 潮位表を取得します: ${codes.length}観測点 × ${years.length}年 (${years.join(', ')})`);

const jma = await loadYears(codes, years, {
  onProgress: (d, t) => {
    if (d % 25 === 0 || d === t) process.stdout.write(`\r  ${d}/${t}`);
  },
});
console.log(`\n取得完了 (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

// 気象庁データが1日も無い観測点は異常なので落とす
for (const c of codes) {
  if (!jma[c] || Object.keys(jma[c]).length < 300) {
    throw new Error(`観測点 ${c} のデータが不足しています (${Object.keys(jma[c] || {}).length}日)`);
  }
}

// ---- 年間の潮汐プロファイル ----------------------------------------------
// 地点・県・地方の解説文の元になる実測値。今年の潮位表だけで集計する
// (月間ページを翌年まで出す設定では2年ぶん読み込まれているため)。
const YEAR = Number(todayKey.slice(0, 4));
const stationProfiles = new Map();
for (const st of stations) {
  const sp = stationProfile(jma[st.jma], YEAR);
  if (sp) stationProfiles.set(st.id, sp);
}
const profiledOfficial = stations.filter(s => !s.jmaAnchor && stationProfiles.has(s.id))
  .sort((a, b) => stationProfiles.get(b.id).avg - stationProfiles.get(a.id).avg);
const nationalRank = new Map(profiledOfficial.map((s, i) => [s.id, i + 1]));
const prefProfileCache = new Map();
function prefProfileOf(prefId) {
  if (!prefProfileCache.has(prefId)) prefProfileCache.set(prefId, areaProfile(prefStations(prefId), jma, YEAR));
  return prefProfileCache.get(prefId);
}

// 地点ページの「この地点の潮の特徴」。近似地点は参照元の観測点と同じ値に
// なり地点固有の情報にならないので、公式観測点にだけ付ける。
function stationNoteFor(st, neighbors) {
  const sp = stationProfiles.get(st.id);
  if (!sp || st.jmaAnchor) return null;
  const p = pref(st.pref);
  const prefList = profiledOfficial.filter(s => s.pref === st.pref);
  const near = neighbors.find(x => !x.st.jmaAnchor && x.st.jma !== st.jma && stationProfiles.has(x.st.id));
  const nb = near ? {
    name: stationLabel(near.st), km: near.km,
    lag: highTideLag(jma[st.jma], jma[near.st.jma], YEAR),
    avg: stationProfiles.get(near.st.id).avg, ownAvg: sp.avg,
  } : null;
  const note = {
    sp, year: YEAR, name: stationLabel(st),
    rank: nationalRank.get(st.id), total: profiledOfficial.length,
    prefName: p.name, prefAvg: prefProfileOf(st.pref)?.avg,
    prefRank: prefList.findIndex(s => s.id === st.id) + 1, prefN: prefList.length,
    nb, guideHref: paths.guide('kisetsu-kanchou'),
  };
  return {
    year: YEAR,
    summary: stationNoteSummary(note),
    chart: stationNoteChart(note),
    html: stationNoteHtml(note),
    sea: seaOf(st),
  };
}

// 地点が面している海。都道府県ページの手書きの海域区分(lib/pref-guides.mjs)から
// 引き、同じ海域のほかの観測点と年間平均の干満差を添える。
function seaOf(st) {
  const coast = PREF_GUIDES[st.pref]?.coasts.find(c => c.stations.includes(st.name));
  if (!coast) return null;
  const mates = coast.stations.filter(n => n !== st.name)
    .map(n => stations.find(s => s.name === n && s.pref === st.pref && !s.jmaAnchor))
    .filter(s => s && stationProfiles.has(s.id))
    .map(s => ({ st: s, avg: stationProfiles.get(s.id).avg }));
  return { name: coast.name, note: coast.note, mates, springLow: stationProfiles.get(st.id)?.springLow ?? null };
}

// ---- 天気予報 -------------------------------------------------------
// 落ちてもサイトは出す。気象欄が空になるだけで、潮汐は独立している。
let forecastFor = () => null;
try {
  const fx = await loadForecast(stations);
  forecastFor = fx.forecastFor;
  console.log(`気象庁 天気予報: ${fx.offices}予報区`
    + (fx.failed.length ? ` (取得失敗 ${fx.failed.length}件: ${fx.failed.join(' / ')})` : '')
    + (fx.unresolved.length ? ` (予報区未割当 ${fx.unresolved.length}地点: ${fx.unresolved.join(', ')})` : ''));
} catch (e) {
  console.warn(`天気予報の取得に失敗しました。気象欄は空になります: ${e.message}`);
}

// ---- 潮位偏差(気象庁 潮位観測情報) -----------------------------------
// 落ちてもサイトは出す。偏差の注記が出ないだけで、本体の潮位は独立している。
// suisanとは別体系の観測点コード・別の基準面なので、対応する観測点だけに付く。
try {
  const nowJST = new Date(Date.now() + 9 * 3600000);
  const nowHour = nowJST.getUTCHours() + nowJST.getUTCMinutes() / 60 + nowJST.getUTCSeconds() / 3600;
  const officialForDeviation = stations.filter(s => !s.jmaAnchor);
  const dv = await loadDeviations(officialForDeviation, todayKey, nowHour, {
    onProgress: (d, t) => {
      if (d % 25 === 0 || d === t) process.stdout.write(`\r  ${d}/${t}`);
    },
  });
  for (const st of officialForDeviation) st.deviation = dv.deviations.get(st.jma) || null;
  console.log(`\n潮位偏差(気象庁 潮位観測情報): ${dv.matched}観測点が対応、${dv.deviations.size}件で偏差を算出`
    + (dv.failed.length ? ` (取得失敗 ${dv.failed.length}件)` : ''));
} catch (e) {
  console.warn(`潮位偏差の取得に失敗しました。偏差の注記は出ません: ${e.message}`);
}

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
copyDir(path.join(ROOT, 'public'), DIST);
fs.writeFileSync(path.join(DIST, '.nojekyll'), '');
if (SITE.CNAME) fs.writeFileSync(path.join(DIST, 'CNAME'), SITE.CNAME + '\n');

// ads.txt はドメイン直下に無いと Google に読まれない。BASE が空(apex 運用)
// である前提。審査前に無効な ads.txt を置く意味は無いので、広告タグと同じく
// ADSENSE_CLIENT が空のあいだは出力しない。
if (SITE.ADSENSE_CLIENT) {
  const pub = SITE.ADSENSE_CLIENT.replace(/^ca-/, '');
  fs.writeFileSync(path.join(DIST, 'ads.txt'),
    `google.com, ${pub}, DIRECT, f08c47fec0942fa0\n`);
}

// ---- 地点ページ群 ---------------------------------------------------
const tBuild = Date.now();
let n = 0;

for (const st of stations) {
  const byDay = jma[st.jma];
  const cel = d => celestialData(st, d);
  const light = d => tideDayLight(st, byDay, d);
  const full = d => tideDay(st, byDay, d);

  // ---- ハブ（当日） ----
  const todayFull = tideDay(st, byDay, today);
  if (!todayFull) throw new Error(`${st.name}: 当日(${todayKey})の潮位データがありません`);

  // 週間ページ専用の詳細列(天気・潮がよく動く時間帯)のために、地点ハブの
  // 「これからの7日間」に使う軽量版とは別にlevels付きのfull版を持たせる。
  const weekRows = weekList.map(d => ({
    // 日別ページを作っていない日はリンクにしない。存在しない URL に張ると
    // 週間表だけで 地点数 × 6 本のリンク切れになる。
    dayMs: d, ymd: dayKeyOf(d),
    href: dayPageKeys.has(dayKeyOf(d)) ? paths.day(st, dayKeyOf(d)) : null,
    cel: cel(d), day: full(d), today: d === today,
    fc: forecastFor(st, dayKeyOf(d)),
  }));

  const neighbors = neighborsOf(st, stations);
  write(paths.station(st), stationPage({
    st, day: todayFull, cel: cel(today), ymd: todayKey, dayMs: today,
    weekRows,
    neighbors,
    profile: stationNoteFor(st, neighbors),
    fc: forecastFor(st, todayKey),
    // 日別ページを作らない設定では「この日を詳しく」もグラフの前日/翌日も出さない。
    dayHref: dayPageKeys.has(todayKey) ? paths.day(st, todayKey) : null,
    dayNav: {
      prev: dayPageKeys.has(dayKeyOf(addDays(today, -1))) ? paths.day(st, dayKeyOf(addDays(today, -1))) : null,
      next: dayPageKeys.has(dayKeyOf(addDays(today, 1))) ? paths.day(st, dayKeyOf(addDays(today, 1))) : null,
    },
  }), { changefreq: 'daily', priority: 0.9 });

  // ---- 週間 ----
  // SITE.LEAN のあいだ、週間・月間は noindex にして sitemap からも外す。
  // どちらも地点ハブの表を期間だけ変えた同型ページで、数値を伏せると
  // 月間は本文の9割以上が全地点で共通になる。ページ自体は残すので、
  // 地点ハブのタブからの利用には影響しない。
  write(paths.week(st), weekPage({ st, rows: weekRows, ymd: todayKey, noindex: SITE.LEAN }),
    { changefreq: 'daily', priority: 0.7, sitemap: !SITE.LEAN });

  // ---- 日別 ----
  for (let i = 0; i < dayList.length; i++) {
    const d = dayList[i];
    const ymd = dayKeyOf(d);
    const full = tideDay(st, byDay, d);
    if (!full) continue;

    const md = new Date(d);
    const monthStart = Date.UTC(md.getUTCFullYear(), md.getUTCMonth(), 1);
    const dim = daysInMonth(md.getUTCFullYear(), md.getUTCMonth());
    const monthDays = [];
    for (let k = 0; k < dim; k++) {
      const dk = dayKeyOf(addDays(monthStart, k));
      monthDays.push({ d: k + 1, ymd: dk, href: dayPageKeys.has(dk) ? paths.day(st, dk) : null });
    }

    // 前後日は「ページを作った日」にだけ張る。潮位データは1年分あるので
    // byDay の有無で判定すると生成範囲の外にリンクしてしまう。
    const pk = dayKeyOf(addDays(d, -1)), nk = dayKeyOf(addDays(d, 1));
    const label = k => `${Number(k.slice(5, 7))}/${Number(k.slice(8, 10))}`;
    const fcDay = forecastFor(st, ymd);
    // 予報がある日(今日〜7日先)は天気欄が毎日更新されるので今日の日付。
    // それ以外は気象庁の推算値だけの静的なページなので、その日自体を
    // lastmod/dateModified にする(未来日は today を超えられないので min で丸める)。
    const dmDay = fcDay ? todayKey : dayKeyOf(Math.min(d, today));
    write(paths.day(st, ymd), dayPage({
      st, day: full, cel: cel(d), ymd, dayMs: d,
      isToday: d === today,
      prev: dayPageKeys.has(pk) ? { href: paths.day(st, pk), label: label(pk) } : null,
      next: dayPageKeys.has(nk) ? { href: paths.day(st, nk), label: label(nk) } : null,
      monthDays,
      fc: fcDay,
      dateModified: dmDay,
    }), {
      // 今日の日別ページは canonical が地点ハブを指す(dayPage内)ので、
      // 別URLとして sitemap に出すと非canonical URLを申告することになる。
      sitemap: d !== today,
      changefreq: d === today ? 'daily' : 'monthly',
      priority: d === today ? 0.5 : 0.4,
      lastmod: dmDay,
    });
  }

  // ---- 簡易API(JSON) ----
  // HTMLの日別ページと同じ生成範囲(DAYS_BACK〜DAYS_FWD)を1ファイルにまとめる。
  // 日別ページを作らない設定でも API は週間ページと同じ7日ぶんを返す。
  const apiList = dayList.length ? dayList : weekList;
  const apiDays = apiList.map(d => ({ ymd: dayKeyOf(d), cel: cel(d), day: full(d), isToday: d === today }));
  writeJSON(`api/${st.pref}/${stationSlug(st)}.json`, stationApiJSON(st, apiDays));

  // ---- 月間 ----
  for (const m of monthList) {
    const md = new Date(m);
    const Y = md.getUTCFullYear(), M0 = md.getUTCMonth();
    const ym = monthKeyOf(m);
    const dim = daysInMonth(Y, M0);
    const firstWd = new Date(Date.UTC(Y, M0, 1)).getUTCDay();

    const cells = new Array(firstWd).fill(null);
    let maxRange = 0, maxRangeDay = 1, ohshio = 0;
    for (let k = 0; k < dim; k++) {
      const dd = addDays(m, k);
      const c = cel(dd), l = light(dd);
      if (l && l.range > maxRange) { maxRange = l.range; maxRangeDay = k + 1; }
      if (c.shio === '大潮') ohshio++;
      const ck = dayKeyOf(dd);
      cells.push({ dayMs: dd, ymd: ck, href: dayPageKeys.has(ck) ? paths.day(st, ck) : null, cel: c, day: l, today: dd === today });
    }
    while (cells.length % 7) cells.push(null);

    const pm = addMonths(m, -1), nm = addMonths(m, 1);
    const inRange = x => monthList.some(v => v === x);
    // 月間カレンダーは気象庁の推算値・天文暦だけで組み立てており、天気予報を
    // 含まない(=毎日は変わらない)ので、月末日(未来月なら today)を lastmod にする。
    const monthEndMs = addDays(m, dim - 1);
    write(paths.month(st, ym), monthPage({
      st, ym, cells,
      // タブ横の予報リンクが府県予報区コードを使う。月間ページは天気そのものは
      // 載せないので、この fc から読むのはコードだけ。
      fc: forecastFor(st, todayKey),
      prev: inRange(pm) ? { href: paths.month(st, monthKeyOf(pm)), label: `${new Date(pm).getUTCMonth() + 1}月` } : null,
      next: inRange(nm) ? { href: paths.month(st, monthKeyOf(nm)), label: `${new Date(nm).getUTCMonth() + 1}月` } : null,
      months: monthList.map(x => ({
        href: paths.month(st, monthKeyOf(x)),
        year: new Date(x).getUTCFullYear(),
        month: new Date(x).getUTCMonth() + 1,
        active: x === m,
      })),
      stats: { maxRange, maxRangeDay, ohshio },
      noindex: SITE.LEAN,
    }), {
      changefreq: 'weekly', priority: 0.5, sitemap: !SITE.LEAN,
      lastmod: dayKeyOf(Math.min(monthEndMs, today)),
    });
  }

  if (++n % 25 === 0) process.stdout.write(`\r  地点 ${n}/${stations.length}  ページ ${written}`);
}
process.stdout.write(`\r  地点 ${n}/${stations.length}  ページ ${written}\n`);

// ---- 検索インデックス(JSON) ------------------------------------------
// ヘッダーの検索窓が使う軽量インデックス。表示名・かな・都道府県名・URLだけ。
// 771件でも数十KB程度なので、初回検索時にまとめて取得してブラウザ側で
// 絞り込む(サーバのようなものを持たない静的サイトなのでこれが唯一の方法)。
writeJSON('stations-index.json', stations.map(st => ({
  n: stationLabel(st), k: st.kana || '', p: pref(st.pref).name, h: paths.station(st),
})));

// ---- 都道府県 -------------------------------------------------------
const td = new Date(today);
const dateJa = `${td.getUTCFullYear()}年${td.getUTCMonth() + 1}月${td.getUTCDate()}日`;
const prefsWithStations = PREFS.filter(p => prefStations(p.id).length
  && (!SAMPLE || p.id === 'hiroshima'));

for (const p of prefsWithStations) {
  const list = prefStations(p.id);
  const rows = list.map(st => ({
    st,
    cel: celestialData(st, today),
    day: tideDayLight(st, jma[st.jma], today),
  }));
  write(paths.pref(p), prefPage({
    p, r: region(p.region), rows, ymd: todayKey, dateJa,
    // 県の潮汐の性格。気象庁の年次潮位表から実測で出す(lib/tide-profile.mjs)。
    profile: prefProfileOf(p.id),
    // 海域ごとの比較表に使う、公式観測点それぞれの年間値。
    stationStats: list.filter(st => !st.jmaAnchor)
      .map(st => ({ st, sp: stationProfiles.get(st.id), year: YEAR })),
  }), { changefreq: 'daily', priority: 0.8 });
}

// ---- 地方 -----------------------------------------------------------
const regionsWithStations = REGIONS.filter(r => regionStationCount(r.id) > 0
  && (!SAMPLE || r.id === 'chugoku'));

// 用途別ページ・ガイド記事でも地方ごとの傾向を使うので残しておく。
const regionProfiles = [];
for (const r of regionsWithStations) {
  const prefs = regionPrefs(r.id).filter(p => !SAMPLE || p.id === 'hiroshima');
  const all = prefs.flatMap(p => prefStations(p.id));
  const profile = areaProfile(all, jma, YEAR);
  if (profile) regionProfiles.push({ r, pf: profile });
  write(paths.region(r), regionPage({
    r, prefs, count: all.length, allStations: all,
    profile,
    // 海ごとの比較表に使う、公式観測点それぞれの年間値。
    stationStats: all.filter(st => !st.jmaAnchor)
      .map(st => ({ st, sp: stationProfiles.get(st.id), year: YEAR })),
    // 地方ページでは県ごとの干満差を並べて比べられるようにする。
    prefProfiles: prefs.map(p => ({ p, pf: prefProfileOf(p.id) }))
      .filter(x => x.pf),
  }), { changefreq: 'weekly', priority: 0.7 });
}
// 全国の公式観測点の集計。季節ごとの干潮の傾向を記事に書くときに使う。
const national = { year: YEAR, pf: areaProfile(stations.filter(s => !s.jmaAnchor), jma, YEAR), regions: regionProfiles };

// ---- トップ・about --------------------------------------------------
const homeRegions = regionsWithStations.map(r => ({
  r, count: regionStationCount(r.id), prefs: regionPrefs(r.id),
}));
write(paths.home(), homePage({
  regions: homeRegions,
  total: stations.length,
  official: stations.filter(s => !s.jmaAnchor).length,
  allStations: stations,
  dateJa,
  activities: ACTIVITIES,
  national,
  // 平均の干満差の上位・下位3地点(profiledOfficial は大きい順)。
  rangeRank: profiledOfficial.length >= 6 ? {
    top: profiledOfficial.slice(0, 3).map(st => ({ st, avg: stationProfiles.get(st.id).avg })),
    bottom: profiledOfficial.slice(-3).reverse().map(st => ({ st, avg: stationProfiles.get(st.id).avg })),
  } : null,
}), { changefreq: 'daily', priority: 1.0 });

// about/privacy は動的データを含まない固定ページ。本文を編集したときだけ
// この日付を書き換える(このビルドで内容を変えていないので据え置き)。
const STATIC_PAGE_LASTMOD = '2026-10-01';
write(url('about'), aboutPage(), { changefreq: 'monthly', priority: 0.3, lastmod: STATIC_PAGE_LASTMOD });
write(url('privacy'), privacyPage(), { changefreq: 'monthly', priority: 0.3, lastmod: STATIC_PAGE_LASTMOD });

// GitHub Pages の404画面用。write() は使わない(dist/404/index.html ではなく
// dist直下の404.htmlに置く必要があり、sitemapにも載せないため)。
fs.writeFileSync(path.join(DIST, '404.html'), notFoundPage(), 'utf8');

// ---- ガイド記事 -------------------------------------------------------
// 「大潮とは」のような情報型クエリの受け皿。地点ページ群と違って動的データ
// を含まないので、lib/guides.mjs の本文を編集したときだけ日付を書き換える。
const GUIDE_LASTMOD = '2026-10-01';
write(paths.guideIndex(), guideIndexPage(), { changefreq: 'monthly', priority: 0.4, lastmod: GUIDE_LASTMOD });
for (const g of GUIDES) {
  write(paths.guide(g.slug), guidePage(g, GUIDE_LASTMOD, national), { changefreq: 'monthly', priority: 0.4, lastmod: GUIDE_LASTMOD });
}

// ---- 用途別の入口ページ -------------------------------------------------
// 「釣り」「潮干狩り」「サーフィン」のような用途から来るクエリの受け皿。
// 地点データは無く、地方一覧への案内だけなので地点数の変動にだけ追従する。
write(paths.activityIndex(), activityIndexPage(), { changefreq: 'monthly', priority: 0.4, lastmod: GUIDE_LASTMOD });
for (const a of ACTIVITIES) {
  write(paths.activity(a.slug), activityPage(a, homeRegions, national), { changefreq: 'weekly', priority: 0.5, lastmod: GUIDE_LASTMOD });
}

// ---- sitemap / robots / manifest / llms.txt ---------------------------
writeSitemaps();
fs.writeFileSync(path.join(DIST, 'robots.txt'),
  `User-agent: *\nAllow: /\n\nSitemap: ${SITE.ORIGIN}${SITE.BASE}/sitemap.xml\n`);

// ホーム画面に追加したとき用。アイコン本体は scripts/gen-icons.mjs で
// 一度だけ焼いて public/ にコミットしてある(og-image.pngと同じ運用)。
writeJSON('manifest.webmanifest', {
  name: `${SITE.NAME} | ${SITE.NAME_EN}`,
  short_name: SITE.NAME,
  description: SITE.TAGLINE,
  start_url: url(),
  scope: url(),
  display: 'standalone',
  background_color: '#f4f1ea',
  theme_color: '#f4f1ea',
  icons: [
    { src: asset('icon-192.png'), sizes: '192x192', type: 'image/png' },
    { src: asset('icon-512.png'), sizes: '512x512', type: 'image/png' },
  ],
});

// llms.txt (https://llmstxt.org) は生成AIがサイトを要約・引用する際に読む
// 手がかり。robots.txt で全クローラを許可している方針(生成AIに読まれて
// 引用されることを歓迎する立場)と揃えて、データ出典・更新頻度・URL構造を
// 明文化しておく。数値は実際の生成結果(stations.length等)から出すので、
// 地点数や公式観測点数が変わってもここだけ古くなることはない。
const official = stations.filter(s => !s.jmaAnchor).length;
const low = stations.filter(s => stationQuality(s) === 'low').length;
const accurateApprox = stations.length - official - low;
fs.writeFileSync(path.join(DIST, 'llms.txt'), `# ${SITE.NAME} (${SITE.NAME_EN})

> ${SITE.TAGLINE}。満潮・干潮の時刻と潮位、10分毎の潮位、潮がよく動く時間帯、日の出入・月齢を無料で掲載しています。

## データについて
- 潮位: 気象庁 潮位表の公式推算値です。実測値ではありません。10分毎の値は毎時値を三次スプラインで補間しています。
- 地点マーク: ●は気象庁の公式基準点${official}地点、○は25km以内の公式値を参照する精度確認済み近似地点${accurateApprox}地点、△は参照点が遠い参考地点${low}地点です。△は現地の潮見表・海況と併用してください。
- 天気・風・波・気温: 気象庁 天気予報。今日から7日先まで。
- 更新頻度: 毎日1回、日本時間の未明に全ページを再生成しています。
- 出典: 気象庁（${SITE.JMA_CREDIT_URL}）。引用・二次利用の際は出典の明記をお願いします。詳細は ${absUrl('about')} を参照してください。

## 主なURL構造
- ${SITE.ORIGIN}/ : 全国${stations.length}地点の一覧
- ${SITE.ORIGIN}/{都道府県}/ : 都道府県ごとの潮見表一覧
- ${SITE.ORIGIN}/{都道府県}/{地点}/ : 地点の当日の潮見表・タイドグラフ
- ${SITE.ORIGIN}/{都道府県}/{地点}/week/ : 地点の週間潮見表
- ${SITE.ORIGIN}/{都道府県}/{地点}/{YYYY-MM}/ : 地点の月間カレンダー
- ${SITE.ORIGIN}/{都道府県}/{地点}/{YYYY-MM-DD}/ : 地点の特定の日の潮見表
- ${abs.guideIndex()} : 大潮・小潮の仕組みなど潮汐の解説記事一覧
- ${absUrl('about')} : データ出典・計算方法・免責
- ${absUrl('privacy')} : プライバシーポリシー

## クロールについて
robots.txt はすべてのクローラ（生成AIによる取得を含む）を許可しています。各ページの見出し直下に、その日・その地点の満潮・干潮時刻、潮回り、干満差を平文の段落として記載しているので、ページ本文を読めば要約に必要な数値が揃います。
`);

function writeSitemaps() {
  const PER = 20000;   // 仕様上限は50,000。余裕を持たせる
  const chunks = [];
  for (let i = 0; i < allUrls.length; i += PER) chunks.push(allUrls.slice(i, i + PER));

  chunks.forEach((chunk, i) => {
    const body = chunk.map(u =>
      `<url><loc>${u.loc}</loc><lastmod>${u.lastmod}</lastmod>`
      + `<changefreq>${u.changefreq}</changefreq><priority>${u.priority.toFixed(1)}</priority></url>`).join('\n');
    fs.writeFileSync(path.join(DIST, `sitemap-${i + 1}.xml`),
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`);
  });

  // sitemap-N.xml 自体は個々のURLのlastmodが混在するファイルなので、
  // インデックス側の lastmod は「このファイルを書き出した日」で正しい。
  const idx = chunks.map((_, i) =>
    `<sitemap><loc>${SITE.ORIGIN}${SITE.BASE}/sitemap-${i + 1}.xml</loc><lastmod>${todayKey}</lastmod></sitemap>`).join('\n');
  fs.writeFileSync(path.join(DIST, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${idx}\n</sitemapindex>\n`);
}

console.log(`\n生成: ${written} ページ / sitemap ${allUrls.length} URL`);
console.log(`ビルド時間: ${((Date.now() - tBuild) / 1000).toFixed(1)}s (取得込み ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
