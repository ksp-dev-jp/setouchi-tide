// =====================================================================
// 気象庁 潮汐観測資料（実測）の毎時潮位偏差を取得してキャッシュする
//
//   node scripts/fetch-genbo.mjs                     2016〜2025年の全地点
//   node scripts/fetch-genbo.mjs --from 2024 --to 2024 --stn TK,OS
//
// 潮位偏差 = 実測潮位 − 天文潮位（推算）。サイト本体が使っている潮位表
// (suisan) と同じ気象庁の予測値との差なので、「潮見表がどれだけ当たるか」
// をそのまま表す。
//
//   https://www.data.jma.go.jp/kaiyou/data/db/tide/genbo/{年}/{年月}/dep{年月}{記号}.txt
//   1行 = 1日。4桁×24時間の偏差(cm、欠測は空白) + 年4桁 + 月2桁 + 日2桁 + 記号2桁
//
// 過去の確定値は変わらないので、一度取った月は二度と取りに行かない。
// 毎日のビルドでは使わず、集計結果(scripts/aggregate-genbo.mjs の出力)
// だけをリポジトリに入れる。先方の負荷を考え、取得は1秒に1回までにする。
// =====================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TIDE_STATIONS } from '../lib/stations.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const GENBO_CACHE = path.join(__dirname, '..', '.cache', 'genbo');
const BASE = 'https://www.data.jma.go.jp/kaiyou/data/db/tide/genbo';
const INDEX = 'https://www.data.jma.go.jp/kaiyou/db/tide/genbo/index.php';
const UA = 'japan-tide-atlas static site builder';
const INTERVAL_MS = 1000;

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i === -1 ? dflt : args[i + 1];
};
const FROM = Number(opt('--from', 2016));
const TO = Number(opt('--to', 2025));
const ONLY = opt('--stn', null)?.split(',');

const sleep = ms => new Promise(r => setTimeout(r, ms));

// 実測のある観測点の記号は、潮汐観測資料のトップにある地点選択から取る。
// 潮位表(suisan)と同じ記号体系なので、サイトの公式観測点と突き合わせられる。
async function genboCodes() {
  const res = await fetch(INDEX, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error('地点一覧の取得に失敗: HTTP ' + res.status);
  const html = await res.text();
  const sel = html.slice(html.indexOf('name="stn"'));
  return [...sel.slice(0, sel.indexOf('</select>')).matchAll(/value="([A-Z0-9]{2})"/g)].map(m => m[1]);
}

export function depPath(code, year, month) {
  const ym = `${year}${String(month).padStart(2, '0')}`;
  return path.join(GENBO_CACHE, 'dep', code, ym + '.txt');
}

async function fetchMonth(code, year, month, attempt = 0) {
  const ym = `${year}${String(month).padStart(2, '0')}`;
  const u = `${BASE}/${year}/${ym}/dep${ym}${code}.txt`;
  try {
    const res = await fetch(u, { headers: { 'User-Agent': UA } });
    // その月に観測が無かった地点は404になる。空のファイルを置いて取り直さない。
    if (res.status === 404) return '';
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.text();
  } catch (e) {
    if (attempt < 2) {
      await sleep(3000 * (attempt + 1));
      return fetchMonth(code, year, month, attempt + 1);
    }
    throw new Error(`${u} の取得に失敗: ${e.message}`);
  }
}

async function main() {
  const official = new Set(TIDE_STATIONS.filter(s => !s.jmaAnchor).map(s => s.jma));
  const codes = (await genboCodes()).filter(c => official.has(c) && (!ONLY || ONLY.includes(c)));
  const jobs = [];
  for (const code of codes)
    for (let y = FROM; y <= TO; y++)
      for (let m = 1; m <= 12; m++)
        if (!fs.existsSync(depPath(code, y, m))) jobs.push([code, y, m]);

  console.log(`地点 ${codes.length}、${FROM}〜${TO}年、未取得 ${jobs.length} か月`);
  // 一時的な 502 などで取れなかった月はファイルを置かずに飛ばす。
  // 再実行すれば未取得の月だけを取り直す。
  let done = 0, missing = 0;
  const failed = [];
  for (const [code, y, m] of jobs) {
    const t0 = Date.now();
    let text;
    try {
      text = await fetchMonth(code, y, m);
    } catch (e) {
      failed.push(`${code} ${y}-${m}`);
      console.log('  ' + e.message);
      await sleep(10000);
      continue;
    }
    if (!text) missing++;
    const p = depPath(code, y, m);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, text);
    done++;
    if (done % 50 === 0 || done === jobs.length)
      console.log(`  ${done}/${jobs.length}（観測なし ${missing}）${code} ${y}-${m}`);
    await sleep(Math.max(0, INTERVAL_MS - (Date.now() - t0)));
  }
  if (failed.length) console.log(`取得できなかった月 ${failed.length} 件（再実行で取り直す）: ${failed.join(', ')}`);
  console.log('完了');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e.message); process.exit(1); });
}
