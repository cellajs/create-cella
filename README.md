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

1. Downloads the latest Cella template as a GitHub tarball and extracts it in-process (no `git` binary, no shell)
2. Cleans template files (removes cella-specific docs, configs) and interpolates the project config
3. Initializes a git repository with an initial commit via isomorphic-git
4. Creates an optional working branch
5. Adds Cella as the upstream remote for future syncs

Dependency installation and migration generation are **not** run automatically — after scaffolding, run `pnpm install`, then `pnpm generate` (the CLI prints these next steps on success).

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

