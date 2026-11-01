#!/usr/bin/env bash
# Build an offline EPS converter with its resources compiled into the executable.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
root="$PWD"
node scripts/download-converter-source.cjs
mkdir -p vendor/build vendor/ghostscript/bin vendor/ghostscript/doc
build_dir="$(mktemp -d "$root/vendor/build/gs.XXXXXX")"
tar -xf vendor/sources/ghostscript-10.08.0.tar.xz -C "$build_dir"
cd "$build_dir/ghostscript-10.08.0"
./configure --without-x --disable-cups --disable-gtk --disable-dbus \
  --disable-fontconfig --without-libidn --without-libiconv --without-tesseract
make -j2
cp bin/gs "$root/vendor/ghostscript/bin/gs"
cp LICENSE "$root/vendor/ghostscript/doc/COPYING"
chmod 755 "$root/vendor/ghostscript/bin/gs"
"$root/vendor/ghostscript/bin/gs" --version
# Reject accidental dependencies on libraries installed only on the build runner.
if [[ "$(uname -s)" == Darwin ]]; then
  otool -L "$root/vendor/ghostscript/bin/gs"
  if otool -L "$root/vendor/ghostscript/bin/gs" | tail -n +2 | grep -Ev '^[[:space:]]*(/usr/lib/|/System/Library/)' ; then
    echo 'Converter links a non-system library; refuse to package it.' >&2; exit 1
  fi
else
  ldd "$root/vendor/ghostscript/bin/gs"
  if ldd "$root/vendor/ghostscript/bin/gs" | grep -E 'not found|/usr/local/|/opt/'; then
    echo 'Converter has a missing or runner-local dependency.' >&2; exit 1
  fi
fi
