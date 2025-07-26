/**
 * Core data models and interfaces for the Daily Prompts plugin
 */

export interface Prompt {
  id: string;
  content: string;
  type: 'link' | 'string' | 'markdown';
  date?: Date; // For Date-type packs
  order?: number; // For Sequential-type packs
  metadata?: Record<string, any>;
}

export interface PromptPackSettings {
  notificationEnabled: boolean;
  notificationTime: string; // HH:MM format
  notificationType: 'system' | 'obsidian';
  zenModeEnabled: boolean;
  dailyNoteIntegration: boolean;
  customTemplate?: string;
}

export interface PromptProgress {
  completedPrompts: Set<string>;
  currentIndex?: number; // For Sequential mode
  usedPrompts?: Set<string>; // For Random mode
  lastAccessDate: Date;
}

export interface PromptPack {
  id: string;
  name: string;
  type: 'Sequential' | 'Random' | 'Date';
  prompts: Prompt[];
  settings: PromptPackSettings;
  progress: PromptProgress;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;
}

export interface GlobalSettings {
  defaultNotificationTime: string;
  defaultZenMode: boolean;
  dailyNoteFolder: string;
  dailyNoteTemplate: string;
  linkHandling: 'embed' | 'reference' | 'direct';
}

export interface PluginSettings {
  promptPacks: PromptPack[];
  globalSettings: GlobalSettings;
}

// Export/Import format interfaces
export interface ExportedPromptPack {
  version: string;
  pack: PromptPack;
  metadata: {
    exportedAt: string;
    exportedBy: string;
  };
}

// Notification types
export type NotificationType = 'system' | 'obsidian';
export type PromptType = 'link' | 'string' | 'markdown';
export type PromptPackType = 'Sequential' | 'Random' | 'Date';
export type LinkHandling = 'embed' | 'reference' | 'direct';