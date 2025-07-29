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
- **Easy exit**: Press Escape key to exit zen mode anytime
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
| Enable Zen Mode | Hide UI for focused writing | `Ctrl/Cmd+P` → "Enable Zen Mode" |
| Disable Zen Mode | Restore normal UI | `Ctrl/Cmd+P` → "Disable Zen Mode" |
| Toggle Zen Mode | Switch zen mode on/off | `Ctrl/Cmd+P` → "Toggle Zen Mode" |
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

## 🤖 Creating Prompt Packs Programmatically

You can generate prompt packs using software, AI, or scripts. Here's the data structure and examples:

### Shared Prompt Pack Format

The plugin accepts JSON files in this format for import:

```json
{
  "version": "1.0.0",
  "type": "shared-prompt-pack",
  "pack": {
    "name": "Your Pack Name",
    "type": "Sequential",
    "prompts": [
      {
        "content": "Your prompt text here",
        "type": "string",
        "order": 1
      }
    ],
    "defaultSettings": {
      "notificationEnabled": false,
      "notificationTime": "09:00",
      "notificationType": "obsidian",
      "zenModeEnabled": false,
      "dailyNoteIntegration": true
    },
    "metadata": {
      "description": "Pack description",
      "author": "Your Name",
      "version": "1.0.0",
      "tags": ["writing", "reflection"],
      "category": "Personal Development",
      "promptCount": 30
    }
  },
  "shareMetadata": {
    "exportedAt": "2024-01-15T10:30:00Z",
    "exportedBy": "AI Generator v1.0",
    "exportType": "sharing"
  }
}
```

### Pack Types

#### Sequential Pack
```json
{
  "name": "30-Day Writing Challenge",
  "type": "Sequential",
  "prompts": [
    {
      "content": "Write about your earliest memory",
      "type": "string",
      "order": 1
    },
    {
      "content": "Describe your ideal writing space",
      "type": "string",
      "order": 2
    }
  ]
}
```

#### Random Pack
```json
{
  "name": "Creative Writing Sparks",
  "type": "Random",
  "prompts": [
    {
      "content": "What if gravity worked differently?",
      "type": "string"
    },
    {
      "content": "Write from your pet's perspective",
      "type": "string"
    }
  ]
}
```

#### Date-based Pack
```json
{
  "name": "Seasonal Reflections",
  "type": "Date",
  "prompts": [
    {
      "content": "Spring Equinox: What are you ready to grow?",
      "type": "string",
      "date": "2024-03-20T00:00:00Z"
    },
    {
      "content": "Summer Solstice: How do you embrace abundance?",
      "type": "string",
      "date": "2024-06-21T00:00:00Z"
    }
  ]
}
```

### Prompt Types

#### String Prompts (Plain Text)
```json
{
  "content": "What are three things you're grateful for today?",
  "type": "string"
}
```

#### Link Prompts (Reference Other Notes)
```json
{
  "content": "[[My Goals]] - Review and update your goals",
  "type": "link"
}
```

#### Markdown Prompts (Rich Formatting)
```json
{
  "content": "# Daily Reflection\n\n**Mood**: How are you feeling?\n\n**Energy**: Rate 1-10\n\n**Focus**: What's your priority today?",
  "type": "markdown"
}
```

### AI Generation Example (Python)

```python
import json
from datetime import datetime, timedelta

def generate_prompt_pack(name, prompts, pack_type="Sequential"):
    pack_data = {
        "version": "1.0.0",
        "type": "shared-prompt-pack",
        "pack": {
            "name": name,
            "type": pack_type,
            "prompts": [],
            "defaultSettings": {
                "notificationEnabled": False,
                "notificationTime": "09:00",
                "notificationType": "obsidian",
                "zenModeEnabled": False,
                "dailyNoteIntegration": True
            },
            "metadata": {
                "description": f"AI-generated {pack_type.lower()} prompt pack",
                "author": "AI Assistant",
                "version": "1.0.0",
                "tags": ["ai-generated", "reflection"],
                "category": "Personal Development",
                "promptCount": len(prompts)
            }
        },
        "shareMetadata": {
            "exportedAt": datetime.now().isoformat() + "Z",
            "exportedBy": "AI Prompt Generator",
            "exportType": "sharing"
        }
    }

    for i, prompt_text in enumerate(prompts):
        prompt = {
            "content": prompt_text,
            "type": "string"
        }

        if pack_type == "Sequential":
            prompt["order"] = i + 1
        elif pack_type == "Date":
            # Example: daily prompts starting from today
            date = datetime.now() + timedelta(days=i)
            prompt["date"] = date.isoformat() + "Z"

        pack_data["pack"]["prompts"].append(prompt)

    return json.dumps(pack_data, indent=2)

# Example usage
prompts = [
    "What are you most excited about today?",
    "Describe a challenge you overcame recently",
    "What's one thing you learned this week?",
    "How can you show kindness to someone today?",
    "What are you most grateful for right now?"
]

pack_json = generate_prompt_pack("AI Daily Reflections", prompts, "Sequential")
with open("ai_daily_reflections_shared.json", "w") as f:
    f.write(pack_json)
```

### Validation Rules

- **Pack name**: Required, non-empty string
- **Pack type**: Must be "Sequential", "Random", or "Date"
- **Prompts**: At least one prompt required
- **Prompt content**: Non-empty string
- **Sequential packs**: Must have `order` field (1, 2, 3...)
- **Date packs**: Must have `date` field in ISO format
- **Random packs**: No order or date fields needed

### Import Process

1. Save your generated JSON as `pack_name_shared.json`
2. In Obsidian: Settings → Daily Prompts → Import
3. Select your JSON file
4. Plugin validates and imports with fresh progress
5. Customize settings after import if needed

### Tips for AI Generation

- **Vary prompt length**: Mix short and detailed prompts
- **Include context**: Add helpful descriptions in metadata
- **Consider progression**: For sequential packs, build complexity gradually
- **Test your output**: Import generated packs to verify they work
- **Use meaningful names**: Clear, descriptive pack names help users
- **Add tags**: Help users categorize and find packs

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