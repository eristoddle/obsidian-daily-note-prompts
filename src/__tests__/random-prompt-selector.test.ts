/**
 * Unit tests for Random prompt selector
 */

import { RandomPromptSelector } from '../prompt-selector';
import { PromptPack, Prompt, PromptProgress } from '../models';

describe('RandomPromptSelector', () => {
  let selector: RandomPromptSelector;
  let pack: PromptPack;

  beforeEach(() => {
    selector = new RandomPromptSelector();

    // Create test prompts
    const prompts = [
      Prompt.create('First prompt', 'string'),
      Prompt.create('Second prompt', 'string'),
      Prompt.create('Third prompt', 'string'),
      Prompt.create('Fourth prompt', 'string'),
      Prompt.create('Fifth prompt', 'string')
    ];

    pack = PromptPack.create('Test Random Pack', 'Random');
    prompts.forEach(prompt => pack.addPrompt(prompt));
  });

  describe('selectNextPrompt', () => {
    it('should return a prompt from the pack', () => {
      const nextPrompt = selector.selectNextPrompt(pack);

      expect(nextPrompt).not.toBeNull();
      expect(pack.prompts.some(p => p.id === nextPrompt!.id)).toBe(true);
    });

    it('should initialize usedPrompts set if not present', () => {
      expect(pack.progress.usedPrompts).toBeUndefined();

      selector.selectNextPrompt(pack);

      expect(pack.progress.usedPrompts).toBeInstanceOf(Set);
    });

    it('should return different prompts over multiple calls', () => {
      const selectedPrompts = new Set<string>();
      const maxAttempts = 50; // Try multiple times to get different prompts

      for (let i = 0; i < maxAttempts; i++) {
        const prompt = selector.selectNextPrompt(pack);
        if (prompt) {
          selectedPrompts.add(prompt.id);
        }
        if (selectedPrompts.size > 1) break; // Found different prompts
      }

      expect(selectedPrompts.size).toBeGreaterThan(1);
    });

    it('should not repeat prompts until all are used', () => {
      const selectedPrompts: string[] = [];

      // Select prompts until we get all of them
      for (let i = 0; i < pack.prompts.length; i++) {
        const prompt = selector.selectNextPrompt(pack);
        expect(prompt).not.toBeNull();

        // Mark as used to simulate the selection process
        pack.progress.usedPrompts!.add(prompt!.id);
        selectedPrompts.push(prompt!.id);
      }

      // Should have selected all prompts exactly once
      expect(selectedPrompts.length).toBe(pack.prompts.length);
      expect(new Set(selectedPrompts).size).toBe(pack.prompts.length);
    });

    it('should reset cycle when all prompts are used', () => {
      // Use all prompts
      pack.prompts.forEach(prompt => {
        pack.progress.usedPrompts = pack.progress.usedPrompts || new Set();
        pack.progress.usedPrompts.add(prompt.id);
      });

      // Next selection should reset cycle and return a prompt
      const nextPrompt = selector.selectNextPrompt(pack);

      expect(nextPrompt).not.toBeNull();
      expect(pack.progress.usedPrompts!.size).toBe(0); // Cycle reset
    });

    it('should return null for empty prompt pack', () => {
      const emptyPack = PromptPack.create('Empty Pack', 'Random');
      const nextPrompt = selector.selectNextPrompt(emptyPack);

      expect(nextPrompt).toBeNull();
    });

    it('should throw error for non-Random pack types', () => {
      const sequentialPack = PromptPack.create('Sequential Pack', 'Sequential');

      expect(() => selector.selectNextPrompt(sequentialPack)).toThrow(
        'RandomPromptSelector can only be used with Random prompt packs'
      );
    });
  });

  describe('markCompleted', () => {
    it('should mark prompt as completed and add to used prompts', () => {
      const prompt = pack.prompts[0];

      selector.markCompleted(pack, prompt.id);

      expect(pack.progress.completedPrompts.has(prompt.id)).toBe(true);
      expect(pack.progress.usedPrompts!.has(prompt.id)).toBe(true);
    });

    it('should initialize usedPrompts set if not present', () => {
      const prompt = pack.prompts[0];
      expect(pack.progress.usedPrompts).toBeUndefined();

      selector.markCompleted(pack, prompt.id);

      expect(pack.progress.usedPrompts).toBeInstanceOf(Set);
      expect(pack.progress.usedPrompts!.has(prompt.id)).toBe(true);
    });

    it('should update lastAccessDate when marking completed', () => {
      const prompt = pack.prompts[0];
      const beforeTime = new Date();

      selector.markCompleted(pack, prompt.id);

      expect(pack.progress.lastAccessDate.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
    });

    it('should throw error for non-Random pack types', () => {
      const sequentialPack = PromptPack.create('Sequential Pack', 'Sequential');

      expect(() => selector.markCompleted(sequentialPack, 'some-id')).toThrow(
        'RandomPromptSelector can only be used with Random prompt packs'
      );
    });
  });

  describe('isCompleted', () => {
    it('should return false when no prompts are completed', () => {
      expect(selector.isCompleted(pack)).toBe(false);
    });

    it('should return false when some prompts are completed', () => {
      const prompt = pack.prompts[0];
      selector.markCompleted(pack, prompt.id);

      expect(selector.isCompleted(pack)).toBe(false);
    });

    it('should return true when all prompts are completed', () => {
      pack.prompts.forEach(prompt => {
        selector.markCompleted(pack, prompt.id);
      });

      expect(selector.isCompleted(pack)).toBe(true);
    });

    it('should return false for empty pack', () => {
      const emptyPack = PromptPack.create('Empty Pack', 'Random');

      expect(selector.isCompleted(emptyPack)).toBe(false);
    });

    it('should throw error for non-Random pack types', () => {
      const sequentialPack = PromptPack.create('Sequential Pack', 'Sequential');

      expect(() => selector.isCompleted(sequentialPack)).toThrow(
        'RandomPromptSelector can only be used with Random prompt packs'
      );
    });
  });

  describe('reset', () => {
    it('should reset progress and clear used prompts', () => {
      // Complete some prompts
      const prompt = pack.prompts[0];
      selector.markCompleted(pack, prompt.id);

      expect(pack.progress.completedPrompts.size).toBe(1);
      expect(pack.progress.usedPrompts!.size).toBe(1);

      selector.reset(pack);

      expect(pack.progress.completedPrompts.size).toBe(0);
      expect(pack.progress.usedPrompts!.size).toBe(0);
    });

    it('should throw error for non-Random pack types', () => {
      const sequentialPack = PromptPack.create('Sequential Pack', 'Sequential');

      expect(() => selector.reset(sequentialPack)).toThrow(
        'RandomPromptSelector can only be used with Random prompt packs'
      );
    });
  });

  describe('getProgressPercentage', () => {
    it('should return 0 for no completed prompts', () => {
      expect(selector.getProgressPercentage(pack)).toBe(0);
    });

    it('should return correct percentage for partial completion', () => {
      const prompt = pack.prompts[0];
      selector.markCompleted(pack, prompt.id);

      expect(selector.getProgressPercentage(pack)).toBe(20); // 1/5 = 20%
    });

    it('should return 100 for all completed prompts', () => {
      pack.prompts.forEach(prompt => {
        selector.markCompleted(pack, prompt.id);
      });

      expect(selector.getProgressPercentage(pack)).toBe(100);
    });

    it('should return 0 for empty pack', () => {
      const emptyPack = PromptPack.create('Empty Pack', 'Random');

      expect(selector.getProgressPercentage(emptyPack)).toBe(0);
    });
  });

  describe('getAvailablePromptsCount', () => {
    it('should return total prompts count when no prompts are used', () => {
      expect(selector.getAvailablePromptsCount(pack)).toBe(5);
    });

    it('should return correct count after using some prompts', () => {
      pack.progress.usedPrompts = new Set([pack.prompts[0].id, pack.prompts[1].id]);

      expect(selector.getAvailablePromptsCount(pack)).toBe(3);
    });

    it('should return 0 when all prompts are used', () => {
      pack.progress.usedPrompts = new Set(pack.prompts.map(p => p.id));

      expect(selector.getAvailablePromptsCount(pack)).toBe(0);
    });
  });

  describe('getUsedPromptsCount', () => {
    it('should return 0 when no prompts are used', () => {
      expect(selector.getUsedPromptsCount(pack)).toBe(0);
    });

    it('should return correct count after using some prompts', () => {
      pack.progress.usedPrompts = new Set([pack.prompts[0].id, pack.prompts[1].id]);

      expect(selector.getUsedPromptsCount(pack)).toBe(2);
    });

    it('should return total count when all prompts are used', () => {
      pack.progress.usedPrompts = new Set(pack.prompts.map(p => p.id));

      expect(selector.getUsedPromptsCount(pack)).toBe(5);
    });
  });

  describe('isCycleCompleted', () => {
    it('should return false when no prompts are used', () => {
      expect(selector.isCycleCompleted(pack)).toBe(false);
    });

    it('should return false when some prompts are used', () => {
      pack.progress.usedPrompts = new Set([pack.prompts[0].id, pack.prompts[1].id]);

      expect(selector.isCycleCompleted(pack)).toBe(false);
    });

    it('should return true when all prompts are used', () => {
      pack.progress.usedPrompts = new Set(pack.prompts.map(p => p.id));

      expect(selector.isCycleCompleted(pack)).toBe(true);
    });

    it('should return false for empty pack', () => {
      const emptyPack = PromptPack.create('Empty Pack', 'Random');

      expect(selector.isCycleCompleted(emptyPack)).toBe(false);
    });
  });

  describe('resetCycle', () => {
    it('should clear used prompts but keep completed prompts', () => {
      // Mark some prompts as completed and used
      const prompt1 = pack.prompts[0];
      const prompt2 = pack.prompts[1];

      selector.markCompleted(pack, prompt1.id);
      selector.markCompleted(pack, prompt2.id);

      expect(pack.progress.completedPrompts.size).toBe(2);
      expect(pack.progress.usedPrompts!.size).toBe(2);

      selector.resetCycle(pack);

      expect(pack.progress.completedPrompts.size).toBe(2); // Should remain
      expect(pack.progress.usedPrompts!.size).toBe(0); // Should be cleared
    });

    it('should initialize usedPrompts set if not present', () => {
      expect(pack.progress.usedPrompts).toBeUndefined();

      selector.resetCycle(pack);

      expect(pack.progress.usedPrompts).toBeInstanceOf(Set);
      expect(pack.progress.usedPrompts!.size).toBe(0);
    });

    it('should update lastAccessDate', () => {
      const beforeTime = new Date();

      selector.resetCycle(pack);

      expect(pack.progress.lastAccessDate.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
    });
  });

  describe('getStats', () => {
    it('should return correct statistics for fresh pack', () => {
      const stats = selector.getStats(pack);

      expect(stats).toEqual({
        totalPrompts: 5,
        completedPrompts: 0,
        usedInCycle: 0,
        availableInCycle: 5,
        cycleProgress: 0,
        overallProgress: 0
      });
    });

    it('should return correct statistics after partial usage', () => {
      // Mark 2 prompts as completed and used
      selector.markCompleted(pack, pack.prompts[0].id);
      selector.markCompleted(pack, pack.prompts[1].id);

      // Mark 1 additional prompt as used (but not completed)
      pack.progress.usedPrompts!.add(pack.prompts[2].id);

      const stats = selector.getStats(pack);

      expect(stats).toEqual({
        totalPrompts: 5,
        completedPrompts: 2,
        usedInCycle: 3,
        availableInCycle: 2,
        cycleProgress: 60, // 3/5 = 60%
        overallProgress: 40 // 2/5 = 40%
      });
    });

    it('should return correct statistics for completed pack', () => {
      // Complete all prompts
      pack.prompts.forEach(prompt => {
        selector.markCompleted(pack, prompt.id);
      });

      const stats = selector.getStats(pack);

      expect(stats).toEqual({
        totalPrompts: 5,
        completedPrompts: 5,
        usedInCycle: 5,
        availableInCycle: 0,
        cycleProgress: 100,
        overallProgress: 100
      });
    });

    it('should return correct statistics for empty pack', () => {
      const emptyPack = PromptPack.create('Empty Pack', 'Random');
      const stats = selector.getStats(emptyPack);

      expect(stats).toEqual({
        totalPrompts: 0,
        completedPrompts: 0,
        usedInCycle: 0,
        availableInCycle: 0,
        cycleProgress: 0,
        overallProgress: 0
      });
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete random selection workflow', () => {
      const selectedPrompts: string[] = [];

      // Select and mark completed all prompts in first cycle
      for (let i = 0; i < pack.prompts.length; i++) {
        const prompt = selector.selectNextPrompt(pack);
        expect(prompt).not.toBeNull();

        selectedPrompts.push(prompt!.id);
        selector.markCompleted(pack, prompt!.id);
      }

      // Should have selected all prompts exactly once
      expect(selectedPrompts.length).toBe(pack.prompts.length);
      expect(new Set(selectedPrompts).size).toBe(pack.prompts.length);

      // Pack should be completed
      expect(selector.isCompleted(pack)).toBe(true);
      expect(selector.isCycleCompleted(pack)).toBe(true);

      // Should be able to start new cycle
      selector.resetCycle(pack);
      expect(selector.isCycleCompleted(pack)).toBe(false);

      const nextPrompt = selector.selectNextPrompt(pack);
      expect(nextPrompt).not.toBeNull();
    });

    it('should handle cycle reset during selection', () => {
      // Use all prompts without completing them
      pack.prompts.forEach(prompt => {
        pack.progress.usedPrompts = pack.progress.usedPrompts || new Set();
        pack.progress.usedPrompts.add(prompt.id);
      });

      expect(selector.isCycleCompleted(pack)).toBe(true);
      expect(selector.getAvailablePromptsCount(pack)).toBe(0);

      // Next selection should reset cycle automatically
      const nextPrompt = selector.selectNextPrompt(pack);
      expect(nextPrompt).not.toBeNull();
      expect(selector.getUsedPromptsCount(pack)).toBe(0); // Cycle was reset
    });
  });
});