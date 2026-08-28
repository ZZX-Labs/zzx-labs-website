# Native VLC2DiscordStatus bridge

Environment variables:

- `VLC_HTTP_URL` — defaults to `http://127.0.0.1:8080/`
- `VLC_HTTP_PASSWORD` — VLC HTTP interface password; never hard-code it
- `DISCORD_CLIENT_ID` — Discord application client ID
- `VLC2DISCORD_POLL` — polling interval, default `1.0`

Install:

```bash
python -m pip install requests pypresence
python vlc2discordstatus.py
```

If `pypresence` or `DISCORD_CLIENT_ID` is unavailable, the bridge stays in JSON preview mode rather than pretending Discord was updated.
