/**
 * Data corruption recovery service for the Daily Prompts plugin
 * Provides comprehensive data recovery, validation, and repair capabilities
 */

import { Plugin, Notice } from 'obsidian';
import { StorageManager } from './storage-manager';
import { PluginSettings, PromptPack, ValidationError } from './models';
import { ErrorHandler } from './error-handler';

export interface RecoveryReport {
  success: boolean;
  method: string;
  dataRecovered: boolean;
  backupsUsed: string[];
  issuesFound: string[];
  issuesFixed: string[];
  timestamp: Date;
}

export interface DataIntegrityCheck {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  corruptedPacks: string[];
  fixableIssues: string[];
}

/**
 * Service for handling data corruption recovery and integrity checks
 */
export class DataRecoveryService {
  private plugin: Plugin;
  private storageManager: StorageManager;
  private errorHandler: ErrorHandler;

  constructor(plugin: Plugin, storageManager: StorageManager, errorHandler: ErrorHandler) {
    this.plugin = plugin;
    this.storageManager = storageManager;
    this.errorHandler = errorHandler;
  }

  /**
   * Perform comprehensive data integrity check
   */
  async checkDataIntegrity(data?: any): Promise<DataIntegrityCheck> {
    const result: DataIntegrityCheck = {
      isValid: true,
      errors: [],
      warnings: [],
      corruptedPacks: [],
      fixableIssues: []
    };

    try {
      // Load data if not provided
      if (!data) {
        data = await this.plugin.loadData();
      }

      if (!data) {
        result.warnings.push('No data found - this may be a fresh installation');
        return result;
      }

      // Check basic structure
      this.checkBasicStructure(data, result);

      // Check version compatibility
      this.checkVersionCompatibility(data, result);

      // Check global settings
      this.checkGlobalSettings(data.globalSettings, result);

      // Check prompt packs
      if (data.promptPacks && Array.isArray(data.promptPacks)) {
        this.checkPromptPacks(data.promptPacks, result);
      }

      // Check for duplicate IDs and names
      this.checkForDuplicates(data.promptPacks, result);

      // Overall validity
      result.isValid = result.errors.length === 0;

    } catch (error) {
      result.isValid = false;
      result.errors.push(`Integrity check failed: ${(error as Error).message}`);
    }

    return result;
  }

  /**
   * Check basic data structure
   */
  private checkBasicStructure(data: any, result: DataIntegrityCheck): void {
    if (typeof data !== 'object') {
      result.errors.push('Data is not an object');
      return;
    }

    if (!data.hasOwnProperty('promptPacks')) {
      result.fixableIssues.push('Missing promptPacks array');
    } else if (!Array.isArray(data.promptPacks)) {
      result.errors.push('promptPacks is not an array');
    }

    if (!data.hasOwnProperty('globalSettings')) {
      result.fixableIssues.push('Missing globalSettings object');
    } else if (typeof data.globalSettings !== 'object') {
      result.errors.push('globalSettings is not an object');
    }

    if (!data.hasOwnProperty('version')) {
      result.fixableIssues.push('Missing version information');
    }
  }

  /**
   * Check version compatibility
   */
  private checkVersionCompatibility(data: any, result: DataIntegrityCheck): void {
    if (!data.version) {
      result.warnings.push('No version information found');
      return;
    }

    const version = data.version;
    const currentVersion = '1.0.0';

    if (typeof version !== 'string') {
      result.errors.push('Version must be a string');
      return;
    }

    // Check if version is too new
    if (this.compareVersions(version, currentVersion) > 0) {
      result.warnings.push(`Data version (${version}) is newer than plugin version (${currentVersion})`);
    }

    // Check if version is very old
    if (this.compareVersions(version, '0.1.0') < 0) {
      result.warnings.push(`Data version (${version}) is very old and may need migration`);
    }
  }

  /**
   * Check global settings integrity
   */
  private checkGlobalSettings(globalSettings: any, result: DataIntegrityCheck): void {
    if (!globalSettings) {
      result.fixableIssues.push('Missing global settings');
      return;
    }

    const requiredFields = [
      'defaultNotificationTime',
      'defaultZenMode',
      'dailyNoteFolder',
      'dailyNoteTemplate',
      'linkHandling'
    ];

    requiredFields.forEach(field => {
      if (!globalSettings.hasOwnProperty(field)) {
        result.fixableIssues.push(`Missing global setting: ${field}`);
      }
    });

    // Validate specific fields
    if (globalSettings.defaultNotificationTime && !this.isValidTimeFormat(globalSettings.defaultNotificationTime)) {
      result.errors.push('Invalid default notification time format');
    }

    if (globalSettings.linkHandling && !['embed', 'reference', 'direct'].includes(globalSettings.linkHandling)) {
      result.errors.push('Invalid link handling setting');
    }
  }

  /**
   * Check prompt packs integrity
   */
  private checkPromptPacks(promptPacks: any[], result: DataIntegrityCheck): void {
    promptPacks.forEach((pack, index) => {
      const packErrors: string[] = [];

      // Check basic pack structure
      if (!pack || typeof pack !== 'object') {
        result.errors.push(`Prompt pack at index ${index} is not an object`);
        return;
      }

      // Check required fields
      const requiredFields = ['id', 'name', 'type', 'prompts', 'settings', 'progress'];
      requiredFields.forEach(field => {
        if (!pack.hasOwnProperty(field)) {
          packErrors.push(`Missing field: ${field}`);
        }
      });

      // Check pack type
      if (pack.type && !['Sequential', 'Random', 'Date'].includes(pack.type)) {
        packErrors.push('Invalid pack type');
      }

      // Check prompts array
      if (pack.prompts) {
        if (!Array.isArray(pack.prompts)) {
          packErrors.push('Prompts is not an array');
        } else {
          this.checkPrompts(pack.prompts, packErrors, pack.type);
        }
      }

      // Check settings
      if (pack.settings) {
        this.checkPackSettings(pack.settings, packErrors);
      }

      // Check progress
      if (pack.progress) {
        this.checkPackProgress(pack.progress, packErrors);
      }

      // Check timestamps
      if (pack.createdAt && !this.isValidDate(pack.createdAt)) {
        packErrors.push('Invalid createdAt timestamp');
      }

      if (pack.updatedAt && !this.isValidDate(pack.updatedAt)) {
        packErrors.push('Invalid updatedAt timestamp');
      }

      // Add pack-specific errors
      if (packErrors.length > 0) {
        result.corruptedPacks.push(pack.name || `Pack ${index}`);
        packErrors.forEach(error => {
          result.errors.push(`Pack "${pack.name || index}": ${error}`);
        });
      }
    });
  }

  /**
   * Check individual prompts
   */
  private checkPrompts(prompts: any[], packErrors: string[], packType: string): void {
    prompts.forEach((prompt, index) => {
      if (!prompt || typeof prompt !== 'object') {
        packErrors.push(`Prompt at index ${index} is not an object`);
        return;
      }

      // Check required fields
      if (!prompt.id) {
        packErrors.push(`Prompt at index ${index} missing ID`);
      }

      if (!prompt.content) {
        packErrors.push(`Prompt at index ${index} missing content`);
      }

      if (!prompt.type || !['link', 'string', 'markdown'].includes(prompt.type)) {
        packErrors.push(`Prompt at index ${index} has invalid type`);
      }

      // Type-specific checks
      if (packType === 'Sequential' && prompt.order !== undefined && !Number.isInteger(prompt.order)) {
        packErrors.push(`Prompt at index ${index} has invalid order value`);
      }

      if (packType === 'Date' && prompt.date && !this.isValidDate(prompt.date)) {
        packErrors.push(`Prompt at index ${index} has invalid date`);
      }
    });
  }

  /**
   * Check pack settings
   */
  private checkPackSettings(settings: any, packErrors: string[]): void {
    if (typeof settings !== 'object') {
      packErrors.push('Settings is not an object');
      return;
    }

    if (settings.notificationTime && !this.isValidTimeFormat(settings.notificationTime)) {
      packErrors.push('Invalid notification time format');
    }

    if (settings.notificationType && !['system', 'obsidian'].includes(settings.notificationType)) {
      packErrors.push('Invalid notification type');
    }
  }

  /**
   * Check pack progress
   */
  private checkPackProgress(progress: any, packErrors: string[]): void {
    if (typeof progress !== 'object') {
      packErrors.push('Progress is not an object');
      return;
    }

    if (progress.completedPrompts && !Array.isArray(progress.completedPrompts)) {
      packErrors.push('Completed prompts is not an array');
    }

    if (progress.usedPrompts && !Array.isArray(progress.usedPrompts)) {
      packErrors.push('Used prompts is not an array');
    }

    if (progress.lastAccessDate && !this.isValidDate(progress.lastAccessDate)) {
      packErrors.push('Invalid last access date');
    }
  }

  /**
   * Check for duplicate IDs and names
   */
  private checkForDuplicates(promptPacks: any[], result: DataIntegrityCheck): void {
    if (!promptPacks || !Array.isArray(promptPacks)) {
      return;
    }

    const ids = new Set<string>();
    const names = new Set<string>();

    promptPacks.forEach((pack, index) => {
      if (pack.id) {
        if (ids.has(pack.id)) {
          result.errors.push(`Duplicate pack ID found: ${pack.id}`);
        } else {
          ids.add(pack.id);
        }
      }

      if (pack.name) {
        if (names.has(pack.name)) {
          result.errors.push(`Duplicate pack name found: ${pack.name}`);
        } else {
          names.add(pack.name);
        }
      }
    });
  }

  /**
   * Attempt to repair corrupted data
   */
  async repairData(data: any): Promise<{ repaired: any; report: RecoveryReport }> {
    const report: RecoveryReport = {
      success: false,
      method: 'data_repair',
      dataRecovered: false,
      backupsUsed: [],
      issuesFound: [],
      issuesFixed: [],
      timestamp: new Date()
    };

    try {
      const integrityCheck = await this.checkDataIntegrity(data);
      report.issuesFound = [...integrityCheck.errors, ...integrityCheck.warnings];

      if (integrityCheck.isValid) {
        report.success = true;
        report.dataRecovered = true;
        return { repaired: data, report };
      }

      // Start with a copy of the data
      let repairedData = JSON.parse(JSON.stringify(data));

      // Fix basic structure issues
      repairedData = this.fixBasicStructure(repairedData, report);

      // Fix global settings
      repairedData = this.fixGlobalSettings(repairedData, report);

      // Fix prompt packs
      repairedData = this.fixPromptPacks(repairedData, report);

      // Validate repaired data
      const finalCheck = await this.checkDataIntegrity(repairedData);
      report.success = finalCheck.isValid;
      report.dataRecovered = true;

      return { repaired: repairedData, report };

    } catch (error) {
      report.issuesFound.push(`Repair failed: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Fix basic data structure issues
   */
  private fixBasicStructure(data: any, report: RecoveryReport): any {
    if (!data.promptPacks) {
      data.promptPacks = [];
      report.issuesFixed.push('Added missing promptPacks array');
    }

    if (!data.globalSettings) {
      data.globalSettings = {
        defaultNotificationTime: '09:00',
        defaultZenMode: false,
        dailyNoteFolder: '',
        dailyNoteTemplate: '',
        linkHandling: 'direct'
      };
      report.issuesFixed.push('Added missing globalSettings');
    }

    if (!data.version) {
      data.version = '1.0.0';
      report.issuesFixed.push('Added missing version');
    }

    return data;
  }

  /**
   * Fix global settings issues
   */
  private fixGlobalSettings(data: any, report: RecoveryReport): any {
    const defaults = {
      defaultNotificationTime: '09:00',
      defaultZenMode: false,
      dailyNoteFolder: '',
      dailyNoteTemplate: '',
      linkHandling: 'direct'
    };

    Object.keys(defaults).forEach(key => {
      if (!data.globalSettings.hasOwnProperty(key)) {
        data.globalSettings[key] = defaults[key as keyof typeof defaults];
        report.issuesFixed.push(`Fixed missing global setting: ${key}`);
      }
    });

    // Fix invalid values
    if (!this.isValidTimeFormat(data.globalSettings.defaultNotificationTime)) {
      data.globalSettings.defaultNotificationTime = '09:00';
      report.issuesFixed.push('Fixed invalid default notification time');
    }

    if (!['embed', 'reference', 'direct'].includes(data.globalSettings.linkHandling)) {
      data.globalSettings.linkHandling = 'direct';
      report.issuesFixed.push('Fixed invalid link handling setting');
    }

    return data;
  }

  /**
   * Fix prompt packs issues
   */
  private fixPromptPacks(data: any, report: RecoveryReport): any {
    if (!Array.isArray(data.promptPacks)) {
      data.promptPacks = [];
      report.issuesFixed.push('Fixed promptPacks structure');
      return data;
    }

    data.promptPacks = data.promptPacks.filter((pack: any, index: number) => {
      if (!pack || typeof pack !== 'object') {
        report.issuesFixed.push(`Removed invalid pack at index ${index}`);
        return false;
      }

      // Fix missing required fields
      if (!pack.id) {
        pack.id = `pack-${Date.now()}-${index}`;
        report.issuesFixed.push(`Generated missing ID for pack ${index}`);
      }

      if (!pack.name) {
        pack.name = `Untitled Pack ${index + 1}`;
        report.issuesFixed.push(`Generated missing name for pack ${pack.id}`);
      }

      if (!pack.type || !['Sequential', 'Random', 'Date'].includes(pack.type)) {
        pack.type = 'Sequential';
        report.issuesFixed.push(`Fixed invalid type for pack ${pack.name}`);
      }

      // Fix prompts
      if (!Array.isArray(pack.prompts)) {
        pack.prompts = [];
        report.issuesFixed.push(`Fixed prompts array for pack ${pack.name}`);
      } else {
        pack.prompts = this.fixPrompts(pack.prompts, pack.type, report, pack.name);
      }

      // Fix settings
      if (!pack.settings || typeof pack.settings !== 'object') {
        pack.settings = {
          notificationEnabled: false,
          notificationTime: '09:00',
          notificationType: 'obsidian',
          zenModeEnabled: false,
          dailyNoteIntegration: true
        };
        report.issuesFixed.push(`Fixed settings for pack ${pack.name}`);
      } else {
        pack.settings = this.fixPackSettings(pack.settings, report, pack.name);
      }

      // Fix progress
      if (!pack.progress || typeof pack.progress !== 'object') {
        pack.progress = {
          completedPrompts: [],
          lastAccessDate: new Date().toISOString()
        };
        report.issuesFixed.push(`Fixed progress for pack ${pack.name}`);
      } else {
        pack.progress = this.fixPackProgress(pack.progress, report, pack.name);
      }

      // Fix timestamps
      if (!pack.createdAt || !this.isValidDate(pack.createdAt)) {
        pack.createdAt = new Date().toISOString();
        report.issuesFixed.push(`Fixed createdAt for pack ${pack.name}`);
      }

      if (!pack.updatedAt || !this.isValidDate(pack.updatedAt)) {
        pack.updatedAt = new Date().toISOString();
        report.issuesFixed.push(`Fixed updatedAt for pack ${pack.name}`);
      }

      // Ensure metadata exists
      if (!pack.metadata) {
        pack.metadata = {};
        report.issuesFixed.push(`Added missing metadata for pack ${pack.name}`);
      }

      return true;
    });

    return data;
  }

  /**
   * Fix prompts in a pack
   */
  private fixPrompts(prompts: any[], packType: string, report: RecoveryReport, packName: string): any[] {
    return prompts.filter((prompt: any, index: number) => {
      if (!prompt || typeof prompt !== 'object') {
        report.issuesFixed.push(`Removed invalid prompt at index ${index} in pack ${packName}`);
        return false;
      }

      // Fix missing ID
      if (!prompt.id) {
        prompt.id = `prompt-${Date.now()}-${index}`;
        report.issuesFixed.push(`Generated missing ID for prompt ${index} in pack ${packName}`);
      }

      // Fix missing content
      if (!prompt.content) {
        prompt.content = `Prompt ${index + 1}`;
        report.issuesFixed.push(`Generated missing content for prompt ${index} in pack ${packName}`);
      }

      // Fix invalid type
      if (!prompt.type || !['link', 'string', 'markdown'].includes(prompt.type)) {
        prompt.type = 'string';
        report.issuesFixed.push(`Fixed invalid type for prompt ${index} in pack ${packName}`);
      }

      // Fix metadata
      if (!prompt.metadata) {
        prompt.metadata = {};
        report.issuesFixed.push(`Added missing metadata for prompt ${index} in pack ${packName}`);
      }

      // Type-specific fixes
      if (packType === 'Sequential' && prompt.order !== undefined && !Number.isInteger(prompt.order)) {
        prompt.order = index;
        report.issuesFixed.push(`Fixed invalid order for prompt ${index} in pack ${packName}`);
      }

      if (packType === 'Date' && prompt.date && !this.isValidDate(prompt.date)) {
        delete prompt.date;
        report.issuesFixed.push(`Removed invalid date for prompt ${index} in pack ${packName}`);
      }

      return true;
    });
  }

  /**
   * Fix pack settings
   */
  private fixPackSettings(settings: any, report: RecoveryReport, packName: string): any {
    const defaults = {
      notificationEnabled: false,
      notificationTime: '09:00',
      notificationType: 'obsidian',
      zenModeEnabled: false,
      dailyNoteIntegration: true
    };

    Object.keys(defaults).forEach(key => {
      if (!settings.hasOwnProperty(key)) {
        settings[key] = defaults[key as keyof typeof defaults];
        report.issuesFixed.push(`Fixed missing setting ${key} for pack ${packName}`);
      }
    });

    // Fix invalid values
    if (!this.isValidTimeFormat(settings.notificationTime)) {
      settings.notificationTime = '09:00';
      report.issuesFixed.push(`Fixed invalid notification time for pack ${packName}`);
    }

    if (!['system', 'obsidian'].includes(settings.notificationType)) {
      settings.notificationType = 'obsidian';
      report.issuesFixed.push(`Fixed invalid notification type for pack ${packName}`);
    }

    return settings;
  }

  /**
   * Fix pack progress
   */
  private fixPackProgress(progress: any, report: RecoveryReport, packName: string): any {
    if (!Array.isArray(progress.completedPrompts)) {
      progress.completedPrompts = [];
      report.issuesFixed.push(`Fixed completedPrompts for pack ${packName}`);
    }

    if (progress.usedPrompts && !Array.isArray(progress.usedPrompts)) {
      progress.usedPrompts = [];
      report.issuesFixed.push(`Fixed usedPrompts for pack ${packName}`);
    }

    if (!progress.lastAccessDate || !this.isValidDate(progress.lastAccessDate)) {
      progress.lastAccessDate = new Date().toISOString();
      report.issuesFixed.push(`Fixed lastAccessDate for pack ${packName}`);
    }

    return progress;
  }

  /**
   * Attempt full data recovery using multiple strategies
   */
  async recoverData(): Promise<RecoveryReport> {
    const report: RecoveryReport = {
      success: false,
      method: 'unknown',
      dataRecovered: false,
      backupsUsed: [],
      issuesFound: [],
      issuesFixed: [],
      timestamp: new Date()
    };

    try {
      // Strategy 1: Try to load and repair current data
      try {
        const currentData = await this.plugin.loadData();
        if (currentData) {
          const { repaired, report: repairReport } = await this.repairData(currentData);
          if (repairReport.success) {
            await this.storageManager.saveData(repaired, { createBackup: true });
            report.success = true;
            report.method = 'data_repair';
            report.dataRecovered = true;
            report.issuesFound = repairReport.issuesFound;
            report.issuesFixed = repairReport.issuesFixed;
            return report;
          }
        }
      } catch (error) {
        report.issuesFound.push(`Current data repair failed: ${(error as Error).message}`);
      }

      // Strategy 2: Try backup recovery
      try {
        const backups = await this.storageManager.listBackups();
        for (const backup of backups) {
          try {
            const backupPath = `.obsidian/plugins/daily-prompts/backups/${backup.id}.json`;
            const backupFile = this.plugin.app.vault.getAbstractFileByPath(backupPath);

            if (backupFile) {
              const backupContent = await this.plugin.app.vault.read(backupFile);
              const backupData = JSON.parse(backupContent);

              const { repaired, report: repairReport } = await this.repairData(backupData);
              if (repairReport.success) {
                await this.storageManager.saveData(repaired, { createBackup: true });
                report.success = true;
                report.method = 'backup_recovery';
                report.dataRecovered = true;
                report.backupsUsed.push(backup.id);
                report.issuesFound = repairReport.issuesFound;
                report.issuesFixed = repairReport.issuesFixed;
                return report;
              }
            }
          } catch (backupError) {
            report.issuesFound.push(`Backup ${backup.id} recovery failed: ${(backupError as Error).message}`);
          }
        }
      } catch (error) {
        report.issuesFound.push(`Backup recovery failed: ${(error as Error).message}`);
      }

      // Strategy 3: Create fresh default data
      try {
        const defaultData = {
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

        await this.storageManager.saveData(defaultData, { createBackup: false });
        report.success = true;
        report.method = 'default_data';
        report.dataRecovered = true;
        report.issuesFixed.push('Created fresh default data');
        return report;
      } catch (error) {
        report.issuesFound.push(`Default data creation failed: ${(error as Error).message}`);
      }

      // If all strategies fail
      report.success = false;
      report.method = 'all_failed';

    } catch (error) {
      report.issuesFound.push(`Recovery process failed: ${(error as Error).message}`);
    }

    return report;
  }

  /**
   * Show user notification about data recovery
   */
  showRecoveryNotification(report: RecoveryReport): void {
    if (report.success) {
      let message = `Daily Prompts: Data recovery successful using ${report.method.replace('_', ' ')}.`;

      if (report.issuesFixed.length > 0) {
        message += ` Fixed ${report.issuesFixed.length} issues.`;
      }

      if (report.backupsUsed.length > 0) {
        message += ` Used backup: ${report.backupsUsed[0]}.`;
      }

      new Notice(message, 8000);
    } else {
      const message = `Daily Prompts: Data recovery failed. Please check console for details or contact support.`;
      new Notice(message, 0); // Don't auto-dismiss
    }
  }

  /**
   * Utility methods
   */
  private isValidTimeFormat(time: string): boolean {
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    return timeRegex.test(time);
  }

  private isValidDate(date: any): boolean {
    if (typeof date === 'string') {
      const parsed = new Date(date);
      return !isNaN(parsed.getTime());
    }
    return date instanceof Date && !isNaN(date.getTime());
  }

  private compareVersions(version1: string, version2: string): number {
    const v1Parts = version1.split('.').map(Number);
    const v2Parts = version2.split('.').map(Number);

    for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
      const v1Part = v1Parts[i] || 0;
      const v2Part = v2Parts[i] || 0;

      if (v1Part < v2Part) return -1;
      if (v1Part > v2Part) return 1;
    }

    return 0;
  }
}