#!/usr/bin/env bash
# Usage: source scripts/signing-env.sh legacy|upload [secrets_dir]
# Exports the BETSPAPA_* signing variables from the owner's secrets folder without printing them.
#   legacy → original app signing key (GitHub APK, keeps in-place upgrades)
#   upload → Play upload key (Play bundles only)
kind="${1:-legacy}"
dir="${2:-/home/box/secrets/betspapa-play}"
case "$kind" in
  legacy) store="$dir/legacy-release.keystore"; pass="$dir/legacy-keystore-password.txt"; alias="$dir/legacy-key-alias.txt" ;;
  upload) store="$dir/upload.keystore"; pass="$dir/upload-keystore-password.txt"; alias="$dir/upload-key-alias.txt" ;;
  *) echo "kind must be legacy or upload" >&2; return 1 2>/dev/null || exit 1 ;;
esac
for file in "$store" "$pass" "$alias"; do
  [ -f "$file" ] || { echo "missing $file" >&2; return 1 2>/dev/null || exit 1; }
done
export BETSPAPA_STORE_FILE="$store"
export BETSPAPA_STORE_PASSWORD="$(cat "$pass")"
export BETSPAPA_KEY_ALIAS="$(cat "$alias")"
unset BETSPAPA_KEY_PASSWORD
echo "Signing with the $kind key."
