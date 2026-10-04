// 既存ガイドの図解と、内容に対応した公的資料へのリンク。
import { SITE, asset, url } from '../config.mjs';
import { esc, attr } from './html.mjs';
import { tideDay, movingWindows } from './tide.mjs';
import { dayMsOf } from './util.mjs';
import { tsuriaruikiVisual } from './guide-tsuriaruki.mjs';

const sources = {
  terms: ['気象庁：潮汐・海面水位の用語集', 'https://www.data.jma.go.jp/kaiyou/db/tide/knowledge/tide/yougo.html'],
  mechanism: ['気象庁：潮汐の仕組み', 'https://www.data.jma.go.jp/kaiyou/db/tide/knowledge/tide/choseki.html'],
  table: ['気象庁：潮位表（推算値）', 'https://www.data.jma.go.jp/kaiyou/db/tide/suisan/index.php'],
  observation: ['気象庁：潮位観測情報の解説', 'https://www.data.jma.go.jp/kaiyou/db/tide/explanation.html'],
  current: ['海上保安庁：潮流と海流', 'https://www1.kaiho.mlit.go.jp/KAN8/sv/teach/kaisyo/stream1.html'],
  safety: ['海上保安庁：海の安全ガイド（PDF）', 'https://www6.kaiho.mlit.go.jp/10kanku/info/oshirase/12_umidetanosimusafetyguid.pdf'],
};
const references = {
  'oshio-koshio': ['mechanism', 'terms'], 'mikata': ['table', 'terms'],
  'ugoku-jikantai': ['table', 'current'], 'jikoku-mainichi-kawaru': ['mechanism'],
  'shiohigari-shiodoki': ['table', 'safety'], 'tsuri-shiodoki': ['current', 'safety'],
  'kanmansa-chiikisa': ['mechanism', 'table'], 'kijunmen-hyoukou': ['terms', 'observation'],
  'chou-i-hensa': ['observation', 'terms'], 'takashio-ijouchoui': ['observation', 'safety'],
  'nisshuchou': ['mechanism', 'terms'], 'kinji-chiten-seido': ['table', 'mechanism'],
  'tsukirei-shiona': ['mechanism', 'terms'], 'kisetsu-kanchou': ['table', 'mechanism'],
  'shiodomari': ['terms', 'current'], 'chouryuu': ['current', 'terms'],
  'tide-graph': ['table', 'terms'], 'umibe-anzen': ['safety'],
  'suisan-shikumi': ['terms', 'table'], 'isoasobi': ['safety', 'table'],
  'tsuriaruki-sokuryo': ['table', 'terms'],
};

const icon = name => `<img src="${attr(asset(`icons/woodblock/${name}.png`))}" width="40" height="40" alt="" aria-hidden="true" loading="lazy">`;
const figure = (label, inner, caption) => `<figure class="guide-visual" aria-label="${attr(label)}">${inner}<figcaption>${caption}</figcaption></figure>`;
const sourceLink = key => `<a href="${attr(sources[key][1])}" target="_blank" rel="noopener">${esc(sources[key][0])}</a>`;

// 気象庁2026年広島(Q8)の固定例。今日の予報と混同しないよう日付を明記する。
// 出典：https://www.data.jma.go.jp/kaiyou/data/db/tide/suisan/txt/2026/Q8.txt
export const GUIDE_EXAMPLE = tideDay({ jmaAnchor: false }, {
  '2026-10-01': {
    hourly: [338,301,230,161,104,57,32,55,121,195,256,308,346,350,314,265,220,179,147,146,184,235,275,302],
    extremes: [
      { type: '干潮', time: 6 + 4/60, level: 32 },
      { type: '満潮', time: 12 + 35/60, level: 354 },
      { type: '干潮', time: 18 + 32/60, level: 141 },
    ],
  },
  '2026-10-02': { hourly: [317] },
}, dayMsOf('2026-10-01'));

function exampleChart(slug) {
  const W = 640, H = 260, left = 52, right = 616, top = 24, bottom = 212;
  const x = hour => left + (right-left) * hour/24;
  const y = level => bottom - (bottom-top) * level/400;
  const bands = slug === 'ugoku-jikantai' || slug === 'tsuri-shiodoki'
    ? movingWindows(GUIDE_EXAMPLE.levels).map(w => `<rect class="diagram-band" x="${x(w.from)}" y="${top}" width="${x(w.to)-x(w.from)}" height="${bottom-top}"/>`).join('') : '';
  const axes = [0,100,200,300,400].map(v => `<path class="diagram-grid" d="M${left},${y(v)}H${right}"/><text x="${left-8}" y="${y(v)+5}" text-anchor="end">${v}</text>`).join('');
  const times = [0,6,12,18,24].map(h => `<text x="${x(h)}" y="238" text-anchor="middle">${h}時</text>`).join('');
  const points = GUIDE_EXAMPLE.levels.map((v,i) => `${x(i/6)},${y(v)}`).join(' ');
  const marks = GUIDE_EXAMPLE.extremes.map((e,i) => `<circle class="diagram-mark" cx="${x(e.time)}" cy="${y(e.level)}" r="5"/><text x="${x(e.time)}" y="${i === 1 ? y(e.level)+27 : y(e.level)-14}" text-anchor="middle">${i === 0 ? '06:04 / 32cm' : i === 1 ? '12:35 / 354cm' : '18:32 / 141cm'}</text>`).join('');
  const notes = {
    mikata: '06:04の干潮32cmと12:35の満潮354cmの差は322cmです。潮位はこの地点の基準面からの高さで、海の深さではありません。',
    'tide-graph': '午前は06:04の干潮から12:35の満潮へ上がり、その後18:32の干潮へ下がります。線の傾きで海面の上下が速い時間を読めます。',
    'ugoku-jikantai': '色の帯は当サイトの計算で抽出した4区間です。00:50〜04:40、07:00〜11:10、14:00〜15:20、19:50〜21:10が該当します。流速の予測ではありません。',
    'tsuri-shiodoki': '午前の上げ潮を調べるなら07:00〜11:10、夕方からの上げ潮なら19:50〜21:10が潮位変化の大きい候補です。後者は夜なので、現地の明るさや風・波も別に確認します。釣果を保証する区間ではありません。',
    'shiohigari-shiodoki': '2回の干潮でも午前32cmと夕方141cmでは109cm違います。「干潮なら同じ」と考えず、潮位・明るさ・現地の利用時間を突き合わせます。干潮前後の一定時間が安全とは限りません。',
    shiodomari: '曲線の底や頂上付近では潮位の変化が小さくなります。ただし、この曲線から海水の流れが止まる時刻（転流時）は求められません。',
    nisshuchou: 'この日の表に載る満潮は12:35の1回です。0時の潮位は338cmで、前日からの下げ潮の途中です。1日を0〜24時で区切る影響もあるため、回数だけで日周潮と断定せず、前後の日も確認します。',
    'jikoku-mainichi-kawaru': '時刻を固定して「翌日も同じ時間」と考えず、予定日の表を確認します。この例の満潮は12:35ですが、別の日の満潮時刻は地点ページの週間表で調べます。',
    'suisan-shikumi': '線は毎時値を10分刻みに補間した値で、印は公表された満潮・干潮です。補間曲線の頂点と公表値には小さな違いが出るため、満干潮の時刻・潮位は表の公表値を使います。',
  };
  const svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="2026年10月1日広島の潮位。干潮06時04分32cm、満潮12時35分354cm、干潮18時32分141cm。">${bands}${axes}${times}<polyline class="diagram-curve" points="${points}"/>${marks}</svg>`;
  return `<h2>実際の潮見表で読む</h2>${figure('広島の潮位の読み方', svg,
    `<strong>2026年10月1日・広島の推算値を使った例</strong><p>${notes[slug]}</p><span class="note">曲線は毎時値を10分刻みに補間。印は気象庁の満干潮公表値です。例の元データ：<a href="https://www.data.jma.go.jp/kaiyou/data/db/tide/suisan/txt/2026/Q8.txt" target="_blank" rel="noopener">気象庁2026年潮位表・広島（テキスト）</a>。最新の日付は<a href="${attr(url('hiroshima','広島'))}">広島の潮見表</a>で確認できます。</span>`)} `;
}

// SVGは模式図、統計バーは実際の集計値。図の意味を文章でも併記する。
export function guideVisual(g, nat) {
  if (['mikata','tide-graph','ugoku-jikantai','tsuri-shiodoki','shiohigari-shiodoki','shiodomari','nisshuchou','jikoku-mainichi-kawaru','suisan-shikumi'].includes(g.slug)) return exampleChart(g.slug);
  if (g.slug === 'tsuriaruki-sokuryo') return tsuriaruikiVisual(figure);
  if (g.slug === 'chouryuu') return figure('潮汐と潮流の違い', `<div class="visual-pair"><div>${icon('high')}<strong>潮汐：海面の上下</strong><span class="visual-arrow">↕</span><p>潮位と変化速度（cm/h）を確認</p></div><div>${icon('wave')}<strong>潮流：水平方向の流れ</strong><span class="visual-arrow">↔</span><p>流向・流速・転流時を別に確認</p></div></div>`, '模式図。同じ「潮」でも、潮位表の数字だけから潮流の速さや向きは決まりません。');
  if (g.slug === 'kijunmen-hyoukou') return figure('潮位の基準面', `<svg viewBox="0 0 640 210" role="img" aria-label="潮位は潮位表基準面から海面までの高さ。標高や水深とは基準が異なる。"><path class="diagram-curve" d="M50 60 Q80 40 110 60T170 60T230 60T290 60T350 60T410 60T470 60T530 60T590 60"/><path class="diagram-grid" d="M50 165H590"/><text x="60" y="35">海面</text><text x="60" y="195">潮位表基準面（地点ごとに異なる）</text><path class="diagram-curve" d="M410 70V155m-8 -77 8 -8 8 8m-16 69 8 8 8 -8"/><text x="438" y="118">潮位（cm）</text></svg>`, '模式図。潮位表基準面は標高の基準や海底ではありません。潮位の数字をそのまま水深や別の地点との高低差に使わないでください。');
  if (['chou-i-hensa','takashio-ijouchoui'].includes(g.slug)) return figure('推算値と実際の潮位', `<div class="visual-steps"><div>${icon('low')}<strong>天文潮位</strong><span>月・太陽による推算</span></div><b aria-hidden="true">＋</b><div>${icon('wind')}<strong>気象等の影響</strong><span>気圧・風など</span></div><b aria-hidden="true">＝</b><div>${icon('high')}<strong>実際の潮位</strong><span>観測情報で確認</span></div></div>`, '模式図。潮位偏差は実際の潮位と天文潮位の差です。本サイトの推算値に高潮の影響は含まれていません。');
  if (['umibe-anzen','isoasobi'].includes(g.slug)) return figure('海辺で確認する3つの情報', `<div class="visual-pair safety-steps"><div>${icon('low')}<strong>潮位・時刻</strong><p>干潮と、その後の上げ潮を確認</p></div><div>${icon('wind')}<strong>風・波・警報</strong><p>推算値とは別に最新情報を確認</p></div><div>${icon('suncloud')}<strong>現地の状況</strong><p>戻り道・明るさ・利用ルールを確認</p></div></div>`, '確認項目の図解。潮位が低いことだけでは安全を判断できません。');
  if (g.slug === 'kinji-chiten-seido') return figure('近隣観測点の使い分け', `<div class="visual-pair"><div>${icon('high')}<strong>公式観測点</strong><p>その地点の推算値</p></div><div>${icon('wave')}<strong>観測点のない海岸</strong><p>近隣の値は参考。海域・地形も確認</p></div></div>`, '近い観測点でも満潮時刻や干満差が異なります。本サイトは現在、公式観測点のページだけを掲載しています。');
  if (!nat?.pf) return '';
  let rows, title, caption;
  if (g.slug === 'kisetsu-kanchou') {
    rows = nat.pf.dayLowMonthCount.map((value,i) => ({name:`${i+1}月`, value}));
    title = '日中の干潮が年間で最も低くなる月';
    caption = `${nat.year}年の公式観測点${nat.pf.n}地点の集計。各地点で6〜18時の干潮が年間最低となる月を数えています。棒は地点数です。`;
  } else if (g.slug === 'kanmansa-chiikisa') {
    rows = nat.regions.map(({r,pf}) => ({name:r.name, value:pf.avg}));
    title = '地方ごとの平均干満差';
    caption = `${nat.year}年の公式観測点の推算値から、各地点の1日の干満差を通年平均し、地方内で平均した値（cm）です。`;
  } else {
    rows = [{name:'大きい日（上位10%）', value:nat.pf.spring},{name:'年間平均',value:nat.pf.avg},{name:'小さい日（下位10%）',value:nat.pf.neap}];
    title = '大きく引く日と、小さく引く日の差';
    caption = `${nat.year}年の公式観測点${nat.pf.n}地点の集計（cm）。各地点の年間の干満差の上位・下位10%を平均した比較です。月齢だけでその日の潮位は決まらないため、予定日の表も確認します。`;
  }
  const max = Math.max(1,...rows.map(r=>r.value));
  const bars = rows.map(r => `<div class="visual-bar-row"><span>${esc(r.name)}</span><div class="visual-bar-track"><i style="width:${(r.value/max*100).toFixed(1)}%"></i></div><b>${r.value}${g.slug === 'kisetsu-kanchou' ? '地点' : 'cm'}</b></div>`).join('');
  return `<h2>${title}</h2>${figure(title, `<div class="visual-bars">${bars}</div>`,caption)}`;
}

export function guideReferences(g) {
  const keys = references[g.slug] || ['terms'];
  return `<h2>参考資料</h2><ul class="guide-sources">${keys.map(k=>`<li>${sourceLink(k)}</li>`).join('')}</ul>`
    + (g.slug === 'ugoku-jikantai' ? `<p class="note">60%・40分の条件は${esc(SITE.NAME)}が設定した目安で、公的機関の潮流予報ではありません。</p>` : '');
}
