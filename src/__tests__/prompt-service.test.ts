/**
 * Unit tests for PromptService
 */

import { PromptService } from '../prompt-service';
import { IProgressStore } from '../interfaces';
import { PromptPack, Prompt, PromptProgress } from '../models';

// Mock progress store implementation
class MockProgressStore implements IProgressStore {
  private progressData: Map<string, PromptProgress> = new Map();

  getProgress(packId: string): PromptProgress {
    return this.progressData.get(packId) || new PromptProgress();
  }

  async updateProgress(packId: string, progress: PromptProgress): Promise<void> {
    this.progressData.set(packId, progress);
  }

  async resetProgress(packId: string): Promise<void> {
    this.progressData.set(packId, new PromptProgress());
  }

  async archiveProgress(packId: string): Promise<void> {
    this.progressData.delete(packId);
  }

  // Helper method for testing
  setProgress(packId: string, progress: PromptProgress): void {
    this.progressData.set(packId, progress);
  }

  // Helper method for testing
  clear(): void {
    this.progressData.clear();
  }
}

describe('PromptService', () => {
  let service: PromptService;
  let mockProgressStore: MockProgressStore;
  let sequentialPack: PromptPack;
  let randomPack: PromptPack;
  let datePack: PromptPack;

  beforeEach(() => {
    mockProgressStore = new MockProgressStore();
    service = new PromptService(mockProgressStore);

    // Create test packs
    sequentialPack = PromptPack.create('Sequential Test Pack', 'Sequential');
    const sequentialPrompts = [
      Prompt.create('First prompt', 'string', { order: 1 }),
      Prompt.create('Second prompt', 'string', { order: 2 }),
      Prompt.create('Third prompt', 'string', { order: 3 })
    ];
    sequentialPrompts.forEach(prompt => sequentialPack.addPrompt(prompt));

    randomPack = PromptPack.create('Random Test Pack', 'Random');
    const randomPrompts = [
      Prompt.create('Random prompt 1', 'string'),
      Prompt.create('Random prompt 2', 'string'),
      Prompt.create('Random prompt 3', 'string')
    ];
    randomPrompts.forEach(prompt => randomPack.addPrompt(prompt));

    datePack = PromptPack.create('Date Test Pack', 'Date');
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const datePrompts = [
      Prompt.create('Yesterday prompt', 'string', { date: yesterday }),
      Prompt.create('Today prompt', 'string', { date: today }),
      Prompt.create('Tomorrow prompt', 'string', { date: tomorrow })
    ];
    datePrompts.forEach(prompt => datePack.addPrompt(prompt));

    // Load packs into service
    service.loadPromptPacks([sequentialPack, randomPack, datePack]);
  });

  afterEach(() => {
    mockProgressStore.clear();
  });

  describe('constructor', () => {
    it('should initialize with progress store', () => {
      const newService = new PromptService(mockProgressStore);
      expect(newService).toBeInstanceOf(PromptService);
    });

    it('should initialize selectors for all pack types', () => {
      // Test that selectors work by trying to get prompts
      expect(() => service.getNextPrompt(sequentialPack.id)).not.toThrow();
      expect(() => service.getNextPrompt(randomPack.id)).not.toThrow();
      expect(() => service.getNextPrompt(datePack.id)).not.toThrow();
    });
  });

  describe('getNextPrompt', () => {
    it('should return next prompt for Sequential pack', async () => {
      const nextPrompt = await service.getNextPrompt(sequentialPack.id);

      expect(nextPrompt).not.toBeNull();
      expect(nextPrompt?.content).toBe('First prompt');
      expect(nextPrompt?.order).toBe(1);
    });

    it('should return next prompt for Random pack', async () => {
      const nextPrompt = await service.getNextPrompt(randomPack.id);

      expect(nextPrompt).not.toBeNull();
      expect(randomPack.prompts.some(p => p.id === nextPrompt!.id)).toBe(true);
    });

    it('should return next prompt for Date pack', async () => {
      const nextPrompt = await service.getNextPrompt(datePack.id);

      expect(nextPrompt).not.toBeNull();
      expect(nextPrompt?.content).toBe('Today prompt');
    });

    it('should update last access date when getting prompt', async () => {
      const beforeTime = new Date();
      await service.getNextPrompt(sequentialPack.id);

      const progress = service.getProgress(sequentialPack.id);
      expect(progress.lastAccessDate.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
    });

    it('should throw error for non-existent pack', async () => {
      await expect(service.getNextPrompt('non-existent-id')).rejects.toThrow(
        'Prompt pack with ID non-existent-id not found'
      );
    });

    it('should return null when no prompts available', async () => {
      const emptyPack = PromptPack.create('Empty Pack', 'Sequential');
      service.addPromptPack(emptyPack);

      const nextPrompt = await service.getNextPrompt(emptyPack.id);
      expect(nextPrompt).toBeNull();
    });
  });

  describe('markPromptCompleted', () => {
    it('should mark prompt as completed in Sequential pack', async () => {
      const nextPrompt = await service.getNextPrompt(sequentialPack.id);
      expect(nextPrompt).not.toBeNull();

      await service.markPromptCompleted(sequentialPack.id, nextPrompt!.id);

      const progress = service.getProgress(sequentialPack.id);
      expect(progress.completedPrompts.has(nextPrompt!.id)).toBe(true);
    });

    it('should mark prompt as completed in Random pack', async () => {
      const nextPrompt = await service.getNextPrompt(randomPack.id);
      expect(nextPrompt).not.toBeNull();

      await service.markPromptCompleted(randomPack.id, nextPrompt!.id);

      const progress = service.getProgress(randomPack.id);
      expect(progress.completedPrompts.has(nextPrompt!.id)).toBe(true);
    });

    it('should mark prompt as completed in Date pack', async () => {
      const nextPrompt = await service.getNextPrompt(datePack.id);
      expect(nextPrompt).not.toBeNull();

      await service.markPromptCompleted(datePack.id, nextPrompt!.id);

      const progress = service.getProgress(datePack.id);
      expect(progress.completedPrompts.has(nextPrompt!.id)).toBe(true);
    });

    it('should update progress store when marking completed', async () => {
      const nextPrompt = await service.getNextPrompt(sequentialPack.id);
      expect(nextPrompt).not.toBeNull();

      await service.markPromptCompleted(sequentialPack.id, nextPrompt!.id);

      // Verify progress was updated in store
      const storedProgress = mockProgressStore.getProgress(sequentialPack.id);
      expect(storedProgress.completedPrompts.has(nextPrompt!.id)).toBe(true);
    });

    it('should throw error for non-existent pack', async () => {
      await expect(service.markPromptCompleted('non-existent-id', 'prompt-id')).rejects.toThrow(
        'Prompt pack with ID non-existent-id not found'
      );
    });

    it('should throw error for non-existent prompt', async () => {
      await expect(service.markPromptCompleted(sequentialPack.id, 'non-existent-prompt')).rejects.toThrow(
        'Prompt with ID non-existent-prompt not found in pack'
      );
    });
  });

  describe('resetProgress', () => {
    it('should reset progress for Sequential pack', async () => {
      // Complete a prompt first
      const nextPrompt = await service.getNextPrompt(sequentialPack.id);
      await service.markPromptCompleted(sequentialPack.id, nextPrompt!.id);

      expect(service.getProgress(sequentialPack.id).completedPrompts.size).toBe(1);

      await service.resetProgress(sequentialPack.id);

      const progress = service.getProgress(sequentialPack.id);
      expect(progress.completedPrompts.size).toBe(0);
      expect(progress.currentIndex).toBe(0);
    });

    it('should reset progress for Random pack', async () => {
      // Complete a prompt first
      const nextPrompt = await service.getNextPrompt(randomPack.id);
      await service.markPromptCompleted(randomPack.id, nextPrompt!.id);

      expect(service.getProgress(randomPack.id).completedPrompts.size).toBe(1);

      await service.resetProgress(randomPack.id);

      const progress = service.getProgress(randomPack.id);
      expect(progress.completedPrompts.size).toBe(0);
      expect(progress.usedPrompts?.size).toBe(0);
    });

    it('should reset progress for Date pack', async () => {
      // Complete a prompt first
      const nextPrompt = await service.getNextPrompt(datePack.id);
      await service.markPromptCompleted(datePack.id, nextPrompt!.id);

      expect(service.getProgress(datePack.id).completedPrompts.size).toBe(1);

      await service.resetProgress(datePack.id);

      const progress = service.getProgress(datePack.id);
      expect(progress.completedPrompts.size).toBe(0);
    });

    it('should update progress store when resetting', async () => {
      await service.resetProgress(sequentialPack.id);

      const storedProgress = mockProgressStore.getProgress(sequentialPack.id);
      expect(storedProgress.completedPrompts.size).toBe(0);
    });

    it('should throw error for non-existent pack', async () => {
      await expect(service.resetProgress('non-existent-id')).rejects.toThrow(
        'Prompt pack with ID non-existent-id not found'
      );
    });
  });

  describe('getProgress', () => {
    it('should return progress for existing pack', () => {
      const progress = service.getProgress(sequentialPack.id);

      expect(progress).toBeInstanceOf(PromptProgress);
      expect(progress.completedPrompts).toBeInstanceOf(Set);
    });

    it('should throw error for non-existent pack', () => {
      expect(() => service.getProgress('non-existent-id')).toThrow(
        'Prompt pack with ID non-existent-id not found'
      );
    });
  });

  describe('pack management', () => {
    describe('loadPromptPacks', () => {
      it('should load packs and their progress', () => {
        const newPack = PromptPack.create('New Pack', 'Sequential');
        const newPrompt = Prompt.create('New prompt', 'string');
        newPack.addPrompt(newPrompt);

        // Set some progress in store
        const progress = new PromptProgress();
        progress.completedPrompts.add(newPrompt.id);
        mockProgressStore.setProgress(newPack.id, progress);

        service.loadPromptPacks([newPack]);

        const loadedPack = service.getPromptPackById(newPack.id);
        expect(loadedPack).toBeDefined();
        expect(loadedPack!.progress.completedPrompts.has(newPrompt.id)).toBe(true);
      });

      it('should clear existing packs when loading new ones', () => {
        const originalPackCount = service.getAllPromptPacks().length;
        expect(originalPackCount).toBeGreaterThan(0);

        service.loadPromptPacks([]);

        expect(service.getAllPromptPacks()).toHaveLength(0);
      });
    });

    describe('addPromptPack', () => {
      it('should add new pack with progress from store', () => {
        const newPack = PromptPack.create('New Pack', 'Sequential');
        const newPrompt = Prompt.create('New prompt', 'string');
        newPack.addPrompt(newPrompt);

        // Set progress in store
        const progress = new PromptProgress();
        progress.completedPrompts.add(newPrompt.id);
        mockProgressStore.setProgress(newPack.id, progress);

        service.addPromptPack(newPack);

        const addedPack = service.getPromptPackById(newPack.id);
        expect(addedPack).toBeDefined();
        expect(addedPack!.progress.completedPrompts.has(newPrompt.id)).toBe(true);
      });
    });

    describe('removePromptPack', () => {
      it('should remove existing pack', () => {
        expect(service.getPromptPackById(sequentialPack.id)).toBeDefined();

        const removed = service.removePromptPack(sequentialPack.id);

        expect(removed).toBe(true);
        expect(service.getPromptPackById(sequentialPack.id)).toBeUndefined();
      });

      it('should return false for non-existent pack', () => {
        const removed = service.removePromptPack('non-existent-id');
        expect(removed).toBe(false);
      });
    });

    describe('updatePromptPack', () => {
      it('should update existing pack while preserving progress', async () => {
        // Complete a prompt to create progress
        const nextPrompt = await service.getNextPrompt(sequentialPack.id);
        await service.markPromptCompleted(sequentialPack.id, nextPrompt!.id);

        const originalProgress = service.getProgress(sequentialPack.id);
        expect(originalProgress.completedPrompts.size).toBe(1);

        // Update pack
        const updatedPack = PromptPack.create('Updated Pack', 'Sequential');
        updatedPack.id = sequentialPack.id; // Keep same ID
        const newPrompt = Prompt.create('Updated prompt', 'string');
        updatedPack.addPrompt(newPrompt);

        service.updatePromptPack(updatedPack);

        const retrievedPack = service.getPromptPackById(sequentialPack.id);
        expect(retrievedPack!.name).toBe('Updated Pack');
        expect(retrievedPack!.progress.completedPrompts.size).toBe(1); // Progress preserved
      });

      it('should throw error for non-existent pack', () => {
        const nonExistentPack = PromptPack.create('Non-existent', 'Sequential');
        nonExistentPack.id = 'non-existent-id';

        expect(() => service.updatePromptPack(nonExistentPack)).toThrow(
          'Prompt pack with ID non-existent-id not found'
        );
      });
    });

    describe('getAllPromptPacks', () => {
      it('should return all loaded packs', () => {
        const allPacks = service.getAllPromptPacks();

        expect(allPacks).toHaveLength(3);
        expect(allPacks.some(p => p.id === sequentialPack.id)).toBe(true);
        expect(allPacks.some(p => p.id === randomPack.id)).toBe(true);
        expect(allPacks.some(p => p.id === datePack.id)).toBe(true);
      });
    });

    describe('getPromptPackById', () => {
      it('should return pack by ID', () => {
        const pack = service.getPromptPackById(sequentialPack.id);

        expect(pack).toBeDefined();
        expect(pack!.id).toBe(sequentialPack.id);
      });

      it('should return undefined for non-existent pack', () => {
        const pack = service.getPromptPackById('non-existent-id');
        expect(pack).toBeUndefined();
      });
    });
  });

  describe('completion status', () => {
    describe('isPackCompleted', () => {
      it('should return false for incomplete pack', () => {
        expect(service.isPackCompleted(sequentialPack.id)).toBe(false);
      });

      it('should return true for completed pack', async () => {
        // Complete all prompts
        for (const prompt of sequentialPack.prompts) {
          await service.markPromptCompleted(sequentialPack.id, prompt.id);
        }

        expect(service.isPackCompleted(sequentialPack.id)).toBe(true);
      });

      it('should return false for non-existent pack', () => {
        expect(service.isPackCompleted('non-existent-id')).toBe(false);
      });
    });

    describe('getPackStats', () => {
      it('should return correct stats for incomplete pack', () => {
        const stats = service.getPackStats(sequentialPack.id);

        expect(stats).toEqual({
          total: 3,
          completed: 0,
          percentage: 0,
          isCompleted: false
        });
      });

      it('should return correct stats after partial completion', async () => {
        const nextPrompt = await service.getNextPrompt(sequentialPack.id);
        await service.markPromptCompleted(sequentialPack.id, nextPrompt!.id);

        const stats = service.getPackStats(sequentialPack.id);

        expect(stats).toEqual({
          total: 3,
          completed: 1,
          percentage: 33,
          isCompleted: false
        });
      });

      it('should return null for non-existent pack', () => {
        const stats = service.getPackStats('non-existent-id');
        expect(stats).toBeNull();
      });
    });
  });

  describe('Date-specific methods', () => {
    describe('getPromptsForDate', () => {
      it('should return prompts for specific date', () => {
        const today = new Date();
        const prompts = service.getPromptsForDate(datePack.id, today);

        expect(prompts).toHaveLength(1);
        expect(prompts[0].content).toBe('Today prompt');
      });

      it('should throw error for non-Date pack', () => {
        const today = new Date();

        expect(() => service.getPromptsForDate(sequentialPack.id, today)).toThrow(
          'Pack ' + sequentialPack.id + ' is not a Date-type pack'
        );
      });

      it('should throw error for non-existent pack', () => {
        const today = new Date();

        expect(() => service.getPromptsForDate('non-existent-id', today)).toThrow(
          'Prompt pack with ID non-existent-id not found'
        );
      });
    });

    describe('getMissedPrompts', () => {
      it('should return missed prompts', () => {
        const missedPrompts = service.getMissedPrompts(datePack.id);

        expect(missedPrompts).toHaveLength(1);
        expect(missedPrompts[0].content).toBe('Yesterday prompt');
      });

      it('should throw error for non-Date pack', () => {
        expect(() => service.getMissedPrompts(sequentialPack.id)).toThrow(
          'Pack ' + sequentialPack.id + ' is not a Date-type pack'
        );
      });
    });

    describe('getUpcomingPrompts', () => {
      it('should return upcoming prompts', () => {
        const upcomingPrompts = service.getUpcomingPrompts(datePack.id);

        expect(upcomingPrompts).toHaveLength(1);
        expect(upcomingPrompts[0].content).toBe('Tomorrow prompt');
      });

      it('should throw error for non-Date pack', () => {
        expect(() => service.getUpcomingPrompts(sequentialPack.id)).toThrow(
          'Pack ' + sequentialPack.id + ' is not a Date-type pack'
        );
      });
    });

    describe('hasPromptsForToday', () => {
      it('should return true when there are prompts for today', () => {
        expect(service.hasPromptsForToday(datePack.id)).toBe(true);
      });

      it('should return false after completing today prompts', async () => {
        const todayPrompt = await service.getNextPrompt(datePack.id);
        await service.markPromptCompleted(datePack.id, todayPrompt!.id);

        expect(service.hasPromptsForToday(datePack.id)).toBe(false);
      });

      it('should return false for non-Date pack', () => {
        expect(service.hasPromptsForToday(sequentialPack.id)).toBe(false);
      });
    });

    describe('getCatchUpPrompts', () => {
      it('should return catch-up prompts', () => {
        const catchUpPrompts = service.getCatchUpPrompts(datePack.id, 7);

        expect(catchUpPrompts).toHaveLength(1);
        expect(catchUpPrompts[0].content).toBe('Yesterday prompt');
      });

      it('should throw error for non-Date pack', () => {
        expect(() => service.getCatchUpPrompts(sequentialPack.id)).toThrow(
          'Pack ' + sequentialPack.id + ' is not a Date-type pack'
        );
      });
    });

    describe('needsCatchUp', () => {
      it('should return true when catch-up is needed', () => {
        expect(service.needsCatchUp(datePack.id, 7)).toBe(true);
      });

      it('should return false after completing missed prompts', async () => {
        const missedPrompts = service.getMissedPrompts(datePack.id);
        for (const prompt of missedPrompts) {
          await service.markPromptCompleted(datePack.id, prompt.id);
        }

        expect(service.needsCatchUp(datePack.id, 7)).toBe(false);
      });

      it('should return false for non-Date pack', () => {
        expect(service.needsCatchUp(sequentialPack.id)).toBe(false);
      });
    });
  });

  describe('Random-specific methods', () => {
    describe('getAvailablePromptsCount', () => {
      it('should return total prompts count initially', () => {
        const count = service.getAvailablePromptsCount(randomPack.id);
        expect(count).toBe(3);
      });

      it('should return correct count after using prompts', async () => {
        const nextPrompt = await service.getNextPrompt(randomPack.id);
        await service.markPromptCompleted(randomPack.id, nextPrompt!.id);

        const count = service.getAvailablePromptsCount(randomPack.id);
        expect(count).toBe(2);
      });

      it('should return 0 for non-Random pack', () => {
        expect(service.getAvailablePromptsCount(sequentialPack.id)).toBe(0);
      });
    });

    describe('isCycleCompleted', () => {
      it('should return false initially', () => {
        expect(service.isCycleCompleted(randomPack.id)).toBe(false);
      });

      it('should return true after using all prompts', async () => {
        // Use all prompts
        for (const prompt of randomPack.prompts) {
          await service.getNextPrompt(randomPack.id);
          await service.markPromptCompleted(randomPack.id, prompt.id);
        }

        expect(service.isCycleCompleted(randomPack.id)).toBe(true);
      });

      it('should return false for non-Random pack', () => {
        expect(service.isCycleCompleted(sequentialPack.id)).toBe(false);
      });
    });

    describe('resetCycle', () => {
      it('should reset cycle for Random pack', async () => {
        // Use some prompts
        const nextPrompt = await service.getNextPrompt(randomPack.id);
        await service.markPromptCompleted(randomPack.id, nextPrompt!.id);

        expect(service.getAvailablePromptsCount(randomPack.id)).toBe(2);

        await service.resetCycle(randomPack.id);

        expect(service.getAvailablePromptsCount(randomPack.id)).toBe(3);
      });

      it('should throw error for non-Random pack', async () => {
        await expect(service.resetCycle(sequentialPack.id)).rejects.toThrow(
          'Pack ' + sequentialPack.id + ' is not a Random-type pack'
        );
      });
    });
  });

  describe('Sequential-specific methods', () => {
    describe('getNextPromptIndex', () => {
      it('should return 0 initially', () => {
        const index = service.getNextPromptIndex(sequentialPack.id);
        expect(index).toBe(0);
      });

      it('should return correct index after completing prompts', async () => {
        const nextPrompt = await service.getNextPrompt(sequentialPack.id);
        await service.markPromptCompleted(sequentialPack.id, nextPrompt!.id);

        const index = service.getNextPromptIndex(sequentialPack.id);
        expect(index).toBe(1);
      });

      it('should return null for non-Sequential pack', () => {
        expect(service.getNextPromptIndex(randomPack.id)).toBeNull();
      });
    });

    describe('canRestart', () => {
      it('should return false for incomplete pack', () => {
        expect(service.canRestart(sequentialPack.id)).toBe(false);
      });

      it('should return true for completed pack', async () => {
        // Complete all prompts
        for (const prompt of sequentialPack.prompts) {
          await service.markPromptCompleted(sequentialPack.id, prompt.id);
        }

        expect(service.canRestart(sequentialPack.id)).toBe(true);
      });

      it('should return false for non-Sequential pack', () => {
        expect(service.canRestart(randomPack.id)).toBe(false);
      });
    });

    describe('restart', () => {
      it('should restart completed Sequential pack', async () => {
        // Complete all prompts
        for (const prompt of sequentialPack.prompts) {
          await service.markPromptCompleted(sequentialPack.id, prompt.id);
        }

        expect(service.isPackCompleted(sequentialPack.id)).toBe(true);

        await service.restart(sequentialPack.id);

        expect(service.isPackCompleted(sequentialPack.id)).toBe(false);
        expect(service.getNextPromptIndex(sequentialPack.id)).toBe(0);
      });

      it('should throw error for non-Sequential pack', async () => {
        await expect(service.restart(randomPack.id)).rejects.toThrow(
          'Pack ' + randomPack.id + ' is not a Sequential-type pack'
        );
      });
    });
  });

  describe('getOverallStats', () => {
    it('should return correct overall statistics', () => {
      const stats = service.getOverallStats();

      expect(stats).toEqual({
        totalPacks: 3,
        activePacks: 3,
        completedPacks: 0,
        totalPrompts: 9, // 3 + 3 + 3
        completedPrompts: 0,
        overallProgress: 0
      });
    });

    it('should return correct stats after partial completion', async () => {
      // Complete one prompt from each pack
      const seqPrompt = await service.getNextPrompt(sequentialPack.id);
      await service.markPromptCompleted(sequentialPack.id, seqPrompt!.id);

      const randPrompt = await service.getNextPrompt(randomPack.id);
      await service.markPromptCompleted(randomPack.id, randPrompt!.id);

      const datePrompt = await service.getNextPrompt(datePack.id);
      await service.markPromptCompleted(datePack.id, datePrompt!.id);

      const stats = service.getOverallStats();

      expect(stats).toEqual({
        totalPacks: 3,
        activePacks: 3,
        completedPacks: 0,
        totalPrompts: 9,
        completedPrompts: 3,
        overallProgress: 33 // 3/9 = 33%
      });
    });

    it('should return correct stats with completed pack', async () => {
      // Complete all prompts in sequential pack
      for (const prompt of sequentialPack.prompts) {
        await service.markPromptCompleted(sequentialPack.id, prompt.id);
      }

      const stats = service.getOverallStats();

      expect(stats).toEqual({
        totalPacks: 3,
        activePacks: 2,
        completedPacks: 1,
        totalPrompts: 9,
        completedPrompts: 3,
        overallProgress: 33
      });
    });
  });

  describe('syncProgress', () => {
    it('should sync progress from store', async () => {
      // Set progress directly in store
      const progress = new PromptProgress();
      const prompt = sequentialPack.prompts[0];
      progress.completedPrompts.add(prompt.id);
      mockProgressStore.setProgress(sequentialPack.id, progress);

      // Service should not have this progress yet
      expect(service.getProgress(sequentialPack.id).completedPrompts.has(prompt.id)).toBe(false);

      await service.syncProgress(sequentialPack.id);

      // Now service should have the progress
      expect(service.getProgress(sequentialPack.id).completedPrompts.has(prompt.id)).toBe(true);
    });

    it('should throw error for non-existent pack', async () => {
      await expect(service.syncProgress('non-existent-id')).rejects.toThrow(
        'Prompt pack with ID non-existent-id not found'
      );
    });
  });

  describe('validateState', () => {
    it('should return true for valid state', () => {
      expect(service.validateState()).toBe(true);
    });

    it('should return false for invalid progress data', () => {
      // Corrupt progress data
      const pack = service.getPromptPackById(sequentialPack.id)!;
      (pack.progress as any).completedPrompts = 'invalid'; // Should be Set

      expect(service.validateState()).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should handle errors gracefully in getNextPrompt', async () => {
      // Remove pack to cause error
      service.removePromptPack(sequentialPack.id);

      await expect(service.getNextPrompt(sequentialPack.id)).rejects.toThrow();
    });

    it('should handle errors gracefully in markPromptCompleted', async () => {
      await expect(service.markPromptCompleted(sequentialPack.id, 'invalid-prompt-id')).rejects.toThrow();
    });

    it('should handle errors gracefully in resetProgress', async () => {
      service.removePromptPack(sequentialPack.id);

      await expect(service.resetProgress(sequentialPack.id)).rejects.toThrow();
    });
  });

  describe('edge cases', () => {
    it('should handle empty prompt packs', async () => {
      const emptyPack = PromptPack.create('Empty Pack', 'Sequential');
      service.addPromptPack(emptyPack);

      const nextPrompt = await service.getNextPrompt(emptyPack.id);
      expect(nextPrompt).toBeNull();

      expect(service.isPackCompleted(emptyPack.id)).toBe(false);

      const stats = service.getPackStats(emptyPack.id);
      expect(stats?.total).toBe(0);
    });

    it('should handle packs with single prompt', async () => {
      const singlePack = PromptPack.create('Single Pack', 'Sequential');
      const singlePrompt = Prompt.create('Only prompt', 'string');
      singlePack.addPrompt(singlePrompt);
      service.addPromptPack(singlePack);

      const nextPrompt = await service.getNextPrompt(singlePack.id);
      expect(nextPrompt?.id).toBe(singlePrompt.id);

      await service.markPromptCompleted(singlePack.id, singlePrompt.id);

      expect(service.isPackCompleted(singlePack.id)).toBe(true);

      const nextPromptAfterCompletion = await service.getNextPrompt(singlePack.id);
      expect(nextPromptAfterCompletion).toBeNull();
    });

    it('should handle concurrent operations', async () => {
      // Simulate concurrent access
      const promises = [
        service.getNextPrompt(sequentialPack.id),
        service.getProgress(sequentialPack.id),
        service.getPackStats(sequentialPack.id)
      ];

      const results = await Promise.all(promises);

      expect(results[0]).not.toBeNull(); // nextPrompt
      expect(results[1]).toBeInstanceOf(PromptProgress); // progress
      expect(results[2]).not.toBeNull(); // stats
    });
  });
});