/**
 * Service interfaces for the Daily Prompts plugin
 */

import { TFile } from 'obsidian';
import { Prompt, PromptPack, PromptProgress } from './types';

export interface IPromptService {
  getNextPrompt(packId: string): Promise<Prompt | null>;
  markPromptCompleted(packId: string, promptId: string): Promise<void>;
  resetProgress(packId: string): Promise<void>;
  getProgress(packId: string): PromptProgress;
}

export interface INotificationService {
  scheduleNotification(pack: PromptPack): void;
  cancelNotification(packId: string): void;
  showNotification(prompt: Prompt, pack: PromptPack): void;
  checkMissedNotifications(): Promise<void>;
}

export interface IDailyNoteService {
  createOrOpenDailyNote(date?: Date): Promise<TFile>;
  insertPrompt(prompt: Prompt, file: TFile): Promise<void>;
  enableZenMode(): void;
  disableZenMode(): void;
}

export interface IImportExportService {
  exportPack(pack: PromptPack): Promise<string>;
  importPack(jsonData: string): Promise<PromptPack>;
  validatePackFormat(jsonData: string): boolean;
}

export interface ISettingsManager {
  loadSettings(): Promise<void>;
  saveSettings(): Promise<void>;
  getSettings(): any;
  updateSettings(settings: any): Promise<void>;
}

export interface IProgressStore {
  getProgress(packId: string): PromptProgress;
  updateProgress(packId: string, progress: PromptProgress): Promise<void>;
  resetProgress(packId: string): Promise<void>;
  archiveProgress(packId: string): Promise<void>;
}