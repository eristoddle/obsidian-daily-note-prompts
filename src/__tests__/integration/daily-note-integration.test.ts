/**
 * Integration tests for daily note integration
 */

import { DailyNoteService } from '../../daily-note-service';
import { Prompt, GlobalSettings } from '../../types';

// Mock Obsidian API
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

describe('Daily Note Integration', () => {
  let dailyNoteService: DailyNoteService;
  let globalSettings: GlobalSettings;

  beforeEach(() => {
    jest.clearAllMocks();

    globalSettings = {
      defaultNotificationTime: '09:00',
      defaultZenMode: false,
      dailyNoteFolder: 'Daily Notes',
      dailyNoteTemplate: '# {{date:YYYY-MM-DD}}\n\n## Daily Prompt\n{{prompt}}\n\n## Notes\n',
      linkHandling: 'direct'
    };

    dailyNoteService = new DailyNoteService(mockApp as any, globalSettings);
  });

  describe('daily note creation workflow', () => {
    it('should create daily note with template when none exists', async () => {
      const testDate = new Date('2024-01-15T12:00:00Z');
      const expectedPath = 'Daily Notes/2024-01-15.md';

      mockApp.vault.getAbstractFileByPath
        .mockReturnValueOnce(null) // Folder check
        .mockReturnValueOnce(null); // File check

      mockApp.vault.createFolder.mockResolvedValue(undefined);

      const mockFile = { path: expectedPath, name: '2024-01-15.md' };
      mockApp.vault.create.mockResolvedValue(mockFile);

      const result = await dailyNoteService.createOrOpenDailyNote(testDate);

      expect(mockApp.vault.createFolder).toHaveBeenCalledWith('Daily Notes');
      expect(mockApp.vault.create).toHaveBeenCalledWith(
        expectedPath,
        expect.stringContaining('# 2024-01-15')
      );
      expect(result).toBe(mockFile);
    });

    it('should return existing daily note when it exists', async () => {
      const testDate = new Date('2024-01-15T12:00:00Z');
      const existingFile = { path: 'Daily Notes/2024-01-15.md', name: '2024-01-15.md' };

      mockApp.vault.getAbstractFileByPath
        .mockReturnValueOnce({ path: 'Daily Notes' }) // Folder exists
        .mockReturnValueOnce(existingFile); // File exists

      const result = await dailyNoteService.createOrOpenDailyNote(testDate);

      expect(mockApp.vault.create).not.toHaveBeenCalled();
      expect(result).toBe(existingFile);
    });

    it('should integrate with daily notes plugin when available', async () => {
      const testDate = new Date('2024-01-15T12:00:00Z');
      const mockDailyNotesPlugin = {
        getDailyNote: jest.fn().mockReturnValue({ path: 'daily-notes/2024-01-15.md' }),
        getAllDailyNotes: jest.fn().mockReturnValue([])
      };

      mockApp.plugins.getPlugin.mockReturnValue(mockDailyNotesPlugin);

      const result = await dailyNoteService.createOrOpenDailyNote(testDate);

      expect(mockDailyNotesPlugin.getDailyNote).toHaveBeenCalled();
      expect(result.path).toBe('daily-notes/2024-01-15.md');
    });

    it('should fallback to manual creation when plugin fails', async () => {
      const testDate = new Date('2024-01-15T12:00:00Z');
      const mockDailyNotesPlugin = {
        getDailyNote: jest.fn().mockImplementation(() => {
          throw new Error('Plugin error');
        })
      };

      mockApp.plugins.getPlugin.mockReturnValue(mockDailyNotesPlugin);
      mockApp.vault.getAbstractFileByPath.mockReturnValue(null);

      const mockFile = { path: 'Daily Notes/2024-01-15.md', name: '2024-01-15.md' };
      mockApp.vault.create.mockResolvedValue(mockFile);

      const result = await dailyNoteService.createOrOpenDailyNote(testDate);

      expect(mockApp.vault.create).toHaveBeenCalled();
      expect(result).toBe(mockFile);
    });
  });

  describe('prompt insertion workflow', () => {
    const mockFile = { path: 'Daily Notes/2024-01-15.md', name: '2024-01-15.md' };

    it('should insert string prompt with template replacement', async () => {
      const prompt: Prompt = {
        id: 'test-prompt',
        content: 'What are you grateful for today?',
        type: 'string'
      };

      const existingContent = '# 2024-01-15\n\n## Daily Prompt\n{{prompt}}\n\n## Notes\n';
      mockApp.vault.read.mockResolvedValue(existingContent);
      mockApp.vault.modify.mockResolvedValue(undefined);

      await dailyNoteService.insertPrompt(prompt, mockFile);

      expect(mockApp.vault.read).toHaveBeenCalledWith(mockFile);
      expect(mockApp.vault.modify).toHaveBeenCalledWith(
        mockFile,
        expect.stringContaining('What are you grateful for today?')
      );
      expect(mockApp.workspace.getLeaf().openFile).toHaveBeenCalledWith(mockFile);
    });

    it('should insert link prompt with different link handling modes', async () => {
      const linkPrompt: Prompt = {
        id: 'link-prompt',
        content: 'Daily Reflection',
        type: 'link'
      };

      const existingContent = '# 2024-01-15\n\n## Daily Prompt\n{{prompt}}\n\n## Notes\n';
      mockApp.vault.read.mockResolvedValue(existingContent);
      mockApp.vault.modify.mockResolvedValue(undefined);

      // Test direct link handling
      globalSettings.linkHandling = 'direct';
      dailyNoteService.updateGlobalSettings(globalSettings);
      await dailyNoteService.insertPrompt(linkPrompt, mockFile);
      expect(mockApp.vault.modify).toHaveBeenCalledWith(
        mockFile,
        expect.stringContaining('[Daily Reflection](Daily Reflection)')
      );

      // Test embed link handling
      globalSettings.linkHandling = 'embed';
      dailyNoteService.updateGlobalSettings(globalSettings);
      await dailyNoteService.insertPrompt(linkPrompt, mockFile);
      expect(mockApp.vault.modify).toHaveBeenCalledWith(
        mockFile,
        expect.stringContaining('![[Daily Reflection]]')
      );

      // Test reference link handling
      globalSettings.linkHandling = 'reference';
      dailyNoteService.updateGlobalSettings(globalSettings);
      await dailyNoteService.insertPrompt(linkPrompt, mockFile);
      expect(mockApp.vault.modify).toHaveBeenCalledWith(
        mockFile,
        expect.stringContaining('[[Daily Reflection]]')
      );
    });

    it('should insert markdown prompt with proper formatting', async () => {
      const markdownPrompt: Prompt = {
        id: 'markdown-prompt',
        content: '**Reflection Question:**\n\nWhat *three things* went well today?\n\n- Thing 1\n- Thing 2\n- Thing 3',
        type: 'markdown'
      };

      const existingContent = '# 2024-01-15\n\n## Daily Prompt\n{{prompt}}\n\n## Notes\n';
      mockApp.vault.read.mockResolvedValue(existingContent);
      mockApp.vault.modify.mockResolvedValue(undefined);

      await dailyNoteService.insertPrompt(markdownPrompt, mockFile);

      expect(mockApp.vault.modify).toHaveBeenCalledWith(
        mockFile,
        expect.stringContaining('**Reflection Question:**')
      );
      expect(mockApp.vault.modify).toHaveBeenCalledWith(
        mockFile,
        expect.stringContaining('What *three things* went well today?')
      );
      expect(mockApp.vault.modify).toHaveBeenCalledWith(
        mockFile,
        expect.stringContaining('- Thing 1')
      );
    });

    it('should handle missing template placeholder gracefully', async () => {
      const prompt: Prompt = {
        id: 'test-prompt',
        content: 'What are you grateful for today?',
        type: 'string'
      };

      // Content without {{prompt}} placeholder
      const existingContent = '# 2024-01-15\n\nSome existing content\n\n## Notes\n';
      mockApp.vault.read.mockResolvedValue(existingContent);
      mockApp.vault.modify.mockResolvedValue(undefined);

      await dailyNoteService.insertPrompt(prompt, mockFile);

      expect(mockApp.vault.modify).toHaveBeenCalledWith(
        mockFile,
        expect.stringContaining('## Daily Prompt')
      );
      expect(mockApp.vault.modify).toHaveBeenCalledWith(
        mockFile,
        expect.stringContaining('What are you grateful for today?')
      );
    });

    it('should preserve existing content when inserting prompt', async () => {
      const prompt: Prompt = {
        id: 'test-prompt',
        content: 'New prompt content',
        type: 'string'
      };

      const existingContent = '# 2024-01-15\n\nExisting content\n\n{{prompt}}\n\nMore content\n';
      mockApp.vault.read.mockResolvedValue(existingContent);
      mockApp.vault.modify.mockResolvedValue(undefined);

      await dailyNoteService.insertPrompt(prompt, mockFile);

      const modifiedContent = mockApp.vault.modify.mock.calls[0][1];
      expect(modifiedContent).toContain('Existing content');
      expect(modifiedContent).toContain('More content');
      expect(modifiedContent).toContain('New prompt content');
      expect(modifiedContent).not.toContain('{{prompt}}');
    });
  });

  describe('zen mode integration', () => {
    it('should enable zen mode and hide UI elements', () => {
      expect(dailyNoteService.isZenModeActive()).toBe(false);

      dailyNoteService.enableZenMode();

      expect(dailyNoteService.isZenModeActive()).toBe(true);
      expect(mockApp.workspace.leftSplit.collapse).toHaveBeenCalled();
      expect(mockApp.workspace.rightSplit.collapse).toHaveBeenCalled();
    });

    it('should disable zen mode and restore UI elements', () => {
      // First enable zen mode
      dailyNoteService.enableZenMode();
      expect(dailyNoteService.isZenModeActive()).toBe(true);

      // Then disable it
      dailyNoteService.disableZenMode();

      expect(dailyNoteService.isZenModeActive()).toBe(false);
      expect(mockApp.workspace.leftSplit.expand).toHaveBeenCalled();
      expect(mockApp.workspace.rightSplit.expand).toHaveBeenCalled();
    });

    it('should handle zen mode errors gracefully', () => {
      mockApp.workspace.leftSplit.collapse.mockImplementation(() => {
        throw new Error('Collapse error');
      });

      // Should not throw
      expect(() => dailyNoteService.enableZenMode()).not.toThrow();

      // Should still track state correctly
      expect(dailyNoteService.isZenModeActive()).toBe(true);
    });

    it('should not enable zen mode if already active', () => {
      dailyNoteService.enableZenMode();
      jest.clearAllMocks();

      dailyNoteService.enableZenMode();

      expect(mockApp.workspace.leftSplit.collapse).not.toHaveBeenCalled();
      expect(mockApp.workspace.rightSplit.collapse).not.toHaveBeenCalled();
    });
  });

  describe('template processing integration', () => {
    it('should process date templates correctly', async () => {
      const testDate = new Date('2024-01-15T12:00:00Z');
      globalSettings.dailyNoteTemplate = '# {{date:YYYY-MM-DD}}\n\n**Day:** {{date:dddd}}\n**Month:** {{date:MMMM}}\n\n{{prompt}}';

      mockApp.vault.getAbstractFileByPath.mockReturnValue(null);
      mockApp.vault.create.mockResolvedValue({ path: 'test.md' });

      await dailyNoteService.createOrOpenDailyNote(testDate);

      const createdContent = mockApp.vault.create.mock.calls[0][1];
      expect(createdContent).toContain('# 2024-01-15');
      expect(createdContent).toContain('**Day:** Monday');
      expect(createdContent).toContain('**Month:** January');
    });

    it('should handle custom template variables', async () => {
      const testDate = new Date('2024-01-15T12:00:00Z');
      globalSettings.dailyNoteTemplate = '# Daily Note for {{date:MMMM Do, YYYY}}\n\n{{prompt}}\n\n---\nCreated: {{date:HH:mm}}';

      mockApp.vault.getAbstractFileByPath.mockReturnValue(null);
      mockApp.vault.create.mockResolvedValue({ path: 'test.md' });

      await dailyNoteService.createOrOpenDailyNote(testDate);

      const createdContent = mockApp.vault.create.mock.calls[0][1];
      expect(createdContent).toContain('# Daily Note for January 15th, 2024');
      expect(createdContent).toContain('Created: 12:00');
    });

    it('should handle empty daily note folder setting', async () => {
      const testDate = new Date('2024-01-15T12:00:00Z');
      globalSettings.dailyNoteFolder = '';

      mockApp.vault.getAbstractFileByPath.mockReturnValue(null);
      mockApp.vault.create.mockResolvedValue({ path: '2024-01-15.md' });

      await dailyNoteService.createOrOpenDailyNote(testDate);

      expect(mockApp.vault.create).toHaveBeenCalledWith(
        '2024-01-15.md',
        expect.any(String)
      );
      expect(mockApp.vault.createFolder).not.toHaveBeenCalled();
    });
  });

  describe('error handling integration', () => {
    it('should handle vault creation errors with fallback', async () => {
      const testDate = new Date('2024-01-15T12:00:00Z');
      mockApp.vault.getAbstractFileByPath.mockReturnValue(null);
      mockApp.vault.create
        .mockRejectedValueOnce(new Error('Creation failed'))
        .mockResolvedValueOnce({ path: 'Daily Notes/2024-01-15.md' });

      const result = await dailyNoteService.createOrOpenDailyNote(testDate);

      expect(result.path).toBe('Daily Notes/2024-01-15.md');
      expect(mockApp.vault.create).toHaveBeenCalledTimes(2);
    });

    it('should handle existing file error during creation', async () => {
      const testDate = new Date('2024-01-15T12:00:00Z');
      const existingFile = { path: 'Daily Notes/2024-01-15.md' };

      mockApp.vault.getAbstractFileByPath
        .mockReturnValueOnce(null) // First check returns null
        .mockReturnValueOnce(existingFile); // Second check returns file
      mockApp.vault.create.mockRejectedValue(new Error('File already exists'));

      const result = await dailyNoteService.createOrOpenDailyNote(testDate);

      expect(result).toBe(existingFile);
    });

    it('should handle prompt insertion errors gracefully', async () => {
      const prompt: Prompt = {
        id: 'test-prompt',
        content: 'Test prompt',
        type: 'string'
      };

      const mockFile = { path: 'test.md', name: 'test.md' };
      mockApp.vault.read.mockRejectedValue(new Error('Read error'));

      await expect(dailyNoteService.insertPrompt(prompt, mockFile))
        .rejects.toThrow('Failed to insert prompt');
    });
  });

  describe('multi-day workflow integration', () => {
    it('should handle multiple days correctly', async () => {
      const dates = [
        new Date('2024-01-15T12:00:00Z'),
        new Date('2024-01-16T12:00:00Z'),
        new Date('2024-01-17T12:00:00Z')
      ];

      const expectedFiles = dates.map(date => ({
        path: `Daily Notes/2024-01-${String(date.getDate()).padStart(2, '0')}.md`,
        name: `2024-01-${String(date.getDate()).padStart(2, '0')}.md`
      }));

      mockApp.vault.getAbstractFileByPath.mockReturnValue(null);
      mockApp.vault.create
        .mockResolvedValueOnce(expectedFiles[0])
        .mockResolvedValueOnce(expectedFiles[1])
        .mockResolvedValueOnce(expectedFiles[2]);

      const results = await Promise.all(
        dates.map(date => dailyNoteService.createOrOpenDailyNote(date))
      );

      expect(results).toHaveLength(3);
      expect(results[0].path).toBe('Daily Notes/2024-01-15.md');
      expect(results[1].path).toBe('Daily Notes/2024-01-16.md');
      expect(results[2].path).toBe('Daily Notes/2024-01-17.md');
    });

    it('should handle prompts across multiple days', async () => {
      const prompts = [
        { id: '1', content: 'Day 1 prompt', type: 'string' as const },
        { id: '2', content: 'Day 2 prompt', type: 'string' as const },
        { id: '3', content: 'Day 3 prompt', type: 'string' as const }
      ];

      const files = [
        { path: 'Daily Notes/2024-01-15.md', name: '2024-01-15.md' },
        { path: 'Daily Notes/2024-01-16.md', name: '2024-01-16.md' },
        { path: 'Daily Notes/2024-01-17.md', name: '2024-01-17.md' }
      ];

      mockApp.vault.read.mockResolvedValue('# Date\n\n{{prompt}}\n\n## Notes\n');
      mockApp.vault.modify.mockResolvedValue(undefined);

      for (let i = 0; i < prompts.length; i++) {
        await dailyNoteService.insertPrompt(prompts[i], files[i]);

        expect(mockApp.vault.modify).toHaveBeenCalledWith(
          files[i],
          expect.stringContaining(prompts[i].content)
        );
      }

      expect(mockApp.vault.modify).toHaveBeenCalledTimes(3);
    });
  });

  describe('settings integration', () => {
    it('should update behavior when global settings change', async () => {
      const testDate = new Date('2024-01-15T12:00:00Z');

      // Initial settings
      mockApp.vault.getAbstractFileByPath.mockReturnValue(null);
      mockApp.vault.create.mockResolvedValue({ path: 'Daily Notes/2024-01-15.md' });

      await dailyNoteService.createOrOpenDailyNote(testDate);
      expect(mockApp.vault.create).toHaveBeenCalledWith(
        'Daily Notes/2024-01-15.md',
        expect.any(String)
      );

      // Update settings
      const newSettings: GlobalSettings = {
        ...globalSettings,
        dailyNoteFolder: 'Journal',
        dailyNoteTemplate: '# Journal Entry {{date:YYYY-MM-DD}}\n\n{{prompt}}'
      };

      dailyNoteService.updateGlobalSettings(newSettings);

      // Create another note with new settings
      mockApp.vault.create.mockResolvedValue({ path: 'Journal/2024-01-16.md' });

      const nextDate = new Date('2024-01-16T12:00:00Z');
      await dailyNoteService.createOrOpenDailyNote(nextDate);

      expect(mockApp.vault.create).toHaveBeenCalledWith(
        'Journal/2024-01-16.md',
        expect.stringContaining('# Journal Entry 2024-01-16')
      );
    });

    it('should handle link handling setting changes', async () => {
      const linkPrompt: Prompt = {
        id: 'link-prompt',
        content: 'Reference Note',
        type: 'link'
      };

      const mockFile = { path: 'test.md', name: 'test.md' };
      mockApp.vault.read.mockResolvedValue('{{prompt}}');
      mockApp.vault.modify.mockResolvedValue(undefined);

      // Test each link handling mode
      const modes: Array<'direct' | 'embed' | 'reference'> = ['direct', 'embed', 'reference'];
      const expectedFormats = [
        '[Reference Note](Reference Note)',
        '![[Reference Note]]',
        '[[Reference Note]]'
      ];

      for (let i = 0; i < modes.length; i++) {
        globalSettings.linkHandling = modes[i];
        dailyNoteService.updateGlobalSettings(globalSettings);

        await dailyNoteService.insertPrompt(linkPrompt, mockFile);

        expect(mockApp.vault.modify).toHaveBeenCalledWith(
          mockFile,
          expect.stringContaining(expectedFormats[i])
        );

        mockApp.vault.modify.mockClear();
      }
    });
  });
});