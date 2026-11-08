// =====================================================================
// 物販リンク(アフィリエイト)
//
// 潮を調べた人が次に要る道具を、関係の深いページの末尾にだけ置く。
// 地点ページには置かない(審査で見られる本文を広告で薄めないため)。
//
// url はアフィリエイトの管理画面で発行した商品リンクの href を入れる。
// 計測用の画像(1x1)が付くリンクなら、その src を pixel に入れる。
// url が空の商品は出力しないので、候補を並べたままにしておいてよい。
// 1つも url が無いページでは枠ごと出さない。
//
// 景品表示法(ステルスマーケティング規制, 2023年10月〜)により、広告で
// あることを見出しと本文の両方で明示している。文言は外さないこと。
// =====================================================================

import { esc, attr } from './html.mjs';

export const AFFILIATE_ITEMS = {
  shiohigari: [
    { name: '潮干狩り用の熊手', note: '砂を浅く掻くものと、深い場所向けの爪の長いものがあります。', url: '', pixel: '' },
    { name: '貝を入れる網袋・バケツ', note: '網袋なら採った貝をそのまま海水で洗えます。', url: '', pixel: '' },
    { name: 'マリンシューズ・長靴', note: '干潟には貝殻やカキ殻があり、素足やサンダルは危険です。', url: '', pixel: '' },
    { name: '作業用の手袋', note: '貝殻で手を切らないよう、ゴム引きのものが使いやすいです。', url: '', pixel: '' },
    { name: 'クーラーボックス', note: '持ち帰る貝は海水と一緒に冷やして運びます。', url: '', pixel: '' },
  ],
  tsuri: [
    { name: 'ライフジャケット', note: '堤防や磯でも着用をおすすめします。桜マーク付きは船でも使えます。', url: '', pixel: '' },
    { name: 'タイドグラフ付きの腕時計', note: '釣り場で潮の満ち引きを手元で確認できます。', url: '', pixel: '' },
    { name: 'ヘッドライト', note: '夕まずめから夜にかけての釣りや、暗いうちの移動に。', url: '', pixel: '' },
  ],
  suishin: [
    { name: 'ヨット・モーターボート用参考図', note: '海図をもとにした沿岸の水深図です。航海には正式な海図を使ってください。', url: '', pixel: '' },
    { name: 'ポータブル魚群探知機', note: '岸やボートから実際の水深を測れます。', url: '', pixel: '' },
  ],
};
// 潮干狩りカレンダーは潮干狩りと同じ道具
AFFILIATE_ITEMS['shiohigari-calendar'] = AFFILIATE_ITEMS.shiohigari;

const live = key => (AFFILIATE_ITEMS[key] || []).filter(x => x.url);

export function hasAffiliate() {
  return Object.keys(AFFILIATE_ITEMS).some(k => live(k).length);
}

export function affiliateBlock(key) {
  const items = live(key);
  if (!items.length) return '';
  return `<aside class="aff" aria-label="広告">
  <h2>あると便利な道具<span class="aff-pr">PR</span></h2>
  <p class="note">以下は広告です。リンク先で購入されると、当サイトに紹介料が支払われます。</p>
  <ul>${items.map(x => `<li><a href="${attr(x.url)}" rel="sponsored nofollow noopener" target="_blank">${esc(x.name)}</a>`
    + `<span class="note">${esc(x.note)}</span>`
    + (x.pixel ? `<img src="${attr(x.pixel)}" width="1" height="1" alt="" loading="lazy">` : '') + '</li>').join('')}</ul>
</aside>`;
}
