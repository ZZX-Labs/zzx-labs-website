# VLC2DiscordStatus

`/projects/software/vlc2discordstatus/`

Real-time integration between VLC media playback and Discord Rich Presence displaying track metadata, playback time, and media state.

The website workbench imports VLC `status.json` snapshots or accepts manual playback metadata, computes Rich Presence timestamps/state/details, previews the resulting payload, and exports JSON.

The deploy also includes `native/vlc2discordstatus.py`, a real local polling bridge using VLC's loopback HTTP JSON interface. Discord IPC is enabled only when `pypresence` is installed and `DISCORD_CLIENT_ID` is provided. VLC credentials are read from environment variables and are never placed in the browser page or exported payloads.

Version: `1.0.0`
License: `MIT`
