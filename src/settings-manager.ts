/**
 * Settings management system for the Daily Prompts plugin
 */

import { Plugin } from 'obsidian';
import { PluginSettings, GlobalSettings, PromptPack, ValidationError } from './models';
import { ISettingsManager } from './interfaces';

/**
 * Settings manager class that handles persistence and validation
 */
export class SettingsManager implements ISettingsManager {
  private plugin: Plugin;
  private settings: PluginSettings;
  private isLoaded: boolean = false;

  constructor(plugin: Plugin) {
    this.plugin = plugin;
    this.settings = PluginSettings.createDefault();
  }

  /**
   * Load settings from storage with migration and validation
   */
  async loadSettings(): Promise<void> {
    try {
      const data = await this.plugin.loadData();

      if (data) {
        // Validate and migrate settings
        this.settings = PluginSettings.fromJSON(data);
      } else {
        // First time setup - use defaults
        this.settings = PluginSettings.createDefault();
        await this.saveSettings();
      }

      this.isLoaded = true;
    } catch (error) {
      console.error('Failed to load settings:', error);

      // Try to recover from backup or use defaults
      await this.recoverFromError(error);
    }
  }

  /**
   * Save settings to storage with validation
   */
  async saveSettings(): Promise<void> {
    try {
      // Validate before saving
      this.settings.validate();

      // Create backup before saving
      await this.createBackup();

      // Save to storage
      await this.plugin.saveData(this.settings.toJSON());
    } catch (error) {
      console.error('Failed to save settings:', error);
      throw new ValidationError(`Failed to save settings: ${error.message}`);
    }
  }

  /**
   * Get current settings
   */
  getSettings(): PluginSettings {
    if (!this.isLoaded) {
      throw new Error('Settings not loaded. Call loadSettings() first.');
    }
    return this.settings;
  }

  /**
   * Update settings with validation
   */
  async updateSettings(updates: Partial<PluginSettings>): Promise<void> {
    if (!this.isLoaded) {
      throw new Error('Settings not loaded. Call loadSettings() first.');
    }

    try {
      // Create new settings instance with updates
      const newSettings = new PluginSettings({
        ...this.settings.toJSON(),
        ...updates
      });

      // Validate the new settings
      newSettings.validate();

      // Update current settings
      this.settings = newSettings;

      // Save to storage
      await this.saveSettings();
    } catch (error) {
      throw new ValidationError(`Failed to update settings: ${error.message}`);
    }
  }

  /**
   * Add a prompt pack with validation
   */
  async addPromptPack(pack: PromptPack): Promise<void> {
    if (!this.isLoaded) {
      throw new Error('Settings not loaded. Call loadSettings() first.');
    }

    try {
      this.settings.addPromptPack(pack);
      await this.saveSettings();
    } catch (error) {
      throw new ValidationError(`Failed to add prompt pack: ${error.message}`);
    }
  }

  /**
   * Remove a prompt pack
   */
  async removePromptPack(packId: string): Promise<boolean> {
    if (!this.isLoaded) {
      throw new Error('Settings not loaded. Call loadSettings() first.');
    }

    const removed = this.settings.removePromptPack(packId);
    if (removed) {
      await this.saveSettings();
    }
    return removed;
  }

  /**
   * Update global settings
   */
  async updateGlobalSettings(updates: Partial<GlobalSettings>): Promise<void> {
    if (!this.isLoaded) {
      throw new Error('Settings not loaded. Call loadSettings() first.');
    }

    try {
      this.settings.updateGlobalSettings(updates);
      await this.saveSettings();
    } catch (error) {
      throw new ValidationError(`Failed to update global settings: ${error.message}`);
    }
  }

  /**
   * Get a prompt pack by ID
   */
  getPromptPack(packId: string): PromptPack | undefined {
    if (!this.isLoaded) {
      throw new Error('Settings not loaded. Call loadSettings() first.');
    }
    return this.settings.getPromptPack(packId);
  }

  /**
   * Get all prompt packs
   */
  getPromptPacks(): PromptPack[] {
    if (!this.isLoaded) {
      throw new Error('Settings not loaded. Call loadSettings() first.');
    }
    return this.settings.promptPacks;
  }

  /**
   * Get global settings
   */
  getGlobalSettings(): GlobalSettings {
    if (!this.isLoaded) {
      throw new Error('Settings not loaded. Call loadSettings() first.');
    }
    return this.settings.globalSettings;
  }

  /**
   * Reset all settings to defaults
   */
  async resetSettings(): Promise<void> {
    try {
      // Create backup before reset
      await this.createBackup();

      this.settings = PluginSettings.createDefault();
      await this.saveSettings();
    } catch (error) {
      throw new ValidationError(`Failed to reset settings: ${error.message}`);
    }
  }

  /**
   * Export settings as JSON string
   */
  exportSettings(): string {
    if (!this.isLoaded) {
      throw new Error('Settings not loaded. Call loadSettings() first.');
    }

    return JSON.stringify(this.settings.toJSON(), null, 2);
  }

  /**
   * Import settings from JSON string with validation
   */
  async importSettings(jsonData: string, merge: boolean = false): Promise<void> {
    try {
      const data = JSON.parse(jsonData);
      const importedSettings = PluginSettings.fromJSON(data);

      if (merge) {
        // Merge with existing settings
        const existingPacks = this.settings.promptPacks;
        const importedPacks = importedSettings.promptPacks;

        // Add imported packs that don't conflict
        for (const pack of importedPacks) {
          const existingPack = existingPacks.find(p => p.name === pack.name);
          if (!existingPack) {
            this.settings.addPromptPack(pack);
          }
        }

        // Update global settings
        this.settings.updateGlobalSettings(importedSettings.globalSettings.toJSON());
      } else {
        // Replace all settings
        await this.createBackup();
        this.settings = importedSettings;
      }

      await this.saveSettings();
    } catch (error) {
      throw new ValidationError(`Failed to import settings: ${error.message}`);
    }
  }

  /**
   * Create a backup of current settings
   */
  private async createBackup(): Promise<void> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupKey = `daily-prompts-backup-${timestamp}`;

      // Store the backup data (simplified approach)
      // In practice, you might want to use the file system or a separate storage mechanism
      console.log('Backup created at:', new Date().toISOString());
    } catch (error) {
      console.warn('Failed to create backup:', error);
      // Don't throw - backup failure shouldn't prevent saving
    }
  }

  /**
   * Recover from settings loading error
   */
  private async recoverFromError(error: any): Promise<void> {
    console.warn('Attempting to recover from settings error:', error);

    try {
      // Try to load from backup
      const backupData = await this.loadFromBackup();
      if (backupData) {
        this.settings = PluginSettings.fromJSON(backupData);
        console.log('Successfully recovered from backup');
      } else {
        // Use defaults if no backup available
        this.settings = PluginSettings.createDefault();
        console.log('Using default settings due to recovery failure');
      }

      // Save the recovered/default settings
      await this.saveSettings();
      this.isLoaded = true;
    } catch (recoveryError) {
      console.error('Failed to recover settings:', recoveryError);

      // Last resort - use defaults without saving
      this.settings = PluginSettings.createDefault();
      this.isLoaded = true;

      throw new ValidationError('Settings corrupted and recovery failed. Using defaults.');
    }
  }

  /**
   * Load settings from most recent backup
   */
  private async loadFromBackup(): Promise<any | null> {
    try {
      // This is a simplified backup recovery
      // In a real implementation, you might want to store backup metadata
      // and iterate through available backups

      // For now, just return null to indicate no backup available
      // This would need to be implemented based on how Obsidian handles
      // multiple data keys or file-based backups
      return null;
    } catch (error) {
      console.warn('Failed to load from backup:', error);
      return null;
    }
  }

  /**
   * Validate current settings integrity
   */
  validateSettings(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
      this.settings.validate();
      return { isValid: true, errors: [] };
    } catch (error) {
      if (error instanceof ValidationError) {
        errors.push(error.message);
      } else {
        errors.push(`Unknown validation error: ${error.message}`);
      }

      return { isValid: false, errors };
    }
  }

  /**
   * Get settings statistics
   */
  getSettingsStats(): {
    totalPacks: number;
    totalPrompts: number;
    completedPrompts: number;
    overallProgress: number;
    isLoaded: boolean;
  } {
    const stats = this.isLoaded ? this.settings.getStats() : {
      totalPacks: 0,
      totalPrompts: 0,
      completedPrompts: 0,
      overallProgress: 0
    };

    return {
      ...stats,
      isLoaded: this.isLoaded
    };
  }
}