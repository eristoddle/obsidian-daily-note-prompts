/**
 * Tests for NotificationService
 */

import { NotificationService } from '../notification-service';
import { PromptPack, Prompt, PromptPackSettings, PromptProgress } from '../models';

// Mock Notice class
const mockNotice = jest.fn().mockImplementation((message: string, timeout?: number) => ({
  noticeEl: {
    style: {},
    createEl: jest.fn().mockReturnValue({
      style: { cssText: '' },
      addEventListener: jest.fn()
    }),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    parentNode: true
  },
  hide: jest.fn()
}));

// Mock Plugin interface
interface MockPlugin {
  promptService?: any;
  dailyNoteService?: any;
  progressStore?: any;
  settings?: any;
}

// Create global Notice mock
(global as any).Notice = mockNotice;

// Mock global Notification API
const mockNotification = jest.fn().mockImplementation((title: string, options?: NotificationOptions) => ({
  onclick: null,
  close: jest.fn(),
  addEventListener: jest.fn()
}));

Object.defineProperty(global, 'Notification', {
  value: mockNotification,
  configurable: true
});

Object.defineProperty(global.Notification, 'permission', {
  value: 'default',
  writable: true,
  configurable: true
});

Object.defineProperty(global.Notification, 'requestPermission', {
  value: jest.fn().mockResolvedValue('granted'),
  configurable: true
});

// Mock setTimeout and clearTimeout
const mockSetTimeout = jest.fn() as any;
const mockClearTimeout = jest.fn() as any;
(global as any).setTimeout = mockSetTimeout;
(global as any).clearTimeout = mockClearTimeout;

// Mock setInterval and clearInterval
const mockSetInterval = jest.fn() as any;
const mockClearInterval = jest.fn() as any;
(global as any).setInterval = mockSetInterval;
(global as any).clearInterval = mockClearInterval;

describe('NotificationService', () => {
  let notificationService: NotificationService;
  let mockPlugin: MockPlugin;
  let mockPromptService: any;
  let mockDailyNoteService: any;
  let mockProgressStore: any;
  let mockSettings: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset Notification permission
    Object.defineProperty(global.Notification, 'permission', {
      value: 'default',
      writable: true,
      configurable: true
    });

    // Mock plugin and services
    mockPromptService = {
      getNextPrompt: jest.fn(),
      getProgress: jest.fn().mockReturnValue(new PromptProgress())
    };

    mockDailyNoteService = {
      createOrOpenDailyNote: jest.fn(),
      insertPrompt: jest.fn(),
      enableZenMode: jest.fn(),
      disableZenMode: jest.fn()
    };

    mockProgressStore = {
      updateProgress: jest.fn()
    };

    mockSettings = {
      getPromptPack: jest.fn()
    };

    mockPlugin = {
      promptService: mockPromptService,
      dailyNoteService: mockDailyNoteService,
      progressStore: mockProgressStore,
      settings: mockSettings
    };

    notificationService = new NotificationService(mockPlugin as any);
  });

  afterEach(() => {
    notificationService.destroy();
  });

  describe('Initialization', () => {
    it('should initialize with default permission state', () => {
      const permissionStatus = notificationService.getPermissionStatus();
      expect(permissionStatus.supported).toBe(true);
      expect(permissionStatus.granted).toBe(false);
      expect(permissionStatus.requested).toBe(false);
    });

    it('should start periodic check interval', () => {
      expect(mockSetInterval).toHaveBeenCalledWith(expect.any(Function), 60000);
    });

    it('should handle missing Notification API gracefully', () => {
      // Temporarily remove Notification API
      const originalNotification = global.Notification;
      delete (global as any).Notification;

      const service = new NotificationService(mockPlugin as any);
      const permissionStatus = service.getPermissionStatus();

      expect(permissionStatus.supported).toBe(false);
      expect(permissionStatus.granted).toBe(false);

      // Restore Notification API
      global.Notification = originalNotification;
      service.destroy();
    });
  });

  describe('Permission Management', () => {
    it('should request notification permissions', async () => {
      const granted = await notificationService.requestPermissions();

      expect(global.Notification.requestPermission).toHaveBeenCalled();
      expect(granted).toBe(true);
    });

    it('should handle permission denial', async () => {
      (global.Notification.requestPermission as jest.Mock).mockResolvedValue('denied');

      const granted = await notificationService.requestPermissions();

      expect(granted).toBe(false);
    });

    it('should detect already granted permissions', async () => {
      Object.defineProperty(global.Notification, 'permission', {
        value: 'granted',
        writable: true
      });

      const service = new NotificationService(mockPlugin as any);
      const granted = await service.requestPermissions();

      expect(granted).toBe(true);
      service.destroy();
    });
  });

  describe('Notification Scheduling', () => {
    let testPack: PromptPack;

    beforeEach(() => {
      const settings = new PromptPackSettings({
        notificationEnabled: true,
        notificationTime: '09:00',
        notificationType: 'obsidian'
      });

      testPack = new PromptPack({
        name: 'Test Pack',
        type: 'Sequential',
        settings
      });
    });

    it('should schedule notification for enabled pack', () => {
      notificationService.scheduleNotification(testPack);

      expect(mockSetTimeout).toHaveBeenCalledWith(expect.any(Function), expect.any(Number));

      const scheduledNotifications = notificationService.getScheduledNotifications();
      expect(scheduledNotifications).toHaveLength(1);
      expect(scheduledNotifications[0].packId).toBe(testPack.id);
    });

    it('should not schedule notification for disabled pack', () => {
      testPack.settings.notificationEnabled = false;

      notificationService.scheduleNotification(testPack);

      expect(mockSetTimeout).not.toHaveBeenCalled();

      const scheduledNotifications = notificationService.getScheduledNotifications();
      expect(scheduledNotifications).toHaveLength(0);
    });

    it('should cancel existing notification when rescheduling', () => {
      // Schedule first notification
      notificationService.scheduleNotification(testPack);
      expect(mockSetTimeout).toHaveBeenCalledTimes(1);

      // Schedule again (should cancel previous)
      notificationService.scheduleNotification(testPack);
      expect(mockClearTimeout).toHaveBeenCalledTimes(1);
      expect(mockSetTimeout).toHaveBeenCalledTimes(2);
    });

    it('should handle invalid time format', () => {
      testPack.settings.notificationTime = 'invalid';

      // Should not throw, but should show error notice
      expect(() => {
        notificationService.scheduleNotification(testPack);
      }).not.toThrow();

      expect(mockNotice).toHaveBeenCalledWith(expect.stringContaining('Failed to schedule notification'));
    });

    it('should schedule for next day if time has passed today', () => {
      // Mock current time to be after 9 AM
      const mockDate = new Date();
      mockDate.setHours(10, 0, 0, 0);
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

      notificationService.scheduleNotification(testPack);

      // Should schedule for tomorrow
      expect(mockSetTimeout).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Number)
      );

      // Restore Date
      (global.Date as any).mockRestore();
    });
  });

  describe('Notification Cancellation', () => {
    let testPack: PromptPack;

    beforeEach(() => {
      const settings = new PromptPackSettings({
        notificationEnabled: true,
        notificationTime: '09:00'
      });

      testPack = new PromptPack({
        name: 'Test Pack',
        type: 'Sequential',
        settings
      });
    });

    it('should cancel scheduled notification', () => {
      // Schedule notification
      notificationService.scheduleNotification(testPack);
      expect(notificationService.getScheduledNotifications()).toHaveLength(1);

      // Cancel notification
      notificationService.cancelNotification(testPack.id);
      expect(mockClearTimeout).toHaveBeenCalled();
      expect(notificationService.getScheduledNotifications()).toHaveLength(0);
    });

    it('should handle cancelling non-existent notification', () => {
      expect(() => {
        notificationService.cancelNotification('non-existent-id');
      }).not.toThrow();

      expect(mockClearTimeout).not.toHaveBeenCalled();
    });
  });

  describe('Notification Display', () => {
    let testPack: PromptPack;
    let testPrompt: Prompt;

    beforeEach(() => {
      const settings = new PromptPackSettings({
        notificationEnabled: true,
        notificationTime: '09:00',
        notificationType: 'obsidian'
      });

      testPack = new PromptPack({
        name: 'Test Pack',
        type: 'Sequential',
        settings
      });

      testPrompt = new Prompt({
        content: 'What are you grateful for today?',
        type: 'string'
      });
    });

    it('should show Obsidian notification when configured', () => {
      notificationService.showNotification(testPrompt, testPack);

      expect(mockNotice).toHaveBeenCalledWith(
        expect.stringContaining('Daily Prompt: Test Pack'),
        0
      );
    });

    it('should show system notification when configured and permissions granted', () => {
      testPack.settings.notificationType = 'system';
      Object.defineProperty(global.Notification, 'permission', {
        value: 'granted',
        writable: true
      });

      // Reinitialize service to pick up granted permissions
      notificationService.destroy();
      notificationService = new NotificationService(mockPlugin as any);

      notificationService.showNotification(testPrompt, testPack);

      expect(mockNotification).toHaveBeenCalledWith(
        'Daily Prompt: Test Pack',
        expect.objectContaining({
          body: expect.stringContaining('What are you grateful for today?'),
          icon: expect.any(String),
          tag: `daily-prompt-${testPack.id}`
        })
      );
    });

    it('should fallback to Obsidian notification when system notifications unavailable', () => {
      testPack.settings.notificationType = 'system';
      // Permissions not granted

      notificationService.showNotification(testPrompt, testPack);

      expect(mockNotification).not.toHaveBeenCalled();
      expect(mockNotice).toHaveBeenCalled();
    });

    it('should truncate long prompt content for notifications', () => {
      const longContent = 'A'.repeat(200);
      testPrompt.content = longContent;

      notificationService.showNotification(testPrompt, testPack);

      expect(mockNotice).toHaveBeenCalledWith(
        expect.stringContaining('A'.repeat(150) + '...'),
        0
      );
    });

    it('should remove markdown formatting from notification text', () => {
      testPrompt.content = '**Bold** text with [link](http://example.com) and `code`';

      notificationService.showNotification(testPrompt, testPack);

      expect(mockNotice).toHaveBeenCalledWith(
        expect.stringContaining('Bold text with link and code'),
        0
      );
    });
  });

  describe('Notification Click Handling', () => {
    let testPack: PromptPack;
    let testPrompt: Prompt;

    beforeEach(() => {
      const settings = new PromptPackSettings({
        notificationEnabled: true,
        notificationTime: '09:00',
        zenModeEnabled: true,
        dailyNoteIntegration: true
      });

      testPack = new PromptPack({
        name: 'Test Pack',
        type: 'Sequential',
        settings
      });

      testPrompt = new Prompt({
        content: 'What are you grateful for today?',
        type: 'string'
      });

      // Mock daily note service responses
      mockDailyNoteService.createOrOpenDailyNote.mockResolvedValue({ path: 'daily-note.md' });
      mockDailyNoteService.insertPrompt.mockResolvedValue(undefined);
    });

    it('should handle notification click by opening daily note', async () => {
      // Simulate notification click
      notificationService.showNotification(testPrompt, testPack);

      // Get the click handler from the Notice mock
      const noticeMock = mockNotice.mock.results[0].value;
      const clickHandler = noticeMock.noticeEl.addEventListener.mock.calls
        .find((call: any) => call[0] === 'click')[1];

      await clickHandler();

      expect(mockDailyNoteService.createOrOpenDailyNote).toHaveBeenCalled();
      expect(mockDailyNoteService.insertPrompt).toHaveBeenCalledWith(
        testPrompt,
        { path: 'daily-note.md' }
      );
      expect(mockDailyNoteService.enableZenMode).toHaveBeenCalled();
    });

    it('should not enable zen mode when disabled', async () => {
      testPack.settings.zenModeEnabled = false;

      notificationService.showNotification(testPrompt, testPack);

      const noticeMock = mockNotice.mock.results[0].value;
      const clickHandler = noticeMock.noticeEl.addEventListener.mock.calls
        .find((call: any) => call[0] === 'click')[1];

      await clickHandler();

      expect(mockDailyNoteService.enableZenMode).not.toHaveBeenCalled();
    });

    it('should handle errors during notification click gracefully', async () => {
      mockDailyNoteService.createOrOpenDailyNote.mockRejectedValue(new Error('File not found'));

      notificationService.showNotification(testPrompt, testPack);

      const noticeMock = mockNotice.mock.results[0].value;
      const clickHandler = noticeMock.noticeEl.addEventListener.mock.calls
        .find((call: any) => call[0] === 'click')[1];

      await clickHandler();

      expect(mockNotice).toHaveBeenCalledWith(
        expect.stringContaining('Failed to open prompt: File not found')
      );
    });
  });

  describe('Missed Notifications', () => {
    let testPack: PromptPack;

    beforeEach(() => {
      const settings = new PromptPackSettings({
        notificationEnabled: true,
        notificationTime: '09:00'
      });

      testPack = new PromptPack({
        name: 'Test Pack',
        type: 'Sequential',
        settings
      });

      mockSettings.getPromptPack.mockReturnValue(testPack);
    });

    it('should detect missed notifications', async () => {
      // Schedule a notification
      notificationService.scheduleNotification(testPack);

      // Mock that time has passed
      const pastTime = new Date();
      pastTime.setHours(8, 0, 0, 0); // Before 9 AM

      // Manually set the scheduled time to past
      const scheduledNotifications = notificationService.getScheduledNotifications();
      if (scheduledNotifications.length > 0) {
        (scheduledNotifications[0] as any).nextNotificationTime = pastTime;
      }

      await notificationService.checkMissedNotifications();

      // Should show missed notification
      expect(mockNotice).toHaveBeenCalledWith(
        expect.stringContaining('Missed Daily Prompt'),
        0
      );
    });

    it('should not show missed notification for disabled packs', async () => {
      testPack.settings.notificationEnabled = false;
      mockSettings.getPromptPack.mockReturnValue(testPack);

      await notificationService.checkMissedNotifications();

      expect(mockNotice).not.toHaveBeenCalledWith(
        expect.stringContaining('Missed Daily Prompt'),
        expect.any(Number)
      );
    });

    it('should handle missing pack during missed notification check', async () => {
      mockSettings.getPromptPack.mockReturnValue(null);

      await notificationService.checkMissedNotifications();

      // Should not throw error
      expect(mockNotice).not.toHaveBeenCalledWith(
        expect.stringContaining('Missed Daily Prompt'),
        expect.any(Number)
      );
    });
  });

  describe('Service Lifecycle', () => {
    it('should clean up resources on destroy', () => {
      const testPack = new PromptPack({
        name: 'Test Pack',
        type: 'Sequential',
        settings: new PromptPackSettings({ notificationEnabled: true })
      });

      // Schedule some notifications
      notificationService.scheduleNotification(testPack);

      // Destroy service
      notificationService.destroy();

      expect(mockClearTimeout).toHaveBeenCalled();
      expect(mockClearInterval).toHaveBeenCalled();
      expect(notificationService.getScheduledNotifications()).toHaveLength(0);
    });

    it('should handle multiple destroy calls gracefully', () => {
      expect(() => {
        notificationService.destroy();
        notificationService.destroy();
      }).not.toThrow();
    });
  });

  describe('Time Parsing', () => {
    let testPack: PromptPack;

    beforeEach(() => {
      testPack = new PromptPack({
        name: 'Test Pack',
        type: 'Sequential',
        settings: new PromptPackSettings({ notificationEnabled: true })
      });
    });

    it('should parse valid time formats', () => {
      const validTimes = ['09:00', '23:59', '00:00', '12:30'];

      validTimes.forEach(time => {
        testPack.settings.notificationTime = time;
        expect(() => {
          notificationService.scheduleNotification(testPack);
        }).not.toThrow();
      });
    });

    it('should reject invalid time formats', () => {
      const invalidTimes = ['25:00', '12:60', 'abc', '9:00', '12:5'];

      invalidTimes.forEach(time => {
        testPack.settings.notificationTime = time;
        notificationService.scheduleNotification(testPack);

        expect(mockNotice).toHaveBeenCalledWith(
          expect.stringContaining('Failed to schedule notification'),
          undefined
        );

        jest.clearAllMocks();
      });
    });
  });
});