/**
 * Core prompt service that manages prompt selection and completion tracking
 * Implements the IPromptService interface with all prompt selection modes
 */

import { IPromptService, IProgressStore } from './interfaces';
import { Prompt } from './types';
import { PromptPack as PromptPackModel, PromptProgress } from './models';
import {
  IPromptSelector,
  SequentialPromptSelector,
  RandomPromptSelector,
  DatePromptSelector
} from './prompt-selector';

/**
 * Service class that provides prompt selection and management functionality
 */
export class PromptService implements IPromptService {
  private progressStore: IProgressStore;
  private promptPacks: Map<string, PromptPackModel> = new Map();
  private selectors: {
    Sequential: SequentialPromptSelector;
    Random: RandomPromptSelector;
    Date: DatePromptSelector;
  };

  constructor(progressStore: IProgressStore) {
    this.progressStore = progressStore;

    // Initialize prompt selectors
    this.selectors = {
      Sequential: new SequentialPromptSelector(),
      Random: new RandomPromptSelector(),
      Date: new DatePromptSelector()
    };
  }

  /**
   * Get the next prompt for a specific pack
   */
  async getNextPrompt(packId: string): Promise<Prompt | null> {
    try {
      const pack = this.getPromptPack(packId);
      if (!pack) {
        throw new Error(`Prompt pack with ID ${packId} not found`);
      }

      // Get the appropriate selector for this pack type
      const selector = this.getSelector(pack.type);

      // Select the next prompt
      const nextPrompt = selector.selectNextPrompt(pack);

      if (nextPrompt) {
        // Update last access date
        pack.progress.lastAccessDate = new Date();
        await this.progressStore.updateProgress(packId, pack.progress);
      }

      return nextPrompt;

    } catch (error) {
      console.error(`Failed to get next prompt for pack ${packId}:`, error);
      throw error;
    }
  }

  /**
   * Mark a prompt as completed and update progress
   */
  async markPromptCompleted(packId: string, promptId: string): Promise<void> {
    try {
      const pack = this.getPromptPack(packId);
      if (!pack) {
        throw new Error(`Prompt pack with ID ${packId} not found`);
      }

      // Verify the prompt exists in the pack
      const prompt = pack.getPrompt(promptId);
      if (!prompt) {
        throw new Error(`Prompt with ID ${promptId} not found in pack ${packId}`);
      }

      // Get the appropriate selector for this pack type
      const selector = this.getSelector(pack.type);

      // Mark as completed using the selector
      selector.markCompleted(pack, promptId);

      // Update progress in store
      await this.progressStore.updateProgress(packId, pack.progress);

    } catch (error) {
      console.error(`Failed to mark prompt ${promptId} as completed:`, error);
      throw error;
    }
  }

  /**
   * Reset progress for a specific pack
   */
  async resetProgress(packId: string): Promise<void> {
    try {
      const pack = this.getPromptPack(packId);
      if (!pack) {
        throw new Error(`Prompt pack with ID ${packId} not found`);
      }

      // Get the appropriate selector for this pack type
      const selector = this.getSelector(pack.type);

      // Reset using the selector
      selector.reset(pack);

      // Update progress in store
      await this.progressStore.updateProgress(packId, pack.progress);

    } catch (error) {
      console.error(`Failed to reset progress for pack ${packId}:`, error);
      throw error;
    }
  }

  /**
   * Get current progress for a specific pack
   */
  getProgress(packId: string): PromptProgress {
    try {
      const pack = this.getPromptPack(packId);
      if (!pack) {
        throw new Error(`Prompt pack with ID ${packId} not found`);
      }

      return pack.progress;

    } catch (error) {
      console.error(`Failed to get progress for pack ${packId}:`, error);
      throw error;
    }
  }

  /**
   * Load prompt packs into the service
   */
  loadPromptPacks(packs: PromptPackModel[]): void {
    this.promptPacks.clear();

    for (const pack of packs) {
      // Load progress from store and convert to model format
      const storedProgress = this.progressStore.getProgress(pack.id);
      pack.progress = this.convertToModelProgress(storedProgress);

      this.promptPacks.set(pack.id, pack);
    }
  }

  /**
   * Add a new prompt pack to the service
   */
  addPromptPack(pack: PromptPackModel): void {
    // Load progress from store and convert to model format
    const storedProgress = this.progressStore.getProgress(pack.id);
    pack.progress = this.convertToModelProgress(storedProgress);

    this.promptPacks.set(pack.id, pack);
  }

  /**
   * Remove a prompt pack from the service
   */
  removePromptPack(packId: string): boolean {
    return this.promptPacks.delete(packId);
  }

  /**
   * Update an existing prompt pack
   */
  updatePromptPack(pack: PromptPackModel): void {
    if (!this.promptPacks.has(pack.id)) {
      throw new Error(`Prompt pack with ID ${pack.id} not found`);
    }

    // Preserve existing progress
    const existingPack = this.promptPacks.get(pack.id)!;
    pack.progress = existingPack.progress;

    this.promptPacks.set(pack.id, pack);
  }

  /**
   * Get all loaded prompt packs
   */
  getAllPromptPacks(): PromptPackModel[] {
    return Array.from(this.promptPacks.values());
  }

  /**
   * Get a specific prompt pack by ID
   */
  getPromptPackById(packId: string): PromptPackModel | undefined {
    return this.promptPacks.get(packId);
  }

  /**
   * Check if a pack is completed
   */
  isPackCompleted(packId: string): boolean {
    try {
      const pack = this.getPromptPack(packId);
      if (!pack) {
        return false;
      }

      const selector = this.getSelector(pack.type);
      return selector.isCompleted(pack);

    } catch (error) {
      console.error(`Failed to check completion status for pack ${packId}:`, error);
      return false;
    }
  }

  /**
   * Get completion statistics for a pack
   */
  getPackStats(packId: string): {
    total: number;
    completed: number;
    percentage: number;
    isCompleted: boolean;
  } | null {
    try {
      const pack = this.getPromptPack(packId);
      if (!pack) {
        return null;
      }

      const stats = pack.getStats();
      return {
        total: stats.total,
        completed: stats.completed,
        percentage: stats.percentage,
        isCompleted: pack.isCompleted()
      };

    } catch (error) {
      console.error(`Failed to get stats for pack ${packId}:`, error);
      return null;
    }
  }

  /**
   * Get prompts for a specific date (Date mode only)
   */
  getPromptsForDate(packId: string, date: Date): Prompt[] {
    try {
      const pack = this.getPromptPack(packId);
      if (!pack) {
        throw new Error(`Prompt pack with ID ${packId} not found`);
      }

      if (pack.type !== 'Date') {
        throw new Error(`Pack ${packId} is not a Date-type pack`);
      }

      const selector = this.selectors.Date;
      return selector.getPromptsForDate(pack, date);

    } catch (error) {
      console.error(`Failed to get prompts for date in pack ${packId}:`, error);
      throw error;
    }
  }

  /**
   * Get missed prompts (Date mode only)
   */
  getMissedPrompts(packId: string, beforeDate?: Date): Prompt[] {
    try {
      const pack = this.getPromptPack(packId);
      if (!pack) {
        throw new Error(`Prompt pack with ID ${packId} not found`);
      }

      if (pack.type !== 'Date') {
        throw new Error(`Pack ${packId} is not a Date-type pack`);
      }

      const selector = this.selectors.Date;
      return selector.getMissedPrompts(pack, beforeDate);

    } catch (error) {
      console.error(`Failed to get missed prompts for pack ${packId}:`, error);
      throw error;
    }
  }

  /**
   * Get upcoming prompts (Date mode only)
   */
  getUpcomingPrompts(packId: string, afterDate?: Date): Prompt[] {
    try {
      const pack = this.getPromptPack(packId);
      if (!pack) {
        throw new Error(`Prompt pack with ID ${packId} not found`);
      }

      if (pack.type !== 'Date') {
        throw new Error(`Pack ${packId} is not a Date-type pack`);
      }

      const selector = this.selectors.Date;
      return selector.getUpcomingPrompts(pack, afterDate);

    } catch (error) {
      console.error(`Failed to get upcoming prompts for pack ${packId}:`, error);
      throw error;
    }
  }

  /**
   * Check if there are prompts available for today (Date mode only)
   */
  hasPromptsForToday(packId: string): boolean {
    try {
      const pack = this.getPromptPack(packId);
      if (!pack) {
        return false;
      }

      if (pack.type !== 'Date') {
        return false;
      }

      const selector = this.selectors.Date;
      return selector.hasPromptsForToday(pack);

    } catch (error) {
      console.error(`Failed to check today's prompts for pack ${packId}:`, error);
      return false;
    }
  }

  /**
   * Get catch-up prompts (Date mode only)
   */
  getCatchUpPrompts(packId: string, maxDaysBack: number = 7): Prompt[] {
    try {
      const pack = this.getPromptPack(packId);
      if (!pack) {
        throw new Error(`Prompt pack with ID ${packId} not found`);
      }

      if (pack.type !== 'Date') {
        throw new Error(`Pack ${packId} is not a Date-type pack`);
      }

      const selector = this.selectors.Date;
      return selector.getCatchUpPrompts(pack, maxDaysBack);

    } catch (error) {
      console.error(`Failed to get catch-up prompts for pack ${packId}:`, error);
      throw error;
    }
  }

  /**
   * Check if a pack needs catch-up (Date mode only)
   */
  needsCatchUp(packId: string, maxDaysBack: number = 7): boolean {
    try {
      const pack = this.getPromptPack(packId);
      if (!pack) {
        return false;
      }

      if (pack.type !== 'Date') {
        return false;
      }

      const selector = this.selectors.Date;
      return selector.needsCatchUp(pack, maxDaysBack);

    } catch (error) {
      console.error(`Failed to check catch-up status for pack ${packId}:`, error);
      return false;
    }
  }

  /**
   * Get available prompts count (Random mode only)
   */
  getAvailablePromptsCount(packId: string): number {
    try {
      const pack = this.getPromptPack(packId);
      if (!pack) {
        return 0;
      }

      if (pack.type !== 'Random') {
        throw new Error(`Pack ${packId} is not a Random-type pack`);
      }

      const selector = this.selectors.Random;
      return selector.getAvailablePromptsCount(pack);

    } catch (error) {
      console.error(`Failed to get available prompts count for pack ${packId}:`, error);
      return 0;
    }
  }

  /**
   * Check if current cycle is completed (Random mode only)
   */
  isCycleCompleted(packId: string): boolean {
    try {
      const pack = this.getPromptPack(packId);
      if (!pack) {
        return false;
      }

      if (pack.type !== 'Random') {
        return false;
      }

      const selector = this.selectors.Random;
      return selector.isCycleCompleted(pack);

    } catch (error) {
      console.error(`Failed to check cycle completion for pack ${packId}:`, error);
      return false;
    }
  }

  /**
   * Reset current cycle (Random mode only)
   */
  async resetCycle(packId: string): Promise<void> {
    try {
      const pack = this.getPromptPack(packId);
      if (!pack) {
        throw new Error(`Prompt pack with ID ${packId} not found`);
      }

      if (pack.type !== 'Random') {
        throw new Error(`Pack ${packId} is not a Random-type pack`);
      }

      const selector = this.selectors.Random;
      selector.resetCycle(pack);

      // Update progress in store
      await this.progressStore.updateProgress(packId, pack.progress);

    } catch (error) {
      console.error(`Failed to reset cycle for pack ${packId}:`, error);
      throw error;
    }
  }

  /**
   * Get next prompt index (Sequential mode only)
   */
  getNextPromptIndex(packId: string): number | null {
    try {
      const pack = this.getPromptPack(packId);
      if (!pack) {
        return null;
      }

      if (pack.type !== 'Sequential') {
        throw new Error(`Pack ${packId} is not a Sequential-type pack`);
      }

      const selector = this.selectors.Sequential;
      return selector.getNextPromptIndex(pack);

    } catch (error) {
      console.error(`Failed to get next prompt index for pack ${packId}:`, error);
      return null;
    }
  }

  /**
   * Check if pack can be restarted (Sequential mode only)
   */
  canRestart(packId: string): boolean {
    try {
      const pack = this.getPromptPack(packId);
      if (!pack) {
        return false;
      }

      if (pack.type !== 'Sequential') {
        return false;
      }

      const selector = this.selectors.Sequential;
      return selector.canRestart(pack);

    } catch (error) {
      console.error(`Failed to check restart capability for pack ${packId}:`, error);
      return false;
    }
  }

  /**
   * Restart pack from beginning (Sequential mode only)
   */
  async restart(packId: string): Promise<void> {
    try {
      const pack = this.getPromptPack(packId);
      if (!pack) {
        throw new Error(`Prompt pack with ID ${packId} not found`);
      }

      if (pack.type !== 'Sequential') {
        throw new Error(`Pack ${packId} is not a Sequential-type pack`);
      }

      const selector = this.selectors.Sequential;
      selector.restart(pack);

      // Update progress in store
      await this.progressStore.updateProgress(packId, pack.progress);

    } catch (error) {
      console.error(`Failed to restart pack ${packId}:`, error);
      throw error;
    }
  }

  /**
   * Get overall service statistics
   */
  getOverallStats(): {
    totalPacks: number;
    activePacks: number;
    completedPacks: number;
    totalPrompts: number;
    completedPrompts: number;
    overallProgress: number;
  } {
    try {
      let totalPacks = 0;
      let activePacks = 0;
      let completedPacks = 0;
      let totalPrompts = 0;
      let completedPrompts = 0;

      for (const pack of this.promptPacks.values()) {
        totalPacks++;
        totalPrompts += pack.prompts.length;
        completedPrompts += pack.progress.completedPrompts.size;

        if (this.isPackCompleted(pack.id)) {
          completedPacks++;
        } else {
          activePacks++;
        }
      }

      const overallProgress = totalPrompts > 0 ? Math.round((completedPrompts / totalPrompts) * 100) : 0;

      return {
        totalPacks,
        activePacks,
        completedPacks,
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
        totalPrompts: 0,
        completedPrompts: 0,
        overallProgress: 0
      };
    }
  }

  // Private helper methods

  /**
   * Convert interface PromptProgress to model PromptProgress
   */
  private convertToModelProgress(interfaceProgress: import('./types').PromptProgress): PromptProgress {
    return new PromptProgress({
      completedPrompts: interfaceProgress.completedPrompts,
      currentIndex: interfaceProgress.currentIndex,
      usedPrompts: interfaceProgress.usedPrompts,
      lastAccessDate: interfaceProgress.lastAccessDate
    });
  }

  /**
   * Get a prompt pack by ID with error handling
   */
  private getPromptPack(packId: string): PromptPackModel | null {
    const pack = this.promptPacks.get(packId);
    if (!pack) {
      console.warn(`Prompt pack with ID ${packId} not found`);
      return null;
    }
    return pack;
  }

  /**
   * Get the appropriate selector for a pack type
   */
  private getSelector(packType: 'Sequential' | 'Random' | 'Date'): IPromptSelector {
    return this.selectors[packType];
  }

  /**
   * Validate pack type for type-specific operations
   */
  private validatePackType(pack: PromptPackModel, expectedType: 'Sequential' | 'Random' | 'Date'): void {
    if (pack.type !== expectedType) {
      throw new Error(`Pack ${pack.id} is not a ${expectedType}-type pack`);
    }
  }

  /**
   * Sync progress with store (useful for external updates)
   */
  async syncProgress(packId: string): Promise<void> {
    try {
      const pack = this.getPromptPack(packId);
      if (!pack) {
        throw new Error(`Prompt pack with ID ${packId} not found`);
      }

      // Load latest progress from store and convert to model format
      const storedProgress = this.progressStore.getProgress(packId);
      pack.progress = this.convertToModelProgress(storedProgress);

    } catch (error) {
      console.error(`Failed to sync progress for pack ${packId}:`, error);
      throw error;
    }
  }

  /**
   * Validate service state
   */
  validateState(): boolean {
    try {
      // Check if all packs have valid progress
      for (const pack of this.promptPacks.values()) {
        if (!pack.progress) {
          console.error(`Pack ${pack.id} has no progress data`);
          return false;
        }

        try {
          pack.progress.validate();
        } catch (error) {
          console.error(`Pack ${pack.id} has invalid progress data:`, error);
          return false;
        }
      }

      return true;

    } catch (error) {
      console.error('Failed to validate service state:', error);
      return false;
    }
  }
}