# MempoolSpecs

`/projects/software/mempoolspecs/`

MempoolSpecs is a visualization engine modeled after mempool.space, providing real-time Bitcoin mempool goggles with fee tiers, transaction age, and propagation heatmaps.

## Browser implementation

The web page provides:

- Bitcoin-only synthetic or imported mempool snapshots;
- next-block packing by fee rate;
- color-coded transaction tiles;
- transaction click/hover details;
- fee percentiles/tier estimates;
- transaction age display;
- deterministic propagation-heat visualization;
- JSON import/export.

The static page does not pretend to be connected to the live Bitcoin network. A production ZZX-Labs deployment should feed live mempool and propagation data from its own backend/full node services.

## Native stack

The manifest defines Flask, requests, Plotly, pandas, and Python for the full service/backend.

Version: `0.3.0-alpha`  
License: `MIT`
