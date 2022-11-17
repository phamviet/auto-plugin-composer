# Atlas Plugin



## Installation

This plugin is not included with the `auto` CLI installed via NPM. To install:

```bash
npm i --save-dev auto-plugin-atlas
# or
yarn add -D auto-plugin-atlas
```

## Usage

```json
{
  "plugins": [
    "atlas"
    // other plugins
  ]
}
```

Use with custom script

```json
{
  "plugins": [
    ["atlas", {"publishScript":"./scripts/on-release.sh"}]
    // other plugins
  ]
}
```

Sample custom script to keep `develop` up to date with the base branch `./scripts/on-release.sh`:

```bash
#!/usr/bin/env bash

echo RUNNING FROM "$0"

set -xe

remote=${2}
branch=${3}

git checkout develop
git merge "$branch" -m "Merge branch $branch [skip ci]"
git push "$remote" develop
```