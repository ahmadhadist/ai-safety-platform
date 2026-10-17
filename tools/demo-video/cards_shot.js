const { chromium } = require('playwright-core');
const path = require('path');
(async () => {
  const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto('file://' + path.join(__dirname, 'cards/intro.html')); await p.waitForTimeout(1500);
  await p.screenshot({ path: path.join(__dirname, 'card_intro_a.jpg'), quality: 92, type: 'jpeg' });
  await p.evaluate(() => { a.style.transition = b.style.transition = 'none'; a.style.opacity = 0; b.style.opacity = 1; });
  await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(__dirname, 'card_intro_b.jpg'), quality: 92, type: 'jpeg' });
  await p.goto('file://' + path.join(__dirname, 'cards/outro.html')); await p.waitForTimeout(1500);
  await p.screenshot({ path: path.join(__dirname, 'card_outro.jpg'), quality: 92, type: 'jpeg' });
  await b.close();
})();
