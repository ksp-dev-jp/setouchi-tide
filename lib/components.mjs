// =====================================================================
// ページ部品（すべてビルド時に文字列として組み立てる）
//
// 元アプリは React + x-dc テンプレートで実行時に描いていた。ここでは
// 同じ見た目を静的 HTML として出力する。クライアント JS が無くても
// 潮位グラフ・10分毎グリッド・満干潮表がそのまま読めるのが要点で、
// これが検索エンジンに中身を渡す唯一の方法でもある。
// =====================================================================

import { asset } from '../config.mjs';
import { esc, attr } from './html.mjs';
import { pref } from './routes.mjs';
import { fmtHM, fmtDur, pad2, WD, weekdayColor, SHIO_STYLE, dms } from './util.mjs';
import { moonPath, phaseName } from './astro.mjs';
import { movingWindows } from './tide.mjs';
import { telop } from './telops.mjs';

const ACC = '#2b5d7a';        // 潮位の線（藍）
const WARM = '#b06a3f';       // 強調（弁柄）

// サイトの木版画調に合わせ、画像生成した朱色のピクトグラムを共通利用する。
// 128px の透過 PNG を表示サイズまで縮小するため、高DPIでも輪郭を保てる。
function icon(name, className = '') {
  return `<img class="ic ic-${attr(name)} ${attr(className)}" src="${attr(asset(`icons/woodblock/${name}.png`))}" width="32" height="32" alt="" aria-hidden="true" decoding="async">`;
}

function weatherKind(code, text = '') {
  const label = `${telop(code) || ''}${text}`;
  // 短期予報の文章には「曇り、所により昼過ぎから夕方、雨で雷を伴い…」
  // のように、先頭の空模様より後半の注意すべき現象が書かれている。
  // 主役アイコンは危険度の高い現象を優先し、曇りだけのアイコンに見える
  // という誤解を避ける。
  if (/雷/.test(label)) return 'thunder';
  if (/雪/.test(label)) return 'snow';
  if (/雨|みぞれ/.test(label)) return 'rain';
  if (/霧/.test(label)) return 'mist';
  if (/晴/.test(label) && /曇|くもり/.test(label)) return 'suncloud';
  if (/晴/.test(label)) return 'sun';
  return 'cloud';
}

function weatherIcon(code, text, className = '') {
  return icon(weatherKind(code, text), `wx-icon ${className}`);
}

function tideMark(high, label = true) {
  return `<span class="tide-mark ${high ? 'hi' : 'lo'}">${icon(high ? 'high' : 'low')} ${label ? (high ? '満潮' : '干潮') : ''}</span>`;
}

function graphNav(nav) {
  if (!nav) return '';
  const button = (item, direction) => item
    ? `<a class="graph-step ${direction}" href="${attr(item.href)}" aria-label="${attr(item.label)}のタイドグラフを表示">${icon(direction === 'prev' ? 'chevronLeft' : 'chevronRight')}<span>${esc(item.label)}</span></a>`
    : `<span class="graph-step ${direction} off" aria-hidden="true"></span>`;
  return `<figcaption class="graph-nav"><span class="graph-hint">タップ／カーソルで時刻・潮位を確認　左右スワイプで日を切り替え</span>${button(nav.prev, 'prev')}<span class="graph-date">${esc(nav.current)}</span>${button(nav.next, 'next')}</figcaption>`;
}

// ---------------------------------------------------------------------
// 潮位グラフ
// ---------------------------------------------------------------------
// viewBox は 920×520。横長の比率にして、PCでグラフだけが画面を占有しない
// ようにする。スマホでも横 100% で高さが追従し、曲線を判読できる。
//
// 文字サイズは CSS 側（style.css の @container）が SVG の font-size を
// 決める。SVG の中身は viewBox 単位に縮尺されるので、幅 316px のカードでは
// 17単位の文字が 5.8px にまで潰れてしまう。コンテナ幅ごとに font-size を
// 17〜34単位へ切り替えることで、どの幅でも実寸 11〜16px を保つ。
//
// そのためグラフ内の縦位置は「font-size 依存の部分は em、目盛りなど文字と
// 無関係な部分は viewBox 単位」で書き分けている。満干潮ラベルの3行や軸ラベル
// の逃がし量が em なのはこのため。文字が大きくなれば行間も一緒に伸びる。
// ラベル3行分の余白を確保しつつ、曲線自体が縦方向に潰れないよう、潮位の
// 上下余白はグラフ高の21%ずつを最低ラインとする。
export function tideGraph(day, cel, nav = null) {
  const W = 920, H = 520, X0 = 90, X1 = 894, Y0 = 56, Y1 = 464;
  const lv = day.levels;

  // 縦軸の目盛り間隔。干満差が25cm程度の山陰でグラフが潰れないよう可変にする。
  const span = Math.max(20, day.max - day.min);
  const step = span > 300 ? 50 : span > 150 ? 25 : span > 60 ? 10 : 5;
  // 満干潮ラベルは3行あるので、最大文字サイズでは上下それぞれグラフ高の
  // 21% を占める。目盛りを step で丸めると「余白の比率」は縮む（丸めた分だけ
  // 目盛り範囲そのものが広がるため）ので、丸めたあとに比率で確かめ、
  // 足りなければ step ぶん広げる。山陰のように干満差 20cm 台の地点でも
  // ラベルが時刻軸に重ならないのはこの補正のため。
  const labelRatio = 0.21;
  let lo = Math.floor((day.min - span * labelRatio) / step) * step;
  let hi = Math.ceil((day.max + span * labelRatio) / step) * step;
  for (let n = 0; n < 12; n++) {
    const range = hi - lo;
    if ((day.min - lo) / range < labelRatio) lo -= step;
    else if ((hi - day.max) / range < labelRatio) hi += step;
    else break;
  }

  const x = i => X0 + (X1 - X0) * (i / 143);
  const y = v => Y1 - (Y1 - Y0) * ((v - lo) / (hi - lo));

  // 夜間の帯
  const hx = h => X0 + (X1 - X0) * (h / 24);
  const night = [];
  if (cel.sunrise > 0) night.push([hx(0), hx(cel.sunrise)]);
  if (cel.sunset < 24) night.push([hx(cel.sunset), hx(24)]);

  // 色は class 経由で CSS 変数を参照させる(ダークモードで反転させるため)。
  // ACC/WARM(潮位の線・満干潮マーカー)だけは明暗どちらの背景でも視認できる
  // 中間トーンなので、そのまま inline のリテラル色で出す。
  // 線の太さは CSS 側で em 指定にしてあり、文字と一緒に太くなる。
  let g = '';
  for (const [a, b] of night) {
    g += `<rect class="night" x="${a.toFixed(1)}" y="${Y0}" width="${(b - a).toFixed(1)}" height="${Y1 - Y0}"/>`;
  }
  // 目盛りの数値は線の上に乗せず、dy=.36em(数字の高さの半分)で線の中央に置く。
  for (let v = lo; v <= hi; v += step) {
    const yy = y(v).toFixed(1);
    g += `<line class="grid-ln" x1="${X0}" y1="${yy}" x2="${X1}" y2="${yy}"${v === lo ? '' : ' stroke-dasharray="3 4"'}/>`
      + `<text x="${X0 - 9}" y="${yy}" dy=".36em" text-anchor="end" class="ax">${v}</text>`;
  }
  for (let h = 0; h <= 24; h += 3) {
    const xx = hx(h).toFixed(1);
    g += `<line class="grid-tick" x1="${xx}" y1="${Y1}" x2="${xx}" y2="${Y1 + 8}"/>`
      + `<text x="${xx}" y="${Y1}" dy="1.45em" text-anchor="middle" class="ax">${h}</text>`;
  }

  // 座標の桁は詰める。144点 × 2本(線と塗り)を 11,000ページぶん出すので、
  // 小数1桁の削減がそのままサイトの総容量に効く。x は 6単位刻みなので整数で足りる。
  const pts = lv.map((v, i) => `${Math.round(x(i))},${y(v).toFixed(1)}`);
  const line = 'M' + pts.join('L');
  const area = line + `L${X1},${Y1}L${X0},${Y1}Z`;

  g += `<path d="${area}" fill="rgba(43,93,122,.10)"/>`
    + `<path class="tide-line" d="${line}" fill="none" stroke="${ACC}" stroke-linejoin="round"/>`;

  for (const e of day.extremes) {
    const i = Math.min(143, Math.max(0, Math.round(e.time * 6)));
    const cx = x(i), cy = y(e.level);
    const high = e.type === '満潮';
    // ラベルは満潮なら上、干潮なら下。端に寄った極値は文字が枠外に出るので、
    // アンカーだけを寄せて逃がす（左端では marker の右へ、右端では左へ流す）。
    // 56 は最大文字サイズでの1行の半幅。左端で更に外へずらすと目盛りの数値に
    // かぶるので、逃がし量は持たせない。
    const anchor = cx - 56 < X0 ? 'start' : cx + 56 > X1 ? 'end' : 'middle';
    const tx = Math.round(cx);
    // マーカー(丸+三角)は translate を属性、拡大を CSS(--gs)に分けてある。
    // CSS が効かない環境でも位置だけは属性で確定し、等倍で出る。
    g += `<g transform="translate(${Math.round(cx)},${Math.round(cy)})"><g class="mkr">`
      + `<circle r="5.5" fill="#fbfaf5" stroke="${ACC}" stroke-width="2.4"/>`
      + `<path class="graph-arrow ${high ? 'hi' : 'lo'}" d="${high ? 'M0,-14l-6,9h12Z' : 'M0,14l-6,-9h12Z'}"/>`
      + `</g></g>`
      // 3行(満/干・時刻・潮位)を1つの text にまとめ、行送りを em で送る。
      // font-size が変わっても行間と丸からの逃がしが比例して動く。
      + `<text x="${tx}" y="${Math.round(cy)}" text-anchor="${anchor}" class="mklabel">`
      + `<tspan x="${tx}" dy="${high ? '-3em' : '1.85em'}" class="mk ${high ? 'hi' : 'lo'}">${high ? '満潮' : '干潮'}</tspan>`
      + `<tspan x="${tx}" dy="1em" class="mkv">${fmtHM(e.time)}</tspan>`
      + `<tspan x="${tx}" dy="1em" class="mkv dim">${Math.round(e.level)}cm</tspan>`
      + `</text>`;
  }

  // 当日ページでは client 側が data-* を読んで現在時刻マーカーを足す
  const data = nav ? ` data-graph-swipe${nav.prev ? ` data-prev="${attr(nav.prev.href)}"` : ''}${nav.next ? ` data-next="${attr(nav.next.href)}"` : ''}` : '';
  return `<figure class="graph"${data}>
${graphNav(nav)}
<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${attr(`潮位グラフ 最高${day.max}cm 最低${day.min}cm`)}"
     data-graph data-x0="${X0}" data-x1="${X1}" data-y0="${Y0}" data-y1="${Y1}" data-lo="${lo}" data-hi="${hi}">${g}</svg>
</figure>`;
}

// ---------------------------------------------------------------------
// 満潮・干潮の一覧
// ---------------------------------------------------------------------
export function extremeTable(day) {
  if (!day.extremes.length) return '<p class="none">この日の満潮・干潮データがありません。</p>';
  const rows = day.extremes.map(e => {
    const high = e.type === '満潮';
    return `<tr class="${high ? 'hi' : 'lo'}"><th scope="row">${tideMark(high)}</th>`
      + `<td class="t">${fmtHM(e.time)}</td><td class="v">${Math.round(e.level)}<small>cm</small></td></tr>`;
  }).join('');
  return `<table class="ext"><caption class="sr">満潮・干潮の時刻と潮位</caption><tbody>${rows}</tbody></table>`;
}

// ---------------------------------------------------------------------
// よく動く時間帯（このサイト独自）
// ---------------------------------------------------------------------
export function flowBlock(day) {
  const ws = movingWindows(day.levels);
  if (!ws.length) {
    return `<p class="none">この日は潮位の変化がゆるやかで、際立って動く時間帯はありません。</p>`;
  }
  const items = ws.map(w => `<li class="${w.dir === '上げ' ? 'up' : 'down'}">
    <span class="fw-t">${esc(w.fromStr)}<span class="dash">–</span>${esc(w.toStr)}</span>
    <span class="fw-d">${esc(w.dir)}潮</span>
    <span class="fw-r">最大 ${w.peak}<small>cm/h</small></span>
  </li>`).join('');
  return `<ul class="flow">${items}</ul>
<p class="note">10分毎の補間潮位の前後差から変化速度を求め、当日の最大変化速度の60%以上で40分以上続く区間を表示しています。単位cm/hは海面が上下する速さで、海水の流速や釣果を示すものではありません。</p>`;
}

// ---------------------------------------------------------------------
// 10分毎 潮位グリッド（24行 × 6列）
// ---------------------------------------------------------------------
export function tideGrid(day) {
  const lv = day.levels;
  const lo = day.min, hi = day.max, sp = Math.max(1, hi - lo);
  // 濃淡は 10段階のクラスで出す。セルごとに rgba() をインラインで書くと
  // 1セル 70バイト、1ページ 11KB、全体で 100MB 以上になる。
  let cells = '<div class="tdcell hd0">時＼分</div>';
  for (let m = 0; m < 60; m += 10) cells += `<div class="tdcell hd">${pad2(m)}</div>`;
  for (let h = 0; h < 24; h++) {
    cells += `<div class="tdcell hh">${pad2(h)}</div>`;
    for (let k = 0; k < 6; k++) {
      const v = lv[h * 6 + k];
      const s = Math.min(9, Math.floor(((v - lo) / sp) * 10));
      cells += `<div class="tdcell s${s}">${v}</div>`;
    }
  }
  return `<div class="tdgrid" data-grid>${cells}</div>
<p class="note">行＝時、列＝分。数値は cm。濃いほど潮位が高い。気象庁の毎時推算値を三次スプラインで10分刻みに補間しています。</p>`;
}

// ---------------------------------------------------------------------
// 日月データ
// ---------------------------------------------------------------------
export function sunMoon(cel) {
  const phase = cel.age / 29.530588853;
  return `<div class="sm">
  <div class="sm-col">
    <div class="sm-hd">${icon('sun', 'sun-icon')}太陽<span class="en">SUN</span></div>
    <dl>
      <dt>日の出</dt><dd>${fmtHM(cel.sunrise)}</dd>
      <dt>日の入</dt><dd>${fmtHM(cel.sunset)}</dd>
      <dt>昼の長さ</dt><dd>${fmtDur(cel.daylen)}</dd>
    </dl>
  </div>
  <div class="sm-col">
    <div class="sm-hd">月<span class="en">MOON</span></div>
    <dl>
      <dt>月の出</dt><dd>${fmtHM(cel.moonrise)}</dd>
      <dt>月の入</dt><dd>${fmtHM(cel.moonset)}</dd>
      <dt>正中</dt><dd>${fmtHM(cel.moonculm)}</dd>
    </dl>
  </div>
  <div class="sm-moon">
    <svg viewBox="0 0 60 60" width="60" height="60" aria-hidden="true">
      <circle cx="30" cy="30" r="21" fill="rgba(60,50,35,.10)"/>
      <path d="${moonPath(30, 30, 21, phase)}" fill="#e8dcc0"/>
    </svg>
    <div class="mn-name">${esc(phaseName(cel.age))}</div>
    <div class="mn-age">月齢 ${cel.age.toFixed(1)}・輝面 ${Math.round(cel.illum * 100)}%</div>
  </div>
</div>`;
}

// ---------------------------------------------------------------------
// 現在の潮位（クライアントが埋める箱）
//
// data-ext には気象庁の満干潮を渡す。「次の満潮まであと何分」を
// 10分毎の系列から極値検出で出すと 11:40 のように5分ずれ、すぐ下の表に
// 出ている公式の 11:45 と食い違う。公式値を正としてそのまま使う。
// ---------------------------------------------------------------------
export function nowBox(day) {
  const ext = day.extremes
    .map(e => (e.type === '満潮' ? 'H' : 'L') + e.time.toFixed(4))
    .join(',');
  return `<div class="now" data-now data-levels="${attr(day.levels.join(','))}" data-ext="${attr(ext)}"></div>`;
}

// ---------------------------------------------------------------------
// 気象・海象（気象庁の天気予報。ビルド時に取得して HTML に焼き込む）
//
// fc は forecast.mjs の forecastFor(st, ymd) の戻り値。予報の無い日は
// null が来る（過去日、および8日以上先）。
// ---------------------------------------------------------------------

// Windy への外部リンク。Windy の地図そのものを載せるには有償の
// Map Forecast API 契約が要るが、公開サイトへのリンクは自由に張れる。
// 広域の風・波・気圧の動きは Windy のほうが見やすいので、
// 「ここから先は本家で」と渡す先として置いている。
function windyUrl(st) {
  return `https://www.windy.com/?${st.lat.toFixed(3)},${st.lon.toFixed(3)},9`;
}

function windyLink(st) {
  return `<p class="wx-more"><a href="${attr(windyUrl(st))}" rel="nofollow noopener" target="_blank">`
    + `Windy でこの海域の風・波・気圧を見る</a></p>`;
}

// ---------------------------------------------------------------------
// 用途別モード
//
// 釣り・潮干狩り・サーフ・環境調査・航海管理ごとに、地点固有の潮位帯と
// 上げ下げ、日中限定の設定を保存する。結果は10分刻みの潮位からクライアント
// 側で抽出する。潮位系列はSVGへ描画済みなので、ここでは重複させない。
// ---------------------------------------------------------------------
export function activityModeBlock(st, day, cel, fc, isToday = false) {
  const wave = fc?.wave || '未発表';
  const wind = fc?.wind || '未発表';
  const stationKey = `${st.pref}/${st.id}`;

  return `<section class="activity-card" id="activity-mode" data-activity data-activity-station="${attr(stationKey)}"
    data-day-min="${day.min}" data-day-max="${day.max}"
    data-sunrise="${cel.sunrise}" data-sunset="${cel.sunset}"${isToday ? ' data-activity-today' : ''}>
  <header class="activity-head">
    <p class="activity-intro" data-activity-description>用途を選び、現地に合う潮位条件を設定すると候補時間を絞り込めます。</p>
  </header>
  <div class="activity-purpose" aria-label="用途を選択">
    <button type="button" data-activity-purpose="fishing" aria-pressed="true">釣り</button>
    <button type="button" data-activity-purpose="clamming" aria-pressed="false">潮干狩り</button>
    <button type="button" data-activity-purpose="surf" aria-pressed="false">サーフ</button>
    <button type="button" data-activity-purpose="research" aria-pressed="false">環境調査</button>
    <button type="button" data-activity-purpose="navigation" aria-pressed="false">航海管理</button>
  </div>
  <div class="activity-layout">
    <div class="activity-settings" aria-label="用途別モードの条件">
      <label><span>対象の潮位帯</span><span class="activity-range">
        <input type="number" data-activity-min-input value="${day.min}" min="-300" max="500" step="5" inputmode="numeric" aria-label="対象の最低潮位">〜
        <input type="number" data-activity-max-input value="${day.max}" min="-300" max="500" step="5" inputmode="numeric" aria-label="対象の最高潮位"><small>cm</small>
      </span></label>
      <label><span>潮の向き</span><select data-activity-direction aria-label="対象とする潮の向き">
        <option value="both">上げ・下げ両方</option><option value="up">上げ潮</option><option value="down">下げ潮</option>
      </select></label>
      <label class="activity-daylight"><input type="checkbox" data-activity-daylight checked> 日の出から日の入までに絞る</label>
      <p class="activity-saved" data-activity-saved aria-live="polite">用途ごと・地点ごとの設定として端末内に保存されます。</p>
    </div>
    <div class="activity-result">
      ${isToday ? `<p class="activity-now"><span>現在</span><b data-activity-now>計算中</b></p>` : ''}
      <h3 data-activity-result-title>釣行候補</h3>
      <ul data-activity-windows><li>条件に合う時間を計算しています。</li></ul>
      <p class="activity-result-note" data-activity-result-note></p>
    </div>
  </div>
  <dl class="activity-sea">
    <div><dt>${icon('wave')}波</dt><dd>${esc(wave)}</dd></div>
    <div><dt>${icon('wind')}風</dt><dd>${esc(wind)}</dd></div>
    <div><dt>${icon('sun')}日中</dt><dd>${fmtHM(cel.sunrise)}〜${fmtHM(cel.sunset)}</dd></div>
  </dl>
  <p class="activity-foot"><span data-activity-caution>候補時間は釣果や安全を保証するものではありません。</span>
    波向・周期・うねりと現地情報は<a href="${attr(windyUrl(st))}" rel="nofollow noopener" target="_blank">Windyで確認</a>してください。</p>
</section>`;
}

function reportJa(iso) {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})/.exec(iso);
  if (!m) return '';
  return `${Number(m[2])}月${Number(m[3])}日${Number(m[4])}時発表`;
}

export function weatherBlock(st, ymd, fc) {
  if (!fc) {
    return `<div class="wx">
  <p class="wx-err">この日の天気予報はありません。気象庁の天気予報は今日から7日先までです。
  過去の天気は<a href="https://www.data.jma.go.jp/stats/etrn/index.php" rel="nofollow noopener" target="_blank">気象庁「過去の気象データ検索」</a>で調べられます。
  潮位は推算値なので、この欄が空でも上の潮汐は通年で表示されます。</p>
</div>`;
  }

  const cells = [];
  // 最高と最低が同じ値になるのは、その日の最低気温が発表時点で
  // すでに過ぎている場合（当日の11時発表など）。片方だけ出す。
  let hasTemp = true;
  if (fc.tmax != null && fc.tmin != null && fc.tmax !== fc.tmin) {
    cells.push(['thermo', '気温', `${fc.tmax} / ${fc.tmin}`, '℃']);
  } else if (fc.tmax != null) {
    cells.push(['thermo', '最高気温', String(fc.tmax), '℃']);
  } else if (fc.tmin != null) {
    cells.push(['thermo', '最低気温', String(fc.tmin), '℃']);
  } else {
    hasTemp = false;
  }
  if (fc.pop != null) cells.push(['drop', '降水確率', String(fc.pop), '%']);
  if (fc.wave) cells.push(['wave', '波', fc.wave, '']);

  const grid = cells.length
    ? `<div class="wx-grid">${cells.map(([i, k, v, u]) =>
      `<div>${icon(i, 'wx-metric-icon')}<span class="k">${esc(k)}</span><span class="v">${esc(v)}`
      + `${u ? `<small>${esc(u)}</small>` : ''}</span></div>`).join('')}</div>`
    : '';

  const wind = fc.wind
    ? `<dl class="wx-txt"><dt>${icon('wind', 'wx-wind-icon')}風</dt><dd>${esc(fc.wind)}</dd></dl>`
    : '';

  const rel = fc.reliability
    ? `<span class="wx-rel" title="週間予報の信頼度。A が最も確度が高い">信頼度 ${esc(fc.reliability)}</span>`
    : '';

  // 一次細分区域の名前は「南部」「沿岸」のように県名が付かないので、
  // ここで県名を足さないとどこの予報だか分からない。ただし「東京地方」の
  // ように区域名が県名を含んでいるものは二重になるので足さない。
  const p = pref(st.pref);
  const prefName = p ? p.name : '';
  const stem = prefName.replace(/[都道府県]$/, '');
  const areaJa = !fc.areaName ? prefName
    : (stem && fc.areaName.startsWith(stem)) ? fc.areaName
      : prefName + fc.areaName;
  const src = `${areaJa ? esc(areaJa) + 'の予報' : '予報'}`
    + `（気象庁 ${esc(reportJa(fc.reportTime))}）。`
    + (hasTemp && fc.spotName ? `気温は${esc(fc.spotName)}の観測点の値です。` : '')
    + (fc.kind === 'week' ? '3日先以降は週間予報のため、天気と降水確率は県内で共通の値になります。' : '');

  return `<div class="wx">
  ${fc.weather ? `<div class="wx-head">${weatherIcon(fc.code, fc.weather)}<span class="cond">${esc(fc.weather)}</span>${rel}</div>` : ''}
  ${grid}
  ${wind}
  <p class="note">${src}</p>
  ${windyLink(st)}
</div>`;
}

// ---------------------------------------------------------------------
// 予報への外部リンク（表示モードのタブの横に置く小さなボタン）
//
// 天気は気象庁の天気予報ページの、その地点が属する府県予報区へ直接飛ばす。
// 波は地点単位で見られる Windy へ。どちらもこのサイトが持っていない
// 「今日より先の細かい推移」を見に行くための出口なので、外部リンクとして
// 新しいタブで開き、nofollow を付けている。
// ---------------------------------------------------------------------
const JMA_FORECAST_TOP = 'https://www.jma.go.jp/bosai/forecast/';

export function forecastLinks(st, fc, extraLinks = []) {
  const wx = fc && fc.officeCode
    ? `${JMA_FORECAST_TOP}#area_type=offices&area_code=${fc.officeCode}`
    : JMA_FORECAST_TOP;
  const link = (href, name, label, title) =>
    `<a class="fclink" href="${attr(href)}" title="${attr(title)}" rel="nofollow noopener" target="_blank">`
    + `${icon(name, 'fc-icon')}<span>${esc(label)}</span></a>`;
  const extra = extraLinks.map(item => link(item.href, item.icon, item.label, item.title)).join('');
  return `<nav class="fclinks" aria-label="この地点の外部情報"><span class="fclinks-label">外部情報 ↗</span>`
    + link(wx, 'suncloud', '天気予報', '気象庁の天気予報を見る（外部サイト）')
    + link(windyUrl(st), 'wave', '波予報', 'Windy でこの海域の波を見る（外部サイト）')
    + extra
    + `</nav>`;
}

// ---------------------------------------------------------------------
// 潮名バッジ
// ---------------------------------------------------------------------
export function shioBadge(shio) {
  const s = SHIO_STYLE[shio] || SHIO_STYLE['中潮'];
  return `<span class="shio" style="background:${s.bg};border-color:${s.border};color:${s.color}">${esc(shio)}</span>`;
}

// ---------------------------------------------------------------------
// 週間一覧
// rows: [{ dayMs, ymd, href, cel, day }]
// ---------------------------------------------------------------------
// detailed=true は週間ページ専用の拡張列(天気・潮がよく動く時間帯)を足す。
// 地点ハブの「これからの7日間」は表を軽く保ちたいので既定は false のまま。
export function weekTable(rows, detailed = false) {
  const body = rows.map(r => {
    const d = new Date(r.dayMs);
    const wd = d.getUTCDay();
    const hi = r.day ? r.day.highs.map(e => fmtHM(e.time) + ' <small>' + Math.round(e.level) + '</small>').join('<br>') : '—';
    const lo = r.day ? r.day.lows.map(e => fmtHM(e.time) + ' <small>' + Math.round(e.level) + '</small>').join('<br>') : '—';
    const extra = detailed ? `
      <td class="wx">${weekWx(r.fc)}</td>
      <td class="fl">${weekFlow(r.day)}</td>` : '';
    // href が無い日 = その日の日別ページを作っていない日。リンクにしない。
    const label = `${d.getUTCMonth() + 1}/${d.getUTCDate()}
        <span class="wd" style="color:${weekdayColor(wd)}">${WD[wd]}</span>`;
    return `<tr${r.today ? ' class="today"' : ''}>
      <th scope="row">${r.href ? `<a href="${attr(r.href)}">${label}</a>` : label}</th>
      <td>${shioBadge(r.cel.shio)}</td>
      <td class="hi">${hi}</td>
      <td class="lo">${lo}</td>
      <td class="mn">${r.cel.age.toFixed(1)}</td>${extra}
    </tr>`;
  }).join('');
  const extraHead = detailed ? '<th>天気</th><th>潮がよく動く時間帯</th>' : '';
  return `<div class="tw"><table class="week">
  <thead><tr><th>日付</th><th>潮名</th><th>満潮 <small>cm</small></th><th>干潮 <small>cm</small></th><th>月齢</th>${extraHead}</tr></thead>
  <tbody>${body}</tbody></table></div>`;
}

// 短期予報(今日・明日・明後日)の weather は「くもり時々晴れ所により
// 昼過ぎから夜のはじめ頃雨で雷を伴う」のような長い文章になることがあり、
// 7日ぶん並べる週間表には長すぎる。天気コードから引く短い呼び名
// (例:「曇時々晴」)で揃える。
function weekWx(fc) {
  if (!fc) return '<span class="dim">—</span>';
  const w = telop(fc.code) || fc.weather;
  const t = fc.tmax != null && fc.tmin != null
    ? `${fc.tmax}<small>/</small>${fc.tmin}<small>℃</small>`
    : fc.tmax != null ? `${fc.tmax}<small>℃</small>` : '';
  return `${w ? `${weatherIcon(fc.code, w, 'week-wx-icon')}<span>${esc(w)}</span>` : ''}${t ? `<br><span class="tmp">${t}</span>` : ''}`;
}

// day.levels が無い(軽量版)ときは何も出さない。呼び出し側(週間ページ)は
// 常にlevels付きのdayを渡す想定。
function weekFlow(day) {
  if (!day || !day.levels) return '<span class="dim">—</span>';
  const ws = movingWindows(day.levels);
  if (!ws.length) return '<span class="dim">—</span>';
  return ws.map(w => `${w.fromStr}〜${w.toStr}`).join('<br>');
}

// ---------------------------------------------------------------------
// 月間カレンダー
// cells: [{ dayMs|null, ymd, href, cel, day }]
// ---------------------------------------------------------------------
export function monthCalendar(cells) {
  const head = WD.map((w, i) =>
    `<div class="cal-hd" style="color:${weekdayColor(i)}">${w}</div>`).join('');
  const body = cells.map(c => {
    if (!c) return '<div class="cal-cell empty"></div>';
    const d = new Date(c.dayMs);
    const wd = d.getUTCDay();
    const ex = c.day
      ? c.day.extremes.map(e =>
        `<li class="${e.type === '満潮' ? 'h' : 'l'}">${tideMark(e.type === '満潮', false)}${fmtHM(e.time)} <em>${Math.round(e.level)}</em></li>`).join('')
      : '';
    // .cal-w は狭い画面でカレンダーを1列のリストに畳んだときだけ出す曜日。
    // 7列のままスマホに出すと1セルが50px を切って潮位が読めなくなる。
    //
    // 日別ページを作っていない日(生成範囲外)はリンクにしない。
    // カレンダーの中身(満潮・干潮・潮名)はどの日にも入っているので、
    // リンクが無くてもその日の情報は読める。
    const head = `<span class="cal-d" style="color:${weekdayColor(wd)}">${d.getUTCDate()}</span>`
      + `<span class="cal-w" style="color:${weekdayColor(wd)}">${WD[wd]}</span>`
      + `<span class="cal-s">${esc(c.cel.shio)}</span>`;
    return `<div class="cal-cell${c.today ? ' today' : ''}">
      ${c.href ? `<a href="${attr(c.href)}">${head}</a>` : `<span class="cal-hdr">${head}</span>`}
      <ul class="cal-ex">${ex}</ul>
    </div>`;
  }).join('');
  return `<div class="cal"><div class="cal-row-hd">${head}</div><div class="cal-grid">${body}</div></div>`;
}

// ---------------------------------------------------------------------
// 地点一覧（都道府県ページ・近隣リンク）
// items: [{ href, name, kana, official, tier, note }]
// ---------------------------------------------------------------------
export function stationList(items, cls = '') {
  return `<ul class="stlist ${cls}">` + items.map(i =>
    `<li><a href="${attr(i.href)}">
      <span class="dot ${i.tier || (i.official ? 'off' : 'apx')}" aria-hidden="true"></span>
      <span class="nm">${esc(i.name)}</span>
      ${i.kana ? `<span class="kn">${esc(i.kana)}</span>` : ''}
      ${i.note ? `<span class="nt">${esc(i.note)}</span>` : ''}
    </a></li>`).join('') + '</ul>';
}

// 座標表示
export function coords(st) {
  return `<span class="coord">${dms(st.lat, 'N', 'S')}　${dms(st.lon, 'E', 'W')}</span>`;
}
