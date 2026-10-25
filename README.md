# しおどき / SHIODOKI

気象庁の公式推算値による全国760地点の潮見表・タイドグラフ。
静的サイトジェネレータ（依存パッケージなし・Node 20+ のみ）。

## 使い方

```bash
node build.mjs            # 全ページ生成（約16,300ページ）
node build.mjs --sample   # 広島県だけ生成（数秒。動作確認用）
```

生成物は `dist/` に出る。リポジトリにはコミットしない。
GitHub Actions が毎日ビルドし、Pages の artifact として直接デプロイする。

ローカルで見るときは、そのままビルドして `dist` をルート配信する。
`BASE` は既定で空なので環境変数は要らない。

```bash
node build.mjs --sample
```

配信は `.claude/launch.json` の `tide-dist`（python http.server, port 8801）。

## 構成

| ファイル | 役割 |
|---|---|
| `config.mjs` | ドメイン・生成範囲・広告ID・解析ID・問い合わせURL。**ドメイン移行で触るのはここだけ** |
| `build.mjs` | 全ページの生成、sitemap、robots.txt |
| `lib/stations.mjs` | 観測点760件の定義（自動生成データ。手で編集しない） |
| `lib/jma.mjs` | 気象庁 年次潮位表テキストの取得・パース・キャッシュ |
| `lib/tide.mjs` | 10分刻みへの補間、近似地点補正、潮位変化速度 |
| `lib/astro.mjs` | 太陽・月・月齢・潮名 |
| `lib/routes.mjs` | URL 設計とスラッグ |
| `lib/html.mjs` | `<head>` の SEO 一式、ヘッダー/フッター、広告枠 |
| `lib/components.mjs` | グラフ・グリッド・カレンダーなどの部品 |
| `lib/pages.mjs` | 各ページのテンプレート |
| `public/` | `style.css` / `app.js` / `favicon.svg`（そのまま dist にコピー） |
| `public/fonts.css` `public/fonts/` | 自前ホストしたフォントのサブセット（`scripts/subset-fonts.mjs` で生成） |
| `scripts/subset-fonts.mjs` | Google Fontsから使用文字だけを抜き出し `public/fonts/` に取得し直す。地点名が増えて未収録の漢字が出たときに手で再実行する |
| `scripts/og-image.html` | og:image の下書き。ブラウザでスクリーンショットして `public/og-image.png` として保存する |
| `scripts/fetch-genbo.mjs` | 気象庁「潮汐観測資料」の毎時潮位偏差（実測 − 推算）を月ごとに取得し `.cache/genbo/` に保存する。1秒に1回まで。取得済みの月は取り直さない。毎日のビルドでは使わない |
| `scripts/aggregate-genbo.mjs` | 上のキャッシュを地点ごとに集計し `lib/observed-stats.mjs` を書き出す。年が替わって1年分を足すときに `fetch-genbo.mjs --from/--to` と合わせて再実行する |
| `lib/observed-stats.mjs` | 実測と潮見表のずれの集計（自動生成データ。手で編集しない）。記事 `/guide/shiomihyo-atari/`（`lib/guide-atari.mjs`）が本文の数字をここから組み立てる |
| `lib/tools.mjs` | 水深計算 `/tool/suishin/` と潮干狩りカレンダー `/tool/shiohigari-calendar/`。ビルドで `data/tide/{コード}.json`（毎時の推算潮位1年分）と `data/shiohigari.json` を書き、計算は `public/app.js` がブラウザで行う |
| `lib/holidays.mjs` | 国民の祝日（カレンダーの休日の印）。1年先まで無いとテストが落ちるので、年が明けたら翌々年を足す |
| `scripts/generate-stations/` | OSMデータ（Overpass API）から近似地点候補を取得し `lib/stations.mjs` に追記するパイプライン。`node scripts/generate-stations/index.mjs` で全国分、`--sample <pref>` で1県だけ、`--dry-run` で書き込まずに件数だけ確認できる。再実行すると新規に見つかった分がさらに追記される（既存地点は変更しない）。公開Overpassサーバーは負荷でタグ取得が失敗することがあるが、失敗したタグはスキップして続行する仕様なので、日を改めて再実行すると回収できることがある |

## URL

```
/                                 トップ
/{region}/                        地方 (9)
/{pref}/                          都道府県 (39)
/{pref}/{station}/                地点・当日 (760)
/{pref}/{station}/week/           週間 (760)
/{pref}/{station}/{YYYY-MM}/      月間 (760 × 3)
/{pref}/{station}/{YYYY-MM-DD}/   日別 (760 × 16)
/api/{pref}/{station}.json       簡易API・静的JSON (760)
```

生成数は `config.mjs` の `DAYS_BACK` / `DAYS_FWD` / `MONTHS_BACK` / `MONTHS_FWD` で決まる。
気象庁の年次ファイルは1年分あるので、増やしたければ数字を上げるだけでよい
（ただし気象庁の天気予報は7日先までなので、それより外の日は気象欄が空になる）。

## データ

- **潮位** … 気象庁 潮位表の年次テキスト
  `https://www.data.jma.go.jp/kaiyou/data/db/tide/suisan/txt/{年}/{コード}.txt`
  1ファイル = 1観測点の1年分（365行 × 136桁の固定長）。
  241観測点ぶんをビルド時に取得し、`.cache/jma/` に保存する。
- **天気・風・波・気温・降水確率** … 気象庁 天気予報
  `https://www.jma.go.jp/bosai/forecast/data/forecast/{府県予報区}.json`
  地点への割り当ては `forecast_area.json`（予報区→アメダス地点）と
  `amedastable.json`（アメダス地点の座標）から、同一都道府県内の最寄りで決める。
  ビルド時に取得して HTML に焼き込むので、閲覧者のブラウザは気象庁を叩かない。
  今日〜7日先まで。過去日と8日以上先は気象欄が空になる。

## ドメイン

`japantide.com` を apex で運用している。`config.mjs` の `CNAME` が入っているので
`dist/CNAME` が生成され、GitHub Actions のデプロイでも Pages のカスタムドメイン
設定が失われない。

Cloudflare の DNS は、A 4本（`185.199.108-111.153`）、AAAA 4本
（`2606:50c0:8000-8003::153`）、`www` の CNAME を `kazuyakoda0-droid.github.io`。
すべてプロキシ無効（グレー雲）にする。プロキシを有効にすると GitHub Pages の
Let's Encrypt 証明書の発行が通らない。

別のドメインに移すときは `config.mjs` の `ORIGIN` と `CNAME` を書き換えるだけでよい。

旧 URL（`kazuyakoda0-droid.github.io/setouchi-tide/`）からの誘導は、
カスタムドメイン設定後に GitHub Pages が返すリダイレクトに委ねている。
2026-08-02 の切り替え後に実測済み: `301 Moved Permanently` で
`https://japantide.com/` へリダイレクトされる（配下ページへの誘導ではなく
トップページへの誘導）。
Search Console のアドレス変更ツールは「サブディレクトリ → 別ドメイン」の移転を
正式にサポートしないため使わず、新ドメインでサイトマップを再送信する。

## 広告

`config.mjs` の `ADSENSE_CLIENT` が空のあいだは、広告枠の `div` だけが出て
スクリプトも `ins` も出力されない（審査前に空の広告タグを置くのはポリシー違反のため）。
CSS で `.ad:empty { display: none }` としてあるので、有効化するまで枠は画面を占有しない。

審査に通ったら `ADSENSE_CLIENT` と `ADSENSE_SLOTS` の4枠を埋める。
枠は ヘッダー下 / グラフ直下 / 記事末 / サイド(1080px以上) の4か所。

`ads.txt` も `ADSENSE_CLIENT` が入ったときだけ `dist/ads.txt` に生成される
（`ca-pub-...` の `ca-` を落とした `pub-...` を書き出す）。

プライバシーポリシー（`/privacy/`）は `ADSENSE_CLIENT` の値によらず常に出力する。
審査に出す時点で存在している必要があるため。問い合わせ導線は `CONTACT_URL` に
Google フォームの URL を入れると `/about/` と `/privacy/` の両方に出る。
