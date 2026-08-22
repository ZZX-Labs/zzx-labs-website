# BackInABit

Long-term Bitcoin capital-preservation and timelock-vault policy planner.

**Version:** 0.1.0-alpha  
**License:** MIT  
**Author:** [0xdeadbeef] of ZZX-Labs R&D

## Scope

The browser edition targets a 10–20 year savings horizon and provides:

```text
long-term accumulation projection
multiple absolute CLTV release epochs
multisig threshold/role documentation
cold-storage policy notes
relative CSV recovery-path templates
JSON export/import
local persistence
```

It deliberately stores no seed phrases, private keys, xprvs, or signed transactions.

## Deployment

Extract directly into:

```text
/projects/software/backinabit/
```

`logo.png` is intentionally omitted for now. Add it later at:

```text
/projects/software/backinabit/logo.png
```

## Files

```text
index.html
style.css
script.js
backinabit.js
bitcoin-time.js
storage.js
hook.css
hook.js
manifest.json
README.md
```

## API

```javascript
window.BackInABit
BackInABit.buildVault()
BackInABit.getVault()
BackInABit.save()
BackInABit.buildMultisigPolicy()
BackInABit.buildRecoveryPolicy()
```

## Important

Descriptor and Script strings emitted by the browser are documentation/planning templates. Validate production wallet policies with the actual Bitcoin wallet, miniscript/descriptor, hardware, and recovery tooling before committing funds.
