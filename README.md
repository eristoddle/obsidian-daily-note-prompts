# Obsidian Daily Prompts Plugin

A flexible system for receiving daily writing prompts, reflections, or devotionals within your Obsidian vault.

## Features

- **Multiple Delivery Modes**: Sequential, Random, or Date-based prompt delivery
- **Flexible Prompt Types**: Support for links, strings, and markdown content
- **Smart Notifications**: System and Obsidian-based notifications with customizable timing
- **Daily Note Integration**: Automatic integration with daily notes and zen mode
- **Import/Export**: JSON-based prompt pack sharing and backup
- **Progress Tracking**: Track completion status and writing journey

## Development

### Setup

```bash
npm install
```

### Build

```bash
npm run build
```

### Development

```bash
npm run dev
```

### Release

To create a new release:

```bash
npm run release 1.0.1
```

This will:
1. Update version numbers in `package.json`, `manifest.json`, and `versions.json`
2. Build the plugin
3. Run tests (if available)
4. Commit changes
5. Create and push a git tag
6. Trigger GitHub Actions to create the release

### GitHub Actions

The project includes two workflows:

- **CI** (`ci.yml`): Runs on push/PR to main branches, builds and tests the plugin
- **Release** (`release.yml`): Runs on tag push, builds the plugin and creates a GitHub release with assets

### Manual Installation for Development

1. Clone this repository
2. Run `npm install` and `npm run build`
3. Copy `main.js`, `manifest.json`, and `styles.css` to your vault's plugins folder:
   `.obsidian/plugins/obsidian-daily-prompts/`

## Installation

1. Download the latest release
2. Extract to your Obsidian plugins folder: `.obsidian/plugins/obsidian-daily-prompts/`
3. Enable the plugin in Obsidian settings

## Usage

1. Create a new prompt pack in the plugin settings
2. Add prompts and configure delivery mode
3. Set up notifications and daily note integration
4. Start receiving your daily prompts!

## License

MIT