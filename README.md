# Daily Prompts Plugin for Obsidian

A comprehensive and flexible system for receiving daily writing prompts, reflections, or devotionals within your Obsidian vault. Transform your daily writing practice with intelligent prompt delivery, seamless daily note integration, and powerful customization options.

## ✨ Features

### 🎯 Multiple Prompt Delivery Modes
- **Sequential**: Prompts delivered in a specific order, perfect for structured courses or progressive content
- **Random**: Prompts delivered randomly without repetition until all are used, ideal for varied inspiration
- **Date-based**: Prompts assigned to specific dates, great for seasonal content or timed reflections

### 🔔 Smart Notifications
- **Dual notification system**: Choose between system notifications or Obsidian notices
- **Timezone-aware scheduling**: Respects your local timezone and handles daylight saving transitions
- **Missed notification recovery**: Catch up on prompts you might have missed
- **Customizable timing**: Set different notification times for different prompt packs

### 📝 Seamless Daily Note Integration
- **Automatic daily note creation**: Creates or opens your daily note when a prompt is activated
- **Flexible prompt formatting**: Supports links, plain text, and markdown content
- **Template integration**: Works with your existing daily note templates
- **Zen mode activation**: Optional distraction-free writing environment

### 📊 Progress Tracking & Analytics
- **Completion tracking**: Monitor your progress through prompt packs
- **Statistics dashboard**: View completion rates, streaks, and overall progress
- **Archive system**: Keep completed packs organized
- **Performance monitoring**: Built-in performance optimization and monitoring

### 🔄 Import/Export System
- **JSON-based sharing**: Share prompt packs with others or backup your collections
- **Conflict resolution**: Smart handling of duplicate names and IDs during import
- **Batch operations**: Import/export multiple packs at once
- **Validation system**: Ensures data integrity during import/export

### ⚡ Performance Optimized
- **Lazy loading**: Large prompt packs load efficiently
- **Intelligent caching**: Frequently accessed data is cached for speed
- **Memory management**: Automatic cleanup and optimization
- **Batch operations**: Efficient handling of multiple operations

## 🚀 Quick Start

### Installation

1. **From Obsidian Community Plugins** (Recommended)
   - Open Settings → Community Plugins
   - Search for "Daily Prompts"
   - Install and enable the plugin

2. **Manual Installation**
   - Download the latest release from GitHub
   - Extract to `.obsidian/plugins/daily-prompts/`
   - Enable in Settings → Community Plugins

### First Steps

1. **Create Your First Prompt Pack**
   - Open Settings → Daily Prompts
   - Click "Create New Prompt Pack"
   - Add your prompts and configure settings

2. **Set Up Notifications**
   - Enable notifications in your pack settings
   - Choose your preferred time and notification type
   - Test with "Open Today's Prompt" command

3. **Customize Integration**
   - Configure daily note template integration
   - Set up zen mode preferences
   - Adjust global settings to match your workflow

## 📖 Detailed Usage Guide

### Creating Effective Prompt Packs

#### Sequential Packs
Perfect for structured content like:
- Writing courses with progressive lessons
- Meditation series with building concepts
- Book study guides with chapter-by-chapter prompts

```
Example: "30-Day Writing Challenge"
Day 1: Write about your earliest memory
Day 2: Describe your ideal writing space
Day 3: Create a character based on someone you know
...
```

#### Random Packs
Ideal for varied inspiration:
- Creative writing prompts
- Daily reflection questions
- Brainstorming triggers

```
Example: "Creative Sparks"
- What if gravity worked differently?
- Write from the perspective of your pet
- Describe a world where colors have sounds
...
```

#### Date-based Packs
Great for seasonal or timed content:
- Holiday-themed prompts
- Seasonal reflections
- Anniversary reminders

```
Example: "Seasonal Reflections"
March 20: Spring Equinox - What are you ready to grow?
June 21: Summer Solstice - How do you embrace abundance?
September 22: Fall Equinox - What are you ready to release?
...
```

### Advanced Configuration

#### Notification Settings
- **System Notifications**: Native OS notifications with click-to-open
- **Obsidian Notices**: In-app notifications with custom styling
- **Timing**: Set different times for different packs
- **Fallback**: Automatic fallback if preferred method fails

#### Daily Note Integration
- **Template Variables**: Use `{{prompt}}` in your daily note templates
- **Custom Insertion**: Configure where prompts appear in your notes
- **Format Options**: Choose how prompts are formatted (heading, quote, etc.)

#### Zen Mode
- **Customizable UI hiding**: Choose which elements to hide
- **Automatic activation**: Enable zen mode when prompts open
- **Restoration**: Automatic UI restoration when done

### Command Palette Integration

| Command | Description | Shortcut |
|---------|-------------|----------|
| Open Today's Prompt | Get your daily prompt | `Ctrl/Cmd+P` → "Open Today's Prompt" |
| Create New Prompt Pack | Start creating a new pack | `Ctrl/Cmd+P` → "Create New Prompt Pack" |
| Import Prompt Pack | Import from JSON file | `Ctrl/Cmd+P` → "Import Prompt Pack" |
| Export Prompt Pack | Export to JSON file | `Ctrl/Cmd+P` → "Export Prompt Pack" |
| Mark Current Prompt Complete | Mark prompt as done | `Ctrl/Cmd+P` → "Mark Current Prompt Complete" |
| Skip to Next Prompt | Move to next prompt | `Ctrl/Cmd+P` → "Skip to Next Prompt" |
| Reset Prompt Pack Progress | Start pack over | `Ctrl/Cmd+P` → "Reset Prompt Pack Progress" |
| Show Performance Report | View performance metrics | `Ctrl/Cmd+P` → "Show Performance Report" |

## 🔧 Troubleshooting

### Common Issues

#### Notifications Not Working
1. **Check permissions**: Ensure browser notifications are allowed
2. **Verify settings**: Confirm notifications are enabled in pack settings
3. **Test manually**: Use "Open Today's Prompt" to test functionality
4. **Check console**: Look for error messages in Developer Tools

#### Daily Notes Not Opening
1. **Daily Notes plugin**: Ensure the Daily Notes core plugin is enabled
2. **Template conflicts**: Check for template parsing issues
3. **File permissions**: Verify Obsidian can create files in your vault
4. **Path settings**: Confirm daily note folder settings are correct

#### Performance Issues
1. **Use performance report**: Run "Show Performance Report" command
2. **Clear caches**: Use "Optimize Performance" command
3. **Reduce pack size**: Consider splitting large packs
4. **Check memory**: Monitor memory usage in performance report

#### Import/Export Problems
1. **File format**: Ensure JSON files are valid
2. **Version compatibility**: Check if files are from compatible plugin versions
3. **Conflict resolution**: Use automatic conflict resolution for duplicates
4. **Validation errors**: Check console for detailed validation messages

### Getting Help

1. **Plugin Health Check**: Use "Show Plugin Health Status" command
2. **Console Logs**: Check Developer Tools console for detailed errors
3. **GitHub Issues**: Report bugs at [GitHub repository]
4. **Community Support**: Ask questions in Obsidian community forums

## 🛠️ Development

### Building from Source

```bash
# Clone the repository
git clone https://github.com/obsidian-daily-prompts/obsidian-daily-prompts.git
cd obsidian-daily-prompts

# Install dependencies
npm install

# Build the plugin
npm run build

# Run tests
npm test

# Development mode (watch for changes)
npm run dev
```

### Project Structure

```
src/
├── models.ts              # Data models and validation
├── interfaces.ts          # Service interfaces
├── prompt-service.ts      # Core prompt management
├── notification-service.ts # Notification handling
├── daily-note-service.ts  # Daily note integration
├── import-export-service.ts # Import/export functionality
├── storage-manager.ts     # Data persistence
├── progress-store.ts      # Progress tracking
├── settings-manager.ts    # Settings management
├── performance-monitor.ts # Performance monitoring
├── error-handler.ts       # Error handling
└── __tests__/            # Test files
```

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

### Testing

The plugin includes comprehensive test coverage:

```bash
# Run all tests
npm test

# Run specific test file
npm test -- prompt-service.test.ts

# Run tests in watch mode
npm test -- --watch

# Generate coverage report
npm test -- --coverage
```

### Release Process

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

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Obsidian team for the excellent plugin API
- Community contributors and testers
- Users who provide feedback and feature requests

## 📈 Changelog

### Version 1.0.0
- Initial release
- Sequential, Random, and Date-based prompt modes
- Dual notification system
- Daily note integration with zen mode
- Import/export functionality
- Progress tracking and analytics
- Performance optimization
- Comprehensive error handling

---

**Made with ❤️ for the Obsidian community**