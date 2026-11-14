# @cellajs/create-cella

CLI tool to create a new app from [the cella template](https://github.com/cellajs/cella).

## Usage

```bash
pnpm create @cellajs/cella my-app
```

The directory must be new or empty, and its name becomes the app's slug: lowercase letters and digits, starting with a letter, single hyphens between parts and at least 4 characters besides hyphens. A run that fails or is interrupted removes what it wrote.

## CLI Options

```bash
pnpm create @cellajs/cella [directory] [options]
```

| Option | Description |
| --- | --- |
| `--template <path>` | Use a custom template: a local git checkout, whose tracked files are copied, or `github:user/repo` |
| `--app-index <number>` | Set this app's number for its dev ports, a whole number from 0 to 9, not 4 |
| `--admin-email <email>` | Set the admin email for the initial seed user |
| `-v, --version` | Output the current version |
| `-h, --help` | Display the help message |

## What It Does

1. Creates a new app from a cella template snapshot
2. Lets you choose an app number that is free on this machine, and the seed admin email
3. Cleans the template, generates the app's config and points coding agents at the template's rules and skills
4. Initializes a fresh git repository with an initial commit
5. Adds the cella upstream remote for `pnpm cella upgrade`

## Development

```bash
# Type check
pnpm ts

# Lint
pnpm lint:fix

# Try it out (recreates ../cella-try-app)
pnpm try

# Run tests
pnpm test

# Run locally
pnpm start

# Build for npm publish
pnpm build
```

