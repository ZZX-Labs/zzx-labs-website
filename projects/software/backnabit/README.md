# BackNABit

Mid-term Bitcoin savings and staged timelock planner.

**Version:** 0.1.0-alpha  
**License:** MIT  
**Author:** [0xdeadbeef] of ZZX-Labs R&D

## Current web scope

This web edition follows the current short/mid/long family split:

```text
BackABit    short term
BackNABit   mid term
BackInABit  long term
```

BackNABit models 12–60 month recurring accumulation, an operating-liquidity buffer, staged quarterly/semiannual/annual maturity tranches, and CLTV/CSV policy templates.

It does not hold keys, sign transactions, or broadcast transactions.

## Deployment

Extract directly into:

```text
/projects/software/backnabit/
```

`logo.png` is intentionally omitted for now. Add it later at:

```text
/projects/software/backnabit/logo.png
```

## Files

```text
index.html
style.css
script.js
backnabit.js
bitcoin-time.js
storage.js
hook.css
hook.js
manifest.json
README.md
```

## API

```javascript
window.BackNABit
BackNABit.buildPlan()
BackNABit.getPlan()
BackNABit.save()
```
