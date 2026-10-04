// =====================================================================
// HTML の骨格（<head> の SEO 一式・ヘッダー・フッター・広告枠）
// =====================================================================

import { SITE, url, asset, absUrl } from '../config.mjs';

export function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function attr(s) { return esc(s); }

// ---------------------------------------------------------------------
// 広告枠
//
// ADSENSE_CLIENT が空のあいだはプレースホルダの div だけを出す。
// 審査前に空の広告タグを置くのはポリシー違反なので、スクリプトも ins も
// 出力しない。CSS 側で .ad:empty を display:none にしてあるため、
// 有効化するまで枠は画面を占有しない。
// ---------------------------------------------------------------------
export function hasSideAd() {
  return !!(SITE.ADSENSE_CLIENT && SITE.ADSENSE_SLOTS.side);
}

export function ad(slotName) {
  const client = SITE.ADSENSE_CLIENT;
  const slot = SITE.ADSENSE_SLOTS[slotName];
  if (!client || !slot) return `<div class="ad ad-${slotName}"></div>`;
  return `<div class="ad ad-${slotName}">`
    + `<ins class="adsbygoogle" style="display:block" data-ad-client="${attr(client)}"`
    + ` data-ad-slot="${attr(slot)}" data-ad-format="auto" data-full-width-responsive="true"></ins>`
    + `<script>(adsbygoogle=window.adsbygoogle||[]).push({});</script></div>`;
}

function adsenseHead(enabled) {
  if (!enabled || !SITE.ADSENSE_CLIENT) return '';
  return `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=`
    + `${attr(SITE.ADSENSE_CLIENT)}" crossorigin="anonymous"></script>`;
}

function analytics() {
  if (!SITE.GA_ID) return '';
  return `<script async src="https://www.googletagmanager.com/gtag/js?id=${attr(SITE.GA_ID)}"></script>`
    + `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}`
    + `gtag('js',new Date());gtag('config','${attr(SITE.GA_ID)}');</script>`;
}

// ---------------------------------------------------------------------
// パンくず（表示用 + JSON-LD 用を同じ配列から作る）
// trail: [{name, href}] の配列。最後の要素は現在地でリンクしない。
// ---------------------------------------------------------------------
export function breadcrumb(trail) {
  const items = trail.map((t, i) => {
    const last = i === trail.length - 1;
    const label = last
      ? `<span aria-current="page">${esc(t.name)}</span>`
      : `<a href="${attr(t.href)}">${esc(t.name)}</a>`;
    return `<li>${label}</li>`;
  }).join('');
  return `<nav class="crumb" aria-label="パンくず"><ol>${items}</ol></nav>`;
}

function breadcrumbLd(trail) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((t, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: t.name,
      item: t.abs,
    })),
  };
}

// ---------------------------------------------------------------------
// ページ全体
//
// opts: { title, description, canonical(絶対URL), trail, ld[], bodyClass,
//         head, scripts, fileBase, recentStation }
//
// fileBase は表を CSV で保存するときのファイル名の頭。地点名や日付は
// ページ側にしか無く、URL から復元しようとすると BASE パスの有無で
// 壊れるので、素直に body に持たせる。
//
// recentStation: { n(地点名), h(地点ハブURL), p(都道府県名) }。地点に
// 紐づくページ（地点ハブ・日別・週間・月間）だけが渡す。app.js がこれを
// 読んで「最近見た地点」として localStorage に積む。検索モーダルと同じ
// 仕組みで使うため、キー名はインデックスJSON(stations-index.json)と揃えている。
// ---------------------------------------------------------------------
export function page(opts, body) {
  const ld = [breadcrumbLd(opts.trail || []), ...(opts.ld || [])]
    .filter(x => x && (x['@type'] !== 'BreadcrumbList' || x.itemListElement.length));

  // サイド広告があるページだけ body.ads を付ける。CSS 側はこれを見て
  // PC で2カラムに切り替える。広告が無いのに 300px の列を確保すると、
  // 本文が痩せたうえ右に空白の帯が残り、レイアウトが崩れて見える。
  // 波の透かしはサンプルで了承済み。全ページの余白にだけ出し、本文カードの可読性は保つ。
  const cls = ['wave-watermark', opts.bodyClass,
    hasSideAd() && opts.ads !== false ? 'ads' : ''].filter(Boolean).join(' ');

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(opts.title)}</title>
<meta name="description" content="${attr(opts.description)}">
<link rel="canonical" href="${attr(opts.canonical)}">
<meta name="robots" content="${opts.noindex ? 'noindex,follow' : 'index,follow,max-image-preview:large'}">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#f8f6ef" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#071b22" media="(prefers-color-scheme: dark)">
<meta property="og:type" content="${opts.ogType || 'website'}">
<meta property="og:site_name" content="${attr(SITE.NAME)}">
<meta property="og:title" content="${attr(opts.title)}">
<meta property="og:description" content="${attr(opts.description)}">
<meta property="og:url" content="${attr(opts.canonical)}">
<meta property="og:locale" content="ja_JP">
${SITE.OG_IMAGE ? `<meta property="og:image" content="${attr(SITE.ORIGIN + asset(SITE.OG_IMAGE))}">
<meta name="twitter:card" content="summary_large_image">` : `<meta name="twitter:card" content="summary">`}
<link rel="icon" href="${attr(asset('favicon.svg'))}" type="image/svg+xml">
<link rel="apple-touch-icon" href="${attr(asset('apple-touch-icon.png'))}">
<link rel="manifest" href="${attr(asset('manifest.webmanifest'))}">
<link rel="stylesheet" href="${attr(asset('fonts.css'))}">
<link rel="stylesheet" href="${attr(asset('style.css?v=pref-20261004-3'))}">
${opts.head || ''}
<script type="application/ld+json">${JSON.stringify(ld.length === 1 ? ld[0] : ld)}</script>
${adsenseHead(opts.ads !== false)}${analytics()}
</head>
<body${cls ? ` class="${attr(cls)}"` : ''}${opts.fileBase ? ` data-file="${attr(opts.fileBase)}"` : ''}${opts.recentStation ? ` data-recent="${attr(JSON.stringify(opts.recentStation))}"` : ''} data-sw="${attr(asset('sw.js'))}">
${siteHeader(opts.headerArt || 'national')}
<main>
${opts.trail ? breadcrumb(opts.trail) : ''}
${body}
${opts.ads === false || opts.side === false ? '' : ad('side')}
</main>
${siteFooter()}
${opts.scripts || ''}
<script src="${attr(asset('app.js?v=content-20261001-1'))}" defer></script>
</body>
</html>`;
}

// 波の印(丸地に白い二本波)。header とホーム見出しで id 衝突しないよう
// prefix を変えて使う。
export function waveMark(idPrefix, className) {
  return `<svg class="${attr(className)}" viewBox="0 0 64 64" aria-hidden="true">`
    + `<defs><filter id="${idPrefix}t"><feTurbulence type="fractalNoise" baseFrequency=".055" numOctaves="2" seed="7" result="noise"/><feDisplacementMap in="SourceGraphic" in2="noise" scale="1.5"/></filter><clipPath id="${idPrefix}c"><circle cx="32" cy="32" r="28"/></clipPath></defs>`
    + `<circle cx="32" cy="32" r="28" fill="#073a67" filter="url(#${idPrefix}t)"/>`
    + `<g clip-path="url(#${idPrefix}c)" fill="none" stroke="#f8f4e9" stroke-width="3" stroke-linecap="round" filter="url(#${idPrefix}t)">`
    + `<path d="M-2 27 Q12 18 25 27 T52 27 T79 27"/><path d="M-2 40 Q12 31 25 40 T52 40 T79 40" opacity=".7"/>`
    + `</g></svg>`;
}

function siteHeader(headerArt) {
  const key = ['hokkaido', 'tohoku', 'kanto', 'chubu', 'kinki', 'chugoku', 'shikoku', 'kyushu', 'okinawa', 'national'].includes(headerArt) ? headerArt : 'national';
  const position = key === 'chugoku' ? 'center 57%' : 'center 55%';
  return `<header class="site">
  <a class="brand" href="${attr(url())}">
    <span class="brand-ja">${esc(SITE.NAME)}</span>
    <span class="brand-en">${esc(SITE.NAME_EN)}</span>
    <span class="brand-rule" aria-hidden="true"></span>
    ${waveMark('wmh', 'brand-mark')}
  </a>
  <nav class="site-nav">
    <button type="button" class="search-btn" data-search-open data-search-src="${attr(asset('stations-index.json'))}" aria-label="地点を検索">
      <img class="search-ic" src="${attr(asset('icons/woodblock/search.png'))}" width="20" height="20" alt="" aria-hidden="true" decoding="async">
      <span class="search-btn-t">地点を探す</span>
    </button>
    <button type="button" class="favorite-nav" data-search-open data-search-src="${attr(asset('stations-index.json'))}" aria-label="お気に入りの地点を見る"><img class="nav-favorite-ic" src="${attr(asset('icons/woodblock/favorite.png'))}" width="20" height="20" alt="" aria-hidden="true" decoding="async"> お気に入り</button>
    <span class="site-phrase">今日も、<br>よい海の一日を。</span>
  </nav>
</header>
<div class="regional-art" aria-hidden="true" style="background-image:url('${attr(asset(`assets/headers/${key}.webp`))}');--art-position:${attr(position)}"></div>
${searchOverlay()}`;
}

// ヘッダー直下に1つだけ置く検索モーダル。全ページ共通(header自体が全ページ
// 共通のため)。中身の絞り込みはすべて app.js 側(stations-index.json を
// 遅延取得してフィルタする)。JS が動かない/読み込み前は data-search-open
// ボタンを押しても何も起きないだけで、他の機能には影響しない。
function searchOverlay() {
  return `<div class="search-ovl" data-search-ovl hidden>
  <div class="search-panel" role="dialog" aria-modal="true" aria-label="地点を検索">
    <div class="search-bar">
      <input type="search" data-search-input placeholder="地点名で検索（例: 広島、宮島）" aria-label="地点名で検索" autocomplete="off">
      <button type="button" class="search-close" data-search-close aria-label="閉じる"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
    </div>
    <div class="search-body">
      <div data-search-favorites></div>
      <div data-search-recent></div>
      <ul class="search-results" data-search-results></ul>
      <p class="search-empty" data-search-empty hidden>該当する地点が見つかりません。</p>
    </div>
  </div>
</div>`;
}

function siteFooter() {
  return `<footer class="site">
  <div class="src">
    <p>潮位は<a href="${attr(SITE.JMA_CREDIT_URL)}" rel="nofollow noopener" target="_blank">${esc(SITE.JMA_CREDIT)}</a>の推算値をもとにしています。満潮・干潮の時刻と潮位は公表値、10分毎の値は毎時値を三次スプラインで補間したものです。</p>
    <p>天気・風・波・気温は<a href="${attr(SITE.JMA_FC_CREDIT_URL)}" rel="nofollow noopener" target="_blank">${esc(SITE.JMA_FC_CREDIT)}</a>を加工して作成しています。</p>
    <p>潮位は推算値であり実測値とは異なります。気象・地形の影響で変動するため、航行・遊泳・釣行の安全判断は必ず現地の状況と公的機関の情報で確認してください。</p>
  </div>
  <nav class="foot-nav"><a href="${attr(url())}">トップ</a><a href="${attr(url('youto'))}">用途から選ぶ</a><a href="${attr(url('guide'))}">潮汐のガイド</a><a href="${attr(url('about'))}">このサイトについて</a><a href="${attr(url('privacy'))}">プライバシーポリシー</a>${SITE.CONTACT_URL
    ? `<a href="${attr(SITE.CONTACT_URL)}" rel="nofollow noopener" target="_blank">お問い合わせ</a>` : ''}</nav>
  <p class="copy">© ${esc(SITE.NAME)}</p>
</footer>`;
}

// ---------------------------------------------------------------------
// 小物
// ---------------------------------------------------------------------

// 前後ナビ。href が null の項目は非活性で出す。
export function pager(prev, cur, next) {
  const cell = (o, cls) => o
    ? `<a class="${cls}" href="${attr(o.href)}"><span class="pg-lbl">${esc(o.label)}</span></a>`
    : `<span class="${cls} off"></span>`;
  return `<nav class="pager">${cell(prev, 'pg prev')}`
    + `<span class="pg cur">${cur}</span>${cell(next, 'pg next')}</nav>`;
}

// 表示モード切替（1日 / 1週間 / 1か月）。すべて実リンク。
// extra はタブの右に並べる補助リンク（天気・波の予報ボタン）の HTML。
// 渡されたときだけ行として包むので、既存の余白は素のタブのままにできる。
export function viewTabs(items, extra = '') {
  const tabs = `<nav class="tabs">` + items.map(i => i.active
    ? `<span class="tab on">${esc(i.label)}</span>`
    : `<a class="tab" href="${attr(i.href)}">${esc(i.label)}</a>`).join('') + `</nav>`;
  return extra ? `<div class="tabs-row">${tabs}${extra}</div>` : tabs;
}

export function section(title, en, inner, extra = '') {
  return `<section class="blk">
  <div class="blk-hd"><h2>${esc(title)}</h2>${en ? `<span class="en">${esc(en)}</span>` : ''}${extra}</div>
  ${inner}
</section>`;
}
