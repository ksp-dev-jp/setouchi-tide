// =====================================================================
// X(旧Twitter)の週1投稿の文面を作る
//
//   node scripts/weekly-x.mjs            今度の土曜日の週末ぶんを標準出力へ
//   node scripts/weekly-x.mjs 2026-11-14 指定の土曜日の週末ぶん
//
// 投稿はしない。文面を作るだけ。
// X の文字数は全角2・半角1で数えて280まで(URL は長さによらず23)。超えたら落とす。
// =====================================================================

import { TIDE_STATIONS } from '../lib/stations.mjs';
import { loadYears } from '../lib/jma.mjs';
import { tideDayLight } from '../lib/tide.mjs';
import { celestialData } from '../lib/astro.mjs';
import { dayKeyOf, dayMsOf, addDays, todayJSTMs, fmtHM, WD } from '../lib/util.mjs';
import { paths } from '../lib/routes.mjs';
import { SITE } from '../config.mjs';

const CITIES = [
  // 釣歩記の動画は瀬戸内と西日本が中心なので、その地域に寄せている
  ['広島', 'Q8'], ['徳山', 'QA'], ['松山', 'MT'], ['神戸', 'KB'], ['博多', 'QF'],
];

// 潮回りごとの一言。潮位の cm は観測点ごとに基準面が違って比べられないので、
// 地点をまたいで比べるのは干満差だけにする。
const SHIO_NOTE = {
  大潮: '潮がよく動く週末',
  中潮: 'ほどよく潮が動く週末',
  小潮: '潮の動きは小さめの週末',
  長潮: '潮の動きは小さめの週末',
  若潮: '潮の動きは小さめの週末',
};
const SITE_URL = 'https://japantide.com/';

function nextSaturday(fromMs) {
  let d = fromMs;
  while (new Date(d).getUTCDay() !== 6) d = addDays(d, 1);
  return d;
}

function weight(text) {
  const noUrl = text.replace(SITE_URL, '');
  let n = 23;
  for (const ch of noUrl) n += ch.charCodeAt(0) < 0x2000 ? 1 : 2;
  return n;
}

// 6時から18時までの、いちばん低い干潮
function dayLow(st, byDay, d) {
  const t = tideDayLight(st, byDay, d);
  if (!t) return null;
  const lows = t.lows.filter(e => e.time >= 6 && e.time <= 18);
  return lows.length ? lows.reduce((a, b) => (b.level < a.level ? b : a)) : null;
}

const arg = process.argv[2];
const sat = arg ? dayMsOf(arg) : nextSaturday(todayJSTMs());
const sun = addDays(sat, 1);
const stations = CITIES.map(([label, code]) => ({ label, st: TIDE_STATIONS.find(s => s.jma === code && !s.jmaAnchor) }));
if (stations.some(x => !x.st)) throw new Error('観測点が見つかりません');

const years = [...new Set([sat, sun].map(d => new Date(d).getUTCFullYear()))];
const jma = await loadYears(stations.map(x => x.st.jma), years);

const fmt = d => `${new Date(d).getUTCMonth() + 1}/${new Date(d).getUTCDate()}(${WD[new Date(d).getUTCDay()]})`;
const shio = celestialData(stations[0].st, sat).shio;
const shio2 = celestialData(stations[0].st, sun).shio;

const lines = stations.map(({ label, st }) => {
  const a = dayLow(st, jma[st.jma], sat), b = dayLow(st, jma[st.jma], sun);
  const v = e => (e ? `${fmtHM(e.time)} ${Math.round(e.level)}` : 'なし');
  return `${label} ${v(a)}／${v(b)}`;
});

// 5地点・土日のうち、干満差がいちばん大きいところ
const widest = stations.flatMap(({ label, st }) => [[sat, '土曜'], [sun, '日曜']].map(([d, day]) => ({
  label, day, range: tideDayLight(st, jma[st.jma], d).range,
}))).reduce((a, b) => (b.range > a.range ? b : a));

const post = `【週末の潮】${fmt(sat)}${shio}・${fmt(sun)}${shio2}
${SHIO_NOTE[shio]}。干満差は${widest.label}の${widest.day}が最大で${widest.range}cm
6〜18時の干潮と潮位cm（土／日）
${lines.join('\n')}
${SITE_URL}`;

const w = weight(post);
if (w > 280) throw new Error(`文字数オーバー: ${w}\n${post}`);
console.log(post);
console.error(`\n(X の文字数 ${w}/280, ${dayKeyOf(sat)} の週末, 確認先 ${SITE.ORIGIN}${paths.home()})`);
