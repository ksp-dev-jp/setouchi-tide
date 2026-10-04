import test from 'node:test';
import assert from 'node:assert/strict';
import { GUIDE_EXAMPLE } from '../lib/guide-enrichment.mjs';
import { movingWindows, flowLabel } from '../lib/tide.mjs';
import { TIDE_STATIONS } from '../lib/stations.mjs';
import { dayMsOf } from '../lib/util.mjs';
import { celestialData } from '../lib/astro.mjs';
import { stationPage, privacyPage } from '../lib/pages.mjs';
import { weekTable } from '../lib/components.mjs';
import { GUIDES, guidePage } from '../lib/guides.mjs';
import { stationNoteSummary, stationNoteChart } from '../lib/station-notes.mjs';

const st = TIDE_STATIONS.find(s => s.name === '広島' && !s.jmaAnchor);
const dayMs = dayMsOf('2026-10-01');
const cel = celestialData(st, dayMs);
const row = { dayMs, ymd: '2026-10-01', day: GUIDE_EXAMPLE, cel, fc: null };

test('広島の実データでは午前・午後・夜の4区間が算出される', () => {
  assert.deepEqual(movingWindows(GUIDE_EXAMPLE.levels).map(w => [w.fromStr, w.toStr]), [
    ['00:50','04:40'], ['07:00','11:10'], ['14:00','15:20'], ['19:50','21:10'],
  ]);
  assert.equal(GUIDE_EXAMPLE.highs[0].level, 354);
  assert.equal(GUIDE_EXAMPLE.range, 322);
});

test('地点要約と週間表に午後・夜の時間帯も残る', () => {
  const html = stationPage({ st, day: GUIDE_EXAMPLE, cel, dayMs, ymd: row.ymd,
    weekRows: [row], neighbors: [], fc: null });
  const lead = html.match(/<p class="lead">([\s\S]*?)<\/p>/)[1];
  for (const time of ['14:00〜15:20','19:50〜21:10']) {
    assert.ok(lead.includes(time));
    assert.ok(weekTable([row], true).includes(time));
  }
  assert.ok(lead.includes('潮位が速く変化'));
  assert.equal(flowLabel(0), '変化小');
});

test('年間要約と比較図は折りたたみの外で表示される', () => {
  const ctx = { sp: { avg:271, spring:380, neap:145, dayLowMonth:4 }, year:2026,
    name:'広島', rank:18, total:239, nb: { name:'呉', avg:270 } };
  const html = stationPage({ st, day:GUIDE_EXAMPLE, cel, dayMs, ymd:row.ymd,
    weekRows:[row], neighbors:[], fc:null, profile: { year:2026,
      summary:stationNoteSummary(ctx), chart:stationNoteChart(ctx), html:'<p>集計の詳細</p>' } });
  const start = html.indexOf('station-profile-summary');
  const details = html.indexOf('<details', start);
  assert.ok(start > 0 && html.indexOf('全国239観測点', start) < details);
  assert.ok(html.indexOf('station-profile-chart', start) < details);
  assert.ok(html.slice(details).startsWith('<details class="fold">'));
});

test('既存20記事すべてに図解、参考資料、更新日がある', () => {
  const nat = { year:2026, pf: { n:239, avg:124, spring:180, neap:69,
    dayLowMonthCount:Array(12).fill(20), nightLowMonthCount:Array(12).fill(20) },
    regions:[{r:{name:'中国'},pf:{avg:168}}] };
  assert.equal(GUIDES.length, 20);
  for (const g of GUIDES) {
    const html = guidePage(g, '2026-10-01', nat);
    assert.ok(html.includes('class="guide-visual"'), g.slug);
    assert.ok(html.includes('class="guide-sources"'), g.slug);
    assert.ok(html.includes('更新日：2026-10-01'), g.slug);
    assert.ok(!html.includes('undefined'), g.slug);
  }
});

test('プライバシー説明が広告・端末保存・位置情報の実装を区別する', () => {
  const html = privacyPage();
  for (const text of ['IPアドレス','localStorage','ブラウザ内で最寄り','座標を保存せず']) {
    assert.ok(html.includes(text));
  }
});
