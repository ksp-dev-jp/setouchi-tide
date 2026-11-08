import test from 'node:test';
import assert from 'node:assert/strict';
import { SITE } from '../config.mjs';
import { ad } from '../lib/html.mjs';
import { AFFILIATE_ITEMS, affiliateBlock, hasAffiliate } from '../lib/affiliate.mjs';

test('忍者AdMax は AdSense の枠IDが無い枠にだけ出る', () => {
  const save = { ...SITE.ADMAX_SLOTS }, saveAs = SITE.ADSENSE_SLOTS;
  // 本番(SITE_LEAN=1)と同じく AdSense は side だけ
  SITE.ADSENSE_SLOTS = { side: saveAs.side };
  try {
    SITE.ADMAX_SLOTS.footer = '';
    assert.equal(ad('footer').includes('adm.shinobi.jp'), false);
    // PC/SP 切替タグは /o/ の URL になる
    SITE.ADMAX_SLOTS.footer = 'o/def456';
    assert.ok(ad('footer').includes('src="https://adm.shinobi.jp/o/def456"'));
    SITE.ADMAX_SLOTS.footer = 'abc123';
    SITE.ADMAX_SLOTS.side = 'zzz';
    assert.match(ad('footer'), /<script src="https:\/\/adm\.shinobi\.jp\/s\/abc123"><\/script>/);
    // AdSense を使わないとき、side は表示中だけタグを書き出す
    if (!SITE.ADSENSE_CLIENT) assert.ok(ad('side').includes(`offsetWidth)document.write('<scr'+'ipt src="https://adm.shinobi.jp/s/zzz"></scr'+'ipt>')`));
    // AdSense の枠IDがあるあいだは AdSense のまま
    if (SITE.ADSENSE_CLIENT && SITE.ADSENSE_SLOTS.side) assert.ok(ad('side').includes('adsbygoogle') && !ad('side').includes('shinobi'));
  } finally {
    for (const k of Object.keys(SITE.ADMAX_SLOTS)) delete SITE.ADMAX_SLOTS[k];
    Object.assign(SITE.ADMAX_SLOTS, save);
    SITE.ADSENSE_SLOTS = saveAs;
  }
});

test('物販リンクは url のある商品だけを、広告の表示付きで出す', () => {
  assert.equal(affiliateBlock('nothing'), '');
  const item = AFFILIATE_ITEMS.shiohigari[0];
  const save = { ...item };
  try {
    item.url = 'https://example.com/a?x=1&y=2';
    item.pixel = 'https://example.com/i.gif';
    assert.ok(hasAffiliate());
    const html = affiliateBlock('shiohigari-calendar');
    assert.ok(html.includes('PR') && html.includes('以下は広告です'));
    assert.ok(html.includes('rel="sponsored nofollow noopener"'));
    assert.ok(html.includes('href="https://example.com/a?x=1&amp;y=2"'));
    assert.equal((html.match(/<li>/g) || []).length, 1);
  } finally {
    Object.assign(item, save);
  }
});
