// /inspiration/figures/modules/grid.js
export function inferGridColsVisible(cards) {
  const visible = cards.filter(c => c.offsetParent !== null);
  if (!visible.length) return 1;

  // Try reading the grid’s computed template (most reliable)
  const parent = visible[0].parentElement;
  if (parent) {
    const cs = getComputedStyle(parent);
    if (cs.display.includes('grid')) {
      const gtc = cs.gridTemplateColumns; // resolved values (repeat() expanded)
      if (gtc && gtc !== 'none') {
        const count = gtc.trim().split(/\s+/).filter(Boolean).length;
        if (count > 0) return count;
      }
    }
  }

  // Fallback: count items in the first row using rounded rect tops
  const rowTop = Math.round(visible[0].getBoundingClientRect().top);
  let cols = 0;
  for (const el of visible) {
    const t = Math.round(el.getBoundingClientRect().top);
    if (t !== rowTop) break;
    cols++;
  }
  if (cols > 0) return cols;

  // Extra fallback: distinct lefts on that row (handles odd layout quirks)
  const lefts = new Set();
  for (const el of visible) {
    const r = el.getBoundingClientRect();
    if (Math.round(r.top) !== rowTop) break;
    lefts.add(Math.round(r.left));
  }
  return Math.max(lefts.size || 1, 1);
}
