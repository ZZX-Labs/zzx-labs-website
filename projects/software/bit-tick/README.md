# Bit-Tick

Bitcoin price ticker.

**Version:** 0.1.0-alpha  
**License:** MIT  
**Author:** [0xdeadbeef] of ZZX-Labs R&D

Default browser price source:

```text
https://mempool.space/api/v1/prices
```

Features:

```text
multi-fiat display
manual / automatic refresh
local observation history
Canvas chart
BTC ↔ sats ↔ fiat conversion
CSV history export
custom provider hook
subscriber callback API
```

No exchange credentials, trading, custody, or wallet access are used.

Deploy directly into:

```text
/projects/software/bit-tick/
```

API:

```javascript
window.BitTick
BitTick.refresh()
BitTick.getPrice(currency)
BitTick.convert(amount, from, to, currency)
BitTick.subscribe(callback)
BitTick.registerProvider(async () => ({USD: 100000, EUR: 90000}))
BitTick.getState()
```
