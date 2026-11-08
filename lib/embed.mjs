// =====================================================================
// 他のサイトに貼れる潮見表
//
//   /embed/{pref}/{station}/   iframe の中身(今日の満潮・干潮と潮位の曲線)
//   /tool/umekomi/             地点を選んで貼り付けコードを作るページ
//
// iframe の中身は毎日のビルドで作り直す。外部の読み込みも広告も入れない。
// 検索結果に出す必要はないので noindex にして sitemap にも載せない。
// 地点ページへのリンクは nofollow を付けない(貼ってもらう目的そのものなので)。
// =====================================================================

import { SITE, asset, url } from '../config.mjs';
import { page, esc, attr, section, ad } from './html.mjs';
import { paths, abs } from './routes.mjs';
import { stationLabel } from './station-quality.mjs';
import { fmtHM, WD } from './util.mjs';

export const WIDGET_SLUG = 'umekomi';
export const WIDGET_UPDATED = '2026-11-08';
export const EMBED_HEIGHT = 250;

function curve(levels) {
  const W = 300, H = 56, P = 3;
  const pts = levels.filter((_, i) => i % 3 === 0);
  const max = Math.max(...pts), min = Math.min(...pts);
  const span = max - min || 1;
  const xy = pts.map((v, i) => `${(i / (pts.length - 1) * W).toFixed(1)},${(H - P - (v - min) / span * (H - P * 2)).toFixed(1)}`);
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="今日の潮位の曲線"><polygon points="0,${H} ${xy.join(' ')} ${W},${H}" fill="#cfe4ee"/><polyline points="${xy.join(' ')}" fill="none" stroke="#1f6f94" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}

const row = (label, list) => `<tr><th>${label}</th>${[0, 1].map(i => {
  const e = list[i];
  return `<td>${e ? `${fmtHM(e.time)} <span>${Math.round(e.level)}cm</span>` : ''}</td>`;
}).join('')}</tr>`;

export function embedPage({ st, day, shio, dayMs }) {
  const d = new Date(dayMs);
  const name = stationLabel(st);
  const href = SITE.ORIGIN + abs.station(st).replace(SITE.ORIGIN, '');
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(name)}の潮見表｜${esc(SITE.NAME)}</title>
<style>
*{box-sizing:border-box}html,body{margin:0;background:#fff;color:#1b2b33;font:14px/1.45 system-ui,-apple-system,"Hiragino Sans","Yu Gothic UI",Meiryo,sans-serif}
.w{border:1px solid #c9d6dc;border-radius:8px;padding:10px 12px;overflow:hidden}
.t{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.t a{font-weight:700;font-size:16px;color:#0b5572;text-decoration:none}
.t span{font-size:12px;color:#51656f;white-space:nowrap}
svg{display:block;width:100%;height:56px;margin:8px 0}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
th{text-align:left;font-weight:600;color:#51656f;font-size:13px;width:3.2em}
td{padding:3px 0;font-size:15px}td span{color:#51656f;font-size:12px}
tr+tr th,tr+tr td{border-top:1px solid #e6edf0}
.c{margin-top:8px;font-size:11px;color:#51656f}.c a{color:#0b5572}
</style>
</head>
<body>
<div class="w">
<div class="t"><a href="${attr(href)}" target="_blank" rel="noopener">${esc(name)}の潮見表</a><span>${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WD[d.getUTCDay()]}) ${esc(shio)}</span></div>
${curve(day.levels)}
<table>${row('満潮', day.highs)}${row('干潮', day.lows)}</table>
<div class="c"><a href="${attr(SITE.ORIGIN + paths.home())}" target="_blank" rel="noopener">${esc(SITE.NAME)}</a>（気象庁 潮位表より）</div>
</div>
</body>
</html>
`;
}

export function widgetToolPage() {
  const title = 'ブログ・サイトに貼れる潮見表';
  const description = '釣具店や釣り船、漁協、海辺の施設のサイトに、今日の満潮・干潮を貼り付けられます。地点を選んでコードをコピーするだけで、無料でお使いいただけます。毎日自動で更新します。';
  const body = `
<article>
  <header class="st-hd">
    <h1>${esc(title)}</h1>
    <p class="lede">地点を選んで、コードを貼り付けるだけです</p>
  </header>
  <p>釣具店、釣り船、漁協、海の家、潮干狩り場、ブログなどのページに、今日の満潮・干潮と潮位の曲線を表示できます。内容は毎日自動で更新します。登録は不要で、無料です。広告は入りません。</p>
  ${section('地点を選ぶ', '', `<form class="tool-form" id="wg-tool" data-src="${attr(asset('stations-index.json'))}" data-origin="${attr(SITE.ORIGIN)}" data-base="${attr(SITE.BASE)}" onsubmit="return false">
    <label>都道府県<select name="p" disabled><option value="">読み込み中</option></select></label>
    <label>地点<select name="st" disabled><option value="">先に都道府県を選んでください</option></select></label>
    <label>幅<select name="w"><option value="100%">サイトの幅に合わせる</option><option value="300">300px</option><option value="360">360px</option></select></label>
  </form>
  <div class="wg-out" id="wg-out" hidden>
    <h3>表示の見本</h3>
    <iframe id="wg-frame" title="見本" height="${EMBED_HEIGHT}" style="border:0;width:100%;max-width:360px" loading="lazy"></iframe>
    <h3>貼り付けるコード</h3>
    <textarea id="wg-code" rows="4" readonly></textarea>
    <p><button type="button" class="yt-print" id="wg-copy">コードをコピー</button></p>
  </div>
  <noscript><p class="note">地点の選択には JavaScript が必要です。</p></noscript>`)}
  <div class="prose">
    <h2>使うときのお願い</h2>
    <ul>
      <li>表示の中の地点名と「${esc(SITE.NAME)}」のリンクは消さないでください。</li>
      <li>潮位は気象庁の潮位表にもとづく予測で、実際の潮位とはずれることがあります。</li>
      <li>日付は毎日未明の更新で切り替わります。</li>
    </ul>
    <p>データの扱いは<a href="${attr(url('about'))}">このサイトについて</a>をご覧ください。</p>
  </div>
  ${ad('footer')}
</article>`;
  return page({
    title: `${title}${'｜'}無料の埋め込みコード${'｜'}${SITE.NAME}`,
    description,
    canonical: abs.tool(WIDGET_SLUG),
    trail: [
      { name: '全国', href: paths.home(), abs: abs.home() },
      { name: title, href: paths.tool(WIDGET_SLUG), abs: abs.tool(WIDGET_SLUG) },
    ],
  }, body);
}
