FORBIDDEN_SECRET_FIELDS = {
    "seed", "seed_phrase", "mnemonic", "private_key", "privateKey", "xprv",
    "wallet_password", "walletPassword", "macaroon", "root_ssh_key",
    "hotwallet_key", "exchange_hotwallet_key"
}

def reject_secret_fields(payload):
    if not isinstance(payload, dict):
        return
    bad = sorted(set(payload) & FORBIDDEN_SECRET_FIELDS)
    if bad:
        raise ValueError("Forbidden secret fields: " + ", ".join(bad))

def require_pair(pair, region):
    expected = "BTC/CAD" if region == "CA" else "BTC/USD"
    if str(pair).upper().replace(" ", "") != expected:
        raise ValueError(f"Bitcoin-only build: allowed pair is {expected}")
    return expected
