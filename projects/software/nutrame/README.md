# NutraMe

`/projects/software/nutrame/`

NutraMe is an offline-first nutrition intake ledger for calories, macros, sugars, supplements, and label-photo assisted logging with privacy-first analytics and exports.

## Browser implementation

NutraMe's static web companion provides:

- local meal logging;
- calories, protein, carbohydrates, fat, sugar, fiber, and sodium;
- serving multiplication;
- daily summaries;
- supplement records;
- local label-photo preview;
- JSON and CSV export.

The browser does not pretend to perform OCR on nutrition labels. The native application can integrate a separately validated vision/OCR pipeline.

The manifest-native project uses Python, PyQt5, NumPy, Matplotlib, and cryptography.

Version: `0.1.0-alpha`  
License: `MIT`
