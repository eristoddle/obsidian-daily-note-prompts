/**
 * API Error Handler for the Daily Prompts plugin
 * Provides fallback mechanisms for missing Obsidian APIs and graceful degradation
 */

import { App, Plugin, Notice } from 'obsidian';
import { ErrorHandler, ErrorType, ErrorSeverity } from './error-handler';

export interface APICapabilities {
  dailyNotesPlugin: boolean;
  systemNotifications: boolean;
  workspaceAPI: boolean;
  fileSystemAPI: boolean;
  editorAPI: boolean;
}

export interface FallbackOptions {
  useDailyNotesPlugin: boolean;
  useSystemNotifications: boolean;
  useZenMode: boolean;
  useAdvancedEditor: boolean;
}

/**
 * Service for handling API-related errors and providing fallback mechanisms
 */
export class APIErrorHandler {
  private app: App;
  private plugin: Plugin;
  private errorHandler: ErrorHandler;
  private capabilities: APICapabilities;
  private fallbackOptions: FallbackOptions;

  constructor(app: App, plugin: Plugin, errorHandler: ErrorHandler) {
    this.app = app;
    this.plugin = plugin;
    this.errorHandler = errorHandler;

    // Initialize with optimistic capabilities
    this.capabilities = {
      dailyNotesPlugin: true,
      systemNotifications: true,
      workspaceAPI: true,
      fileSystemAPI: true,
      editorAPI: true
    };

    // Initialize fallback options
    this.fallbackOptions = {
      useDailyNotesPlugin: true,
      useSystemNotifications: true,
      useZenMode: true,
      useAdvancedEditor: true
    };

    this.detectCapabilities();
  }

  /**
   * Detect available API capabilities
   */
  private detectCapabilities(): void {
    // Check daily notes plugin
    try {
      const plugins = (this.app as any).plugins;
      const dailyNotesPlugin = plugins?.getPlugin?.('daily-notes') || plugins?.plugins?.['daily-notes'];
      this.capabilities.dailyNotesPlugin = !!(dailyNotesPlugin && plugins?.enabledPlugins?.has('daily-notes'));
    } catch (error) {
      this.capabilities.dailyNotesPlugin = false;
      console.warn('Daily Prompts: Daily notes plugin detection failed:', error);
    }

    // Check system notifications
    try {
      this.capabilities.systemNotifications = !!(
        typeof window !== 'undefined' &&
        'Notification' in window &&
        Notification.permission !== 'denied'
      );
    } catch (error) {
      this.capabilities.systemNotifications = false;
      console.warn('Daily Prompts: System notifications detection failed:', error);
    }

    // Check workspace API
    try {
      this.capabilities.workspaceAPI = !!(
        this.app.workspace &&
        this.app.workspace.leftSplit &&
        this.app.workspace.rightSplit
      );
    } catch (error) {
      this.capabilities.workspaceAPI = false;
      console.warn('Daily Prompts: Workspace API detection failed:', error);
    }

    // Check file system API
    try {
      this.capabilities.fileSystemAPI = !!(
        this.app.vault &&
        this.app.vault.create &&
        this.app.vault.read &&
        this.app.vault.modify
      );
    } catch (error) {
      this.capabilities.fileSystemAPI = false;
      console.warn('Daily Prompts: File system API detection failed:', error);
    }

    // Check editor API
    try {
      this.capabilities.editorAPI = !!(
        this.app.workspace.activeLeaf &&
        this.app.workspace.getLeaf
      );
    } catch (error) {
      this.capabilities.editorAPI = false;
      console.warn('Daily Prompts: Editor API detection failed:', error);
    }

    // Update fallback options based on capabilities
    this.updateFallbackOptions();
  }

  /**
   * Update fallback options based on detected capabilities
   */
  private updateFallbackOptions(): void {
    this.fallbackOptions.useDailyNotesPlugin = this.capabilities.dailyNotesPlugin;
    this.fallbackOptions.useSystemNotifications = this.capabilities.systemNotifications;
    this.fallbackOptions.useZenMode = this.capabilities.workspaceAPI;
    this.fallbackOptions.useAdvancedEditor = this.capabilities.editorAPI;
  }

  /**
   * Handle daily notes API errors
   */
  async handleDailyNotesError(error: Error, operation: string): Promise<any> {
    const context = this.errorHandler.createContext(`daily_notes_${operation}`, 'api-error-handler');

    try {
      // If daily notes plugin is not available, switch to manual mode
      if (!this.capabilities.dailyNotesPlugin) {
        this.fallbackOptions.useDailyNotesPlugin = false;

        return await this.errorHandler.handleError(error, context, {
          attemptRecovery: true,
          notifyUser: false, // Handle notification ourselves
          severity: ErrorSeverity.MEDIUM
        });
      }

      // Try to recover daily notes plugin functionality
      return await this.recoverDailyNotesPlugin(error, context);
    } catch (recoveryError) {
      console.error('Daily notes API recovery failed:', recoveryError);
      this.fallbackOptions.useDailyNotesPlugin = false;
      throw recoveryError;
    }
  }

  /**
   * Handle notification API errors
   */
  async handleNotificationError(error: Error, operation: string): Promise<any> {
    const context = this.errorHandler.createContext(`notification_${operation}`, 'api-error-handler');

    try {
      // Check if system notifications are available
      if (!this.capabilities.systemNotifications) {
        this.fallbackOptions.useSystemNotifications = false;

        return await this.errorHandler.handleError(error, context, {
          attemptRecovery: true,
          notifyUser: false,
          severity: ErrorSeverity.LOW
        });
      }

      // Try to recover notification functionality
      return await this.recoverNotificationAPI(error, context);
    } catch (recoveryError) {
      console.error('Notification API recovery failed:', recoveryError);
      this.fallbackOptions.useSystemNotifications = false;
      throw recoveryError;
    }
  }

  /**
   * Handle workspace API errors
   */
  async handleWorkspaceError(error: Error, operation: string): Promise<any> {
    const context = this.errorHandler.createContext(`workspace_${operation}`, 'api-error-handler');

    try {
      // If workspace API is not available, disable zen mode
      if (!this.capabilities.workspaceAPI) {
        this.fallbackOptions.useZenMode = false;

        return await this.errorHandler.handleError(error, context, {
          attemptRecovery: true,
          notifyUser: false,
          severity: ErrorSeverity.LOW
        });
      }

      // Try to recover workspace functionality
      return await this.recoverWorkspaceAPI(error, context);
    } catch (recoveryError) {
      console.error('Workspace API recovery failed:', recoveryError);
      this.fallbackOptions.useZenMode = false;
      throw recoveryError;
    }
  }

  /**
   * Handle file system API errors
   */
  async handleFileSystemError(error: Error, operation: string): Promise<any> {
    const context = this.errorHandler.createContext(`filesystem_${operation}`, 'api-error-handler');

    try {
      // File system API is critical - try recovery
      return await this.recoverFileSystemAPI(error, context);
    } catch (recoveryError) {
      console.error('File system API recovery failed:', recoveryError);

      // File system errors are critical
      await this.errorHandler.handleError(recoveryError, context, {
        attemptRecovery: false,
        notifyUser: true,
        severity: ErrorSeverity.CRITICAL
      });

      throw recoveryError;
    }
  }

  /**
   * Attempt to recover daily notes plugin functionality
   */
  private async recoverDailyNotesPlugin(error: Error, context: any): Promise<any> {
    try {
      // Re-detect daily notes plugin
      this.detectCapabilities();

      if (this.capabilities.dailyNotesPlugin) {
        return { useManualNoteCreation: false };
      } else {
        console.log('Daily Prompts: Daily notes plugin not available, switching to manual note creation');
        return { useManualNoteCreation: true };
      }
    } catch (recoveryError) {
      return { useManualNoteCreation: true };
    }
  }

  /**
   * Attempt to recover notification functionality
   */
  private async recoverNotificationAPI(error: Error, context: any): Promise<any> {
    try {
      // Check if we can request permissions
      if (typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission === 'default') {
          // Try to request permission
          const permission = await Notification.requestPermission();
          if (permission === 'granted') {
            this.capabilities.systemNotifications = true;
            this.fallbackOptions.useSystemNotifications = true;
            return { notificationType: 'system' };
          }
        }
      }

      // Fall back to Obsidian notifications
      console.log('Daily Prompts: System notifications not available, using Obsidian notifications');
      return { notificationType: 'obsidian', fallbackApplied: true };
    } catch (recoveryError) {
      return { notificationType: 'obsidian', fallbackApplied: true };
    }
  }

  /**
   * Attempt to recover workspace functionality
   */
  private async recoverWorkspaceAPI(error: Error, context: any): Promise<any> {
    try {
      // Re-check workspace API availability
      this.detectCapabilities();

      if (this.capabilities.workspaceAPI) {
        return { useZenMode: true };
      } else {
        console.log('Daily Prompts: Workspace API not available, disabling zen mode');
        return { skipZenMode: true };
      }
    } catch (recoveryError) {
      return { skipZenMode: true };
    }
  }

  /**
   * Attempt to recover file system functionality
   */
  private async recoverFileSystemAPI(error: Error, context: any): Promise<any> {
    try {
      // Re-check file system API
      this.detectCapabilities();

      if (!this.capabilities.fileSystemAPI) {
        throw new Error('File system API is not available - plugin cannot function');
      }

      // Try a simple file operation to test
      const testPath = '.obsidian/plugins/daily-prompts/test.tmp';
      try {
        await this.app.vault.create(testPath, 'test');
        const testFile = this.app.vault.getAbstractFileByPath(testPath);
        if (testFile) {
          await this.app.vault.delete(testFile);
        }
        return { fileSystemWorking: true };
      } catch (testError) {
        throw new Error('File system API test failed');
      }
    } catch (recoveryError) {
      throw new Error(`File system recovery failed: ${recoveryError.message}`);
    }
  }

  /**
   * Get current API capabilities
   */
  getCapabilities(): APICapabilities {
    return { ...this.capabilities };
  }

  /**
   * Get current fallback options
   */
  getFallbackOptions(): FallbackOptions {
    return { ...this.fallbackOptions };
  }

  /**
   * Force refresh of API capabilities
   */
  refreshCapabilities(): void {
    this.detectCapabilities();
  }

  /**
   * Check if a specific API is available
   */
  isAPIAvailable(api: keyof APICapabilities): boolean {
    return this.capabilities[api];
  }

  /**
   * Check if fallback should be used for a specific feature
   */
  shouldUseFallback(feature: keyof FallbackOptions): boolean {
    return !this.fallbackOptions[feature];
  }

  /**
   * Show user-friendly message about API limitations
   */
  showAPILimitationNotice(api: keyof APICapabilities, feature: string): void {
    const messages = {
      dailyNotesPlugin: `Daily notes plugin not available. Using manual note creation for ${feature}.`,
      systemNotifications: `System notifications not available. Using Obsidian notifications for ${feature}.`,
      workspaceAPI: `Workspace API not available. Zen mode disabled for ${feature}.`,
      fileSystemAPI: `File system API not available. ${feature} may not work properly.`,
      editorAPI: `Editor API not available. Advanced editing features disabled for ${feature}.`
    };

    const message = messages[api] || `API limitation detected for ${feature}.`;
    new Notice(message, 5000);
  }

  /**
   * Get recommended settings based on API capabilities
   */
  getRecommendedSettings(): Partial<any> {
    const recommendations: any = {};

    if (!this.capabilities.systemNotifications) {
      recommendations.defaultNotificationType = 'obsidian';
    }

    if (!this.capabilities.workspaceAPI) {
      recommendations.defaultZenMode = false;
    }

    if (!this.capabilities.dailyNotesPlugin) {
      recommendations.dailyNoteFolder = '';
      recommendations.dailyNoteTemplate = '';
    }

    return recommendations;
  }

  /**
   * Validate plugin requirements
   */
  validateRequirements(): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    if (!this.capabilities.fileSystemAPI) {
      issues.push('File system API is required but not available');
    }

    if (!this.capabilities.editorAPI) {
      issues.push('Editor API is required but not available');
    }

    // Warnings for optional features
    if (!this.capabilities.dailyNotesPlugin) {
      issues.push('Daily notes plugin not available - using manual note creation');
    }

    if (!this.capabilities.systemNotifications) {
      issues.push('System notifications not available - using Obsidian notifications');
    }

    if (!this.capabilities.workspaceAPI) {
      issues.push('Workspace API not available - zen mode disabled');
    }

    return {
      valid: this.capabilities.fileSystemAPI && this.capabilities.editorAPI,
      issues
    };
  }
}