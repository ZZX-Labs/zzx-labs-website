// /inspiration/figures/modules/state.js
export const state = {
  palette: [],
  figures: [],
  urls: {},
  urlIndex: {},
  cards: {},
  nodes: [], // { id, el }

  // stability & bookkeeping
  orderSeed: null,                 // shuffle seed used this page load
  colors: Object.create(null),     // id -> hex (kept across interactions)
  booted: false
};
