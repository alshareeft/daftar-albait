const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
// Usage: npm i playwright @fontsource/ibm-plex-sans-arabic && node dev/smoke-test.js   (from the repo root)
const APP = path.resolve(__dirname, '..'), MOCK = path.join(__dirname, 'firebase-mocks');
const F = path.resolve(__dirname, '..', 'node_modules')+'/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-';
const cfg = `window.DAFTAR_CONFIG = { firebase: { apiKey: "test", authDomain: "x", projectId: "x", appId: "x" }, appCheckSiteKey: "k", ai: true, aiModel: "m", voiceLang: "ar-SA", voiceAutoAdd: true, sdkVersion: "13.1.0" };`;
// typing goes through the add panel (long press on the mic); after «أضف» it closes by itself
async function add(p, t) { await p.evaluate(() => openCompose()); await p.fill('#entry', t); await p.press('#entry', 'Enter'); }
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
  for (const t of ['حليب', 'ترا الغاز قرب يخلص', 'شي للصداع']) { await add(p, t); await p.waitForTimeout(300); console.log(t, '->', await p.textContent('#toast')); }
  await p.waitForTimeout(300);
  const items = await p.evaluate(() => [...window.__DB].filter(([k]) => k.startsWith('items/')).map(([k, v]) => [v.title, v.cat, v.aiCat || false]));
  console.log('db items:', JSON.stringify(items));
  // 3) buy milk: done + history merge
  await p.click('nav.tabs [data-tab="shop"]'); await p.waitForTimeout(200);
  await p.click('#view-shop .item .chk >> nth=0'); await p.waitForTimeout(400);
  console.log('shop items after buy:', await p.evaluate(() => document.querySelectorAll('#view-shop .item').length), '| history:', await p.evaluate(() => JSON.stringify(window.__DB.get('history/recent'))));
  console.log('milk doc:', await p.evaluate(() => { const v=[...window.__DB.values()].find(v=>v.title==='حليب'); return v && [v.done, typeof v.doneAt]; }));
  // 4) suggestion
  await p.evaluate(() => openCompose()); await p.fill('#entry', 'حل'); await p.waitForTimeout(150);
  console.log('suggest:', await p.evaluate(() => [...document.querySelectorAll('.sg')].map(x=>x.textContent).join(',')));
  await p.fill('#entry', ''); await p.evaluate(() => closeCompose()); await p.waitForTimeout(100);
  // 5) categories tab: backup card, export download, import
  await p.evaluate(() => goTab('cats')); await p.waitForTimeout(200);
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
    return document.querySelector('nav.tabs [aria-current="page"]').dataset.tab; }, [x0, x1, sel, y]);
  const tabSeq = [await swipe(100, 260, '#view-home'), await swipe(100, 260, '#view-shop'), await swipe(300, 120, '#view-tasks'), await swipe(300, 120, '#view-shop'), await swipe(300, 120, '#view-home')];
  console.log('swipe tabs:', tabSeq.join(' > '), '| edge ignored:', await swipe(8, 200, '#view-home'), '| entry ignored:', await swipe(100, 260, '#entry'), '| short ignored:', await swipe(150, 190, '#view-home'));
  console.log('overscroll:', await p.evaluate(() => getComputedStyle(document.documentElement).overscrollBehaviorY + '/' + getComputedStyle(document.body).overscrollBehaviorY));
  // 5c) store date: once nothing follows it, a new item starts undated; a rename of the only item keeps the date
  const tripCase = await p.evaluate(async () => {
    const shopIds = () => [...window.__DB].filter(([k, v]) => k.startsWith('items/') && v.cat === 'super' && !v.done).map(([k]) => k);
    for (const k of shopIds()) window.__DB.delete(k);
    const d = new Date(Date.now() + 3 * 864e5), day = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const S = await import('https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js');   // same mock instance: its writes refresh the app
    await S.setDoc(S.doc(null, 'items/x1'), { title: 'تمر', cat: 'super', date: null, pin: false, done: false, doneAt: null, priority: 'normal', recur: null, createdAt: 1 });
    await S.setDoc(S.doc(null, 'config/trips'), { super: day });
    return day; });
  await p.click('nav.tabs [data-tab="shop"]'); await p.waitForTimeout(300);   // listeners fire on the next write; force one
  await add(p, 'خبز'); await p.waitForTimeout(400);
  console.log('trip kept while items follow it:', JSON.stringify(await p.evaluate(() => window.__DB.get('config/trips'))), '| toast:', await p.textContent('#toast'));
  await p.click('#view-shop .item .chk >> nth=0'); await p.waitForTimeout(300); await p.click('#view-shop .item .chk >> nth=0'); await p.waitForTimeout(400);
  await add(p, 'حليب'); await p.waitForTimeout(400);
  console.log('after all bought, new item:', await p.textContent('#toast'), '| trips:', JSON.stringify(await p.evaluate(() => window.__DB.get('config/trips'))));
  // 5d) tasks tab: one flat list, no category header
  await p.click('nav.tabs [data-tab="tasks"]'); await p.waitForTimeout(250);
  console.log('tasks:', await p.evaluate(() => ({ headers: document.querySelectorAll('#view-tasks .group-h').length, rows: document.querySelectorAll('#view-tasks .card:not(:has(details)) .item').length, label: document.querySelector('#view-tasks .psub')?.textContent })));
  await p.screenshot({ path: path.join(__dirname,'out-tasks.png') });
  // 5e) weekday phrases: the date words leave the title
  console.log('weekday parse:', JSON.stringify(await p.evaluate(() => {
    const sat = new Date(2026, 9, 31), fri = new Date(2026, 9, 30);   // Sat 31 Oct, Fri 30 Oct 2026
    const P = (t, d) => { const r = parseEntry(t, state.cats, d)[0]; return r.title + '|' + r.date; };
    return [P('بنادول هذا السبت', fri), P('بنادول السبت الجاي', fri), P('هالسبت جيب خبز', fri), P('هالسبت جيب خبز', sat), P('اتصل بالسباك يوم الأحد القادم', fri),
            P('بنادول هذا السبت', sat), P('بنادول السبت', sat), P('موعد الأسنان الخميس اللي جاي', fri)]; })));
  // 5f) other stores date each item; supermarket keeps one list date
  await p.click('nav.tabs [data-tab="shop"]'); await p.waitForTimeout(200);
  await add(p, 'بنادول بكرة'); await p.waitForTimeout(400);
  const t1 = await p.textContent('#toast');
  await add(p, 'فيتامين'); await p.waitForTimeout(400);
  console.log('pharma:', t1, '/', await p.textContent('#toast'), '| pharma date chip:', await p.evaluate(() => [...document.querySelectorAll('#view-shop .card')].filter(c => c.textContent.includes('صيدلية')).map(c => !!c.querySelector('.trip'))[0]),
    '| super chip:', await p.evaluate(() => [...document.querySelectorAll('#view-shop .card')].filter(c => c.textContent.includes('سوبرماركت')).map(c => !!c.querySelector('.trip'))[0]));
  await p.click('#view-shop .item .txt:has-text("فيتامين")'); await p.waitForTimeout(200);
  console.log('pharma sheet:', await p.evaluate(() => ({ pinHidden: document.querySelector('#f-pin').hidden, dateOn: !document.querySelector('#e-date').disabled, date: document.querySelector('#e-date').value })));
  await p.fill('#e-date', '2026-12-05'); await p.click('[data-act="saveSheet"]'); await p.waitForTimeout(300);
  console.log('pharma saved:', JSON.stringify(await p.evaluate(() => { const v = [...window.__DB.values()].find(v => v.title === 'فيتامين'); return [v.date, v.pin]; })));
  await p.screenshot({ path: path.join(__dirname,'out-shop2.png') });
  console.log('mic visible:', await p.evaluate(() => !document.querySelector('#micBtn').hidden));
  console.log('errors1:', p.errs);
  await ctx.close();
  // 5g) supermarket full screen by long press on its title (home + shopping tab); a short tap still opens/closes the group
  ({ ctx, p } = await setup(b));
  await p.goto('https://app.test/'); await p.waitForTimeout(300); await p.click('#gateBtn'); await p.waitForTimeout(500);
  for (const t of ['حليب اليوم', 'خبز اليوم', 'بيض']) { await add(p, t); await p.waitForTimeout(250); }
  const longPress = async sel => { const bx = await p.locator(sel).first().boundingBox(); await p.mouse.move(bx.x + bx.width / 2, bx.y + bx.height / 2); await p.mouse.down(); await p.waitForTimeout(650); await p.mouse.up(); await p.waitForTimeout(250); };
  const homeH = '#dayList .triprow[data-cat="super"]';
  console.log('expand icon gone:', await p.evaluate(() => !document.querySelector('[data-act="focus"]')), '| trip row:', (await p.textContent(homeH)).replace(/\s+/g, ' ').trim());
  await p.screenshot({ path: path.join(__dirname,'out-home2.png') });
  await p.click(homeH); await p.waitForTimeout(250);
  console.log('home trip row tap -> full screen:', await p.evaluate(() => ({ focus: !document.querySelector('#focusHost').hidden, rows: document.querySelectorAll('#focusHost .item').length })));
  await p.click('[data-act="unfocus"]'); await p.waitForTimeout(200);
  await longPress(homeH);
  console.log('home long press:', await p.evaluate(() => ({ focus: !document.querySelector('#focusHost').hidden, rows: document.querySelectorAll('#focusHost .item').length })));
  await p.click('[data-act="unfocus"]'); await p.waitForTimeout(200);
  // mic: long press opens typing; Esc closes; the bar has four sections + the mic
  await longPress('#micBtn');
  console.log('mic long press -> typing:', await p.evaluate(() => ({ composing: document.body.classList.contains('composing'), focused: document.activeElement.id, dock: getComputedStyle(document.querySelector('.dock')).display })));
  await p.fill('#entry', 'ولاعة السبت'); await p.waitForTimeout(150);
  await p.screenshot({ path: path.join(__dirname,'out-type.png') });
  await p.fill('#entry', '');
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  console.log('esc closes typing:', await p.evaluate(() => !document.body.classList.contains('composing')), '| bar:', await p.evaluate(() => [...document.querySelectorAll('nav.tabs > button')].map(b => b.textContent.trim() || 'mic').join(',')));
  // calendar: week by default, «عرض الشهر» opens the month
  console.log('calendar:', await p.evaluate(() => { const w = document.querySelectorAll('#calGrid .day').length; document.querySelector('#calToggle').click(); const m = document.querySelectorAll('#calGrid .day').length; return w + ' -> ' + m; }));
  await p.screenshot({ path: path.join(__dirname,'out-month.png') });
  await p.click('#calToggle');
  // menu: inbox dot, inbox + categories
  await add(p, 'شي غريب'); await p.waitForTimeout(300);
  console.log('menu dot:', await p.evaluate(() => !document.querySelector('#menuDot').hidden));
  await p.click('#menuBtn'); await p.waitForTimeout(200);
  await p.screenshot({ path: path.join(__dirname,'out-menu.png') });
  await p.click('.mrow[data-to="inbox"]'); await p.waitForTimeout(300);
  console.log('menu -> inbox:', await p.evaluate(() => state.tab + ' | sheet closed: ' + !document.querySelector('#sheetHost .sheet')));
  await p.goBack(); await p.waitForTimeout(300);
  // supermarket: 5 items then «و N أصناف أخرى»
  for (const t of ['طماطم', 'رز', 'سكر', 'شاي', 'ملح']) await add(p, t);
  await p.waitForTimeout(300);
  await p.click('nav.tabs [data-tab="shop"]'); await p.waitForTimeout(250);
  console.log('super more:', await p.evaluate(() => document.querySelectorAll('#view-shop .store .item').length + ' + ' + document.querySelector('[data-act="superMore"]')?.textContent.trim()));
  await p.screenshot({ path: path.join(__dirname,'out-shop3.png') });
  await p.click('[data-act="superMore"]'); await p.waitForTimeout(200);
  console.log('super all:', await p.evaluate(() => document.querySelectorAll('#view-shop .store .item').length));
  await longPress('#view-shop .grp-h[data-cat="super"]');
  console.log('shop long press:', await p.evaluate(() => ({ focus: !document.querySelector('#focusHost').hidden, rows: [...document.querySelectorAll('#focusHost .item .t')].map(x => x.textContent).join(','), groupOpen: !document.querySelector('#view-shop .store').classList.contains('closed') })));
  await p.screenshot({ path: path.join(__dirname,'out-focus-shop.png') });
  await p.click('#focusHost .item .chk >> nth=0'); await p.waitForTimeout(400);
  console.log('bought leaves shop focus:', await p.evaluate(() => document.querySelectorAll('#focusHost .item').length));
  await p.goBack(); await p.waitForTimeout(300);
  console.log('back closes long-press focus:', await p.evaluate(() => ({ focus: !document.querySelector('#focusHost').hidden, tab: state.tab, url: location.href })));
  // night look
  await p.evaluate(() => { document.documentElement.setAttribute('data-theme', 'dark'); goTab('home'); });
  await p.waitForTimeout(300); await p.screenshot({ path: path.join(__dirname,'out-home-dark.png') });
  await p.evaluate(() => goTab('shop')); await p.waitForTimeout(300); await p.screenshot({ path: path.join(__dirname,'out-shop-dark.png') });
  await p.evaluate(() => { document.documentElement.removeAttribute('data-theme'); try { localStorage.removeItem('daftar-theme'); } catch (e) {} });
  console.log('errors1d:', p.errs);
  await ctx.close();
  // 6) events: create, add while open (tagged, still in its store), add a date, link an existing item, untag, end
  ({ ctx, p } = await setup(b));
  await p.goto('https://app.test/'); await p.waitForTimeout(300); await p.click('#gateBtn'); await p.waitForTimeout(500);
  for (const t of ['حليب', 'اتصل بالسباك بكرة']) { await add(p, t); await p.waitForTimeout(250); }
  await p.click('nav.tabs [data-tab="events"]'); await p.waitForTimeout(200);
  await p.screenshot({ path: path.join(__dirname,'out-events-empty.png') });
  await p.click('[data-act="evNew"]'); await p.waitForTimeout(150);
  await p.fill('#ev-name', 'طلعة الشوي'); await p.click('.emogrid [data-e="🍖"]');
  await p.screenshot({ path: path.join(__dirname,'out-event-sheet.png') });
  await p.click('[data-act="evSave"]'); await p.waitForTimeout(300);
  console.log('event created:', await p.textContent('#toast'), '| open:', await p.textContent('.evcard.open .evhd2 h3'), '| placeholder:', await p.getAttribute('#entry', 'placeholder'));
  for (const t of ['فحم', 'لحم غنم', 'دلة قهوة أمازون السبت', 'احجز المكان']) { await add(p, t); await p.waitForTimeout(300); }
  console.log('add in event:', await p.textContent('#toast'));
  console.log('tagged:', JSON.stringify(await p.evaluate(() => [...window.__DB].filter(([k, v]) => k.startsWith('items/') && v.ev).map(([k, v]) => v.title + ':' + v.cat))));
  const addBtns = await p.evaluate(() => [...document.querySelectorAll('#view-events .adddate')].map(b => b.closest('.item').querySelector('.t').textContent));
  console.log('add-date buttons:', addBtns.join(','));
  await p.click('#view-events .item:has-text("لحم غنم") .adddate'); await p.waitForTimeout(150);
  await p.fill('#ed-date', '2026-12-10'); await p.click('[data-act="evDateSave"]'); await p.waitForTimeout(300);
  console.log('meat date:', JSON.stringify(await p.evaluate(() => { const v = [...window.__DB.values()].find(v => v.title === 'لحم غنم'); return [v.date, v.pin, v.cat]; })));
  await p.click('[data-act="evLink"]'); await p.waitForTimeout(150);
  await p.check('.linklist label:has-text("حليب") input'); await p.click('[data-act="evLinkSave"]'); await p.waitForTimeout(300);
  console.log('linked:', await p.textContent('#toast'), '| milk ev:', await p.evaluate(() => !![...window.__DB.values()].find(v => v.title === 'حليب').ev));
  await p.screenshot({ path: path.join(__dirname,'out-event-open.png'), fullPage: true });
  console.log('events sub:', await p.textContent('#view-events .psub'));
  // still in its store, with the event pill
  await p.click('nav.tabs [data-tab="shop"]'); await p.waitForTimeout(250);
  console.log('shop event mark is emoji only:', await p.evaluate(() => [...document.querySelectorAll('#view-shop .evmark')].map(x => x.textContent).join('') + ' | name hidden: ' + ![...document.querySelectorAll('#view-shop .meta')].some(m => m.textContent.includes('طلعة'))));
  // header + tabs stay pinned while the list scrolls
  await p.evaluate(() => { for (let i = 0; i < 25; i++) state.items.push({ id: 'z' + i, title: 'صنف ' + i, cat: 'super', date: null, pin: false, done: false, priority: 'normal' }); state.superAll = true; render(); window.scrollTo(0, 900); });
  await p.waitForTimeout(200);
  console.log('pinned header:', await p.evaluate(() => ({ scrollY: Math.round(scrollY), brandTop: Math.round(document.querySelector('.brand').getBoundingClientRect().top), tabsTop: Math.round(document.querySelector('nav.tabs').getBoundingClientRect().top) })));
  await p.screenshot({ path: path.join(__dirname,'out-pinned.png') });
  await p.evaluate(() => { state.items = state.items.filter(it => !String(it.id).startsWith('z')); window.scrollTo(0, 0); render(); });
  console.log('shop shows event pill:', await p.evaluate(() => [...document.querySelectorAll('#view-shop .item')].filter(x => x.textContent.includes('🍖')).map(x => x.querySelector('.t').textContent).join(',')),
    '| placeholder:', await p.getAttribute('#entry', 'placeholder'));
  await add(p, 'بيض'); await p.waitForTimeout(300);
  console.log('outside event not tagged:', await p.evaluate(() => !([...window.__DB.values()].find(v => v.title === 'بيض') || {}).ev));
  // untag from the edit sheet
  await p.click('#view-shop .item .txt:has-text("دلة قهوة")'); await p.waitForTimeout(150);
  await p.selectOption('#e-ev', ''); await p.click('[data-act="saveSheet"]'); await p.waitForTimeout(300);
  console.log('untagged:', await p.evaluate(() => [...window.__DB.values()].find(v => v.title === 'دلة قهوة أمازون').ev));
  // list + end
  await p.click('nav.tabs [data-tab="events"]'); await p.waitForTimeout(200);
  // a second event: the new button stays visible; only one box is open at a time
  await p.click('[data-act="evNew"]'); await p.waitForTimeout(150);
  await p.fill('#ev-name', 'البيبي'); await p.click('.emogrid [data-e="👶"]'); await p.click('[data-act="evSave"]'); await p.waitForTimeout(300);
  await add(p, 'عربة البيبي'); await p.waitForTimeout(300);
  console.log('two events:', await p.evaluate(() => ({ boxes: document.querySelectorAll('.evcard').length, open: document.querySelectorAll('.evcard.open').length, openName: document.querySelector('.evcard.open h3').textContent,
    stroller: (state.events.find(e => e.id === [...window.__DB.values()].find(v => v.title === 'عربة البيبي').ev) || {}).name })));
  await p.screenshot({ path: path.join(__dirname,'out-events-two.png'), fullPage: true });
  await p.click('.evcard.open .evhd2'); await p.waitForTimeout(200);
  await p.screenshot({ path: path.join(__dirname,'out-events-list.png') });
  console.log('list card:', (await p.textContent('.evcard')).replace(/\s+/g, ' ').trim(), '| open after close:', await p.evaluate(() => document.querySelectorAll('.evcard.open').length), '| placeholder:', await p.getAttribute('#entry', 'placeholder'));
  await p.click('.evcard .evhd2 >> nth=0'); await p.waitForTimeout(200);
  await p.screenshot({ path: path.join(__dirname,'out-event-open2.png') });
  await p.click('[data-act="evMenu"]'); await p.waitForTimeout(150);
  await p.click('[data-act="evEnd"]'); await p.waitForTimeout(100); await p.click('[data-act="evEndGo"]'); await p.waitForTimeout(400);
  console.log('ended:', await p.textContent('#toast'), '| events:', JSON.stringify(await p.evaluate(() => window.__DB.get('config/events'))), '| tags left:', await p.evaluate(() => [...window.__DB.values()].filter(v => v.ev).length), '| items kept:', await p.evaluate(() => [...window.__DB.keys()].filter(k => k.startsWith('items/')).length));
  console.log('errors1c:', p.errs);
  await ctx.close();
  // 6a) older data: a pharmacy list date moves onto its items, then is removed
  ({ ctx, p } = await setup(b, { init: () => { const d = new Date(Date.now() + 2 * 864e5), day = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); window.__DB = new Map([
    ['items/m1', { title: 'بنادول', cat: 'pharma', date: null, pin: false, done: false, doneAt: null, priority: 'normal', recur: null, createdAt: 1 }],
    ['items/m2', { title: 'مرهم', cat: 'pharma', date: '2026-12-01', pin: true, done: false, doneAt: null, priority: 'normal', recur: null, createdAt: 2 }],
    ['items/m3', { title: 'حليب', cat: 'super', date: null, pin: false, done: false, doneAt: null, priority: 'normal', recur: null, createdAt: 3 }],
    ['config/trips', { pharma: day, super: day }]]); window.__day = day; } }));
  await p.goto('https://app.test/'); await p.waitForTimeout(300); await p.click('#gateBtn'); await p.waitForTimeout(700);
  console.log('migrate:', JSON.stringify(await p.evaluate(() => ({ ok: window.__DB.get('items/m1').date === window.__day, pinned: window.__DB.get('items/m2').date, milk: window.__DB.get('items/m3').date, trips: Object.keys(window.__DB.get('config/trips')) }))));
  console.log('errors1b:', p.errs);
  await ctx.close();
  // 6) not on the family list
  ({ ctx, p } = await setup(b, { init: () => { window.__DENY = true; } }));
  await p.goto('https://app.test/'); await p.waitForTimeout(300); await p.click('#gateBtn'); await p.waitForTimeout(400);
  console.log('deny gate:', await p.textContent('#gateMsg'), '| signout visible:', await p.evaluate(() => !document.querySelector('#gateOut').hidden));
  console.log('errors2:', p.errs);
  await ctx.close();
  // 7) #voice link (already signed in on load)
  ({ ctx, p } = await setup(b, { init: () => { window.SpeechRecognition = window.webkitSpeechRecognition = class { start(){ window.__srStarted = true; setTimeout(() => { this.onresult && this.onresult({ results: [Object.assign([{ transcript: 'بنادول' }], { isFinal: true })] }); this.onend && this.onend(); }, 50); } stop(){} }; } }));
  await p.goto('https://app.test/#voice'); await p.waitForTimeout(300); await p.click('#gateBtn'); await p.waitForTimeout(600);
  console.log('voice: started', await p.evaluate(() => !!window.__srStarted), '| toast:', await p.textContent('#toast'), '| hash:', await p.evaluate(() => location.hash));
  console.log('errors3:', p.errs);
  await b.close();
})();
