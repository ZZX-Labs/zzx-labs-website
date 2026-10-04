# CyberChef Attribution

The published `/cyberchef/` and `/cyberchef/app/` runtimes are built from the official GCHQ CyberChef release selected at deployment time. The default selector is `latest`, resolved from the official `gchq/CyberChef` GitHub Releases API on every scheduled/default build.

CyberChef is developed by GCHQ and its contributors:
https://github.com/gchq/CyberChef

Official hosted version:
https://gchq.github.io/CyberChef/

The exact release tag, release asset URL, upstream entrypoint, and downloaded archive SHA-256 for each ZZX deployment are recorded in `/cyberchef/runtime-manifest.json`.

`/cyberchef/app/` is copied from the upstream distribution without the ZZX overlay. `/cyberchef/` uses the same upstream distribution and adds ZZX-Labs presentation and recipe-helper assets after the original CyberChef assets; upstream notices and release files remain present.
