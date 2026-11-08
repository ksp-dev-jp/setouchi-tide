// =====================================================================
// サイト設定
//
// ドメインを移すときは ORIGIN と CNAME を書き換えるだけでよい。
// 生成される HTML 内のリンクはすべて BASE 起点の絶対パスなので、
// ここ以外を触る必要はない。
// =====================================================================

export const SITE = {
  // ---- ドメイン -----------------------------------------------------
  // 独自ドメイン japantide.com を apex で運用している。よって BASE は空。
  // CNAME を入れてあるので dist/CNAME が生成され、Actions デプロイでも
  // GitHub Pages のカスタムドメイン設定が失われない。
  //
  // GitHub Pages のプロジェクトページ配下に戻す場合は
  //   ORIGIN: 'https://kazuyakoda0-droid.github.io'
  //   BASE:   '/setouchi-tide'
  //   CNAME:  ''
  // にする。いずれも環境変数で上書きできる。
  ORIGIN: process.env.SITE_ORIGIN || 'https://japantide.com',
  BASE: process.env.SITE_BASE !== undefined
    ? (process.env.SITE_BASE === '/' ? '' : process.env.SITE_BASE.replace(/\/$/, ''))
    : '',
  CNAME: process.env.SITE_CNAME || 'japantide.com',

  NAME: 'しおどき',
  NAME_EN: 'SHIODOKI',
  // 地点数は station データの更新で変わるため、固定値をコピーには入れない。
  // 実数はトップページで生成時の total を使って表示する。
  TAGLINE: '気象庁の公式推算値による全国の潮見表・タイドグラフ',

  // ---- 生成範囲 -----------------------------------------------------
  // 地点あたりのページ数 = 1(当日) + 1(週間) + MONTHS + DAYS_BACK+DAYS_FWD+1
  // 現在の設定では 1+1+14+16 = 32 ページ × 760 地点 = 24,320 ページ。
  // 気象庁の年次ファイルは1年分あるので、増やしたければ数字を上げるだけでよい
  // (ただし気象庁の天気予報は7日先までなので、それより外は天気が空欄になる)。
  //
  // DAYS_BACK は 1（昨日）だけ残す。過去日は「○月○日 潮見表」の検索需要が
  // ほぼ無いうえ、地点ハブや翌日以降のページと内容がほぼ同じ薄いページに
  // なるため。DAYS_FWD はその分を厚くし、「来週の釣行」「◯日先の予定」を
  // 調べる検索・実用需要をカバーする2週間先まで生成する。
  // 日別ページを作るかどうか。SITE.LEAN のときだけ false になる。
  DAY_PAGES: true,
  DAYS_BACK: 1,
  DAYS_FWD: 14,
  MONTHS_BACK: 1,
  // 月間カレンダーは当月から1年先まで。予定を立てるときに翌年の大潮・
  // 干潮もそのまま確認できるようにする。気象庁の年次潮位表を使うため、
  // 天気予報と異なり先の月でも潮汐データは表示できる。
  MONTHS_FWD: 12,

  // ---- 広告 ---------------------------------------------------------
  // AdSense の審査に通ったら ADSENSE_CLIENT に ca-pub-... を入れる。
  // 空のあいだは枠だけがレイアウトに存在し、広告スクリプトは出力されない
  // (審査前に空の広告タグを置くとポリシー違反になるため)。
  // ads.txt も ADSENSE_CLIENT が入ったときだけ生成される。
  ADSENSE_CLIENT: process.env.SITE_ADSENSE_CLIENT || 'ca-pub-3910557986459785',
  ADSENSE_SLOTS: {
    header: '3879784223', // ヘッダー下 レスポンシブ
    graph: '4483967615',  // 潮位グラフ直下 レクタングル(300x250)
    footer: '8940539213', // 記事末 レスポンシブ
    side: '3994113104',   // サイド(PCのみ) 300x600
  },

  // ---- 審査対応: 配信するページの絞り込み -------------------------------
  // AdSense は「有用性の低いコンテンツ」でこのサイトを不承認にした(2026-09-08)。
  // 原因は近似地点にある。1,082地点のうち843地点は damp/dz/dphase の補正が
  // すべてゼロで、参照元の公式観測点と潮位数値が1桁も違わない。1観測点から
  // 最大19地点ぶんのページが出るため、隣接する2ページの本文一致率は96.8%になる。
  // Google の品質ガイドラインでいう「実質的な複製」「自動生成」そのものなので、
  // noindex で検索から隠しても審査の評価は変わらない。ページを出さないしかない。
  //
  // SITE_LEAN=1 のあいだは
  //   ・公式観測点(jmaAnchor:false)だけを配信する
  //   ・日別ページを作らない(内容は地点ハブ・週間・月間で尽きている)
  //   ・月間カレンダーは当月だけにする
  //   ・広告枠を graph と footer の2つに減らす
  // 地点データもテンプレートも消していないので、環境変数を外せば元に戻る。
  LEAN: process.env.SITE_LEAN === '1',
  // 近似地点も含めて全地点を配信する(2026-11 に AdSense を断念して再掲載)。
  // 日別ページや月間の範囲は LEAN のまま変えない。
  OFFICIAL_ONLY: process.env.SITE_LEAN === '1' && process.env.SITE_ALL_STATIONS !== '1',

  // ---- OGP画像 --------------------------------------------------------
  // X/Facebook/Discord などでの共有カード用。`public/og-image.png`
  // (1200x630)を焼き直したいときは scripts/og-image.html を下書きとして
  // 使う。og:image は SVG非対応で PNG/JPG が要るが、このリポジトリは
  // 依存パッケージなしの静的サイトジェネレータなので画像編集ライブラリは
  // 入れていない。空にすると og:image / twitter:card を出力しない
  // (存在しない画像を指すとプレビューが崩れるため)。
  OG_IMAGE: process.env.SITE_OG_IMAGE || 'og-image.png',

  // ---- 運営者 ---------------------------------------------------------
  // AdSense審査や検索での信頼性評価は、運営者が明示されているサイトを
  // 好む。about/privacyに表示するほか、構造化データのfounderにも使う。
  OPERATOR_NAME: 'ksp',
  // 運営者の自己紹介(このサイトについて の「運営者」に1段落で出る)。
  // 海や釣りとの関わり、住んでいる地域など、運営者本人にしか書けない
  // 経験を書く。空のあいだは段落ごと出さない(推測で埋めないこと)。
  OPERATOR_PROFILE: '幼いころから釣りに親しみ、大学では魚を研究する研究室に所属しました。釣り情報誌への寄稿やメーカー主催の大会への出場を経て、釣り具メーカーで釣竿の開発に携わりました。釣り場の水中映像の撮影や測量をしていたこともあり、YouTubeチャンネル「釣歩記（つりあるき）」で釣り場の情報を発信していました。その経験から、潮の動きを釣り場選びに使いやすい形で確認できるサイトとして、しおどきを作りました。',

  // ---- 問い合わせ ---------------------------------------------------
  // 静的サイトなのでフォームは持てない。Google フォームの URL を入れると
  // このサイトについて / プライバシーポリシー の両方に導線が出る。
  // 空だと連絡経路の無いサイトになり AdSense の審査で不利なので、
  // 申し込み前に必ず埋めること。
  CONTACT_URL: process.env.SITE_CONTACT_URL || 'https://forms.gle/H7gvcVnedC7kXVpc6',

  // ---- 解析 ---------------------------------------------------------
  GA_ID: '',                       // 例: 'G-XXXXXXXXXX'

  // ---- データ出典 ---------------------------------------------------
  JMA_TXT: 'https://www.data.jma.go.jp/kaiyou/data/db/tide/suisan/txt',
  JMA_CREDIT: '気象庁 潮位表',
  JMA_CREDIT_URL: 'https://www.data.jma.go.jp/kaiyou/db/tide/suisan/',
  // 気象・海象も気象庁に一本化した。Open-Meteo の無料 API は
  // 非商用限定で、広告を掲載した時点で規約から外れるため。
  JMA_FC_CREDIT: '気象庁 天気予報',
  JMA_FC_CREDIT_URL: 'https://www.jma.go.jp/bosai/forecast/',
};

// LEAN のあいだは生成範囲を当日・当月に畳む。既定値を上書きするだけなので、
// 環境変数を外せば上に書いてある元の規模に戻る。
if (SITE.LEAN) {
  SITE.DAY_PAGES = false;
  SITE.DAYS_BACK = 0;
  SITE.DAYS_FWD = 0;
  SITE.MONTHS_BACK = 0;
  SITE.MONTHS_FWD = 0;
  // 本文の横に置く side だけを残す。潮位グラフの直後や折りたたみ一覧の
  // 末尾に広告を挟むより、PCでは専用のサイド列へ分けたほうが情報を追いやすい。
  // 枠が無い slot は空の div になり、CSS の
  // .ad:empty で消えるので、テンプレート側は触らなくてよい。
  SITE.ADSENSE_SLOTS = {
    side: SITE.ADSENSE_SLOTS.side,
  };
}

// BASE 起点のページ URL。ディレクトリなので必ず末尾スラッシュを付ける。
export function url(...segs) {
  const path = segs.filter(s => s !== '' && s != null).join('/');
  const p = path ? '/' + path.replace(/^\/+|\/+$/g, '') + '/' : '/';
  return SITE.BASE + p;
}

// BASE 起点のファイル URL。末尾スラッシュを付けてはいけない。
// (url() を使うと style.css/ のようになり 404 になる)
export function asset(name) {
  return SITE.BASE + '/' + name.replace(/^\/+/, '');
}

// canonical / sitemap 用の絶対 URL。日本語セグメントは percent-encode する。
export function absUrl(...segs) {
  return SITE.ORIGIN + url(...segs).split('/').map(encodeURIComponent).join('/');
}
