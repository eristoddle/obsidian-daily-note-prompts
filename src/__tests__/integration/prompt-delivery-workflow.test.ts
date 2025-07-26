/**
 * Integration tests for end-to-end prompt delivery workflow
 */

import { PromptService } from '../../prompt-service';
import { NotificationService } from '../../notification-service';
import { DailyNoteService } from '../../daily-note-service';
import { PromptPack, Prompt, PromptPackSettings, PromptProgress } from '../../models';
import { IProgressStore } from '../../interfaces';

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

  clear(): void {
    this.progressData.clear();
  }
}

// Mock plugin
const mockPlugin = {
  promptService: null as any,
  dailyNoteService: null as any,
  progressStore: null as any,
  settings: {
    getPromptPack: jest.fn()
  }
};

// Mock app
const mockApp = {
  vault: {
    read: jest.fn(),
    modify: jest.fn(),
    create: jest.fn(),
    getAbstractFileByPath: jest.fn(),
    createFolder: jest.fn()
  },
  workspace: {
    getLeaf: jest.fn(() => ({
      openFile: jest.fn()
    })),
    activeLeaf: {
      view: {
        file: null,
        editor: {
          getValue: jest.fn(),
          offsetToPos: jest.fn(),
          setCursor: jest.fn()
        }
      }
    },
    leftSplit: {
      collapsed: false,
      collapse: jest.fn(),
      expand: jest.fn()
    },
    rightSplit: {
      collapsed: false,
      collapse: jest.fn(),
      expand: jest.fn()
    }
  },
  plugins: {
    getPlugin: jest.fn(),
    plugins: {}
  }
};

const mockGlobalSettings = {
  defaultNotificationTime: '09:00',
  defaultZenMode: false,
  dailyNoteFolder: 'Daily Notes',
  dailyNoteTemplate: '# {{date:YYYY-MM-DD}}\n\n{{prompt}}\n\n## Notes\n',
  linkHandling: 'direct'
};

describe('Prompt Delivery Workflow Integration', () => {
  let promptService: PromptService;
  let notificationService: NotificationService;
  let dailyNoteService: DailyNoteService;
  let progressStore: MockProgressStore;
  let testPack: PromptPack;

  beforeEach(() => {
    jest.clearAllMocks();

    // Initialize services
    progressStore = new MockProgressStore();
    promptService = new PromptService(progressStore);
    dailyNoteService = new DailyNoteService(mockApp as any, mockGlobalSettings);

    // Set up plugin references
    mockPlugin.promptService = promptService;
    mockPlugin.dailyNoteService = dailyNoteService;
    mockPlugin.progressStore = progressStore;

    notificationService = new NotificationService(mockPlugin as any);

    // Create test pack
    testPack = new PromptPack({
      name: 'Integration Test Pack',
      type: 'Sequential',
      prompts: [
        new Prompt({ content: 'What are you grateful for today?', type: 'string', order: 1 }),
        new Prompt({ content: 'What did you learn yesterday?', type: 'string', order: 2 }),
        new Prompt({ content: '[[Daily Reflection]]', type: 'link', order: 3 })
      ],
      settings: new PromptPackSettings({
        notificationEnabled: true,
        notificationTime: '09:00',
        notificationType: 'obsidian',
        zenModeEnabled: true,
        dailyNoteIntegration: true
      })
    });

    promptService.loadPromptPacks([testPack]);
    mockPlugin.settings.getPromptPack.mockReturnValue(testPack);
  });

  afterEach(() => {
    notificationService.destroy();
    progressStore.clear();
  });

  describe('complete prompt delivery workflow', () => {
    it('should deliver prompt from notification to daily note', async () => {
      // Mock daily note file
      const mockDailyNoteFile = {
        path: 'Daily Notes/2024-01-15.md',
        name: '2024-01-15.md'
      };

      mockApp.vault.getAbstractFileByPath.mockReturnValue(null); // File doesn't exist
      mockApp.vault.create.mockResolvedValue(mockDailyNoteFile);
      mockApp.vault.read.mockResolvedValue('# 2024-01-15\n\n{{prompt}}\n\n## Notes\n');
      mockApp.vault.modify.mockResolvedValue(undefined);

      // Step 1: Get next prompt from service
      const nextPrompt = await promptService.getNextPrompt(testPack.id);
      expect(nextPrompt).not.toBeNull();
      expect(nextPrompt!.content).toBe('What are you grateful for today?');

      // Step 2: Show notification
      notificationService.showNotification(nextPrompt!, testPack);

      // Step 3: Simulate notification click - create/open daily note
      const dailyNoteFile = await dailyNoteService.createOrOpenDailyNote();
      expect(dailyNoteFile).toBe(mockDailyNoteFile);
      expect(mockApp.vault.create).toHaveBeenCalled();

      // Step 4: Insert prompt into daily note
      await dailyNoteService.insertPrompt(nextPrompt!, dailyNoteFile);
      expect(mockApp.vault.read).toHaveBeenCalledWith(mockDailyNoteFile);
      expect(mockApp.vault.modify).toHaveBeenCalledWith(
        mockDailyNoteFile,
        expect.stringContaining('What are you grateful for today?')
      );

      // Step 5: Enable zen mode if configured
      if (testPack.settings.zenModeEnabled) {
        dailyNoteService.enableZenMode();
        expect(mockApp.workspace.leftSplit.collapse).toHaveBeenCalled();
        expect(mockApp.workspace.rightSplit.collapse).toHaveBeenCalled();
      }

      // Step 6: Mark prompt as completed
      await promptService.markPromptCompleted(testPack.id, nextPrompt!.id);
      const progress = promptService.getProgress(testPack.id);
      expect(progress.completedPrompts.has(nextPrompt!.id)).toBe(true);
    });

    it('should handle sequential prompt progression', async () => {
      const mockDailyNoteFile = { path: 'Daily Notes/2024-01-15.md', name: '2024-01-15.md' };
      mockApp.vault.getAbstractFileByPath.mockReturnValue(mockDailyNoteFile);
      mockApp.vault.read.mockResolvedValue('# 2024-01-15\n\n{{prompt}}\n\n## Notes\n');
      mockApp.vault.modify.mockResolvedValue(undefined);

      // First prompt
      let nextPrompt = await promptService.getNextPrompt(testPack.id);
      expect(nextPrompt!.content).toBe('What are you grateful for today?');
      expect(nextPrompt!.order).toBe(1);

      await promptService.markPromptCompleted(testPack.id, nextPrompt!.id);

      // Second prompt
      nextPrompt = await promptService.getNextPrompt(testPack.id);
      expect(nextPrompt!.content).toBe('What did you learn yesterday?');
      expect(nextPrompt!.order).toBe(2);

      await promptService.markPromptCompleted(testPack.id, nextPrompt!.id);

      // Third prompt (link type)
      nextPrompt = await promptService.getNextPrompt(testPack.id);
      expect(nextPrompt!.content).toBe('[[Daily Reflection]]');
      expect(nextPrompt!.type).toBe('link');
      expect(nextPrompt!.order).toBe(3);

      // Insert link prompt with proper formatting
      await dailyNoteService.insertPrompt(nextPrompt!, mockDailyNoteFile);
      expect(mockApp.vault.modify).toHaveBeenCalledWith(
        mockDailyNoteFile,
        expect.stringContaining('[Daily Reflection](Daily Reflection)')
      );

      await promptService.markPromptCompleted(testPack.id, nextPrompt!.id);

      // Pack should be completed
      expect(promptService.isPackCompleted(testPack.id)).toBe(true);

      // No more prompts available
      const noMorePrompts = await promptService.getNextPrompt(testPack.id);
      expect(noMorePrompts).toBeNull();
    });

    it('should handle notification scheduling and delivery', async () => {
      // Mock time functions
      const mockSetTimeout = jest.fn();
      const mockClearTimeout = jest.fn();
      global.setTimeout = mockSetTimeout as any;
      global.clearTimeout = mockClearTimeout as any;

      // Schedule notification
      notificationService.scheduleNotification(testPack);
      expect(mockSetTimeout).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Number)
      );

      // Simulate notification firing
      const notificationCallback = mockSetTimeout.mock.calls[0][0];
      const nextPrompt = await promptService.getNextPrompt(testPack.id);

      // Mock the notification callback execution
      jest.spyOn(promptService, 'getNextPrompt').mockResolvedValue(nextPrompt);

      // Execute notification callback
      await notificationCallback();

      // Should reschedule for next day
      expect(mockSetTimeout).toHaveBeenCalledTimes(2); // Initial + reschedule
    });

    it('should handle errors gracefully in workflow', async () => {
      // Mock file creation failure
      mockApp.vault.create.mockRejectedValue(new Error('File creation failed'));
      mockApp.vault.getAbstractFileByPath.mockReturnValue(null);

      const nextPrompt = await promptService.getNextPrompt(testPack.id);
      expect(nextPrompt).not.toBeNull();

      // Should handle daily note creation error
      await expect(dailyNoteService.createOrOpenDailyNote())
        .rejects.toThrow('Unable to create daily note');

      // Prompt should still be available (not marked as completed)
      const samePrompt = await promptService.getNextPrompt(testPack.id);
      expect(samePrompt!.id).toBe(nextPrompt!.id);
    });
  });

  describe('different pack types integration', () => {
    it('should handle Random pack workflow', async () => {
      const randomPack = new PromptPack({
        name: 'Random Test Pack',
        type: 'Random',
        prompts: [
          new Prompt({ content: 'Random prompt 1', type: 'string' }),
          new Prompt({ content: 'Random prompt 2', type: 'string' }),
          new Prompt({ content: 'Random prompt 3', type: 'string' })
        ],
        settings: new PromptPackSettings({
          notificationEnabled: true,
          notificationTime: '14:00',
          notificationType: 'obsidian'
        })
      });

      promptService.loadPromptPacks([randomPack]);

      const selectedPrompts = new Set<string>();

      // Get multiple prompts to verify randomness
      for (let i = 0; i < 3; i++) {
        const nextPrompt = await promptService.getNextPrompt(randomPack.id);
        expect(nextPrompt).not.toBeNull();
        expect(randomPack.prompts.some(p => p.id === nextPrompt!.id)).toBe(true);

        selectedPrompts.add(nextPrompt!.id);
        await promptService.markPromptCompleted(randomPack.id, nextPrompt!.id);
      }

      // Should have selected all prompts exactly once
      expect(selectedPrompts.size).toBe(3);
      expect(promptService.isPackCompleted(randomPack.id)).toBe(true);
    });

    it('should handle Date pack workflow', async () => {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const datePack = new PromptPack({
        name: 'Date Test Pack',
        type: 'Date',
        prompts: [
          new Prompt({ content: 'Yesterday prompt', type: 'string', date: yesterday }),
          new Prompt({ content: 'Today prompt', type: 'string', date: today }),
          new Prompt({ content: 'Tomorrow prompt', type: 'string', date: tomorrow })
        ],
        settings: new PromptPackSettings({
          notificationEnabled: true,
          notificationTime: '09:00'
        })
      });

      promptService.loadPromptPacks([datePack]);

      // Should get today's prompt
      const todayPrompt = await promptService.getNextPrompt(datePack.id);
      expect(todayPrompt).not.toBeNull();
      expect(todayPrompt!.content).toBe('Today prompt');

      // Check missed prompts
      const missedPrompts = promptService.getMissedPrompts(datePack.id);
      expect(missedPrompts).toHaveLength(1);
      expect(missedPrompts[0].content).toBe('Yesterday prompt');

      // Check upcoming prompts
      const upcomingPrompts = promptService.getUpcomingPrompts(datePack.id);
      expect(upcomingPrompts).toHaveLength(1);
      expect(upcomingPrompts[0].content).toBe('Tomorrow prompt');
    });
  });

  describe('progress persistence integration', () => {
    it('should persist progress across service restarts', async () => {
      // Complete first prompt
      const firstPrompt = await promptService.getNextPrompt(testPack.id);
      await promptService.markPromptCompleted(testPack.id, firstPrompt!.id);

      // Verify progress is stored
      const storedProgress = progressStore.getProgress(testPack.id);
      expect(storedProgress.completedPrompts.has(firstPrompt!.id)).toBe(true);

      // Simulate service restart by creating new service with same store
      const newPromptService = new PromptService(progressStore);
      newPromptService.loadPromptPacks([testPack]);

      // Progress should be restored
      const restoredProgress = newPromptService.getProgress(testPack.id);
      expect(restoredProgress.completedPrompts.has(firstPrompt!.id)).toBe(true);

      // Next prompt should be the second one
      const nextPrompt = await newPromptService.getNextPrompt(testPack.id);
      expect(nextPrompt!.content).toBe('What did you learn yesterday?');
      expect(nextPrompt!.order).toBe(2);
    });

    it('should handle progress reset workflow', async () => {
      // Complete some prompts
      const firstPrompt = await promptService.getNextPrompt(testPack.id);
      await promptService.markPromptCompleted(testPack.id, firstPrompt!.id);

      const secondPrompt = await promptService.getNextPrompt(testPack.id);
      await promptService.markPromptCompleted(testPack.id, secondPrompt!.id);

      expect(promptService.getProgress(testPack.id).completedPrompts.size).toBe(2);

      // Reset progress
      await promptService.resetProgress(testPack.id);

      // Progress should be cleared
      expect(promptService.getProgress(testPack.id).completedPrompts.size).toBe(0);

      // Should start from first prompt again
      const resetPrompt = await promptService.getNextPrompt(testPack.id);
      expect(resetPrompt!.content).toBe('What are you grateful for today?');
      expect(resetPrompt!.order).toBe(1);
    });
  });

  describe('notification and daily note integration', () => {
    it('should integrate notification click with daily note creation', async () => {
      const mockDailyNoteFile = { path: 'Daily Notes/2024-01-15.md', name: '2024-01-15.md' };
      mockApp.vault.getAbstractFileByPath.mockReturnValue(null);
      mockApp.vault.create.mockResolvedValue(mockDailyNoteFile);
      mockApp.vault.read.mockResolvedValue('# 2024-01-15\n\n{{prompt}}\n\n## Notes\n');
      mockApp.vault.modify.mockResolvedValue(undefined);

      const nextPrompt = await promptService.getNextPrompt(testPack.id);

      // Show notification (this would normally be triggered by scheduler)
      notificationService.showNotification(nextPrompt!, testPack);

      // Simulate the workflow that happens on notification click
      const dailyNoteFile = await dailyNoteService.createOrOpenDailyNote();
      await dailyNoteService.insertPrompt(nextPrompt!, dailyNoteFile);

      if (testPack.settings.zenModeEnabled) {
        dailyNoteService.enableZenMode();
      }

      // Verify the complete workflow
      expect(mockApp.vault.create).toHaveBeenCalledWith(
        'Daily Notes/2024-01-15.md',
        expect.stringContaining('# 2024-01-15')
      );
      expect(mockApp.vault.modify).toHaveBeenCalledWith(
        mockDailyNoteFile,
        expect.stringContaining('What are you grateful for today?')
      );
      expect(mockApp.workspace.leftSplit.collapse).toHaveBeenCalled();
    });

    it('should handle different prompt types in daily notes', async () => {
      const mockDailyNoteFile = { path: 'Daily Notes/2024-01-15.md', name: '2024-01-15.md' };
      mockApp.vault.getAbstractFileByPath.mockReturnValue(mockDailyNoteFile);
      mockApp.vault.read.mockResolvedValue('# 2024-01-15\n\n{{prompt}}\n\n## Notes\n');
      mockApp.vault.modify.mockResolvedValue(undefined);

      // Test string prompt
      const stringPrompt = await promptService.getNextPrompt(testPack.id);
      await dailyNoteService.insertPrompt(stringPrompt!, mockDailyNoteFile);
      expect(mockApp.vault.modify).toHaveBeenCalledWith(
        mockDailyNoteFile,
        expect.stringContaining('What are you grateful for today?')
      );

      await promptService.markPromptCompleted(testPack.id, stringPrompt!.id);
      mockApp.vault.modify.mockClear();

      // Skip to link prompt
      const secondPrompt = await promptService.getNextPrompt(testPack.id);
      await promptService.markPromptCompleted(testPack.id, secondPrompt!.id);

      const linkPrompt = await promptService.getNextPrompt(testPack.id);
      await dailyNoteService.insertPrompt(linkPrompt!, mockDailyNoteFile);
      expect(mockApp.vault.modify).toHaveBeenCalledWith(
        mockDailyNoteFile,
        expect.stringContaining('[Daily Reflection](Daily Reflection)')
      );
    });
  });

  describe('error recovery integration', () => {
    it('should recover from daily note creation failures', async () => {
      // First attempt fails
      mockApp.vault.create.mockRejectedValueOnce(new Error('Creation failed'));

      // Second attempt succeeds
      const mockDailyNoteFile = { path: 'Daily Notes/2024-01-15.md', name: '2024-01-15.md' };
      mockApp.vault.create.mockResolvedValueOnce(mockDailyNoteFile);
      mockApp.vault.getAbstractFileByPath.mockReturnValue(null);

      // Should retry and succeed
      const result = await dailyNoteService.createOrOpenDailyNote();
      expect(result).toBe(mockDailyNoteFile);
      expect(mockApp.vault.create).toHaveBeenCalledTimes(2);
    });

    it('should handle notification permission failures gracefully', async () => {
      // Mock notification permission denied
      Object.defineProperty(global.Notification, 'permission', {
        value: 'denied',
        writable: true
      });

      const nextPrompt = await promptService.getNextPrompt(testPack.id);

      // Should fallback to Obsidian notifications
      expect(() => {
        notificationService.showNotification(nextPrompt!, testPack);
      }).not.toThrow();
    });
  });

  describe('multi-pack workflow integration', () => {
    it('should handle multiple packs with different schedules', async () => {
      const morningPack = new PromptPack({
        name: 'Morning Pack',
        type: 'Sequential',
        prompts: [new Prompt({ content: 'Morning prompt', type: 'string', order: 1 })],
        settings: new PromptPackSettings({
          notificationEnabled: true,
          notificationTime: '09:00'
        })
      });

      const eveningPack = new PromptPack({
        name: 'Evening Pack',
        type: 'Sequential',
        prompts: [new Prompt({ content: 'Evening prompt', type: 'string', order: 1 })],
        settings: new PromptPackSettings({
          notificationEnabled: true,
          notificationTime: '18:00'
        })
      });

      promptService.loadPromptPacks([morningPack, eveningPack]);

      // Both packs should be available
      const morningPrompt = await promptService.getNextPrompt(morningPack.id);
      const eveningPrompt = await promptService.getNextPrompt(eveningPack.id);

      expect(morningPrompt!.content).toBe('Morning prompt');
      expect(eveningPrompt!.content).toBe('Evening prompt');

      // Should be able to schedule notifications for both
      const mockSetTimeout = jest.fn();
      global.setTimeout = mockSetTimeout as any;

      notificationService.scheduleNotification(morningPack);
      notificationService.scheduleNotification(eveningPack);

      expect(mockSetTimeout).toHaveBeenCalledTimes(2);
      expect(notificationService.getScheduledNotifications()).toHaveLength(2);
    });
  });
});