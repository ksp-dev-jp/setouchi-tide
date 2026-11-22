import test from 'node:test';
import assert from 'node:assert/strict';
import { TIDE_STATIONS } from '../lib/stations.mjs';
import { stationSlug, legacyStationSlug, validateStations } from '../lib/routes.mjs';
import { isCoastSupplement } from '../lib/station-quality.mjs';
import { stationFaq, faqLd } from '../lib/faq.mjs';
import { redirectPage } from '../lib/html.mjs';

test('沿岸補完地点の URL は地名になり、旧 URL を覚えている', () => {
  validateStations();
  for (const st of TIDE_STATIONS) {
    if (isCoastSupplement(st)) {
      assert.doesNotMatch(stationSlug(st), /補完/, st.id);
      assert.match(legacyStationSlug(st), /補完\d+$/, st.id);
    } else {
      assert.equal(legacyStationSlug(st), null, st.id);
    }
  }
});

test('転送ページは新しい URL を canonical と refresh の両方で示す', () => {
  const html = redirectPage('/miyazaki/延岡市-北浦町古江/', 'https://japantide.com/miyazaki/x/');
  assert.ok(html.includes('rel="canonical" href="https://japantide.com/miyazaki/x/"'));
  assert.ok(html.includes('content="0;url=/miyazaki/延岡市-北浦町古江/"'));
});

test('よくある質問は日付と数字を言い切る', () => {
  const st = TIDE_STATIONS.find(s => s.name === '呉' && !s.jmaAnchor);
  const ms = Date.UTC(2026, 10, 20);
  const day = (lv) => ({ highs: [{ time: 8.5, level: 300 }], lows: [{ time: 14.25, level: lv }], range: 300 - lv });
  const ahead = [
    { ms, shio: '中潮', day: day(60) },
    { ms: ms + 86400000, shio: '大潮', day: day(20) },
    { ms: ms + 2 * 86400000, shio: '大潮', day: day(10) },
    { ms: ms + 3 * 86400000, shio: '中潮', day: day(30) },
  ];
  const items = stationFaq({ st, day: ahead[0].day, shio: '中潮', dayMs: ms, ahead });
  const text = items.map(x => x.a).join('\n');
  assert.match(text, /11月20日\(金\)の呉は、満潮が08:30、干潮が14:15です/);
  assert.match(text, /次の大潮は11月21日\(土\)から11月22日\(日\)までです/);
  assert.match(text, /11月22日\(日\)の14:15で、潮位は10cm/);
  assert.equal(faqLd(items)['@type'], 'FAQPage');
  assert.equal(faqLd(items).mainEntity.length, items.length);
});
