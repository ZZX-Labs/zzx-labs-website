

<div align="center">
<img src="logo.png" alt="BitBurn" width="240" height="240">
   
# BitBurn


Bitcoin effective-value estimator given a range of **lost / inaccessible** coin.


**Version:** 0.1.0-alpha  
**License:** MIT  
**Author:** [0xdeadbeef] of ZZX-Labs R&D  
**Language:** Python 3.11+


## What it does

- Fetches live **spot price (USD)** and **circulating supply**  
- Sweeps a user-defined **lost BTC** range `[min..max]` in `step` increments  
- Computes **effective supply** and **adjusted price** = `spot * (circ / (circ - lost))`  
- Outputs an updating **table** (GUI) or **terminal** (CLI), with CSV export


## Install

```bash
python -m venv .venv && . .venv/bin/activate  # (or .venv\Scripts\activate on Windows)
pip install -r requirements.txt
```

## Run (GUI)

`python bitburn.py gui`
`# options: --provider auto|coingecko|coinbase|binance|bitstamp|zzx  --min 0 --max 6000000 --step 50000`

To prefer your own price/supply API (ZZX BitAvg), export:

`export BITBURN_ZZX_BITAVG_URL="https://zzx-labs.io/bittechin/bittick/api/bitcoin/price"`

## Expected JSON:

`{"price_usd": 67890.12, "supply_circulating": 19765432.10}`

## Run (CLI)

`python bitburn.py cli --min 0 --max 6000000 --step 50000 --units btc --csv bitburn.csv`

## Math

Adjusted price for estimated lost L:

S_eff = max(S_circ - L, ε)
P_adj = P_spot * (S_circ / S_eff)


---

## Directory layout

```
bitburn/
├─ bitburn.py
├─ requirements.txt
├─ README.md
└─ src/
   ├─ core.py
   ├─ quote.py
   ├─ estimator.py
   ├─ cli.py
   ├─ gui.py
   ├─ filemenu.py
   ├─ statusbar.py
   └─ util.py
```


---

## Notes

Providers: CoinGecko, Coinbase(+Blockchain.info supply), Binance(+Blockchain.info), Bitstamp(+Blockchain.info), or ZZX (custom).

If live providers fail, last cached quote is used (~/.bitburn_cache.json).


---

## Usage quickstart

- **GUI**: `python bitburn.py gui` → tweak Min/Max/Step → Refresh  
- **CLI**: `python bitburn.py cli --min 0 --max 6000000 --step 100000 --csv out.csv`

