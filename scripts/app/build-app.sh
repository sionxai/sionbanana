#!/usr/bin/env bash

set -Eeuo pipefail

APP_NAME="SionBanana"
APP_BUNDLE="build/${APP_NAME}.app"
CONTENTS_DIR="${APP_BUNDLE}/Contents"
MACOS_DIR="${CONTENTS_DIR}/MacOS"
RESOURCES_DIR="${CONTENTS_DIR}/Resources"
EXECUTABLE_SRC="scripts/app/SionBanana"
PLIST_SRC="scripts/app/Info.plist"
ICON_SRC="data/refs/fantasy-visual-bible/02_국기상징/03_봉황문장.png"
ICON_NAME="appicon.icns"
ICON_WORK_DIR="build/sionbanana-iconbuild-tmp"
SYSTEM_PATH="/usr/bin:/bin:/usr/sbin:/sbin"

tmp_dir=""

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

cleanup() {
  if [ -n "$tmp_dir" ] && [ -d "$tmp_dir" ]; then
    rm -rf "$tmp_dir"
  fi
}

on_error() {
  local line="$1"
  local command="$2"
  printf 'ERROR: build failed at line %s: %s\n' "$line" "$command" >&2
  exit 1
}

require_file() {
  local path="$1"
  [ -f "$path" ] || die "missing required file: $path"
}

run_system_tool() {
  env -i PATH="$SYSTEM_PATH" TMPDIR="${TMPDIR:-/tmp}" "$@"
}

build_icns_fallback() {
  local source_iconset="$1"
  local output_icns="$2"

  [ -x /usr/bin/perl ] || die "iconutil failed and /usr/bin/perl is unavailable for ICNS fallback"

  /usr/bin/perl - "$source_iconset" "$output_icns" <<'PERL'
use strict;
use warnings;

my ($dir, $out) = @ARGV;
my @entries = (
  ["icp4", "icon_16x16.png"],
  ["icp5", "icon_32x32.png"],
  ["icp6", "icon_32x32\@2x.png"],
  ["ic07", "icon_128x128.png"],
  ["ic08", "icon_256x256.png"],
  ["ic09", "icon_512x512.png"],
  ["ic10", "icon_512x512\@2x.png"],
);

my $body = "";
for my $entry (@entries) {
  my ($type, $name) = @$entry;
  my $path = "$dir/$name";
  open my $fh, "<:raw", $path or die "open $path: $!\n";
  local $/;
  my $data = <$fh>;
  close $fh or die "close $path: $!\n";
  $body .= $type . pack("N", length($data) + 8) . $data;
}

open my $outfh, ">:raw", $out or die "open $out: $!\n";
print {$outfh} "icns", pack("N", length($body) + 8), $body or die "write $out: $!\n";
close $outfh or die "close $out: $!\n";
PERL
}

make_icon() {
  local output_name="$1"
  local size="$2"

  run_system_tool /usr/bin/sips -z "$size" "$size" "$normalized_icon" --out "${raw_iconset_dir}/${output_name}" >/dev/null
}

trap cleanup EXIT
trap 'on_error "$LINENO" "$BASH_COMMAND"' ERR

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
cd "$repo_root"

require_file "$EXECUTABLE_SRC"
require_file "$PLIST_SRC"
require_file "$ICON_SRC"

plutil -lint "$PLIST_SRC" >/dev/null

rm -rf "$APP_BUNDLE" "$ICON_WORK_DIR"
mkdir -p "$MACOS_DIR" "$RESOURCES_DIR"

cp "$EXECUTABLE_SRC" "${MACOS_DIR}/${APP_NAME}"
chmod 755 "${MACOS_DIR}/${APP_NAME}"
cp "$PLIST_SRC" "${CONTENTS_DIR}/Info.plist"

tmp_dir="$ICON_WORK_DIR"
raw_iconset_dir="${tmp_dir}/raw.iconset"
iconset_dir="${tmp_dir}/appicon.iconset"
normalized_icon="${tmp_dir}/appicon-source.png"
mkdir -p "$raw_iconset_dir" "$iconset_dir"

width="$(run_system_tool /usr/bin/sips -g pixelWidth "$ICON_SRC" | awk '/pixelWidth/ {print $2}')"
height="$(run_system_tool /usr/bin/sips -g pixelHeight "$ICON_SRC" | awk '/pixelHeight/ {print $2}')"

if ! [[ "$width" =~ ^[0-9]+$ ]] || ! [[ "$height" =~ ^[0-9]+$ ]]; then
  die "could not read icon dimensions from: $ICON_SRC"
fi

if [ "$width" -eq "$height" ]; then
  cp "$ICON_SRC" "$normalized_icon"
else
  if [ "$width" -lt "$height" ]; then
    side="$width"
  else
    side="$height"
  fi

  run_system_tool /usr/bin/sips --cropToHeightWidth "$side" "$side" "$ICON_SRC" --out "$normalized_icon" >/dev/null
fi

make_icon "icon_16x16.png" 16
make_icon "icon_16x16@2x.png" 32
make_icon "icon_32x32.png" 32
make_icon "icon_32x32@2x.png" 64
make_icon "icon_128x128.png" 128
make_icon "icon_128x128@2x.png" 256
make_icon "icon_256x256.png" 256
make_icon "icon_256x256@2x.png" 512
make_icon "icon_512x512.png" 512
make_icon "icon_512x512@2x.png" 1024

for icon_file in "$raw_iconset_dir"/*.png; do
  cp "$icon_file" "${iconset_dir}/${icon_file##*/}"
done

iconutil_error="${tmp_dir}/iconutil.err"
if ! run_system_tool /usr/bin/iconutil -c icns "$iconset_dir" -o "${RESOURCES_DIR}/${ICON_NAME}" 2>"$iconutil_error"; then
  printf 'WARN: iconutil failed; using direct ICNS packing fallback.\n' >&2
  sed 's/^/WARN: iconutil: /' "$iconutil_error" >&2
  # TODO: Remove this fallback if iconutil stops rejecting valid iconsets in managed bash environments.
  build_icns_fallback "$iconset_dir" "${RESOURCES_DIR}/${ICON_NAME}"
fi

printf '%s\n' "${repo_root}/${APP_BUNDLE}"
