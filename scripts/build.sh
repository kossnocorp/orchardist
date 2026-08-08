#!/usr/bin/env bash

# This script builds the extension for Visual Studio Code.

source "$(dirname "$0")/_package_env.sh"


echo "🚧 Building Visual Studio Code extension..."
echo

rm -rf "$pkg_dist_dir"
mkdir -p "$pkg_dist_dir"

echo -e "\n🌀 Building extension bundle..."
if ! output=$(pnpm exec vite build 2>&1); then

	echo '╭─ 🔴 `vite build` failed ─────────────────────────╮'
	echo "$output"
	echo "╰───────────────────────────────────────────────────╯"
	exit 1
fi

echo "🟢 Bundle built"

echo -e "\n🌀 Copying assets..."

if ! output=$(rsync -av \
	--include='package.json' \
	--include='*.md' \
	--include='assets/' \
	--include='assets/*.png' \
	--include='shell/' \
	--include='shell/*' \
	--exclude='*' \
	. "$pkg_dist_dir/" 2>&1); then

	echo '╭─ 🔴 `rsync` failed ──────────────────────────────╮'
	echo "$output"
	echo "╰───────────────────────────────────────────────────╯"
	exit 1
fi

echo "🟢 Assets copied"

echo -e "\n🌀 Patching package.json..."

tmp_package_dir="$pkg_dist_dir$(mktemp)"
mkdir -p "$(dirname "$tmp_package_dir")"

if ! output=$(
	jaq '.main = "./index.cjs"' "$pkg_dist_dir"/package.json >"$tmp_package_dir" && \
	mv "$tmp_package_dir" "$pkg_dist_dir"/package.json \
	2>&1
); then

	echo '╭─ 🔴 `jaq` failed ────────────────────────────────╮'
	echo "$output"
	echo "╰───────────────────────────────────────────────────╯"
	exit 1
fi

echo "🟢 package.json patched"

echo -e "\n🎉 Extension build is ready!"
