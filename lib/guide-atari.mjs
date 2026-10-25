// =====================================================================
// 潮見表はどれくらい当たるかの記事（/guide/shiomihyo-atari/）
//
// 気象庁「潮汐観測資料」の毎時潮位偏差(実測潮位 − 天文潮位)を、
// scripts/aggregate-genbo.mjs が地点ごとに10年分集計した結果
// (lib/observed-stats.mjs)から、本文の数字と表をすべて組み立てる。
// 集計し直せば本文の数字もそのまま追従する。
//
// 年平均の偏差が大きく振れる地点(unstable)は、天文潮位の予測誤差より
// 地盤の上下や観測の事情が効いている疑いが強いので、全国の数字からは外す。
// 台風の名前は、日付が気象庁の記録と一致するものだけを付けている。
// =====================================================================

import { attr, esc } from './html.mjs';
import { paths } from './routes.mjs';
import { SITE, url } from '../config.mjs';
import { TIDE_STATIONS, REGIONS } from './stations.mjs';
import { stationLabel } from './station-quality.mjs';
import { OBSERVED_STATS } from './observed-stats.mjs';

export const GENBO_URL = 'https://www.data.jma.go.jp/kaiyou/db/tide/genbo/index.php';

const official = new Map(TIDE_STATIONS.filter(s => !s.jmaAnchor).map(s => [s.jma, s]));
const ALL = Object.entries(OBSERVED_STATS)
  .filter(([c]) => official.has(c))
  .map(([c, v]) => ({ st: official.get(c), ...v }));
const OK = ALL.filter(x => !x.unstable);
const EXCLUDED = ALL.filter(x => x.unstable);
const { from: FROM, to: TO } = ALL[0];

const regionOf = new Map(REGIONS.flatMap(r => r.prefs.map(p => [p, r.name])));
const avg = (list, f) => list.reduce((s, x) => s + f(x), 0) / list.length;
const fix1 = v => (Math.round(v * 10) / 10).toFixed(1);
const signed = v => (v > 0 ? '+' : v < 0 ? '−' : '') + fix1(Math.abs(v));
const median = arr => {
  const a = [...arr].sort((x, y) => x - y);
  return a[a.length >> 1];
};
const name = x => stationLabel(x.st);
const link = x => `<a href="${attr(paths.station(x.st))}">${esc(name(x))}</a>`;

export const TYPHOONS = {
  '2017-10-23': '平成29年台風第21号',
  '2018-09-04': '平成30年台風第21号',
  '2019-10-12': '令和元年東日本台風（台風第19号）',
  '2022-09-18': '令和4年台風第14号',
};

// 全国の数字
const share10 = avg(OK, x => x.share10);
const share20 = avg(OK, x => x.share20);
const share30 = avg(OK, x => x.share30);
const p95 = median(OK.map(x => x.p95));
const hours20 = Math.round(share20 / 100 * 8766);
const monthShare20 = Array.from({ length: 12 }, (_, i) => avg(OK, x => (x.monthHigh20[i] ?? 0) + (x.monthLow20[i] ?? 0)));
const monthHigh = Array.from({ length: 12 }, (_, i) => avg(OK, x => x.monthHigh20[i] ?? 0));
const monthLow = Array.from({ length: 12 }, (_, i) => avg(OK, x => x.monthLow20[i] ?? 0));
const argmax = arr => arr.indexOf(Math.max(...arr));
const argmin = arr => arr.indexOf(Math.min(...arr));

const byShare = [...OK].sort((a, b) => b.share20 - a.share20);
const regions = REGIONS.map(r => {
  const list = OK.filter(x => regionOf.get(x.st.pref) === r.name);
  return list.length ? { r, n: list.length, share20: avg(list, x => x.share20), p95: avg(list, x => x.p95) } : null;
}).filter(Boolean).sort((a, b) => b.share20 - a.share20);

const highs = [...OK].sort((a, b) => b.maxHigh.cm - a.maxHigh.cm).slice(0, 10);
const lows = [...OK].sort((a, b) => a.maxLow.cm - b.maxLow.cm).slice(0, 5);
const fmtAt = at => {
  const [d, h] = at.split(' ');
  const [y, m, dd] = d.split('-').map(Number);
  return `${y}年${m}月${dd}日 ${parseInt(h, 10)}時`;
};

// 黒潮が流れる東海〜紀伊の太平洋側。年平均の偏差の推移を、東京・大阪と並べる。
const PACIFIC = ['赤羽根', '鳥羽', '熊野', '浦神'];
const COMPARE = ['東京', '大阪'];
const byName = n => OK.find(x => name(x) === n);
const years = Array.from({ length: TO - FROM + 1 }, (_, i) => String(FROM + i));
const pacific = PACIFIC.map(byName).filter(Boolean);
const pacPeak = Math.max(...pacific.flatMap(x => years.map(y => x.yearMean[y] ?? -Infinity)));
const natYear = Object.fromEntries(years.map(y => [y, avg(OK.filter(x => x.yearMean[y] != null), x => x.yearMean[y])]));

const figure = (label, inner, caption) => `<figure class="guide-visual" aria-label="${attr(label)}">${inner}<figcaption>${caption}</figcaption></figure>`;

// 記事の図。月ごとに「±20cm以上ずれた時間の割合」を全国平均で並べる。
// 冒頭に差し込む共通の図(guideVisual)ではなく、季節の節の中に置く。
function monthChart() {
  const max = Math.max(...monthShare20);
  const bars = monthShare20.map((v, i) => `<div class="visual-bar-row"><span>${i + 1}月</span><div class="visual-bar-track"><i style="width:${(v / max * 100).toFixed(1)}%"></i></div><b>${fix1(v)}%</b></div>`).join('');
  return `${figure('月ごとの20cm以上ずれた時間の割合', `<div class="visual-bars">${bars}</div>`,
    `気象庁 潮汐観測資料の毎時潮位偏差（${FROM}〜${TO}年）から、全国${OK.length}地点について、実測が潮見表より20cm以上高いか低かった時間の割合を月ごとに求め、地点の平均をとった値です。`)}`;
}

const yearTable = () => {
  const rows = [...pacific, ...COMPARE.map(byName).filter(Boolean)];
  const cell = v => `<td class="rg">${v == null ? '—' : signed(v)}</td>`;
  return `<div class="tw"><table class="prefsum">
  <thead><tr><th>年</th>${rows.map(x => `<th>${esc(name(x))}</th>`).join('')}<th>全国平均</th></tr></thead>
  <tbody>${years.map(y => `<tr><th scope="row">${y}年</th>${rows.map(x => cell(x.yearMean[y])).join('')}${cell(natYear[y])}</tr>`).join('')}</tbody>
</table></div>`;
};

const stationTable = () => `<details class="fold">
  <summary>全${OK.length}地点の一覧（20cm以上ずれた時間の割合が大きい順）</summary>
  <div class="tw"><table class="prefsum">
    <thead><tr><th>地点</th><th>20cm以上</th><th>10cm以上</th><th>95%が収まる幅</th></tr></thead>
    <tbody>${byShare.map(x => `<tr><th scope="row">${link(x)}</th><td class="rg">${fix1(x.share20)}%</td><td class="rg">${fix1(x.share10)}%</td><td class="rg">±${x.p95}cm</td></tr>`).join('')}</tbody>
  </table></div>
</details>`;

const top5 = byShare.slice(0, 5), bottom5 = byShare.slice(-5).reverse();
// 上位15地点のうち、東海〜近畿の太平洋側(伊勢湾・遠州灘・熊野灘・大阪湾・紀伊水道)の地点数
const TOKAI_KINKI = new Set(['shizuoka', 'aichi', 'mie', 'wakayama', 'osaka', 'hyogo']);
const top15Pacific = byShare.slice(0, 15).filter(x => TOKAI_KINKI.has(x.st.pref)).length;
const shareRatio = Math.floor(byShare[0].share20 / byShare.at(-1).share20);
const jebi = OK.filter(x => x.maxHigh.at.startsWith('2018-09-04') && x.maxHigh.cm >= 100)
  .sort((a, b) => b.maxHigh.cm - a.maxHigh.cm);

export const ATARI_GUIDE = {
  slug: 'shiomihyo-atari',
  title: `潮見表はどれくらい当たる？ — 全国${OK.length}地点の実測${TO - FROM + 1}年分で確かめた`,
  description: `潮見表の潮位は月と太陽の動きから計算した予測値です。気象庁が観測した実際の潮位${TO - FROM + 1}年分と全国${OK.length}地点で突き合わせ、どれくらいずれるのか、どの季節・どの地点でずれやすいのかを集計しました。`,
  body: `
<p>潮見表に載っている潮位は、月と太陽の動きから計算した予測値（天文潮位）です。実際の海面は、気圧や風、海流の影響を受けて、この予測から上下にずれます。このずれを<b>潮位偏差</b>といいます（仕組みは<a href="${attr(url('guide', 'chou-i-hensa'))}">潮位偏差とは</a>で解説しています）。</p>
<p>では、そのずれは実際にどれくらいの大きさなのでしょうか。${esc(SITE.NAME)}では、気象庁が公開している<a href="${attr(GENBO_URL)}" target="_blank" rel="noopener">潮汐観測資料</a>から、${FROM}年から${TO}年までの${TO - FROM + 1}年間、全国${OK.length}地点の毎時の潮位偏差を集めて集計しました。潮見表の予測は気象庁の推算値で、${esc(SITE.NAME)}の各地点ページに載せている値と同じものです。</p>

<h2>結論：ずれは多くの時間で20cm以内</h2>
<ul>
  <li>実際の潮位が潮見表から<b>10cm以上</b>ずれていた時間は、全体の<b>${fix1(share10)}%</b>でした（全国${OK.length}地点の平均）。</li>
  <li><b>20cm以上</b>ずれていた時間は<b>${fix1(share20)}%</b>です。1年に直すとおよそ${hours20}時間で、まったく珍しいことではありません。</li>
  <li><b>30cm以上</b>のずれは${fix1(share30)}%で、ここまでずれる時間はまれです。</li>
  <li>地点ごとに「95%の時間はこの幅に収まる」という値を求めると、中央値は<b>±${p95}cm</b>でした。</li>
</ul>
<p>潮見表の数字は、ふだんの日なら<b>±20cm程度の幅を持たせて読む</b>のが実態に合っています。干潮の潮位がぎりぎりの磯や、船底の余裕が少ない浅瀬では、この幅を見込んで計画してください。</p>

<h2>季節：春から初夏はずれにくい</h2>
<p>20cm以上ずれる時間の割合は、${argmin(monthShare20) + 1}月が${fix1(Math.min(...monthShare20))}%でいちばん小さく、${argmax(monthShare20) + 1}月が${fix1(Math.max(...monthShare20))}%でいちばん大きくなりました。春から初夏は予測どおりに近く、台風の時期と冬にずれが大きくなります。</p>
${monthChart()}
<p>ずれの向きにも季節の傾向があります。実測が潮見表より<b>20cm以上高かった</b>時間は${argmax(monthHigh) + 1}月（${fix1(Math.max(...monthHigh))}%）がいちばん多く、<b>20cm以上低かった</b>時間は${argmax(monthLow) + 1}月（${fix1(Math.max(...monthLow))}%）がいちばん多くなりました。高くずれると干潮で思ったほど引かず、低くずれると満潮で思ったほど満ちません。潮干狩りや磯遊びで干潮の引きを当てにする日は、高いほうへのずれに注意が要ります。</p>

<h2>地域：中部・近畿はずれやすい</h2>
<p>地方ごとに「20cm以上ずれた時間の割合」を平均すると、次のようになりました。</p>
<div class="tw"><table class="prefsum">
  <thead><tr><th>地方</th><th>地点数</th><th>20cm以上ずれた時間</th><th>95%が収まる幅</th></tr></thead>
  <tbody>${regions.map(g => `<tr><th scope="row"><a href="${attr(paths.region(g.r))}">${esc(g.r.name)}</a></th><td class="rg">${g.n}</td><td class="rg">${fix1(g.share20)}%</td><td class="rg">±${Math.round(g.p95)}cm</td></tr>`).join('')}</tbody>
</table></div>
<p>ずれやすかったのは${top5.map(link).join('、')}などです。上位15地点のうち${top15Pacific}地点が、遠州灘・伊勢湾・熊野灘・大阪湾・紀伊水道に面した東海〜近畿の地点でした。浅く広い湾の奥では、風で海水が吹き寄せられて潮位が上がりやすいことが知られています。また、この期間は黒潮が大きく蛇行していた時期と重なり、太平洋側の一部で潮位が高い状態が長く続きました（次の節）。</p>
<p>反対にずれにくかったのは${bottom5.map(link).join('、')}などでした。20cm以上ずれる時間の割合で比べると、いちばんずれやすい地点といちばんずれにくい地点では${shareRatio}倍以上の差があります。同じ潮見表でも、地点によって当たり方はかなり違います。</p>
${stationTable()}

<h2>年ごと：黒潮の大蛇行で、潮見表より高い年が続いた</h2>
<p>1年間の平均で見ると、ずれはふつう数cmに収まります。ところが東海〜紀伊の太平洋側では、${PACIFIC.join('・')}のいずれでも2019年から2021年にかけて年平均が潮見表より高くなり、最も高い年は+${fix1(pacPeak)}cmに達しました。この時期は、気象庁が「黒潮大蛇行」が続いていると発表していた期間と重なります。黒潮の流れ方が変わると沿岸の水位が変わり、それが何年も続くことがあります。</p>
<p>一方で、${TO}年には同じ地点の年平均が潮見表より低くなりました。潮見表は過去の観測をもとにした「平均的な海面」を前提にしているので、海の状態が何年も平均から外れていると、季節や天気とは関係なく、潮見表の数字がそのぶん高め・低めに出続けることになります。</p>
${yearTable()}
<p class="note">年平均の潮位偏差（cm）。＋は実測が潮見表より高かったことを表します。全国平均は、印を付けて除いた地点を除く${OK.length}地点の平均です。</p>

<h2>大きくずれた日：台風の高潮</h2>
<p>この${TO - FROM + 1}年間で、実測が潮見表より大きく高くなった記録は次のとおりです（毎時の値で、各地点の最大）。</p>
<div class="tw"><table class="prefsum">
  <thead><tr><th>地点</th><th>潮見表との差</th><th>日時</th><th>主な原因</th></tr></thead>
  <tbody>${highs.map(x => `<tr><th scope="row">${link(x)}</th><td class="hi">+${x.maxHigh.cm}cm</td><td>${esc(fmtAt(x.maxHigh.at))}</td><td>${esc(TYPHOONS[x.maxHigh.at.slice(0, 10)] || '—')}</td></tr>`).join('')}</tbody>
</table></div>
<p>上位はほとんどが台風の通過時で、なかでも${esc(TYPHOONS['2018-09-04'])}が通過した2018年9月4日には、${jebi.map(x => esc(name(x))).join('・')}で潮見表より1m以上高い潮位になりました。毎時の値なので、ピークの瞬間はこれより高かった可能性があります。台風や発達した低気圧が近づく日は、潮見表の数字は安全の判断に使えません。気象庁の高潮警報・注意報を必ず確認してください（<a href="${attr(url('guide', 'takashio-ijouchoui'))}">高潮と異常潮位</a>）。</p>
<p>低いほうへのずれは、大きくても${lows[0] ? Math.abs(lows[0].maxLow.cm) : ''}cm程度でした（${lows.slice(0, 3).map(x => `${link(x)} −${Math.abs(x.maxLow.cm)}cm`).join('、')}）。高いほうへのずれに比べると、ずっと小さな幅に収まっています。</p>

<h2>潮見表を使うときの目安</h2>
<ul>
  <li><b>ふだんの日</b>は、潮見表の潮位に±20cmほどの幅があると考えます。干潮の潮位がぎりぎりで歩ける場所は、20cm高くても大丈夫かを確かめてから行きます。</li>
  <li><b>低気圧が近い日・強い風が岸に向かって吹く日</b>は、潮見表より高くなりやすくなります。干潮で引くのを当てにした計画は控えめにします。</li>
  <li><b>台風が近づく日</b>は、潮見表とまったく違う潮位になることがあります。海に近づかないでください。</li>
  <li>地点ページでは、気象庁の潮位観測情報に対応している地点について、その日の実測と天文潮位の差を表示しています。出かける前に確認すると、その日のずれ方が分かります。</li>
</ul>

<h2>集計の方法</h2>
<p>気象庁「潮汐観測資料」の毎時潮位偏差（実測潮位 − 天文潮位、単位cm）を、${FROM}年1月から${TO}年12月まで、潮位表の観測点と一致する${ALL.length}地点について取得しました。欠測の時刻は除いています。割合は、各地点で欠測を除いた時間数に対する割合を求めてから、地点の間で平均した値です。</p>
<p>次の${EXCLUDED.length}地点は全国の数字から除きました：${EXCLUDED.map(x => esc(name(x))).join('、')}。年平均の偏差が年によって25cm以上動いた地点（地盤の上下など、潮位の予測とは別の要因が大きいと考えられる地点）と、期間中に観測のあった時間が7割未満の地点です。</p>
<p class="note">出典：気象庁 潮汐観測資料（<a href="${attr(GENBO_URL)}" target="_blank" rel="noopener">${esc(GENBO_URL)}</a>）。数値は${esc(SITE.NAME)}が集計・加工したものです。</p>`,
};
