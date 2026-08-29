# ZZX-VSS

`/projects/software/zzxvss/`

Verification Security System — Age-gated verification and credential vault for 18+ and 21+ adult content ecosystems. Uses secure facial imaging scans, photo ID capture, and facial-recognition matching to verify users while storing all documents in heavily encrypted form. User verification records can only be decrypted via per-user, court-authority key signing, providing a privacy-preserving, compliance-ready verification backbone for third-party platforms.

This deployment implements a privacy-first verification workbench around the intended 18+/21+ compliance workflow without pretending that a static browser page can perform authoritative KYC. It provides deterministic age-threshold checks from an operator-entered/verified date of birth, local SHA-256 hashing of ID/selfie artifacts, explicit 1:1 verification-result recording, AES-256-GCM encrypted envelopes, dual-control release policy, authority-approval hashing, human-review gates, retention-policy output, and encrypted-envelope export.

Native helpers provide local AES-GCM envelope encryption, deterministic age-gate calculation, and optional consent-based 1:1 face verification of exactly two supplied images. There is no one-to-many identity search or facial age estimation.

The browser demo does not automatically grant court access. Any production legal/compliance deployment requires jurisdiction-specific design and legal review.

Version: `0.1.0-alpha`  
License: `MIT`
