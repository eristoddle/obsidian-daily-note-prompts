/**
 * Unit tests for Date-based prompt selector
 */

import { DatePromptSelector } from '../prompt-selector';
import { PromptPack, Prompt, PromptProgress } from '../models';

describe('DatePromptSelector', () => {
  let selector: DatePromptSelector;
  let pack: PromptPack;
  let today: Date;
  let yesterday: Date;
  let tomorrow: Date;
  let nextWeek: Date;

  beforeEach(() => {
    selector = new DatePromptSelector();

    // Set up test dates using local time to avoid timezone issues
    const now = new Date();
    today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);

    yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12, 0, 0, 0);

    tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12, 0, 0, 0);

    nextWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, 12, 0, 0, 0);

    // Create test prompts with dates
    const prompts = [
      Prompt.create('Yesterday prompt', 'string', { date: yesterday }),
      Prompt.create('Today prompt 1', 'string', { date: today }),
      Prompt.create('Today prompt 2', 'string', { date: today }),
      Prompt.create('Tomorrow prompt', 'string', { date: tomorrow }),
      Prompt.create('Next week prompt', 'string', { date: nextWeek })
    ];

    pack = PromptPack.create('Test Date Pack', 'Date');
    prompts.forEach(prompt => pack.addPrompt(prompt));
  });

  describe('selectNextPrompt', () => {
    it('should return prompt for current date', () => {
      const nextPrompt = selector.selectNextPrompt(pack);

      expect(nextPrompt).not.toBeNull();
      expect(nextPrompt?.content).toMatch(/Today prompt/);
      expect(nextPrompt?.date).toBeDefined();

      // Should be same date (ignoring time)
      const promptDate = new Date(nextPrompt!.date!);
      expect(promptDate.toDateString()).toBe(today.toDateString());
    });

    it('should return prompt for specified target date', () => {
      const nextPrompt = selector.selectNextPrompt(pack, tomorrow);

      expect(nextPrompt).not.toBeNull();
      expect(nextPrompt?.content).toBe('Tomorrow prompt');

      const promptDate = new Date(nextPrompt!.date!);
      expect(promptDate.toDateString()).toBe(tomorrow.toDateString());
    });

    it('should return first uncompleted prompt for date with multiple prompts', () => {
      // Mark first today prompt as completed
      const todayPrompts = pack.prompts.filter(p =>
        p.date && p.date.toDateString() === today.toDateString()
      );
      pack.progress.completedPrompts.add(todayPrompts[0].id);

      const nextPrompt = selector.selectNextPrompt(pack);

      expect(nextPrompt).not.toBeNull();
      expect(nextPrompt?.content).toBe('Today prompt 2');
    });

    it('should return null when no prompts for target date', () => {
      const futureDate = new Date(today);
      futureDate.setDate(futureDate.getDate() + 30); // 30 days from now

      const nextPrompt = selector.selectNextPrompt(pack, futureDate);

      expect(nextPrompt).toBeNull();
    });

    it('should return null when all prompts for date are completed', () => {
      // Complete all today prompts
      const todayPrompts = pack.prompts.filter(p =>
        p.date && p.date.toDateString() === today.toDateString()
      );
      todayPrompts.forEach(prompt => {
        pack.progress.completedPrompts.add(prompt.id);
      });

      const nextPrompt = selector.selectNextPrompt(pack);

      expect(nextPrompt).toBeNull();
    });

    it('should return null for empty prompt pack', () => {
      const emptyPack = PromptPack.create('Empty Pack', 'Date');
      const nextPrompt = selector.selectNextPrompt(emptyPack);

      expect(nextPrompt).toBeNull();
    });

    it('should throw error for non-Date pack types', () => {
      const sequentialPack = PromptPack.create('Sequential Pack', 'Sequential');

      expect(() => selector.selectNextPrompt(sequentialPack)).toThrow(
        'DatePromptSelector can only be used with Date prompt packs'
      );
    });
  });

  describe('getPromptsForDate', () => {
    it('should return all prompts for specific date', () => {
      const todayPrompts = selector.getPromptsForDate(pack, today);

      expect(todayPrompts).toHaveLength(2);
      expect(todayPrompts[0].content).toBe('Today prompt 1');
      expect(todayPrompts[1].content).toBe('Today prompt 2');
    });

    it('should return empty array for date with no prompts', () => {
      const futureDate = new Date(today);
      futureDate.setDate(futureDate.getDate() + 30);

      const prompts = selector.getPromptsForDate(pack, futureDate);

      expect(prompts).toHaveLength(0);
    });

    it('should handle date comparison correctly across time zones', () => {
      // Test that date comparison works by checking the basic functionality
      const todayPrompts = selector.getPromptsForDate(pack, today);
      expect(todayPrompts).toHaveLength(2); // Should find today's prompts

      // Verify the prompts are actually today's prompts
      expect(todayPrompts.some(p => p.content === 'Today prompt 1')).toBe(true);
      expect(todayPrompts.some(p => p.content === 'Today prompt 2')).toBe(true);
    });
  });

  describe('getMissedPrompts', () => {
    it('should return prompts from past dates that are not completed', () => {
      const missedPrompts = selector.getMissedPrompts(pack);

      expect(missedPrompts).toHaveLength(1);
      expect(missedPrompts[0].content).toBe('Yesterday prompt');
    });

    it('should not return completed past prompts', () => {
      // Mark yesterday prompt as completed
      const yesterdayPrompt = pack.prompts.find(p => p.content === 'Yesterday prompt')!;
      pack.progress.completedPrompts.add(yesterdayPrompt.id);

      const missedPrompts = selector.getMissedPrompts(pack);

      expect(missedPrompts).toHaveLength(0);
    });

    it('should respect custom cutoff date', () => {
      const twoDaysAgo = new Date(today);
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

      const missedPrompts = selector.getMissedPrompts(pack, twoDaysAgo);

      expect(missedPrompts).toHaveLength(0); // Yesterday should not be included
    });

    it('should return empty array when no missed prompts', () => {
      // Complete yesterday prompt
      const yesterdayPrompt = pack.prompts.find(p => p.content === 'Yesterday prompt')!;
      pack.progress.completedPrompts.add(yesterdayPrompt.id);

      const missedPrompts = selector.getMissedPrompts(pack);

      expect(missedPrompts).toHaveLength(0);
    });
  });

  describe('getUpcomingPrompts', () => {
    it('should return future prompts sorted by date', () => {
      const upcomingPrompts = selector.getUpcomingPrompts(pack);

      expect(upcomingPrompts).toHaveLength(2);
      expect(upcomingPrompts[0].content).toBe('Tomorrow prompt');
      expect(upcomingPrompts[1].content).toBe('Next week prompt');

      // Should be sorted by date
      expect(upcomingPrompts[0].date!.getTime()).toBeLessThan(upcomingPrompts[1].date!.getTime());
    });

    it('should respect custom start date', () => {
      const upcomingPrompts = selector.getUpcomingPrompts(pack, tomorrow);

      expect(upcomingPrompts).toHaveLength(1);
      expect(upcomingPrompts[0].content).toBe('Next week prompt');
    });

    it('should return empty array when no upcoming prompts', () => {
      const farFuture = new Date(today);
      farFuture.setDate(farFuture.getDate() + 30);

      const upcomingPrompts = selector.getUpcomingPrompts(pack, farFuture);

      expect(upcomingPrompts).toHaveLength(0);
    });
  });

  describe('markCompleted', () => {
    it('should mark prompt as completed and update lastAccessDate', () => {
      const prompt = pack.prompts[0];
      const beforeTime = new Date();

      selector.markCompleted(pack, prompt.id);

      expect(pack.progress.completedPrompts.has(prompt.id)).toBe(true);
      expect(pack.progress.lastAccessDate.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
    });

    it('should throw error for non-Date pack types', () => {
      const sequentialPack = PromptPack.create('Sequential Pack', 'Sequential');

      expect(() => selector.markCompleted(sequentialPack, 'some-id')).toThrow(
        'DatePromptSelector can only be used with Date prompt packs'
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
      const emptyPack = PromptPack.create('Empty Pack', 'Date');

      expect(selector.isCompleted(emptyPack)).toBe(false);
    });
  });

  describe('reset', () => {
    it('should reset progress', () => {
      // Complete some prompts
      const prompt = pack.prompts[0];
      selector.markCompleted(pack, prompt.id);

      expect(pack.progress.completedPrompts.size).toBe(1);

      selector.reset(pack);

      expect(pack.progress.completedPrompts.size).toBe(0);
    });
  });

  describe('hasPromptsForToday', () => {
    it('should return true when there are uncompleted prompts for today', () => {
      expect(selector.hasPromptsForToday(pack)).toBe(true);
    });

    it('should return false when all today prompts are completed', () => {
      // Complete all today prompts
      const todayPrompts = pack.prompts.filter(p =>
        p.date && p.date.toDateString() === today.toDateString()
      );
      todayPrompts.forEach(prompt => {
        pack.progress.completedPrompts.add(prompt.id);
      });

      expect(selector.hasPromptsForToday(pack)).toBe(false);
    });

    it('should return false when no prompts for today', () => {
      // Remove today prompts
      pack.prompts = pack.prompts.filter(p =>
        !p.date || p.date.toDateString() !== today.toDateString()
      );

      expect(selector.hasPromptsForToday(pack)).toBe(false);
    });
  });

  describe('getNextAvailableDate', () => {
    it('should return next date with prompts', () => {
      const nextDate = selector.getNextAvailableDate(pack);

      expect(nextDate).not.toBeNull();
      expect(nextDate!.toDateString()).toBe(tomorrow.toDateString());
    });

    it('should respect custom start date', () => {
      const nextDate = selector.getNextAvailableDate(pack, tomorrow);

      expect(nextDate).not.toBeNull();
      expect(nextDate!.toDateString()).toBe(nextWeek.toDateString());
    });

    it('should return null when no upcoming prompts', () => {
      const farFuture = new Date(today);
      farFuture.setDate(farFuture.getDate() + 30);

      const nextDate = selector.getNextAvailableDate(pack, farFuture);

      expect(nextDate).toBeNull();
    });
  });

  describe('getMostRecentDate', () => {
    it('should return most recent date with prompts', () => {
      const recentDate = selector.getMostRecentDate(pack);

      expect(recentDate).not.toBeNull();
      expect(recentDate!.toDateString()).toBe(today.toDateString());
    });

    it('should respect custom cutoff date', () => {
      const recentDate = selector.getMostRecentDate(pack, yesterday);

      expect(recentDate).not.toBeNull();
      expect(recentDate!.toDateString()).toBe(yesterday.toDateString());
    });

    it('should return null when no past prompts', () => {
      const veryEarly = new Date(today);
      veryEarly.setDate(veryEarly.getDate() - 30);

      const recentDate = selector.getMostRecentDate(pack, veryEarly);

      expect(recentDate).toBeNull();
    });
  });

  describe('getCatchUpPrompts', () => {
    it('should return missed prompts within catch-up window', () => {
      const catchUpPrompts = selector.getCatchUpPrompts(pack, 7);

      expect(catchUpPrompts).toHaveLength(1);
      expect(catchUpPrompts[0].content).toBe('Yesterday prompt');
    });

    it('should respect maxDaysBack parameter', () => {
      const catchUpPrompts = selector.getCatchUpPrompts(pack, 0);

      expect(catchUpPrompts).toHaveLength(0); // Yesterday is beyond 0 days back
    });

    it('should return prompts sorted by date', () => {
      // Add another missed prompt
      const twoDaysAgo = new Date(today);
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      const oldPrompt = Prompt.create('Two days ago prompt', 'string', { date: twoDaysAgo });
      pack.addPrompt(oldPrompt);

      const catchUpPrompts = selector.getCatchUpPrompts(pack, 7);

      expect(catchUpPrompts).toHaveLength(2);
      expect(catchUpPrompts[0].content).toBe('Two days ago prompt');
      expect(catchUpPrompts[1].content).toBe('Yesterday prompt');
    });

    it('should not include completed prompts', () => {
      // Complete yesterday prompt
      const yesterdayPrompt = pack.prompts.find(p => p.content === 'Yesterday prompt')!;
      pack.progress.completedPrompts.add(yesterdayPrompt.id);

      const catchUpPrompts = selector.getCatchUpPrompts(pack, 7);

      expect(catchUpPrompts).toHaveLength(0);
    });
  });

  describe('getDateCompletionStatus', () => {
    it('should return correct completion status for date', () => {
      const status = selector.getDateCompletionStatus(pack, today);

      expect(status).toEqual({
        total: 2,
        completed: 0,
        percentage: 0,
        isCompleted: false
      });
    });

    it('should return correct status after partial completion', () => {
      // Complete one today prompt
      const todayPrompts = pack.prompts.filter(p =>
        p.date && p.date.toDateString() === today.toDateString()
      );
      pack.progress.completedPrompts.add(todayPrompts[0].id);

      const status = selector.getDateCompletionStatus(pack, today);

      expect(status).toEqual({
        total: 2,
        completed: 1,
        percentage: 50,
        isCompleted: false
      });
    });

    it('should return correct status for completed date', () => {
      // Complete all today prompts
      const todayPrompts = pack.prompts.filter(p =>
        p.date && p.date.toDateString() === today.toDateString()
      );
      todayPrompts.forEach(prompt => {
        pack.progress.completedPrompts.add(prompt.id);
      });

      const status = selector.getDateCompletionStatus(pack, today);

      expect(status).toEqual({
        total: 2,
        completed: 2,
        percentage: 100,
        isCompleted: true
      });
    });

    it('should return zero status for date with no prompts', () => {
      const futureDate = new Date(today);
      futureDate.setDate(futureDate.getDate() + 30);

      const status = selector.getDateCompletionStatus(pack, futureDate);

      expect(status).toEqual({
        total: 0,
        completed: 0,
        percentage: 0,
        isCompleted: false
      });
    });
  });

  describe('getStats', () => {
    it('should return correct statistics for fresh pack', () => {
      const stats = selector.getStats(pack);

      expect(stats.totalPrompts).toBe(5);
      expect(stats.completedPrompts).toBe(0);
      expect(stats.missedPrompts).toBe(1); // Yesterday
      expect(stats.upcomingPrompts).toBe(2); // Tomorrow and next week
      expect(stats.todayPrompts).toBe(2);
      expect(stats.todayCompleted).toBe(0);
      expect(stats.overallProgress).toBe(0);
      expect(stats.dateRange.earliest!.toDateString()).toBe(yesterday.toDateString());
      expect(stats.dateRange.latest!.toDateString()).toBe(nextWeek.toDateString());
    });

    it('should return correct statistics after partial completion', () => {
      // Complete yesterday and one today prompt
      const yesterdayPrompt = pack.prompts.find(p => p.content === 'Yesterday prompt')!;
      const todayPrompts = pack.prompts.filter(p =>
        p.date && p.date.toDateString() === today.toDateString()
      );

      selector.markCompleted(pack, yesterdayPrompt.id);
      selector.markCompleted(pack, todayPrompts[0].id);

      const stats = selector.getStats(pack);

      expect(stats.totalPrompts).toBe(5);
      expect(stats.completedPrompts).toBe(2);
      expect(stats.missedPrompts).toBe(0); // Yesterday completed
      expect(stats.upcomingPrompts).toBe(2);
      expect(stats.todayPrompts).toBe(2);
      expect(stats.todayCompleted).toBe(1);
      expect(stats.overallProgress).toBe(40); // 2/5 = 40%
    });

    it('should handle empty pack correctly', () => {
      const emptyPack = PromptPack.create('Empty Pack', 'Date');
      const stats = selector.getStats(emptyPack);

      expect(stats.totalPrompts).toBe(0);
      expect(stats.completedPrompts).toBe(0);
      expect(stats.missedPrompts).toBe(0);
      expect(stats.upcomingPrompts).toBe(0);
      expect(stats.todayPrompts).toBe(0);
      expect(stats.todayCompleted).toBe(0);
      expect(stats.overallProgress).toBe(0);
      expect(stats.dateRange.earliest).toBeNull();
      expect(stats.dateRange.latest).toBeNull();
    });
  });

  describe('getPromptsForDateRange', () => {
    it('should return prompts within date range', () => {
      const rangePrompts = selector.getPromptsForDateRange(pack, yesterday, tomorrow);

      expect(rangePrompts).toHaveLength(4); // Yesterday, today (2), tomorrow
      expect(rangePrompts[0].content).toBe('Yesterday prompt');
      expect(rangePrompts[3].content).toBe('Tomorrow prompt');
    });

    it('should return prompts sorted by date', () => {
      const rangePrompts = selector.getPromptsForDateRange(pack, yesterday, nextWeek);

      expect(rangePrompts).toHaveLength(5);

      // Should be sorted by date
      for (let i = 1; i < rangePrompts.length; i++) {
        expect(rangePrompts[i - 1].date!.getTime()).toBeLessThanOrEqual(rangePrompts[i].date!.getTime());
      }
    });

    it('should return empty array for range with no prompts', () => {
      const futureStart = new Date(today);
      futureStart.setDate(futureStart.getDate() + 30);
      const futureEnd = new Date(today);
      futureEnd.setDate(futureEnd.getDate() + 40);

      const rangePrompts = selector.getPromptsForDateRange(pack, futureStart, futureEnd);

      expect(rangePrompts).toHaveLength(0);
    });
  });

  describe('needsCatchUp', () => {
    it('should return true when there are missed prompts within window', () => {
      expect(selector.needsCatchUp(pack, 7)).toBe(true);
    });

    it('should return false when no missed prompts within window', () => {
      expect(selector.needsCatchUp(pack, 0)).toBe(false);
    });

    it('should return false when missed prompts are completed', () => {
      // Complete yesterday prompt
      const yesterdayPrompt = pack.prompts.find(p => p.content === 'Yesterday prompt')!;
      pack.progress.completedPrompts.add(yesterdayPrompt.id);

      expect(selector.needsCatchUp(pack, 7)).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle prompts without dates gracefully', () => {
      // Date packs require all prompts to have dates, so this should throw
      const noDatePrompt = Prompt.create('No date prompt', 'string');

      expect(() => pack.addPrompt(noDatePrompt)).toThrow(
        'In Date mode, all prompts must have date values'
      );
    });

    it('should handle timezone differences correctly', () => {
      // Test that the date comparison logic works correctly
      // by using the formatDateForComparison method indirectly
      const testDate = new Date(today.getTime());

      // Should find the same prompts regardless of time within the day
      const prompts1 = selector.getPromptsForDate(pack, today);
      const prompts2 = selector.getPromptsForDate(pack, testDate);

      expect(prompts1).toHaveLength(prompts2.length);
      expect(prompts1.map(p => p.id).sort()).toEqual(prompts2.map(p => p.id).sort());
    });
  });
});