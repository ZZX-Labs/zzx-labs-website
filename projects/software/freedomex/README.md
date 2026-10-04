# FreedomEx

FreedomEx—Freedom Ex(change)—is the parent project page for the ZZX-Labs R&D FreedomX Bitcoin-exchange research network. It routes visitors to four national and architectural editions:

| Edition | Jurisdiction | Coordination | Research market | Canonical child path |
|---|---|---|---|---|
| FreedomGewseCEX | Canada | Central order book and matcher | BTC/CAD | `./freedomgewse/cex/` |
| FreedomGewseDEX | Canada | Federated offer discovery | BTC/CAD | `./freedomgewse/dex/` |
| FreedomKobraCEX | United States | Central order book and matcher | BTC/USD | `./freedomkobra/cex/` |
| FreedomKobraDEX | United States | Federated offer discovery | BTC/USD | `./freedomkobra/dex/` |

All four editions are Bitcoin-only and noncustodial. “CEX” means centralized coordination, policy, sequencing and matching—not centralized possession of participant keys. “DEX” means replaceable offer relays and direct peer settlement. Neither model permits an operator, relay, employee phone, administrator session or optional mediator to spend participant Bitcoin alone.

## Installation

Copy the files in this package into:

```text
projects/software/freedomex/
```

The existing child directories must remain immediately below that directory:

```text
projects/software/freedomex/
├── index.html
├── style.css
├── freedomex.css
├── hook.css
├── hook.js
├── script.js
├── freedomex-data.js
├── freedomex.js
├── manifest.json
├── README.md
├── logo.png
├── freedomgewse/
│   ├── cex/
│   └── dex/
└── freedomkobra/
    ├── cex/
    └── dex/
```

The package deliberately contains only the parent-page files and does not overwrite the four existing child editions.

## Runtime

No build step or package manager is required. Serve the directory through the ZZX-Labs site or a local HTTP server:

```sh
python3 -m http.server 8080
```

The parent page reads its four immutable edition records from `freedomex-data.js`. `freedomex.js` renders and filters the cards. The only persisted browser state is the visitor’s jurisdiction and coordination filter. There are no accounts, wallet calls, exchange requests, deposits, keys or live market data.

## Standardized shell

`style.css`, `hook.css` and `hook.js` use the same ZZX-Labs project-page shell as the FreedomGewse and FreedomKobra editions. `freedomex.css` contains only parent-page components. The page optionally consumes `/static/styles.css` and `/static/script.js` from the host site while retaining a functional local shell when those assets are absent.

## Research and legal boundary

FreedomEx is a navigation and architecture page. The detailed Nobitex/Predatory Sparrow reports, defensive controls, license, brand policy and commercial terms remain inside each edition directory. The page contains no leaked Nobitex source and is not a production exchange, wallet, legal opinion, financial registration or security certification.

The FreedomX license conditions described by the child editions impose branding, attribution, territory and field-of-use restrictions. The suite is therefore source-available software, not OSI-approved open source.

## Release

- Version: 1.0.0
- Canonical path: `/projects/software/freedomex/`
- Product role: parent gateway and architecture index
- Assets: Bitcoin only
- Fiat research models: CAD and USD
- Live execution: disabled
- Custody: none
