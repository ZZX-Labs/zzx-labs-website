# ScopeZ

`/projects/software/scopez/`

ScopeZ is the parent suite for the sixteen existing Scope programs.

The suite currently contains:

- **IdentityScope** — `/projects/software/scopez/identityscope/`
- **EmailScope** — `/projects/software/scopez/emailscope/`
- **IPScope** — `/projects/software/scopez/ipscope/`
- **MACScope** — `/projects/software/scopez/macscope/`
- **TelecomScope** — `/projects/software/scopez/telecomscope/`
- **GeoScope** — `/projects/software/scopez/geoscope/`
- **BitcoinScope** — `/projects/software/scopez/bitcoinscope/`
- **DomainScope** — `/projects/software/scopez/domainscope/`
- **UserScope** — `/projects/software/scopez/userscope/`
- **DeviceScope** — `/projects/software/scopez/devicescope/`
- **NetScope** — `/projects/software/scopez/netscope/`
- **TimeScope** — `/projects/software/scopez/timescope/`
- **BehaviorScope** — `/projects/software/scopez/behaviorscope/`
- **LinkScope** — `/projects/software/scopez/linkscope/`
- **DataScope** — `/projects/software/scopez/datascope/`
- **SignalScope** — `/projects/software/scopez/signalscope/`

## Purpose

ScopeZ gives the family one canonical namespace and top-level directory instead of leaving sixteen related applications scattered directly under `/projects/software/`.

## Root functionality

The ScopeZ root provides:

- searchable/filterable suite directory;
- suite relationship visualization;
- workflow builder;
- JSON workflow export;
- research/authorization rules;
- migration map for all old routes.

## Safety and interpretation

Many Scope tools are probabilistic analysis systems. Correlation is not proof of identity, location, ownership, or wrongdoing.

Use public, licensed, owner-provided, internal, or otherwise authorized data. Preserve provenance and independently verify high-consequence conclusions.

## Deployment

Deploy this root into:

`/projects/software/scopez/`

Then move each existing Scope child directory beneath it using `MIGRATION.md`.

`scopez-children.json` contains the complete normalized child manifest used by the web page.
