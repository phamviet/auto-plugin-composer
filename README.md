# Composer Plugin



## Installation

This plugin is not included with the `auto` CLI installed via NPM. To install:

```bash
npm i --save-dev auto-plugin-composer
# or
yarn add -D auto-plugin-composer
```

## Usage

```json
{
  "plugins": [
    "composer"
    // other plugins
  ]
}
```

Use with custom script

```json
{
  "plugins": [
    ["composer", {"publishScript":"./scripts/on-release.sh"}]
    // other plugins
  ]
}
```

Sample custom script to keep `develop` up to date with the base branch:

```bash
#!/usr/bin/env bash

# ./scripts/on-release.sh

echo RUNNING FROM "$0"

set -xe

remote=${2}
branch=${3}

set -xe

git checkout develop
git merge "$branch" -m "Merge branch $branch [skip ci]"
git push "$remote" develop
```