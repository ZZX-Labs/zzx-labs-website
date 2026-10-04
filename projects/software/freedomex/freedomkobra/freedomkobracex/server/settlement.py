from hashlib import sha256
from json import dumps
from uuid import uuid4

STATES = [
    "matched",
    "quote-rail-committed",
    "bitcoin-psbt-prepared",
    "user-signatures-external",
    "policy-validated",
    "broadcast-or-lightning-settlement",
    "confirmed",
]

def create_settlement(trade, region, mode):
    body = {
        "id": str(uuid4()),
        "trade": trade,
        "region": region,
        "mode": mode,
        "asset": "BTC",
        "quote": "CAD" if region == "CA" else "USD",
        "state": STATES[0],
        "states": STATES,
        "exchange_private_keys": False,
        "withdrawal_wallet": False,
        "customer_custody": "user-controlled",
        "broadcast_enabled": False,
    }
    body["commitment_hash"] = sha256(dumps(body, sort_keys=True).encode()).hexdigest()
    return body

def validate_psbt_policy_description():
    return {
        "note": "Reference policy only; this server does not sign Bitcoin transactions.",
        "checks": [
            "network matches deployment",
            "exact trade BTC amount",
            "all outputs expected",
            "fee within policy",
            "change destination user-controlled",
            "trade commitment and expiry match",
            "no unknown outputs"
        ]
    }
