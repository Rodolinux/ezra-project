#!/bin/sh
# This script triggers all the steps necessary for building and packaging Ezra Project on macOS.

# Set minimum macOS version to 10.10 (Yosemite)
export MACOSX_DEPLOYMENT_TARGET=10.10

npm install
npm run compile-pug
npm run install-node-prune
npm run rebuild
npm run prune-node-modules
npm run purge-build-artifacts
npm run package-mac