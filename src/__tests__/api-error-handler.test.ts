/**
 * Unit tests for APIErrorHandler
 */

import { APIErrorHandler, APICapabilities, FallbackOptions } from '../api-error-handler';
import { ErrorHandler } from '../error-handler';

// Mock Obsidian Notice
global.Notice = jest.fn() as any;

// Mock app and plugin
const mockApp = {
  plugins: {
    getPlugin: jest.fn(),
    plugins: {},
    enabledPlugins: new Set()
  },
  workspace: {
    leftSplit: { collapsed: false },
    rightSplit: { collapsed: false },
    activeLeaf: { view: { file: null } },
    getLeaf: jest.fn()
  },
  vault: {
    create: jest.fn(),
    read: jest.fn(),
    modify: jest.fn(),
    getAbstractFileByPath: jest.fn()
  }
};

const mockPlugin = {
  app: mockApp
};

const mockErrorHandler = {
  createContext: jest.fn().mockReturnValue({ id: 'test-context' }),
  handleError: jest.fn()
};

describe('APIErrorHandler', () => {
  let apiErrorHandler: APIErrorHandler;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset global APIs
    delete (global as any).Notification;
    delete (global as any).window;

    apiErrorHandler = new APIErrorHandler(
      mockApp as any,
      mockPlugin as any,
      mockErrorHandler as any
    );
  });

  describe('capability detection', () => {
    it('should detect daily notes plugin availability', () => {
      mockApp.plugins.getPlugin.mockReturnValue({ enabled: true });
      mockApp.plugins.enabledPlugins.add('daily-notes');

      const handler = new APIErrorHandler(mockApp as any, mockPlugin as any, mockErrorHandler as any);
      const capabilities = handler.getCapabilities();

      expect(capabilities.dailyNotesPlugin).toBe(true);
    });

    it('should detect missing daily notes plugin', () => {
      mockApp.plugins.getPlugin.mockReturnValue(null);
      mockApp.plugins.enabledPlugins.clear();

      const handler = new APIErrorHandler(mockApp as any, mockPlugin as any, mockErrorHandler as any);
      const capabilities = handler.getCapabilities();

      expect(capabilities.dailyNotesPlugin).toBe(false);
    });

    it('should detect system notifications availability', () => {
      // Mock window and Notification API
      (global as any).window = {};
      (global as any).Notification = {
        permission: 'granted'
      };

      const handler = new APIErrorHandler(mockApp as any, mockPlugin as any, mockErrorHandler as any);
      const capabilities = handler.getCapabilities();

      expect(capabilities.systemNotifications).toBe(true);
    });

    it('should detect missing system notifications', () => {
      // No window or Notification API

      const handler = new APIErrorHandler(mockApp as any, mockPlugin as any, mockErrorHandler as any);
      const capabilities = handler.getCapabilities();

      expect(capabilities.systemNotifications).toBe(false);
    });

    it('should detect workspace API availability', () => {
      const capabilities = apiErrorHandler.getCapabilities();
      expect(capabilities.workspaceAPI).toBe(true);
    });

    it('should detect missing workspace API', () => {
      const brokenApp = { ...mockApp, workspace: null };

      const handler = new APIErrorHandler(brokenApp as any, mockPlugin as any, mockErrorHandler as any);
      const capabilities = handler.getCapabilities();

      expect(capabilities.workspaceAPI).toBe(false);
    });

    it('should detect file system API availability', () => {
      const capabilities = apiErrorHandler.getCapabilities();
      expect(capabilities.fileSystemAPI).toBe(true);
    });

    it('should detect missing file system API', () => {
      const brokenApp = { ...mockApp, vault: null };

      const handler = new APIErrorHandler(brokenApp as any, mockPlugin as any, mockErrorHandler as any);
      const capabilities = handler.getCapabilities();

      expect(capabilities.fileSystemAPI).toBe(false);
    });

    it('should detect editor API availability', () => {
      const capabilities = apiErrorHandler.getCapabilities();
      expect(capabilities.editorAPI).toBe(true);
    });

    it('should detect missing editor API', () => {
      const brokenApp = { ...mockApp, workspace: { ...mockApp.workspace, activeLeaf: null } };

      const handler = new APIErrorHandler(brokenApp as any, mockPlugin as any, mockErrorHandler as any);
      const capabilities = handler.getCapabilities();

      expect(capabilities.editorAPI).toBe(false);
    });
  });

  describe('error handling', () => {
    describe('handleDailyNotesError', () => {
      it('should handle daily notes API errors', async () => {
        const error = new Error('Daily notes plugin not found');
        mockErrorHandler.handleError.mockResolvedValue({ useManualNoteCreation: true });

        const result = await apiErrorHandler.handleDailyNotesError(error, 'createNote');

        expect(mockErrorHandler.handleError).toHaveBeenCalled();
        expect(result.useManualNoteCreation).toBe(true);
      });

      it('should update fallback options when daily notes unavailable', async () => {
        const error = new Error('Plugin error');

        await apiErrorHandler.handleDailyNotesError(error, 'createNote');

        const fallbackOptions = apiErrorHandler.getFallbackOptions();
        expect(fallbackOptions.useDailyNotesPlugin).toBe(false);
      });
    });

    describe('handleNotificationError', () => {
      it('should handle notification API errors', async () => {
        const error = new Error('Notification permission denied');
        mockErrorHandler.handleError.mockResolvedValue({ notificationType: 'obsidian' });

        const result = await apiErrorHandler.handleNotificationError(error, 'showNotification');

        expect(mockErrorHandler.handleError).toHaveBeenCalled();
        expect(result.notificationType).toBe('obsidian');
      });

      it('should update fallback options when notifications unavailable', async () => {
        const error = new Error('Notifications not supported');

        await apiErrorHandler.handleNotificationError(error, 'showNotification');

        const fallbackOptions = apiErrorHandler.getFallbackOptions();
        expect(fallbackOptions.useSystemNotifications).toBe(false);
      });
    });

    describe('handleWorkspaceError', () => {
      it('should handle workspace API errors', async () => {
        const error = new Error('Workspace API not available');
        mockErrorHandler.handleError.mockResolvedValue({ skipZenMode: true });

        const result = await apiErrorHandler.handleWorkspaceError(error, 'enableZenMode');

        expect(mockErrorHandler.handleError).toHaveBeenCalled();
        expect(result.skipZenMode).toBe(true);
      });

      it('should update fallback options when workspace unavailable', async () => {
        const error = new Error('Workspace error');

        await apiErrorHandler.handleWorkspaceError(error, 'enableZenMode');

        const fallbackOptions = apiErrorHandler.getFallbackOptions();
        expect(fallbackOptions.useZenMode).toBe(false);
      });
    });

    describe('handleFileSystemError', () => {
      it('should handle file system API errors', async () => {
        const error = new Error('File system not available');

        await expect(apiErrorHandler.handleFileSystemError(error, 'createFile'))
          .rejects.toThrow();

        expect(mockErrorHandler.handleError).toHaveBeenCalled();
      });

      it('should attempt recovery for file system errors', async () => {
        const error = new Error('File operation failed');
        mockApp.vault.create.mockResolvedValue(undefined);
        mockApp.vault.getAbstractFileByPath.mockReturnValue({ path: 'test.tmp' });
        mockApp.vault.delete.mockResolvedValue(undefined);

        // Mock successful recovery
        jest.spyOn(apiErrorHandler as any, 'recoverFileSystemAPI')
          .mockResolvedValue({ fileSystemWorking: true });

        const result = await apiErrorHandler.handleFileSystemError(error, 'createFile');

        expect(result.fileSystemWorking).toBe(true);
      });
    });
  });

  describe('recovery mechanisms', () => {
    describe('daily notes recovery', () => {
      it('should recover daily notes plugin functionality', async () => {
        mockApp.plugins.getPlugin.mockReturnValue({ enabled: true });
        mockApp.plugins.enabledPlugins.add('daily-notes');

        const error = new Error('Plugin error');
        const result = await apiErrorHandler.handleDailyNotesError(error, 'createNote');

        expect(result.useManualNoteCreation).toBe(false);
      });

      it('should fallback to manual note creation', async () => {
        mockApp.plugins.getPlugin.mockReturnValue(null);

        const error = new Error('Plugin not found');
        const result = await apiErrorHandler.handleDailyNotesError(error, 'createNote');

        expect(result.useManualNoteCreation).toBe(true);
      });
    });

    describe('notification recovery', () => {
      it('should recover system notifications when permission granted', async () => {
        (global as any).window = {};
        (global as any).Notification = {
          permission: 'default',
          requestPermission: jest.fn().mockResolvedValue('granted')
        };

        const error = new Error('Permission error');
        const result = await apiErrorHandler.handleNotificationError(error, 'showNotification');

        expect(result.notificationType).toBe('system');
      });

      it('should fallback to Obsidian notifications', async () => {
        (global as any).window = {};
        (global as any).Notification = {
          permission: 'denied'
        };

        const error = new Error('Permission denied');
        const result = await apiErrorHandler.handleNotificationError(error, 'showNotification');

        expect(result.notificationType).toBe('obsidian');
        expect(result.fallbackApplied).toBe(true);
      });
    });

    describe('workspace recovery', () => {
      it('should recover workspace functionality when available', async () => {
        const error = new Error('Workspace error');
        const result = await apiErrorHandler.handleWorkspaceError(error, 'enableZenMode');

        expect(result.useZenMode).toBe(true);
      });

      it('should skip zen mode when workspace unavailable', async () => {
        const brokenApp = { ...mockApp, workspace: null };
        const handler = new APIErrorHandler(brokenApp as any, mockPlugin as any, mockErrorHandler as any);

        const error = new Error('Workspace not available');
        const result = await handler.handleWorkspaceError(error, 'enableZenMode');

        expect(result.skipZenMode).toBe(true);
      });
    });

    describe('file system recovery', () => {
      it('should test file system functionality', async () => {
        mockApp.vault.create.mockResolvedValue(undefined);
        mockApp.vault.getAbstractFileByPath.mockReturnValue({ path: 'test.tmp' });
        mockApp.vault.delete.mockResolvedValue(undefined);

        const error = new Error('File system error');
        const result = await apiErrorHandler.handleFileSystemError(error, 'createFile');

        expect(result.fileSystemWorking).toBe(true);
        expect(mockApp.vault.create).toHaveBeenCalled();
        expect(mockApp.vault.delete).toHaveBeenCalled();
      });

      it('should throw when file system test fails', async () => {
        mockApp.vault.create.mockRejectedValue(new Error('Create failed'));

        const error = new Error('File system error');

        await expect(apiErrorHandler.handleFileSystemError(error, 'createFile'))
          .rejects.toThrow('File system recovery failed');
      });
    });
  });

  describe('utility methods', () => {
    it('should check API availability', () => {
      expect(apiErrorHandler.isAPIAvailable('fileSystemAPI')).toBe(true);
      expect(apiErrorHandler.isAPIAvailable('dailyNotesPlugin')).toBe(false);
    });

    it('should check fallback usage', () => {
      expect(apiErrorHandler.shouldUseFallback('useZenMode')).toBe(false);
      expect(apiErrorHandler.shouldUseFallback('useDailyNotesPlugin')).toBe(true);
    });

    it('should refresh capabilities', () => {
      // Add daily notes plugin
      mockApp.plugins.getPlugin.mockReturnValue({ enabled: true });
      mockApp.plugins.enabledPlugins.add('daily-notes');

      apiErrorHandler.refreshCapabilities();

      expect(apiErrorHandler.isAPIAvailable('dailyNotesPlugin')).toBe(true);
    });

    it('should show API limitation notices', () => {
      apiErrorHandler.showAPILimitationNotice('dailyNotesPlugin', 'note creation');

      expect(global.Notice).toHaveBeenCalledWith(
        expect.stringContaining('Daily notes plugin not available'),
        5000
      );
    });

    it('should provide recommended settings', () => {
      const recommendations = apiErrorHandler.getRecommendedSettings();

      expect(recommendations.defaultNotificationType).toBe('obsidian');
      expect(recommendations.defaultZenMode).toBe(false);
      expect(recommendations.dailyNoteFolder).toBe('');
    });

    it('should validate plugin requirements', () => {
      const validation = apiErrorHandler.validateRequirements();

      expect(validation.valid).toBe(true);
      expect(validation.issues).toContain('Daily notes plugin not available - using manual note creation');
      expect(validation.issues).toContain('System notifications not available - using Obsidian notifications');
    });

    it('should fail validation when critical APIs missing', () => {
      const brokenApp = { ...mockApp, vault: null, workspace: { activeLeaf: null } };
      const handler = new APIErrorHandler(brokenApp as any, mockPlugin as any, mockErrorHandler as any);

      const validation = handler.validateRequirements();

      expect(validation.valid).toBe(false);
      expect(validation.issues).toContain('File system API is required but not available');
      expect(validation.issues).toContain('Editor API is required but not available');
    });
  });

  describe('fallback option management', () => {
    it('should update fallback options based on capabilities', () => {
      const capabilities = apiErrorHandler.getCapabilities();
      const fallbackOptions = apiErrorHandler.getFallbackOptions();

      expect(fallbackOptions.useDailyNotesPlugin).toBe(capabilities.dailyNotesPlugin);
      expect(fallbackOptions.useSystemNotifications).toBe(capabilities.systemNotifications);
      expect(fallbackOptions.useZenMode).toBe(capabilities.workspaceAPI);
      expect(fallbackOptions.useAdvancedEditor).toBe(capabilities.editorAPI);
    });

    it('should disable features when APIs become unavailable', async () => {
      // Initially available
      expect(apiErrorHandler.getFallbackOptions().useZenMode).toBe(true);

      // Handle error that makes workspace unavailable
      const error = new Error('Workspace error');
      await apiErrorHandler.handleWorkspaceError(error, 'enableZenMode');

      expect(apiErrorHandler.getFallbackOptions().useZenMode).toBe(false);
    });
  });

  describe('error context creation', () => {
    it('should create proper error contexts', async () => {
      const error = new Error('Test error');

      await apiErrorHandler.handleDailyNotesError(error, 'createNote');

      expect(mockErrorHandler.createContext).toHaveBeenCalledWith(
        'daily_notes_createNote',
        'api-error-handler'
      );
    });

    it('should use different contexts for different operations', async () => {
      const error = new Error('Test error');

      await apiErrorHandler.handleNotificationError(error, 'showNotification');
      await apiErrorHandler.handleWorkspaceError(error, 'enableZenMode');

      expect(mockErrorHandler.createContext).toHaveBeenCalledWith(
        'notification_showNotification',
        'api-error-handler'
      );
      expect(mockErrorHandler.createContext).toHaveBeenCalledWith(
        'workspace_enableZenMode',
        'api-error-handler'
      );
    });
  });

  describe('error severity handling', () => {
    it('should handle non-critical errors gracefully', async () => {
      const error = new Error('Non-critical error');

      await apiErrorHandler.handleNotificationError(error, 'showNotification');

      expect(mockErrorHandler.handleError).toHaveBeenCalledWith(
        error,
        expect.any(Object),
        expect.objectContaining({
          notifyUser: false,
          severity: expect.any(String)
        })
      );
    });

    it('should escalate critical file system errors', async () => {
      const error = new Error('Critical file system error');

      await expect(apiErrorHandler.handleFileSystemError(error, 'createFile'))
        .rejects.toThrow();

      expect(mockErrorHandler.handleError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.any(Object),
        expect.objectContaining({
          notifyUser: true,
          severity: expect.any(String)
        })
      );
    });
  });
});