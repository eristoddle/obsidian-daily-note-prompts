# Import/Export Guide - Daily Prompts Plugin

This guide explains how the import/export system works and how personal data is handled when sharing prompt packs.

## Understanding the Data Structure

A prompt pack contains several types of data:

### Shareable Content (Safe to Export)
- **Prompt content**: The actual text/questions/prompts
- **Prompt types**: Whether prompts are text, markdown, or links
- **Pack structure**: Sequential, Random, or Date-based delivery
- **Dates**: For date-based packs, the assigned dates
- **Order**: For sequential packs, the prompt order
- **Basic metadata**: Description, tags, category, author info

### Personal Data (Should NOT be Shared)
- **Progress tracking**: Which prompts you've completed
- **Personal settings**: Your notification preferences, times, zen mode settings
- **Custom templates**: Your personal daily note templates
- **Access timestamps**: When you last used the pack
- **Personal metadata**: Any personal notes or modifications

## How Export Works

### For Sharing (Recommended)
When you export a prompt pack from the settings page, the plugin automatically:

1. **Removes all personal data**:
   - Clears completion progress
   - Resets notification settings to defaults
   - Removes custom templates
   - Clears personal timestamps

2. **Preserves shareable content**:
   - All prompt text and structure
   - Pack type and organization
   - Author attribution and descriptions
   - Tags and categories

3. **Adds sharing metadata**:
   - Export timestamp
   - Plugin version info
   - Note about data cleaning

### Export File Format
```json
{
  "version": "1.0.0",
  "type": "shared-prompt-pack",
  "pack": {
    "name": "Morning Reflections",
    "type": "Sequential",
    "prompts": [
      {
        "content": "What are you grateful for today?",
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
      "description": "Daily gratitude and reflection prompts",
      "author": "Jane Doe",
      "promptCount": 30,
      "packType": "Sequential"
    }
  },
  "shareMetadata": {
    "exportedAt": "2024-01-15T10:30:00Z",
    "exportType": "sharing",
    "note": "This export contains only prompt content and excludes personal settings and progress data."
  }
}
```

## How Import Works

When you import a shared prompt pack:

1. **Creates fresh progress**: Starts with no completed prompts
2. **Applies your preferences**: Uses your default notification settings
3. **Generates new IDs**: Prevents conflicts with existing packs
4. **Handles name conflicts**: Automatically renames if needed (e.g., "Pack Name (Imported)")
5. **Removes custom templates**: Ensures no personal data from the exporter

### Import Process
```
Shared Pack Import → Clean Content → Apply Your Settings → Fresh Progress → Ready to Use
```

## Best Practices

### When Exporting for Others
- ✅ Use the "Export" button in settings (automatically cleans data)
- ✅ Include helpful descriptions and tags
- ✅ Test your exported pack by importing it yourself
- ❌ Don't manually edit the JSON files
- ❌ Don't share your personal data.json file

### When Importing from Others
- ✅ Review the pack content before importing
- ✅ Check for name conflicts with your existing packs
- ✅ Customize settings after import to match your preferences
- ❌ Don't import untrusted files
- ❌ Don't worry about progress data - it starts fresh

## Privacy Protection

The plugin protects your privacy by:

1. **Automatic data cleaning**: Export removes personal data by default
2. **Fresh start imports**: Imported packs start with clean progress
3. **Settings isolation**: Your notification preferences aren't shared
4. **Template protection**: Custom daily note templates stay private
5. **Progress separation**: Your completion history isn't exported

## File Naming Convention

- **Shared exports**: `pack_name_shared.json`
- **Personal backups**: `pack_name.json` (if you need full data backup)

## Troubleshooting

### Import Issues
- **"Pack already exists"**: The importer will automatically rename it
- **"Invalid format"**: Make sure you're importing a proper export file
- **"Missing prompts"**: Check that the export file isn't corrupted

### Export Issues
- **"Export failed"**: Check that the pack has valid prompts
- **"File too large"**: Large packs are automatically optimized

## Technical Details

### Data Cleaning Process
1. Remove `progress.completedPrompts` array
2. Reset `progress.lastAccessDate` to current time
3. Set `settings` to safe defaults
4. Clear `metadata` of personal information
5. Remove prompt IDs to prevent conflicts
6. Update timestamps to export time

### Import Validation
1. Check file format and version compatibility
2. Validate prompt content and structure
3. Ensure no malicious content
4. Generate new unique IDs
5. Apply conflict resolution for names

This system ensures that sharing prompt packs is safe, private, and user-friendly while preserving the valuable content that makes each pack useful.