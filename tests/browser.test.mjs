// node --test tests/browser.test.mjs — AC-7(획마다 1 초 안) · AC-8(PNG 저장)
// src/index.html 을 file:// 로 연다 — classic script 가 file:// 에서 도는지도 함께 확인된다.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { launch } from './pw.mjs';

const NAMES = ['heart', 'star', 'circle', 'wave', 'apple'];
const FIX = NAMES.map((n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url))));
const URL_ = pathToFileURL(new URL('../src/index.html', import.meta.url).pathname).href;

let browser, page;
before(async () => {
  browser = await launch();
  page = await (await browser.newContext({ viewport: { width: 1000, height: 760 }, acceptDownloads: true })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL_);
  assert.deepEqual(errors, [], '페이지 스크립트 오류');
  assert.equal(await page.evaluate(() => typeof globalThis.doodle?.doodle), 'function', 'classic script 로드');
});
after(async () => { await browser?.close(); });

test('AC-7 1 초 안: 5 픽스처의 모든 획을 마우스로 그려 획마다 pointerup→그리기 끝 < 1000ms', async () => {
  const box = await page.locator('#pad').boundingBox();
  let total = 0;
  for (const strokes of FIX) for (const s of strokes) {
    await page.mouse.move(box.x + s[0][0], box.y + s[0][1]);
    await page.mouse.down();
    for (const [x, y] of s.slice(1)) await page.mouse.move(box.x + x, box.y + y);
    await page.mouse.up();
    total++;
  }
  await page.waitForFunction((n) => document.getElementById('pad').dataset.done === String(n), total);
  const timings = await page.evaluate(() => window.__timings);
  assert.equal(timings.length, total);
  for (const t of timings) assert.ok(t < 1000, `획 시간 ${t}ms`);
  console.log('timings ms', timings.map((t) => t.toFixed(1)).join(', '));
});

test('AC-8 PNG 저장: 서명·IHDR 크기·왼쪽 위 픽셀 불투명 흰색', async () => {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#save')]);
  const buf = fs.readFileSync(await dl.path());
  assert.deepEqual([...buf.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'PNG 서명');
  const size = await page.evaluate(() => { const c = document.getElementById('pad'); return [c.width, c.height]; });
  assert.deepEqual([buf.readUInt32BE(16), buf.readUInt32BE(20)], size, 'IHDR 너비·높이');
  // file:// 에서는 fetch 가 안 되므로 base64 로 넘겨 디코드
  const px = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    return Array.from(x.getImageData(0, 0, 1, 1).data);
  }, buf.toString('base64'));
  assert.deepEqual(px, [255, 255, 255, 255], '왼쪽 위 픽셀');
});
