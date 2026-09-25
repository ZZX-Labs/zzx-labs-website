# ZZX BPI resident live service

The 2.5-second BPI feed is a resident service, not a GitHub cron job. GitHub-hosted schedules cannot execute every few seconds and are not a perpetual process. `.github/workflows/zzx-bpi-crawler.yml` remains the overlapping hosted continuity/checkpoint tier; `.github/workflows/bpi-resident.yml` installs and restarts the actual 24/7 collector on the BPI host.

Configure a Linux x64 self-hosted GitHub Actions runner on the BPI server and add the runner label `zzx-bpi`. The runner account needs passwordless `sudo` for `rsync`, `install`, `chown`, `chmod`, `systemctl`, and `journalctl`. The workflow deploys to `/srv/zzx-labs`, installs `server/systemd/zzx-bpi.service`, enables it, restarts it, and observes the generated API snapshots long enough to verify repeated updates.

Normal exchange polling is clamped to 2500-5000 ms. The default is 2500 ms. All enabled provider definitions with an adapter and a `price_volume_url` are polled concurrently. An exchange that explicitly returns HTTP 429 with `Retry-After` is allowed to back off beyond five seconds; this is intentional upstream rate-limit compliance. Provider discovery also runs concurrently so the 30-minute discovery refresh cannot serially block the price loop.

The live widget contract is the mutable same-origin tree under `/bitcoin/bpi/api/`. Nginx serves that tree with `Cache-Control: no-store`, while `latest.json`, `markets.json`, and `provider_health.json` are atomically replaced by the resident collector. `latest.json` publishes both weighted and unweighted BPI values from the same acquisition cycle, including the BitAvg-compatible `weighted_average` object.
