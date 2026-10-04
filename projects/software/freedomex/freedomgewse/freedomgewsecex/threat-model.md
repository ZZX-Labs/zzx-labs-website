# FreedomX Threat Model

## Adversaries
Financial criminals, hacktivists, destructive state-capable actors, malicious/coerced insiders, compromised developers, supply-chain attackers, fraud rings, abusive users, and opportunistic internet attackers. The adversary may understand the source code.

## Assets
Trade integrity, settlement commitments, user privacy, authentication state, administrative authority, source/release integrity, market availability, audit history, payment-rail integrity, and incident communications. Customer private keys are intentionally not exchange-held assets.

## Catastrophic events
A single administrator can move everything; a malicious release steals secrets; destination substitution; database rewrite causes false settlement; quorum or recovery bypass; audit destruction; malicious CI reaches production trust roots; spoofed payment confirmation; mass identity-data disclosure.

## Security invariants
1. No customer seed/private key enters FreedomX.
2. No user withdrawal depends on an exchange private key.
3. No single employee authorizes root trust changes.
4. BTC is the only cryptocurrency.
5. Settlement is bound to an explicit commitment.
6. A malicious web server alone cannot manufacture a user Bitcoin signature.
7. Release trust is independently verifiable.
8. Audit evidence survives compromise of the main app database.
9. Recovery cannot reduce multi-party authority to one person.
10. Nation branding does not substitute for regulatory review.

## Static website scope
No production wallet signing, banking credentials, real KYC documents, live order execution, Bitcoin broadcast, Lightning secrets, or production HSM integration.
