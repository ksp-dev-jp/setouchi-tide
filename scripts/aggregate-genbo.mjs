// =====================================================================
// 実測の毎時潮位偏差（scripts/fetch-genbo.mjs のキャッシュ）を地点ごとに
// 集計し、lib/observed-stats.mjs に書き出す
//
//   node scripts/aggregate-genbo.mjs                 2016〜2025年
//   node scripts/aggregate-genbo.mjs --from 2016 --to 2025
//
// 毎日のビルドは気象庁の潮汐観測資料を取りに行かず、この集計結果だけを読む。
// 過去の確定値は変わらないので、年が替わって1年分を足すときだけ再実行する。
// =====================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GENBO_CACHE, depPath } from './fetch-genbo.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'lib', 'observed-stats.mjs');

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i === -1 ? dflt : args[i + 1];
};
const FROM = Number(opt('--from', 2016));
const TO = Number(opt('--to', 2025));

// 1行 = 1日。先頭96桁が4桁×24時間の偏差、続いて年4・月2・日2・記号2。
// 欠測の時刻は空白になる。
export function parseDep(text) {
  const days = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.length < 106) continue;
    const hours = [];
    for (let h = 0; h < 24; h++) {
      const s = line.slice(h * 4, h * 4 + 4).trim();
      hours.push(s === '' ? null : Number(s));
    }
    const y = line.slice(96, 100), m = line.slice(100, 102).trim().padStart(2, '0'), d = line.slice(102, 104).trim().padStart(2, '0');
    days.push({ ymd: `${y}-${m}-${d}`, hours });
  }
  return days;
}

const round1 = v => Math.round(v * 10) / 10;
const pct = (n, total) => (total ? round1(n / total * 100) : null);

// 1地点ぶんの集計。月別の値は年をまたいで同じ月を合わせたもの。
export function aggregateStation(code, from, to) {
  const month = Array.from({ length: 12 }, () => ({ n: 0, sum: 0, hi20: 0, lo20: 0 }));
  const year = {};
  let n = 0, sum = 0, sq = 0, abs10 = 0, abs20 = 0, abs30 = 0, expected = 0;
  let maxHigh = { cm: -Infinity }, maxLow = { cm: Infinity };
  const absAll = [];

  for (let y = from; y <= to; y++) {
    year[y] = { n: 0, sum: 0 };
    for (let m = 1; m <= 12; m++) {
      expected += new Date(Date.UTC(y, m, 0)).getUTCDate() * 24;
      const p = depPath(code, y, m);
      if (!fs.existsSync(p)) continue;
      for (const { ymd, hours } of parseDep(fs.readFileSync(p, 'latin1'))) {
        hours.forEach((v, h) => {
          if (v == null) return;
          // 取り込みの誤りや観測障害の疑いが強い値は除く(過去の高潮でも
          // 偏差は2mに届かない)
          if (Math.abs(v) > 300) return;
          n++; sum += v; sq += v * v;
          const a = Math.abs(v);
          absAll.push(a);
          if (a >= 10) abs10++;
          if (a >= 20) abs20++;
          if (a >= 30) abs30++;
          const mo = month[m - 1];
          mo.n++; mo.sum += v;
          if (v >= 20) mo.hi20++;
          if (v <= -20) mo.lo20++;
          year[y].n++; year[y].sum += v;
          const at = `${ymd} ${String(h).padStart(2, '0')}時`;
          if (v > maxHigh.cm) maxHigh = { cm: v, at };
          if (v < maxLow.cm) maxLow = { cm: v, at };
        });
      }
    }
  }
  if (!n) return null;
  absAll.sort((a, b) => a - b);
  const mean = sum / n;
  const yearMean = Object.fromEntries(Object.entries(year).map(([y, o]) => [y, o.n ? round1(o.sum / o.n) : null]));
  const ym = Object.values(yearMean).filter(v => v != null);
  // 年平均の偏差が年ごとに大きく動く地点(三宅島・南鳥島)は、天文潮位の
  // 予測誤差より地盤の上下や観測の事情が効いている疑いが強い。地点ページでは
  // 注記を付け、全国の比較や順位からは外す。
  // 東海〜紀伊の太平洋側も15〜18cm動くが、これは黒潮大蛇行(2017〜2025年)で
  // 海面が実際に高くなったためで、外すべき誤差ではない。閾値はその上に置く。
  const yearSpread = round1(Math.max(...ym) - Math.min(...ym));
  return {
    from, to,
    coverage: pct(n, expected),           // 期間中の毎時値のうち観測があった割合(%)
    hours: n,
    mean: round1(mean),                   // 期間全体の平均偏差(cm)
    sd: round1(Math.sqrt(sq / n - mean * mean)),
    p95: absAll[Math.floor(absAll.length * 0.95)], // 偏差の大きさの95パーセンタイル(cm)
    share10: pct(abs10, n),               // |偏差|≧10cm の時間の割合(%)
    share20: pct(abs20, n),
    share30: pct(abs30, n),
    monthMean: month.map(mo => (mo.n ? round1(mo.sum / mo.n) : null)),
    monthHigh20: month.map(mo => pct(mo.hi20, mo.n)), // 偏差≧+20cm の割合(%)
    monthLow20: month.map(mo => pct(mo.lo20, mo.n)),  // 偏差≦−20cm の割合(%)
    yearMean,
    yearSpread,                           // 年平均偏差の最大−最小(cm)
    unstable: yearSpread > 25 || n / expected < 0.7,
    maxHigh, maxLow,
  };
}

function main() {
  const dir = path.join(GENBO_CACHE, 'dep');
  const codes = fs.readdirSync(dir).sort();
  const out = {};
  for (const code of codes) {
    const s = aggregateStation(code, FROM, TO);
    if (s) out[code] = s;
  }
  const body = `// =====================================================================
// 実測と潮見表(推算)のずれ — 地点ごとの集計（自動生成。手で編集しないこと）
//
// scripts/aggregate-genbo.mjs が気象庁「潮汐観測資料」の毎時潮位偏差
// (実測潮位 − 天文潮位) を ${FROM}〜${TO}年ぶん集計した結果。
// キーは気象庁の観測地点記号(lib/stations.mjs の jma)。
// 出典: 気象庁 潮汐観測資料 https://www.data.jma.go.jp/kaiyou/db/tide/genbo/
// =====================================================================

export const OBSERVED_STATS = ${JSON.stringify(out, null, 0).replace(/\},"/g, '},\n"')};
`;
  fs.writeFileSync(OUT, body);
  console.log(`${Object.keys(out).length} 地点を ${path.relative(process.cwd(), OUT)} に書き出した`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
