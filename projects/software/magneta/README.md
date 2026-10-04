# Magneta

`/projects/software/magneta/`

Magneta is an all-in-one secure data sanitization tool implementing ATA/NVMe secure erase and multi-pass crypto overwrites with verifiable reports for forensic-grade data destruction.

## Web adaptation

The browser project is a safety-first planning and reporting interface. It can:

- classify media type;
- select an appropriate sanitation strategy;
- estimate duration;
- produce an explicit confirmation challenge;
- display a safe execution workflow;
- simulate verification records;
- export a sanitation plan.

It deliberately **does not erase host devices or invoke ATA/NVMe commands from the browser**.

## Native implementation guidance

The manifest defines Python/PyQt5 and cryptography dependencies. A native Magneta build should implement controller-native ATA/NVMe sanitize paths where supported and use overwrite workflows only where appropriate for the media.

The native application should always verify exact device identity and prevent accidental system-disk erasure.

Version: `0.2.0-alpha`  
License: `MIT`
