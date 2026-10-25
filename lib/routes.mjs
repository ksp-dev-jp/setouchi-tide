// =====================================================================
// URL 設計とスラッグ生成
//
//   /                                    トップ（全国）
//   /{region}/                           地方         例 /chugoku/
//   /{pref}/                             都道府県     例 /hiroshima/
//   /{pref}/{station}/                   地点・当日   例 /hiroshima/広島/
//   /{pref}/{station}/week/              週間
//   /{pref}/{station}/{YYYY-MM}/         月間
//   /{pref}/{station}/{YYYY-MM-DD}/      日別
//
// 地点スラッグに日本語をそのまま使う理由:
//   観測点名(「広島」「宮島」)は検索クエリそのものであり、Google は URL 中の
//   一致セグメントを太字にする。ローマ字化しようにも stations.js の kana は
//   既存51地点以外は空で、推測でローマ字を作ると誤った読みが URL に固定される。
//   percent-encode は canonical / sitemap 出力側で行う。
// =====================================================================

import { REGIONS, PREFS, TIDE_STATIONS } from './stations.mjs';
import { SERVED_STATIONS } from './serve-stations.mjs';
import { url, absUrl } from '../config.mjs';

// URL に使えない文字だけを落とす。日本語はそのまま残す。
function slugify(name) {
  return name
    .replace(/[（(]/g, '-')
    .replace(/[）)]/g, '')
    .replace(/[\s　/／\\?#&%+.,、。'"“”‘’:：;；<>[\]{}|^~`!$@*=]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

const prefById = new Map(PREFS.map(p => [p.id, p]));
const regionById = new Map(REGIONS.map(r => [r.id, r]));

// 同一県内でスラッグが衝突したら観測点コードを添えて一意にする
const stationsByPref = new Map();
for (const st of TIDE_STATIONS) {
  if (!stationsByPref.has(st.pref)) stationsByPref.set(st.pref, []);
  stationsByPref.get(st.pref).push(st);
}

const slugOf = new Map();     // station.id -> slug
for (const [pref, list] of stationsByPref) {
  const used = new Map();
  for (const st of list) {
    let s = slugify(st.name);
    if (used.has(s)) s = s + '-' + st.jma.toLowerCase();
    let n = 2;
    while (used.has(s)) s = slugify(st.name) + '-' + n++;
    used.set(s, st.id);
    slugOf.set(st.id, s);
  }
}

// ページを出す地点だけの都道府県別リスト。スラッグの採番は上の全地点で
// 行い、配信対象の絞り込みはここでだけ効かせる（URL を変えないため）。
const servedByPref = new Map();
for (const st of SERVED_STATIONS) {
  if (!servedByPref.has(st.pref)) servedByPref.set(st.pref, []);
  servedByPref.get(st.pref).push(st);
}

// 逆引き（同じ pref 内で一意）
const stationBySlug = new Map();
for (const st of TIDE_STATIONS) stationBySlug.set(st.pref + '/' + slugOf.get(st.id), st);

// 観測点データの整合性検査。
// id やスラッグが重複していると、生成した HTML が静かに上書きされて
// ページが消える。件数が合わないだけで気づきにくいので、ここで落とす。
export function validateStations() {
  const problems = [];

  const byId = new Map();
  for (const st of TIDE_STATIONS) {
    if (byId.has(st.id)) problems.push(`id 重複: ${st.id} (${byId.get(st.id).name} と ${st.name})`);
    byId.set(st.id, st);
  }

  const bySlug = new Map();
  for (const st of TIDE_STATIONS) {
    const k = st.pref + '/' + slugOf.get(st.id);
    if (bySlug.has(k)) problems.push(`スラッグ重複: ${k} (${bySlug.get(k).name} と ${st.name})`);
    bySlug.set(k, st);
  }

  // 地方 id と都道府県 id が同じだと URL がぶつかる。/area/ を挟んでいるので
  // 現状は起きないが、URL 設計を変えたときに気づけるよう検査は残す。
  for (const st of TIDE_STATIONS) {
    const s = slugOf.get(st.id);
    if (s === 'week' || /^\d{4}-\d{2}(-\d{2})?$/.test(s)) {
      problems.push(`予約語と衝突するスラッグ: ${st.pref}/${s}`);
    }
  }

  if (problems.length) {
    throw new Error('観測点データに問題があります:\n  ' + problems.join('\n  '));
  }
}

export function stationSlug(st) { return slugOf.get(st.id); }

// ---------------------------------------------------------------------
// title / description 用の一意な地点名
//
// 「大島港」は3県に、「沼津港」は静岡県内に2つある。地点名だけで title を
// 組むと 10,969ページのうち数十枚が同一タイトルになり、検索結果で共食いする。
//
//   1. 全国で一意なら           そのまま          例: 広島
//   2. 県名を足せば一意なら     県名+地点名        例: 静岡県大島港
//   3. それでも重複するなら     験潮所名を添える    例: 静岡県沼津港（内浦）
// ---------------------------------------------------------------------
// st.jmaName は build 側で後から付くので、初回呼び出し時にまとめて決める。
let uniqueNames = null;

function buildUniqueNames() {
  const nameCount = new Map();
  for (const st of TIDE_STATIONS) nameCount.set(st.name, (nameCount.get(st.name) || 0) + 1);

  const prefNameCount = new Map();
  for (const st of TIDE_STATIONS) {
    const k = st.pref + '/' + st.name;
    prefNameCount.set(k, (prefNameCount.get(k) || 0) + 1);
  }

  const out = new Map(), used = new Set();
  for (const st of TIDE_STATIONS) {
    const pn = prefById.get(st.pref).name;
    let n;
    if (nameCount.get(st.name) === 1) n = st.name;
    else if (prefNameCount.get(st.pref + '/' + st.name) === 1) n = pn + st.name;
    else n = `${pn}${st.name}（${st.jmaName || st.jma}）`;
    // 験潮所名まで同じ場合の最後の逃げ道。ここに来るのは異常なデータだが、
    // タイトルが重複したまま出るよりはスラッグで分けたほうがまだよい。
    if (used.has(n)) n = `${pn}${st.name}（${slugOf.get(st.id)}）`;
    used.add(n);
    out.set(st.id, n);
  }
  return out;
}

export function uniqueName(st) {
  if (!uniqueNames) uniqueNames = buildUniqueNames();
  return uniqueNames.get(st.id) || st.name;
}
export function pref(id) { return prefById.get(id); }
export function region(id) { return regionById.get(id); }
export function prefStations(prefId) { return servedByPref.get(prefId) || []; }

export function regionPrefs(regionId) {
  return regionById.get(regionId).prefs
    .map(id => prefById.get(id))
    .filter(p => (servedByPref.get(p.id) || []).length > 0);
}

export function regionStationCount(regionId) {
  return regionById.get(regionId).prefs
    .reduce((n, id) => n + (servedByPref.get(id) || []).length, 0);
}

// 観測点が属する地方
export function regionOf(st) {
  return regionById.get(prefById.get(st.pref).region);
}

// ---- パス生成 -------------------------------------------------------
//
// 地方だけ /area/ を挟むのは、地方 id と都道府県 id が衝突するため。
// REGIONS にも PREFS にも 'hokkaido' があり、/hokkaido/ を両方が使うと
// 片方がもう片方を上書きして消える。
const seg = (...s) => s;
export const paths = {
  home: () => url(),
  region: r => url('area', r.id),
  pref: p => url(p.id),
  station: st => url(st.pref, slugOf.get(st.id)),
  week: st => url(st.pref, slugOf.get(st.id), 'week'),
  month: (st, ym) => url(st.pref, slugOf.get(st.id), ym),
  day: (st, ymd) => url(st.pref, slugOf.get(st.id), ymd),
  guideIndex: () => url('guide'),
  guide: slug => url('guide', slug),
  activityIndex: () => url('youto'),
  activity: slug => url('youto', slug),
  tool: slug => url('tool', slug),
};

// canonical / JSON-LD 用の絶対 URL。paths と必ず同じ組み立てにすること。
export const abs = {
  home: () => absUrl(),
  region: r => absUrl('area', r.id),
  pref: p => absUrl(p.id),
  station: st => absUrl(st.pref, slugOf.get(st.id)),
  week: st => absUrl(st.pref, slugOf.get(st.id), 'week'),
  month: (st, ym) => absUrl(st.pref, slugOf.get(st.id), ym),
  day: (st, ymd) => absUrl(st.pref, slugOf.get(st.id), ymd),
  guideIndex: () => absUrl('guide'),
  guide: slug => absUrl('guide', slug),
  activityIndex: () => absUrl('youto'),
  activity: slug => absUrl('youto', slug),
  tool: slug => absUrl('tool', slug),
};

// ---- 出力先ファイルパス --------------------------------------------
// url() は BASE 込みなので、dist からの相対パスに直して index.html を足す。
export function outFile(u, base) {
  const rel = u.startsWith(base) ? u.slice(base.length) : u;
  return rel.replace(/^\/+|\/+$/g, '') + (rel === '/' || rel === '' ? '' : '/') + 'index.html';
}

export { stationBySlug };
