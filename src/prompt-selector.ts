/**
 * Prompt selection algorithms for different delivery modes
 */

import { Prompt, PromptPack, PromptProgress } from './types';

/**
 * Base interface for prompt selection strategies
 */
export interface IPromptSelector {
  selectNextPrompt(pack: PromptPack): Prompt | null;
  markCompleted(pack: PromptPack, promptId: string): void;
  isCompleted(pack: PromptPack): boolean;
  reset(pack: PromptPack): void;
}

/**
 * Sequential prompt selector - delivers prompts in defined order
 */
export class SequentialPromptSelector implements IPromptSelector {
  /**
   * Select the next prompt in sequential order
   */
  selectNextPrompt(pack: PromptPack): Prompt | null {
    if (pack.type !== 'Sequential') {
      throw new Error('SequentialPromptSelector can only be used with Sequential prompt packs');
    }

    if (pack.prompts.length === 0) {
      return null;
    }

    // Sort prompts by order (if defined) or by array index
    const sortedPrompts = [...pack.prompts].sort((a, b) => {
      const orderA = a.order ?? pack.prompts.indexOf(a);
      const orderB = b.order ?? pack.prompts.indexOf(b);
      return orderA - orderB;
    });

    // Initialize current index if not set
    if (pack.progress.currentIndex === undefined) {
      pack.progress.currentIndex = 0;
    }

    // Find next uncompleted prompt starting from current index
    for (let i = pack.progress.currentIndex; i < sortedPrompts.length; i++) {
      const prompt = sortedPrompts[i];
      if (!pack.progress.completedPrompts.has(prompt.id)) {
        pack.progress.currentIndex = i;
        return prompt;
      }
    }

    // All prompts completed
    return null;
  }

  /**
   * Mark a prompt as completed and advance index
   */
  markCompleted(pack: PromptPack, promptId: string): void {
    if (pack.type !== 'Sequential') {
      throw new Error('SequentialPromptSelector can only be used with Sequential prompt packs');
    }

    pack.progress.completedPrompts.add(promptId);
    pack.progress.lastAccessDate = new Date();

    // Advance current index if this was the current prompt
    const sortedPrompts = [...pack.prompts].sort((a, b) => {
      const orderA = a.order ?? pack.prompts.indexOf(a);
      const orderB = b.order ?? pack.prompts.indexOf(b);
      return orderA - orderB;
    });

    const currentIndex = pack.progress.currentIndex ?? 0;
    if (currentIndex < sortedPrompts.length && sortedPrompts[currentIndex].id === promptId) {
      pack.progress.currentIndex = currentIndex + 1;
    }
  }

  /**
   * Check if all prompts in the pack are completed
   */
  isCompleted(pack: PromptPack): boolean {
    if (pack.type !== 'Sequential') {
      throw new Error('SequentialPromptSelector can only be used with Sequential prompt packs');
    }

    return pack.prompts.length > 0 && pack.progress.completedPrompts.size === pack.prompts.length;
  }

  /**
   * Reset progress and restart from beginning
   */
  reset(pack: PromptPack): void {
    if (pack.type !== 'Sequential') {
      throw new Error('SequentialPromptSelector can only be used with Sequential prompt packs');
    }

    pack.progress.completedPrompts.clear();
    pack.progress.usedPrompts?.clear();
    pack.progress.lastAccessDate = new Date();
    pack.progress.currentIndex = 0;
  }

  /**
   * Get the current progress as a percentage
   */
  getProgressPercentage(pack: PromptPack): number {
    if (pack.type !== 'Sequential') {
      throw new Error('SequentialPromptSelector can only be used with Sequential prompt packs');
    }

    if (pack.prompts.length === 0) return 0;
    return Math.round((pack.progress.completedPrompts.size / pack.prompts.length) * 100);
  }

  /**
   * Get the next prompt index without advancing
   */
  getNextPromptIndex(pack: PromptPack): number | null {
    if (pack.type !== 'Sequential') {
      throw new Error('SequentialPromptSelector can only be used with Sequential prompt packs');
    }

    if (pack.prompts.length === 0) {
      return null;
    }

    const sortedPrompts = [...pack.prompts].sort((a, b) => {
      const orderA = a.order ?? pack.prompts.indexOf(a);
      const orderB = b.order ?? pack.prompts.indexOf(b);
      return orderA - orderB;
    });

    const currentIndex = pack.progress.currentIndex ?? 0;

    // Find next uncompleted prompt
    for (let i = currentIndex; i < sortedPrompts.length; i++) {
      const prompt = sortedPrompts[i];
      if (!pack.progress.completedPrompts.has(prompt.id)) {
        return i;
      }
    }

    return null;
  }

  /**
   * Check if pack can be restarted (all prompts completed)
   */
  canRestart(pack: PromptPack): boolean {
    return this.isCompleted(pack);
  }

  /**
   * Restart the pack from the beginning
   */
  restart(pack: PromptPack): void {
    if (!this.canRestart(pack)) {
      throw new Error('Cannot restart pack - not all prompts are completed');
    }

    this.reset(pack);
  }
}
/**

* Random prompt selector - delivers prompts randomly without repetition
 */
export class RandomPromptSelector implements IPromptSelector {
  /**
   * Select a random prompt that hasn't been used in the current cycle
   */
  selectNextPrompt(pack: PromptPack): Prompt | null {
    if (pack.type !== 'Random') {
      throw new Error('RandomPromptSelector can only be used with Random prompt packs');
    }

    if (pack.prompts.length === 0) {
      return null;
    }

    // Initialize used prompts set if not set
    if (!pack.progress.usedPrompts) {
      pack.progress.usedPrompts = new Set();
    }

    // Get available prompts (not used in current cycle)
    const availablePrompts = pack.prompts.filter(prompt =>
      !pack.progress.usedPrompts!.has(prompt.id)
    );

    // If no available prompts, reset cycle and use all prompts
    if (availablePrompts.length === 0) {
      pack.progress.usedPrompts.clear();
      return this.selectRandomPrompt(pack.prompts);
    }

    return this.selectRandomPrompt(availablePrompts);
  }

  /**
   * Select a random prompt from the given array
   */
  private selectRandomPrompt(prompts: Prompt[]): Prompt {
    const randomIndex = Math.floor(Math.random() * prompts.length);
    return prompts[randomIndex];
  }

  /**
   * Mark a prompt as completed and add to used prompts
   */
  markCompleted(pack: PromptPack, promptId: string): void {
    if (pack.type !== 'Random') {
      throw new Error('RandomPromptSelector can only be used with Random prompt packs');
    }

    pack.progress.completedPrompts.add(promptId);
    pack.progress.lastAccessDate = new Date();

    // Initialize used prompts set if not set
    if (!pack.progress.usedPrompts) {
      pack.progress.usedPrompts = new Set();
    }

    // Add to used prompts for current cycle
    pack.progress.usedPrompts.add(promptId);
  }

  /**
   * Check if all prompts in the pack are completed
   */
  isCompleted(pack: PromptPack): boolean {
    if (pack.type !== 'Random') {
      throw new Error('RandomPromptSelector can only be used with Random prompt packs');
    }

    return pack.prompts.length > 0 && pack.progress.completedPrompts.size === pack.prompts.length;
  }

  /**
   * Reset progress and clear used prompts
   */
  reset(pack: PromptPack): void {
    if (pack.type !== 'Random') {
      throw new Error('RandomPromptSelector can only be used with Random prompt packs');
    }

    pack.progress.completedPrompts.clear();
    pack.progress.usedPrompts?.clear();
    pack.progress.lastAccessDate = new Date();
  }

  /**
   * Get the current progress as a percentage
   */
  getProgressPercentage(pack: PromptPack): number {
    if (pack.type !== 'Random') {
      throw new Error('RandomPromptSelector can only be used with Random prompt packs');
    }

    if (pack.prompts.length === 0) return 0;
    return Math.round((pack.progress.completedPrompts.size / pack.prompts.length) * 100);
  }

  /**
   * Get the number of available prompts in current cycle
   */
  getAvailablePromptsCount(pack: PromptPack): number {
    if (pack.type !== 'Random') {
      throw new Error('RandomPromptSelector can only be used with Random prompt packs');
    }

    if (!pack.progress.usedPrompts) {
      return pack.prompts.length;
    }

    return pack.prompts.filter(prompt =>
      !pack.progress.usedPrompts!.has(prompt.id)
    ).length;
  }

  /**
   * Get the number of used prompts in current cycle
   */
  getUsedPromptsCount(pack: PromptPack): number {
    if (pack.type !== 'Random') {
      throw new Error('RandomPromptSelector can only be used with Random prompt packs');
    }

    return pack.progress.usedPrompts?.size ?? 0;
  }

  /**
   * Check if current cycle is completed (all prompts used)
   */
  isCycleCompleted(pack: PromptPack): boolean {
    if (pack.type !== 'Random') {
      throw new Error('RandomPromptSelector can only be used with Random prompt packs');
    }

    if (pack.prompts.length === 0) return false;

    const usedCount = pack.progress.usedPrompts?.size ?? 0;
    return usedCount === pack.prompts.length;
  }

  /**
   * Reset the current cycle (clear used prompts)
   */
  resetCycle(pack: PromptPack): void {
    if (pack.type !== 'Random') {
      throw new Error('RandomPromptSelector can only be used with Random prompt packs');
    }

    if (!pack.progress.usedPrompts) {
      pack.progress.usedPrompts = new Set();
    } else {
      pack.progress.usedPrompts.clear();
    }

    pack.progress.lastAccessDate = new Date();
  }

  /**
   * Get statistics about the current random selection state
   */
  getStats(pack: PromptPack): {
    totalPrompts: number;
    completedPrompts: number;
    usedInCycle: number;
    availableInCycle: number;
    cycleProgress: number;
    overallProgress: number;
  } {
    if (pack.type !== 'Random') {
      throw new Error('RandomPromptSelector can only be used with Random prompt packs');
    }

    const totalPrompts = pack.prompts.length;
    const completedPrompts = pack.progress.completedPrompts.size;
    const usedInCycle = this.getUsedPromptsCount(pack);
    const availableInCycle = this.getAvailablePromptsCount(pack);
    const cycleProgress = totalPrompts > 0 ? Math.round((usedInCycle / totalPrompts) * 100) : 0;
    const overallProgress = this.getProgressPercentage(pack);

    return {
      totalPrompts,
      completedPrompts,
      usedInCycle,
      availableInCycle,
      cycleProgress,
      overallProgress
    };
  }
}

/**
 * Date-based prompt selector - delivers prompts based on specific dates
 */
export class DatePromptSelector implements IPromptSelector {
  /**
   * Select prompt(s) for the current date or specified date
   */
  selectNextPrompt(pack: PromptPack, targetDate?: Date): Prompt | null {
    if (pack.type !== 'Date') {
      throw new Error('DatePromptSelector can only be used with Date prompt packs');
    }

    if (pack.prompts.length === 0) {
      return null;
    }

    const date = targetDate || new Date();
    const dateString = this.formatDateForComparison(date);

    // Find prompts for the target date
    const datePrompts = pack.prompts.filter(prompt => {
      if (!prompt.date) return false;
      return this.formatDateForComparison(prompt.date) === dateString;
    });

    if (datePrompts.length === 0) {
      return null;
    }

    // Return first uncompleted prompt for the date
    const uncompletedPrompt = datePrompts.find(prompt =>
      !pack.progress.completedPrompts.has(prompt.id)
    );

    return uncompletedPrompt || null;
  }

  /**
   * Get all prompts for a specific date
   */
  getPromptsForDate(pack: PromptPack, targetDate: Date): Prompt[] {
    if (pack.type !== 'Date') {
      throw new Error('DatePromptSelector can only be used with Date prompt packs');
    }

    const dateString = this.formatDateForComparison(targetDate);

    return pack.prompts.filter(prompt => {
      if (!prompt.date) return false;
      return this.formatDateForComparison(prompt.date) === dateString;
    });
  }

  /**
   * Get missed prompts (past dates that haven't been completed)
   */
  getMissedPrompts(pack: PromptPack, beforeDate?: Date): Prompt[] {
    if (pack.type !== 'Date') {
      throw new Error('DatePromptSelector can only be used with Date prompt packs');
    }

    const cutoffDate = beforeDate || new Date();
    cutoffDate.setHours(0, 0, 0, 0); // Start of day

    return pack.prompts.filter(prompt => {
      if (!prompt.date) return false;

      const promptDate = new Date(prompt.date);
      promptDate.setHours(0, 0, 0, 0);

      return promptDate < cutoffDate && !pack.progress.completedPrompts.has(prompt.id);
    });
  }

  /**
   * Get upcoming prompts (future dates)
   */
  getUpcomingPrompts(pack: PromptPack, afterDate?: Date): Prompt[] {
    if (pack.type !== 'Date') {
      throw new Error('DatePromptSelector can only be used with Date prompt packs');
    }

    const startDate = afterDate || new Date();
    startDate.setHours(23, 59, 59, 999); // End of day

    return pack.prompts.filter(prompt => {
      if (!prompt.date) return false;

      const promptDate = new Date(prompt.date);
      return promptDate > startDate;
    }).sort((a, b) => a.date!.getTime() - b.date!.getTime());
  }

  /**
   * Format date for comparison (YYYY-MM-DD)
   */
  private formatDateForComparison(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * Mark a prompt as completed
   */
  markCompleted(pack: PromptPack, promptId: string): void {
    if (pack.type !== 'Date') {
      throw new Error('DatePromptSelector can only be used with Date prompt packs');
    }

    pack.progress.completedPrompts.add(promptId);
    pack.progress.lastAccessDate = new Date();
  }

  /**
   * Check if all prompts in the pack are completed
   */
  isCompleted(pack: PromptPack): boolean {
    if (pack.type !== 'Date') {
      throw new Error('DatePromptSelector can only be used with Date prompt packs');
    }

    return pack.prompts.length > 0 && pack.progress.completedPrompts.size === pack.prompts.length;
  }

  /**
   * Reset progress
   */
  reset(pack: PromptPack): void {
    if (pack.type !== 'Date') {
      throw new Error('DatePromptSelector can only be used with Date prompt packs');
    }

    pack.progress.completedPrompts.clear();
    pack.progress.usedPrompts?.clear();
    pack.progress.lastAccessDate = new Date();
  }

  /**
   * Get the current progress as a percentage
   */
  getProgressPercentage(pack: PromptPack): number {
    if (pack.type !== 'Date') {
      throw new Error('DatePromptSelector can only be used with Date prompt packs');
    }

    if (pack.prompts.length === 0) return 0;
    return Math.round((pack.progress.completedPrompts.size / pack.prompts.length) * 100);
  }

  /**
   * Check if there are prompts available for today
   */
  hasPromptsForToday(pack: PromptPack): boolean {
    const todayPrompts = this.getPromptsForDate(pack, new Date());
    return todayPrompts.some(prompt => !pack.progress.completedPrompts.has(prompt.id));
  }

  /**
   * Get the next available date with prompts
   */
  getNextAvailableDate(pack: PromptPack, afterDate?: Date): Date | null {
    if (pack.type !== 'Date') {
      throw new Error('DatePromptSelector can only be used with Date prompt packs');
    }

    const startDate = afterDate || new Date();
    const upcomingPrompts = this.getUpcomingPrompts(pack, startDate);

    if (upcomingPrompts.length === 0) return null;

    return upcomingPrompts[0].date!;
  }

  /**
   * Get the most recent date with prompts
   */
  getMostRecentDate(pack: PromptPack, beforeDate?: Date): Date | null {
    if (pack.type !== 'Date') {
      throw new Error('DatePromptSelector can only be used with Date prompt packs');
    }

    const cutoffDate = beforeDate || new Date();

    const pastPrompts = pack.prompts.filter(prompt => {
      if (!prompt.date) return false;
      return prompt.date <= cutoffDate;
    }).sort((a, b) => b.date!.getTime() - a.date!.getTime());

    if (pastPrompts.length === 0) return null;

    return pastPrompts[0].date!;
  }

  /**
   * Get catch-up prompts (missed prompts that can be completed)
   */
  getCatchUpPrompts(pack: PromptPack, maxDaysBack: number = 7): Prompt[] {
    if (pack.type !== 'Date') {
      throw new Error('DatePromptSelector can only be used with Date prompt packs');
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - maxDaysBack);
    cutoffDate.setHours(0, 0, 0, 0);

    return this.getMissedPrompts(pack).filter(prompt => {
      if (!prompt.date) return false;
      const promptDate = new Date(prompt.date);
      promptDate.setHours(0, 0, 0, 0);
      return promptDate >= cutoffDate;
    }).sort((a, b) => a.date!.getTime() - b.date!.getTime());
  }

  /**
   * Check if a specific date has any prompts
   */
  hasPromptsForDate(pack: PromptPack, date: Date): boolean {
    return this.getPromptsForDate(pack, date).length > 0;
  }

  /**
   * Get completion status for a specific date
   */
  getDateCompletionStatus(pack: PromptPack, date: Date): {
    total: number;
    completed: number;
    percentage: number;
    isCompleted: boolean;
  } {
    if (pack.type !== 'Date') {
      throw new Error('DatePromptSelector can only be used with Date prompt packs');
    }

    const datePrompts = this.getPromptsForDate(pack, date);
    const total = datePrompts.length;
    const completed = datePrompts.filter(prompt =>
      pack.progress.completedPrompts.has(prompt.id)
    ).length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    const isCompleted = total > 0 && completed === total;

    return { total, completed, percentage, isCompleted };
  }

  /**
   * Get statistics about date-based prompts
   */
  getStats(pack: PromptPack): {
    totalPrompts: number;
    completedPrompts: number;
    missedPrompts: number;
    upcomingPrompts: number;
    todayPrompts: number;
    todayCompleted: number;
    overallProgress: number;
    dateRange: { earliest: Date | null; latest: Date | null };
  } {
    if (pack.type !== 'Date') {
      throw new Error('DatePromptSelector can only be used with Date prompt packs');
    }

    const totalPrompts = pack.prompts.length;
    const completedPrompts = pack.progress.completedPrompts.size;
    const missedPrompts = this.getMissedPrompts(pack).length;
    const upcomingPrompts = this.getUpcomingPrompts(pack).length;

    const todayPromptsArray = this.getPromptsForDate(pack, new Date());
    const todayPrompts = todayPromptsArray.length;
    const todayCompleted = todayPromptsArray.filter(prompt =>
      pack.progress.completedPrompts.has(prompt.id)
    ).length;

    const overallProgress = this.getProgressPercentage(pack);

    // Calculate date range
    const datesWithPrompts = pack.prompts
      .filter(prompt => prompt.date)
      .map(prompt => prompt.date!)
      .sort((a, b) => a.getTime() - b.getTime());

    const earliest = datesWithPrompts.length > 0 ? datesWithPrompts[0] : null;
    const latest = datesWithPrompts.length > 0 ? datesWithPrompts[datesWithPrompts.length - 1] : null;

    return {
      totalPrompts,
      completedPrompts,
      missedPrompts,
      upcomingPrompts,
      todayPrompts,
      todayCompleted,
      overallProgress,
      dateRange: { earliest, latest }
    };
  }

  /**
   * Get prompts for a date range
   */
  getPromptsForDateRange(pack: PromptPack, startDate: Date, endDate: Date): Prompt[] {
    if (pack.type !== 'Date') {
      throw new Error('DatePromptSelector can only be used with Date prompt packs');
    }

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    return pack.prompts.filter(prompt => {
      if (!prompt.date) return false;
      const promptDate = new Date(prompt.date);
      return promptDate >= start && promptDate <= end;
    }).sort((a, b) => a.date!.getTime() - b.date!.getTime());
  }

  /**
   * Check if catch-up is needed (has missed prompts within catch-up window)
   */
  needsCatchUp(pack: PromptPack, maxDaysBack: number = 7): boolean {
    return this.getCatchUpPrompts(pack, maxDaysBack).length > 0;
  }
}