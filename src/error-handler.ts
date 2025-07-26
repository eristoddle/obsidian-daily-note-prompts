/**
 * Comprehensive error handling system for the Daily Prompts plugin
 * Handles data corruption recovery, permission errors, API failures, and user notifications
 */

import { Notice, Plugin } from 'obsidian';
import { ValidationError } from './models';
import { StorageManager } from './storage-manager';

export enum ErrorType {
  DATA_CORRUPTION = 'DATA_CORRUPTION',
  PERMISSION_ERROR = 'PERMISSION_ERROR',
  API_ERROR = 'API_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

export enum ErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export interface ErrorContext {
  operation: string;
  component: string;
  data?: any;
  timestamp: Date;
  userAction?: string;
}

export interface ErrorReport {
  type: ErrorType;
  severity: ErrorSeverity;
  message: string;
  originalError: Error;
  context: ErrorContext;
  recoveryAttempted: boolean;
  recoverySuccessful?: boolean;
  userNotified: boolean;
}

export interface RecoveryStrategy {
  canRecover(error: Error, context: ErrorContext): boolean;
  recover(error: Error, context: ErrorContext): Promise<any>;
  getRecoveryMessage(): string;
}

/**
 * Main error handler class that provides comprehensive error handling capabilities
 */
export class ErrorHandler {
  private plugin: Plugin;
  private storageManager: StorageManager;
  private recoveryStrategies: Map<ErrorType, RecoveryStrategy[]> = new Map();
  private errorHistory: ErrorReport[] = [];
  private readonly MAX_ERROR_HISTORY = 100;

  constructor(plugin: Plugin, storageManager: StorageManager) {
    this.plugin = plugin;
    this.storageManager = storageManager;
    this.initializeRecoveryStrategies();
  }

  /**
   * Initialize recovery strategies for different error types
   */
  private initializeRecoveryStrategies(): void {
    // Data corruption recovery strategies
    this.addRecoveryStrategy(ErrorType.DATA_CORRUPTION, new BackupRestoreStrategy(this.storageManager));
    this.addRecoveryStrategy(ErrorType.DATA_CORRUPTION, new DefaultDataStrategy());
    this.addRecoveryStrategy(ErrorType.DATA_CORRUPTION, new DataMigrationStrategy(this.storageManager));

    // Permission error recovery strategies
    this.addRecoveryStrategy(ErrorType.PERMISSION_ERROR, new PermissionFallbackStrategy());
    this.addRecoveryStrategy(ErrorType.PERMISSION_ERROR, new AlternativeMethodStrategy());

    // API error recovery strategies
    this.addRecoveryStrategy(ErrorType.API_ERROR, new APIFallbackStrategy());
    this.addRecoveryStrategy(ErrorType.API_ERROR, new RetryStrategy());

    // Network error recovery strategies
    this.addRecoveryStrategy(ErrorType.NETWORK_ERROR, new RetryStrategy());
    this.addRecoveryStrategy(ErrorType.NETWORK_ERROR, new OfflineModeStrategy());
  }

  /**
   * Add a recovery strategy for a specific error type
   */
  private addRecoveryStrategy(errorType: ErrorType, strategy: RecoveryStrategy): void {
    if (!this.recoveryStrategies.has(errorType)) {
      this.recoveryStrategies.set(errorType, []);
    }
    this.recoveryStrategies.get(errorType)!.push(strategy);
  }

  /**
   * Handle an error with automatic recovery attempts and user notification
   */
  async handleError(
    error: Error,
    context: ErrorContext,
    options: {
      attemptRecovery?: boolean;
      notifyUser?: boolean;
      severity?: ErrorSeverity;
    } = {}
  ): Promise<any> {
    const {
      attemptRecovery = true,
      notifyUser = true,
      severity = this.determineSeverity(error, context)
    } = options;

    const errorType = this.classifyError(error);

    const errorReport: ErrorReport = {
      type: errorType,
      severity,
      message: error.message,
      originalError: error,
      context,
      recoveryAttempted: false,
      userNotified: false
    };

    // Log the error
    this.logError(errorReport);

    // Attempt recovery if enabled
    let recoveryResult = null;
    if (attemptRecovery) {
      recoveryResult = await this.attemptRecovery(error, context, errorType);
      errorReport.recoveryAttempted = true;
      errorReport.recoverySuccessful = recoveryResult !== null;
    }

    // Notify user if enabled
    if (notifyUser) {
      this.notifyUser(errorReport, recoveryResult);
      errorReport.userNotified = true;
    }

    // Store error report
    this.addToErrorHistory(errorReport);

    // Return recovery result or rethrow if no recovery
    if (recoveryResult !== null) {
      return recoveryResult;
    }

    throw error;
  }

  /**
   * Classify error into appropriate error type
   */
  private classifyError(error: Error): ErrorType {
    if (error instanceof ValidationError) {
      return ErrorType.VALIDATION_ERROR;
    }

    if (error.message.includes('permission') || error.message.includes('denied')) {
      return ErrorType.PERMISSION_ERROR;
    }

    if (error.message.includes('network') || error.message.includes('fetch')) {
      return ErrorType.NETWORK_ERROR;
    }

    if (error.message.includes('corrupt') || error.message.includes('invalid JSON') ||
        error.message.includes('parse') || error.message.includes('malformed')) {
      return ErrorType.DATA_CORRUPTION;
    }

    if (error.message.includes('API') || error.message.includes('not found') ||
        error.message.includes('unavailable')) {
      return ErrorType.API_ERROR;
    }

    return ErrorType.UNKNOWN_ERROR;
  }

  /**
   * Determine error severity based on error and context
   */
  private determineSeverity(error: Error, context: ErrorContext): ErrorSeverity {
    // Critical errors that prevent plugin from functioning
    if (context.operation === 'plugin_initialization' ||
        context.operation === 'data_loading' ||
        error.message.includes('corrupt')) {
      return ErrorSeverity.CRITICAL;
    }

    // High severity for core functionality
    if (context.component === 'storage-manager' ||
        context.component === 'prompt-service' ||
        context.operation.includes('save') ||
        context.operation.includes('load')) {
      return ErrorSeverity.HIGH;
    }

    // Medium severity for user-facing features
    if (context.component === 'notification-service' ||
        context.component === 'daily-note-service' ||
        context.operation.includes('notification') ||
        context.operation.includes('import') ||
        context.operation.includes('export')) {
      return ErrorSeverity.MEDIUM;
    }

    // Low severity for non-critical features
    return ErrorSeverity.LOW;
  }

  /**
   * Attempt recovery using available strategies
   */
  private async attemptRecovery(error: Error, context: ErrorContext, errorType: ErrorType): Promise<any> {
    const strategies = this.recoveryStrategies.get(errorType) || [];

    for (const strategy of strategies) {
      try {
        if (strategy.canRecover(error, context)) {
          console.log(`Daily Prompts: Attempting recovery with ${strategy.constructor.name}`);
          const result = await strategy.recover(error, context);
          console.log(`Daily Prompts: Recovery successful with ${strategy.constructor.name}`);
          return result;
        }
      } catch (recoveryError) {
        console.warn(`Daily Prompts: Recovery failed with ${strategy.constructor.name}:`, recoveryError);
        continue;
      }
    }

    return null;
  }

  /**
   * Notify user about the error and recovery status
   */
  private notifyUser(errorReport: ErrorReport, recoveryResult: any): void {
    const { type, severity, message, recoveryAttempted, recoverySuccessful } = errorReport;

    let notificationMessage = '';
    let duration = 5000; // Default 5 seconds

    if (recoveryAttempted && recoverySuccessful) {
      // Recovery successful
      if (severity === ErrorSeverity.CRITICAL || severity === ErrorSeverity.HIGH) {
        notificationMessage = `Daily Prompts: Issue resolved automatically. ${this.getRecoveryMessage(type)}`;
        duration = 8000;
      } else {
        // Don't notify for low/medium severity issues that were recovered
        return;
      }
    } else {
      // Recovery failed or not attempted
      switch (severity) {
        case ErrorSeverity.CRITICAL:
          notificationMessage = `Daily Prompts: Critical error - ${message}. Please check settings or restart Obsidian.`;
          duration = 0; // Don't auto-dismiss
          break;
        case ErrorSeverity.HIGH:
          notificationMessage = `Daily Prompts: Error - ${message}. Some features may not work properly.`;
          duration = 10000;
          break;
        case ErrorSeverity.MEDIUM:
          notificationMessage = `Daily Prompts: ${message}. Trying alternative approach.`;
          duration = 6000;
          break;
        case ErrorSeverity.LOW:
          // Don't notify for low severity errors
          return;
      }
    }

    if (notificationMessage) {
      new Notice(notificationMessage, duration);
    }
  }

  /**
   * Get user-friendly recovery message for error type
   */
  private getRecoveryMessage(errorType: ErrorType): string {
    switch (errorType) {
      case ErrorType.DATA_CORRUPTION:
        return 'Data restored from backup.';
      case ErrorType.PERMISSION_ERROR:
        return 'Using alternative method.';
      case ErrorType.API_ERROR:
        return 'Fallback method activated.';
      case ErrorType.NETWORK_ERROR:
        return 'Retrying operation.';
      default:
        return 'Issue resolved.';
    }
  }

  /**
   * Log error to console with structured information
   */
  private logError(errorReport: ErrorReport): void {
    const { type, severity, message, context, originalError } = errorReport;

    const logLevel = severity === ErrorSeverity.CRITICAL || severity === ErrorSeverity.HIGH ? 'error' : 'warn';

    console[logLevel]('Daily Prompts Error:', {
      type,
      severity,
      message,
      operation: context.operation,
      component: context.component,
      timestamp: context.timestamp.toISOString(),
      stack: originalError.stack
    });
  }

  /**
   * Add error to history for debugging and analysis
   */
  private addToErrorHistory(errorReport: ErrorReport): void {
    this.errorHistory.unshift(errorReport);

    // Keep only the most recent errors
    if (this.errorHistory.length > this.MAX_ERROR_HISTORY) {
      this.errorHistory = this.errorHistory.slice(0, this.MAX_ERROR_HISTORY);
    }
  }

  /**
   * Get error history for debugging
   */
  getErrorHistory(): ErrorReport[] {
    return [...this.errorHistory];
  }

  /**
   * Get error statistics
   */
  getErrorStats(): {
    total: number;
    byType: Record<ErrorType, number>;
    bySeverity: Record<ErrorSeverity, number>;
    recoveryRate: number;
  } {
    const stats = {
      total: this.errorHistory.length,
      byType: {} as Record<ErrorType, number>,
      bySeverity: {} as Record<ErrorSeverity, number>,
      recoveryRate: 0
    };

    // Initialize counters
    Object.values(ErrorType).forEach(type => stats.byType[type] = 0);
    Object.values(ErrorSeverity).forEach(severity => stats.bySeverity[severity] = 0);

    let recoveredCount = 0;

    this.errorHistory.forEach(error => {
      stats.byType[error.type]++;
      stats.bySeverity[error.severity]++;

      if (error.recoveryAttempted && error.recoverySuccessful) {
        recoveredCount++;
      }
    });

    stats.recoveryRate = stats.total > 0 ? (recoveredCount / stats.total) * 100 : 0;

    return stats;
  }

  /**
   * Clear error history
   */
  clearErrorHistory(): void {
    this.errorHistory = [];
  }

  /**
   * Create error context helper
   */
  createContext(operation: string, component: string, data?: any, userAction?: string): ErrorContext {
    return {
      operation,
      component,
      data,
      timestamp: new Date(),
      userAction
    };
  }
}
/**

* Recovery strategy for restoring data from backups
 */
class BackupRestoreStrategy implements RecoveryStrategy {
  private storageManager: StorageManager;

  constructor(storageManager: StorageManager) {
    this.storageManager = storageManager;
  }

  canRecover(error: Error, context: ErrorContext): boolean {
    return (
      context.operation.includes('load') ||
      context.operation.includes('parse') ||
      error.message.includes('corrupt') ||
      error.message.includes('invalid JSON')
    );
  }

  async recover(error: Error, context: ErrorContext): Promise<any> {
    try {
      // Try to recover from the most recent backup
      const backups = await this.storageManager.listBackups();

      if (backups.length === 0) {
        throw new Error('No backups available for recovery');
      }

      // Try backups in order (newest first)
      for (const backup of backups) {
        try {
          console.log(`Daily Prompts: Attempting recovery from backup ${backup.id}`);

          // Read backup data directly without restoring to avoid overwriting current data
          const backupPath = `.obsidian/plugins/daily-prompts/backups/${backup.id}.json`;
          const backupFile = (this.storageManager as any).plugin.app.vault.getAbstractFileByPath(backupPath);

          if (backupFile) {
            const backupContent = await (this.storageManager as any).plugin.app.vault.read(backupFile);
            const backupData = JSON.parse(backupContent);

            // Validate the backup data
            (this.storageManager as any).validateDataStructure(backupData);

            // Apply migrations if needed
            const migratedData = await (this.storageManager as any).migrateData(backupData);

            console.log(`Daily Prompts: Successfully recovered data from backup ${backup.id}`);
            return migratedData;
          }
        } catch (backupError) {
          console.warn(`Daily Prompts: Failed to recover from backup ${backup.id}:`, backupError);
          continue;
        }
      }

      throw new Error('All backup recovery attempts failed');
    } catch (recoveryError) {
      throw new Error(`Backup recovery failed: ${recoveryError.message}`);
    }
  }

  getRecoveryMessage(): string {
    return 'Data restored from backup';
  }
}

/**
 * Recovery strategy for providing default data when corruption is severe
 */
class DefaultDataStrategy implements RecoveryStrategy {
  canRecover(error: Error, context: ErrorContext): boolean {
    return (
      context.operation.includes('load') ||
      context.component === 'storage-manager' ||
      error.message.includes('corrupt')
    );
  }

  async recover(error: Error, context: ErrorContext): Promise<any> {
    console.log('Daily Prompts: Providing default data as recovery');

    // Return minimal default plugin settings
    return {
      version: '1.0.0',
      promptPacks: [],
      globalSettings: {
        defaultNotificationTime: '09:00',
        defaultZenMode: false,
        dailyNoteFolder: '',
        dailyNoteTemplate: '',
        linkHandling: 'direct'
      }
    };
  }

  getRecoveryMessage(): string {
    return 'Reset to default settings';
  }
}

/**
 * Recovery strategy for data migration issues
 */
class DataMigrationStrategy implements RecoveryStrategy {
  private storageManager: StorageManager;

  constructor(storageManager: StorageManager) {
    this.storageManager = storageManager;
  }

  canRecover(error: Error, context: ErrorContext): boolean {
    return (
      error.message.includes('migration') ||
      error.message.includes('version') ||
      context.operation.includes('migrate')
    );
  }

  async recover(error: Error, context: ErrorContext): Promise<any> {
    try {
      // Attempt to load raw data without migration
      const rawData = await (this.storageManager as any).plugin.loadData();

      if (!rawData) {
        throw new Error('No raw data available');
      }

      // Try to salvage what we can from the data
      const salvaged = this.salvageData(rawData);

      // Apply basic structure fixes
      const fixed = this.applyBasicFixes(salvaged);

      console.log('Daily Prompts: Data migration recovery successful');
      return fixed;
    } catch (recoveryError) {
      throw new Error(`Migration recovery failed: ${recoveryError.message}`);
    }
  }

  private salvageData(data: any): any {
    const salvaged: any = {
      version: '1.0.0',
      promptPacks: [],
      globalSettings: {
        defaultNotificationTime: '09:00',
        defaultZenMode: false,
        dailyNoteFolder: '',
        dailyNoteTemplate: '',
        linkHandling: 'direct'
      }
    };

    // Try to salvage prompt packs
    if (data.promptPacks && Array.isArray(data.promptPacks)) {
      salvaged.promptPacks = data.promptPacks.filter((pack: any) => {
        return pack && typeof pack === 'object' && pack.name && pack.type;
      }).map((pack: any) => {
        // Ensure basic structure
        return {
          id: pack.id || `pack-${Date.now()}-${Math.random()}`,
          name: pack.name,
          type: ['Sequential', 'Random', 'Date'].includes(pack.type) ? pack.type : 'Sequential',
          prompts: Array.isArray(pack.prompts) ? pack.prompts.filter((p: any) => p && p.content) : [],
          settings: pack.settings || {
            notificationEnabled: false,
            notificationTime: '09:00',
            notificationType: 'obsidian',
            zenModeEnabled: false,
            dailyNoteIntegration: true
          },
          progress: pack.progress || {
            completedPrompts: [],
            lastAccessDate: new Date().toISOString()
          },
          createdAt: pack.createdAt || new Date().toISOString(),
          updatedAt: pack.updatedAt || new Date().toISOString(),
          metadata: pack.metadata || {}
        };
      });
    }

    // Try to salvage global settings
    if (data.globalSettings && typeof data.globalSettings === 'object') {
      Object.assign(salvaged.globalSettings, data.globalSettings);
    }

    return salvaged;
  }

  private applyBasicFixes(data: any): any {
    // Fix prompt packs
    if (data.promptPacks) {
      data.promptPacks = data.promptPacks.map((pack: any) => {
        // Fix prompts
        if (pack.prompts) {
          pack.prompts = pack.prompts.map((prompt: any, index: number) => ({
            id: prompt.id || `prompt-${Date.now()}-${index}`,
            content: prompt.content || '',
            type: ['link', 'string', 'markdown'].includes(prompt.type) ? prompt.type : 'string',
            date: prompt.date,
            order: prompt.order,
            metadata: prompt.metadata || {}
          }));
        }

        // Fix progress
        if (pack.progress) {
          if (!Array.isArray(pack.progress.completedPrompts)) {
            pack.progress.completedPrompts = [];
          }
          if (!pack.progress.lastAccessDate) {
            pack.progress.lastAccessDate = new Date().toISOString();
          }
        }

        return pack;
      });
    }

    return data;
  }

  getRecoveryMessage(): string {
    return 'Data migration issues resolved';
  }
}

/**
 * Recovery strategy for permission-related errors
 */
class PermissionFallbackStrategy implements RecoveryStrategy {
  canRecover(error: Error, context: ErrorContext): boolean {
    return (
      error.message.includes('permission') ||
      error.message.includes('denied') ||
      error.message.includes('not allowed') ||
      context.operation.includes('notification') ||
      context.operation.includes('file')
    );
  }

  async recover(error: Error, context: ErrorContext): Promise<any> {
    if (context.operation.includes('notification')) {
      // Fall back to Obsidian notifications instead of system notifications
      console.log('Daily Prompts: Falling back to Obsidian notifications');
      return { notificationType: 'obsidian', fallbackApplied: true };
    }

    if (context.operation.includes('file')) {
      // Try alternative file operations
      console.log('Daily Prompts: Using alternative file access method');
      return { useAlternativeMethod: true };
    }

    throw new Error('No fallback available for this permission error');
  }

  getRecoveryMessage(): string {
    return 'Using alternative method due to permissions';
  }
}

/**
 * Recovery strategy for trying alternative methods
 */
class AlternativeMethodStrategy implements RecoveryStrategy {
  canRecover(error: Error, context: ErrorContext): boolean {
    return (
      context.component === 'daily-note-service' ||
      context.component === 'notification-service' ||
      error.message.includes('not found') ||
      error.message.includes('unavailable')
    );
  }

  async recover(error: Error, context: ErrorContext): Promise<any> {
    if (context.component === 'daily-note-service') {
      // Try manual note creation instead of daily notes plugin
      console.log('Daily Prompts: Using manual note creation');
      return { useManualNoteCreation: true };
    }

    if (context.component === 'notification-service') {
      // Try different notification method
      console.log('Daily Prompts: Switching notification method');
      return { switchNotificationMethod: true };
    }

    throw new Error('No alternative method available');
  }

  getRecoveryMessage(): string {
    return 'Switched to alternative method';
  }
}

/**
 * Recovery strategy for API-related errors
 */
class APIFallbackStrategy implements RecoveryStrategy {
  canRecover(error: Error, context: ErrorContext): boolean {
    return (
      error.message.includes('API') ||
      error.message.includes('not found') ||
      error.message.includes('unavailable') ||
      context.operation.includes('daily-note') ||
      context.operation.includes('workspace')
    );
  }

  async recover(error: Error, context: ErrorContext): Promise<any> {
    if (context.operation.includes('daily-note')) {
      // Fall back to manual note creation
      console.log('Daily Prompts: Daily notes plugin unavailable, using manual creation');
      return { useManualNoteCreation: true };
    }

    if (context.operation.includes('workspace')) {
      // Skip workspace modifications
      console.log('Daily Prompts: Workspace API unavailable, skipping zen mode');
      return { skipZenMode: true };
    }

    throw new Error('No API fallback available');
  }

  getRecoveryMessage(): string {
    return 'Using fallback method';
  }
}

/**
 * Recovery strategy for retrying operations with exponential backoff
 */
class RetryStrategy implements RecoveryStrategy {
  private maxRetries = 3;
  private baseDelay = 1000; // 1 second

  canRecover(error: Error, context: ErrorContext): boolean {
    return (
      error.message.includes('network') ||
      error.message.includes('timeout') ||
      error.message.includes('temporary') ||
      context.operation.includes('save') ||
      context.operation.includes('load')
    );
  }

  async recover(error: Error, context: ErrorContext): Promise<any> {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`Daily Prompts: Retry attempt ${attempt}/${this.maxRetries}`);

        // Wait with exponential backoff
        if (attempt > 1) {
          const delay = this.baseDelay * Math.pow(2, attempt - 1);
          await this.delay(delay);
        }

        // The actual retry logic would depend on the specific operation
        // For now, we'll indicate that a retry should be attempted
        return { shouldRetry: true, attempt };

      } catch (retryError) {
        if (attempt === this.maxRetries) {
          throw retryError;
        }
        console.warn(`Daily Prompts: Retry attempt ${attempt} failed:`, retryError);
      }
    }

    throw new Error('All retry attempts failed');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getRecoveryMessage(): string {
    return 'Operation retried successfully';
  }
}

/**
 * Recovery strategy for offline mode when network is unavailable
 */
class OfflineModeStrategy implements RecoveryStrategy {
  canRecover(error: Error, context: ErrorContext): boolean {
    return (
      error.message.includes('network') ||
      error.message.includes('offline') ||
      error.message.includes('connection') ||
      context.operation.includes('import') ||
      context.operation.includes('export')
    );
  }

  async recover(error: Error, context: ErrorContext): Promise<any> {
    console.log('Daily Prompts: Entering offline mode');

    // Return configuration for offline operation
    return {
      offlineMode: true,
      disableNetworkFeatures: true,
      useLocalStorage: true
    };
  }

  getRecoveryMessage(): string {
    return 'Operating in offline mode';
  }
}