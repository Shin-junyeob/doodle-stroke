// AC-0: 브라우저가 뜨고 canvas 에 그릴 수 있는지
import { launch } from './pw.mjs';

const browser = await launch();
try {
  const page = await browser.newPage();
  await page.goto('about:blank');
  const px = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 10;
    document.body.appendChild(c);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#f00';
    ctx.fillRect(0, 0, 10, 10);
    return Array.from(ctx.getImageData(5, 5, 1, 1).data);
  });
  if (px.join() !== '255,0,0,255') throw new Error(`canvas 픽셀 이상: ${px}`);
  console.log('smoke ok', await browser.version());
} finally {
  await browser.close();
}
