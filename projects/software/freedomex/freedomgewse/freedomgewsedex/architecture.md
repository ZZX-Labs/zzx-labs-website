# FreedomGewseDEX Architecture

## Identity
- Family: FreedomGewse
- Region: Canada
- Market model: DEX
- Crypto asset: BTC only
- Quote unit: CAD
- Pair: BTC/CAD
- Customer custody: none
- Exchange-held user private keys: never
- Version: 0.3.0-alpha

## Design origin
FreedomX is a clean research/reference implementation informed by the project brief's study of NoBitEx and the Predatory Sparrow case. No NoBitEx source tree was supplied to this build environment, so this repository does **not** claim literal source parity or direct derivation from leaked code.

## DEX model
The DEX distributes peer offers through relays and lets clients construct routes across counterparties; there is no exchange wallet or singular matching authority.

## Matching boundary
Peer offers are hash-committed and relayed. Clients select counterparties/routes. Relays coordinate discovery but never custody BTC.

## Settlement
A match creates a settlement commitment. On-chain settlement is modeled through PSBT and user-wallet verification/signing. Lightning similarly belongs in the user wallet or a narrowly scoped adapter. The web lab never requests or stores private keys.

## No withdrawal subsystem
There is no pooled customer BTC balance, user-deposit hot wallet, withdrawal queue, or withdrawal private key because the exchange never takes custody.

## Security control plane
High-risk actions require quorum. The demo uses 3-of-5 role approval; production should use independent hardware-backed approvals.

## Regulatory boundary
This software does not grant authority to operate an exchange. Production operators must determine and satisfy applicable licensing/registration, AML/KYC, sanctions, consumer protection, privacy, tax, banking, money-transmission, and securities/derivatives obligations.

## Nation scope
This is the official FreedomX Canada port. Other countries require separately reviewed local ports if they want FreedomX certification. “Official” means project-network approval only, not government endorsement.
