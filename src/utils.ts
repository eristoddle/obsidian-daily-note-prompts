/**
 * Utility functions for the Daily Prompts plugin
 */

import { Prompt, PromptPack, PromptProgress } from './types';

/**
 * Generate a unique ID for prompts and prompt packs
 */
export function generateId(): string {
  return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

/**
 * Create a new prompt with default values
 */
export function createPrompt(content: string, type: 'link' | 'string' | 'markdown' = 'string'): Prompt {
  return {
    id: generateId(),
    content,
    type,
    metadata: {}
  };
}

/**
 * Create a new prompt pack with default settings
 */
export function createPromptPack(name: string, type: 'Sequential' | 'Random' | 'Date'): PromptPack {
  const now = new Date();
  return {
    id: generateId(),
    name,
    type,
    prompts: [],
    settings: {
      notificationEnabled: false,
      notificationTime: '09:00',
      notificationType: 'obsidian',
      zenModeEnabled: false,
      dailyNoteIntegration: true
    },
    progress: {
      completedPrompts: new Set(),
      lastAccessDate: now
    },
    createdAt: now,
    updatedAt: now
  };
}

/**
 * Validate prompt pack data structure
 */
export function validatePromptPack(pack: any): pack is PromptPack {
  return (
    typeof pack === 'object' &&
    typeof pack.id === 'string' &&
    typeof pack.name === 'string' &&
    ['Sequential', 'Random', 'Date'].includes(pack.type) &&
    Array.isArray(pack.prompts) &&
    typeof pack.settings === 'object' &&
    typeof pack.progress === 'object'
  );
}

/**
 * Format time string to HH:MM format
 */
export function formatTime(time: string): string {
  const [hours, minutes] = time.split(':');
  return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`;
}

/**
 * Check if a date is today
 */
export function isToday(date: Date): boolean {
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

/**
 * Deep clone an object (for settings and data manipulation)
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}