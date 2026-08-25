import json, os
from flask import Flask, jsonify, request
from security import reject_secret_fields, require_pair
from engine import CentralOrderBook, PeerOfferBook
from settlement import create_settlement, validate_psbt_policy_description

REGION="US"
MODE="CEX"
PAIR="BTC/USD"

app=Flask(__name__)
market=CentralOrderBook() if MODE=="CEX" else PeerOfferBook()

def payload():
    data=request.get_json(force=True, silent=False)
    reject_secret_fields(data)
    return data

@app.get("/api/v1/health")
def health():
    return jsonify({"ok":True,"region":REGION,"mode":MODE,"pair":PAIR,"bitcoin_only":True,"custody":"noncustodial","broadcast_enabled":False})

@app.get("/api/v1/book")
def book():
    if MODE=="CEX":
        return jsonify({"orders":[o.__dict__ for o in market.orders],"trades":market.trades})
    return jsonify({"offers":market.offers})

@app.post("/api/v1/order-intents")
def order_intents():
    if MODE!="CEX": return jsonify({"error":"CEX endpoint unavailable in DEX build"}),405
    d=payload();require_pair(d.get("pair"),REGION)
    return jsonify(market.add(d.get("owner","client"),d["side"],PAIR,d["price"],d["btc_qty"])),201

@app.post("/api/v1/offers")
def offers():
    if MODE!="DEX": return jsonify({"error":"DEX endpoint unavailable in CEX build"}),405
    d=payload();require_pair(d.get("pair"),REGION)
    return jsonify(market.add(d.get("maker","peer"),d["side"],PAIR,d["price"],d["btc_qty"],d.get("rail","onchain-psbt"),d.get("relay","relay-1"))),201

@app.post("/api/v1/route")
def route():
    if MODE!="DEX": return jsonify({"error":"route endpoint unavailable in CEX build"}),405
    d=payload();require_pair(d.get("pair"),REGION)
    return jsonify(market.route(d["side"],d["btc_qty"],int(d.get("max_peers",6))))

@app.post("/api/v1/settlement-plan")
def settlement_plan():
    d=payload()
    return jsonify(create_settlement(d["trade"],REGION,MODE)),201

@app.get("/api/v1/psbt-policy")
def psbt_policy():
    return jsonify(validate_psbt_policy_description())

if __name__=="__main__":
    app.run(host="127.0.0.1",port=int(os.environ.get("PORT","8080")),debug=False)
