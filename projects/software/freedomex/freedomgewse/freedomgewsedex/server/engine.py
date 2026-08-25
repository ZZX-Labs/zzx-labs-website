from dataclasses import dataclass, asdict
from hashlib import sha256
from json import dumps
from uuid import uuid4

def digest(obj):
    return sha256(dumps(obj, sort_keys=True, separators=(",", ":")).encode()).hexdigest()

@dataclass
class Order:
    id: str
    seq: int
    owner: str
    side: str
    pair: str
    price: float
    qty: float
    remaining: float
    status: str = "open"

class CentralOrderBook:
    def __init__(self):
        self.seq = 0
        self.orders = []
        self.trades = []

    def add(self, owner, side, pair, price, qty):
        self.seq += 1
        o = Order(str(uuid4()), self.seq, owner, side, pair, float(price), float(qty), float(qty))
        self.orders.append(o)
        self.match()
        return {**asdict(o), "intent_hash": digest(asdict(o))}

    def match(self):
        bids = sorted([o for o in self.orders if o.side == "buy" and o.status == "open"], key=lambda o:(-o.price,o.seq))
        asks = sorted([o for o in self.orders if o.side == "sell" and o.status == "open"], key=lambda o:(o.price,o.seq))
        while bids and asks and bids[0].price >= asks[0].price:
            b,s=bids[0],asks[0]
            qty=min(b.remaining,s.remaining)
            price=s.price if s.seq < b.seq else b.price
            t={"id":str(uuid4()),"pair":b.pair,"price":price,"btc_qty":qty,"buyer":b.owner,"seller":s.owner,"settlement":"noncustodial-pending"}
            self.trades.insert(0,t)
            b.remaining-=qty;s.remaining-=qty
            if b.remaining <= 1e-12: b.remaining=0;b.status="filled";bids.pop(0)
            if s.remaining <= 1e-12: s.remaining=0;s.status="filled";asks.pop(0)

class PeerOfferBook:
    def __init__(self):
        self.offers=[]

    def add(self, maker, side, pair, price, qty, rail="onchain-psbt", relay="relay-1"):
        o={"id":str(uuid4()),"maker":maker,"side":side,"pair":pair,"price":float(price),"qty":float(qty),"remaining":float(qty),"rail":rail,"relay":relay,"status":"open"}
        o["offer_hash"]=digest(o);self.offers.append(o);return o

    def route(self, side, qty, max_peers=6):
        qty=float(qty);opp="sell" if side=="buy" else "buy"
        c=sorted([o for o in self.offers if o["side"]==opp and o["status"]=="open"], key=lambda o:o["price"], reverse=(side=="sell"))
        rem=qty;notional=0;legs=[]
        for o in c:
            if rem<=1e-12 or len(legs)>=max_peers: break
            q=min(rem,o["remaining"]);legs.append({"offer":o["id"],"maker":o["maker"],"price":o["price"],"btc_qty":q,"rail":o["rail"],"relay":o["relay"]});notional+=q*o["price"];rem-=q
        filled=qty-rem
        return {"side":side,"requested_btc":qty,"filled_btc":filled,"unfilled_btc":max(0,rem),"average_price":notional/filled if filled else 0,"legs":legs}
