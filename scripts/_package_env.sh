#!/usr/bin/env bash

# This script provides environment variables for extension building & publishing.
#
# Usage:
#     source "$(dirname "$0")/_package_env.sh"

set -eo pipefail

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
	echo "🔴 This script is meant to be sourced, not executed!"
	exit 1
fi

# Make sure mise is activated
eval "$(mise activate bash --shims)"
eval "$(mise env -s bash)"

# Provide base variables
set_vars() {
	local script_path="$0"

	root_dir="$(realpath $(dirname "$0")/..)"
	dist_dir="${root_dir}/dist/production"

	pkg_version=$(cat package.json | jaq -r '.version')
	pkg_name=$(cat package.json | jaq -r '.name')
	pkg_publisher=$(cat package.json | jaq -r '.publisher')
	pkg_dist_dir="${dist_dir}/pkg"

	vsix_filename="$pkg_name-$pkg_version.vsix"
	vsix_path="$dist_dir/$vsix_filename"

	if [[ "${PRINT_ENV}" == "true" ]]; then
		echo
		echo "🔹 root_dir: $root_dir"
		echo "🔹 dist_dir: $dist_dir"
		echo "🔹 pkg_version: $pkg_version"
		echo "🔹 pkg_name: $pkg_name"
		echo "🔹 pkg_publisher: $pkg_publisher"
		echo "🔹 pkg_dist_dir: $pkg_dist_dir"
		echo "🔹 vsix_filename: $vsix_filename"
		echo "🔹 vsix_path: $vsix_path"
		echo
	fi
}

set_vars
