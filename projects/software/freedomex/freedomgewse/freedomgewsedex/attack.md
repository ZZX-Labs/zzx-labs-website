# Predatory Sparrow / NoBitEx Attack Notes

## Purpose

This is a defensive case study for exchange engineers. It is not an offensive playbook.

## Source status

External web search was unavailable when this package was generated. The project brief says Predatory Sparrow attacked NoBitEx, that NoBitEx source code was made public, and that the campaign context included Sepah Bank. It also supplies approximate BTC/non-BTC loss figures and alleges privileged/keyholder phone compromise with intelligence/operational support. Those incident-specific figures and mechanisms are **not independently verified here**.

Do not cite this document as a definitive incident history until the footnote queue is replaced with verified sources.

## Why the incident matters

An exchange is not only a website. It is an identity system, privileged-administrator system, release pipeline, settlement engine, financial ledger, payment integration, customer database, communications system, and public-trust system. A destructive adversary can combine several planes at once.

The FreedomX lesson is architectural: **one compromised person, phone, workstation, CI credential, application server, or signer must never be enough to create exchange-wide irreversible authority.**

## Attack planes

### Identity and recovery
Privileged accounts can be compromised through phishing, push fatigue, SIM swap, recovery-channel abuse, stolen sessions, compromised email, coerced support processes, or physical access. Recovery is therefore part of the security perimeter.

### Administrator endpoints
A compromised developer or administrator workstation may expose browser sessions, SSH agents, API tokens, password-manager access, source credentials, chat history, release credentials, or operational context.

### Signing and custody
A private key can be protected in hardware yet still be abused if the surrounding authorization path can be tricked into signing an attacker-selected transaction. The security question is not only whether a key can be extracted but whether a legitimate signer can be induced to authorize the wrong state.

### Application and API
Authentication bypass, authorization mistakes, replay, race conditions, object-reference flaws, settlement-logic bugs, and administrative API exposure can turn a web compromise into financial authority.

### Accounting
An attacker can cause losses without stealing a private key by modifying balances, payment state, destination data, fees, settlement status, or reconciliation records.

### Source/build/release
Public source is not itself a security failure. Security should assume the attacker knows the software. The real risks are secrets in repositories, malicious dependencies, compromised CI, unsigned releases, unsafe deployment scripts, and undocumented administrative paths.

### Infrastructure
DNS, CDN, cloud accounts, orchestration, backups, monitoring, secrets managers, and time services can be leveraged to redirect users, distribute malicious builds, destroy evidence, or prolong outages.

### Banking/payment rails
BTC/USD and BTC/CAD systems also depend on fiat/payment confirmation. Bank-facing credentials and exchange operational credentials should live in separate trust domains.

### Information operations
A destructive attacker may optimize for embarrassment, political signaling, or public proof of control rather than profit. Source publication, irreversible burn transactions, timed disclosures, and public claims can be part of the impact.

## The privileged-phone scenario

Even if the exact historical NoBitEx technique remains to be verified, the project brief's keyholder-phone scenario is an excellent threat model. FreedomX assumes a privileged employee phone can be fully compromised.

That phone therefore must not be sufficient to:

- move customer Bitcoin;
- approve a production settlement-policy change;
- rotate root trust;
- bypass quorum;
- publish a trusted release;
- recover several other approvers;
- change fee destinations;
- disable the only audit sink.

## Why Bitcoin-only matters

Every additional chain multiplies node software, key libraries, signing code, withdrawal queues, address formats, hot wallets, monitoring logic, dependencies, and operational expertise requirements. FreedomX removes that multi-chain surface entirely.

## Prevention lessons

The following controls address the classes of failure highlighted by the case study, without claiming any single control would have stopped the historical incident:

1. Eliminate customer-asset custody.
2. Eliminate singular privileged signers.
3. Keep wallet signing in user-controlled software/hardware.
4. Bind exact settlement outputs, fees, expiry, and trade identifiers.
5. Treat mobile phones as communications devices, not root authorities.
6. Use independent hardware-backed operator approvals.
7. Make recovery multi-party and delayed.
8. Keep CI away from production signing material.
9. Use signed, reproducible releases.
10. Replicate append-only audit evidence to an independent trust domain.
11. Separate DNS, source hosting, deployment authority, and emergency recovery.
12. Use BTC-only infrastructure to reduce signing and node complexity.
13. Provide explicit incident modes that halt matching/settlement without taking user funds.
14. Reconcile the operational database against independently observable Bitcoin/payment-rail evidence.
15. Assume source code is public.

## How it could have been worse

### Long-dwell supply-chain compromise
Instead of announcing access, an attacker could alter client builds or settlement code and wait for months. Reproducible builds, independent release signatures, and staged deployment reduce this risk.

### Customer-identity exfiltration
Identity records and transaction history can create physical-security and coercion risks even when user private keys remain safe. Identity data should be minimized, isolated, and strongly access-controlled.

### Settlement substitution
An attacker who can replace a destination after a quote is accepted may redirect funds without learning a seed. User wallets should independently verify transaction commitments before signing.

### Accounting corruption
A falsified ledger may cause later legitimate systems to make wrong decisions. Independent reconciliation and event-sourced audit help detect divergence.

### Banking contagion
Compromising exchange and bank-facing operations together can defeat ordinary reconciliation assumptions. These systems should not share root credentials or recovery paths.

### Backup destruction
A cloud-owner compromise can erase both production and recovery evidence. Backups should be immutable, independently administered, and regularly restored in drills.

### Public-trust manipulation
Attackers can combine real leaks with modified data or false claims. Signed incident statements, public build provenance, and independently verifiable source history narrow the ambiguity.

## FreedomX removals

FreedomX deliberately removes:

- altcoin wallet fleets;
- user deposit hot wallets;
- user withdrawal private keys;
- one-person root authority;
- browser private-key entry;
- the assumption that source secrecy provides security.

## Remaining risks

Noncustodial does not mean risk-free. FreedomX still must defend order integrity, market abuse, client-build compromise, session theft, settlement-address substitution, user-device compromise, payment fraud, insider collusion, availability, privacy, and regulatory obligations.

## Footnote / verification queue

[^1]: **VERIFY** — reputable reporting identifying Predatory Sparrow and documenting the NoBitEx timeline.
[^2]: **VERIFY** — primary or reputable reporting on any NoBitEx source-code publication.
[^3]: **VERIFY** — independent chain-analysis estimate of value affected, separated by BTC and non-BTC assets.
[^4]: **VERIFY** — reputable reporting on Sepah Bank in the same campaign period.
[^5]: **VERIFY** — evidence for or against privileged/keyholder phone compromise.
[^6]: **VERIFY** — a NoBitEx technical postmortem describing initial access, privilege escalation, wallet architecture, and signing path.
[^7]: **VERIFY** — independent documentation of burn/vanity addresses, if applicable.
[^8]: **VERIFY** — provenance and legal usability of any released NoBitEx source used for future research.
