# Bit-Monitor

Lightweight Bitcoin / Lightning monitor.

**Version:** 0.1.0-alpha  
**License:** MIT  
**Author:** [0xdeadbeef] of ZZX-Labs R&D

The browser edition supports a configurable Esplora/mempool-compatible HTTP API. Default:

```text
https://mempool.space/api
```

Public data:

```text
chain tip height
mempool summary
recommended fee bands
endpoint latency
```

Node-specific Bitcoin Core and LND data are intentionally not connected with embedded frontend RPC credentials. Use provider adapters:

```javascript
BitMonitor.registerNodeProvider(async () => ({
  chain: "main",
  blocks: 900000,
  headers: 900000,
  verificationProgress: 1,
  peers: 12,
  uptimeSeconds: 123456
}));

BitMonitor.registerLightningProvider(async () => ({
  alias: "node",
  channels: 12,
  peers: 20,
  localBalanceSats: 1234567
}));
```

You can also import sanitized JSON snapshots.

Deploy directly into:

```text
/projects/software/bit-monitor/
```

If the site CSP blocks remote fetches, permit your selected API origin in `connect-src` or point the source at a same-origin mirror.
