/**
 * Unit tests for notification scheduling logic
 */

import { NotificationService } from '../notification-service';
import { PromptPack, PromptPackSettings } from '../models';

// Mock global APIs
const mockSetTimeout = jest.fn();
const mockClearTimeout = jest.fn();
const mockSetInterval = jest.fn();
const mockClearInterval = jest.fn();

global.setTimeout = mockSetTimeout as any;
global.clearTimeout = mockClearTimeout as any;
global.setInterval = mockSetInterval as any;
global.clearInterval = mockClearInterval as any;

// Mock Notification API
Object.defineProperty(global, 'Notification', {
  value: jest.fn(),
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

// Mock Notice
global.Notice = jest.fn() as any;

// Mock plugin
const mockPlugin = {
  promptService: {
    getNextPrompt: jest.fn(),
    getProgress: jest.fn().mockReturnValue({ completedPrompts: new Set() })
  },
  dailyNoteService: {
    createOrOpenDailyNote: jest.fn(),
    insertPrompt: jest.fn(),
    enableZenMode: jest.fn()
  },
  progressStore: {
    updateProgress: jest.fn()
  },
  settings: {
    getPromptPack: jest.fn()
  }
};

describe('NotificationService - Scheduling Logic', () => {
  let notificationService: NotificationService;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset time mocks
    mockSetTimeout.mockClear();
    mockClearTimeout.mockClear();
    mockSetInterval.mockClear();
    mockClearInterval.mockClear();

    notificationService = new NotificationService(mockPlugin as any);
  });

  afterEach(() => {
    notificationService.destroy();
  });

  describe('time parsing and validation', () => {
    it('should parse valid time formats correctly', () => {
      const parseTime = (notificationService as any).parseNotificationTime;

      expect(parseTime('09:00')).toEqual({ hours: 9, minutes: 0 });
      expect(parseTime('23:59')).toEqual({ hours: 23, minutes: 59 });
      expect(parseTime('00:00')).toEqual({ hours: 0, minutes: 0 });
      expect(parseTime('12:30')).toEqual({ hours: 12, minutes: 30 });
    });

    it('should reject invalid time formats', () => {
      const parseTime = (notificationService as any).parseNotificationTime;

      expect(() => parseTime('25:00')).toThrow('Invalid time format');
      expect(() => parseTime('12:60')).toThrow('Invalid time format');
      expect(() => parseTime('abc')).toThrow('Invalid time format');
      expect(() => parseTime('9:00')).toThrow('Invalid time format'); // Single digit hour
      expect(() => parseTime('12:5')).toThrow('Invalid time format'); // Single digit minute
    });

    it('should validate time format with regex', () => {
      const isValidTimeFormat = (notificationService as any).isValidTimeFormat;

      expect(isValidTimeFormat('09:00')).toBe(true);
      expect(isValidTimeFormat('23:59')).toBe(true);
      expect(isValidTimeFormat('00:00')).toBe(true);

      expect(isValidTimeFormat('25:00')).toBe(false);
      expect(isValidTimeFormat('12:60')).toBe(false);
      expect(isValidTimeFormat('9:00')).toBe(false);
      expect(isValidTimeFormat('12:5')).toBe(false);
      expect(isValidTimeFormat('abc')).toBe(false);
    });
  });

  describe('notification time calculation', () => {
    beforeEach(() => {
      // Mock current time to 2024-01-15 08:00:00
      jest.spyOn(Date, 'now').mockReturnValue(new Date('2024-01-15T08:00:00Z').getTime());
      jest.spyOn(global, 'Date').mockImplementation(((...args) => {
        if (args.length === 0) {
          return new Date('2024-01-15T08:00:00Z');
        }
        return new (Date as any)(...args);
      }) as any);
    });

    afterEach(() => {
      (Date.now as jest.Mock).mockRestore();
      (global.Date as any).mockRestore();
    });

    it('should calculate next notification time for same day when time has not passed', () => {
      const calculateNextNotificationTime = (notificationService as any).calculateNextNotificationTime;

      // Current time: 08:00, notification time: 09:00
      const nextTime = calculateNextNotificationTime('09:00');

      expect(nextTime.getHours()).toBe(9);
      expect(nextTime.getMinutes()).toBe(0);
      expect(nextTime.getDate()).toBe(15); // Same day
    });

    it('should calculate next notification time for next day when time has passed', () => {
      // Mock current time to 10:00 (after 09:00 notification time)
      (Date.now as jest.Mock).mockReturnValue(new Date('2024-01-15T10:00:00Z').getTime());
      (global.Date as any).mockImplementation(((...args) => {
        if (args.length === 0) {
          return new Date('2024-01-15T10:00:00Z');
        }
        return new (Date as any)(...args);
      }) as any);

      const calculateNextNotificationTime = (notificationService as any).calculateNextNotificationTime;

      const nextTime = calculateNextNotificationTime('09:00');

      expect(nextTime.getHours()).toBe(9);
      expect(nextTime.getMinutes()).toBe(0);
      expect(nextTime.getDate()).toBe(16); // Next day
    });

    it('should handle timezone correctly', () => {
      const calculateNextNotificationTime = (notificationService as any).calculateNextNotificationTime;

      const nextTime = calculateNextNotificationTime('09:00');

      // Should create time in local timezone
      expect(nextTime instanceof Date).toBe(true);
      expect(nextTime.getHours()).toBe(9);
    });

    it('should calculate milliseconds until notification correctly', () => {
      const calculateMillisecondsUntilNotification = (notificationService as any).calculateMillisecondsUntilNotification;

      // Current: 08:00, target: 09:00 = 1 hour = 3600000ms
      const ms = calculateMillisecondsUntilNotification('09:00');

      expect(ms).toBe(3600000); // 1 hour in milliseconds
    });

    it('should handle edge case of notification time being exactly now', () => {
      // Mock current time to exactly 09:00
      (Date.now as jest.Mock).mockReturnValue(new Date('2024-01-15T09:00:00Z').getTime());
      (global.Date as any).mockImplementation(((...args) => {
        if (args.length === 0) {
          return new Date('2024-01-15T09:00:00Z');
        }
        return new (Date as any)(...args);
      }) as any);

      const calculateNextNotificationTime = (notificationService as any).calculateNextNotificationTime;

      const nextTime = calculateNextNotificationTime('09:00');

      // Should schedule for next day since current time equals notification time
      expect(nextTime.getDate()).toBe(16);
    });
  });

  describe('notification scheduling', () => {
    let testPack: PromptPack;

    beforeEach(() => {
      testPack = new PromptPack({
        name: 'Test Pack',
        type: 'Sequential',
        settings: new PromptPackSettings({
          notificationEnabled: true,
          notificationTime: '09:00',
          notificationType: 'obsidian'
        })
      });

      // Mock time calculation
      jest.spyOn(notificationService as any, 'calculateMillisecondsUntilNotification')
        .mockReturnValue(3600000); // 1 hour
    });

    it('should schedule notification with correct timeout', () => {
      notificationService.scheduleNotification(testPack);

      expect(mockSetTimeout).toHaveBeenCalledWith(
        expect.any(Function),
        3600000
      );
    });

    it('should store scheduled notification info', () => {
      notificationService.scheduleNotification(testPack);

      const scheduled = notificationService.getScheduledNotifications();
      expect(scheduled).toHaveLength(1);
      expect(scheduled[0].packId).toBe(testPack.id);
      expect(scheduled[0].notificationTime).toBe('09:00');
    });

    it('should not schedule when notifications are disabled', () => {
      testPack.settings.notificationEnabled = false;

      notificationService.scheduleNotification(testPack);

      expect(mockSetTimeout).not.toHaveBeenCalled();
      expect(notificationService.getScheduledNotifications()).toHaveLength(0);
    });

    it('should cancel existing notification when rescheduling', () => {
      // Schedule first notification
      notificationService.scheduleNotification(testPack);
      const firstTimeoutId = mockSetTimeout.mock.results[0].value;

      // Schedule again
      notificationService.scheduleNotification(testPack);

      expect(mockClearTimeout).toHaveBeenCalledWith(firstTimeoutId);
      expect(mockSetTimeout).toHaveBeenCalledTimes(2);
    });

    it('should handle invalid time format gracefully', () => {
      testPack.settings.notificationTime = 'invalid-time';

      notificationService.scheduleNotification(testPack);

      expect(mockSetTimeout).not.toHaveBeenCalled();
      expect(global.Notice).toHaveBeenCalledWith(
        expect.stringContaining('Failed to schedule notification'),
        undefined
      );
    });

    it('should reschedule after notification fires', () => {
      notificationService.scheduleNotification(testPack);

      // Get the callback function passed to setTimeout
      const notificationCallback = mockSetTimeout.mock.calls[0][0];

      // Clear mocks to track rescheduling
      mockSetTimeout.mockClear();

      // Execute the callback (simulate notification firing)
      notificationCallback();

      // Should reschedule for next day
      expect(mockSetTimeout).toHaveBeenCalledWith(
        expect.any(Function),
        3600000
      );
    });
  });

  describe('notification cancellation', () => {
    let testPack: PromptPack;

    beforeEach(() => {
      testPack = new PromptPack({
        name: 'Test Pack',
        type: 'Sequential',
        settings: new PromptPackSettings({
          notificationEnabled: true,
          notificationTime: '09:00'
        })
      });

      jest.spyOn(notificationService as any, 'calculateMillisecondsUntilNotification')
        .mockReturnValue(3600000);
    });

    it('should cancel scheduled notification', () => {
      notificationService.scheduleNotification(testPack);
      const timeoutId = mockSetTimeout.mock.results[0].value;

      notificationService.cancelNotification(testPack.id);

      expect(mockClearTimeout).toHaveBeenCalledWith(timeoutId);
      expect(notificationService.getScheduledNotifications()).toHaveLength(0);
    });

    it('should handle cancelling non-existent notification', () => {
      notificationService.cancelNotification('non-existent-id');

      expect(mockClearTimeout).not.toHaveBeenCalled();
    });

    it('should cancel all notifications on destroy', () => {
      const pack1 = { ...testPack, id: 'pack1' };
      const pack2 = { ...testPack, id: 'pack2' };

      notificationService.scheduleNotification(pack1 as any);
      notificationService.scheduleNotification(pack2 as any);

      const timeoutId1 = mockSetTimeout.mock.results[0].value;
      const timeoutId2 = mockSetTimeout.mock.results[1].value;

      notificationService.destroy();

      expect(mockClearTimeout).toHaveBeenCalledWith(timeoutId1);
      expect(mockClearTimeout).toHaveBeenCalledWith(timeoutId2);
      expect(mockClearInterval).toHaveBeenCalled(); // Periodic check interval
    });
  });

  describe('periodic missed notification check', () => {
    it('should start periodic check on initialization', () => {
      expect(mockSetInterval).toHaveBeenCalledWith(
        expect.any(Function),
        60000 // 1 minute
      );
    });

    it('should check for missed notifications periodically', async () => {
      const checkMissedNotifications = jest.spyOn(notificationService, 'checkMissedNotifications')
        .mockResolvedValue();

      // Get the periodic check callback
      const periodicCallback = mockSetInterval.mock.calls[0][0];

      // Execute the callback
      await periodicCallback();

      expect(checkMissedNotifications).toHaveBeenCalled();
    });

    it('should handle errors in periodic check gracefully', async () => {
      jest.spyOn(notificationService, 'checkMissedNotifications')
        .mockRejectedValue(new Error('Check failed'));

      const periodicCallback = mockSetInterval.mock.calls[0][0];

      // Should not throw
      await expect(periodicCallback()).resolves.toBeUndefined();
    });

    it('should stop periodic check on destroy', () => {
      const intervalId = mockSetInterval.mock.results[0].value;

      notificationService.destroy();

      expect(mockClearInterval).toHaveBeenCalledWith(intervalId);
    });
  });

  describe('missed notification detection', () => {
    let testPack: PromptPack;

    beforeEach(() => {
      testPack = new PromptPack({
        name: 'Test Pack',
        type: 'Sequential',
        settings: new PromptPackSettings({
          notificationEnabled: true,
          notificationTime: '09:00'
        })
      });

      mockPlugin.settings.getPromptPack.mockReturnValue(testPack);
    });

    it('should detect missed notifications', async () => {
      // Mock current time to be after notification time
      jest.spyOn(Date, 'now').mockReturnValue(new Date('2024-01-15T10:00:00Z').getTime());

      // Schedule a notification (this will set the next notification time)
      notificationService.scheduleNotification(testPack);

      // Manually set the scheduled time to past to simulate missed notification
      const scheduled = notificationService.getScheduledNotifications();
      if (scheduled.length > 0) {
        (scheduled[0] as any).nextNotificationTime = new Date('2024-01-15T09:00:00Z');
      }

      await notificationService.checkMissedNotifications();

      expect(global.Notice).toHaveBeenCalledWith(
        expect.stringContaining('Missed Daily Prompt'),
        0
      );
    });

    it('should not show missed notification for disabled packs', async () => {
      testPack.settings.notificationEnabled = false;
      mockPlugin.settings.getPromptPack.mockReturnValue(testPack);

      await notificationService.checkMissedNotifications();

      expect(global.Notice).not.toHaveBeenCalledWith(
        expect.stringContaining('Missed Daily Prompt'),
        expect.any(Number)
      );
    });

    it('should handle missing pack during check', async () => {
      mockPlugin.settings.getPromptPack.mockReturnValue(null);

      // Should not throw
      await expect(notificationService.checkMissedNotifications()).resolves.toBeUndefined();
    });

    it('should only show missed notification once per day', async () => {
      // Mock current time
      jest.spyOn(Date, 'now').mockReturnValue(new Date('2024-01-15T10:00:00Z').getTime());

      notificationService.scheduleNotification(testPack);
      const scheduled = notificationService.getScheduledNotifications();
      if (scheduled.length > 0) {
        (scheduled[0] as any).nextNotificationTime = new Date('2024-01-15T09:00:00Z');
      }

      // First check should show notification
      await notificationService.checkMissedNotifications();
      expect(global.Notice).toHaveBeenCalledWith(
        expect.stringContaining('Missed Daily Prompt'),
        0
      );

      // Clear mock
      (global.Notice as jest.Mock).mockClear();

      // Second check should not show notification again
      await notificationService.checkMissedNotifications();
      expect(global.Notice).not.toHaveBeenCalledWith(
        expect.stringContaining('Missed Daily Prompt'),
        expect.any(Number)
      );
    });
  });

  describe('notification time edge cases', () => {
    it('should handle daylight saving time transitions', () => {
      // Mock a DST transition date
      const dstDate = new Date('2024-03-10T08:00:00Z'); // Spring forward date
      jest.spyOn(Date, 'now').mockReturnValue(dstDate.getTime());

      const calculateNextNotificationTime = (notificationService as any).calculateNextNotificationTime;
      const nextTime = calculateNextNotificationTime('09:00');

      expect(nextTime.getHours()).toBe(9);
      expect(nextTime.getMinutes()).toBe(0);
    });

    it('should handle leap year dates', () => {
      const leapYearDate = new Date('2024-02-29T08:00:00Z');
      jest.spyOn(Date, 'now').mockReturnValue(leapYearDate.getTime());

      const calculateNextNotificationTime = (notificationService as any).calculateNextNotificationTime;
      const nextTime = calculateNextNotificationTime('09:00');

      expect(nextTime.getDate()).toBe(29);
      expect(nextTime.getMonth()).toBe(1); // February
    });

    it('should handle year boundary transitions', () => {
      const newYearEve = new Date('2023-12-31T23:30:00Z');
      jest.spyOn(Date, 'now').mockReturnValue(newYearEve.getTime());

      const calculateNextNotificationTime = (notificationService as any).calculateNextNotificationTime;
      const nextTime = calculateNextNotificationTime('09:00');

      expect(nextTime.getFullYear()).toBe(2024);
      expect(nextTime.getMonth()).toBe(0); // January
      expect(nextTime.getDate()).toBe(1);
    });

    it('should handle different timezones consistently', () => {
      // Test with different timezone offsets
      const originalTimezoneOffset = Date.prototype.getTimezoneOffset;

      // Mock different timezone offset
      Date.prototype.getTimezoneOffset = jest.fn().mockReturnValue(-480); // PST

      const calculateNextNotificationTime = (notificationService as any).calculateNextNotificationTime;
      const nextTime = calculateNextNotificationTime('09:00');

      expect(nextTime.getHours()).toBe(9);

      // Restore original method
      Date.prototype.getTimezoneOffset = originalTimezoneOffset;
    });
  });

  describe('notification scheduling state management', () => {
    it('should maintain correct state when multiple packs are scheduled', () => {
      const pack1 = new PromptPack({
        name: 'Pack 1',
        type: 'Sequential',
        settings: new PromptPackSettings({
          notificationEnabled: true,
          notificationTime: '09:00'
        })
      });

      const pack2 = new PromptPack({
        name: 'Pack 2',
        type: 'Random',
        settings: new PromptPackSettings({
          notificationEnabled: true,
          notificationTime: '14:00'
        })
      });

      notificationService.scheduleNotification(pack1);
      notificationService.scheduleNotification(pack2);

      const scheduled = notificationService.getScheduledNotifications();
      expect(scheduled).toHaveLength(2);
      expect(scheduled.find(s => s.packId === pack1.id)?.notificationTime).toBe('09:00');
      expect(scheduled.find(s => s.packId === pack2.id)?.notificationTime).toBe('14:00');
    });

    it('should update state when pack settings change', () => {
      const testPack = new PromptPack({
        name: 'Test Pack',
        type: 'Sequential',
        settings: new PromptPackSettings({
          notificationEnabled: true,
          notificationTime: '09:00'
        })
      });

      notificationService.scheduleNotification(testPack);
      expect(notificationService.getScheduledNotifications()).toHaveLength(1);

      // Change notification time
      testPack.settings.notificationTime = '14:00';
      notificationService.scheduleNotification(testPack);

      const scheduled = notificationService.getScheduledNotifications();
      expect(scheduled).toHaveLength(1);
      expect(scheduled[0].notificationTime).toBe('14:00');
    });

    it('should remove from state when notifications are disabled', () => {
      const testPack = new PromptPack({
        name: 'Test Pack',
        type: 'Sequential',
        settings: new PromptPackSettings({
          notificationEnabled: true,
          notificationTime: '09:00'
        })
      });

      notificationService.scheduleNotification(testPack);
      expect(notificationService.getScheduledNotifications()).toHaveLength(1);

      // Disable notifications
      testPack.settings.notificationEnabled = false;
      notificationService.scheduleNotification(testPack);

      expect(notificationService.getScheduledNotifications()).toHaveLength(0);
    });
  });
});