// /inspiration/figures/modules/grid.js
export function inferGridColsVisible(cards) {
  const visible = cards.filter(c => c.offsetParent !== null);
  if (!visible.length) return 1;
  const firstTop = visible[0].offsetTop;
  let cols = 0;
  for (const c of visible) {
    if (c.offsetTop !== firstTop) break;
    cols++;
  }
  return Math.max(cols, 1);
}
