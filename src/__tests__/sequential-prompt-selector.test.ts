/**
 * Unit tests for Sequential prompt selector
 */

import { SequentialPromptSelector } from '../prompt-selector';
import { PromptPack, Prompt, PromptProgress } from '../models';

describe('SequentialPromptSelector', () => {
  let selector: SequentialPromptSelector;
  let pack: PromptPack;

  beforeEach(() => {
    selector = new SequentialPromptSelector();

    // Create test prompts with explicit order
    const prompts = [
      Prompt.create('First prompt', 'string', { order: 1 }),
      Prompt.create('Second prompt', 'string', { order: 2 }),
      Prompt.create('Third prompt', 'string', { order: 3 })
    ];

    pack = PromptPack.create('Test Sequential Pack', 'Sequential');
    prompts.forEach(prompt => pack.addPrompt(prompt));
  });

  describe('selectNextPrompt', () => {
    it('should return the first prompt when starting fresh', () => {
      const nextPrompt = selector.selectNextPrompt(pack);

      expect(nextPrompt).not.toBeNull();
      expect(nextPrompt?.content).toBe('First prompt');
      expect(nextPrompt?.order).toBe(1);
    });

    it('should return prompts in order based on order property', () => {
      // First prompt
      let nextPrompt = selector.selectNextPrompt(pack);
      expect(nextPrompt?.content).toBe('First prompt');

      // Mark first as completed and get next
      selector.markCompleted(pack, nextPrompt!.id);
      nextPrompt = selector.selectNextPrompt(pack);
      expect(nextPrompt?.content).toBe('Second prompt');

      // Mark second as completed and get next
      selector.markCompleted(pack, nextPrompt!.id);
      nextPrompt = selector.selectNextPrompt(pack);
      expect(nextPrompt?.content).toBe('Third prompt');
    });

    it('should return null when all prompts are completed', () => {
      // Complete all prompts
      pack.prompts.forEach(prompt => {
        selector.markCompleted(pack, prompt.id);
      });

      const nextPrompt = selector.selectNextPrompt(pack);
      expect(nextPrompt).toBeNull();
    });

    it('should return null for empty prompt pack', () => {
      const emptyPack = PromptPack.create('Empty Pack', 'Sequential');
      const nextPrompt = selector.selectNextPrompt(emptyPack);

      expect(nextPrompt).toBeNull();
    });

    it('should handle prompts without explicit order by using array index', () => {
      // Create pack with prompts without order
      const unorderedPack = PromptPack.create('Unordered Pack', 'Sequential');
      const prompt1 = Prompt.create('First', 'string');
      const prompt2 = Prompt.create('Second', 'string');
      const prompt3 = Prompt.create('Third', 'string');

      unorderedPack.addPrompt(prompt1);
      unorderedPack.addPrompt(prompt2);
      unorderedPack.addPrompt(prompt3);

      // Should return in array order
      let nextPrompt = selector.selectNextPrompt(unorderedPack);
      expect(nextPrompt?.content).toBe('First');

      selector.markCompleted(unorderedPack, nextPrompt!.id);
      nextPrompt = selector.selectNextPrompt(unorderedPack);
      expect(nextPrompt?.content).toBe('Second');
    });

    it('should skip completed prompts and find next uncompleted one', () => {
      // Mark second prompt as completed directly
      const secondPrompt = pack.prompts.find(p => p.order === 2)!;
      pack.progress.completedPrompts.add(secondPrompt.id);

      // Should still return first prompt
      let nextPrompt = selector.selectNextPrompt(pack);
      expect(nextPrompt?.content).toBe('First prompt');

      // After completing first, should skip second and go to third
      selector.markCompleted(pack, nextPrompt!.id);
      nextPrompt = selector.selectNextPrompt(pack);
      expect(nextPrompt?.content).toBe('Third prompt');
    });

    it('should throw error for non-Sequential pack types', () => {
      const randomPack = PromptPack.create('Random Pack', 'Random');

      expect(() => selector.selectNextPrompt(randomPack)).toThrow(
        'SequentialPromptSelector can only be used with Sequential prompt packs'
      );
    });

    it('should initialize currentIndex to 0 when undefined', () => {
      expect(pack.progress.currentIndex).toBeUndefined();

      selector.selectNextPrompt(pack);

      expect(pack.progress.currentIndex).toBe(0);
    });
  });

  describe('markCompleted', () => {
    it('should mark prompt as completed and advance index', () => {
      const firstPrompt = selector.selectNextPrompt(pack)!;

      selector.markCompleted(pack, firstPrompt.id);

      expect(pack.progress.completedPrompts.has(firstPrompt.id)).toBe(true);
      expect(pack.progress.currentIndex).toBe(1);
    });

    it('should not advance index if marking non-current prompt', () => {
      const firstPrompt = selector.selectNextPrompt(pack)!;
      const thirdPrompt = pack.prompts.find(p => p.order === 3)!;

      // Mark third prompt as completed (not current)
      selector.markCompleted(pack, thirdPrompt.id);

      expect(pack.progress.completedPrompts.has(thirdPrompt.id)).toBe(true);
      expect(pack.progress.currentIndex).toBe(0); // Should not advance
    });

    it('should throw error for non-Sequential pack types', () => {
      const randomPack = PromptPack.create('Random Pack', 'Random');

      expect(() => selector.markCompleted(randomPack, 'some-id')).toThrow(
        'SequentialPromptSelector can only be used with Sequential prompt packs'
      );
    });

    it('should update lastAccessDate when marking completed', () => {
      const firstPrompt = selector.selectNextPrompt(pack)!;
      const beforeTime = new Date();

      selector.markCompleted(pack, firstPrompt.id);

      expect(pack.progress.lastAccessDate.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
    });
  });

  describe('isCompleted', () => {
    it('should return false when no prompts are completed', () => {
      expect(selector.isCompleted(pack)).toBe(false);
    });

    it('should return false when some prompts are completed', () => {
      const firstPrompt = pack.prompts[0];
      selector.markCompleted(pack, firstPrompt.id);

      expect(selector.isCompleted(pack)).toBe(false);
    });

    it('should return true when all prompts are completed', () => {
      pack.prompts.forEach(prompt => {
        selector.markCompleted(pack, prompt.id);
      });

      expect(selector.isCompleted(pack)).toBe(true);
    });

    it('should return false for empty pack', () => {
      const emptyPack = PromptPack.create('Empty Pack', 'Sequential');

      expect(selector.isCompleted(emptyPack)).toBe(false);
    });

    it('should throw error for non-Sequential pack types', () => {
      const randomPack = PromptPack.create('Random Pack', 'Random');

      expect(() => selector.isCompleted(randomPack)).toThrow(
        'SequentialPromptSelector can only be used with Sequential prompt packs'
      );
    });
  });

  describe('reset', () => {
    it('should reset progress and set currentIndex to 0', () => {
      // Complete some prompts
      const firstPrompt = selector.selectNextPrompt(pack)!;
      selector.markCompleted(pack, firstPrompt.id);

      expect(pack.progress.completedPrompts.size).toBe(1);
      expect(pack.progress.currentIndex).toBe(1);

      selector.reset(pack);

      expect(pack.progress.completedPrompts.size).toBe(0);
      expect(pack.progress.currentIndex).toBe(0);
    });

    it('should throw error for non-Sequential pack types', () => {
      const randomPack = PromptPack.create('Random Pack', 'Random');

      expect(() => selector.reset(randomPack)).toThrow(
        'SequentialPromptSelector can only be used with Sequential prompt packs'
      );
    });
  });

  describe('getProgressPercentage', () => {
    it('should return 0 for no completed prompts', () => {
      expect(selector.getProgressPercentage(pack)).toBe(0);
    });

    it('should return correct percentage for partial completion', () => {
      const firstPrompt = pack.prompts[0];
      selector.markCompleted(pack, firstPrompt.id);

      expect(selector.getProgressPercentage(pack)).toBe(33); // 1/3 = 33%
    });

    it('should return 100 for all completed prompts', () => {
      pack.prompts.forEach(prompt => {
        selector.markCompleted(pack, prompt.id);
      });

      expect(selector.getProgressPercentage(pack)).toBe(100);
    });

    it('should return 0 for empty pack', () => {
      const emptyPack = PromptPack.create('Empty Pack', 'Sequential');

      expect(selector.getProgressPercentage(emptyPack)).toBe(0);
    });
  });

  describe('getNextPromptIndex', () => {
    it('should return 0 for fresh pack', () => {
      expect(selector.getNextPromptIndex(pack)).toBe(0);
    });

    it('should return correct index after completing prompts', () => {
      const firstPrompt = selector.selectNextPrompt(pack)!;
      selector.markCompleted(pack, firstPrompt.id);

      expect(selector.getNextPromptIndex(pack)).toBe(1);
    });

    it('should return null when all prompts completed', () => {
      pack.prompts.forEach(prompt => {
        selector.markCompleted(pack, prompt.id);
      });

      expect(selector.getNextPromptIndex(pack)).toBeNull();
    });

    it('should return null for empty pack', () => {
      const emptyPack = PromptPack.create('Empty Pack', 'Sequential');

      expect(selector.getNextPromptIndex(emptyPack)).toBeNull();
    });
  });

  describe('canRestart and restart', () => {
    it('should not allow restart when pack is not completed', () => {
      expect(selector.canRestart(pack)).toBe(false);

      expect(() => selector.restart(pack)).toThrow(
        'Cannot restart pack - not all prompts are completed'
      );
    });

    it('should allow restart when pack is completed', () => {
      // Complete all prompts
      pack.prompts.forEach(prompt => {
        selector.markCompleted(pack, prompt.id);
      });

      expect(selector.canRestart(pack)).toBe(true);

      selector.restart(pack);

      expect(pack.progress.completedPrompts.size).toBe(0);
      expect(pack.progress.currentIndex).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle mixed order values correctly', () => {
      // Create pack with mixed order values
      const mixedPack = PromptPack.create('Mixed Pack', 'Sequential');
      const prompt1 = Prompt.create('Third', 'string', { order: 3 });
      const prompt2 = Prompt.create('First', 'string', { order: 1 });
      const prompt3 = Prompt.create('Second', 'string', { order: 2 });

      mixedPack.addPrompt(prompt1);
      mixedPack.addPrompt(prompt2);
      mixedPack.addPrompt(prompt3);

      // Should return in order value sequence, not array sequence
      let nextPrompt = selector.selectNextPrompt(mixedPack);
      expect(nextPrompt?.content).toBe('First');

      selector.markCompleted(mixedPack, nextPrompt!.id);
      nextPrompt = selector.selectNextPrompt(mixedPack);
      expect(nextPrompt?.content).toBe('Second');

      selector.markCompleted(mixedPack, nextPrompt!.id);
      nextPrompt = selector.selectNextPrompt(mixedPack);
      expect(nextPrompt?.content).toBe('Third');
    });

    it('should handle duplicate order values by maintaining stable sort', () => {
      const duplicatePack = PromptPack.create('Duplicate Pack', 'Sequential');
      const prompt1 = Prompt.create('First with order 1', 'string', { order: 1 });
      const prompt2 = Prompt.create('Second with order 1', 'string', { order: 1 });
      const prompt3 = Prompt.create('Third with order 2', 'string', { order: 2 });

      duplicatePack.addPrompt(prompt1);
      duplicatePack.addPrompt(prompt2);
      duplicatePack.addPrompt(prompt3);

      // Should maintain array order for same order values
      let nextPrompt = selector.selectNextPrompt(duplicatePack);
      expect(nextPrompt?.content).toBe('First with order 1');

      selector.markCompleted(duplicatePack, nextPrompt!.id);
      nextPrompt = selector.selectNextPrompt(duplicatePack);
      expect(nextPrompt?.content).toBe('Second with order 1');
    });
  });
});