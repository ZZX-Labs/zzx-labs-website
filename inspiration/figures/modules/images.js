// /inspiration/figures/modules/images.js
import { IMGS_DIR } from './paths.js';
import { urlJoin } from './net.js';

export function asDocUrl(pathOrName) {
  if (!pathOrName) return null;
  const s = String(pathOrName);
  if (/^(?:[a-z]+:|\/|\.{1,2}\/)/i.test(s)) return s;
  return String(urlJoin(IMGS_DIR, s));
}

export function imageCandidates(id, name, primary, legacy) {
  const titleCaseUnderscore = String(name || id)
    .trim().split(/\s|-/).filter(Boolean)
    .map(w => w[0] ? (w[0].toUpperCase()+w.slice(1)) : w)
    .join('_');

  const baseId = id.toLowerCase();
  const list = [];
  const pushFile = (fn) => { if (fn) list.push(asDocUrl(fn)); };

  pushFile(primary);
  pushFile(legacy);

  ['jpg','jpeg','png','webp'].forEach(ext => {
    pushFile(`${baseId}.${ext}`);
    pushFile(`${titleCaseUnderscore}.${ext}`);
  });

  pushFile('placeholder.jpg');

  const seen = new Set();
  return list.filter(u => { const k = String(u); if (seen.has(k)) return false; seen.add(k); return true; });
}
