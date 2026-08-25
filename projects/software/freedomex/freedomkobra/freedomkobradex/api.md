# FreedomX Reference API

The reference API never accepts seed phrases, private keys, xprvs, wallet passwords, Lightning seeds/macaroons, or exchange hot-wallet keys.

## CEX: POST /v1/order-intents
```json
{"pair":"BTC/USD","side":"buy","type":"limit","price":"84000.00","btc_quantity":"0.05000000","client_alias":"opaque-id","expires_at":"ISO-8601","client_intent_signature":"external-identity-signature"}
```

## DEX: POST /v1/offers
```json
{"pair":"BTC/CAD","side":"sell","price":"115000.00","btc_quantity":"0.05000000","settlement_rail":"onchain-psbt","relay":"relay-1","expiry_seconds":3600,"offer_signature":"external-peer-signature"}
```

## GET /v1/book
Returns bids/asks or peer offers. No wallet secrets.

## POST /v1/route
DEX route selection across offers.

## POST /v1/settlements
Creates a trade-bound settlement commitment.

## POST /v1/settlements/{id}/psbt
Accepts a PSBT or reference produced by an authorized native adapter. Production validation must reject unexpected outputs, network, fees, scripts, and amounts. The website does not sign.

## POST /v1/operator-actions
High-risk actions require quorum authorization. A single admin boolean is insufficient.

## Audit
Every accepted state transition emits an immutable event identifier.
