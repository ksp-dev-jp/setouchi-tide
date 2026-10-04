import test from 'node:test';
import assert from 'node:assert/strict';
import { PREF_GUIDES } from '../lib/pref-guides.mjs';
import { TIDE_STATIONS, PREFS } from '../lib/stations.mjs';
import { springLowTimes, springLowLabel } from '../lib/tide-profile.mjs';

const official = TIDE_STATIONS.filter(s => !s.jmaAnchor);

test('公式観測点のある県すべてに手書きの解説がある', () => {
  for (const p of PREFS) {
    if (!official.some(s => s.pref === p.id)) continue;
    const g = PREF_GUIDES[p.id];
    assert.ok(g, p.id);
    assert.ok(g.intro.length >= 1 && g.coasts.length >= 1 && g.tips.length >= 2, p.id);
  }
});

test('県内の公式観測点はどれか1つの海域にだけ入っている', () => {
  for (const [id, g] of Object.entries(PREF_GUIDES)) {
    const names = official.filter(s => s.pref === id).map(s => s.name).sort();
    const listed = g.coasts.flatMap(c => c.stations).sort();
    assert.deepEqual(listed, names, id);
  }
});

test('大潮の干潮時刻: 外洋型は約12時間25分おき、浅海型は朝夕に分かれる', () => {
  // 外洋型: 11.5時と23.9時の前後に散らばる
  const ocean = Array.from({ length: 40 }, (_, i) => (i % 2 ? 23.9 : 11.5) + ((i % 5) - 2) * 0.2);
  assert.equal(springLowLabel(springLowTimes(ocean)), '0時ごろ・11時半ごろ');
  // 備讃瀬戸型: 朝5時ごろと夕方18時ごろ(間隔13時間)
  const shallow = Array.from({ length: 40 }, (_, i) => (i % 2 ? 18 : 5) + ((i % 5) - 2) * 0.4);
  assert.equal(springLowLabel(springLowTimes(shallow)), '5時ごろ・18時ごろ');
  // ばらつく地点は null
  const scattered = Array.from({ length: 40 }, (_, i) => (i * 7.3) % 24);
  assert.equal(springLowTimes(scattered), null);
});

test('地方内の公式観測点はどれか1つの海にだけ入っている', async () => {
  const { REGION_GUIDES } = await import('../lib/region-guides.mjs');
  const { REGIONS } = await import('../lib/stations.mjs');
  for (const r of REGIONS) {
    const g = REGION_GUIDES[r.id];
    assert.ok(g && g.intro.length && g.tips.length >= 2, r.id);
    const names = official.filter(s => r.prefs.includes(s.pref)).map(s => s.name).sort();
    assert.deepEqual(g.seas.flatMap(s => s.stations).sort(), names, r.id);
  }
});

test('海域の干潮時刻の幅: 日付をまたぐ地点も同じ組にまとまる', async () => {
  const { springLowRangeLabel } = await import('../lib/tide-profile.mjs');
  // 東京(11.5/23.5) と 神津島(0.0/12.0) → 11時半〜12時・23時半〜0時
  assert.equal(springLowRangeLabel([[11.5, 23.5], [0, 12], null]), '11時半〜12時ごろ・23時半〜0時ごろ');
  assert.equal(springLowRangeLabel([[4, 16.5], [4, 16.5]]), '4時ごろ・16時半ごろ');
  assert.equal(springLowRangeLabel([null]), null);
});
