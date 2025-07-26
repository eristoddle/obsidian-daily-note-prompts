import { Plugin, Notice, TFile, addIcon } from 'obsidian';
import { PluginSettings } from './src/models';
import { PromptService } from './src/prompt-service';
import { DailyNoteService } from './src/daily-note-service';
import { ImportExportService } from './src/import-export-service';
import { NotificationService } from './src/notification-service';
import { SettingsManager } from './src/settings-manager';
import { ProgressStore } from './src/progress-store';
import { StorageManager } from './src/storage-manager';
import { PromptPackModal } from './src/prompt-pack-modal';
import { DailyPromptsSettingsTab } from './src/settings-tab';

export default class DailyPromptsPlugin extends Plugin {
  // Core services
  settingsManager: SettingsManager;
  promptService: PromptService;
  dailyNoteService: DailyNoteService;
  importExportService: ImportExportService;
  notificationService: NotificationService;
  progressStore: ProgressStore;
  storageManager: StorageManager;

  // Plugin state
  private isInitialized: boolean = false;
  private initializationError: Error | null = null;

  async onload() {
    try {
      console.log('Daily Prompts: Starting plugin initialization...');

      // Add plugin icon
      this.addPluginIcon();

      // Initialize with comprehensive error handling
      await this.initializeWithErrorHandling();

      // Mark as successfully initialized
      this.isInitialized = true;
      console.log('Daily Prompts: Plugin successfully loaded');

      // Show welcome message for first-time users
      this.showWelcomeMessageIfNeeded();

    } catch (error) {
      this.initializationError = error as Error;

      // Handle initialization failure with recovery
      await this.handleInitializationFailure(this.initializationError);
    }
  }

  onunload() {
    // Note: onunload is synchronous, but we can use gracefulShutdown internally
    // We'll handle the async operations with proper error handling
    this.gracefulShutdown().catch(error => {
      console.error('Daily Prompts: Error during graceful shutdown:', error);
    });
  }

  /**
   * Initialize all plugin services with proper dependency injection
   */
  private async initializeServices(): Promise<void> {
    try {
      // Initialize settings manager first (required by other services)
      this.settingsManager = new SettingsManager(this);

      // Initialize storage manager
      this.storageManager = new StorageManager(this);

      // Initialize progress store (depends on storage manager)
      this.progressStore = new ProgressStore(this, this.storageManager);

      // Initialize prompt service (depends on progress store)
      this.promptService = new PromptService(this.progressStore);

      // Initialize notification service (depends on plugin instance)
      this.notificationService = new NotificationService(this);

      // Initialize import/export service (depends on vault)
      this.importExportService = new ImportExportService(this.app.vault);

      // Daily note service will be initialized after settings are loaded
      // because it needs global settings

      console.log('Daily Prompts: Core services initialized');
    } catch (error) {
      throw new Error(`Failed to initialize services: ${error.message}`);
    }
  }

  /**
   * Load plugin data and initialize remaining services
   */
  private async loadPluginData(): Promise<void> {
    try {
      // Load settings with migration
      await this.settingsManager.loadSettings();
      const settings = this.settingsManager.getSettings();

      // Initialize daily note service with global settings
      this.dailyNoteService = new DailyNoteService(this.app, settings.globalSettings);

      // Load prompt packs into the prompt service
      this.promptService.loadPromptPacks(settings.promptPacks);

      console.log('Daily Prompts: Plugin data loaded successfully');
    } catch (error) {
      throw new Error(`Failed to load plugin data: ${error.message}`);
    }
  }

  /**
   * Register UI components (settings tab, status bar, etc.)
   */
  private registerUIComponents(): void {
    try {
      // Add settings tab
      this.addSettingTab(new DailyPromptsSettingsTab(this.app, this, this.settingsManager));

      console.log('Daily Prompts: UI components registered');
    } catch (error) {
      console.error('Daily Prompts: Failed to register UI components:', error);
      // Don't throw - UI registration failure shouldn't prevent plugin loading
    }
  }

  /**
   * Schedule notifications for all active prompt packs
   */
  private scheduleActiveNotifications(): void {
    try {
      if (!this.notificationService || !this.settingsManager) {
        return;
      }

      const settings = this.settingsManager.getSettings();
      const activePacks = settings.promptPacks.filter(pack => pack.settings.notificationEnabled);

      for (const pack of activePacks) {
        this.notificationService.scheduleNotification(pack);
      }

      if (activePacks.length > 0) {
        console.log(`Daily Prompts: Scheduled notifications for ${activePacks.length} active packs`);
      }
    } catch (error) {
      console.error('Daily Prompts: Failed to schedule notifications:', error);
      // Don't throw - notification scheduling failure shouldn't prevent plugin loading
    }
  }

  /**
   * Show welcome message for first-time users
   */
  private showWelcomeMessageIfNeeded(): void {
    try {
      const settings = this.settingsManager.getSettings();

      // Check if this is a first-time user (no prompt packs created)
      if (settings.promptPacks.length === 0) {
        const welcomeMessage = `
📝 Welcome to Daily Prompts!

Get started by:
1. Opening Settings → Daily Prompts
2. Creating your first prompt pack
3. Setting up notifications

Use Ctrl/Cmd+P and search "Daily Prompts" to see available commands.
        `.trim();

        new Notice(welcomeMessage, 8000);
      }
    } catch (error) {
      console.error('Daily Prompts: Failed to show welcome message:', error);
      // Don't throw - welcome message failure shouldn't prevent plugin loading
    }
  }

  /**
   * Initialize plugin in minimal mode when full initialization fails
   */
  private async initializeMinimalMode(): Promise<void> {
    try {
      console.log('Daily Prompts: Initializing in minimal mode...');

      // Try to initialize only essential services
      if (!this.settingsManager) {
        this.settingsManager = new SettingsManager(this);
        await this.settingsManager.loadSettings();
      }

      // Register basic commands only
      this.addCommand({
        id: 'open-settings',
        name: 'Open Settings',
        callback: () => {
          // @ts-ignore - Access Obsidian's settings
          (this.app as any).setting.open();
          (this.app as any).setting.openTabById('daily-prompts');
        }
      });

      console.log('Daily Prompts: Minimal mode initialized');
    } catch (error) {
      console.error('Daily Prompts: Failed to initialize minimal mode:', error);
    }
  }

  /**
   * Add plugin icon to Obsidian
   */
  private addPluginIcon(): void {
    try {
      addIcon('daily-prompts', `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2L13.09 8.26L20 9L13.09 15.74L12 22L10.91 15.74L4 9L10.91 8.26L12 2Z" fill="currentColor"/>
          <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1"/>
        </svg>
      `);
    } catch (error) {
      console.warn('Daily Prompts: Failed to add plugin icon:', error);
      // Don't throw - icon failure shouldn't prevent plugin loading
    }
  }

  /**
   * Clear any remaining timers or intervals
   */
  private clearAllTimers(): void {
    try {
      // The notification service handles its own cleanup
      // This is a placeholder for any additional timers that might be added
      console.log('Daily Prompts: Cleared all timers');
    } catch (error) {
      console.error('Daily Prompts: Failed to clear timers:', error);
    }
  }

  /**
   * Perform data migration if needed
   */
  private async performDataMigration(): Promise<void> {
    try {
      const settings = this.settingsManager.getSettings();

      // Check if migration is needed based on version
      const currentVersion = settings.version;
      const pluginVersion = this.manifest.version;

      if (currentVersion !== pluginVersion) {
        console.log(`Daily Prompts: Migrating data from version ${currentVersion} to ${pluginVersion}`);

        // Update version in settings
        await this.settingsManager.updateSettings({ version: pluginVersion });

        console.log('Daily Prompts: Data migration completed successfully');
      }
    } catch (error) {
      console.error('Daily Prompts: Data migration failed:', error);
      throw new Error(`Data migration failed: ${error.message}`);
    }
  }

  /**
   * Validate plugin dependencies and environment
   */
  private validatePluginEnvironment(): void {
    const issues: string[] = [];

    // Check if required Obsidian APIs are available
    if (!this.app) {
      issues.push('Obsidian app instance not available');
    }

    if (!this.app?.vault) {
      issues.push('Obsidian vault not available');
    }

    if (!this.app?.workspace) {
      issues.push('Obsidian workspace not available');
    }

    // Check if daily notes plugin is available (optional but recommended)
    const dailyNotesPlugin = (this.app as any)?.plugins?.plugins?.['daily-notes'];
    if (!dailyNotesPlugin) {
      console.warn('Daily Prompts: Daily Notes plugin not found. Some features may be limited.');
    }

    if (issues.length > 0) {
      throw new Error(`Plugin environment validation failed: ${issues.join(', ')}`);
    }
  }

  /**
   * Initialize plugin with comprehensive error handling and recovery
   */
  private async initializeWithErrorHandling(): Promise<void> {
    const initSteps = [
      { name: 'Environment Validation', fn: () => this.validatePluginEnvironment() },
      { name: 'Service Initialization', fn: () => this.initializeServices() },
      { name: 'Data Loading', fn: () => this.loadPluginData() },
      { name: 'Data Migration', fn: () => this.performDataMigration() },
      { name: 'UI Registration', fn: () => this.registerUIComponents() },
      { name: 'Command Registration', fn: () => this.registerCommands() },
      { name: 'Notification Scheduling', fn: () => this.scheduleActiveNotifications() }
    ];

    for (const step of initSteps) {
      try {
        console.log(`Daily Prompts: ${step.name}...`);
        await step.fn();
      } catch (error) {
        console.error(`Daily Prompts: ${step.name} failed:`, error);

        // Determine if this is a critical failure
        const criticalSteps = ['Environment Validation', 'Service Initialization', 'Data Loading'];

        if (criticalSteps.includes(step.name)) {
          throw new Error(`Critical initialization step failed: ${step.name} - ${error.message}`);
        } else {
          // Non-critical failures - log and continue
          console.warn(`Daily Prompts: Non-critical step failed: ${step.name}. Continuing with reduced functionality.`);
        }
      }
    }
  }

  /**
   * Handle plugin initialization failure with recovery options
   */
  private async handleInitializationFailure(error: Error): Promise<void> {
    console.error('Daily Prompts: Plugin initialization failed:', error);

    // Try different recovery strategies
    const recoveryStrategies = [
      {
        name: 'Reset Settings',
        fn: async () => {
          if (this.settingsManager) {
            await this.settingsManager.resetSettings();
            await this.loadPluginData();
          }
        }
      },
      {
        name: 'Minimal Mode',
        fn: () => this.initializeMinimalMode()
      }
    ];

    for (const strategy of recoveryStrategies) {
      try {
        console.log(`Daily Prompts: Attempting recovery strategy: ${strategy.name}`);
        await strategy.fn();
        console.log(`Daily Prompts: Recovery successful with strategy: ${strategy.name}`);
        return;
      } catch (recoveryError) {
        console.error(`Daily Prompts: Recovery strategy ${strategy.name} failed:`, recoveryError);
      }
    }

    // If all recovery strategies fail, show error to user
    const errorMessage = `
Daily Prompts plugin failed to initialize and all recovery attempts failed.

Error: ${error.message}

Please try:
1. Restarting Obsidian
2. Disabling and re-enabling the plugin
3. Checking the console for detailed error information

If the problem persists, please report this issue.
    `.trim();

    new Notice(errorMessage, 15000);
  }

  /**
   * Graceful shutdown with proper cleanup
   */
  private async gracefulShutdown(): Promise<void> {
    try {
      console.log('Daily Prompts: Starting graceful shutdown...');

      // Cancel all notifications
      if (this.notificationService) {
        this.notificationService.destroy();
      }

      // Disable zen mode if active
      if (this.dailyNoteService) {
        this.dailyNoteService.disableZenMode();
      }

      // Save any pending settings
      if (this.settingsManager && this.isInitialized) {
        try {
          await this.settingsManager.saveSettings();
          console.log('Daily Prompts: Settings saved during shutdown');
        } catch (error) {
          console.error('Daily Prompts: Failed to save settings during shutdown:', error);
        }
      }

      // Clear timers
      this.clearAllTimers();

      console.log('Daily Prompts: Graceful shutdown completed');
    } catch (error) {
      console.error('Daily Prompts: Error during graceful shutdown:', error);
    }
  }

  /**
   * Get plugin health status for debugging
   */
  getPluginHealth(): {
    initialized: boolean;
    error: string | null;
    services: {
      settingsManager: boolean;
      promptService: boolean;
      dailyNoteService: boolean;
      notificationService: boolean;
      importExportService: boolean;
      progressStore: boolean;
    };
    stats: any;
  } {
    try {
      const services = {
        settingsManager: !!this.settingsManager,
        promptService: !!this.promptService,
        dailyNoteService: !!this.dailyNoteService,
        notificationService: !!this.notificationService,
        importExportService: !!this.importExportService,
        progressStore: !!this.progressStore
      };

      let stats = null;
      if (this.settingsManager && this.isInitialized) {
        try {
          stats = this.settingsManager.getSettingsStats();
        } catch (error) {
          stats = { error: error.message };
        }
      }

      return {
        initialized: this.isInitialized,
        error: this.initializationError?.message || null,
        services,
        stats
      };
    } catch (error) {
      return {
        initialized: false,
        error: `Failed to get health status: ${error.message}`,
        services: {
          settingsManager: false,
          promptService: false,
          dailyNoteService: false,
          notificationService: false,
          importExportService: false,
          progressStore: false
        },
        stats: null
      };
    }
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

    // Debug command for plugin health
    this.addCommand({
      id: 'show-plugin-health',
      name: 'Show Plugin Health Status',
      callback: () => this.showPluginHealthStatus()
    });
  }

  /**
   * Get current plugin settings
   */
  getSettings(): PluginSettings {
    if (!this.settingsManager) {
      throw new Error('Settings manager not initialized');
    }
    return this.settingsManager.getSettings();
  }

  /**
   * Save plugin settings
   */
  async saveSettings(): Promise<void> {
    if (!this.settingsManager) {
      throw new Error('Settings manager not initialized');
    }
    await this.settingsManager.saveSettings();
  }

  /**
   * Check if plugin is properly initialized
   */
  isPluginInitialized(): boolean {
    return this.isInitialized && !this.initializationError;
  }

  /**
   * Get initialization error if any
   */
  getInitializationError(): Error | null {
    return this.initializationError;
  }

  // Command handlers for Task 10.1 - Core plugin commands

  /**
   * Open today's prompt from available prompt packs
   */
  private async openTodaysPrompt() {
    try {
      if (!this.isPluginInitialized()) {
        new Notice('Daily Prompts plugin is not properly initialized. Check console for errors.');
        return;
      }

      const settings = this.getSettings();
      const activePacks = settings.promptPacks.filter(pack =>
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
    try {
      if (!this.isPluginInitialized()) {
        new Notice('Daily Prompts plugin is not properly initialized. Check console for errors.');
        return;
      }

      const modal = new PromptPackModal(
        this.app,
        this.settingsManager,
        null,
        () => {
          // Refresh services after pack creation
          const settings = this.getSettings();
          this.promptService.loadPromptPacks(settings.promptPacks);

          // Reschedule notifications for the new pack
          this.scheduleActiveNotifications();
        }
      );
      modal.open();
    } catch (error) {
      console.error('Failed to create new prompt pack:', error);
      new Notice(`Failed to create new prompt pack: ${error.message}`);
    }
  }

  /**
   * Import a prompt pack from JSON file
   */
  private async importPromptPack() {
    try {
      if (!this.isPluginInitialized()) {
        new Notice('Daily Prompts plugin is not properly initialized. Check console for errors.');
        return;
      }

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
      const settings = this.getSettings();
      const result = await this.importExportService.importPackWithConflictResolution(
        jsonData,
        settings.promptPacks
      );

      // Add the imported pack to settings
      await this.settingsManager.addPromptPack(result.pack);

      // Refresh services
      const updatedSettings = this.getSettings();
      this.promptService.loadPromptPacks(updatedSettings.promptPacks);

      // Schedule notifications for the new pack if enabled
      if (result.pack.settings.notificationEnabled) {
        this.notificationService.scheduleNotification(result.pack);
      }

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
      if (!this.isPluginInitialized()) {
        new Notice('Daily Prompts plugin is not properly initialized. Check console for errors.');
        return;
      }

      const settings = this.getSettings();
      if (settings.promptPacks.length === 0) {
        new Notice('No prompt packs to export. Create a prompt pack first.');
        return;
      }

      // For now, export the first pack (in a full implementation, you'd show a picker)
      const packToExport = settings.promptPacks[0];

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
      if (!this.isPluginInitialized()) {
        new Notice('Daily Prompts plugin is not properly initialized. Check console for errors.');
        return;
      }

      const settings = this.getSettings();

      // Find the most recently accessed pack
      const recentPack = settings.promptPacks
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
      if (!this.isPluginInitialized()) {
        new Notice('Daily Prompts plugin is not properly initialized. Check console for errors.');
        return;
      }

      const settings = this.getSettings();

      // Find the most recently accessed pack
      const recentPack = settings.promptPacks
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
      if (!this.isPluginInitialized()) {
        new Notice('Daily Prompts plugin is not properly initialized. Check console for errors.');
        return;
      }

      const settings = this.getSettings();
      if (settings.promptPacks.length === 0) {
        new Notice('No prompt packs found. Create a prompt pack first.');
        return;
      }

      // For now, reset the first pack (in a full implementation, you'd show a picker)
      const packToReset = settings.promptPacks[0];

      // Reset progress
      await this.promptService.resetProgress(packToReset.id);

      new Notice(`Reset progress for "${packToReset.name}"`);

    } catch (error) {
      console.error('Failed to reset prompt pack progress:', error);
      new Notice(`Failed to reset prompt pack progress: ${error.message}`);
    }
  }

  /**
   * Show plugin health status for debugging
   */
  private showPluginHealthStatus() {
    try {
      const health = this.getPluginHealth();

      const statusMessage = `
Daily Prompts Plugin Health Status:

Initialized: ${health.initialized ? '✅' : '❌'}
Error: ${health.error || 'None'}

Services:
- Settings Manager: ${health.services.settingsManager ? '✅' : '❌'}
- Prompt Service: ${health.services.promptService ? '✅' : '❌'}
- Daily Note Service: ${health.services.dailyNoteService ? '✅' : '❌'}
- Notification Service: ${health.services.notificationService ? '✅' : '❌'}
- Import/Export Service: ${health.services.importExportService ? '✅' : '❌'}
- Progress Store: ${health.services.progressStore ? '✅' : '❌'}

${health.stats ? `
Statistics:
- Total Packs: ${health.stats.totalPacks}
- Total Prompts: ${health.stats.totalPrompts}
- Completed Prompts: ${health.stats.completedPrompts}
- Overall Progress: ${health.stats.overallProgress}%
` : ''}
      `.trim();

      new Notice(statusMessage, 10000);
      console.log('Daily Prompts Health Status:', health);
    } catch (error) {
      console.error('Failed to show plugin health status:', error);
      new Notice(`Failed to show plugin health status: ${error.message}`);
    }
  }
}