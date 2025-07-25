/**
 * Storage manager for the Daily Prompts plugin
 * Handles data persistence, backup, restore, and migration functionality
 */

import { Plugin, TFile, TFolder } from 'obsidian';
import { PluginSettings, PromptPack, ValidationError } from './models';

export interface BackupMetadata {
  timestamp: string;
  version: string;
  type: 'manual' | 'automatic';
  size: number;
  description?: string;
}

export interface StorageOptions {
  createBackup?: boolean;
  validateData?: boolean;
  retryOnFailure?: boolean;
  maxRetries?: number;
}

/**
 * Storage manager class that handles all data persistence operations
 */
export class StorageManager {
  private plugin: Plugin;
  private readonly BACKUP_FOLDER = '.obsidian/plugins/daily-prompts/backups';
  private readonly PROGRESS_FOLDER = '.obsidian/plugins/daily-prompts/progress';
  private readonly MAX_BACKUPS = 10;
  private readonly BACKUP_RETENTION_DAYS = 30;

  constructor(plugin: Plugin) {
    this.plugin = plugin;
  }

  /**
   * Save plugin data with optional backup creation
   */
  async saveData(data: any, options: StorageOptions = {}): Promise<void> {
    const {
      createBackup = true,
      validateData = true,
      retryOnFailure = true,
      maxRetries = 3
    } = options;

    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt < maxRetries) {
      try {
        // Validate data before saving if requested
        if (validateData) {
          this.validateDataStructure(data);
        }

        // Create backup before saving if requested
        if (createBackup && attempt === 0) {
          await this.createAutomaticBackup();
        }

        // Save the data
        await this.plugin.saveData(data);
        return; // Success

      } catch (error) {
        lastError = error as Error;
        attempt++;

        if (!retryOnFailure || attempt >= maxRetries) {
          break;
        }

        // Wait before retry with exponential backoff
        await this.delay(Math.pow(2, attempt) * 1000);
      }
    }

    throw new ValidationError(`Failed to save data after ${maxRetries} attempts: ${lastError?.message}`);
  }

  /**
   * Load plugin data with validation and migration
   */
  async loadData(): Promise<any> {
    try {
      const data = await this.plugin.loadData();

      if (!data) {
        return null;
      }

      // Validate loaded data
      this.validateDataStructure(data);

      // Apply migrations if needed
      const migratedData = await this.migrateData(data);

      return migratedData;

    } catch (error) {
      console.error('Failed to load data:', error);

      // Try to recover from backup
      const recoveredData = await this.recoverFromBackup();
      if (recoveredData) {
        console.log('Successfully recovered data from backup');
        return recoveredData;
      }

      throw new ValidationError(`Failed to load data and recovery failed: ${error.message}`);
    }
  }

  /**
   * Create a manual backup with metadata
   */
  async createManualBackup(description?: string): Promise<string> {
    try {
      const data = await this.plugin.loadData();
      if (!data) {
        throw new Error('No data to backup');
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupId = `manual-${timestamp}`;

      const metadata: BackupMetadata = {
        timestamp: new Date().toISOString(),
        version: data.version || '1.0.0',
        type: 'manual',
        size: JSON.stringify(data).length,
        description
      };

      await this.saveBackup(backupId, data, metadata);
      await this.cleanupOldBackups();

      return backupId;

    } catch (error) {
      throw new ValidationError(`Failed to create manual backup: ${error.message}`);
    }
  }

  /**
   * Create an automatic backup (called before saves)
   */
  private async createAutomaticBackup(): Promise<void> {
    try {
      const data = await this.plugin.loadData();
      if (!data) {
        return; // Nothing to backup
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupId = `auto-${timestamp}`;

      const metadata: BackupMetadata = {
        timestamp: new Date().toISOString(),
        version: data.version || '1.0.0',
        type: 'automatic',
        size: JSON.stringify(data).length
      };

      await this.saveBackup(backupId, data, metadata);
      await this.cleanupOldBackups();

    } catch (error) {
      console.warn('Failed to create automatic backup:', error);
      // Don't throw - backup failure shouldn't prevent saving
    }
  }

  /**
   * Save backup data and metadata
   */
  private async saveBackup(backupId: string, data: any, metadata: BackupMetadata): Promise<void> {
    try {
      // Ensure backup folder exists
      await this.ensureFolderExists(this.BACKUP_FOLDER);

      // Save backup data
      const backupPath = `${this.BACKUP_FOLDER}/${backupId}.json`;
      const backupContent = JSON.stringify(data, null, 2);
      await this.writeFile(backupPath, backupContent);

      // Save backup metadata
      const metadataPath = `${this.BACKUP_FOLDER}/${backupId}.meta.json`;
      const metadataContent = JSON.stringify(metadata, null, 2);
      await this.writeFile(metadataPath, metadataContent);

    } catch (error) {
      throw new Error(`Failed to save backup: ${error.message}`);
    }
  }

  /**
   * List available backups with metadata
   */
  async listBackups(): Promise<Array<{ id: string; metadata: BackupMetadata }>> {
    try {
      const backups: Array<{ id: string; metadata: BackupMetadata }> = [];
      const backupFolder = this.plugin.app.vault.getAbstractFileByPath(this.BACKUP_FOLDER);

      if (!backupFolder || !(backupFolder instanceof TFolder)) {
        return backups;
      }

      for (const file of backupFolder.children) {
        if (file instanceof TFile && file.name.endsWith('.meta.json')) {
          try {
            const metadataContent = await this.plugin.app.vault.read(file);
            const metadata: BackupMetadata = JSON.parse(metadataContent);
            const backupId = file.name.replace('.meta.json', '');

            backups.push({ id: backupId, metadata });
          } catch (error) {
            console.warn(`Failed to read backup metadata for ${file.name}:`, error);
          }
        }
      }

      // Sort by timestamp (newest first)
      backups.sort((a, b) => new Date(b.metadata.timestamp).getTime() - new Date(a.metadata.timestamp).getTime());

      return backups;

    } catch (error) {
      console.error('Failed to list backups:', error);
      return [];
    }
  }

  /**
   * Restore data from a specific backup
   */
  async restoreFromBackup(backupId: string): Promise<void> {
    try {
      const backupPath = `${this.BACKUP_FOLDER}/${backupId}.json`;
      const backupFile = this.plugin.app.vault.getAbstractFileByPath(backupPath);

      if (!backupFile || !(backupFile instanceof TFile)) {
        throw new Error(`Backup ${backupId} not found`);
      }

      const backupContent = await this.plugin.app.vault.read(backupFile);
      const backupData = JSON.parse(backupContent);

      // Validate backup data
      this.validateDataStructure(backupData);

      // Apply migrations if needed
      const migratedData = await this.migrateData(backupData);

      // Create a backup of current data before restoring
      await this.createManualBackup('Pre-restore backup');

      // Save the restored data
      await this.saveData(migratedData, { createBackup: false });

    } catch (error) {
      throw new ValidationError(`Failed to restore from backup ${backupId}: ${error.message}`);
    }
  }

  /**
   * Recover from the most recent backup automatically
   */
  private async recoverFromBackup(): Promise<any | null> {
    try {
      const backups = await this.listBackups();
      if (backups.length === 0) {
        return null;
      }

      // Try the most recent backup first
      for (const backup of backups) {
        try {
          const backupPath = `${this.BACKUP_FOLDER}/${backup.id}.json`;
          const backupFile = this.plugin.app.vault.getAbstractFileByPath(backupPath);

          if (backupFile && backupFile instanceof TFile) {
            const backupContent = await this.plugin.app.vault.read(backupFile);
            const backupData = JSON.parse(backupContent);

            // Validate and migrate the backup data
            this.validateDataStructure(backupData);
            const migratedData = await this.migrateData(backupData);

            return migratedData;
          }
        } catch (error) {
          console.warn(`Failed to recover from backup ${backup.id}:`, error);
          continue; // Try next backup
        }
      }

      return null;

    } catch (error) {
      console.error('Failed to recover from backup:', error);
      return null;
    }
  }

  /**
   * Clean up old backups based on retention policy
   */
  private async cleanupOldBackups(): Promise<void> {
    try {
      const backups = await this.listBackups();
      const now = new Date();
      const retentionMs = this.BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;

      // Remove backups that exceed max count or retention period
      const backupsToDelete = backups.filter((backup, index) => {
        const backupAge = now.getTime() - new Date(backup.metadata.timestamp).getTime();
        return index >= this.MAX_BACKUPS || backupAge > retentionMs;
      });

      for (const backup of backupsToDelete) {
        await this.deleteBackup(backup.id);
      }

    } catch (error) {
      console.warn('Failed to cleanup old backups:', error);
    }
  }

  /**
   * Delete a specific backup
   */
  async deleteBackup(backupId: string): Promise<void> {
    try {
      const backupPath = `${this.BACKUP_FOLDER}/${backupId}.json`;
      const metadataPath = `${this.BACKUP_FOLDER}/${backupId}.meta.json`;

      const backupFile = this.plugin.app.vault.getAbstractFileByPath(backupPath);
      const metadataFile = this.plugin.app.vault.getAbstractFileByPath(metadataPath);

      if (backupFile && backupFile instanceof TFile) {
        await this.plugin.app.vault.delete(backupFile);
      }

      if (metadataFile && metadataFile instanceof TFile) {
        await this.plugin.app.vault.delete(metadataFile);
      }

    } catch (error) {
      console.warn(`Failed to delete backup ${backupId}:`, error);
    }
  }

  /**
   * Migrate data from older versions
   */
  private async migrateData(data: any): Promise<any> {
    if (!data || typeof data !== 'object') {
      return data;
    }

    let migratedData = { ...data };
    const currentVersion = migratedData.version || '0.0.0';

    // Migration from 0.x to 1.0.0
    if (this.compareVersions(currentVersion, '1.0.0') < 0) {
      migratedData = await this.migrateToV1(migratedData);
    }

    // Future migrations can be added here
    // if (this.compareVersions(currentVersion, '1.1.0') < 0) {
    //   migratedData = await this.migrateToV1_1(migratedData);
    // }

    return migratedData;
  }

  /**
   * Migrate data to version 1.0.0
   */
  private async migrateToV1(data: any): Promise<any> {
    const migratedData = { ...data };

    // Set version
    migratedData.version = '1.0.0';

    // Ensure globalSettings exists
    if (!migratedData.globalSettings) {
      migratedData.globalSettings = {
        defaultNotificationTime: '09:00',
        defaultZenMode: false,
        dailyNoteFolder: '',
        dailyNoteTemplate: '',
        linkHandling: 'direct'
      };
    }

    // Migrate prompt packs
    if (migratedData.promptPacks && Array.isArray(migratedData.promptPacks)) {
      migratedData.promptPacks = migratedData.promptPacks.map((pack: any) => {
        const migratedPack = { ...pack };

        // Add timestamps if missing
        if (!migratedPack.createdAt) {
          migratedPack.createdAt = new Date().toISOString();
        }
        if (!migratedPack.updatedAt) {
          migratedPack.updatedAt = new Date().toISOString();
        }

        // Migrate progress structure
        if (!migratedPack.progress) {
          migratedPack.progress = {
            completedPrompts: [],
            lastAccessDate: new Date().toISOString()
          };
        } else {
          // Ensure completedPrompts is an array
          if (!Array.isArray(migratedPack.progress.completedPrompts)) {
            migratedPack.progress.completedPrompts = [];
          }
          // Add lastAccessDate if missing
          if (!migratedPack.progress.lastAccessDate) {
            migratedPack.progress.lastAccessDate = new Date().toISOString();
          }
        }

        // Migrate settings structure
        if (!migratedPack.settings) {
          migratedPack.settings = {
            notificationEnabled: false,
            notificationTime: '09:00',
            notificationType: 'obsidian',
            zenModeEnabled: false,
            dailyNoteIntegration: true
          };
        }

        // Ensure all prompts have required fields
        if (migratedPack.prompts && Array.isArray(migratedPack.prompts)) {
          migratedPack.prompts = migratedPack.prompts.map((prompt: any, index: number) => {
            const migratedPrompt = { ...prompt };

            // Generate ID if missing
            if (!migratedPrompt.id) {
              migratedPrompt.id = `prompt-${Date.now()}-${index}`;
            }

            // Set default type if missing
            if (!migratedPrompt.type) {
              migratedPrompt.type = 'string';
            }

            // Ensure metadata exists
            if (!migratedPrompt.metadata) {
              migratedPrompt.metadata = {};
            }

            return migratedPrompt;
          });
        }

        return migratedPack;
      });
    } else {
      migratedData.promptPacks = [];
    }

    console.log('Migrated data to version 1.0.0');
    return migratedData;
  }

  /**
   * Validate data structure integrity
   */
  private validateDataStructure(data: any): void {
    if (!data || typeof data !== 'object') {
      throw new ValidationError('Data must be an object');
    }

    // Basic structure validation
    if (data.promptPacks && !Array.isArray(data.promptPacks)) {
      throw new ValidationError('promptPacks must be an array');
    }

    if (data.globalSettings && typeof data.globalSettings !== 'object') {
      throw new ValidationError('globalSettings must be an object');
    }

    // Validate each prompt pack structure
    if (data.promptPacks) {
      data.promptPacks.forEach((pack: any, index: number) => {
        if (!pack || typeof pack !== 'object') {
          throw new ValidationError(`Prompt pack at index ${index} must be an object`);
        }

        if (!pack.id || typeof pack.id !== 'string') {
          throw new ValidationError(`Prompt pack at index ${index} must have a valid ID`);
        }

        if (!pack.name || typeof pack.name !== 'string') {
          throw new ValidationError(`Prompt pack at index ${index} must have a valid name`);
        }

        if (!['Sequential', 'Random', 'Date'].includes(pack.type)) {
          throw new ValidationError(`Prompt pack at index ${index} must have a valid type`);
        }

        if (pack.prompts && !Array.isArray(pack.prompts)) {
          throw new ValidationError(`Prompt pack at index ${index} prompts must be an array`);
        }
      });
    }
  }

  /**
   * Compare version strings (returns -1, 0, or 1)
   */
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

  /**
   * Ensure a folder exists in the vault
   */
  private async ensureFolderExists(folderPath: string): Promise<void> {
    const folder = this.plugin.app.vault.getAbstractFileByPath(folderPath);
    if (!folder) {
      await this.plugin.app.vault.createFolder(folderPath);
    }
  }

  /**
   * Write content to a file in the vault
   */
  private async writeFile(filePath: string, content: string): Promise<void> {
    const file = this.plugin.app.vault.getAbstractFileByPath(filePath);

    if (file && file instanceof TFile) {
      await this.plugin.app.vault.modify(file, content);
    } else {
      await this.plugin.app.vault.create(filePath, content);
    }
  }

  /**
   * Utility function to add delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<{
    dataSize: number;
    backupCount: number;
    totalBackupSize: number;
    oldestBackup?: string;
    newestBackup?: string;
  }> {
    try {
      const data = await this.plugin.loadData();
      const dataSize = data ? JSON.stringify(data).length : 0;

      const backups = await this.listBackups();
      const backupCount = backups.length;

      let totalBackupSize = 0;
      for (const backup of backups) {
        totalBackupSize += backup.metadata.size;
      }

      const oldestBackup = backups.length > 0 ? backups[backups.length - 1].metadata.timestamp : undefined;
      const newestBackup = backups.length > 0 ? backups[0].metadata.timestamp : undefined;

      return {
        dataSize,
        backupCount,
        totalBackupSize,
        oldestBackup,
        newestBackup
      };

    } catch (error) {
      console.error('Failed to get storage stats:', error);
      return {
        dataSize: 0,
        backupCount: 0,
        totalBackupSize: 0
      };
    }
  }
}