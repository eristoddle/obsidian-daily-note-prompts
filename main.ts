import { Plugin, Notice, TFile } from 'obsidian';
import { PluginSettings, GlobalSettings } from './src/models';
import { PromptService } from './src/prompt-service';
import { DailyNoteService } from './src/daily-note-service';
import { ImportExportService } from './src/import-export-service';
import { SettingsManager } from './src/settings-manager';
import { ProgressStore } from './src/progress-store';
import { StorageManager } from './src/storage-manager';
import { PromptPackModal } from './src/prompt-pack-modal';

const DEFAULT_SETTINGS = PluginSettings.createDefault();

export default class DailyPromptsPlugin extends Plugin {
  settings: PluginSettings;
  settingsManager: SettingsManager;
  promptService: PromptService;
  dailyNoteService: DailyNoteService;
  importExportService: ImportExportService;
  progressStore: ProgressStore;

  async onload() {
    await this.loadSettings();

    // Initialize services
    this.initializeServices();

    // Register commands
    this.registerCommands();

    // Plugin initialization will be implemented in later tasks
    console.log('Daily Prompts plugin loaded');
  }

  onunload() {
    // Cleanup will be implemented in later tasks
    console.log('Daily Prompts plugin unloaded');
  }

  private initializeServices() {
    this.settingsManager = new SettingsManager(this);
    const storageManager = new StorageManager(this);
    this.progressStore = new ProgressStore(this, storageManager);
    this.promptService = new PromptService(this.progressStore);
    this.dailyNoteService = new DailyNoteService(this.app, this.settings.globalSettings);
    this.importExportService = new ImportExportService(this.app.vault);

    // Load prompt packs into the service
    this.promptService.loadPromptPacks(this.settings.promptPacks);
  }

  private registerCommands() {
    // Core plugin commands (Task 10.1)
    this.addCommand({
      id: 'open-todays-prompt',
      name: 'Open Today\'s Prompt',
      callback: () => this.openTodaysPrompt()
    });

    this.addCommand({
      id: 'create-new-prompt-pack',
      name: 'Create New Prompt Pack',
      callback: () => this.createNewPromptPack()
    });

    this.addCommand({
      id: 'import-prompt-pack',
      name: 'Import Prompt Pack',
      callback: () => this.importPromptPack()
    });

    this.addCommand({
      id: 'export-prompt-pack',
      name: 'Export Prompt Pack',
      callback: () => this.exportPromptPack()
    });

    // Prompt management commands (Task 10.2)
    this.addCommand({
      id: 'mark-current-prompt-complete',
      name: 'Mark Current Prompt Complete',
      callback: () => this.markCurrentPromptComplete()
    });

    this.addCommand({
      id: 'skip-to-next-prompt',
      name: 'Skip to Next Prompt',
      callback: () => this.skipToNextPrompt()
    });

    this.addCommand({
      id: 'reset-prompt-pack-progress',
      name: 'Reset Prompt Pack Progress',
      callback: () => this.resetPromptPackProgress()
    });
  }

  async loadSettings() {
    const data = await this.loadData();
    this.settings = data ? PluginSettings.fromJSON(data) : DEFAULT_SETTINGS;
  }

  async saveSettings() {
    await this.saveData(this.settings.toJSON());
  }

  // Command handlers for Task 10.1 - Core plugin commands

  /**
   * Open today's prompt from available prompt packs
   */
  private async openTodaysPrompt() {
    try {
      const activePacks = this.settings.promptPacks.filter(pack =>
        pack.settings.notificationEnabled || pack.type === 'Date'
      );

      if (activePacks.length === 0) {
        new Notice('No active prompt packs found. Create a prompt pack first.');
        return;
      }

      // For Date-type packs, check if there are prompts for today
      const datePacks = activePacks.filter(pack => pack.type === 'Date');
      let todaysPrompt = null;
      let selectedPack = null;

      for (const pack of datePacks) {
        if (this.promptService.hasPromptsForToday(pack.id)) {
          todaysPrompt = await this.promptService.getNextPrompt(pack.id);
          selectedPack = pack;
          break;
        }
      }

      // If no date-specific prompt, get from first active pack
      if (!todaysPrompt && activePacks.length > 0) {
        selectedPack = activePacks[0];
        todaysPrompt = await this.promptService.getNextPrompt(selectedPack.id);
      }

      if (!todaysPrompt) {
        new Notice('No prompts available today. Check your prompt pack settings.');
        return;
      }

      // Create or open daily note
      const dailyNote = await this.dailyNoteService.createOrOpenDailyNote();

      // Insert prompt into daily note
      await this.dailyNoteService.insertPrompt(todaysPrompt, dailyNote);

      // Enable zen mode if configured
      if (selectedPack.settings.zenModeEnabled) {
        this.dailyNoteService.enableZenMode();
      }

      new Notice(`Opened today's prompt: "${todaysPrompt.content.substring(0, 50)}..."`);

    } catch (error) {
      console.error('Failed to open today\'s prompt:', error);
      new Notice(`Failed to open today's prompt: ${error.message}`);
    }
  }

  /**
   * Create a new prompt pack using the modal
   */
  private createNewPromptPack() {
    const modal = new PromptPackModal(
      this.app,
      this.settingsManager,
      null,
      () => {
        // Refresh services after pack creation
        this.promptService.loadPromptPacks(this.settings.promptPacks);
      }
    );
    modal.open();
  }

  /**
   * Import a prompt pack from JSON file
   */
  private async importPromptPack() {
    try {
      // Get list of available JSON files in the vault
      const files = this.app.vault.getFiles().filter(file =>
        file.extension === 'json' && file.path.includes('export')
      );

      if (files.length === 0) {
        new Notice('No JSON export files found. Place JSON files in your vault to import.');
        return;
      }

      // Create a simple selection interface
      const fileNames = files.map(file => file.path);

      // For now, use the first available file (in a full implementation, you'd show a picker)
      const selectedFile = files[0];

      const jsonData = await this.app.vault.read(selectedFile);

      // Import the pack with conflict resolution
      const result = await this.importExportService.importPackWithConflictResolution(
        jsonData,
        this.settings.promptPacks
      );

      // Add the imported pack to settings
      this.settings.promptPacks.push(result.pack);
      await this.saveSettings();

      // Refresh services
      this.promptService.loadPromptPacks(this.settings.promptPacks);

      let message = `Successfully imported "${result.pack.name}"`;
      if (result.conflicts.length > 0) {
        message += ` (resolved ${result.conflicts.length} conflicts)`;
      }

      new Notice(message);

    } catch (error) {
      console.error('Failed to import prompt pack:', error);
      new Notice(`Failed to import prompt pack: ${error.message}`);
    }
  }

  /**
   * Export a prompt pack to JSON file
   */
  private async exportPromptPack() {
    try {
      if (this.settings.promptPacks.length === 0) {
        new Notice('No prompt packs to export. Create a prompt pack first.');
        return;
      }

      // For now, export the first pack (in a full implementation, you'd show a picker)
      const packToExport = this.settings.promptPacks[0];

      // Export the pack
      const result = await this.importExportService.exportPackToFile(
        packToExport,
        { folder: 'exports', includeProgress: false }
      );

      if (result.success) {
        new Notice(`Exported "${packToExport.name}" to ${result.filePath}`);
      } else {
        new Notice(`Failed to export pack: ${result.error}`);
      }

    } catch (error) {
      console.error('Failed to export prompt pack:', error);
      new Notice(`Failed to export prompt pack: ${error.message}`);
    }
  }

  // Command handlers for Task 10.2 - Prompt management commands

  /**
   * Mark the current prompt as complete
   */
  private async markCurrentPromptComplete() {
    try {
      // Find the most recently accessed pack
      const recentPack = this.settings.promptPacks
        .sort((a, b) => b.progress.lastAccessDate.getTime() - a.progress.lastAccessDate.getTime())[0];

      if (!recentPack) {
        new Notice('No prompt packs found. Create a prompt pack first.');
        return;
      }

      // Get the current prompt
      const currentPrompt = await this.promptService.getNextPrompt(recentPack.id);

      if (!currentPrompt) {
        new Notice('No current prompt to mark as complete.');
        return;
      }

      // Mark as completed
      await this.promptService.markPromptCompleted(recentPack.id, currentPrompt.id);

      new Notice(`Marked prompt as complete: "${currentPrompt.content.substring(0, 50)}..."`);

    } catch (error) {
      console.error('Failed to mark prompt as complete:', error);
      new Notice(`Failed to mark prompt as complete: ${error.message}`);
    }
  }

  /**
   * Skip to the next prompt in the current pack
   */
  private async skipToNextPrompt() {
    try {
      // Find the most recently accessed pack
      const recentPack = this.settings.promptPacks
        .sort((a, b) => b.progress.lastAccessDate.getTime() - a.progress.lastAccessDate.getTime())[0];

      if (!recentPack) {
        new Notice('No prompt packs found. Create a prompt pack first.');
        return;
      }

      // Get the current prompt first
      const currentPrompt = await this.promptService.getNextPrompt(recentPack.id);

      if (!currentPrompt) {
        new Notice('No current prompt to skip.');
        return;
      }

      // Mark current as completed to move to next
      await this.promptService.markPromptCompleted(recentPack.id, currentPrompt.id);

      // Get the next prompt
      const nextPrompt = await this.promptService.getNextPrompt(recentPack.id);

      if (nextPrompt) {
        // Create or open daily note
        const dailyNote = await this.dailyNoteService.createOrOpenDailyNote();

        // Insert next prompt
        await this.dailyNoteService.insertPrompt(nextPrompt, dailyNote);

        // Enable zen mode if configured
        if (recentPack.settings.zenModeEnabled) {
          this.dailyNoteService.enableZenMode();
        }

        new Notice(`Skipped to next prompt: "${nextPrompt.content.substring(0, 50)}..."`);
      } else {
        new Notice('No more prompts available in this pack.');
      }

    } catch (error) {
      console.error('Failed to skip to next prompt:', error);
      new Notice(`Failed to skip to next prompt: ${error.message}`);
    }
  }

  /**
   * Reset progress for a prompt pack
   */
  private async resetPromptPackProgress() {
    try {
      if (this.settings.promptPacks.length === 0) {
        new Notice('No prompt packs found. Create a prompt pack first.');
        return;
      }

      // For now, reset the first pack (in a full implementation, you'd show a picker)
      const packToReset = this.settings.promptPacks[0];

      // Reset progress
      await this.promptService.resetProgress(packToReset.id);

      new Notice(`Reset progress for "${packToReset.name}"`);

    } catch (error) {
      console.error('Failed to reset prompt pack progress:', error);
      new Notice(`Failed to reset prompt pack progress: ${error.message}`);
    }
  }
}