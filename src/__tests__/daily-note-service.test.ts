/**
 * Unit tests for DailyNoteService
 */

// Mock Obsidian API functions before importing
jest.mock('obsidian', () => ({
  normalizePath: jest.fn((path: string) => path),
  moment: jest.fn((date: Date) => ({
    format: jest.fn(() => '2024-01-15'),
    toDate: jest.fn(() => date)
  })),
  TFile: class MockTFile {
    constructor(public path: string, public name: string, public extension: string) {}
  }
}));

// Mock DOM APIs
const mockDocument = {
  body: {
    className: '',
    classList: {
      add: jest.fn(),
      remove: jest.fn(),
      contains: jest.fn().mockReturnValue(false)
    }
  },
  getElementById: jest.fn(),
  createElement: jest.fn(() => ({
    id: '',
    textContent: '',
    remove: jest.fn()
  })),
  head: {
    appendChild: jest.fn()
  }
};

// @ts-ignore
global.document = mockDocument;

import { DailyNoteService } from '../daily-note-service';
import { Prompt, GlobalSettings } from '../types';

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
        file: null as any,
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

const mockTFile = {
  path: '2024-01-15.md',
  name: '2024-01-15.md',
  extension: 'md',
  basename: '2024-01-15',
  stat: { ctime: 0, mtime: 0, size: 0 },
  vault: null as any,
  parent: null as any
} as any;

describe('DailyNoteService', () => {
  let service: DailyNoteService;
  let globalSettings: GlobalSettings;

  beforeEach(() => {
    globalSettings = {
      defaultNotificationTime: '09:00',
      defaultZenMode: false,
      dailyNoteFolder: 'Daily Notes',
      dailyNoteTemplate: '# {{date:YYYY-MM-DD}}\n\n{{prompt}}\n\n## Notes\n',
      linkHandling: 'direct'
    };

    service = new DailyNoteService(mockApp as any, globalSettings);

    // Reset mocks
    jest.clearAllMocks();

    // Reset DOM
    document.body.className = '';
    const existingStyle = document.getElementById('daily-prompts-zen-mode-styles');
    if (existingStyle) {
      existingStyle.remove();
    }
  });

  describe('createOrOpenDailyNote', () => {
    it('should create a new daily note when none exists', async () => {
      const testDate = new Date('2024-01-15');
      mockApp.vault.getAbstractFileByPath.mockReturnValue(null);
      mockApp.vault.create.mockResolvedValue(mockTFile);

      const result = await service.createOrOpenDailyNote(testDate);

      expect(result).toBe(mockTFile);
      expect(mockApp.vault.create).toHaveBeenCalledWith(
        'Daily Notes/2024-01-15.md',
        expect.stringContaining('# 2024-01-15')
      );
    });

    it('should return existing daily note if it exists', async () => {
      const testDate = new Date('2024-01-15');
      mockApp.vault.getAbstractFileByPath.mockReturnValue(mockTFile);

      const result = await service.createOrOpenDailyNote(testDate);

      expect(result).toBe(mockTFile);
      expect(mockApp.vault.create).not.toHaveBeenCalled();
    });

    it('should use current date when no date provided', async () => {
      const today = new Date();
      const expectedFileName = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}.md`;

      mockApp.vault.getAbstractFileByPath.mockReturnValue(null);
      mockApp.vault.create.mockResolvedValue(mockTFile);

      await service.createOrOpenDailyNote();

      expect(mockApp.vault.create).toHaveBeenCalledWith(
        `Daily Notes/${expectedFileName}`,
        expect.any(String)
      );
    });

    it('should handle daily notes plugin integration', async () => {
      const testDate = new Date('2024-01-15');
      const mockDailyNotesPlugin = {
        getDailyNote: jest.fn().mockReturnValue(mockTFile),
        getAllDailyNotes: jest.fn().mockReturnValue([])
      };

      mockApp.plugins.getPlugin.mockReturnValue(mockDailyNotesPlugin);

      const result = await service.createOrOpenDailyNote(testDate);

      expect(result).toBe(mockTFile);
      expect(mockDailyNotesPlugin.getDailyNote).toHaveBeenCalled();
    });

    it('should fallback to manual creation when plugin fails', async () => {
      const testDate = new Date('2024-01-15');
      const mockDailyNotesPlugin = {
        getDailyNote: jest.fn().mockImplementation(() => {
          throw new Error('Plugin error');
        })
      };

      mockApp.plugins.getPlugin.mockReturnValue(mockDailyNotesPlugin);
      mockApp.vault.getAbstractFileByPath.mockReturnValue(null);
      mockApp.vault.create.mockResolvedValue(mockTFile);

      const result = await service.createOrOpenDailyNote(testDate);

      expect(result).toBe(mockTFile);
      expect(mockApp.vault.create).toHaveBeenCalled();
    });

    it('should create folder if it does not exist', async () => {
      const testDate = new Date('2024-01-15');
      mockApp.vault.getAbstractFileByPath
        .mockReturnValueOnce(null) // Folder doesn't exist
        .mockReturnValueOnce(null); // File doesn't exist
      mockApp.vault.create.mockResolvedValue(mockTFile);

      await service.createOrOpenDailyNote(testDate);

      expect(mockApp.vault.createFolder).toHaveBeenCalledWith('Daily Notes');
    });
  });

  describe('insertPrompt', () => {
    const mockPrompt: Prompt = {
      id: 'test-prompt',
      content: 'What are you grateful for today?',
      type: 'string'
    };

    it('should insert string prompt into daily note', async () => {
      const existingContent = '# 2024-01-15\n\n{{prompt}}\n\n## Notes\n';
      const expectedContent = expect.stringContaining('What are you grateful for today?');

      mockApp.vault.read.mockResolvedValue(existingContent);
      mockApp.vault.modify.mockResolvedValue(undefined);

      await service.insertPrompt(mockPrompt, mockTFile);

      expect(mockApp.vault.read).toHaveBeenCalledWith(mockTFile);
      expect(mockApp.vault.modify).toHaveBeenCalledWith(mockTFile, expectedContent);
      expect(mockApp.workspace.getLeaf().openFile).toHaveBeenCalledWith(mockTFile);
    });

    it('should format link prompt according to link handling setting', async () => {
      const linkPrompt: Prompt = {
        id: 'link-prompt',
        content: 'My Link Note',
        type: 'link'
      };

      const existingContent = '# 2024-01-15\n\n{{prompt}}\n\n## Notes\n';
      mockApp.vault.read.mockResolvedValue(existingContent);
      mockApp.vault.modify.mockResolvedValue(undefined);

      // Test direct link handling
      await service.insertPrompt(linkPrompt, mockTFile);
      expect(mockApp.vault.modify).toHaveBeenCalledWith(
        mockTFile,
        expect.stringContaining('[My Link Note](My Link Note)')
      );

      // Test embed link handling
      globalSettings.linkHandling = 'embed';
      service.updateGlobalSettings(globalSettings);

      await service.insertPrompt(linkPrompt, mockTFile);
      expect(mockApp.vault.modify).toHaveBeenCalledWith(
        mockTFile,
        expect.stringContaining('![[My Link Note]]')
      );

      // Test reference link handling
      globalSettings.linkHandling = 'reference';
      service.updateGlobalSettings(globalSettings);

      await service.insertPrompt(linkPrompt, mockTFile);
      expect(mockApp.vault.modify).toHaveBeenCalledWith(
        mockTFile,
        expect.stringContaining('[[My Link Note]]')
      );
    });

    it('should format markdown prompt correctly', async () => {
      const markdownPrompt: Prompt = {
        id: 'markdown-prompt',
        content: '**Bold question:** What *inspires* you today?\n\n- Think about it\n- Write it down',
        type: 'markdown'
      };

      const existingContent = '# 2024-01-15\n\n{{prompt}}\n\n## Notes\n';
      mockApp.vault.read.mockResolvedValue(existingContent);
      mockApp.vault.modify.mockResolvedValue(undefined);

      await service.insertPrompt(markdownPrompt, mockTFile);

      expect(mockApp.vault.modify).toHaveBeenCalledWith(
        mockTFile,
        expect.stringContaining('**Bold question:** What *inspires* you today?')
      );
    });

    it('should find appropriate insertion point when no template placeholder', async () => {
      const existingContent = '# 2024-01-15\n\nSome existing content\n\n## Notes\n';
      mockApp.vault.read.mockResolvedValue(existingContent);
      mockApp.vault.modify.mockResolvedValue(undefined);

      await service.insertPrompt(mockPrompt, mockTFile);

      expect(mockApp.vault.modify).toHaveBeenCalledWith(
        mockTFile,
        expect.stringContaining('# 2024-01-15\n\n## Daily Prompt')
      );
    });

    it('should handle insertion errors gracefully', async () => {
      mockApp.vault.read.mockRejectedValue(new Error('Read error'));

      await expect(service.insertPrompt(mockPrompt, mockTFile)).rejects.toThrow('Failed to insert prompt');
    });
  });

  describe('zen mode', () => {
    it('should enable zen mode correctly', () => {
      expect(service.isZenModeActive()).toBe(false);

      service.enableZenMode();

      expect(service.isZenModeActive()).toBe(true);
      expect(mockApp.workspace.leftSplit.collapse).toHaveBeenCalled();
      expect(mockApp.workspace.rightSplit.collapse).toHaveBeenCalled();
      expect(document.body.classList.contains('daily-prompts-zen-mode')).toBe(true);
      expect(document.getElementById('daily-prompts-zen-mode-styles')).toBeTruthy();
    });

    it('should disable zen mode and restore previous state', () => {
      // First enable zen mode
      service.enableZenMode();
      expect(service.isZenModeActive()).toBe(true);

      // Then disable it
      service.disableZenMode();

      expect(service.isZenModeActive()).toBe(false);
      expect(mockApp.workspace.leftSplit.expand).toHaveBeenCalled();
      expect(mockApp.workspace.rightSplit.expand).toHaveBeenCalled();
      expect(document.body.classList.contains('daily-prompts-zen-mode')).toBe(false);
      expect(document.getElementById('daily-prompts-zen-mode-styles')).toBeFalsy();
    });

    it('should not enable zen mode if already active', () => {
      service.enableZenMode();
      jest.clearAllMocks();

      service.enableZenMode();

      expect(mockApp.workspace.leftSplit.collapse).not.toHaveBeenCalled();
      expect(mockApp.workspace.rightSplit.collapse).not.toHaveBeenCalled();
    });

    it('should not disable zen mode if not active', () => {
      expect(service.isZenModeActive()).toBe(false);

      service.disableZenMode();

      expect(mockApp.workspace.leftSplit.expand).not.toHaveBeenCalled();
      expect(mockApp.workspace.rightSplit.expand).not.toHaveBeenCalled();
    });

    it('should handle zen mode errors gracefully', () => {
      mockApp.workspace.leftSplit.collapse.mockImplementation(() => {
        throw new Error('Collapse error');
      });

      // Should not throw
      expect(() => service.enableZenMode()).not.toThrow();

      // Should still track state correctly
      expect(service.isZenModeActive()).toBe(true);
    });
  });

  describe('updateGlobalSettings', () => {
    it('should update global settings reference', () => {
      const newSettings: GlobalSettings = {
        defaultNotificationTime: '10:00',
        defaultZenMode: true,
        dailyNoteFolder: 'Journal',
        dailyNoteTemplate: '# {{title}}\n\n{{prompt}}',
        linkHandling: 'embed'
      };

      service.updateGlobalSettings(newSettings);

      // Test that new settings are used
      expect(service['globalSettings']).toBe(newSettings);
    });
  });

  describe('template processing', () => {
    it('should process date templates correctly', async () => {
      const testDate = new Date('2024-01-15');
      globalSettings.dailyNoteTemplate = '# {{date:YYYY-MM-DD}}\n\nWeekday: {{date:dddd}}\nMonth: {{date:MMMM}}';

      mockApp.vault.getAbstractFileByPath.mockReturnValue(null);
      mockApp.vault.create.mockResolvedValue(mockTFile);

      await service.createOrOpenDailyNote(testDate);

      expect(mockApp.vault.create).toHaveBeenCalledWith(
        'Daily Notes/2024-01-15.md',
        expect.stringContaining('# 2024-01-15')
      );
      expect(mockApp.vault.create).toHaveBeenCalledWith(
        'Daily Notes/2024-01-15.md',
        expect.stringContaining('Weekday: Monday')
      );
      expect(mockApp.vault.create).toHaveBeenCalledWith(
        'Daily Notes/2024-01-15.md',
        expect.stringContaining('Month: January')
      );
    });

    it('should handle empty daily note folder setting', async () => {
      const testDate = new Date('2024-01-15');
      globalSettings.dailyNoteFolder = '';

      mockApp.vault.getAbstractFileByPath.mockReturnValue(null);
      mockApp.vault.create.mockResolvedValue(mockTFile);

      await service.createOrOpenDailyNote(testDate);

      expect(mockApp.vault.create).toHaveBeenCalledWith(
        '2024-01-15.md',
        expect.any(String)
      );
      expect(mockApp.vault.createFolder).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle vault creation errors with fallback', async () => {
      const testDate = new Date('2024-01-15');
      mockApp.vault.getAbstractFileByPath.mockReturnValue(null);
      mockApp.vault.create
        .mockRejectedValueOnce(new Error('Creation failed'))
        .mockResolvedValueOnce(mockTFile);

      const result = await service.createOrOpenDailyNote(testDate);

      expect(result).toBe(mockTFile);
      expect(mockApp.vault.create).toHaveBeenCalledTimes(2);
    });

    it('should handle existing file error during creation', async () => {
      const testDate = new Date('2024-01-15');
      const error = new Error('File already exists');

      mockApp.vault.getAbstractFileByPath
        .mockReturnValueOnce(null) // First check returns null
        .mockReturnValueOnce(mockTFile); // Second check returns file
      mockApp.vault.create.mockRejectedValue(error);

      const result = await service.createOrOpenDailyNote(testDate);

      expect(result).toBe(mockTFile);
    });
  });
});