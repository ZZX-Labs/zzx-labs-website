# FreedomX Defense Architecture

## Security objective

FreedomX asks: what remains possible if one employee, phone, workstation, service account, or web server is fully compromised?

The acceptable answer is: **not enough authority to steal customer Bitcoin, rewrite root policy, publish a trusted malicious build, or erase the only audit history.**

## Noncustodial customer Bitcoin

FreedomX never receives seed phrases, private keys, xprvs, wallet passwords, or recovery material. There is no customer-withdrawal hot wallet. A matched trade produces a settlement commitment; Bitcoin signing happens in the user's wallet.

## CEX versus DEX

### CEX
The CEX centralizes order admission, sequencing, matching, market data, compliance state, and surveillance. It does **not** centralize custody.

### DEX
The DEX distributes peer offers through relays and lets clients construct routes across counterparties. It has no exchange wallet and no singular matching authority.

## Bitcoin-only boundary

Supported cryptocurrency: BTC only.

- U.S. reference pair: BTC/USD
- Canadian reference pair: BTC/CAD

No ERC-20 tokens, stablecoins, bridges, wrapped assets, or altcoin RPC/wallet implementations belong in the FreedomX core.

## Settlement commitments

Every settlement commitment should bind the trade ID, pair, BTC quantity, quote quantity, fee schedule, rail, destination script/address commitment, change policy, expiry, network, coordinator identity, and client intent hashes. Any change requires a new commitment and fresh user approval.

## PSBT policy

A wallet should independently verify network, inputs, all outputs, exact receive amount, explicit service fee, miner fee range, change destination, script type, trade ID, and expiry before signing. The coordinator never asks for a seed.

## Lightning policy

User-side Lightning belongs in a user-controlled wallet or narrowly scoped adapter. The exchange website must never ask for a user's macaroon or seed. Operator Lightning infrastructure, if any, belongs in a separate trust domain with remote signing, scoped macaroons, rate limits, and independent monitoring.

## No singular operator authority

High-risk actions require independent approvals, including changes to settlement policy, fee destinations, release trust, compliance bypasses, incident mode, and root recovery. The demo uses 3-of-5 roles; production should use hardware-backed approval systems.

## Device separation

General-purpose phones are not root signing devices. High-risk approval devices should avoid normal email/social use, SMS recovery, and universal password-manager access; display the exact action; require local presence; and support independent revocation.

## Build and release security

Use pinned dependencies, SBOMs, reproducible builds, signed tags, signed release artifacts, multi-person release review, protected branches, CI isolated from production trust roots, deterministic migrations, provenance statements, and emergency revocation.

## Audit

Security-sensitive operations create append-only events replicated to an independently administered sink. The main application compromise must not be enough to rewrite the only audit history.

## Database

The database may contain order intents, matches, policy state, settlement commitments, compliance metadata, and audit references. It must not contain raw private keys or recovery seeds. Reconcile internal state against independently observable Bitcoin/payment evidence.

## Identity

Use phishing-resistant hardware authentication, short-lived privileged sessions, a separate admin origin, step-up authentication, session revocation, and recovery that cannot collapse multi-party authority into one identity provider.

## Recovery

Root recovery should require multiple people, offline verification, time delay, notice to existing approvers, immutable recovery audit, and an emergency freeze path. Email/SMS alone must not restore root authority.

## Incident modes

- Normal
- Elevated logging / step-up authentication
- Settlement pause
- Read-only market
- Recovery mode

A settlement pause is safer in a noncustodial system because user Bitcoin remains in user wallets.

## Supply chain

Assume any one source account, CI worker, dependency registry, developer laptop, DNS account, or CDN account can be compromised. No single component should be enough to publish a trusted production client.

## Fiat/payment separation

A payment confirmation and a Bitcoin-signing decision are separate security events. Bank/payment credentials and Bitcoin operational authority belong in different domains.

## Privacy

Collect the minimum legally required identity data. Isolate identity data from market telemetry where possible. Do not expose public wallet identifiers more broadly than necessary.

## Mandatory security tests

Test authorization boundaries, replay protection, order-intent tampering, settlement-output substitution, fee substitution, stale quote replay, CSRF, session theft, quorum/recovery bypass, malicious release handling, backup restore, node/RPC failure, malformed PSBT, Lightning invoice mismatch, price-feed divergence, audit-sink failure, and database rollback.

## Red-team questions

- What if one admin phone is fully compromised?
- What if CI is malicious?
- What if DNS is malicious?
- What if the database lies?
- What if the user-facing server is root-compromised?
- What if one signer is coerced?
- What if one backup administrator is malicious?
- What if an attacker is willing to destroy money merely to prove control?

If any one answer is “all customer Bitcoin can be stolen,” the architecture is unacceptable.
