/* =====================================================================
   クライアント側の上乗せ

   潮汐・日月・グラフ・グリッドはすべてサーバ(ビルド)側で描き終わっている。
   ここでやるのは「ビルド時に決められないこと」だけに絞る。

     1. 現在時刻の潮位マーカー（当日ページのみ）
     2. 地図（トップ・地方・都道府県ページのみ）
     3. 用途別モード（釣り・潮干狩り・サーフ・環境調査・航海管理）
     5. 地点検索・最近見た地点（全ページ共通のヘッダー）
     6. 表のコピー / CSV 書き出し

   気象・海象はここには無い。気象庁の天気予報をビルド時に取得して
   HTML に焼き込んでいる（lib/forecast.mjs）。閲覧者のブラウザから
   気象庁を叩かないので、先方に負荷をかけず、検索エンジンにも読まれる。

   JS が動かなくてもページの中身は完全に読める。これが検索エンジンに
   内容を渡す唯一の方法であり、旧版が取りこぼしていた点でもある。
   ===================================================================== */
(function () {
  'use strict';

  var pad2 = function (n) { return String(n).padStart(2, '0'); };
  var fmtHM = function (dec) {
    var h = Math.floor(dec), m = Math.round((dec - h) * 60);
    if (m === 60) { m = 0; h += 1; }
    return pad2(h % 24) + ':' + pad2(m);
  };

  // JST の現在時刻を「0時からの小数時」で返す
  function nowHourJST() {
    var j = new Date(Date.now() + 9 * 3600000);
    return j.getUTCHours() + j.getUTCMinutes() / 60 + j.getUTCSeconds() / 3600;
  }

  // 「次の満潮/干潮まであと…」を計算してテキストを返す。
  // ext: data-ext をパースした配列（例: ['H8.98', 'L15.02', ...]）
  // h: 現在時刻（0時からの小数時、秒を含む）
  function nextExtremeText(ext, h) {
    for (var e = 0; e < ext.length; e++) {
      var t = parseFloat(ext[e].slice(1));
      if (t > h) {
        var totalSec = Math.round((t - h) * 3600);
        var hh = Math.floor(totalSec / 3600);
        var mm = Math.floor((totalSec % 3600) / 60);
        var ss = totalSec % 60;
        var rest = (hh > 0 ? hh + '時間' : '') + mm + '分' + ss + '秒';
        return (ext[e][0] === 'H' ? '次の満潮' : '次の干潮') + ' ' + fmtHM(t)
          + '（あと' + rest + '）';
      }
    }
    return ext.length ? '次の満潮・干潮は翌日です' : '';
  }

  // -------------------------------------------------------------------
  // 1. 現在の潮位
  // -------------------------------------------------------------------
  function currentTide() {
    var el = document.querySelector('[data-now]');
    if (!el) return;
    var levels = el.getAttribute('data-levels').split(',').map(Number);
    if (levels.length !== 144) return;

    var h = nowHourJST();
    var idx = Math.min(143, Math.max(0, Math.round(h * 6)));
    var cur = levels[idx];

    // 変化速度 cm/h（前後10分の中央差分）
    var a = levels[Math.max(0, idx - 1)], b = levels[Math.min(143, idx + 1)];
    var span = (Math.min(143, idx + 1) - Math.max(0, idx - 1)) / 6;
    var rate = span > 0 ? (b - a) / span : 0;
    var dir = rate > 3 ? '上げ潮' : rate < -3 ? '下げ潮' : '変化小';

    // 次の満潮・干潮。10分毎の系列から極値を探すと公式値と数分ずれ、
    // すぐ下の表と食い違うので、気象庁の値(data-ext)をそのまま使う。
    var ext = (el.getAttribute('data-ext') || '').split(',').filter(Boolean);

    el.innerHTML =
      '<span class="lbl">Now</span>'
      + '<span class="val">' + cur + '<small>cm</small></span>'
      + '<span class="dir">' + dir + '</span>'
      + '<span class="rate">' + (rate >= 0 ? '+' : '') + rate.toFixed(0) + ' cm/h</span>'
      + '<span class="nxt"></span>';

    markGraph(levels, h);
    markGrid(idx);

    // 「あと…」の秒の部分だけ1秒ごとに更新する。満干潮をまたいだら
    // data-ext の次のエントリへ自動的に切り替わり、当日分を使い切ったら
    // 「翌日です」の静的表示に切り替えて止まる。
    var nxtEl = el.querySelector('.nxt');
    if (nxtEl && ext.length) {
      var timer;
      var tick = function () {
        var text = nextExtremeText(ext, nowHourJST());
        nxtEl.textContent = text;
        if (!/あと/.test(text)) clearInterval(timer);
      };
      tick();
      timer = setInterval(tick, 1000);
    }
  }

  function markGraph(levels, h) {
    var svg = document.querySelector('svg[data-graph]');
    if (!svg) return;
    var x0 = +svg.dataset.x0, x1 = +svg.dataset.x1;
    var y0 = +svg.dataset.y0, y1 = +svg.dataset.y1;
    var lo = +svg.dataset.lo, hi = +svg.dataset.hi;

    var idx = Math.min(143, Math.max(0, Math.round(h * 6)));
    var x = x0 + (x1 - x0) * (idx / 143);
    var y = y1 - (y1 - y0) * ((levels[idx] - lo) / (hi - lo));
    var NS = 'http://www.w3.org/2000/svg';
    // SVG の font-size はカード幅ごとに CSS が決めている(style.css の
    // @container)。丸の大きさとラベルの逃がしも同じ比率で動かさないと、
    // 幅の狭い端末で現在地マーカーだけが点のように潰れる。
    var em = parseFloat(getComputedStyle(svg).fontSize) || 17;

    var line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', x); line.setAttribute('y1', y0);
    line.setAttribute('x2', x); line.setAttribute('y2', y1);
    line.setAttribute('class', 'nowline');

    var dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('cx', x); dot.setAttribute('cy', y);
    dot.setAttribute('r', (em * 0.36).toFixed(1));
    dot.setAttribute('class', 'nowdot');

    // 数値はグラフの中で読めるようにする。右端に近いときだけ左に寄せ、
    // ラベルが SVG の外へはみ出ないようにする。
    var label = document.createElementNS(NS, 'text');
    var onRight = x < x1 - em * 6.5;
    label.setAttribute('x', (x + (onRight ? em * 0.7 : -em * 0.7)).toFixed(1));
    label.setAttribute('y', Math.max(y0 + em * 1.2, y - em * 0.8).toFixed(1));
    label.setAttribute('text-anchor', onRight ? 'start' : 'end');
    label.setAttribute('class', 'nowlabel');
    label.textContent = 'いま ' + levels[idx] + 'cm';

    svg.appendChild(line);
    svg.appendChild(dot);
    svg.appendChild(label);
  }

  function markGrid(idx) {
    var grid = document.querySelector('[data-grid]');
    if (!grid) return;
    // 先頭 7セルはヘッダー行。以降は 1時間あたり 1(時ラベル) + 6(値)。
    var row = Math.floor(idx / 6), col = idx % 6;
    var pos = 7 + row * 7 + 1 + col;
    var cell = grid.children[pos];
    if (cell) {
      cell.classList.add('td-now');
      cell.setAttribute('title', '現在時刻');
    }
  }

  // -------------------------------------------------------------------
  // 1.4 タイドグラフの位置読み取り
  //
  // カーソルを合わせるかタップした位置の時刻と潮位を、縦線・点・
  // ラベルで出す。
  // 潮位の系列は data-* で持たせず、既に描いてある折れ線 (.tide-line) の
  // d 属性から読み直す。144点を全ページに二重で書くと 11,000ページぶんの
  // 総容量に効くうえ、線と数値がずれる余地も作ってしまうため。
  //
  // タッチ端末では pointerdown で即座に表示し、指でなぞっている間も
  // 更新する。preventDefault は呼ばないため、横方向の日送りスワイプと
  // 縦方向のページスクロールは従来どおり使える。
  // -------------------------------------------------------------------
  function graphHover() {
    var svg = document.querySelector('svg[data-graph]');
    if (!svg) return;

    var path = svg.querySelector('.tide-line');
    if (!path || !svg.getScreenCTM) return;

    // "M90,300L96,298.4…" → [[x, y], …]。数値以外を区切りとして読む。
    var nums = (path.getAttribute('d') || '').match(/-?\d+(?:\.\d+)?/g);
    if (!nums || nums.length < 4) return;
    var pts = [];
    for (var n = 0; n + 1 < nums.length; n += 2) pts.push([+nums[n], +nums[n + 1]]);
    if (pts.length !== 144) return;

    var y0 = +svg.dataset.y0, y1 = +svg.dataset.y1;
    var lo = +svg.dataset.lo, hi = +svg.dataset.hi;
    var x0 = pts[0][0], x1 = pts[pts.length - 1][0];
    var NS = 'http://www.w3.org/2000/svg';

    // SVG は塗りのある子要素の上でしか pointer イベントが起きない。曲線の
    // 上の余白でも読み取れるよう、透明な当たり判定を全面に敷く。
    var hit = document.createElementNS(NS, 'rect');
    hit.setAttribute('x', 0); hit.setAttribute('y', 0);
    hit.setAttribute('width', '100%'); hit.setAttribute('height', '100%');
    hit.setAttribute('fill', 'none');
    hit.setAttribute('pointer-events', 'all');
    svg.appendChild(hit);

    var g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'hov');
    g.setAttribute('pointer-events', 'none');
    var line = document.createElementNS(NS, 'line');
    line.setAttribute('class', 'hovline');
    line.setAttribute('y1', y0); line.setAttribute('y2', y1);
    var dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('class', 'hovdot');
    var label = document.createElementNS(NS, 'text');
    label.setAttribute('class', 'hovlabel');
    g.appendChild(line); g.appendChild(dot); g.appendChild(label);
    svg.appendChild(g);

    // ポインタ座標 → viewBox 座標。CSS の拡縮やページのズームに左右されない
    // よう、getScreenCTM の逆行列で戻す。
    var pt = svg.createSVGPoint();
    function toLocal(ev) {
      pt.x = ev.clientX; pt.y = ev.clientY;
      var m = svg.getScreenCTM();
      return m ? pt.matrixTransform(m.inverse()) : null;
    }

    function move(ev) {
      var loc = toLocal(ev);
      if (!loc) return;
      var i = Math.round((loc.x - x0) / (x1 - x0) * 143);
      if (i < 0) i = 0; else if (i > 143) i = 143;
      var x = pts[i][0], y = pts[i][1];
      var cm = Math.round(lo + (y1 - y) / (y1 - y0) * (hi - lo));
      var em = parseFloat(getComputedStyle(svg).fontSize) || 17;

      line.setAttribute('x1', x); line.setAttribute('x2', x);
      dot.setAttribute('cx', x); dot.setAttribute('cy', y);
      dot.setAttribute('r', (em * 0.3).toFixed(1));

      // 右端では枠外に出るので、ラベルだけ左へ返す。
      var onRight = x < x1 - em * 7.5;
      label.setAttribute('x', (x + (onRight ? em * 0.7 : -em * 0.7)).toFixed(1));
      label.setAttribute('y', Math.min(y1 - em * 0.6, Math.max(y0 + em * 1.2, y - em * 0.9)).toFixed(1));
      label.setAttribute('text-anchor', onRight ? 'start' : 'end');
      label.textContent = fmtHM(i / 6) + ' ' + cm + 'cm';
      g.classList.add('on');
    }

    var touchPointer = null;
    svg.style.cursor = 'crosshair';
    svg.addEventListener('pointerdown', function (ev) {
      if (ev.pointerType === 'touch') touchPointer = ev.pointerId;
      move(ev);
    });
    svg.addEventListener('pointermove', function (ev) {
      // タッチでは、画面に触れていない指由来の疑似イベントを拾わない。
      if (ev.pointerType === 'touch' && ev.pointerId !== touchPointer) return;
      move(ev);
    });
    svg.addEventListener('pointerup', function (ev) {
      if (ev.pointerId === touchPointer) touchPointer = null;
    });
    svg.addEventListener('pointercancel', function (ev) {
      if (ev.pointerId === touchPointer) touchPointer = null;
    });
    svg.addEventListener('pointerleave', function (ev) {
      // タップ後は値を残す。マウスは従来どおり外れたら消す。
      if (ev.pointerType !== 'touch') g.classList.remove('on');
    });
    document.addEventListener('pointerdown', function (ev) {
      if (ev.pointerType === 'touch' && !svg.contains(ev.target)) g.classList.remove('on');
    });
  }

  // -------------------------------------------------------------------
  // 1.5 タイドグラフの日送りスワイプ
  //
  // グラフそのものを画像にせず日別ページを持たせているため、左右スワイプは
  // 次/前日の静的ページへ移動する。各日を URL で共有でき、JavaScript が
  // 無効でも表示できる構成を保ったまま、先のグラフを連続して見られる。
  // -------------------------------------------------------------------
  function graphSwipe() {
    var graphs = document.querySelectorAll('[data-graph-swipe]');
    Array.prototype.forEach.call(graphs, function (graph) {
      var startX = 0, startY = 0, tracking = false;
      graph.addEventListener('touchstart', function (e) {
        if (e.touches.length !== 1) return;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        tracking = true;
      }, { passive: true });
      graph.addEventListener('touchend', function (e) {
        if (!tracking || !e.changedTouches.length) return;
        tracking = false;
        var dx = e.changedTouches[0].clientX - startX;
        var dy = e.changedTouches[0].clientY - startY;
        if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
        var href = dx < 0 ? graph.dataset.next : graph.dataset.prev;
        if (href) location.assign(href);
      }, { passive: true });
    });
  }

  // -------------------------------------------------------------------
  // 2. 地図
  // -------------------------------------------------------------------
  var mapDone = false;
  function maps() {
    if (mapDone) return;
    var el = document.querySelector('[data-map]');
    if (!el || typeof L === 'undefined') return;
    var pts = JSON.parse(el.dataset.stations || '[]');
    if (!pts.length) return;
    mapDone = true;

    // レンダラは SVG(Leaflet 既定)。
    // Canvas のほうがパン/ズームは軽いが、Canvas レンダラは
    // requestAnimationFrame で描画するため、描画が走らない環境では
    // タイルだけ出て点が1つも描かれないという壊れ方をする。
    // ここではパン/ズームの頻度がさほど高くなく、SVG の重さが問題に
    // なりにくいので、確実に描ける側を採る。
    var map = L.map(el, {
      scrollWheelZoom: true,
      attributionControl: true,
    });
    // CARTO は2026年8月からAPIキー無しのラスタータイルへ透かしを入れる
    // 仕様になったため、キー不要で日本の海岸線が読みやすい地理院淡色地図を使う。
    // 地理院タイルはリアルタイム読み込みなら出典明示で利用できる。
    L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', {
      attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>',
      maxZoom: 18,
    }).addTo(map);

    // Leaflet はビュー(中心とズーム)が決まる前にレイヤを追加できない。
    // 先に fitBounds でビューを確定させてからマーカーを載せる。
    // 順序を逆にすると例外になり、地図はタイルだけが出て点が1つも描かれない。
    var bounds = pts.map(function (p) { return [p.la, p.lo]; });
    // 地点ページは自分＋近隣6点しか載らない。密集した瀬戸内では
    // fitBounds が z16 まで寄ってしまい、海岸線しか映らなくなる。
    // data-fit-max があるときは寄せすぎを止める。
    var fitMax = Number(el.dataset.fitMax) || 0;
    map.fitBounds(bounds, fitMax ? { padding: [24, 24], maxZoom: fitMax } : { padding: [24, 24] });

    pts.forEach(function (p) {
      // p.c = このページの地点。近隣と同じ見た目だとどれが自分か分からない。
      var m;
      if (!p.c && p.m === 'low') {
        // 精度保証の対象外となる参考地点だけを三角にする。
        m = L.marker([p.la, p.lo], {
          icon: L.divIcon({ className: 'tide-map-marker', html: '<span class="marker-triangle" aria-hidden="true"></span>', iconSize: [14, 14], iconAnchor: [7, 7] }),
        }).addTo(map);
      } else m = L.circleMarker([p.la, p.lo], p.c ? {
        radius: 8, color: '#b06a3f', weight: 3,
        fillColor: '#b06a3f', fillOpacity: .9,
      } : {
        radius: 5,
        color: '#175a6f', weight: 2,
        fillColor: p.m === 'apx' ? '#fffaf0' : '#175a6f',
        fillOpacity: p.m === 'apx' ? 1 : .85,
      }).addTo(map);
      // 自分の点は常時ラベルを出す。近隣はホバー時だけ出し、押すと移動する。
      m.bindTooltip(p.n, { direction: 'top', className: 'tdtip', permanent: !!p.c });
      if (!p.c) m.on('click', function () { location.href = p.h; });
    });

    // ホイールでそのまま拡大縮小できるようにしてある。ただし常時有効に
    // すると、ページを流し読みしている途中で地図の上をカーソルが通った
    // だけでスクロールが地図に吸われ、そこから先へ進めなくなる。
    //
    // 「ページがスクロール中のあいだだけホイールズームを切る」ことで
    // 両立させる。地図の上で止まった状態からホイールを回した場合は、
    // 地図がホイールを食う＝ページは動かない＝scroll イベントが出ないので
    // ズームは有効なまま。逆に流し読み中はスクロールが続いている＝
    // scroll イベントが出続けるので、ホイールはページ側に通り抜ける。
    var reenable = null;
    window.addEventListener('scroll', function () {
      map.scrollWheelZoom.disable();
      clearTimeout(reenable);
      reenable = setTimeout(function () { map.scrollWheelZoom.enable(); }, 300);
    }, { passive: true });

    // 地点ページの地図は grid の伸縮で高さが決まる。Leaflet は初期化時の
    // 寸法を覚えるので、レイアウトが確定したあとに測り直させないと
    // タイルが欠けたり中心がずれたりする。
    var resized = null;
    var remeasure = function () { map.invalidateSize({ animate: false }); };
    window.addEventListener('load', remeasure);
    window.addEventListener('resize', function () {
      clearTimeout(resized);
      resized = setTimeout(remeasure, 200);
    });
  }

  // -------------------------------------------------------------------
  // 3. 用途別モード
  //
  // 潮位系列はHTMLへ二重に埋め込まず、SVGの折れ線を座標から潮位へ戻す。
  // 用途と地点ごとの設定をlocalStorageへ保存し、同じ地点の日別ページでも
  // 引き継ぐ。用途ごとに初期値・案内文を変え、候補は30分以上にまとめる。
  // -------------------------------------------------------------------
  var ACTIVITY_KEY = 'tide-activity-pref:';
  var ACTIVITY_MODE_KEY = 'tide-activity-mode';
  var LEGACY_SURF_KEY = 'tide-surf-pref:';
  var ACTIVITY_CONFIG = {
    fishing: {
      label: '釣り', title: '釣行候補', minRatio: .2, maxRatio: .9, direction: 'both', daylight: false,
      description: '狙う潮位帯と上げ・下げを指定して、釣行候補の時間を確認します。',
      caution: '候補時間は釣果や安全を保証するものではありません。'
    },
    clamming: {
      label: '潮干狩り', title: '潮干狩り候補', minRatio: 0, maxRatio: .25, direction: 'down', daylight: true,
      description: '干潟が現れやすい低い潮位帯を指定して、日中の候補時間を確認します。',
      caution: '潮位の戻り、立入区域、漁業権を現地で必ず確認してください。'
    },
    surf: {
      label: 'サーフ', title: '入水候補', minRatio: .2, maxRatio: .8, direction: 'both', daylight: true,
      description: 'ポイントに合う潮位帯と上げ・下げを保存して、入水候補を絞り込みます。',
      caution: '候補時間は安全や波質を保証するものではありません。'
    },
    research: {
      label: '環境調査', title: '調査候補', minRatio: 0, maxRatio: 1, direction: 'both', daylight: true,
      description: '観測条件をそろえるための潮位帯・潮の向き・時間帯を指定します。',
      caution: '調査計画では現地条件と観測手順をあわせて確認してください。'
    },
    navigation: {
      label: '航海管理', title: '航行確認時間', minRatio: .25, maxRatio: 1, direction: 'both', daylight: false,
      description: '船や岸壁に必要な潮位帯を指定して、該当する時間を確認します。',
      caution: '航行判断には海図水深・喫水・気象海象・港湾情報を必ず併用してください。'
    }
  };

  function graphTideLevels() {
    var svg = document.querySelector('svg[data-graph]');
    if (!svg) return [];
    var path = svg.querySelector('.tide-line');
    if (!path) return [];
    var nums = (path.getAttribute('d') || '').match(/-?\d+(?:\.\d+)?/g);
    if (!nums || nums.length !== 288) return [];
    var y0 = +svg.dataset.y0, y1 = +svg.dataset.y1;
    var lo = +svg.dataset.lo, hi = +svg.dataset.hi;
    var levels = [];
    for (var i = 1; i < nums.length; i += 2) {
      var y = +nums[i];
      levels.push(Math.round(lo + (y1 - y) / (y1 - y0) * (hi - lo)));
    }
    return levels;
  }

  function activityDirection(levels, i) {
    var left = levels[Math.max(0, i - 1)];
    var right = levels[Math.min(levels.length - 1, i + 1)];
    if (right > left) return 'up';
    if (right < left) return 'down';
    return 'turn';
  }

  function activityCandidateWindows(levels, min, max, direction, from, to) {
    var windows = [], start = null, activeDirection = null;
    var finish = function (end) {
      if (start != null && end - start + 1 >= 3) windows.push({ start: start, end: end });
      start = null;
      activeDirection = null;
    };
    for (var i = 0; i < levels.length; i++) {
      var dir = activityDirection(levels, i);
      var inTime = i >= from && i <= to;
      var inLevel = levels[i] >= min && levels[i] <= max;
      var inDirection = direction === 'both' || dir === direction;
      if (inTime && inLevel && inDirection) {
        // 「両方」でも上げと下げを一つの候補に混ぜない。満潮・干潮の
        // 折り返しで分割すると、各候補の矢印と潮向が実態に一致する。
        if (start != null && direction === 'both' && dir !== 'turn'
          && activeDirection !== 'turn' && dir !== activeDirection) finish(i - 1);
        if (start == null) { start = i; activeDirection = dir; }
        else if (activeDirection === 'turn' && dir !== 'turn') activeDirection = dir;
      } else if (start != null) {
        finish(i - 1);
      }
    }
    if (start != null) finish(levels.length - 1);
    return windows;
  }

  function activityWindowDirection(levels, w) {
    var delta = levels[w.end] - levels[w.start];
    return delta > 0 ? ['up', '上げ潮', '↗'] : delta < 0 ? ['down', '下げ潮', '↘'] : ['turn', '潮位の変化小', '→'];
  }

  function markActivityCandidates(windows) {
    var svg = document.querySelector('svg[data-graph]');
    if (!svg) return;
    var old = svg.querySelector('.activity-bands');
    if (old) old.remove();
    var NS = 'http://www.w3.org/2000/svg';
    var group = document.createElementNS(NS, 'g');
    group.setAttribute('class', 'activity-bands');
    var x0 = +svg.dataset.x0, x1 = +svg.dataset.x1;
    var y0 = +svg.dataset.y0, y1 = +svg.dataset.y1;
    windows.forEach(function (w) {
      var x = x0 + (x1 - x0) * (w.start / 143);
      var edge = Math.min(143, w.end + 1);
      var right = x0 + (x1 - x0) * (edge / 143);
      var rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('class', 'activity-band');
      rect.setAttribute('x', x.toFixed(1));
      rect.setAttribute('y', y0);
      rect.setAttribute('width', Math.max(3, right - x).toFixed(1));
      rect.setAttribute('height', y1 - y0);
      group.appendChild(rect);
    });
    var line = svg.querySelector('.tide-line');
    svg.insertBefore(group, line || null);

    var grid = document.querySelector('[data-grid]');
    if (!grid) return;
    Array.prototype.forEach.call(grid.querySelectorAll('.tdcell.activity-hit'), function (cell) {
      cell.classList.remove('activity-hit');
    });
    windows.forEach(function (w) {
      for (var i = w.start; i <= w.end; i++) {
        var row = Math.floor(i / 6), col = i % 6;
        var pos = 7 + row * 7 + 1 + col;
        if (grid.children[pos]) grid.children[pos].classList.add('activity-hit');
      }
    });
  }

  function activityFallback(card, purpose) {
    var config = ACTIVITY_CONFIG[purpose];
    var lo = +card.dataset.dayMin, hi = +card.dataset.dayMax;
    var range = Math.max(0, hi - lo);
    var snap = function (v) { return Math.round(v / 5) * 5; };
    var min = snap(lo + range * config.minRatio);
    var max = snap(lo + range * config.maxRatio);
    if (min > max) { min = lo; max = hi; }
    return { min: min, max: max, direction: config.direction, daylight: config.daylight };
  }

  function readActivityPreference(key, purpose, fallback) {
    try {
      var saved = JSON.parse(localStorage.getItem(ACTIVITY_KEY + key + ':' + purpose) || 'null');
      // 旧サーフモードの地点設定は、サーフを初めて開いたときだけ引き継ぐ。
      if (!saved && purpose === 'surf') saved = JSON.parse(localStorage.getItem(LEGACY_SURF_KEY + key) || 'null');
      if (!saved || typeof saved !== 'object') return fallback;
      return {
        min: Number.isFinite(+saved.min) ? +saved.min : fallback.min,
        max: Number.isFinite(+saved.max) ? +saved.max : fallback.max,
        direction: /^(both|up|down)$/.test(saved.direction) ? saved.direction : fallback.direction,
        daylight: saved.daylight !== false,
      };
    } catch (e) { return fallback; }
  }

  function saveActivityPreference(key, purpose, pref) {
    try { localStorage.setItem(ACTIVITY_KEY + key + ':' + purpose, JSON.stringify(pref)); } catch (e) { /* 保存できない環境では表示だけ使う */ }
  }

  function activityMode() {
    var card = document.querySelector('[data-activity]');
    if (!card) return;
    var levels = graphTideLevels();
    if (levels.length !== 144) return;

    var minInput = card.querySelector('[data-activity-min-input]');
    var maxInput = card.querySelector('[data-activity-max-input]');
    var directionInput = card.querySelector('[data-activity-direction]');
    var daylightInput = card.querySelector('[data-activity-daylight]');
    var list = card.querySelector('[data-activity-windows]');
    var note = card.querySelector('[data-activity-result-note]');
    var savedText = card.querySelector('[data-activity-saved]');
    var title = card.querySelector('[data-activity-result-title]');
    var description = card.querySelector('[data-activity-description]');
    var caution = card.querySelector('[data-activity-caution]');
    var purposeButtons = card.querySelectorAll('[data-activity-purpose]');
    var key = card.dataset.activityStation;
    var purpose = 'fishing';
    try {
      var savedPurpose = localStorage.getItem(ACTIVITY_MODE_KEY);
      if (ACTIVITY_CONFIG[savedPurpose]) purpose = savedPurpose;
    } catch (e) { /* 保存できない環境では既定の釣りを使う */ }
    var pref;

    function update(save) {
      var min = parseInt(minInput.value, 10), max = parseInt(maxInput.value, 10);
      if (isNaN(min) || isNaN(max) || min > max) {
        list.innerHTML = '<li class="activity-empty">最低潮位は最高潮位以下にしてください。</li>';
        note.textContent = '';
        markActivityCandidates([]);
        return;
      }
      pref = { min: min, max: max, direction: directionInput.value, daylight: daylightInput.checked };
      if (save) {
        saveActivityPreference(key, purpose, pref);
        savedText.textContent = ACTIVITY_CONFIG[purpose].label + 'の設定をこの地点に保存しました。';
      }

      var from = pref.daylight ? Math.max(0, Math.ceil(+card.dataset.sunrise * 6)) : 0;
      var to = pref.daylight ? Math.min(143, Math.floor(+card.dataset.sunset * 6)) : 143;
      var windows = activityCandidateWindows(levels, min, max, pref.direction, from, to);
      markActivityCandidates(windows);

      if (!windows.length) {
        list.innerHTML = '<li class="activity-empty">この日の条件に合う30分以上の時間帯はありません。</li>';
        note.textContent = '潮位帯を広げるか、潮の向きを「両方」にすると候補が増えます。';
      } else {
        list.innerHTML = windows.slice(0, 5).map(function (w) {
          var d = activityWindowDirection(levels, w);
          var end = Math.min(24, (w.end + 1) / 6);
          var endLabel = end >= 24 ? '24:00' : fmtHM(end);
          return '<li class="' + d[0] + '"><time>' + fmtHM(w.start / 6) + '〜' + endLabel + '</time>'
            + '<span>' + d[2] + ' ' + d[1] + '</span><small>' + levels[w.start] + '→' + levels[w.end] + 'cm</small></li>';
        }).join('');
        note.textContent = windows.length > 5 ? 'ほか' + (windows.length - 5) + '件。グラフと10分毎の潮位も強調しています。'
          : 'グラフと10分毎の潮位も強調しています。';
      }

      var nowEl = card.querySelector('[data-activity-now]');
      if (nowEl) {
        var idx = Math.min(143, Math.max(0, Math.round(nowHourJST() * 6)));
        var d = activityDirection(levels, idx);
        var labels = d === 'up' ? ['↗', '上げ潮'] : d === 'down' ? ['↘', '下げ潮'] : ['→', '変化小'];
        var matches = windows.some(function (w) { return idx >= w.start && idx <= w.end; });
        nowEl.textContent = levels[idx] + 'cm ' + labels[0] + ' ' + labels[1] + (matches ? '・条件内' : '・条件外');
        nowEl.classList.toggle('match', matches);
      }
    }

    function selectPurpose(nextPurpose, saveMode) {
      purpose = ACTIVITY_CONFIG[nextPurpose] ? nextPurpose : 'fishing';
      var config = ACTIVITY_CONFIG[purpose];
      pref = readActivityPreference(key, purpose, activityFallback(card, purpose));
      minInput.value = pref.min;
      maxInput.value = pref.max;
      directionInput.value = pref.direction;
      daylightInput.checked = pref.daylight;
      title.textContent = config.title;
      description.textContent = config.description;
      caution.textContent = config.caution;
      savedText.textContent = '用途ごと・地点ごとの設定として端末内に保存されます。';
      Array.prototype.forEach.call(purposeButtons, function (button) {
        button.setAttribute('aria-pressed', button.dataset.activityPurpose === purpose ? 'true' : 'false');
      });
      if (saveMode) {
        try { localStorage.setItem(ACTIVITY_MODE_KEY, purpose); } catch (e) { /* 保存できない環境では表示だけ使う */ }
      }
      update(false);
    }

    [minInput, maxInput].forEach(function (input) {
      input.addEventListener('input', function () { update(true); });
    });
    directionInput.addEventListener('change', function () { update(true); });
    daylightInput.addEventListener('change', function () { update(true); });
    Array.prototype.forEach.call(purposeButtons, function (button) {
      button.addEventListener('click', function () { selectPurpose(button.dataset.activityPurpose, true); });
    });
    selectPurpose(purpose, false);
  }

  // -------------------------------------------------------------------
  // 5. 地点検索・お気に入り・最近見た地点
  //
  // 全771地点ぶんのインデックス(stations-index.json)はヘッダーの検索
  // ボタンを押すまで取得しない。地点ページを開くたびに data-recent を
  // localStorage に積んでおき、次に検索を開いたときの候補として出す。
  // -------------------------------------------------------------------
  var RECENT_KEY = 'tide-recent-stations';
  var RECENT_MAX = 8;
  var FAVORITE_KEY = 'tide-favorite-stations';
  var FAVORITE_MAX = 12;
  var openSearchModal = null;

  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function readRecent() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch (e) { return []; }
  }

  function readFavorites() {
    try { return JSON.parse(localStorage.getItem(FAVORITE_KEY) || '[]'); } catch (e) { return []; }
  }

  function writeFavorites(list) {
    try { localStorage.setItem(FAVORITE_KEY, JSON.stringify(list.slice(0, FAVORITE_MAX))); } catch (e) { /* private browsing 等では諦める */ }
  }

  // 地点に紐づくページ(地点ハブ・日別・週間・月間)は body に data-recent
  // ({n,h,p}のJSON)を持つ。同じ地点は先頭に上げて重複させない。
  function recordRecent() {
    var raw = document.body.dataset.recent;
    if (!raw) return;
    var item;
    try { item = JSON.parse(raw); } catch (e) { return; }
    if (!item || !item.h) return;
    var list = readRecent().filter(function (x) { return x.h !== item.h; });
    list.unshift(item);
    if (list.length > RECENT_MAX) list.length = RECENT_MAX;
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch (e) { /* private browsing 等では諦める */ }
  }

  function stationLi(s) {
    return '<li><a href="' + escHtml(s.h) + '"><span class="nm">' + escHtml(s.n)
      + '</span><span class="pf">' + escHtml(s.p) + '</span></a></li>';
  }

  function favoriteStations() {
    var btn = document.querySelector('[data-favorite-toggle]');
    var raw = document.body.dataset.recent;
    if (!btn || !raw) return;
    var station;
    try { station = JSON.parse(raw); } catch (e) { return; }
    if (!station || !station.h) return;

    function isFavorite() {
      return readFavorites().some(function (x) { return x.h === station.h; });
    }
    function paint() {
      var on = isFavorite();
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-pressed', String(on));
      var icon = btn.querySelector('[data-favorite-icon]');
      var label = btn.querySelector('[data-favorite-label]');
      if (icon) icon.src = on ? icon.dataset.onSrc : icon.dataset.offSrc;
      if (label) label.textContent = on ? 'お気に入り済み' : 'お気に入りに追加';
    }
    btn.addEventListener('click', function () {
      var list = readFavorites();
      var i = list.findIndex(function (x) { return x.h === station.h; });
      if (i >= 0) list.splice(i, 1); else list.unshift(station);
      writeFavorites(list);
      paint();
    });
    paint();
  }

  var searchIndex = null, searchLoading = null;
  function loadSearchIndex(src) {
    if (searchIndex) return Promise.resolve(searchIndex);
    if (searchLoading) return searchLoading;
    searchLoading = fetch(src).then(function (r) { return r.json(); })
      .then(function (data) { searchIndex = data; return data; })
      .catch(function () { return []; });
    return searchLoading;
  }

  function searchModal() {
    var openBtn = document.querySelector('[data-search-open]');
    var ovl = document.querySelector('[data-search-ovl]');
    if (!openBtn || !ovl) return;
    var input = ovl.querySelector('[data-search-input]');
    var closeBtn = ovl.querySelector('[data-search-close]');
    var favoritesEl = ovl.querySelector('[data-search-favorites]');
    var recentEl = ovl.querySelector('[data-search-recent]');
    var resultsEl = ovl.querySelector('[data-search-results]');
    var emptyEl = ovl.querySelector('[data-search-empty]');
    var src = openBtn.dataset.searchSrc;

    function renderRecent() {
      var list = readRecent();
      recentEl.innerHTML = list.length
        ? '<p class="search-sub">最近見た地点</p><ul class="search-results">' + list.map(stationLi).join('') + '</ul>'
        : '';
    }

    function renderFavorites() {
      var list = readFavorites();
      favoritesEl.innerHTML = list.length
        ? '<p class="search-sub">お気に入り</p><ul class="search-results">' + list.map(stationLi).join('') + '</ul>'
        : '';
    }

    function renderResults(list, q) {
      var ql = (q || '').trim();
      if (!ql) { resultsEl.innerHTML = ''; emptyEl.hidden = true; recentEl.style.display = ''; return; }
      recentEl.style.display = 'none';
      var hit = list.filter(function (s) {
        return s.n.indexOf(ql) !== -1 || (s.k && s.k.indexOf(ql) !== -1) || s.p.indexOf(ql) !== -1;
      }).slice(0, 30);
      resultsEl.innerHTML = hit.map(stationLi).join('');
      emptyEl.hidden = hit.length !== 0;
    }

    function open(query) {
      ovl.hidden = false;
      document.documentElement.style.overflow = 'hidden';
      input.value = query || '';
      renderFavorites();
      renderRecent();
      renderResults([], input.value);
      if (src) loadSearchIndex(src).then(function (list) { renderResults(list, input.value); });
      setTimeout(function () { input.focus(); }, 0);
    }

    function close() {
      ovl.hidden = true;
      document.documentElement.style.overflow = '';
    }

    openSearchModal = open;
    openBtn.addEventListener('click', function () { open(''); });
    closeBtn.addEventListener('click', close);
    ovl.addEventListener('click', function (e) { if (e.target === ovl) close(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !ovl.hidden) close();
    });
    input.addEventListener('input', function () {
      var q = input.value;
      if (!q.trim()) { renderResults([], ''); return; }
      loadSearchIndex(src).then(function (list) { renderResults(list, q); });
    });
  }

  // ホームでは検索を最初の操作にする。位置情報はこのボタンを押したときだけ
  // 取得し、現在地から最も近い掲載地点へ直接移動する。
  function homeExperience() {
    var form = document.querySelector('[data-home-search]');
    var input = document.querySelector('[data-home-search-input]');
    var locate = document.querySelector('[data-home-locate]');
    var status = document.querySelector('[data-home-locate-status]');
    var saved = document.querySelector('[data-home-saved]');
    if (!form || !input) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (openSearchModal) openSearchModal(input.value);
    });

    if (saved) {
      var favorites = readFavorites();
      var favoritePaths = favorites.map(function (x) { return x.h; });
      var recent = readRecent().filter(function (x) { return favoritePaths.indexOf(x.h) < 0; }).slice(0, 4);
      var groups = [];
      if (favorites.length) groups.push('<div><h2>お気に入り</h2><ul>' + favorites.slice(0, 4).map(stationLi).join('') + '</ul></div>');
      if (recent.length) groups.push('<div><h2>最近見た地点</h2><ul>' + recent.map(stationLi).join('') + '</ul></div>');
      if (groups.length) { saved.innerHTML = groups.join(''); saved.hidden = false; }
    }

    if (!locate) return;
    locate.addEventListener('click', function () {
      if (!navigator.geolocation) {
        if (status) status.textContent = 'このブラウザでは現在地を取得できません。地点名で検索してください。';
        return;
      }
      if (status) status.textContent = '現在地を取得しています…';
      locate.disabled = true;
      navigator.geolocation.getCurrentPosition(function (pos) {
        var lat = pos.coords.latitude, lon = pos.coords.longitude;
        // 検索インデックスは軽量化のため座標を持たない。トップにだけ
        // 埋め込んでいる地図用データを使えば、追加の通信・容量なしで
        // 最寄り地点を求められる。
        var mapEl = document.querySelector('[data-map]');
        var list;
        try { list = JSON.parse(mapEl && mapEl.dataset.stations || '[]'); } catch (e) { list = []; }
        var nearest = list.reduce(function (best, station) {
          if (typeof station.la !== 'number' || typeof station.lo !== 'number') return best;
            var dLat = station.la - lat;
            var dLon = (station.lo - lon) * Math.cos(lat * Math.PI / 180);
            var d = dLat * dLat + dLon * dLon;
            return !best || d < best.d ? { station: station, d: d } : best;
          }, null);
        if (nearest && nearest.station && nearest.station.h) location.assign(nearest.station.h);
        else if (status) { status.textContent = '近い掲載地点を見つけられませんでした。'; locate.disabled = false; }
      }, function () {
        if (status) status.textContent = '現在地を取得できませんでした。許可設定を確認するか、地点名で検索してください。';
        locate.disabled = false;
      }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
    });
  }

  // 通常時は必ず最新ファイルを取りに行き、通信できない時だけ以前に見た
  // 地点ページ・検索インデックス・表示用アセットをキャッシュから返す。
  // 潮汐データを古いまま固定しないため、cache-first にはしない。
  function offlineCache() {
    var src = document.body.dataset.sw;
    if (!src || !('serviceWorker' in navigator)) return;
    window.addEventListener('load', function () {
      navigator.serviceWorker.register(src).catch(function () { /* 非対応環境は通常表示を継続 */ });
    });
  }

  // -------------------------------------------------------------------
  // 5. 表のコピー / CSV 書き出し
  //
  // 潮見表は「表計算ソフトに持っていって自分で加工したい」という需要が
  // 大きい。ビルド時に .csv を1万ページぶん吐く手もあるが、配信物が
  // 20MB 以上ふくらむ割に大半はダウンロードされない。画面に出ている表を
  // その場で組み立てるほうが、追加コスト0でどのページでも同じように効く。
  // -------------------------------------------------------------------

  // 要素のテキスト。<br> は区切りとして残す。
  // 週間表のセルは「05:12 <small>340</small><br>17:30 <small>210</small>」なので、
  // textContent をそのまま取ると "05:12 34017:30 210" と癒着して読めなくなる。
  function txt(el) {
    if (!el) return '';
    var out = '';
    (function walk(n) {
      for (var c = n.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) out += c.nodeValue;
        else if (c.nodeType === 1) {
          if (c.tagName === 'BR') out += ' / ';
          else walk(c);
        }
      }
    })(el);
    return out.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function num(s) {
    var m = /-?\d+(?:\.\d+)?/.exec(s || '');
    return m ? m[0] : '';
  }

  // 「05:12 340 / 17:30 210」→ [['05:12','340'], ['17:30','210']]
  // 区切りに \D* ではなく [^\d-]* を使うのは、潮位が負値(-5cm)のとき
  // \D* が先にマイナス記号を食べてしまい "5" と読めてしまうため。
  function pairs(s) {
    var out = [], re = /(\d{1,2}:\d{2})[^\d-]*(-?\d+)/g, m;
    while ((m = re.exec(s))) out.push([m[1], m[2]]);
    return out;
  }

  function liText(el, sel) {
    return Array.prototype.map.call(el.querySelectorAll(sel), function (n) { return txt(n); }).join(' / ');
  }

  // 満潮・干潮は日によって本数が変わる（1〜3回）。セル内で改行して
  // 詰め込むと表計算側で分解できないので、その月・その週の最大本数に
  // 合わせて「満潮1時刻 / 満潮1潮位cm / 満潮2時刻 …」と桁を開く。
  function expand(headLead, headTail, recs) {
    var mh = 0, ml = 0, i;
    recs.forEach(function (r) {
      if (r.h.length > mh) mh = r.h.length;
      if (r.l.length > ml) ml = r.l.length;
    });
    var hd = headLead.slice();
    for (i = 0; i < mh; i++) hd.push('満潮' + (i + 1) + '時刻', '満潮' + (i + 1) + '潮位cm');
    for (i = 0; i < ml; i++) hd.push('干潮' + (i + 1) + '時刻', '干潮' + (i + 1) + '潮位cm');
    var out = [hd.concat(headTail)];
    recs.forEach(function (r) {
      var row = r.lead.slice();
      for (i = 0; i < mh; i++) row.push(r.h[i] ? r.h[i][0] : '', r.h[i] ? r.h[i][1] : '');
      for (i = 0; i < ml; i++) row.push(r.l[i] ? r.l[i][0] : '', r.l[i] ? r.l[i][1] : '');
      out.push(row.concat(r.tail));
    });
    return out;
  }

  // 満潮・干潮の一覧
  function extExtract(t) {
    var rows = [['区分', '時刻', '潮位cm']];
    Array.prototype.forEach.call(t.tBodies[0].rows, function (tr) {
      rows.push([
        txt(tr.cells[0]).replace(/[▲▼\s]/g, ''),
        txt(tr.cells[1]),
        num(txt(tr.cells[2])),
      ]);
    });
    return rows;
  }

  // 10分毎グリッド。画面は 24行×6列だが、書き出しは1行1時刻の縦持ちにする。
  // 表計算でグラフを描いたり関数をかけたりするには横持ちだと使えない。
  function gridExtract(g) {
    var c = g.children, date = pageDate(), rows = [['日付', '時刻', '潮位cm']];
    for (var h = 0; h < 24; h++) {
      for (var k = 0; k < 6; k++) {
        // 先頭7セルはヘッダー行。以降は 1時間あたり 1(時ラベル) + 6(値)。
        var cell = c[7 + h * 7 + 1 + k];
        if (!cell) continue;
        rows.push([date, pad2(h) + ':' + pad2(k * 10), txt(cell)]);
      }
    }
    return rows;
  }

  // 10分毎グリッドの書き出しに付ける日付。グリッドがあるのは地点ページと
  // 日別ページだけで、どちらも body の data-file が「地点名_YYYY-MM-DD」。
  function pageDate() {
    var m = /(\d{4}-\d{2}-\d{2})/.exec(document.body.dataset.file || '');
    return m ? m[1] : '';
  }

  function weekExtract(t) {
    var recs = [];
    Array.prototype.forEach.call(t.tBodies[0].rows, function (tr) {
      // 見出しセルは「8/2 土」。年が入らないので日別ページへのリンクから拾う。
      var a = tr.cells[0].querySelector('a');
      var m = a && /(\d{4}-\d{2}-\d{2})/.exec(decodeURIComponent(a.getAttribute('href') || ''));
      recs.push({
        lead: [m ? m[1] : txt(tr.cells[0]), txt(tr.cells[0].querySelector('.wd')), txt(tr.cells[1])],
        h: pairs(txt(tr.cells[2])),
        l: pairs(txt(tr.cells[3])),
        tail: [txt(tr.cells[4])],
      });
    });
    return expand(['日付', '曜日', '潮名'], ['月齢'], recs);
  }

  function prefExtract(t) {
    var recs = [];
    Array.prototype.forEach.call(t.tBodies[0].rows, function (tr) {
      recs.push({
        lead: [txt(tr.cells[0]), txt(tr.cells[1])],
        h: pairs(txt(tr.cells[2])),
        l: pairs(txt(tr.cells[3])),
        tail: [num(txt(tr.cells[4]))],
      });
    });
    return expand(['地点', '潮名'], ['干満差cm'], recs);
  }

  function calExtract(cal) {
    // カレンダーのセルには日だけしか出ていないので、年月は URL から取る。
    var ym = /(\d{4}-\d{2})(?:\/|$)/.exec(decodeURIComponent(location.pathname));
    var recs = [];
    Array.prototype.forEach.call(cal.querySelectorAll('.cal-cell'), function (c) {
      var d = c.querySelector('.cal-d');
      if (!d) return;
      var dd = pad2(txt(d));
      recs.push({
        lead: [ym ? ym[1] + '-' + dd : dd, txt(c.querySelector('.cal-w')), txt(c.querySelector('.cal-s'))],
        h: pairs(liText(c, 'li.h')),
        l: pairs(liText(c, 'li.l')),
        tail: [],
      });
    });
    return expand(['日付', '曜日', '潮名'], [], recs);
  }

  // [セレクタ, 名前, 抽出関数, ボタンを差し込む位置(祖先セレクタ), 形の補足]
  var TABLES = [
    ['table.ext', '満干潮', extExtract, null, ''],
    ['.tdgrid', '10分毎潮位', gridExtract, null,
      '画面は24行×6列ですが、書き出しは1行1時刻（日付・時刻・潮位cm）の形になります。'],
    ['table.week', '週間', weekExtract, '.tw',
      '満潮・干潮は「満潮1時刻・満潮1潮位cm・満潮2時刻…」と列に開いて書き出します。'],
    ['table.prefsum', '地点別', prefExtract, '.tw',
      '満潮・干潮は「満潮1時刻・満潮1潮位cm・満潮2時刻…」と列に開いて書き出します。'],
    ['.cal', '月間', calExtract, null,
      '満潮・干潮は「満潮1時刻・満潮1潮位cm・満潮2時刻…」と列に開いて書き出します。'],
  ];

  function csvField(v) {
    var s = String(v == null ? '' : v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCSV(rows) {
    return rows.map(function (r) { return r.map(csvField).join(','); }).join('\r\n');
  }
  function toTSV(rows) {
    // 貼り付け用。セル内にタブや改行が混じると列がずれるので潰す。
    return rows.map(function (r) {
      return r.map(function (v) {
        return String(v == null ? '' : v).replace(/[\t\r\n]+/g, ' ');
      }).join('\t');
    }).join('\r\n');
  }

  function legacyCopy(text) {
    // navigator.clipboard は https / localhost でしか使えない。
    // 素の http で開かれた場合のための代替。
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:-9999px';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  function copy(text, btn) {
    var done = function (ok) {
      btn.textContent = ok ? 'コピーしました' : 'コピーできません';
      btn.className = 'tbtn' + (ok ? ' ok' : '');
      setTimeout(function () { btn.textContent = 'コピー'; btn.className = 'tbtn'; }, 1800);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () { done(true); },
        function () { done(legacyCopy(text)); });
    } else {
      done(legacyCopy(text));
    }
  }

  function download(text, name) {
    // 先頭の BOM は必須。これが無いと Excel は UTF-8 の CSV を Shift_JIS と
    // 誤認し、地点名も見出しもすべて文字化けする。
    var url = URL.createObjectURL(new Blob(['\ufeff' + text], { type: 'text/csv;charset=utf-8' }));
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function fileName(name) {
    var base = (document.body.dataset.file || 'tide').replace(/[\\/:*?"<>|]/g, '');
    return base + '_' + name + '.csv';
  }

  function bar(name, build, el, hint) {
    var d = document.createElement('div');
    d.className = 'tbar';

    var b1 = document.createElement('button');
    b1.type = 'button';
    b1.className = 'tbtn';
    b1.textContent = 'コピー';
    b1.title = name + 'の表をタブ区切りでコピーします。Excel やスプレッドシートにそのまま貼れます。' + hint;
    b1.setAttribute('aria-label', name + 'の表をコピー');
    b1.addEventListener('click', function () { copy(toTSV(build(el)), b1); });

    var b2 = document.createElement('button');
    b2.type = 'button';
    b2.className = 'tbtn';
    b2.textContent = 'CSV';
    b2.title = name + 'の表を CSV ファイルとして保存します。' + hint;
    b2.setAttribute('aria-label', name + 'の表を CSV で保存');
    b2.addEventListener('click', function () { download(toCSV(build(el)), fileName(name)); });

    d.appendChild(b1);
    d.appendChild(b2);
    return d;
  }

  // ボタンは HTML に埋め込まず JS で差し込む。JS が動かない環境で
  // 押しても何も起きないボタンが残るのを避けるため。
  function tables() {
    TABLES.forEach(function (spec) {
      Array.prototype.forEach.call(document.querySelectorAll(spec[0]), function (el) {
        var anchor = spec[3] ? (el.closest(spec[3]) || el) : el;
        anchor.parentNode.insertBefore(bar(spec[1], spec[2], el, spec[4]), anchor);
      });
    });
  }

  // 例外は握り潰さずコンソールに出す。1つの機能が落ちても他は動かしたいので
  // 個別に囲うが、黙って消すと地図が真っ白でも気づけない。
  function run(name, fn) {
    try { fn(); } catch (e) { console.error('[tide] ' + name + ' failed:', e); }
  }

  function init() {
    run('currentTide', currentTide);
    run('graphHover', graphHover);
    run('graphSwipe', graphSwipe);
    run('maps', maps);
    run('activityMode', activityMode);
    run('recordRecent', recordRecent);
    run('favoriteStations', favoriteStations);
    run('searchModal', searchModal);
    run('homeExperience', homeExperience);
    run('offlineCache', offlineCache);
    run('tables', tables);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  // Leaflet は defer で後から来るので、読み込み完了後にもう一度試す
  window.addEventListener('load', function () { run('maps', maps); });
})();
