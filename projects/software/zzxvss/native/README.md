# ZZX-VSS native helpers

- `crypto_vault.py`: AES-256-GCM local encrypted envelope builder.
- `age_gate.py`: deterministic 18+/21+ calculation from a supplied DOB.
- `face_verify.py`: optional consent-based 1:1 comparison of two operator-supplied images.

The face helper does not identify unknown people, search a gallery, estimate age,
or issue a legal/compliance decision. All results require human review.
