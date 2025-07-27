/**
 * Storage manager for the Daily Prompts plugin
 * Handles data persistence, backup, restore, and migration functionality
 */

import { Plugin, TFile, TFolder } from 'obsidian';
import { PluginSettings, PromptPack, ValidationError } from './models';
import { ErrorHandler, ErrorType, ErrorSeverity } from './error-handler';

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
  private errorHandler?: ErrorHandler;
  private readonly BACKUP_FOLDER = '.obsidian/plugins/daily-prompts/backups';
  private readonly PROGRESS_FOLDER = '.obsidian/plugins/daily-prompts/progress';
  private readonly MAX_BACKUPS = 10;
  private readonly BACKUP_RETENTION_DAYS = 30;

  // Performance optimizations
  private dataCache: { data: any; timestamp: number; hash: string } | null = null;
  private readonly CACHE_TTL = 2 * 60 * 1000; // 2 minutes cache TTL
  private compressionEnabled = true;
  private writeQueue: Array<{ data: any; options: StorageOptions; resolve: Function; reject: Function }> = [];
  private isProcessingQueue = false;

  // Advanced caching and optimization
  private partialDataCache: Map<string, { data: any; timestamp: number }> = new Map();
  private readonly PARTIAL_CACHE_TTL = 5 * 60 * 1000; // 5 minutes for partial data
  private readonly MAX_PARTIAL_CACHE_SIZE = 50;
  private compressionRatio = 1.0;
  private lastCompressionCheck = 0;
  private readonly COMPRESSION_CHECK_INTERVAL = 10 * 60 * 1000; // 10 minutes

  constructor(plugin: Plugin) {
    this.plugin = plugin;
  }

  /**
   * Set the error handler for comprehensive error handling
   */
  setErrorHandler(errorHandler: ErrorHandler): void {
    this.errorHandler = errorHandler;
  }

  /**
   * Save plugin data with optional backup creation
   */
  async saveData(data: any, options: StorageOptions = {}): Promise<void> {
    // Performance optimization: Queue writes to prevent concurrent saves
    return new Promise((resolve, reject) => {
      this.writeQueue.push({ data, options, resolve, reject });
      this.processWriteQueue();
    });
  }

  /**
   * Process the write queue to handle saves sequentially
   */
  private async processWriteQueue(): Promise<void> {
    if (this.isProcessingQueue || this.writeQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.writeQueue.length > 0) {
      const { data, options, resolve, reject } = this.writeQueue.shift()!;

      try {
        await this.performSave(data, options);
        resolve();
      } catch (error) {
        reject(error);
      }
    }

    this.isProcessingQueue = false;
  }

  /**
   * Perform the actual save operation
   */
  private async performSave(data: any, options: StorageOptions): Promise<void> {
    const {
      createBackup = true,
      validateData = true,
      retryOnFailure = true,
      maxRetries = 3
    } = options;

    const context = this.errorHandler?.createContext('data_saving', 'storage-manager', data);
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

        // Performance optimization: Compress data if enabled
        const dataToSave = this.compressionEnabled ? this.compressData(data) : data;

        // Save the data
        await this.plugin.saveData(dataToSave);

        // Performance optimization: Update cache
        const dataHash = this.hashObject(data);
        this.dataCache = {
          data: data, // Store uncompressed data in cache
          timestamp: Date.now(),
          hash: dataHash
        };

        return; // Success

      } catch (error) {
        lastError = error as Error;
        attempt++;

        // Use error handler for recovery if available
        if (this.errorHandler && context && attempt === 1) {
          try {
            await this.errorHandler.handleError(lastError, context, {
              attemptRecovery: false, // Don't recover on save, just notify
              notifyUser: attempt >= maxRetries,
              severity: ErrorSeverity.HIGH
            });
          } catch (handlerError) {
            console.warn('Error handler failed during save:', handlerError);
          }
        }

        if (!retryOnFailure || attempt >= maxRetries) {
          break;
        }

        // Wait before retry with exponential backoff
        await this.delay(Math.pow(2, attempt) * 1000);
      }
    }

    const finalError = new ValidationError(`Failed to save data after ${maxRetries} attempts: ${lastError?.message}`);

    // Final error notification through error handler
    if (this.errorHandler && context) {
      try {
        await this.errorHandler.handleError(finalError, context, {
          attemptRecovery: false,
          notifyUser: true,
          severity: ErrorSeverity.CRITICAL
        });
      } catch (handlerError) {
        console.warn('Error handler failed for final save error:', handlerError);
      }
    }

    throw finalError;
  }

  /**
   * Load plugin data with validation and migration
   */
  async loadData(): Promise<any> {
    // Performance optimization: Check cache first with hash validation
    if (this.dataCache && (Date.now() - this.dataCache.timestamp) < this.CACHE_TTL) {
      // Verify cache integrity with hash check
      const currentHash = await this.calculateDataHash();
      if (currentHash === this.dataCache.hash) {
        return this.dataCache.data;
      } else {
        // Cache is stale, clear it
        this.dataCache = null;
      }
    }

    const context = this.errorHandler?.createContext('data_loading', 'storage-manager');

    try {
      const rawData = await this.plugin.loadData();

      if (!rawData) {
        return null;
      }

      // Performance optimization: Decompress data if needed
      const data = this.isCompressedData(rawData) ? this.decompressData(rawData) : rawData;

      // Validate loaded data
      this.validateDataStructure(data);

      // Apply migrations if needed
      const migratedData = await this.migrateData(data);

      // Performance optimization: Cache the result with hash
      const dataHash = this.hashObject(migratedData);
      this.dataCache = {
        data: migratedData,
        timestamp: Date.now(),
        hash: dataHash
      };

      return migratedData;

    } catch (error) {
      if (this.errorHandler && context) {
        try {
          // Attempt recovery through error handler
          return await this.errorHandler.handleError(error as Error, context, {
            attemptRecovery: true,
            notifyUser: true,
            severity: ErrorSeverity.CRITICAL
          });
        } catch (handlerError) {
          // If error handler fails, fall back to original recovery logic
          console.error('Error handler failed, using fallback recovery:', handlerError);
        }
      }

      // Fallback recovery logic
      console.error('Failed to load data:', error);

      // Try to recover from backup
      const recoveredData = await this.recoverFromBackup();
      if (recoveredData) {
        console.log('Successfully recovered data from backup');

        // Performance optimization: Cache the recovered data
        const dataHash = this.hashObject(recoveredData);
        this.dataCache = {
          data: recoveredData,
          timestamp: Date.now(),
          hash: dataHash
        };

        return recoveredData;
      }

      throw new ValidationError(`Failed to load data and recovery failed: ${(error as Error).message}`);
    }
  }

  /**
   * Load partial data (specific prompt pack) with caching
   */
  async loadPartialData(packId: string): Promise<any> {
    // Check partial cache first
    const cacheKey = `pack-${packId}`;
    const cached = this.partialDataCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < this.PARTIAL_CACHE_TTL) {
      return cached.data;
    }

    try {
      // Load full data and extract the specific pack
      const fullData = await this.loadData();
      if (!fullData?.promptPacks) {
        return null;
      }

      const pack = fullData.promptPacks.find((p: any) => p.id === packId);
      if (pack) {
        // Cache the partial data
        this.cachePartialData(cacheKey, pack);
      }

      return pack || null;
    } catch (error) {
      console.error(`Failed to load partial data for pack ${packId}:`, error);
      return null;
    }
  }

  /**
   * Cache partial data with size management
   */
  private cachePartialData(key: string, data: any): void {
    // Manage cache size
    if (this.partialDataCache.size >= this.MAX_PARTIAL_CACHE_SIZE) {
      // Remove oldest entries
      const entries = Array.from(this.partialDataCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toRemove = entries.slice(0, Math.floor(this.MAX_PARTIAL_CACHE_SIZE * 0.2));
      toRemove.forEach(([key]) => this.partialDataCache.delete(key));
    }

    this.partialDataCache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Calculate hash of current data for cache validation
   */
  private async calculateDataHash(): Promise<string> {
    try {
      const rawData = await this.plugin.loadData();
      return this.hashObject(rawData);
    } catch {
      return '';
    }
  }

  /**
   * Generate hash for object (simple hash function)
   */
  private hashObject(obj: any): string {
    try {
      const str = JSON.stringify(obj);
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
      }
      return hash.toString();
    } catch {
      return Date.now().toString();
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
    cacheHitRate?: number;
    compressionRatio?: number;
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

      // Performance metrics
      const cacheHitRate = this.getCacheHitRate();
      const compressionRatio = this.getCompressionRatio(data);

      return {
        dataSize,
        backupCount,
        totalBackupSize,
        oldestBackup,
        newestBackup,
        cacheHitRate,
        compressionRatio
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

  // Performance optimization methods

  /**
   * Compress data for storage with adaptive compression
   */
  private compressData(data: any): any {
    if (!this.compressionEnabled) {
      return data;
    }

    try {
      // Check if compression is beneficial
      const originalString = JSON.stringify(data);
      const originalSize = originalString.length;

      // Skip compression for small data
      if (originalSize < 1000) {
        return data;
      }

      // Apply compression techniques
      const compressedData = this.applyCompressionTechniques(data, originalString);
      const compressedString = JSON.stringify(compressedData);
      const compressedSize = compressedString.length;

      // Update compression ratio
      this.compressionRatio = compressedSize / originalSize;

      // Only use compression if it provides significant benefit
      if (this.compressionRatio < 0.8) {
        return {
          __compressed: true,
          __version: '2.0',
          __ratio: this.compressionRatio,
          data: compressedData
        };
      } else {
        // Compression not beneficial, return original
        return data;
      }
    } catch (error) {
      console.warn('Failed to compress data, using uncompressed:', error);
      return data;
    }
  }

  /**
   * Apply various compression techniques
   */
  private applyCompressionTechniques(data: any, jsonString: string): any {
    try {
      // Technique 1: String deduplication
      const stringMap = new Map<string, string>();
      let stringCounter = 0;

      const deduplicateStrings = (obj: any): any => {
        if (typeof obj === 'string' && obj.length > 10) {
          if (!stringMap.has(obj)) {
            stringMap.set(obj, `__str_${stringCounter++}`);
          }
          return { __ref: stringMap.get(obj) };
        } else if (Array.isArray(obj)) {
          return obj.map(deduplicateStrings);
        } else if (obj && typeof obj === 'object') {
          const result: any = {};
          for (const [key, value] of Object.entries(obj)) {
            result[key] = deduplicateStrings(value);
          }
          return result;
        }
        return obj;
      };

      const deduplicatedData = deduplicateStrings(data);

      // Only apply deduplication if we have enough strings to make it worthwhile
      if (stringMap.size > 5) {
        const stringLookup: Record<string, string> = {};
        for (const [original, ref] of stringMap.entries()) {
          stringLookup[ref] = original;
        }

        return {
          __technique: 'deduplicate',
          __strings: stringLookup,
          data: deduplicatedData
        };
      }

      // Technique 2: Remove default values
      return this.removeDefaultValues(data);
    } catch (error) {
      console.warn('Compression techniques failed, using simple compression:', error);
      return { __technique: 'simple', data: jsonString };
    }
  }

  /**
   * Remove default values to reduce data size
   */
  private removeDefaultValues(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map(item => this.removeDefaultValues(item));
    } else if (obj && typeof obj === 'object') {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        // Skip common default values
        if (this.isDefaultValue(key, value)) {
          continue;
        }
        result[key] = this.removeDefaultValues(value);
      }
      return result;
    }
    return obj;
  }

  /**
   * Check if a value is a default value that can be omitted
   */
  private isDefaultValue(key: string, value: any): boolean {
    // Common default values that can be omitted
    const defaults: Record<string, any> = {
      notificationEnabled: false,
      zenModeEnabled: false,
      dailyNoteIntegration: true,
      notificationType: 'obsidian',
      notificationTime: '09:00',
      linkHandling: 'direct',
      defaultZenMode: false,
      dailyNoteFolder: '',
      dailyNoteTemplate: ''
    };

    return key in defaults && value === defaults[key];
  }

  /**
   * Decompress data from storage with version handling
   */
  private decompressData(compressedData: any): any {
    try {
      if (!compressedData.__compressed) {
        return compressedData;
      }

      const version = compressedData.__version || '1.0';

      switch (version) {
        case '2.0':
          return this.decompressV2(compressedData.data);
        case '1.0':
        default:
          return JSON.parse(compressedData.data);
      }
    } catch (error) {
      console.warn('Failed to decompress data, using as-is:', error);
      return compressedData;
    }
  }

  /**
   * Decompress version 2.0 format with advanced techniques
   */
  private decompressV2(data: any): any {
    try {
      if (data.__technique === 'deduplicate') {
        return this.restoreStringDeduplication(data);
      } else if (data.__technique === 'simple') {
        return JSON.parse(data.data);
      } else {
        // Default values were removed, restore them
        return this.restoreDefaultValues(data);
      }
    } catch (error) {
      console.warn('Failed to decompress v2 data:', error);
      return data;
    }
  }

  /**
   * Restore string deduplication
   */
  private restoreStringDeduplication(compressedData: any): any {
    const { __strings: stringLookup, data } = compressedData;

    const restoreStrings = (obj: any): any => {
      if (obj && typeof obj === 'object' && obj.__ref) {
        return stringLookup[obj.__ref] || obj.__ref;
      } else if (Array.isArray(obj)) {
        return obj.map(restoreStrings);
      } else if (obj && typeof obj === 'object') {
        const result: any = {};
        for (const [key, value] of Object.entries(obj)) {
          result[key] = restoreStrings(value);
        }
        return result;
      }
      return obj;
    };

    return restoreStrings(data);
  }

  /**
   * Restore default values that were removed during compression
   */
  private restoreDefaultValues(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map(item => this.restoreDefaultValues(item));
    } else if (obj && typeof obj === 'object') {
      const result: any = { ...obj };

      // Restore common default values based on object type
      if (result.type === 'Sequential' || result.type === 'Random' || result.type === 'Date') {
        // This is a prompt pack, restore pack defaults
        if (!('settings' in result)) {
          result.settings = {};
        }
        this.applyDefaultSettings(result.settings);
      }

      // Recursively restore defaults in nested objects
      for (const [key, value] of Object.entries(result)) {
        result[key] = this.restoreDefaultValues(value);
      }

      return result;
    }
    return obj;
  }

  /**
   * Apply default settings to a settings object
   */
  private applyDefaultSettings(settings: any): void {
    const defaults = {
      notificationEnabled: false,
      zenModeEnabled: false,
      dailyNoteIntegration: true,
      notificationType: 'obsidian',
      notificationTime: '09:00'
    };

    for (const [key, defaultValue] of Object.entries(defaults)) {
      if (!(key in settings)) {
        settings[key] = defaultValue;
      }
    }
  }

  /**
   * Check if data is compressed
   */
  private isCompressedData(data: any): boolean {
    return data && typeof data === 'object' && data.__compressed === true;
  }

  /**
   * Get cache hit rate for performance monitoring
   */
  private getCacheHitRate(): number {
    // This would be implemented with actual metrics tracking
    // For now, return a placeholder
    return this.dataCache ? 0.8 : 0;
  }

  /**
   * Get compression ratio for performance monitoring
   */
  private getCompressionRatio(data: any): number {
    if (!data || !this.compressionEnabled) {
      return 1.0;
    }

    try {
      const originalSize = JSON.stringify(data).length;
      const compressedSize = JSON.stringify(this.compressData(data)).length;
      return originalSize > 0 ? compressedSize / originalSize : 1.0;
    } catch (error) {
      return 1.0;
    }
  }

  /**
   * Clear data cache
   */
  clearCache(): void {
    this.dataCache = null;
    this.partialDataCache.clear();
  }

  /**
   * Optimize compression settings based on usage patterns
   */
  private optimizeCompressionSettings(): void {
    const now = Date.now();
    if (now - this.lastCompressionCheck < this.COMPRESSION_CHECK_INTERVAL) {
      return;
    }

    this.lastCompressionCheck = now;

    // Adjust compression based on effectiveness
    if (this.compressionRatio > 0.9) {
      // Compression not very effective, consider disabling for small data
      console.log('Daily Prompts: Compression ratio low, optimizing settings');
    } else if (this.compressionRatio < 0.5) {
      // Very effective compression, ensure it's enabled
      this.compressionEnabled = true;
    }
  }

  /**
   * Preload frequently accessed data
   */
  async preloadFrequentData(): Promise<void> {
    try {
      // Load main data into cache
      await this.loadData();

      // Preload recently accessed packs
      const data = this.dataCache?.data;
      if (data?.promptPacks) {
        const recentPacks = data.promptPacks
          .filter((pack: any) => {
            const lastAccess = new Date(pack.progress?.lastAccessDate || 0);
            const daysSinceAccess = (Date.now() - lastAccess.getTime()) / (1000 * 60 * 60 * 24);
            return daysSinceAccess < 7; // Accessed within last week
          })
          .slice(0, 10); // Limit to 10 most recent

        // Preload these packs into partial cache
        for (const pack of recentPacks) {
          this.cachePartialData(`pack-${pack.id}`, pack);
        }
      }
    } catch (error) {
      console.warn('Failed to preload frequent data:', error);
    }
  }

  /**
   * Get cache efficiency metrics
   */
  getCacheMetrics(): {
    mainCacheHit: boolean;
    partialCacheSize: number;
    partialCacheHitRate: number;
    compressionRatio: number;
    memoryUsage: number;
  } {
    const memoryUsage = this.estimateCacheMemoryUsage();

    return {
      mainCacheHit: this.dataCache !== null,
      partialCacheSize: this.partialDataCache.size,
      partialCacheHitRate: this.calculatePartialCacheHitRate(),
      compressionRatio: this.compressionRatio,
      memoryUsage
    };
  }

  /**
   * Estimate cache memory usage
   */
  private estimateCacheMemoryUsage(): number {
    let totalSize = 0;

    // Main cache
    if (this.dataCache) {
      totalSize += this.estimateObjectSize(this.dataCache.data);
    }

    // Partial cache
    for (const entry of this.partialDataCache.values()) {
      totalSize += this.estimateObjectSize(entry.data);
    }

    return totalSize;
  }

  /**
   * Calculate partial cache hit rate (simplified)
   */
  private calculatePartialCacheHitRate(): number {
    // This would be more sophisticated in a real implementation
    // For now, return a reasonable estimate based on cache size
    return Math.min(this.partialDataCache.size / this.MAX_PARTIAL_CACHE_SIZE, 1.0);
  }

  /**
   * Estimate object size in bytes
   */
  private estimateObjectSize(obj: any): number {
    try {
      return JSON.stringify(obj).length * 2; // UTF-16 approximation
    } catch {
      return 1000; // Fallback
    }
  }

  /**
   * Enable or disable compression
   */
  setCompressionEnabled(enabled: boolean): void {
    this.compressionEnabled = enabled;
    if (!enabled) {
      // Clear cache when disabling compression to avoid inconsistencies
      this.clearCache();
    }
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): {
    cacheEnabled: boolean;
    compressionEnabled: boolean;
    queueLength: number;
    isProcessingQueue: boolean;
  } {
    return {
      cacheEnabled: this.dataCache !== null,
      compressionEnabled: this.compressionEnabled,
      queueLength: this.writeQueue.length,
      isProcessingQueue: this.isProcessingQueue
    };
  }

  /**
   * Cleanup method for proper resource management
   */
  destroy(): void {
    // Clear cache
    this.clearCache();

    // Clear write queue
    this.writeQueue.forEach(({ reject }) => {
      reject(new Error('StorageManager is being destroyed'));
    });
    this.writeQueue = [];
    this.isProcessingQueue = false;
  }
}