# BHOPAL Calc

Cannabinoid-content, formulation, terpene-ratio, and extraction-yield calculator.

**Version:** 0.1.0  
**License:** MIT  
**Author:** [0xdeadbeef] of ZZX-Labs R&D

The browser edition provides:

- THCA/THC and CBDA/CBD potential-active calculations using a 0.877 acid-to-neutral mass factor.
- User-configurable process recovery.
- Portion concentration arithmetic.
- Extraction mass-balance estimates.
- Terpene-profile normalization.
- Batch comparison.
- JSON report export.

All values are calculations based on user-supplied assumptions. They do not replace verified laboratory measurements, regulatory labeling, or individualized medical advice.

Deploy directly into:

```text
/projects/software/bhopal-calc/
```

API:

```javascript
window.BhopalCalc
BhopalCalc.potency(options)
BhopalCalc.servings(thcMg, cbdMg, count)
BhopalCalc.extraction(options)
BhopalCalc.terpeneProfile(values)
BhopalCalc.getState()
```
