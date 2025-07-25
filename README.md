# Obsidian Daily Prompts Plugin

A flexible daily prompt system for Obsidian that delivers writing prompts, reflections, or devotionals directly to your daily notes. Supports multiple delivery modes, customizable notifications, and seamless integration with your existing workflow.

## Features

- **Multiple Delivery Modes**: Sequential, Random, or Date-based prompt delivery
- **Flexible Prompt Types**: Support for links, plain text, and markdown content
- **Smart Notifications**: System and Obsidian-based notifications with customizable timing
- **Daily Note Integration**: Automatic integration with daily notes and zen mode
- **Import/Export**: Share prompt packs via JSON format
- **Progress Tracking**: Track completion status and writing journey
- **Customizable**: Extensive configuration options for seamless workflow integration

## Installation

### Method 1: BRAT Plugin (Recommended for Beta Testing)

1. Install the [BRAT plugin](https://github.com/TfTHacker/obsidian42-brat) from the Obsidian Community Plugins
2. Open BRAT settings in Obsidian
3. Click "Add Beta Plugin"
4. Enter this repository URL: `https://github.com/[your-username]/obsidian-daily-prompts`
5. Click "Add Plugin"
6. Enable the plugin in Settings → Community Plugins

### Method 2: Manual Installation

1. Download the latest release from the [Releases page](https://github.com/[your-username]/obsidian-daily-prompts/releases)
2. Extract the files to your vault's `.obsidian/plugins/daily-prompts/` folder
3. Reload Obsidian or enable the plugin in Settings → Community Plugins

### Method 3: Community Plugin Store (Coming Soon)

This plugin will be available in the official Obsidian Community Plugin store once it's approved.

## Quick Start

1. **Enable the Plugin**: Go to Settings → Community Plugins and enable "Daily Prompts"
2. **Create Your First Prompt Pack**:
   - Open Settings → Daily Prompts
   - Click "Create New Pack"
   - Choose your delivery mode (Sequential, Random, or Date)
   - Add your prompts
3. **Set Up Notifications**: Configure your preferred notification time and type
4. **Start Writing**: Receive your daily prompt and let it automatically open in your daily note

## Usage Guide

### Creating Prompt Packs

#### Sequential Mode
Perfect for structured programs like "30 Days of Gratitude" or guided courses.
- Prompts are delivered in a specific order
- Progress automatically advances to the next prompt
- Option to restart when complete

#### Random Mode
Great for varied daily inspiration without repetition.
- Randomly selects from available prompts
- No prompt repeats until all are used
- Automatically resets when cycle completes

#### Date Mode
Ideal for devotionals, seasonal content, or anniversary reminders.
- Assign specific dates to prompts
- Handles past dates with catch-up options
- Perfect for recurring annual content

### Prompt Types

- **String**: Simple text prompts for quick reflections
- **Markdown**: Rich formatted content with styling and structure
- **Link**: References to other notes in your vault for deeper exploration

### Notification Options

- **System Notifications**: Native OS notifications that work even when Obsidian is minimized
- **Obsidian Notifications**: In-app notices that appear within Obsidian
- **Customizable Timing**: Set your preferred notification time
- **Missed Prompt Recovery**: Access prompts you may have missed

### Daily Note Integration

- **Automatic Note Creation**: Creates or opens today's daily note
- **Smart Insertion**: Adds prompts at the appropriate location
- **Template Support**: Works with your existing daily note templates
- **Zen Mode**: Automatically enables distraction-free writing mode

## Configuration

### Global Settings

- **Default Notification Time**: Set your preferred daily prompt time
- **Daily Note Folder**: Specify where daily notes are stored
- **Daily Note Template**: Customize how prompts are inserted
- **Link Handling**: Choose how linked prompts are displayed
- **Zen Mode Options**: Configure which UI elements to hide

### Prompt Pack Settings

Each prompt pack can be individually configured:
- **Notification Enabled**: Toggle notifications for this pack
- **Notification Time**: Override global notification time
- **Notification Type**: Choose system or Obsidian notifications
- **Zen Mode**: Enable automatic zen mode for this pack
- **Custom Template**: Use pack-specific formatting

## Import/Export

### Sharing Prompt Packs

1. **Export**: Settings → Daily Prompts → Select Pack → Export
2. **Share**: Send the JSON file to others
3. **Import**: Recipients can import via Settings → Daily Prompts → Import

### Backup Your Data

Regular exports serve as backups of your prompt packs and progress. The plugin also creates automatic backups in `.obsidian/plugins/daily-prompts/backups/`.

## Command Palette

Access key functions quickly via Ctrl/Cmd + P:

- `Daily Prompts: Open Today's Prompt`
- `Daily Prompts: Create New Pack`
- `Daily Prompts: Import Pack`
- `Daily Prompts: Export Pack`
- `Daily Prompts: Mark Complete`
- `Daily Prompts: Skip to Next`
- `Daily Prompts: Reset Progress`

## Development

### Prerequisites

- Node.js 16+ and npm
- TypeScript knowledge
- Familiarity with Obsidian Plugin API

### Setup Development Environment

```bash
# Clone the repository
git clone https://github.com/[your-username]/obsidian-daily-prompts.git
cd obsidian-daily-prompts

# Install dependencies
npm install

# Build the plugin
npm run build

# Start development with hot reload
npm run dev
```

### Project Structure

```
src/
├── main.ts              # Plugin entry point
├── services/            # Core business logic
│   ├── PromptService.ts
│   ├── NotificationService.ts
│   ├── DailyNoteService.ts
│   └── ImportExportService.ts
├── models/              # Data models and interfaces
│   ├── PromptPack.ts
│   ├── Prompt.ts
│   └── Settings.ts
├── ui/                  # User interface components
│   ├── SettingsTab.ts
│   ├── PromptModal.ts
│   └── ProgressView.ts
├── utils/               # Utility functions
└── tests/               # Test files
```

### Building and Testing

```bash
# Run tests
npm test

# Build for production
npm run build

# Lint code
npm run lint

# Type checking
npm run type-check
```

### Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes and add tests
4. Ensure all tests pass: `npm test`
5. Submit a pull request

### Development Workflow

The project follows a spec-driven development approach. See the `.kiro/specs/obsidian-daily-prompts/` directory for:

- `requirements.md` - Detailed requirements and acceptance criteria
- `design.md` - Architecture and technical design
- `tasks.md` - Implementation plan and task breakdown

## Troubleshooting

### Common Issues

**Notifications Not Working**
- Check browser notification permissions
- Verify notification time settings
- Try switching between system and Obsidian notifications

**Daily Notes Not Opening**
- Ensure Daily Notes core plugin is enabled
- Check daily note folder path in settings
- Verify daily note template format

**Prompts Not Appearing**
- Check if prompt pack is active
- Verify notification time hasn't passed
- Look for missed notifications in the plugin

**Import/Export Issues**
- Validate JSON format
- Check file permissions
- Ensure sufficient storage space

### Getting Help

- **Issues**: Report bugs on [GitHub Issues](https://github.com/[your-username]/obsidian-daily-prompts/issues)
- **Discussions**: Join conversations on [GitHub Discussions](https://github.com/[your-username]/obsidian-daily-prompts/discussions)
- **Community**: Find help in the [Obsidian Discord](https://discord.gg/obsidianmd) #plugin-dev channel

## Roadmap

- [ ] Advanced scheduling (weekdays only, custom intervals)
- [ ] Prompt pack templates and community sharing
- [ ] Integration with spaced repetition systems
- [ ] Mobile app notification support
- [ ] Analytics and writing streak tracking
- [ ] AI-powered prompt suggestions

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Inspired by [obsidian-dailyPrompt](https://github.com/Erl-koenig/obsidian-dailyPrompt)
- Built with the [Obsidian Plugin API](https://github.com/obsidianmd/obsidian-api)
- Thanks to the Obsidian community for feedback and testing

---

**Made with ❤️ for the Obsidian community**