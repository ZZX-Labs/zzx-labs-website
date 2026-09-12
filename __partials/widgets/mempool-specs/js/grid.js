// __partials/widgets/mempool-specs/js/grid.js
// v5 — DPR-aware square/grid geometry
(function(){
  "use strict";

  const W=window;
  const NS=(W.ZZXMempoolSpecs=W.ZZXMempoolSpecs||{});
  if(NS.Grid?.__version>=5)return;

  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const int=(n,d=0)=>Math.round(Number.isFinite(Number(n))?Number(n):d);

  function ensureCanvas(canvas,minCssH=220){
    const dpr=Math.max(1,Math.min(3,W.devicePixelRatio||1));
    const rect=canvas?.getBoundingClientRect?.()||{};
    const cssW=Math.max(1,Math.floor(rect.width||canvas?.clientWidth||320));
    const cssH=Math.max(minCssH,Math.floor(rect.height||canvas?.clientHeight||minCssH));
    const wantW=Math.max(1,Math.floor(cssW*dpr));
    const wantH=Math.max(1,Math.floor(cssH*dpr));
    const changed=canvas.width!==wantW||canvas.height!==wantH;
    if(changed){canvas.width=wantW;canvas.height=wantH}
    return {cssW,cssH,dpr,changed};
  }

  function spanPx(cells,cellPx,gapPx){
    const c=Math.max(1,Math.floor(cells||1));
    return c*cellPx+Math.max(0,c-1)*gapPx;
  }

  function makeGrid(canvas,opts={}){
    const minCssH=Number.isFinite(opts.minCssH)?opts.minCssH:220;
    const cellCss=Number.isFinite(opts.cellCss)?opts.cellCss:6;
    const gapCss=Number.isFinite(opts.gapCss)?opts.gapCss:1;
    const padCss=Number.isFinite(opts.padCss)?opts.padCss:8;

    const sized=ensureCanvas(canvas,minCssH);
    const cellPx=Math.max(1,int(cellCss*sized.dpr));
    const gapPx=Math.max(0,int(gapCss*sized.dpr));
    const padPx=Math.max(0,int(padCss*sized.dpr));
    const Wpx=canvas.width,Hpx=canvas.height;
    const innerW=Math.max(1,Wpx-padPx*2);
    const innerH=Math.max(1,Hpx-padPx*2);
    const step=cellPx+gapPx;

    const cols=clamp(Math.floor((innerW+gapPx)/step),8,4096);
    const rows=clamp(Math.floor((innerH+gapPx)/step),8,4096);
    const usableW=spanPx(cols,cellPx,gapPx);
    const usableH=spanPx(rows,cellPx,gapPx);

    const x0=padPx+Math.max(0,Math.floor((innerW-usableW)/2));
    const y0=padPx+Math.max(0,Math.floor((innerH-usableH)/2));

    return {
      ...sized,
      W:Wpx,H:Hpx,
      padPx,cellPx,gapPx,step,
      cols,rows,x0,y0,
      spanPx:cells=>spanPx(cells,cellPx,gapPx)
    };
  }

  function signature(grid){
    if(!grid)return "";
    return `${grid.cols}x${grid.rows}@${grid.cellPx}/${grid.gapPx}/${grid.padPx}/${grid.dpr}`;
  }

  function cellToPx(grid,cx,cy){
    return {x:grid.x0+cx*grid.step,y:grid.y0+cy*grid.step};
  }

  function rectToPx(grid,x,y,w,h){
    const p=cellToPx(grid,x,y);
    return {x:p.x,y:p.y,w:grid.spanPx(w),h:grid.spanPx(h)};
  }

  function normalizedToCell(grid,nx,ny){
    return {
      x:clamp(Math.floor(nx*grid.cols),0,grid.cols-1),
      y:clamp(Math.floor(ny*grid.rows),0,grid.rows-1)
    };
  }

  NS.Grid=Object.freeze({
    __version:5,
    ensureCanvas,
    makeGrid,
    signature,
    cellToPx,
    rectToPx,
    normalizedToCell
  });
})();
