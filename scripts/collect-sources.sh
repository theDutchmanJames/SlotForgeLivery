#!/usr/bin/env bash
# Supply corresponding source alongside the exact binary release, including submodules.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
mkdir -p source-assets vendor/sources
node scripts/download-converter-source.cjs
cp vendor/sources/ghostscript-10.08.0.tar.xz source-assets/
git clone --no-checkout https://github.com/ArtifexSoftware/mupdf.git vendor/sources/mupdf
git -C vendor/sources/mupdf checkout --detach 20061bd45183f5a2bff8f43675e4da91e5ac2901
git -C vendor/sources/mupdf submodule update --init --recursive --depth 1
node -e 'const p=require("./vendor/sources/mupdf/platform/wasm/package.json");if(p.version!==require("./package.json").dependencies.mupdf)throw Error("MuPDF source/package mismatch");'
git -C vendor/sources/mupdf submodule status --recursive > source-assets/MUPDF-SOURCE-REVISIONS.txt
tar --exclude='.git' -czf source-assets/mupdf-1.28.1-complete-source.tar.gz -C vendor/sources mupdf
git archive --format=tar --prefix=SlotForgeLivery-source/ HEAD | gzip > source-assets/SlotForgeLivery-source.tar.gz
cp docs/BUILDING.md source-assets/BUILDING.md
cd source-assets
sha256sum *.tar.* BUILDING.md MUPDF-SOURCE-REVISIONS.txt > SHA256SUMS-sources.txt
