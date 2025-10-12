// utils.js
export const isGH = location.hostname.endsWith('github.io');
export function repoPrefix() {
  if (!isGH) return '/';
  const parts = location.pathname.split('/').filter(Boolean);
  return parts.length ? '/' + parts[0] + '/' : '/';
}
export const $  = (s, c=document) => c.querySelector(s);
export const $$ = (s, c=document) => Array.from(c.querySelectorAll(s));
export const clamp01 = v => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0.25));
export const isAbs = u => /^([a-z]+:)?\/\//i.test(u) || u.startsWith('/');
export function join(base, rel){
  if (isAbs(rel)) return rel;
  return base.replace(/\/+$/,'') + '/' + rel.replace(/^\/+/,'').replace(/^\.\//,'');
}
export const fmtTime = sec => (!isFinite(sec)||sec<0) ? '—' :
  `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(Math.floor(sec%60)).padStart(2,'0')}`;

export function corsWrap(proxy, u){
  if (!u) return '';
  if (!proxy) return u;
  return proxy.includes('?') ? (proxy + encodeURIComponent(u))
                             : (proxy.replace(/\/+$/,'') + '/' + u);
}
export function normalizeNow(s){
  if (!s) return '';
  const txt = s.replace(/\s+/g,' ').trim();
  const m = txt.split(' - ');
  if (m.length >= 2) {
    const artist = m.shift();
    const title  = m.join(' - ');
    return `${artist} - ${title}`;
  }
  return txt;
}
