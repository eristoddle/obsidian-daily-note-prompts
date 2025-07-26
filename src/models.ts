/**
 * Core data model classes with validation for the Daily Prompts plugin
 */

import {
  Prompt as IPrompt,
  PromptPack as IPromptPack,
  PromptProgress as IPromptProgress,
  PromptPackSettings as IPromptPackSettings,
  PromptType,
  PromptPackType,
  NotificationType
} from './types';
import { generateId } from './utils';

/**
 * Validation error class for data model validation failures
 */
export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Prompt class with validation and factory methods
 */
export class Prompt implements IPrompt {
  id: string;
  content: string;
  type: PromptType;
  date?: Date;
  order?: number;
  metadata?: Record<string, any>;

  constructor(data: Partial<IPrompt> & { content: string }) {
    this.id = data.id || generateId();
    this.content = data.content;
    this.type = data.type || 'string';
    this.date = data.date;
    this.order = data.order;
    this.metadata = data.metadata || {};

    this.validate();
  }

  /**
   * Validate prompt data integrity
   */
  validate(): void {
    if (!this.id || typeof this.id !== 'string' || this.id.trim().length === 0) {
      throw new ValidationError('Prompt ID must be a non-empty string', 'id');
    }

    if (!this.content || typeof this.content !== 'string' || this.content.trim().length === 0) {
      throw new ValidationError('Prompt content must be a non-empty string', 'content');
    }

    if (!['link', 'string', 'markdown'].includes(this.type)) {
      throw new ValidationError('Prompt type must be "link", "string", or "markdown"', 'type');
    }

    if (this.date && !(this.date instanceof Date)) {
      throw new ValidationError('Prompt date must be a valid Date object', 'date');
    }

    if (this.order !== undefined && (!Number.isInteger(this.order) || this.order < 0)) {
      throw new ValidationError('Prompt order must be a non-negative integer', 'order');
    }

    if (this.metadata && typeof this.metadata !== 'object') {
      throw new ValidationError('Prompt metadata must be an object', 'metadata');
    }
  }

  /**
   * Create a new Prompt instance with validation
   */
  static create(content: string, type: PromptType = 'string', options: Partial<IPrompt> = {}): Prompt {
    return new Prompt({ content, type, ...options });
  }

  /**
   * Create a Prompt instance from JSON data with validation
   */
  static fromJSON(data: any): Prompt {
    if (typeof data !== 'object' || data === null) {
      throw new ValidationError('Prompt data must be an object');
    }

    // Convert date string back to Date object if present
    const promptData = { ...data };
    if (promptData.date && typeof promptData.date === 'string') {
      promptData.date = new Date(promptData.date);
    }

    return new Prompt(promptData);
  }

  /**
   * Convert prompt to JSON-serializable format
   */
  toJSON(): any {
    return {
      id: this.id,
      content: this.content,
      type: this.type,
      date: this.date?.toISOString(),
      order: this.order,
      metadata: this.metadata
    };
  }

  /**
   * Create a copy of the prompt
   */
  clone(): Prompt {
    return new Prompt({
      id: generateId(), // Generate new ID for clone
      content: this.content,
      type: this.type,
      date: this.date ? new Date(this.date) : undefined,
      order: this.order,
      metadata: this.metadata ? { ...this.metadata } : {}
    });
  }
}

/**
 * PromptProgress class with validation and factory methods
 */
export class PromptProgress implements IPromptProgress {
  completedPrompts: Set<string>;
  currentIndex?: number;
  usedPrompts?: Set<string>;
  lastAccessDate: Date;

  constructor(data: Partial<IPromptProgress> = {}) {
    this.completedPrompts = data.completedPrompts || new Set();
    this.currentIndex = data.currentIndex;
    this.usedPrompts = data.usedPrompts;
    this.lastAccessDate = data.lastAccessDate || new Date();

    this.validate();
  }

  /**
   * Validate progress data integrity
   */
  validate(): void {
    if (!(this.completedPrompts instanceof Set)) {
      throw new ValidationError('Completed prompts must be a Set', 'completedPrompts');
    }

    if (this.currentIndex !== undefined && (!Number.isInteger(this.currentIndex) || this.currentIndex < 0)) {
      throw new ValidationError('Current index must be a non-negative integer', 'currentIndex');
    }

    if (this.usedPrompts !== undefined && !(this.usedPrompts instanceof Set)) {
      throw new ValidationError('Used prompts must be a Set', 'usedPrompts');
    }

    if (!(this.lastAccessDate instanceof Date)) {
      throw new ValidationError('Last access date must be a valid Date object', 'lastAccessDate');
    }
  }

  /**
   * Create a new PromptProgress instance with defaults
   */
  static create(): PromptProgress {
    return new PromptProgress();
  }

  /**
   * Create PromptProgress from JSON data with validation
   */
  static fromJSON(data: any): PromptProgress {
    if (typeof data !== 'object' || data === null) {
      throw new ValidationError('Progress data must be an object');
    }

    const progressData: Partial<IPromptProgress> = {};

    // Convert arrays back to Sets
    if (data.completedPrompts) {
      progressData.completedPrompts = new Set(Array.isArray(data.completedPrompts) ? data.completedPrompts : []);
    }

    if (data.usedPrompts) {
      progressData.usedPrompts = new Set(Array.isArray(data.usedPrompts) ? data.usedPrompts : []);
    }

    progressData.currentIndex = data.currentIndex;

    // Convert date string back to Date object
    if (data.lastAccessDate) {
      progressData.lastAccessDate = new Date(data.lastAccessDate);
    }

    return new PromptProgress(progressData);
  }

  /**
   * Convert progress to JSON-serializable format
   */
  toJSON(): any {
    return {
      completedPrompts: Array.from(this.completedPrompts),
      currentIndex: this.currentIndex,
      usedPrompts: this.usedPrompts ? Array.from(this.usedPrompts) : undefined,
      lastAccessDate: this.lastAccessDate.toISOString()
    };
  }

  /**
   * Mark a prompt as completed
   */
  markCompleted(promptId: string): void {
    if (!promptId || typeof promptId !== 'string') {
      throw new ValidationError('Prompt ID must be a non-empty string');
    }
    this.completedPrompts.add(promptId);
    this.lastAccessDate = new Date();
  }

  /**
   * Check if a prompt is completed
   */
  isCompleted(promptId: string): boolean {
    return this.completedPrompts.has(promptId);
  }

  /**
   * Reset all progress
   */
  reset(): void {
    this.completedPrompts.clear();
    this.currentIndex = undefined;
    this.usedPrompts?.clear();
    this.lastAccessDate = new Date();
  }

  /**
   * Get completion percentage (0-100)
   */
  getCompletionPercentage(totalPrompts: number): number {
    if (totalPrompts <= 0) return 0;
    return Math.round((this.completedPrompts.size / totalPrompts) * 100);
  }
}

/**
 * PromptPackSettings class with validation and factory methods
 */
export class PromptPackSettings implements IPromptPackSettings {
  notificationEnabled: boolean;
  notificationTime: string;
  notificationType: NotificationType;
  zenModeEnabled: boolean;
  dailyNoteIntegration: boolean;
  customTemplate?: string;

  constructor(data: Partial<IPromptPackSettings> = {}) {
    this.notificationEnabled = data.notificationEnabled ?? false;
    this.notificationTime = data.notificationTime || '09:00';
    this.notificationType = data.notificationType || 'obsidian';
    this.zenModeEnabled = data.zenModeEnabled ?? false;
    this.dailyNoteIntegration = data.dailyNoteIntegration ?? true;
    this.customTemplate = data.customTemplate;

    this.validate();
  }

  /**
   * Validate settings data integrity
   */
  validate(): void {
    if (typeof this.notificationEnabled !== 'boolean') {
      throw new ValidationError('Notification enabled must be a boolean', 'notificationEnabled');
    }

    if (!this.isValidTimeFormat(this.notificationTime)) {
      throw new ValidationError('Notification time must be in HH:MM format', 'notificationTime');
    }

    if (!['system', 'obsidian'].includes(this.notificationType)) {
      throw new ValidationError('Notification type must be "system" or "obsidian"', 'notificationType');
    }

    if (typeof this.zenModeEnabled !== 'boolean') {
      throw new ValidationError('Zen mode enabled must be a boolean', 'zenModeEnabled');
    }

    if (typeof this.dailyNoteIntegration !== 'boolean') {
      throw new ValidationError('Daily note integration must be a boolean', 'dailyNoteIntegration');
    }

    if (this.customTemplate !== undefined && typeof this.customTemplate !== 'string') {
      throw new ValidationError('Custom template must be a string', 'customTemplate');
    }
  }

  /**
   * Validate time format (HH:MM)
   */
  private isValidTimeFormat(time: string): boolean {
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    return timeRegex.test(time);
  }

  /**
   * Create default settings
   */
  static createDefault(): PromptPackSettings {
    return new PromptPackSettings();
  }

  /**
   * Create settings from JSON data with validation
   */
  static fromJSON(data: any): PromptPackSettings {
    if (typeof data !== 'object' || data === null) {
      throw new ValidationError('Settings data must be an object');
    }

    return new PromptPackSettings(data);
  }

  /**
   * Convert settings to JSON-serializable format
   */
  toJSON(): any {
    return {
      notificationEnabled: this.notificationEnabled,
      notificationTime: this.notificationTime,
      notificationType: this.notificationType,
      zenModeEnabled: this.zenModeEnabled,
      dailyNoteIntegration: this.dailyNoteIntegration,
      customTemplate: this.customTemplate
    };
  }

  /**
   * Update settings with validation
   */
  update(updates: Partial<IPromptPackSettings>): void {
    const newSettings = new PromptPackSettings({ ...this, ...updates });
    Object.assign(this, newSettings);
  }
}

/**
 * PromptPack class with validation and factory methods
 */
export class PromptPack implements IPromptPack {
  id: string;
  name: string;
  type: PromptPackType;
  prompts: Prompt[];
  settings: PromptPackSettings;
  progress: PromptProgress;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;

  constructor(data: Partial<IPromptPack> & { name: string; type: PromptPackType }) {
    this.id = data.id || generateId();
    this.name = data.name;
    this.type = data.type;
    this.prompts = data.prompts?.map(p => p instanceof Prompt ? p : new Prompt(p)) || [];
    this.settings = data.settings instanceof PromptPackSettings ? data.settings : new PromptPackSettings(data.settings);
    this.progress = data.progress instanceof PromptProgress ? data.progress : new PromptProgress(data.progress);
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
    this.metadata = data.metadata || {};

    this.validate();
  }

  /**
   * Validate prompt pack data integrity
   */
  validate(): void {
    if (!this.id || typeof this.id !== 'string' || this.id.trim().length === 0) {
      throw new ValidationError('Prompt pack ID must be a non-empty string', 'id');
    }

    if (!this.name || typeof this.name !== 'string' || this.name.trim().length === 0) {
      throw new ValidationError('Prompt pack name must be a non-empty string', 'name');
    }

    if (!['Sequential', 'Random', 'Date'].includes(this.type)) {
      throw new ValidationError('Prompt pack type must be "Sequential", "Random", or "Date"', 'type');
    }

    if (!Array.isArray(this.prompts)) {
      throw new ValidationError('Prompts must be an array', 'prompts');
    }

    // Validate each prompt
    this.prompts.forEach((prompt, index) => {
      if (!(prompt instanceof Prompt)) {
        throw new ValidationError(`Prompt at index ${index} must be a Prompt instance`, 'prompts');
      }
    });

    if (!(this.settings instanceof PromptPackSettings)) {
      throw new ValidationError('Settings must be a PromptPackSettings instance', 'settings');
    }

    if (!(this.progress instanceof PromptProgress)) {
      throw new ValidationError('Progress must be a PromptProgress instance', 'progress');
    }

    if (!(this.createdAt instanceof Date)) {
      throw new ValidationError('Created date must be a valid Date object', 'createdAt');
    }

    if (!(this.updatedAt instanceof Date)) {
      throw new ValidationError('Updated date must be a valid Date object', 'updatedAt');
    }

    // Type-specific validations
    this.validateTypeSpecificRules();
  }

  /**
   * Validate type-specific rules
   */
  private validateTypeSpecificRules(): void {
    if (this.type === 'Sequential') {
      // Check that prompts have valid order values
      const orderedPrompts = this.prompts.filter(p => p.order !== undefined);
      if (orderedPrompts.length > 0 && orderedPrompts.length !== this.prompts.length) {
        throw new ValidationError('In Sequential mode, all prompts must have order values or none should', 'prompts');
      }
    }

    if (this.type === 'Date') {
      // Check that prompts have date values
      const datedPrompts = this.prompts.filter(p => p.date !== undefined);
      if (datedPrompts.length !== this.prompts.length) {
        throw new ValidationError('In Date mode, all prompts must have date values', 'prompts');
      }
    }
  }

  /**
   * Create a new PromptPack with defaults
   */
  static create(name: string, type: PromptPackType): PromptPack {
    return new PromptPack({ name, type });
  }

  /**
   * Create PromptPack from JSON data with validation
   */
  static fromJSON(data: any): PromptPack {
    if (typeof data !== 'object' || data === null) {
      throw new ValidationError('Prompt pack data must be an object');
    }

    const packData = { ...data };

    // Convert date strings back to Date objects
    if (packData.createdAt && typeof packData.createdAt === 'string') {
      packData.createdAt = new Date(packData.createdAt);
    }
    if (packData.updatedAt && typeof packData.updatedAt === 'string') {
      packData.updatedAt = new Date(packData.updatedAt);
    }

    // Convert prompts array to Prompt instances
    if (packData.prompts && Array.isArray(packData.prompts)) {
      packData.prompts = packData.prompts.map((p: any) => Prompt.fromJSON(p));
    }

    // Convert settings and progress
    if (packData.settings) {
      packData.settings = PromptPackSettings.fromJSON(packData.settings);
    }
    if (packData.progress) {
      packData.progress = PromptProgress.fromJSON(packData.progress);
    }

    // Ensure metadata is an object
    if (!packData.metadata || typeof packData.metadata !== 'object') {
      packData.metadata = {};
    }

    return new PromptPack(packData);
  }

  /**
   * Convert prompt pack to JSON-serializable format
   */
  toJSON(): any {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      prompts: this.prompts.map(p => p.toJSON()),
      settings: this.settings.toJSON(),
      progress: this.progress.toJSON(),
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      metadata: this.metadata
    };
  }

  /**
   * Add a prompt to the pack
   */
  addPrompt(prompt: Prompt): void {
    if (!(prompt instanceof Prompt)) {
      throw new ValidationError('Must provide a valid Prompt instance');
    }

    // Auto-assign order for Sequential packs
    if (this.type === 'Sequential' && prompt.order === undefined) {
      const maxOrder = Math.max(0, ...this.prompts.map(p => p.order || 0));
      prompt.order = maxOrder + 1;
    }

    this.prompts.push(prompt);
    this.updatedAt = new Date();
    this.validate();
  }

  /**
   * Remove a prompt from the pack
   */
  removePrompt(promptId: string): boolean {
    const index = this.prompts.findIndex(p => p.id === promptId);
    if (index === -1) return false;

    this.prompts.splice(index, 1);
    this.progress.completedPrompts.delete(promptId);
    this.progress.usedPrompts?.delete(promptId);
    this.updatedAt = new Date();

    return true;
  }

  /**
   * Get prompt by ID
   */
  getPrompt(promptId: string): Prompt | undefined {
    return this.prompts.find(p => p.id === promptId);
  }

  /**
   * Update pack settings
   */
  updateSettings(updates: Partial<IPromptPackSettings>): void {
    this.settings.update(updates);
    this.updatedAt = new Date();
  }

  /**
   * Get completion statistics
   */
  getStats(): { total: number; completed: number; percentage: number } {
    const total = this.prompts.length;
    const completed = this.progress.completedPrompts.size;
    const percentage = this.progress.getCompletionPercentage(total);

    return { total, completed, percentage };
  }

  /**
   * Check if pack is completed
   */
  isCompleted(): boolean {
    return this.prompts.length > 0 && this.progress.completedPrompts.size === this.prompts.length;
  }

  /**
   * Reset pack progress
   */
  resetProgress(): void {
    this.progress.reset();
    this.updatedAt = new Date();
  }

  /**
   * Clone the prompt pack with a new ID
   */
  clone(newName?: string): PromptPack {
    const clonedPrompts = this.prompts.map(p => p.clone());
    return new PromptPack({
      name: newName || `${this.name} (Copy)`,
      type: this.type,
      prompts: clonedPrompts,
      settings: new PromptPackSettings(this.settings.toJSON()),
      progress: new PromptProgress() // Start with fresh progress
    });
  }
}

/**
 * GlobalSettings class with validation and factory methods
 */
export class GlobalSettings {
  defaultNotificationTime: string;
  defaultZenMode: boolean;
  dailyNoteFolder: string;
  dailyNoteTemplate: string;
  linkHandling: 'embed' | 'reference' | 'direct';

  constructor(data: Partial<GlobalSettings> = {}) {
    this.defaultNotificationTime = data.defaultNotificationTime || '09:00';
    this.defaultZenMode = data.defaultZenMode ?? false;
    this.dailyNoteFolder = data.dailyNoteFolder || '';
    this.dailyNoteTemplate = data.dailyNoteTemplate || '';
    this.linkHandling = data.linkHandling || 'direct';

    this.validate();
  }

  /**
   * Validate global settings data integrity
   */
  validate(): void {
    if (!this.isValidTimeFormat(this.defaultNotificationTime)) {
      throw new ValidationError('Default notification time must be in HH:MM format', 'defaultNotificationTime');
    }

    if (typeof this.defaultZenMode !== 'boolean') {
      throw new ValidationError('Default zen mode must be a boolean', 'defaultZenMode');
    }

    if (typeof this.dailyNoteFolder !== 'string') {
      throw new ValidationError('Daily note folder must be a string', 'dailyNoteFolder');
    }

    if (typeof this.dailyNoteTemplate !== 'string') {
      throw new ValidationError('Daily note template must be a string', 'dailyNoteTemplate');
    }

    if (!['embed', 'reference', 'direct'].includes(this.linkHandling)) {
      throw new ValidationError('Link handling must be "embed", "reference", or "direct"', 'linkHandling');
    }
  }

  /**
   * Validate time format (HH:MM)
   */
  private isValidTimeFormat(time: string): boolean {
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    return timeRegex.test(time);
  }

  /**
   * Create default global settings
   */
  static createDefault(): GlobalSettings {
    return new GlobalSettings();
  }

  /**
   * Create settings from JSON data with validation
   */
  static fromJSON(data: any): GlobalSettings {
    if (typeof data !== 'object' || data === null) {
      throw new ValidationError('Global settings data must be an object');
    }

    return new GlobalSettings(data);
  }

  /**
   * Convert settings to JSON-serializable format
   */
  toJSON(): any {
    return {
      defaultNotificationTime: this.defaultNotificationTime,
      defaultZenMode: this.defaultZenMode,
      dailyNoteFolder: this.dailyNoteFolder,
      dailyNoteTemplate: this.dailyNoteTemplate,
      linkHandling: this.linkHandling
    };
  }

  /**
   * Update settings with validation
   */
  update(updates: Partial<GlobalSettings>): void {
    const newSettings = new GlobalSettings({ ...this, ...updates });
    Object.assign(this, newSettings);
  }
}/**
 * P
luginSettings class with validation and factory methods
 */
export class PluginSettings {
  promptPacks: PromptPack[];
  globalSettings: GlobalSettings;
  version: string;

  constructor(data: Partial<PluginSettings> = {}) {
    this.promptPacks = data.promptPacks?.map(p => p instanceof PromptPack ? p : PromptPack.fromJSON(p)) || [];
    this.globalSettings = data.globalSettings instanceof GlobalSettings ? data.globalSettings : new GlobalSettings(data.globalSettings);
    this.version = data.version || '1.0.0';

    this.validate();
  }

  /**
   * Validate plugin settings data integrity
   */
  validate(): void {
    if (!Array.isArray(this.promptPacks)) {
      throw new ValidationError('Prompt packs must be an array', 'promptPacks');
    }

    // Validate each prompt pack
    this.promptPacks.forEach((pack, index) => {
      if (!(pack instanceof PromptPack)) {
        throw new ValidationError(`Prompt pack at index ${index} must be a PromptPack instance`, 'promptPacks');
      }
    });

    // Check for duplicate pack IDs
    const packIds = this.promptPacks.map(p => p.id);
    const uniqueIds = new Set(packIds);
    if (packIds.length !== uniqueIds.size) {
      throw new ValidationError('Prompt pack IDs must be unique', 'promptPacks');
    }

    // Check for duplicate pack names
    const packNames = this.promptPacks.map(p => p.name);
    const uniqueNames = new Set(packNames);
    if (packNames.length !== uniqueNames.size) {
      throw new ValidationError('Prompt pack names must be unique', 'promptPacks');
    }

    if (!(this.globalSettings instanceof GlobalSettings)) {
      throw new ValidationError('Global settings must be a GlobalSettings instance', 'globalSettings');
    }

    if (typeof this.version !== 'string' || !this.version.trim()) {
      throw new ValidationError('Version must be a non-empty string', 'version');
    }
  }

  /**
   * Create default plugin settings
   */
  static createDefault(): PluginSettings {
    return new PluginSettings();
  }

  /**
   * Create settings from JSON data with validation and migration
   */
  static fromJSON(data: any): PluginSettings {
    if (typeof data !== 'object' || data === null) {
      throw new ValidationError('Plugin settings data must be an object');
    }

    // Apply migrations if needed
    const migratedData = PluginSettings.migrate(data);

    return new PluginSettings(migratedData);
  }

  /**
   * Convert settings to JSON-serializable format
   */
  toJSON(): any {
    return {
      promptPacks: this.promptPacks.map(p => p.toJSON()),
      globalSettings: this.globalSettings.toJSON(),
      version: this.version
    };
  }

  /**
   * Add a prompt pack
   */
  addPromptPack(pack: PromptPack): void {
    if (!(pack instanceof PromptPack)) {
      throw new ValidationError('Must provide a valid PromptPack instance');
    }

    // Check for duplicate ID
    if (this.promptPacks.some(p => p.id === pack.id)) {
      throw new ValidationError(`Prompt pack with ID ${pack.id} already exists`);
    }

    // Check for duplicate name
    if (this.promptPacks.some(p => p.name === pack.name)) {
      throw new ValidationError(`Prompt pack with name "${pack.name}" already exists`);
    }

    this.promptPacks.push(pack);
    this.validate();
  }

  /**
   * Remove a prompt pack by ID
   */
  removePromptPack(packId: string): boolean {
    const index = this.promptPacks.findIndex(p => p.id === packId);
    if (index === -1) return false;

    this.promptPacks.splice(index, 1);
    return true;
  }

  /**
   * Get a prompt pack by ID
   */
  getPromptPack(packId: string): PromptPack | undefined {
    return this.promptPacks.find(p => p.id === packId);
  }

  /**
   * Get a prompt pack by name
   */
  getPromptPackByName(name: string): PromptPack | undefined {
    return this.promptPacks.find(p => p.name === name);
  }

  /**
   * Update global settings
   */
  updateGlobalSettings(updates: Partial<GlobalSettings>): void {
    this.globalSettings.update(updates);
    this.validate();
  }

  /**
   * Migrate settings from older versions
   */
  static migrate(data: any): any {
    const migratedData = { ...data };

    // Migration from version 0.x to 1.0.0
    if (!migratedData.version || migratedData.version.startsWith('0.')) {
      // Add default global settings if missing
      if (!migratedData.globalSettings) {
        migratedData.globalSettings = GlobalSettings.createDefault().toJSON();
      }

      // Ensure all prompt packs have required fields
      if (migratedData.promptPacks && Array.isArray(migratedData.promptPacks)) {
        migratedData.promptPacks = migratedData.promptPacks.map((pack: any) => {
          const migratedPack = { ...pack };

          // Add missing timestamps
          if (!migratedPack.createdAt) {
            migratedPack.createdAt = new Date().toISOString();
          }
          if (!migratedPack.updatedAt) {
            migratedPack.updatedAt = new Date().toISOString();
          }

          // Ensure progress has all required fields
          if (!migratedPack.progress) {
            migratedPack.progress = PromptProgress.create().toJSON();
          } else {
            if (!migratedPack.progress.lastAccessDate) {
              migratedPack.progress.lastAccessDate = new Date().toISOString();
            }
            // Convert old progress format if needed
            if (migratedPack.progress.completedPrompts && !Array.isArray(migratedPack.progress.completedPrompts)) {
              migratedPack.progress.completedPrompts = [];
            }
          }

          // Ensure settings have all required fields
          if (!migratedPack.settings) {
            migratedPack.settings = PromptPackSettings.createDefault().toJSON();
          } else {
            // Add missing settings with defaults
            const defaultSettings = PromptPackSettings.createDefault().toJSON();
            migratedPack.settings = { ...defaultSettings, ...migratedPack.settings };
          }

          return migratedPack;
        });
      }

      migratedData.version = '1.0.0';
    }

    return migratedData;
  }

  /**
   * Get settings statistics
   */
  getStats(): {
    totalPacks: number;
    totalPrompts: number;
    completedPrompts: number;
    overallProgress: number;
  } {
    const totalPacks = this.promptPacks.length;
    const totalPrompts = this.promptPacks.reduce((sum, pack) => sum + pack.prompts.length, 0);
    const completedPrompts = this.promptPacks.reduce((sum, pack) => sum + pack.progress.completedPrompts.size, 0);
    const overallProgress = totalPrompts > 0 ? Math.round((completedPrompts / totalPrompts) * 100) : 0;

    return {
      totalPacks,
      totalPrompts,
      completedPrompts,
      overallProgress
    };
  }
}