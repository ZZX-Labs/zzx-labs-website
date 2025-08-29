// /inspiration/figures/modules/net.js
export async function j(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.json();
}
export function urlJoin(dir, name) { return new URL(name, dir); }
