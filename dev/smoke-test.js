const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
// Usage: npm i playwright @fontsource/ibm-plex-sans-arabic && node dev/smoke-test.js   (from the repo root)
const APP = path.resolve(__dirname, '..'), MOCK = path.join(__dirname, 'firebase-mocks');
const F = path.resolve(__dirname, '..', 'node_modules')+'/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-';
const cfg = `window.DAFTAR_CONFIG = { firebase: { apiKey: "test", authDomain: "x", projectId: "x", appId: "x" }, appCheckSiteKey: "k", ai: true, aiModel: "m", voiceLang: "ar-SA", voiceAutoAdd: true, sdkVersion: "13.1.0" };`;
async function setup(b, opts = {}) {
  const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, isMobile:true, hasTouch:true, locale:'ar-SA', timezoneId:'Asia/Riyadh', acceptDownloads:true });
  await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType:'text/css', body:[400,500,600,700].map(w=>`@font-face{font-family:"IBM Plex Sans Arabic";font-weight:${w};src:url(https://local.font/${w}.woff2)}`).join('') }));
  await ctx.route('https://local.font/**', r => { const w = r.request().url().match(/(\d+)\.woff2/)[1]; r.fulfill({ contentType:'font/woff2', body: fs.readFileSync(F+w+'-normal.woff2') }); });
  await ctx.route('https://www.gstatic.com/firebasejs/**', r => { const f = path.basename(new URL(r.request().url()).pathname); r.fulfill({ contentType:'application/javascript', body: fs.readFileSync(path.join(MOCK, f)) }); });
  await ctx.route('https://app.test/**', r => { let p = new URL(r.request().url()).pathname.slice(1) || 'index.html'; if (p === 'config.js') return r.fulfill({ contentType:'application/javascript', body: cfg });
    const types = { html:'text/html', js:'application/javascript', png:'image/png', webmanifest:'application/manifest+json' };
    r.fulfill({ contentType: types[p.split('.').pop()] || 'text/plain', body: fs.readFileSync(path.join(APP, p)) }); });
  if (opts.init) await ctx.addInitScript(opts.init);
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); p.on('console', m => { if (m.type()==='error') p.errs.push('console: '+m.text()); });
  return { ctx, p };
}
(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
  // 1) sign-in gate -> app
  let { ctx, p } = await setup(b);
  await p.goto('https://app.test/'); await p.waitForTimeout(400);
  console.log('gate:', await p.textContent('#gateMsg'), '| btn:', await p.textContent('#gateBtn'));
  await p.screenshot({ path: path.join(__dirname,'out-gate.png') });
  await p.click('#gateBtn'); await p.waitForTimeout(500);
  console.log('gate hidden:', await p.evaluate(() => document.querySelector('#gate').hidden), '| sync:', await p.getAttribute('#sync','class'), '| appcheck:', await p.evaluate(() => !!window.__appcheck));
  // 2) add items
  for (const t of ['حليب', 'ترا الغاز قرب يخلص', 'شي للصداع']) { await p.fill('#entry', t); await p.press('#entry', 'Enter'); await p.waitForTimeout(300); console.log(t, '->', await p.textContent('#toast')); }
  await p.waitForTimeout(300);
  const items = await p.evaluate(() => [...window.__DB].filter(([k]) => k.startsWith('items/')).map(([k, v]) => [v.title, v.cat, v.aiCat || false]));
  console.log('db items:', JSON.stringify(items));
  // 3) buy milk: done + history merge
  await p.click('nav.tabs [data-tab="shop"]'); await p.waitForTimeout(200);
  await p.click('#view-shop .item .chk >> nth=0'); await p.waitForTimeout(400);
  console.log('shop items after buy:', await p.evaluate(() => document.querySelectorAll('#view-shop .item').length), '| history:', await p.evaluate(() => JSON.stringify(window.__DB.get('history/recent'))));
  console.log('milk doc:', await p.evaluate(() => { const v=[...window.__DB.values()].find(v=>v.title==='حليب'); return v && [v.done, typeof v.doneAt]; }));
  // 4) suggestion
  await p.fill('#entry', 'حل'); await p.waitForTimeout(150);
  console.log('suggest:', await p.evaluate(() => [...document.querySelectorAll('.sg')].map(x=>x.textContent).join(',')));
  await p.fill('#entry', '');
  // 5) categories tab: backup card, export download, import
  await p.click('nav.tabs [data-tab="cats"]'); await p.waitForTimeout(200);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-act="export"]')]);
  console.log('export file:', dl.suggestedFilename());
  await p.setInputFiles('#importFile', path.join(__dirname,'sample-data.json')); await p.waitForTimeout(200);
  console.log('import prompt:', await p.textContent('#importConfirm'));
  await p.click('[data-act="importGo"]'); await p.waitForTimeout(500);
  console.log('after import toast:', await p.textContent('#toast'), '| items in db:', await p.evaluate(() => [...window.__DB.keys()].filter(k=>k.startsWith('items/')).length), '| trips:', await p.evaluate(() => JSON.stringify(window.__DB.get('config/trips'))));
  await p.click('nav.tabs [data-tab="shop"]'); await p.waitForTimeout(250);
  await p.screenshot({ path: path.join(__dirname,'out-shop.png') });
  await p.click('nav.tabs [data-tab="home"]'); await p.waitForTimeout(250);
  await p.screenshot({ path: path.join(__dirname,'out-home.png') });
  // 5b) sideways swipe -> neighbouring tab; no pull-to-refresh
  const swipe = (x0, x1, sel = 'body', y = 600) => p.evaluate(([x0, x1, sel, y]) => {
    const el = document.querySelector(sel), mk = x => new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
    el.dispatchEvent(new TouchEvent('touchstart', { touches: [mk(x0)], changedTouches: [mk(x0)], bubbles: true }));
    el.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [mk(x1)], bubbles: true }));
    return document.querySelector('nav.tabs [aria-selected="true"]').dataset.tab; }, [x0, x1, sel, y]);
  const tabSeq = [await swipe(100, 260, '#view-home'), await swipe(100, 260, '#view-shop'), await swipe(300, 120, '#view-tasks'), await swipe(300, 120, '#view-shop'), await swipe(300, 120, '#view-home')];
  console.log('swipe tabs:', tabSeq.join(' > '), '| edge ignored:', await swipe(8, 200, '#view-home'), '| entry ignored:', await swipe(100, 260, '#entry'), '| short ignored:', await swipe(150, 190, '#view-home'));
  console.log('overscroll:', await p.evaluate(() => getComputedStyle(document.documentElement).overscrollBehaviorY + '/' + getComputedStyle(document.body).overscrollBehaviorY));
  // 5c) store date: once nothing follows it, a new item starts undated; a rename of the only item keeps the date
  const tripCase = await p.evaluate(async () => {
    const shopIds = () => [...window.__DB].filter(([k, v]) => k.startsWith('items/') && v.cat === 'super' && !v.done).map(([k]) => k);
    for (const k of shopIds()) window.__DB.delete(k);
    const d = new Date(Date.now() + 3 * 864e5), day = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    window.__DB.set('config/trips', { super: day }); window.__DB.set('items/x1', { title: 'تمر', cat: 'super', date: null, pin: false, done: false, doneAt: null, priority: 'normal', recur: null, createdAt: 1 });
    return day; });
  await p.click('nav.tabs [data-tab="shop"]'); await p.waitForTimeout(300);   // listeners fire on the next write; force one
  await p.fill('#entry', 'خبز'); await p.press('#entry', 'Enter'); await p.waitForTimeout(400);
  console.log('trip kept while items follow it:', JSON.stringify(await p.evaluate(() => window.__DB.get('config/trips'))), '| toast:', await p.textContent('#toast'));
  await p.click('#view-shop .item .chk >> nth=0'); await p.waitForTimeout(300); await p.click('#view-shop .item .chk >> nth=0'); await p.waitForTimeout(400);
  await p.fill('#entry', 'حليب'); await p.press('#entry', 'Enter'); await p.waitForTimeout(400);
  console.log('after all bought, new item:', await p.textContent('#toast'), '| trips:', JSON.stringify(await p.evaluate(() => window.__DB.get('config/trips'))));
  // 5d) tasks tab: one flat list, no category header
  await p.click('nav.tabs [data-tab="tasks"]'); await p.waitForTimeout(250);
  console.log('tasks:', await p.evaluate(() => ({ headers: document.querySelectorAll('#view-tasks .group-h').length, rows: document.querySelectorAll('#view-tasks .card:not(:has(details)) .item').length, label: document.querySelector('#view-tasks .row')?.textContent })));
  await p.screenshot({ path: path.join(__dirname,'out-tasks.png') });
  console.log('mic visible:', await p.evaluate(() => !document.querySelector('#micBtn').hidden));
  console.log('errors1:', p.errs);
  await ctx.close();
  // 6) not on the family list
  ({ ctx, p } = await setup(b, { init: () => { window.__DENY = true; } }));
  await p.goto('https://app.test/'); await p.waitForTimeout(300); await p.click('#gateBtn'); await p.waitForTimeout(400);
  console.log('deny gate:', await p.textContent('#gateMsg'), '| signout visible:', await p.evaluate(() => !document.querySelector('#gateOut').hidden));
  console.log('errors2:', p.errs);
  await ctx.close();
  // 7) #voice link (already signed in on load)
  ({ ctx, p } = await setup(b, { init: () => { window.webkitSpeechRecognition = class { start(){ window.__srStarted = true; setTimeout(() => { this.onresult && this.onresult({ results: [Object.assign([{ transcript: 'بنادول' }], { isFinal: true })] }); this.onend && this.onend(); }, 50); } stop(){} }; } }));
  await p.goto('https://app.test/#voice'); await p.waitForTimeout(300); await p.click('#gateBtn'); await p.waitForTimeout(600);
  console.log('voice: started', await p.evaluate(() => !!window.__srStarted), '| toast:', await p.textContent('#toast'), '| hash:', await p.evaluate(() => location.hash));
  console.log('errors3:', p.errs);
  await b.close();
})();
