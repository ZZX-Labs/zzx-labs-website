#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
printf '%s\n' "ZZX-TAS controlled bootstrap"
printf '%s\n' "Review package list before continuing."
PACKAGES=(python python-pip git curl ffmpeg)
printf 'Packages: %s\n' "${PACKAGES[*]}"
printf '%s' "Install these packages? [y/N] "
read -r ans
case "$ans" in
  y|Y) pkg update && pkg install "${PACKAGES[@]}" ;;
  *) printf '%s\n' "Cancelled." ;;
esac
