# Daily Prompts Plugin - Troubleshooting Guide

This guide helps you resolve common issues with the Daily Prompts plugin for Obsidian.

## Quick Diagnostics

### Plugin Health Check
1. Open Command Palette (`Ctrl/Cmd+P`)
2. Run "Daily Prompts: Show Plugin Health Status"
3. Review the status report for any issues

### Performance Report
1. Open Command Palette (`Ctrl/Cmd+P`)
2. Run "Daily Prompts: Show Performance Report"
3. Check for performance issues or recommendations

## Common Issues

### 1. Notifications Not Working

#### Symptoms
- No notifications appear at scheduled times
- Notifications appear but don't open prompts when clicked
- System notifications not working
- Console errors about notification actions or permissions

#### Solutions

**Check Notification Permissions**
1. Ensure browser notifications are enabled for Obsidian
2. Check system notification settings
3. Try switching to Obsidian notices in pack settings

**Verify Pack Settings**
1. Open Settings → Daily Prompts
2. Ensure notifications are enabled for your pack
3. Check notification time format (should be HH:MM)
4. Verify pack has available prompts

**Test Manually**
1. Use "Open Today's Prompt" command to test functionality
2. Check console for error messages (Developer Tools → Console)
3. Try creating a new test pack with simple settings

**Common Console Errors and Fixes**

*Error: "Actions are only supported for persistent notifications"*
- This is a browser limitation - action buttons don't work in regular notifications
- The plugin automatically falls back to Obsidian notifications
- Click the notification itself to open the prompt (action buttons are not available)

*Error: "Notification permission denied"*
- Enable notifications in your browser settings for Obsidian
- Try switching to "obsidian" notification type in pack settings
- Restart Obsidian to refresh permissions

**Fallback Options**
- Switch notification type from "system" to "obsidian"
- Restart Obsidian to refresh notification permissions
- Check if other plugins are interfering with notifications

### 2. Daily Notes Not Opening

#### Symptoms
- Prompts don't open daily notes automatically
- Daily notes created in wrong location
- Template integration not working

#### Solutions

**Check Daily Notes Plugin**
1. Ensure Daily Notes core plugin is enabled
2. Verify daily note folder and format settings
3. Test daily note creation manually

**Verify File Permissions**
1. Check if Obsidian can create files in your vault
2. Ensure daily note folder exists and is writable
3. Try changing daily note folder location

**Template Issues**
1. Check daily note template syntax
2. Verify template file exists and is accessible
3. Try disabling template temporarily to isolate issue

**Manual Workaround**
- Use "Open Today's Prompt" command manually
- Create daily note first, then run prompt command
- Check plugin settings for daily note integration options

### 3. Performance Issues

#### Symptoms
- Plugin feels slow or unresponsive
- High memory usage
- Obsidian becomes sluggish

#### Solutions

**Run Performance Optimization**
1. Use "Daily Prompts: Optimize Performance" command
2. Clear caches and optimize data storage
3. Check performance report for recommendations

**Reduce Data Load**
1. Split large prompt packs into smaller ones
2. Archive completed packs
3. Remove unused prompt packs

**Check Memory Usage**
1. Monitor memory usage in performance report
2. Restart Obsidian if memory usage is high
3. Close other resource-intensive plugins temporarily

### 4. Import/Export Problems

#### Symptoms
- Import fails with validation errors
- Exported files are corrupted or incomplete
- Conflict resolution not working

#### Solutions

**File Format Issues**
1. Ensure JSON files are valid (use JSON validator)
2. Check file encoding (should be UTF-8)
3. Verify file is complete and not truncated

**Version Compatibility**
1. Check if import file is from compatible plugin version
2. Try importing individual packs instead of batch
3. Use conflict resolution options during import

**Validation Errors**
1. Check console for detailed validation messages
2. Use "Daily Prompts: Validate Plugin Data" command
3. Try importing with different conflict resolution settings

### 5. Data Corruption or Loss

#### Symptoms
- Plugin fails to load
- Prompt packs missing or corrupted
- Settings reset to defaults
- Console errors about "Folder already exists"

#### Solutions

**Automatic Recovery**
1. Plugin will attempt automatic recovery from backups
2. Check if recovery was successful in console logs
3. Use "Daily Prompts: Show Error Report" for details

**Manual Recovery**
1. Use "Daily Prompts: Create Data Backup" before making changes
2. Check `.obsidian/plugins/daily-prompts/backups/` folder
3. Restore from backup using plugin settings

**Data Validation**
1. Run "Daily Prompts: Validate Plugin Data" command
2. Fix validation issues reported
3. Recreate corrupted prompt packs if necessary

**File System Issues**

*Error: "Folder already exists" in progress saving*
- This is usually a race condition when multiple operations try to create folders
- The plugin now handles this automatically - restart Obsidian if it persists
- If the error continues, try "Daily Prompts: Optimize Performance" to clear caches

### 6. Zen Mode Issues

#### Symptoms
- Zen mode doesn't activate
- UI elements not hiding properly
- Zen mode doesn't restore after prompt session
- Stuck in zen mode and can't get out

#### Solutions

**Exiting Zen Mode**
1. **Press Escape Key**: Simply press `ESC` to exit zen mode (easiest method)
2. **Use Command Palette**: Press `Ctrl/Cmd+P` and search for "Disable Zen Mode"
3. **Toggle Command**: Use "Toggle Zen Mode" command to switch it off
4. **Alternative**: Use "Daily Prompts: Disable Zen Mode" command
5. **Emergency Exit**: If commands don't work, restart Obsidian

**Check Workspace API**
1. Ensure Obsidian workspace API is available
2. Try disabling other plugins that modify UI
3. Check console for workspace-related errors

**Manual Control**
1. Use the new zen mode commands for better control:
   - "Enable Zen Mode" - Turn on zen mode manually
   - "Disable Zen Mode" - Turn off zen mode manually
   - "Toggle Zen Mode" - Switch zen mode on/off
2. Disable zen mode in pack settings temporarily
3. Test prompt functionality without zen mode
4. Re-enable zen mode after confirming other features work

**UI Conflicts**
1. Check for conflicts with theme or other plugins
2. Try with default theme temporarily
3. Disable other UI-modifying plugins for testing

## Advanced Troubleshooting

### Console Debugging

**Enable Developer Tools**
1. Press `Ctrl+Shift+I` (Windows/Linux) or `Cmd+Option+I` (Mac)
2. Go to Console tab
3. Look for "Daily Prompts" messages

**Common Error Patterns**
- `ValidationError`: Data structure issues
- `Permission denied`: File or notification permission problems
- `API not available`: Missing Obsidian features or plugins
- `Network error`: Import/export connectivity issues

### Plugin Data Inspection

**Data Location**
- Main data: `.obsidian/plugins/daily-prompts/data.json`
- Backups: `.obsidian/plugins/daily-prompts/backups/`
- Progress: `.obsidian/plugins/daily-prompts/progress/`

**Manual Data Repair**
1. Backup current data first
2. Edit data.json carefully (validate JSON syntax)
3. Restart Obsidian after changes
4. Use validation command to check integrity

### Reset Options

**Soft Reset**
1. Use "Daily Prompts: Clear Error History" command
2. Run "Daily Prompts: Optimize Performance" command
3. Restart Obsidian

**Hard Reset**
1. Disable plugin
2. Delete `.obsidian/plugins/daily-prompts/data.json`
3. Re-enable plugin (will create fresh settings)
4. Restore from backup if needed

**Complete Reinstall**
1. Export important prompt packs first
2. Disable and remove plugin
3. Restart Obsidian
4. Reinstall plugin from Community Plugins
5. Import prompt packs back

## Error Codes and Messages

### Common Error Messages

**"Plugin not properly initialized"**
- Cause: Plugin failed to start correctly
- Solution: Check plugin health status, restart Obsidian

**"Prompt pack validation failed"**
- Cause: Corrupted or invalid prompt pack data
- Solution: Use data validation command, restore from backup

**"Daily note creation failed"**
- Cause: File permission or Daily Notes plugin issues
- Solution: Check Daily Notes plugin settings, verify permissions

**"Notification permission denied"**
- Cause: Browser or system notification permissions not granted
- Solution: Enable notifications in browser/system settings

**"Import validation failed"**
- Cause: Invalid or corrupted import file
- Solution: Verify JSON format, check file integrity

### Recovery Strategies

The plugin includes automatic recovery for common issues:

1. **Data Corruption**: Automatic backup restoration
2. **Permission Errors**: Fallback to alternative methods
3. **API Failures**: Graceful degradation with reduced functionality
4. **Network Issues**: Offline mode with local operations

## Getting Additional Help

### Before Reporting Issues

1. Run plugin health check and performance report
2. Check console for detailed error messages
3. Try troubleshooting steps in this guide
4. Test with minimal setup (disable other plugins)

### Information to Include in Bug Reports

- Obsidian version
- Plugin version
- Operating system
- Plugin health status output
- Console error messages
- Steps to reproduce the issue
- Expected vs actual behavior

### Support Channels

1. **GitHub Issues**: For bug reports and feature requests
2. **Obsidian Community**: For general questions and discussion
3. **Plugin Documentation**: For usage questions and guides

### Useful Commands for Support

```
Daily Prompts: Show Plugin Health Status
Daily Prompts: Show Performance Report
Daily Prompts: Show Error Report
Daily Prompts: Validate Plugin Data
```

## Prevention Tips

### Best Practices

1. **Regular Backups**: Use manual backup command periodically
2. **Data Validation**: Run validation command after major changes
3. **Performance Monitoring**: Check performance report occasionally
4. **Update Management**: Keep plugin updated to latest version

### Avoiding Common Issues

1. **Don't edit data files manually** unless absolutely necessary
2. **Test imports** with small files first
3. **Monitor memory usage** with large prompt packs
4. **Keep backups** before major operations
5. **Use validation** after importing data

---

If you continue to experience issues after following this guide, please report them through the appropriate support channels with detailed information about your setup and the specific problem you're encountering.