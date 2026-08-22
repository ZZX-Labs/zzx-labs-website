<div align="center">
<img src="logo.png" alt="AIPDABE" width="240" height="240">

# AIPDABE


Bitcoin block, transaction, address, mempool, UTXO-flow, and analytic-assistant research workbench.


**Version:** 0.1.0-alpha  
**License:** MIT  
**Author:** [0xdeadbeef] of ZZX-Labs R&D  
**Language:** Python 3.11+ / PyQt5 / Flask · JavaScript / Canvas / Esplora


## What it does

- Looks up Bitcoin **transactions**
- Resolves transaction **confirmation status**
- Looks up Bitcoin **blocks by hash**
- Resolves Bitcoin **blocks by height**
- Loads Bitcoin **address chain statistics**
- Loads address **UTXOs**
- Loads live public **mempool statistics**
- Loads recommended **fee-rate bands**
- Calculates transaction input/output totals and fee information
- Visualizes **UTXO flow** as inputs → transaction → outputs
- Produces local human-readable transaction, block, address, and mempool summaries
- Answers deterministic questions about the currently loaded Bitcoin object
- Detects simple structural features such as `OP_RETURN` and very small outputs
- Supports a separately registered external assistant/model provider
- Supports optional Bitcoin Core access through a **read-only server-side RPC proxy**
- Imports captured Bitcoin JSON for offline/reproducible analysis
- Exports the current object, graph, analyst history, or entire workspace as JSON


## Install

### Native Python Edition

```bash
python -m venv .venv && . .venv/bin/activate
# Windows:
# .venv\Scripts\activate

pip install pyqt5 requests matplotlib pandas sqlalchemy flask gunicorn
```

If the native repository provides a `requirements.txt`, prefer:

```bash
pip install -r requirements.txt
```

### Web Edition

No JavaScript package installation is required.

Serve the directory:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```


## Run (Web)

Deploy or serve:

```text
/projects/software/aipdabe/
```

The browser workbench contains:

```text
Explorer
Mempool Intelligence
UTXO Flow
Analyst
Data Providers
JSON Import / Export
```


## Explorer

The Explorer supports:

```text
transaction ID
block height
block hash
Bitcoin address
chain tip
```

The default public provider is:

```text
https://mempool.space/api
```

A different Esplora-compatible base URL can be configured from the Data Providers tab.


## Transaction Analysis

An Esplora-style transaction object contains:

```text
txid
version
locktime
vin[]
vout[]
size
weight
fee
status
```

AIPDABE calculates:

```text
number of inputs
number of outputs
known input value
output value
fee
approximate virtual size
approximate sat/vB fee rate
confirmation state
OP_RETURN count
```


## Fee Calculation

For a non-coinbase transaction where all input values are known:

```text
fee =
Σ input values
-
Σ output values
```

Approximate virtual size:

```text
vsize ≈ weight / 4
```

Approximate fee rate:

```text
fee_rate =
fee_satoshis
────────────
vsize
```


## Address Analysis

For an address summary:

```text
confirmed balance =
funded_txo_sum
-
spent_txo_sum
```

AIPDABE also reports:

```text
confirmed transaction count
mempool transaction count
current UTXO count
UTXO values
UTXO confirmation status
```


## Mempool Intelligence

The browser requests:

```text
/api/mempool
/api/v1/fees/recommended
```

and displays:

```text
transaction count
virtual size
aggregate fees
fastest fee
half-hour fee
hour fee
economy fee
minimum fee
```

The built-in congestion description is a simple local threshold model, not a prediction of future blocks.


## UTXO Flow

The transaction graph renders:

```text
INPUT UTXOs
     ↓
 TRANSACTION
     ↓
OUTPUT UTXOs
```

Edge width scales approximately with output/input value.

The visualization is implemented with browser Canvas and does not require an external graph library.


## Analyst

The built-in Analyst is deterministic and local.

It can answer questions about:

```text
summary
fees
fee rate
inputs
outputs
UTXOs
confirmation state
address balance
mempool fees
simple structural flags
```

The local analyst does not pretend to be a trained language model.

An external assistant/model provider can be registered through the public API when desired.


## External Assistant Provider

Register a provider:

```javascript
AIPDABE.registerAssistantProvider(async ({ question, context, history }) => {
  return "custom response";
});
```

Remove it:

```javascript
AIPDABE.registerAssistantProvider(null);
```

This allows the project to connect to a local model, internal service, or another approved inference backend without changing the page shell.


## Bitcoin Core RPC

Do **not** put Bitcoin Core RPC credentials directly into browser JavaScript.

The web edition supports a separately deployed read-only proxy:

```text
browser
  ↓
read-only HTTPS proxy
  ↓
Bitcoin Core RPC
```

The proxy can accept requests such as:

```json
{
  "jsonrpc": "2.0",
  "id": "aipdabe-...",
  "method": "getblockchaininfo",
  "params": []
}
```

The browser does not store the node's RPC username/password.


## JSON Import / Export

AIPDABE can import captured JSON for offline analysis.

Recognized structures include:

```text
Esplora transaction
block object / block bundle
address bundle
mempool + fees bundle
chain-tip object
```

Workspace export includes:

```text
configured provider
current object
mempool snapshot
UTXO graph
analyst history
```


---

## Directory layout

```text
aipdabe/
├─ index.html
├─ style.css
├─ script.js
├─ aipdabe.js
├─ bitcoin-api.js
├─ utxo-graph.js
├─ analyst.js
├─ hook.css
├─ hook.js
├─ manifest.json
├─ README.md
└─ logo.png
```


---

## JavaScript API

The primary browser module is:

```javascript
window.AIPDABE
```

Core methods:

```javascript
AIPDABE.setEsploraBase(url)

AIPDABE.getTransaction(txid)
AIPDABE.getBlock(hash)
AIPDABE.getBlockByHeight(height)
AIPDABE.getAddress(address)
AIPDABE.getMempool()

AIPDABE.analyze(type, data)
AIPDABE.ask(question)

AIPDABE.registerAssistantProvider(provider)

AIPDABE.graphTransaction(tx)
AIPDABE.getState()
```

Network access is implemented by:

```javascript
window.AIPDABEBitcoinAPI
```

UTXO graph rendering is implemented by:

```javascript
window.AIPDABEUTXOGraph
```

Local analysis is implemented by:

```javascript
window.AIPDABEAnalyst
```


---

## Security

The web edition is read-only.

It does not request:

```text
wallet.dat
private keys
seed phrases
wallet passwords
Bitcoin Core RPC passwords
exchange API secrets
```

Public provider responses and imported JSON are treated as untrusted data.

Dynamic text is rendered using DOM `textContent` or JSON serialization rather than inserted as executable HTML.


---

## Notes

Public Esplora providers may enforce:

```text
rate limits
CORS policy
availability limits
historical-data limits
```

For reliable internal use, point AIPDABE at a self-hosted Esplora-compatible endpoint.

For private full-node access, use a dedicated server-side read-only RPC proxy rather than exposing Bitcoin Core RPC credentials to the browser.


---

## Usage quickstart

- **Transaction**: `Explorer` → `Transaction ID` → paste txid → `ANALYZE`
- **Block height**: choose `Block height` → enter height → `ANALYZE`
- **Address**: choose `Address` → paste address → `ANALYZE`
- **Tip**: `LOAD CHAIN TIP`
- **Mempool**: `Mempool Intelligence` → `REFRESH MEMPOOL`
- **UTXO graph**: load a transaction → `UTXO Flow` → `GRAPH CURRENT TX`
- **Analyst**: load data → `Analyst` → ask a question
- **Provider**: `Data Providers` → set Esplora base URL → `APPLY`
- **Offline JSON**: `JSON Import / Export` → import or paste captured JSON
