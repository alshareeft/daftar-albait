// tiny in-memory Firestore (subset) with live listeners
const store = window.__DB = window.__DB || new Map();   // path -> data
const listeners = new Set();
const deny = () => window.__DENY;
const err = () => Object.assign(new Error("denied"), { code: "permission-denied" });
const clone = o => o === undefined ? undefined : JSON.parse(JSON.stringify(o));
export function initializeFirestore(){ return {}; }
export function persistentLocalCache(){ return {}; }
export function persistentMultipleTabManager(){ return {}; }
export function getFirestore(){ return {}; }
export function doc(F, path){ return { type: "doc", path, id: path.split("/").pop() }; }
export function collection(F, path){ return { type: "col", path }; }
export function where(f, op, v){ return { f, op, v }; }
export function query(col, ...w){ return { type: "query", path: col.path, w }; }
const match = (q, d) => q.w.every(({ f, op, v }) => { const x = d[f]; if (op === "==") return x === v; if (x === null || x === undefined) return false; if (op === ">=") return x >= v; if (op === "<") return x < v; return false; });
function snapFor(t){
  if (t.type === "doc") { const d = store.get(t.path); return { id: t.id, exists: () => d !== undefined, data: () => clone(d) }; }
  const pre = t.path + "/"; const docs = [];
  for (const [p, d] of store) if (p.startsWith(pre) && !p.slice(pre.length).includes("/") && (t.type === "col" || match(t, d))) docs.push({ id: p.slice(pre.length), data: () => clone(d) });
  return { docs, forEach: f => docs.forEach(f), size: docs.length };
}
const fire = () => queueMicrotask(() => listeners.forEach(l => l.next(snapFor(l.t))));
export function onSnapshot(t, next, error){ if (deny()) { setTimeout(() => error && error(err()), 0); return () => {}; } const l = { t, next }; listeners.add(l); setTimeout(() => next(snapFor(t)), 0); return () => listeners.delete(l); }
const deepMerge = (a, b) => { const o = { ...(a || {}) }; for (const k in b) o[k] = (b[k] && typeof b[k] === "object" && !Array.isArray(b[k]) && o[k] && typeof o[k] === "object") ? deepMerge(o[k], b[k]) : b[k]; return o; };
export async function setDoc(r, d, opt){ if (deny()) throw err(); store.set(r.path, opt && opt.merge ? deepMerge(store.get(r.path), clone(d)) : clone(d)); window.__writes = (window.__writes||0)+1; fire(); }
export async function updateDoc(r, d){ if (deny()) throw err(); if (!store.has(r.path)) throw Object.assign(new Error("nf"), { code: "not-found" }); store.set(r.path, { ...store.get(r.path), ...clone(d) }); fire(); }
export async function deleteDoc(r){ if (deny()) throw err(); store.delete(r.path); fire(); }
export async function getDoc(r){ if (deny()) throw err(); return snapFor(r); }
export async function getDocs(q){ if (deny()) throw err(); return snapFor(q); }
export function writeBatch(){ const ops = []; return { set: (r, d) => ops.push([r, d]), async commit(){ for (const [r, d] of ops) store.set(r.path, clone(d)); fire(); } }; }
