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

Use custom publish script

```json
{
  "plugins": [
    ["composer", {"publishScript":"./scripts/publish.sh"}]
    // other plugins
  ]
}
```