from engine import CentralOrderBook, PeerOfferBook
from security import require_pair, reject_secret_fields

def test_cex_match():
    b=CentralOrderBook()
    b.add("buyer","buy","BTC/USD",100,1)
    b.add("seller","sell","BTC/USD",99,.4)
    assert len(b.trades)==1
    assert abs(b.trades[0]["btc_qty"]-.4)<1e-12

def test_dex_route():
    b=PeerOfferBook()
    b.add("a","sell","BTC/USD",100,.5)
    b.add("b","sell","BTC/USD",101,.5)
    r=b.route("buy",.7)
    assert abs(r["filled_btc"]-.7)<1e-12
    assert len(r["legs"])==2

def test_altcoin_rejected():
    try:
        require_pair("ETH/USD","US")
    except ValueError:
        return
    raise AssertionError("altcoin pair must be rejected")

def test_secret_fields_rejected():
    try:
        reject_secret_fields({"seed_phrase":"do not accept"})
    except ValueError:
        return
    raise AssertionError("secret fields must be rejected")
