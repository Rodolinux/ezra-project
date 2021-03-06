#!/bin/bash

rm -rf node_modules/node-sword-interface/sword node_modules/node-sword-interface/sword_build

node_modules/.bin/electron-packager . 'Ezra Project' --overwrite --platform=darwin --arch=x64 --prune=true --out=release --electron-version=9.2.1 \
--executable-name='ezra-project' \
--app-bundle-id='net.ezra-project.electronapp' \
--app-category-type='public.app-category.education' \
--icon=icons/ezra-project.icns
