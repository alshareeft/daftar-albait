export function getAI(){ return {}; }
export class GoogleAIBackend {}
export function getGenerativeModel(){ return { async generateContent(p){ window.__aiPrompts = (window.__aiPrompts||[]).concat(p); const m = p.match(/العنصر: «(.+?)»/); const t = m ? m[1] : ""; const cat = /غاز|صداع/.test(t) ? (/صداع/.test(t) ? "pharma" : "tasks") : "inbox"; return { response: { text: () => JSON.stringify({ cat, title: /صداع/.test(t) ? "مسكن للصداع" : t }) } }; } }; }
