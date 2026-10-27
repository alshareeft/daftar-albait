// Builds a self-contained preview of the app (dev/preview.html) that runs without Firebase:
// in-memory mocks + sample data, saved in the browser so changes survive a reload.
// Usage (from the repo root): node dev/build-preview.js
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), MOCK = path.join(__dirname, 'firebase-mocks');
const OUT = path.join(__dirname, 'preview.html');

let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// 1) Firebase modules -> plain objects (artifact pages can't import modules from gstatic)
const mods = {};
for (const f of fs.readdirSync(MOCK)) {
  let src = fs.readFileSync(path.join(MOCK, f), 'utf8');
  if (f === 'firebase-auth.js') src = src.replace('let user = null;', 'let user = { email: "preview@daftar" };');
  if (f === 'firebase-firestore.js') src = src.replace('window.__writes = (window.__writes||0)+1; fire();', 'window.__writes = (window.__writes||0)+1; fire(); __save();')
    .replace(/(async commit\(\)\{[^}]*?)fire\(\);/, '$1fire(); __save();')
    .replace('store.delete(r.path); fire();', 'store.delete(r.path); fire(); __save();')
    .replace('store.set(r.path, { ...store.get(r.path), ...clone(d) }); fire();', 'store.set(r.path, { ...store.get(r.path), ...clone(d) }); fire(); __save();');
  const names = [...src.matchAll(/export\s+(?:async\s+)?(?:function|class)\s+(\w+)/g)].map(m => m[1]);
  src = src.replace(/export\s+/g, '');
  mods[f] = `(() => { ${src}\n return { ${names.join(', ')} }; })()`;
}
const mockScript = `<script>
window.DAFTAR_CONFIG = { firebase: { apiKey: "preview", authDomain: "x", projectId: "x", appId: "x" }, appCheckSiteKey: "", ai: false, voiceLang: "ar-SA", voiceAutoAdd: true, sdkVersion: "13.1.0" };
(() => {
  const KEY = "daftar-preview-db";
  const pad = n => String(n).padStart(2, "0");
  const day = k => { const d = new Date(); d.setDate(d.getDate() + k); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
  const now = Date.now(); let n = 0;
  const it = (title, cat, extra = {}) => ["items/p" + (++n), { title, cat, date: null, pin: false, done: false, doneAt: null, priority: "normal", recur: null, createdAt: now - n * 60000, ...extra }];
  const seed = () => new Map([
    it("حليب", "super"), it("خبز", "super"), it("بيض", "super"), it("طماطم", "super"), it("رز بسمتي", "super"),
    it("بنادول", "pharma"), it("فيتامين د", "pharma", { pin: true, date: day(5) }),
    it("لمبات ليد", "tools"), it("شريط لاصق", "tools"),
    it("شماغ", "retail"),
    it("طلبية أمازون", "online", { pin: true, date: day(3) }),
    it("اتصل بالسباك", "tasks", { date: day(0), priority: "urgent" }),
    it("نظف فلتر المكيف", "tasks", { date: day(2), recur: { n: 1, unit: "month" } }),
    it("ادفع فاتورة الكهرباء", "tasks", { date: day(6) }),
    it("رتب المخزن", "tasks"),
    it("شي للبيت", "inbox"), it("هدية عيد ميلاد", "inbox"),
    it("قهوة", "super", { done: true, doneAt: now - 86400000 }),
    ["config/trips", { super: day(1), pharma: day(4) }],
    ["history/recent", { items: { "قهوه": { t: "قهوة", c: "super", n: 3, d: day(-1) }, "حليب": { t: "حليب", c: "super", n: 5, d: day(-3) }, "خبز": { t: "خبز", c: "super", n: 4, d: day(-3) } } }]
  ]);
  let db; try { const s = localStorage.getItem(KEY); if (s) db = new Map(JSON.parse(s)); } catch (e) {}
  window.__DB = db || seed();
  window.__save = () => { try { localStorage.setItem(KEY, JSON.stringify([...window.__DB])); } catch (e) {} };
  window.__resetPreview = () => { try { localStorage.removeItem(KEY); } catch (e) {} location.reload(); };
})();
window.__MOCK = {
${Object.entries(mods).map(([f, code]) => `  ${JSON.stringify(f)}: ${code}`).join(',\n')}
};
</script>`;

// 2) Swap the dynamic imports for the mocks
const before = html;
html = html.replace(/await import\(FB \+ ("[\w-]+\.js")\)/g, 'window.__MOCK[$1]');
if (html === before) throw new Error('Firebase import pattern not found — update build-preview.js');
html = html.replace('<script src="config.js"></script>', mockScript);

// 3) Strip the document shell (the artifact host adds its own) and files that aren't published
const htmlAttrs = (html.match(/<html([^>]*)>/) || [, ''])[1];
html = html.replace(/<!doctype html>\s*/i, '').replace(/<html[^>]*>\s*/, '').replace(/<\/html>\s*$/, '')
  .replace(/<\/?head>\s*/g, '').replace(/<body>\s*/, '').replace(/<\/body>\s*/, '')
  .replace(/<meta charset[^>]*>\s*/, '').replace(/<meta name="viewport"[^>]*>\s*/, '')
  .replace(/<link rel="(manifest|icon|apple-touch-icon)"[^>]*>\s*/g, '')
  .replace('<title>دفتر البيت</title>', '<title>دفتر البيت</title>');
const lang = (htmlAttrs.match(/lang="([^"]+)"/) || [, 'ar'])[1], dir = (htmlAttrs.match(/dir="([^"]+)"/) || [, 'rtl'])[1];

// 4) Preview marker: tap twice to restore the sample data
const badge = `<style>
.pv-badge{position:fixed;left:calc(8px + env(safe-area-inset-left,0px));bottom:calc(var(--pv-bottom,96px) + env(safe-area-inset-bottom,0px));z-index:65;font:500 12px/1 "IBM Plex Sans Arabic",system-ui,sans-serif;background:var(--ink);color:var(--bg);opacity:.8;border:0;border-radius:999px;padding:7px 11px;cursor:pointer}
.pv-badge.arm{background:#c92a2a;color:#fff;opacity:1}
</style>
<button class="pv-badge" id="pvBadge" type="button">معاينة · بيانات تجريبية</button>
<script>
document.documentElement.lang = ${JSON.stringify(lang)}; document.documentElement.dir = ${JSON.stringify(dir)};
(() => { const b = document.getElementById("pvBadge"); let t;
  const place = () => { const d = document.querySelector(".dock"); if (d) document.documentElement.style.setProperty("--pv-bottom", (d.offsetHeight + 8) + "px"); };
  addEventListener("load", place); addEventListener("resize", place); setTimeout(place, 500);
  b.onclick = () => { if (b.classList.contains("arm")) return window.__resetPreview();
    b.classList.add("arm"); b.textContent = "اضغط مجدداً لإعادة البيانات التجريبية";
    clearTimeout(t); t = setTimeout(() => { b.classList.remove("arm"); b.textContent = "معاينة · بيانات تجريبية"; }, 3000); };
})();
</script>
`;
html = html.trimEnd() + '\n' + badge;

fs.writeFileSync(OUT, html);
console.log('preview:', OUT, Math.round(html.length / 1024) + 'KB');
