// Records the SafeSight demo on production and writes timing marks for audio sync.
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const BASE = 'https://ehs-web-6hw2nfb45q-uc.a.run.app';
const DIR = __dirname;
const DUR = JSON.parse(fs.readFileSync(path.join(DIR, 'vo/durations.json')));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CURSOR = `
(() => {
  const install = () => {
    if (document.getElementById('__cursor')) return;
    const c = document.createElement('div');
    c.id = '__cursor';
    c.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;width:22px;height:22px;border-radius:50%;' +
      'background:rgba(242,183,5,.9);border:2px solid #14181F;box-shadow:0 0 0 6px rgba(242,183,5,.25);' +
      'transform:translate(-50%,-50%);transition:transform .12s;left:' + (window.__cx || 720) + 'px;top:' + (window.__cy || 450) + 'px';
    document.body.appendChild(c);
  };
  document.addEventListener('mousemove', (e) => {
    window.__cx = e.clientX; window.__cy = e.clientY;
    const c = document.getElementById('__cursor'); if (c) { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }
  }, true);
  document.addEventListener('mousedown', () => { const c = document.getElementById('__cursor'); if (c) c.style.transform = 'translate(-50%,-50%) scale(.55)'; }, true);
  document.addEventListener('mouseup', () => { const c = document.getElementById('__cursor'); if (c) c.style.transform = 'translate(-50%,-50%) scale(1)'; }, true);
  if (document.readyState !== 'loading') install(); else document.addEventListener('DOMContentLoaded', install);
  setInterval(install, 500);
})();`;

(async () => {
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--allow-file-access-from-files'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(CURSOR);
  const page = await ctx.newPage();

  // Chrome DevTools screencast: sharp JPEG frames with wall-clock timestamps (assembled with ffmpeg later).
  const FRAMES = path.join(DIR, 'frames');
  fs.rmSync(FRAMES, { recursive: true, force: true });
  fs.mkdirSync(FRAMES);
  const frames = [];
  const cdp = await ctx.newCDPSession(page);
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    const file = path.join(FRAMES, `${String(frames.length).padStart(6, '0')}.jpg`);
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    frames.push({ file, ts: metadata.timestamp });
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  const startCast = () => cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: 1440, maxHeight: 900, everyNthFrame: 1 }).catch(() => {});
  await startCast();
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) startCast(); });
  const t0 = Date.now();
  const now = () => (Date.now() - t0) / 1000;
  const marks = [];
  const live = { siren: [], voice: [] };
  page.on('dialog', (d) => d.accept());
  page.on('requestfailed', (r) => console.log('  REQUEST FAILED', r.method(), r.url().slice(0, 90), r.failure() && r.failure().errorText));
  page.on('console', (m) => m.type() === 'error' && console.log('  console', m.text().slice(0, 200)));
  page.on('request', (r) => { if (r.url().includes('/voice/warning') && r.method() === 'POST') live.siren.push(now()); });
  page.on('response', async (r) => {
    if (r.url().includes('/voice/warning') && r.request().method() === 'POST' && r.status() === 200) {
      const t = now();
      const file = path.join(DIR, `live_voice_${live.voice.length}.wav`);
      fs.writeFileSync(file, await r.body());
      live.voice.push({ t, file });
    }
  });

  let mx = 720, my = 450;
  const moveTo = async (x, y, steps = 22) => { await page.mouse.move(x, y, { steps }); mx = x; my = y; };
  const moveToEl = async (loc) => {
    await loc.scrollIntoViewIfNeeded();
    const b = await loc.boundingBox();
    await moveTo(b.x + b.width / 2, b.y + b.height / 2);
    return b;
  };
  const click = async (loc) => { await moveToEl(loc); await sleep(180); await page.mouse.down(); await sleep(70); await page.mouse.up(); };
  const wheel = async (dy, times = 6, pause = 120) => { for (let i = 0; i < times; i++) { await page.mouse.wheel(0, dy); await sleep(pause); } };
  const seg = async (id, fn, extra = 0.6) => {
    const start = now();
    marks.push({ id, t: start });
    console.log(`[${start.toFixed(1)}s] ${id}`);
    await fn();
    const left = (DUR[id] || 0) + extra - (now() - start);
    if (left > 0) await sleep(left * 1000);
  };
  const waitAnalysis = () => page.waitForFunction(() => !document.body.innerText.includes('Analysing'), null, { timeout: 180000 });

  // ---------- Intro cards
  await page.goto('file://' + path.join(DIR, 'cards/intro.html'));
  await sleep(600);
  await seg("intro", async () => {}, 1.2);

  // ---------- Login + overview
  await seg('overview', async () => {
    await page.goto(BASE + '/login');
    await page.waitForSelector('button[type=submit]');
    await sleep(700);
    await click(page.locator('button[type=submit]'));
    await page.waitForURL('**/dashboard');
    await page.waitForSelector('text=Daily inspections');
    await sleep(1200);
    const bars = await page.locator('text=Daily inspections').locator('xpath=../..').boundingBox();
    for (let x = bars.x + 30; x < bars.x + bars.width - 20; x += 90) await moveTo(x, bars.y + bars.height - 70, 8);
    await moveToEl(page.locator('text=Hotspot locations'));
    await sleep(600);
    await moveToEl(page.locator('text=Scaffold Zone - Unit 4').last());
  });

  // ---------- Photo inspection
  await seg('photo1', async () => {
    await click(page.getByRole('link', { name: 'AI Inspection', exact: true }));
    await page.waitForSelector('button[title="Hot work - grinding near gas cylinders"]', { timeout: 30000 });
    await sleep(800);
    await moveToEl(page.locator('select').first());
    await sleep(900);
    await click(page.locator('button[title="Hot work - grinding near gas cylinders"]'));
    await sleep(900);
    await click(page.locator('button:has-text("Run AI Inspection")'));
    await waitAnalysis();
  }, 0.3);
  await seg('photo2', async () => {
    await sleep(800);
    const boxes = page.locator('div.absolute.border-2');
    const n = await boxes.count();
    for (let i = 0; i < n; i++) { await moveToEl(boxes.nth(i)); await sleep(1600); }
    await moveTo(1100, 700);
    await wheel(160, 5, 250);
    await sleep(1500);
  });

  // ---------- CCTV video
  await seg('video1', async () => {
    await page.mouse.wheel(0, -3000);
    await sleep(500);
    await click(page.locator('button:has-text("CCTV video")'));
    await page.waitForSelector('button[title="CCTV warehouse forklift aisle - simulated"]');
    await sleep(800);
    await click(page.locator('button[title="CCTV warehouse forklift aisle - simulated"]'));
    await sleep(900);
    await click(page.locator('button:has-text("Run AI Inspection")'));
    await waitAnalysis();
  }, 0.3);
  await seg('video2', async () => {
    await sleep(500);
    const ev = page.locator('ol button').first();
    await click(ev);
    await sleep(4000);
  });

  // ---------- Incident report
  await seg('report', async () => {
    await page.mouse.wheel(0, -3000);
    await click(page.getByRole('link', { name: 'Inspection History', exact: true }));
    await page.waitForSelector('button:has-text("View")');
    await sleep(900);
    await click(page.locator('button:has-text("View")').first());
    await sleep(1200);
    await click(page.locator('button:has-text("Generate incident report")'));
    await page.waitForSelector('text=Root cause:', { timeout: 120000 });
    await sleep(800);
    await moveTo(760, 520);
    await wheel(140, 10, 380);
  });
  await page.keyboard.press('Escape');
  const closeBtns = page.locator('#incident-report button').last();
  if (await closeBtns.count()) await click(closeBtns);
  await sleep(500);
  const closeAudit = page.locator('button:has-text("✕")');
  if (await closeAudit.count()) await click(closeAudit.first());
  await sleep(500);

  // ---------- Co-Pilot
  await seg('copilot', async () => {
    await click(page.getByRole('link', { name: 'EHS Co-Pilot', exact: true }));
    await page.waitForSelector('text=biggest risk');
    await sleep(900);
    await click(page.locator('button:has-text("biggest risk")').first());
    await page.waitForSelector('text=Agent queried', { timeout: 120000 });
    await sleep(500);
    await moveToEl(page.locator('text=Agent queried').first());
    await sleep(2500);
  });
  await sleep(4000);

  // ---------- SOP PDF -> policy
  await seg('policy', async () => {
    await click(page.getByRole('link', { name: 'Safety Policies', exact: true }));
    await page.waitForSelector('text=Upload Safety Standard');
    await sleep(800);
    await moveToEl(page.locator('label[for="sop-upload"]'));
    await sleep(500);
    const upload = page.waitForResponse((r) => r.url().includes('/policies/upload-sop'), { timeout: 120000 });
    await page.setInputFiles('#sop-upload', path.join(DIR, 'SOP_Chemical_Transfer.pdf'));
    await upload;
    await sleep(1500);
    const card = page.locator('p.font-bold:has-text("Chemical")').first();
    await click(card);
    await sleep(2500);
    await moveTo(1000, 600);
    await wheel(120, 4, 300);
  });

  // ---------- Live Monitor (climax)
  await seg('live1', async () => {
    await page.mouse.wheel(0, -3000);
    await click(page.getByRole('link', { name: 'Live Monitor', exact: true }));
    await page.waitForSelector('text=Start monitoring');
    await sleep(1500);
    await page.selectOption('select >> nth=0', { label: 'CCTV warehouse forklift aisle - simulated' });
    await moveToEl(page.locator('select').nth(1));
    await sleep(700);
    await click(page.locator('button:has-text("Start monitoring")'));
  }, 0.2);
  // let the siren and the Gemini voice play out
  const deadline = Date.now() + 60000;
  while (live.voice.length === 0 && Date.now() < deadline) await sleep(500);
  await moveToEl(page.locator('text=Loudspeaker (').first()).catch(() => {});
  await sleep(9000);
  await click(page.locator('button:has-text("Stop")'));
  await sleep(1200);

  // ---------- Outro card
  await page.goto('file://' + path.join(DIR, 'cards/outro.html'));
  await sleep(400);
  await seg('outro', async () => {}, 2.0);

  await cdp.send('Page.stopScreencast').catch(() => {});
  const endTs = Date.now() / 1000;
  await ctx.close();
  await browser.close();
  fs.writeFileSync(path.join(DIR, 'timeline.json'), JSON.stringify({ t0: t0 / 1000, endTs, frames, marks, live, total: now() }, null, 2));
  console.log('done', frames.length, 'frames', now().toFixed(1), 's');
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
