#!/usr/bin/env bash
# Install one debug APK and photograph Picks plus Last 10 against api.betspapa.com.
# Sizes are dp converted at the density below, so a 360dp phone is 945px at 420dpi.
set -euo pipefail

FLAVOR="${1:-sideload}"
OUT="${GITHUB_WORKSPACE:-/tmp}/native-qc-shots"
mkdir -p "$OUT"
adb wait-for-device
adb shell 'while [ "$(getprop sys.boot_completed)" != 1 ]; do sleep 2; done'
adb shell input keyevent 82 || true
adb shell wm dismiss-keyguard || true
# Keep the status and navigation bars on screen. Do not turn on immersive mode.
adb shell settings put global hide_error_dialogs 1 || true
adb shell settings put global policy_control null || true
adb shell settings put secure navigation_mode 0 || true
adb shell cmd overlay enable com.android.internal.systemui.navbar.threebutton || true

# Pixels for a dp size. 420 matches a current phone. The tablet uses 320 so the bitmap stays inside the runner.
px() {
  echo $(( ($1 * $2 + 80) / 160 ))
}

profile() {
  local label="$1" width_dp="$2" height_dp="$3" font="$4" density="$5"
  local width height
  width="$(px "$width_dp" "$density")"
  height="$(px "$height_dp" "$density")"
  echo "profile ${FLAVOR}-${label} ${width}x${height} density ${density} font ${font}"
  adb shell wm size "${width}x${height}"
  adb shell wm density "$density"
  adb shell settings put system font_scale "$font"
  adb shell am force-stop com.betspapa.scores || true
  sleep 2
  adb shell am instrument -w \
    -e class com.betspapa.scores.watch.AgreeQcTest \
    -e name "${FLAVOR}-${label}" \
    com.betspapa.scores.test/androidx.test.runner.AndroidJUnitRunner
  adb shell ls /sdcard/Download/betspapa-qc | tr -d '\r' | while read -r file; do
    case "$file" in
      "${FLAVOR}-${label}-"*.png) adb pull "/sdcard/Download/betspapa-qc/${file}" "$OUT/" ;;
    esac
  done
}

profile 360 360 800 1.0 420
profile 412 412 915 1.0 420
profile fold-cover 280 653 1.0 420
profile fold-inner 673 841 1.0 420
profile tablet 800 1280 1.0 320
profile landscape 915 412 1.0 420
profile font 412 915 1.3 420
# A display cutout plus the status and navigation bars, so the safe insets are on screen.
adb shell cmd overlay enable com.android.internal.display.cutout.emulation.waterfall || true
profile safe 412 915 1.0 420
adb shell cmd overlay disable com.android.internal.display.cutout.emulation.waterfall || true

adb shell wm size reset || true
adb shell wm density reset || true
adb shell settings put system font_scale 1.0 || true
echo "saved $(find "$OUT" -name "${FLAVOR}-*.png" | wc -l) screenshots"
