<div align="center">
<img src="logo.png" alt="beef's RNGs" width="240" height="240">

# beef's RNGs

RNG implementations, entropy collectors, bias tests, test vectors, and reproducible audit logs.

**Version:** 0.2.0-alpha  
**License:** MIT  
**Author:** [0xdeadbeef] of ZZX-Labs R&D

</div>


## Browser edition

Secure random output comes from:

```javascript
crypto.getRandomValues()
```

The deterministic test-vector stream uses:

```text
HMAC-SHA256(seed, counter || context)
```

and is explicitly labeled as a reproducible test/audit stream rather than the browser CSPRNG.

Available diagnostics:

```text
monobit balance
byte-frequency chi-square
serial correlation
runs diagnostic
```

These are quick diagnostics rather than replacements for complete statistical suites such as NIST STS, Dieharder, or PractRand.

## Entropy collector

The browser can hash:

```text
optional user text
local file bytes
fresh Web Crypto bytes
previous pool state
```

and reduce the combined material into a SHA-256 audit pool.

Source files are never modified.

## Deployment

Extract directly into:

```text
/projects/software/beefs-rngs/
```

## JavaScript API

```javascript
window.BeefsRNGs
BeefsRNGs.randomBytes(n)
BeefsRNGs.hmacStream(seed, context, count)
BeefsRNGs.test(bytes)
BeefsRNGs.getAudit()
BeefsRNGs.getState()
```
