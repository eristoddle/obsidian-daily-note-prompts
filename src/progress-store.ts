/**
 * Progress tracking system for the Daily Prompts plugin
 * Handles completion tracking, persistence, and archive functionality
 */

import { Plugin, TFile, TFolder } from 'obsidian';
import { PromptProgress, PromptPack, ValidationError } from './models';
import { IProgressStore } from './interfaces';
import { StorageManager } from './storage-manager';

export interface ProgressArchive {
  packId: string;
  packName: string;
  archivedAt: string;
  completedAt: string;
  progress: PromptProgress;
  totalPrompts: number;
  completionPercentage: number;
}

export interface ProgressStats {
  totalPacks: number;
  activePacks: number;
  completedPacks: number;
  archivedPacks: number;
  totalPrompts: number;
  completedPrompts: number;
  overallProgress: number;
}

/**
 * Progress store class that manages prompt completion tracking
 */
export class ProgressStore implements IProgressStore {
  private plugin: Plugin;
  private storageManager: StorageManager;
  private progressCache: Map<string, PromptProgress> = new Map();
  private readonly PROGRESS_FOLDER = '.obsidian/plugins/daily-prompts/progress';
  private readonly ARCHIVE_FOLDER = '.obsidian/plugins/daily-prompts/archives';

  // Performance optimizations
  private batchUpdateQueue: Map<string, PromptProgress> = new Map();
  private batchUpdateTimer: NodeJS.Timeout | null = null;
  private readonly BATCH_UPDATE_DELAY = 2000; // 2 seconds
  private readonly MAX_BATCH_SIZE = 20;
  private fileWritePromises: Map<string, Promise<void>> = new Map();
  private lastCleanupTime = 0;
  private readonly CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

  constructor(plugin: Plugin, storageManager: StorageManager) {
    this.plugin = plugin;
    this.storageManager = storageManager;
  }

  /**
   * Get progress for a specific prompt pack
   */
  getProgress(packId: string): PromptProgress {
    // Check cache first
    const cachedProgress = this.progressCache.get(packId);
    if (cachedProgress) {
      return cachedProgress;
    }

    // Return empty progress if not found
    const emptyProgress = new PromptProgress();
    this.progressCache.set(packId, emptyProgress);
    return emptyProgress;
  }

  /**
   * Update progress for a specific prompt pack with batching
   */
  async updateProgress(packId: string, progress: PromptProgress): Promise<void> {
    try {
      // Validate progress data
      progress.validate();

      // Update cache immediately
      this.progressCache.set(packId, progress);

      // Add to batch update queue
      this.batchUpdateQueue.set(packId, progress);

      // Schedule batch processing
      this.scheduleBatchUpdate();

      // Perform cleanup if needed
      this.performPeriodicCleanup();

    } catch (error) {
      throw new ValidationError(`Failed to update progress for pack ${packId}: ${error.message}`);
    }
  }

  /**
   * Schedule batch update processing
   */
  private scheduleBatchUpdate(): void {
    // Clear existing timer
    if (this.batchUpdateTimer) {
      clearTimeout(this.batchUpdateTimer);
    }

    // Process immediately if batch is full
    if (this.batchUpdateQueue.size >= this.MAX_BATCH_SIZE) {
      this.processBatchUpdates();
      return;
    }

    // Schedule delayed processing
    this.batchUpdateTimer = setTimeout(() => {
      this.processBatchUpdates();
    }, this.BATCH_UPDATE_DELAY);
  }

  /**
   * Process all queued batch updates
   */
  private async processBatchUpdates(): Promise<void> {
    if (this.batchUpdateQueue.size === 0) {
      return;
    }

    const updates = Array.from(this.batchUpdateQueue.entries());
    this.batchUpdateQueue.clear();

    // Clear timer
    if (this.batchUpdateTimer) {
      clearTimeout(this.batchUpdateTimer);
      this.batchUpdateTimer = null;
    }

    // Process updates in parallel with concurrency limit
    const concurrencyLimit = 5;
    const chunks = this.chunkArray(updates, concurrencyLimit);

    for (const chunk of chunks) {
      const promises = chunk.map(([packId, progress]) =>
        this.saveProgressToFileWithDeduplication(packId, progress)
      );

      try {
        await Promise.all(promises);
      } catch (error) {
        console.error('Failed to process batch updates:', error);
        // Re-queue failed updates
        chunk.forEach(([packId, progress]) => {
          this.batchUpdateQueue.set(packId, progress);
        });
      }
    }
  }

  /**
   * Save progress to file with write deduplication
   */
  private async saveProgressToFileWithDeduplication(packId: string, progress: PromptProgress): Promise<void> {
    // Check if there's already a write in progress for this pack
    const existingPromise = this.fileWritePromises.get(packId);
    if (existingPromise) {
      await existingPromise;
    }

    // Create new write promise
    const writePromise = this.saveProgressToFile(packId, progress);
    this.fileWritePromises.set(packId, writePromise);

    try {
      await writePromise;
    } finally {
      this.fileWritePromises.delete(packId);
    }
  }

  /**
   * Chunk array into smaller arrays
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Perform periodic cleanup operations
   */
  private performPeriodicCleanup(): void {
    const now = Date.now();
    if (now - this.lastCleanupTime < this.CLEANUP_INTERVAL) {
      return;
    }

    this.lastCleanupTime = now;

    // Clean up old cache entries (keep only recently accessed)
    const cutoffTime = now - (24 * 60 * 60 * 1000); // 24 hours ago
    for (const [packId, progress] of this.progressCache.entries()) {
      if (progress.lastAccessDate.getTime() < cutoffTime) {
        // Only remove from cache if not in batch queue
        if (!this.batchUpdateQueue.has(packId)) {
          this.progressCache.delete(packId);
        }
      }
    }
  }

  /**
   * Reset progress for a specific prompt pack
   */
  async resetProgress(packId: string): Promise<void> {
    try {
      const newProgress = new PromptProgress();

      // Update cache
      this.progressCache.set(packId, newProgress);

      // Persist to storage
      await this.saveProgressToFile(packId, newProgress);

    } catch (error) {
      throw new ValidationError(`Failed to reset progress for pack ${packId}: ${error.message}`);
    }
  }

  /**
   * Archive progress for a completed prompt pack
   */
  async archiveProgress(packId: string): Promise<void> {
    try {
      const progress = this.getProgress(packId);

      // Load pack data to get additional info for archive
      const packData = await this.getPackData(packId);
      if (!packData) {
        throw new Error(`Pack ${packId} not found`);
      }

      // Create archive entry
      const archive: ProgressArchive = {
        packId,
        packName: packData.name,
        archivedAt: new Date().toISOString(),
        completedAt: progress.lastAccessDate.toISOString(),
        progress,
        totalPrompts: packData.prompts.length,
        completionPercentage: progress.getCompletionPercentage(packData.prompts.length)
      };

      // Save to archive
      await this.saveArchive(archive);

      // Remove from active progress
      await this.deleteProgressFile(packId);
      this.progressCache.delete(packId);

    } catch (error) {
      throw new ValidationError(`Failed to archive progress for pack ${packId}: ${error.message}`);
    }
  }

  /**
   * Load all progress data from storage
   */
  async loadAllProgress(): Promise<void> {
    try {
      // Ensure progress folder exists
      await this.ensureFolderExists(this.PROGRESS_FOLDER);

      const progressFolder = this.plugin.app.vault.getAbstractFileByPath(this.PROGRESS_FOLDER);
      if (!progressFolder || !(progressFolder instanceof TFolder)) {
        return;
      }

      // Load each progress file
      for (const file of progressFolder.children) {
        if (file instanceof TFile && file.name.endsWith('-progress.json')) {
          try {
            const packId = file.name.replace('-progress.json', '');
            const progressData = await this.loadProgressFromFile(packId);

            if (progressData) {
              this.progressCache.set(packId, progressData);
            }
          } catch (error) {
            console.warn(`Failed to load progress for ${file.name}:`, error);
          }
        }
      }

    } catch (error) {
      console.error('Failed to load progress data:', error);
      throw new ValidationError(`Failed to load progress data: ${error.message}`);
    }
  }

  /**
   * Save all cached progress to storage
   */
  async saveAllProgress(): Promise<void> {
    try {
      const savePromises: Promise<void>[] = [];

      for (const [packId, progress] of this.progressCache) {
        savePromises.push(this.saveProgressToFile(packId, progress));
      }

      await Promise.all(savePromises);

    } catch (error) {
      throw new ValidationError(`Failed to save progress data: ${error.message}`);
    }
  }

  /**
   * Mark a prompt as completed
   */
  async markPromptCompleted(packId: string, promptId: string): Promise<void> {
    try {
      const progress = this.getProgress(packId);
      progress.markCompleted(promptId);
      await this.updateProgress(packId, progress);

    } catch (error) {
      throw new ValidationError(`Failed to mark prompt ${promptId} as completed: ${error.message}`);
    }
  }

  /**
   * Check if a prompt is completed
   */
  isPromptCompleted(packId: string, promptId: string): boolean {
    const progress = this.getProgress(packId);
    return progress.isCompleted(promptId);
  }

  /**
   * Get completion statistics for a pack
   */
  getPackStats(packId: string, totalPrompts: number): {
    completed: number;
    remaining: number;
    percentage: number;
    lastAccess: Date;
  } {
    const progress = this.getProgress(packId);
    const completed = progress.completedPrompts.size;
    const remaining = Math.max(0, totalPrompts - completed);
    const percentage = progress.getCompletionPercentage(totalPrompts);

    return {
      completed,
      remaining,
      percentage,
      lastAccess: progress.lastAccessDate
    };
  }

  /**
   * Get overall progress statistics
   */
  async getOverallStats(): Promise<ProgressStats> {
    try {
      // Load pack data to get total counts
      const allPackData = await this.getAllPackData();
      const archives = await this.listArchives();

      let totalPacks = allPackData.length;
      let activePacks = 0;
      let completedPacks = 0;
      let totalPrompts = 0;
      let completedPrompts = 0;

      // Calculate stats for active packs
      for (const pack of allPackData) {
        totalPrompts += pack.prompts.length;
        const progress = this.getProgress(pack.id);
        const packCompleted = progress.completedPrompts.size;
        completedPrompts += packCompleted;

        if (packCompleted === pack.prompts.length && pack.prompts.length > 0) {
          completedPacks++;
        } else {
          activePacks++;
        }
      }

      // Add archived pack stats
      const archivedPacks = archives.length;
      totalPacks += archivedPacks;

      for (const archive of archives) {
        totalPrompts += archive.totalPrompts;
        completedPrompts += archive.progress.completedPrompts.size;
      }

      const overallProgress = totalPrompts > 0 ? Math.round((completedPrompts / totalPrompts) * 100) : 0;

      return {
        totalPacks,
        activePacks,
        completedPacks: completedPacks + archivedPacks,
        archivedPacks,
        totalPrompts,
        completedPrompts,
        overallProgress
      };

    } catch (error) {
      console.error('Failed to get overall stats:', error);
      return {
        totalPacks: 0,
        activePacks: 0,
        completedPacks: 0,
        archivedPacks: 0,
        totalPrompts: 0,
        completedPrompts: 0,
        overallProgress: 0
      };
    }
  }

  /**
   * List all archived progress entries
   */
  async listArchives(): Promise<ProgressArchive[]> {
    try {
      const archives: ProgressArchive[] = [];
      const archiveFolder = this.plugin.app.vault.getAbstractFileByPath(this.ARCHIVE_FOLDER);

      if (!archiveFolder || !(archiveFolder instanceof TFolder)) {
        return archives;
      }

      for (const file of archiveFolder.children) {
        if (file instanceof TFile && file.name.endsWith('-archive.json')) {
          try {
            const archiveContent = await this.plugin.app.vault.read(file);
            const archiveData = JSON.parse(archiveContent);

            // Reconstruct PromptProgress from JSON
            archiveData.progress = PromptProgress.fromJSON(archiveData.progress);

            archives.push(archiveData);
          } catch (error) {
            console.warn(`Failed to read archive ${file.name}:`, error);
          }
        }
      }

      // Sort by archived date (newest first)
      archives.sort((a, b) => new Date(b.archivedAt).getTime() - new Date(a.archivedAt).getTime());

      return archives;

    } catch (error) {
      console.error('Failed to list archives:', error);
      return [];
    }
  }

  /**
   * Restore progress from archive
   */
  async restoreFromArchive(packId: string): Promise<void> {
    try {
      const archivePath = `${this.ARCHIVE_FOLDER}/${packId}-archive.json`;
      const archiveFile = this.plugin.app.vault.getAbstractFileByPath(archivePath);

      if (!archiveFile || !(archiveFile instanceof TFile)) {
        throw new Error(`Archive for pack ${packId} not found`);
      }

      const archiveContent = await this.plugin.app.vault.read(archiveFile);
      const archiveData: ProgressArchive = JSON.parse(archiveContent);

      // Reconstruct progress from archive
      const progress = PromptProgress.fromJSON(archiveData.progress);

      // Restore to active progress
      await this.updateProgress(packId, progress);

      // Remove from archive
      await this.plugin.app.vault.delete(archiveFile);

    } catch (error) {
      throw new ValidationError(`Failed to restore progress from archive for pack ${packId}: ${error.message}`);
    }
  }

  /**
   * Delete an archived progress entry
   */
  async deleteArchive(packId: string): Promise<void> {
    try {
      const archivePath = `${this.ARCHIVE_FOLDER}/${packId}-archive.json`;
      const archiveFile = this.plugin.app.vault.getAbstractFileByPath(archivePath);

      if (archiveFile && archiveFile instanceof TFile) {
        await this.plugin.app.vault.delete(archiveFile);
      }

    } catch (error) {
      console.warn(`Failed to delete archive for pack ${packId}:`, error);
    }
  }

  /**
   * Clean up progress data for deleted packs
   */
  async cleanupOrphanedProgress(): Promise<void> {
    try {
      const allPackData = await this.getAllPackData();
      const activePackIds = new Set(allPackData.map(pack => pack.id));

      // Clean up cached progress
      for (const packId of this.progressCache.keys()) {
        if (!activePackIds.has(packId)) {
          this.progressCache.delete(packId);
          await this.deleteProgressFile(packId);
        }
      }

      // Clean up progress files
      const progressFolder = this.plugin.app.vault.getAbstractFileByPath(this.PROGRESS_FOLDER);
      if (progressFolder && progressFolder instanceof TFolder) {
        for (const file of progressFolder.children) {
          if (file instanceof TFile && file.name.endsWith('-progress.json')) {
            const packId = file.name.replace('-progress.json', '');
            if (!activePackIds.has(packId)) {
              await this.plugin.app.vault.delete(file);
            }
          }
        }
      }

    } catch (error) {
      console.warn('Failed to cleanup orphaned progress:', error);
    }
  }

  /**
   * Export progress data for backup
   */
  async exportProgress(): Promise<string> {
    try {
      const progressData: Record<string, any> = {};

      // Export active progress
      for (const [packId, progress] of this.progressCache) {
        progressData[packId] = progress.toJSON();
      }

      // Export archives
      const archives = await this.listArchives();
      const archiveData = archives.map(archive => ({
        ...archive,
        progress: archive.progress.toJSON()
      }));

      const exportData = {
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        activeProgress: progressData,
        archives: archiveData
      };

      return JSON.stringify(exportData, null, 2);

    } catch (error) {
      throw new ValidationError(`Failed to export progress: ${error.message}`);
    }
  }

  /**
   * Import progress data from backup
   */
  async importProgress(jsonData: string, merge: boolean = false): Promise<void> {
    try {
      const importData = JSON.parse(jsonData);

      if (!importData.activeProgress || typeof importData.activeProgress !== 'object') {
        throw new Error('Invalid progress import format');
      }

      if (!merge) {
        // Clear existing progress
        this.progressCache.clear();
        await this.clearAllProgressFiles();
      }

      // Import active progress
      for (const [packId, progressData] of Object.entries(importData.activeProgress)) {
        try {
          const progress = PromptProgress.fromJSON(progressData);
          await this.updateProgress(packId, progress);
        } catch (error) {
          console.warn(`Failed to import progress for pack ${packId}:`, error);
        }
      }

      // Import archives if present
      if (importData.archives && Array.isArray(importData.archives)) {
        for (const archiveData of importData.archives) {
          try {
            // Reconstruct progress from JSON
            archiveData.progress = PromptProgress.fromJSON(archiveData.progress);
            await this.saveArchive(archiveData);
          } catch (error) {
            console.warn(`Failed to import archive for pack ${archiveData.packId}:`, error);
          }
        }
      }

    } catch (error) {
      throw new ValidationError(`Failed to import progress: ${error.message}`);
    }
  }

  // Private helper methods

  /**
   * Save progress to individual file
   */
  private async saveProgressToFile(packId: string, progress: PromptProgress): Promise<void> {
    try {
      await this.ensureFolderExists(this.PROGRESS_FOLDER);

      const filePath = `${this.PROGRESS_FOLDER}/${packId}-progress.json`;
      const content = JSON.stringify(progress.toJSON(), null, 2);

      await this.writeFile(filePath, content);

    } catch (error) {
      throw new Error(`Failed to save progress file for pack ${packId}: ${error.message}`);
    }
  }

  /**
   * Load progress from individual file
   */
  private async loadProgressFromFile(packId: string): Promise<PromptProgress | null> {
    try {
      const filePath = `${this.PROGRESS_FOLDER}/${packId}-progress.json`;
      const file = this.plugin.app.vault.getAbstractFileByPath(filePath);

      if (!file || !(file instanceof TFile)) {
        return null;
      }

      const content = await this.plugin.app.vault.read(file);
      const progressData = JSON.parse(content);

      return PromptProgress.fromJSON(progressData);

    } catch (error) {
      console.warn(`Failed to load progress file for pack ${packId}:`, error);
      return null;
    }
  }

  /**
   * Delete progress file
   */
  private async deleteProgressFile(packId: string): Promise<void> {
    try {
      const filePath = `${this.PROGRESS_FOLDER}/${packId}-progress.json`;
      const file = this.plugin.app.vault.getAbstractFileByPath(filePath);

      if (file && file instanceof TFile) {
        await this.plugin.app.vault.delete(file);
      }

    } catch (error) {
      console.warn(`Failed to delete progress file for pack ${packId}:`, error);
    }
  }

  /**
   * Save archive entry
   */
  private async saveArchive(archive: ProgressArchive): Promise<void> {
    try {
      await this.ensureFolderExists(this.ARCHIVE_FOLDER);

      const filePath = `${this.ARCHIVE_FOLDER}/${archive.packId}-archive.json`;
      const content = JSON.stringify({
        ...archive,
        progress: archive.progress.toJSON()
      }, null, 2);

      await this.writeFile(filePath, content);

    } catch (error) {
      throw new Error(`Failed to save archive for pack ${archive.packId}: ${error.message}`);
    }
  }

  /**
   * Clear all progress files
   */
  private async clearAllProgressFiles(): Promise<void> {
    try {
      const progressFolder = this.plugin.app.vault.getAbstractFileByPath(this.PROGRESS_FOLDER);
      if (!progressFolder || !(progressFolder instanceof TFolder)) {
        return;
      }

      const filesToDelete = progressFolder.children.filter(
        file => file instanceof TFile && file.name.endsWith('-progress.json')
      );

      for (const file of filesToDelete) {
        await this.plugin.app.vault.delete(file as TFile);
      }

    } catch (error) {
      console.warn('Failed to clear progress files:', error);
    }
  }

  /**
   * Get pack data from settings (helper method)
   */
  private async getPackData(packId: string): Promise<PromptPack | null> {
    try {
      const data = await this.storageManager.loadData();
      if (!data || !data.promptPacks) {
        return null;
      }

      return data.promptPacks.find((pack: any) => pack.id === packId) || null;

    } catch (error) {
      console.warn(`Failed to get pack data for ${packId}:`, error);
      return null;
    }
  }

  /**
   * Get all pack data from settings (helper method)
   */
  private async getAllPackData(): Promise<PromptPack[]> {
    try {
      const data = await this.storageManager.loadData();
      if (!data || !data.promptPacks) {
        return [];
      }

      return data.promptPacks;

    } catch (error) {
      console.warn('Failed to get all pack data:', error);
      return [];
    }
  }

  /**
   * Ensure a folder exists in the vault
   */
  private async ensureFolderExists(folderPath: string): Promise<void> {
    const folder = this.plugin.app.vault.getAbstractFileByPath(folderPath);
    if (!folder) {
      try {
        await this.plugin.app.vault.createFolder(folderPath);
      } catch (error) {
        // Ignore "folder already exists" errors that can occur due to race conditions
        if (!error.message.includes('already exists') && !error.message.includes('Folder already exists')) {
          throw error;
        }
      }
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
}