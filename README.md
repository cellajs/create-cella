# @cellajs/create-cella

CLI tool to scaffold a new Cella project from [the template](https://github.com/cellajs/cella).

## Usage

```bash
pnpm create @cellajs/cella my-app
```
## CLI Options

```bash
pnpm create @cellajs/cella [directory] [options]
```

| Option | Description |
| --- | --- |
| `--template <path>` | Use a custom template (local path or `github:user/repo`) |
| `--port-offset <number>` | Set the port offset (0-490 in steps of 10) |
| `--admin-email <email>` | Set the admin email for the initial seed user |
| `-v, --version` | Output the current version |
| `-h, --help` | Display the help message |

## What It Does

1. Creates a new project from a Cella template snapshot
2. Lets you choose optional modules, ports, and the seed admin email
3. Cleans the template and generates project-specific config
4. Initializes a fresh git repository with an initial commit
5. Adds the Cella upstream remote for future syncs

## Development

```bash
cd cli/create-cella

# Type check
pnpm ts

# Lint
pnpm lint:fix

# Try it out
pnpm try

# Run tests
pnpm test

# Run locally
pnpm start

# Build for npm publish
pnpm build
```

