// =====================================================================
// 潮干狩り場ごとの「大きく引く日」
//
//   /tool/shiohigari-{slug}/
//
// 開催期間・料金は出典のページに書かれていた前シーズンの実績だけを載せ、
// 来シーズンの日程は推測で書かない。潮の数字は最寄りの公式観測点の推算値。
// 浜を増やすときは、出典を確認できたものだけを足すこと。
// =====================================================================

import { SITE } from '../config.mjs';
import { page, esc, attr, section, ad } from './html.mjs';
import { paths, abs, pref } from './routes.mjs';
import { stationLabel } from './station-quality.mjs';
import { fmtHM, WD, dayMsOf } from './util.mjs';
import { HOLIDAYS } from './holidays.mjs';
import { CALENDAR_SLUG } from './tools.mjs';

export const SPOTS_UPDATED = '2026-11-08';

export const SPOTS = [
  {
    slug: 'uminokouen', name: '海の公園', area: '神奈川県横浜市金沢区', jma: 'QS',
    last: '3月〜9月中旬の間に可能。干潮時刻の前後2時間が目安',
    fee: '2kg以内まで無料',
    source: { name: 'たびまがじん', url: 'https://tabi-mag.jp/kn0050/' },
  },
  {
    slug: 'futtsu', name: '富津海岸潮干狩場', area: '千葉県富津市', jma: 'KZ',
    last: '2026年3月7日〜7月31日（7月は東口での臨時営業）',
    fee: '大人（中学生以上）2,200円で網袋付き2kg、小人（4歳〜小学生）1,100円で網袋付き1kg。超過は1kgあたり1,100円',
    official: { name: '富津漁業協同組合', url: 'http://www.jf-futtsu.com/' },
    source: { name: 'るるぶKids', url: 'https://kids.rurubu.jp/article/1288/' },
  },
  {
    slug: 'kaneda', name: '金田みたて海岸潮干狩り場', area: '千葉県木更津市', jma: 'KZ',
    last: '2026年3月20日〜7月5日',
    fee: '大人（中学生以上）2kgまで2,200円、小人（4歳〜小学生）1kgまで1,100円。超過は1kgあたり1,000円',
    official: { name: '金田漁業協同組合', url: 'https://www.jf-kaneda.jp/' },
    source: { name: 'るるぶKids', url: 'https://kids.rurubu.jp/article/1288/' },
  },
  {
    slug: 'sambanze', name: 'ふなばし三番瀬海浜公園', area: '千葉県船橋市', jma: 'CB',
    last: '2026年4月16日〜5月31日',
    fee: '大人（中学生以上）700円（土日祝800円）、子ども（4歳〜小学生）350円（土日祝400円）。持ち帰りは100gあたり130円',
    official: { name: 'ふなばし三番瀬海浜公園', url: 'https://www.sambanze.jp/' },
    source: { name: 'るるぶKids', url: 'https://kids.rurubu.jp/article/1288/' },
  },
  {
    slug: 'takeshima', name: '竹島海岸', area: '愛知県蒲郡市', jma: 'G5',
    last: '2026年4月17日〜6月4日（天候により中止の場合あり）',
    fee: '小学生以上1,500円。規定の袋を超える分は1kgあたり800円。熊手のレンタル200円（返却時に100円返金）',
    official: { name: '蒲郡市観光協会', url: 'https://www.gamagori.jp/spot/64' },
    source: { name: 'Aichi Now（愛知県の観光サイト）', url: 'https://aichinow.pref.aichi.jp/events/detail/1153/' },
  },
  {
    slug: 'tokoname', name: '常滑の潮干狩り（樽水・西阿野・古場海岸）', area: '愛知県常滑市', jma: 'ZD',
    last: '2026年4月2日〜5月6日の間の開催日',
    fee: 'あさり1袋1,000円（1人2袋まで）、はまぐり1袋2,000円（1人1袋まで）',
    official: { name: 'とこなめ観光ナビ', url: 'https://www.tokoname-kankou.net/event/detail/599/' },
    source: { name: 'Aichi Now（愛知県の観光サイト）', url: 'https://aichinow.pref.aichi.jp/events/detail/3798/' },
  },
];

export const spotSlug = s => `shiohigari-${s.slug}`;

// 次の春(3〜6月)の範囲。今日がシーズン中なら今年の残り。
export function seasonOf(todayKey) {
  const y = Number(todayKey.slice(0, 4));
  const year = todayKey.slice(5) <= '06-30' ? y : y + 1;
  return { year, from: `${year}-03-01`, to: `${year}-06-30` };
}

const wd = ymd => new Date(dayMsOf(ymd)).getUTCDay();
const rest = ymd => HOLIDAYS[ymd] || wd(ymd) === 0 || wd(ymd) === 6;
const label = ymd => `${Number(ymd.slice(5, 7))}月${Number(ymd.slice(8, 10))}日(${WD[wd(ymd)]})${HOLIDAYS[ymd] ? '・祝' : ''}`;

function daysTable(days) {
  if (!days.length) return '<p class="note">この春は、この観測点で明るいうちに大きく引く日がありません。</p>';
  const rows = days.map(d => `<tr${rest(d.ymd) ? ' class="sat"' : ''}><th scope="row">${esc(label(d.ymd))}</th><td>${esc(d.shio)}</td><td class="rg">${fmtHM(d.t)}</td><td class="rg">${Math.round(d.lv)}cm</td></tr>`).join('');
  return `<div class="tw"><table class="prefsum"><thead><tr><th>日付</th><th>潮回り</th><th>干潮の時刻</th><th>潮位</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

export function spotDays(big, season) {
  return big.days.filter(d => d.ymd >= season.from && d.ymd <= season.to);
}

export function spotPage({ spot, st, big, season, todayKey }) {
  const days = spotDays(big, season);
  const weekend = days.filter(d => rest(d.ymd));
  const name = spot.name;
  const stName = stationLabel(st);
  const title = `${name}の潮干狩り ${season.year}年`;
  const first = [...days].sort((a, b) => a.lv - b.lv)[0];
  const description = `${name}（${spot.area}）の${season.year}年春の潮干狩りに向く日。最寄りの観測点「${stName}」で、3〜6月に明るいうちに大きく引く${days.length}日の干潮の時刻と潮位を一覧にしました。`;

  const body = `
<article>
  <header class="st-hd">
    <h1>${esc(title)}<span class="h1-sub">（大きく引く日）</span></h1>
    <p class="lede">${esc(spot.area)}</p>
  </header>
  <p class="lead">${esc(name)}の近くの観測点「${esc(stName)}」では、${season.year}年3〜6月に明るいうちに大きく引く日が${days.length}日あり、そのうち土日祝は${weekend.length}日です。${first ? `いちばん低いのは${esc(label(first.ymd))}の${fmtHM(first.t)}（${Math.round(first.lv)}cm）です。` : ''}</p>
  ${section('大きく引く日', '', `${daysTable(days)}
  <p class="note">日の出の1時間後から日の入りの1時間前までの干潮のうち、今後1年で低いほう1割の日です。色の付いた行は土日祝です。観測点「<a href="${attr(paths.station(st))}">${esc(stName)}</a>」の予測で、浜の干潮時刻とは数十分ずれることがあります。</p>`)}
  ${section('開催の情報（前シーズンの参考）', '', `<div class="tw"><table class="prefsum"><tbody>
    <tr><th scope="row">期間</th><td>${esc(spot.last)}</td></tr>
    <tr><th scope="row">料金</th><td>${esc(spot.fee)}</td></tr>
    ${spot.official ? `<tr><th scope="row">公式の案内</th><td><a href="${attr(spot.official.url)}" rel="nofollow noopener" target="_blank">${esc(spot.official.name)}</a></td></tr>` : ''}
  </tbody></table></div>
  <p class="note">${season.year}年の日程と料金は、当サイトの確認時点（${esc(SPOTS_UPDATED)}）では発表を確認できていません。上の表の日が開催期間に入るとは限りません。出かける前に必ず公式の案内を確認してください。情報の出典：<a href="${attr(spot.source.url)}" rel="nofollow noopener" target="_blank">${esc(spot.source.name)}</a></p>`)}
  <div class="prose">
    <h2>出かける前に</h2>
    <ul>
      <li>貝の採取には漁業権や採ってよい量の決まりがあります。現地の案内に従ってください。</li>
      <li>春から初夏は、貝毒による自粛の呼びかけが出ることがあります。</li>
      <li>潮位表は予測です。風や気圧で実際の潮位はずれ、天候で中止になることもあります。</li>
    </ul>
  </div>
  <p class="more"><a href="${attr(paths.tool(CALENDAR_SLUG))}">全国の潮干狩りカレンダー</a>　<a href="${attr(paths.station(st))}">${esc(stName)}の潮見表</a></p>
  ${ad('footer')}
</article>`;

  return page({
    title: `${title}｜大きく引く日と干潮の時刻｜${SITE.NAME}`,
    description,
    canonical: abs.tool(spotSlug(spot)),
    trail: [
      { name: '全国', href: paths.home(), abs: abs.home() },
      { name: '潮干狩りカレンダー', href: paths.tool(CALENDAR_SLUG), abs: abs.tool(CALENDAR_SLUG) },
      { name, href: paths.tool(spotSlug(spot)), abs: abs.tool(spotSlug(spot)) },
    ],
  }, body);
}

// 潮干狩りカレンダーのページから張る一覧
export function spotLinks(rows) {
  return `<ul>${rows.map(({ spot, days, st }) => `<li><a href="${attr(paths.tool(spotSlug(spot)))}">${esc(spot.name)}</a><span class="note">（${esc(pref(st.pref).name)}・大きく引く日 ${days}日）</span></li>`).join('')}</ul>`;
}
