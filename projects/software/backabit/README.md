<div align="center">
<img src="logo.png" alt="Astral Clock" width="240" height="240">

# BackABit

Short-term Bitcoin savings and timelock-policy planner.

**Version:** 0.1.0-alpha  
**License:** MIT  
**Author:** [0xdeadbeef] of ZZX-Labs R&D

</div>


## Browser edition

The static web edition provides recurring-savings projections, an emergency-liquid reserve split, monthly timelock ladders, CLTV/CSV Script templates, maturity simulation, JSON export/import, and local persistence.

It intentionally does **not** store private keys, sign transactions, or broadcast Bitcoin transactions.

## Deployment

Extract this archive directly into:

```text
/projects/software/backabit/
```

`logo.png` is intentionally not included. Add the final project icon later at:

```text
/projects/software/backabit/logo.png
```

The page hides the missing logo automatically until it exists.

## Files

```text
index.html
style.css
script.js
backabit.js
bitcoin-time.js
storage.js
hook.css
hook.js
manifest.json
README.md
```

## JavaScript API

```javascript
window.BackABit
BackABit.buildPlan()
BackABit.getPlan()
BackABit.save()
BackABit.clear()
```

## Bitcoin timelocks

The planner produces audit-oriented templates for:

```text
OP_CHECKLOCKTIMEVERIFY
OP_CHECKSEQUENCEVERIFY
```

Generated scripts remain planning templates and must be validated with the actual wallet/descriptor/miniscript/Bitcoin Core tooling used before funds are committed.
