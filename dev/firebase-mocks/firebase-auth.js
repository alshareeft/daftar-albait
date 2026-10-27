let user = null; const subs = [];
const emit = () => subs.forEach(f => f(user));
export function getAuth(){ return { get currentUser(){ return user; } }; }
export class GoogleAuthProvider { setCustomParameters(){} }
export async function signInWithPopup(){ user = { email: window.__TEST_EMAIL || "talal@example.com" }; setTimeout(emit, 10); }
export async function signInWithRedirect(){}
export async function getRedirectResult(){ return null; }
export function onAuthStateChanged(a, f){ subs.push(f); setTimeout(() => f(user), 30); return () => {}; }
export async function signOut(){ user = null; emit(); }
