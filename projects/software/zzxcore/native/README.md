# ZZX-Core native reference service

Container-free by design.

```bash
python -m pip install -r requirements.txt
export ZZXCORE_CONFIG=stack.json
python app.py
```

The reference API reads a local service registry and exposes status/registry endpoints. It does not accept shell commands, credentials, or remote-execution instructions.
