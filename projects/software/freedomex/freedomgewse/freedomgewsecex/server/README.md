# FreedomX reference server

This is a local educational/reference server for the web project.

It demonstrates market-domain separation, Bitcoin-only pair validation, secret-field rejection, centralized CEX matching or DEX peer-offer routing, and noncustodial settlement-plan generation.

It does **not**:

- hold private keys;
- connect to a Bitcoin wallet;
- broadcast transactions;
- accept banking credentials;
- hold user balances;
- implement real KYC;
- act as a production exchange.

Run in a disposable development environment:

```bash
python -m venv .venv
python -m pip install -r requirements.txt
python app.py
```

Do not expose this development server to the public Internet as a money service.
