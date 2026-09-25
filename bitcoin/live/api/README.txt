ZZX live-data runtime directory.

Runtime files are atomically replaced by tools/live/live_data_daemon.py:
  mempool.json    5 s resident cadence
  mining.json     15 s resident cadence
  lightning.json  15 s resident cadence
  status.json     250 ms daemon health heartbeat

`observed_at` is the ZZX poll/observation time. `source_updated_at` is retained
separately when an upstream publishes its own timestamp. Git is a seed/checkpoint;
the production systemd service is the authoritative live writer.
