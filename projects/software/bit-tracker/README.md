# Bit-Tracker

Bitcoin address, UTXO, and transaction tracker.

**Version:** 0.1.0-alpha  
**License:** MIT  
**Author:** [0xdeadbeef] of ZZX-Labs R&D

Browser features:

```text
public address watchlist
labels / categories / notes
address chain + mempool summary
UTXO lookup
transaction lookup
localStorage persistence
JSON / CSV audit trails
configurable Esplora/mempool API
```

Default source:

```text
https://mempool.space/api
```

For privacy-sensitive investigations, use a self-hosted API source. Third-party blockchain APIs can observe which public addresses and transaction IDs you request.

Never enter:

```text
seed phrases
private keys
xprvs
wallet passwords
RPC credentials
```

Deploy directly into:

```text
/projects/software/bit-tracker/
```

API:

```javascript
window.BitTracker
BitTracker.validateAddress(address)
BitTracker.add(address, label, notes)
BitTracker.refreshAddress(address)
BitTracker.lookupTx()
BitTracker.getWatchlist()
BitTracker.getAudit()
BitTracker.getState()
```
