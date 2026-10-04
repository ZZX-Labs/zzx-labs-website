# WordHarvest

`/projects/software/wordharvest/`

Deterministic wordlist harvesting and balancing system for building large controlled vocabularies (ZZX-108K) and deriving Diceware lists (ZZX-7776) from document corpora using a strict space-delimited token model. Designed for offline-first auditing, controlled distribution, and reproducible list partitioning workflows.

The browser and included native CLI implement deterministic token harvesting, frequency auditing, seeded stable partitioning into the ZZX-108K target vocabulary, and derivation of a 7,776-entry five-dice wordlist.

A corpus with fewer than 108,000 qualifying unique tokens remains partial rather than being padded with invented words.

Version: `1.0.0`
License: `MIT`
