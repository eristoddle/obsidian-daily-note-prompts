/**
 * Notification service implementation for the Daily Prompts plugin
 * Handles timer-based notification scheduling, timezone management, and dual notification delivery
 */

import { Notice, Plugin } from 'obsidian';
import { INotificationService } from './interfaces';
import { Prompt, PromptPack } from './types';

interface ScheduledNotification {
  packId: string;
  timeoutId: NodeJS.Timeout;
  scheduledTime: Date;
  nextNotificationTime: Date;
}

interface NotificationPermissionState {
  granted: boolean;
  requested: boolean;
  lastChecked: Date;
}

export class NotificationService implements INotificationService {
  private plugin: Plugin;
  private scheduledNotifications: Map<string, ScheduledNotification> = new Map();
  private permissionState: NotificationPermissionState = {
    granted: false,
    requested: false,
    lastChecked: new Date(0)
  };
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL_MS = 60000; // Check every minute
  private readonly PERMISSION_RECHECK_HOURS = 24; // Recheck permissions every 24 hours

  constructor(plugin: Plugin) {
    this.plugin = plugin;
    this.initializePermissions();
    this.startPeriodicCheck();
  }

  /**
   * Initialize notification permissions and check system capabilities
   */
  private async initializePermissions(): Promise<void> {
    try {
      // Check if we're in a browser environment with Notification API
      if (typeof window !== 'undefined' && 'Notification' in window) {
        const permission = Notification.permission;

        if (permission === 'granted') {
          this.permissionState.granted = true;
        } else if (permission === 'denied') {
          this.permissionState.granted = false;
          this.permissionState.requested = true;
        } else {
          // Permission is 'default', we haven't requested yet
          this.permissionState.granted = false;
          this.permissionState.requested = false;
        }
      }

      this.permissionState.lastChecked = new Date();
    } catch (error) {
      console.warn('Daily Prompts: Failed to initialize notification permissions:', error);
      this.permissionState.granted = false;
    }
  }

  /**
   * Request system notification permissions if not already granted
   */
  private async requestNotificationPermission(): Promise<boolean> {
    try {
      if (typeof window === 'undefined' || !('Notification' in window)) {
        return false;
      }

      if (Notification.permission === 'granted') {
        this.permissionState.granted = true;
        return true;
      }

      if (Notification.permission === 'denied') {
        this.permissionState.granted = false;
        this.permissionState.requested = true;
        return false;
      }

      // Request permission
      const permission = await Notification.requestPermission();
      this.permissionState.granted = permission === 'granted';
      this.permissionState.requested = true;
      this.permissionState.lastChecked = new Date();

      return this.permissionState.granted;
    } catch (error) {
      console.warn('Daily Prompts: Failed to request notification permission:', error);
      return false;
    }
  }

  /**
   * Start periodic check for missed notifications and permission updates
   */
  private startPeriodicCheck(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    this.checkInterval = setInterval(() => {
      this.checkMissedNotifications();
      this.recheckPermissionsIfNeeded();
    }, this.CHECK_INTERVAL_MS);
  }

  /**
   * Recheck permissions periodically in case user changed them in browser settings
   */
  private recheckPermissionsIfNeeded(): void {
    const hoursSinceLastCheck = (Date.now() - this.permissionState.lastChecked.getTime()) / (1000 * 60 * 60);

    if (hoursSinceLastCheck >= this.PERMISSION_RECHECK_HOURS) {
      this.initializePermissions();
    }
  }

  /**
   * Parse time string (HH:MM) and return next occurrence as Date
   */
  private parseNotificationTime(timeString: string, baseDate: Date = new Date()): Date {
    const [hours, minutes] = timeString.split(':').map(num => parseInt(num, 10));

    if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      throw new Error(`Invalid time format: ${timeString}. Expected HH:MM format.`);
    }

    const notificationTime = new Date(baseDate);
    notificationTime.setHours(hours, minutes, 0, 0);

    // If the time has already passed today, schedule for tomorrow
    if (notificationTime <= baseDate) {
      notificationTime.setDate(notificationTime.getDate() + 1);
    }

    return notificationTime;
  }

  /**
   * Calculate delay in milliseconds until next notification time
   */
  private calculateNotificationDelay(notificationTime: Date): number {
    const now = new Date();
    const delay = notificationTime.getTime() - now.getTime();

    // Ensure we don't schedule negative delays
    return Math.max(0, delay);
  }

  /**
   * Schedule a notification for a prompt pack
   */
  scheduleNotification(pack: PromptPack): void {
    try {
      // Cancel existing notification for this pack
      this.cancelNotification(pack.id);

      // Skip if notifications are disabled for this pack
      if (!pack.settings.notificationEnabled) {
        return;
      }

      // Parse the notification time
      const nextNotificationTime = this.parseNotificationTime(pack.settings.notificationTime);
      const delay = this.calculateNotificationDelay(nextNotificationTime);

      // Schedule the notification
      const timeoutId = setTimeout(() => {
        this.triggerNotification(pack);
      }, delay);

      // Store the scheduled notification
      const scheduledNotification: ScheduledNotification = {
        packId: pack.id,
        timeoutId,
        scheduledTime: new Date(),
        nextNotificationTime
      };

      this.scheduledNotifications.set(pack.id, scheduledNotification);

      console.log(`Daily Prompts: Scheduled notification for pack "${pack.name}" at ${nextNotificationTime.toLocaleString()}`);
    } catch (error) {
      console.error(`Daily Prompts: Failed to schedule notification for pack "${pack.name}":`, error);

      // Show user-friendly error message
      new Notice(`Failed to schedule notification for "${pack.name}": ${error.message}`);
    }
  }

  /**
   * Cancel a scheduled notification for a prompt pack
   */
  cancelNotification(packId: string): void {
    const scheduledNotification = this.scheduledNotifications.get(packId);

    if (scheduledNotification) {
      clearTimeout(scheduledNotification.timeoutId);
      this.scheduledNotifications.delete(packId);
      console.log(`Daily Prompts: Cancelled notification for pack ID: ${packId}`);
    }
  }

  /**
   * Reschedule a notification (cancel and schedule again)
   */
  rescheduleNotification(pack: PromptPack): void {
    this.cancelNotification(pack.id);
    this.scheduleNotification(pack);
  }

  /**
   * Trigger a notification when the scheduled time arrives
   */
  private async triggerNotification(pack: PromptPack): Promise<void> {
    try {
      // Get the next prompt for this pack
      const promptService = (this.plugin as any).promptService;
      if (!promptService) {
        console.error('Daily Prompts: Prompt service not available');
        return;
      }

      const nextPrompt = await promptService.getNextPrompt(pack.id);
      if (!nextPrompt) {
        console.log(`Daily Prompts: No more prompts available for pack "${pack.name}"`);
        return;
      }

      // Show the notification
      this.showNotification(nextPrompt, pack);

      // Reschedule for tomorrow
      this.scheduleNotification(pack);
    } catch (error) {
      console.error(`Daily Prompts: Failed to trigger notification for pack "${pack.name}":`, error);
    }
  }

  /**
   * Show a notification using the appropriate method (system or Obsidian)
   */
  showNotification(prompt: Prompt, pack: PromptPack): void {
    const notificationType = pack.settings.notificationType;

    if (notificationType === 'system' && this.canShowSystemNotifications()) {
      this.showSystemNotification(prompt, pack);
    } else {
      this.showObsidianNotification(prompt, pack);
    }
  }

  /**
   * Check if system notifications can be shown
   */
  private canShowSystemNotifications(): boolean {
    return (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      this.permissionState.granted &&
      Notification.permission === 'granted'
    );
  }

  /**
   * Show a system notification using the browser's Notification API
   */
  private showSystemNotification(prompt: Prompt, pack: PromptPack): void {
    try {
      const title = `Daily Prompt: ${pack.name}`;
      const body = this.formatPromptForNotification(prompt);
      const icon = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJMMTMuMDkgOC4yNkwyMCA5TDEzLjA5IDE1Ljc0TDEyIDIyTDEwLjkxIDE1Ljc0TDQgOUwxMC45MSA4LjI2TDEyIDJaIiBmaWxsPSIjNjY2NjY2Ii8+Cjwvc3ZnPgo=';

      const notification = new Notification(title, {
        body,
        icon,
        tag: `daily-prompt-${pack.id}`, // Prevent duplicate notifications
        requireInteraction: true, // Keep notification visible until user interacts
        actions: [
          { action: 'open', title: 'Open Prompt' },
          { action: 'dismiss', title: 'Dismiss' }
        ]
      });

      // Handle notification click
      notification.onclick = () => {
        this.handleNotificationClick(prompt, pack);
        notification.close();
      };

      // Handle notification actions (if supported)
      if ('addEventListener' in notification) {
        notification.addEventListener('notificationclick', (event: any) => {
          if (event.action === 'open') {
            this.handleNotificationClick(prompt, pack);
          }
          notification.close();
        });
      }

      // Auto-close after 30 seconds if not interacted with
      setTimeout(() => {
        notification.close();
      }, 30000);

      console.log(`Daily Prompts: Showed system notification for pack "${pack.name}"`);
    } catch (error) {
      console.error('Daily Prompts: Failed to show system notification:', error);
      // Fallback to Obsidian notification
      this.showObsidianNotification(prompt, pack);
    }
  }

  /**
   * Show an Obsidian Notice notification
   */
  private showObsidianNotification(prompt: Prompt, pack: PromptPack): void {
    try {
      const message = `📝 Daily Prompt: ${pack.name}\n\n${this.formatPromptForNotification(prompt)}`;

      const notice = new Notice(message, 0); // 0 = don't auto-dismiss

      // Create clickable notice by adding event listener to the notice element
      const noticeEl = notice.noticeEl;
      noticeEl.style.cursor = 'pointer';
      noticeEl.style.userSelect = 'none';

      // Add click handler
      const clickHandler = () => {
        this.handleNotificationClick(prompt, pack);
        notice.hide();
        noticeEl.removeEventListener('click', clickHandler);
      };

      noticeEl.addEventListener('click', clickHandler);

      // Add dismiss button
      const dismissButton = noticeEl.createEl('button', {
        text: '✕',
        cls: 'daily-prompts-dismiss-btn'
      });
      dismissButton.style.cssText = `
        position: absolute;
        top: 5px;
        right: 5px;
        background: none;
        border: none;
        font-size: 16px;
        cursor: pointer;
        opacity: 0.7;
        padding: 2px 6px;
      `;

      dismissButton.addEventListener('click', (e) => {
        e.stopPropagation();
        notice.hide();
      });

      // Auto-dismiss after 30 seconds
      setTimeout(() => {
        if (notice.noticeEl.parentNode) {
          notice.hide();
        }
      }, 30000);

      console.log(`Daily Prompts: Showed Obsidian notification for pack "${pack.name}"`);
    } catch (error) {
      console.error('Daily Prompts: Failed to show Obsidian notification:', error);
    }
  }

  /**
   * Format prompt content for notification display
   */
  private formatPromptForNotification(prompt: Prompt): string {
    let content = prompt.content;

    // Truncate long content for notifications
    const maxLength = 150;
    if (content.length > maxLength) {
      content = content.substring(0, maxLength) + '...';
    }

    // Remove markdown formatting for cleaner notification text
    content = content
      .replace(/[#*_`]/g, '') // Remove markdown symbols
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Convert links to text
      .replace(/\n+/g, ' ') // Replace newlines with spaces
      .trim();

    return content;
  }

  /**
   * Handle notification click - open the prompt in daily note
   */
  private async handleNotificationClick(prompt: Prompt, pack: PromptPack): Promise<void> {
    try {
      // Focus the Obsidian window if it's not already focused
      if (typeof window !== 'undefined' && window.focus) {
        window.focus();
      }

      // Get the daily note service
      const dailyNoteService = (this.plugin as any).dailyNoteService;
      if (!dailyNoteService) {
        console.error('Daily Prompts: Daily note service not available');
        new Notice('Failed to open prompt: Daily note service unavailable');
        return;
      }

      // Create or open today's daily note
      const dailyNote = await dailyNoteService.createOrOpenDailyNote();

      // Insert the prompt into the daily note
      await dailyNoteService.insertPrompt(prompt, dailyNote);

      // Enable zen mode if configured
      if (pack.settings.zenModeEnabled) {
        dailyNoteService.enableZenMode();
      }

      // Mark the prompt as accessed (not necessarily completed)
      const promptService = (this.plugin as any).promptService;
      if (promptService) {
        // Update last access time in progress
        const progress = promptService.getProgress(pack.id);
        progress.lastAccessDate = new Date();
        await (this.plugin as any).progressStore?.updateProgress(pack.id, progress);
      }

      console.log(`Daily Prompts: Opened prompt from notification for pack "${pack.name}"`);
    } catch (error) {
      console.error('Daily Prompts: Failed to handle notification click:', error);
      new Notice(`Failed to open prompt: ${error.message}`);
    }
  }

  /**
   * Check for missed notifications and handle them appropriately
   */
  async checkMissedNotifications(): Promise<void> {
    try {
      const now = new Date();
      const missedNotifications: { pack: PromptPack; missedTime: Date }[] = [];

      // Check each scheduled notification
      this.scheduledNotifications.forEach((scheduled, packId) => {
        // If the scheduled time has passed and we haven't triggered it
        if (scheduled.nextNotificationTime <= now) {
          // Get the pack to check if it still exists and has notifications enabled
          const settings = (this.plugin as any).settings;
          const pack = settings?.getPromptPack(packId);

          if (pack && pack.settings.notificationEnabled) {
            missedNotifications.push({
              pack,
              missedTime: scheduled.nextNotificationTime
            });
          }

          // Remove the expired scheduled notification
          this.cancelNotification(packId);
        }
      });

      // Handle missed notifications
      for (const { pack, missedTime } of missedNotifications) {
        console.log(`Daily Prompts: Detected missed notification for pack "${pack.name}" at ${missedTime.toLocaleString()}`);

        // Show a catch-up notification
        this.showMissedNotification(pack, missedTime);

        // Reschedule for the next occurrence
        this.scheduleNotification(pack);
      }
    } catch (error) {
      console.error('Daily Prompts: Failed to check missed notifications:', error);
    }
  }

  /**
   * Show a notification for a missed prompt
   */
  private showMissedNotification(pack: PromptPack, missedTime: Date): void {
    try {
      const timeString = missedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const message = `⏰ Missed Daily Prompt from ${timeString}\n\nPack: ${pack.name}\n\nClick to catch up with today's prompt.`;

      const notice = new Notice(message, 0); // Don't auto-dismiss

      // Make notice clickable
      const noticeEl = notice.noticeEl;
      noticeEl.style.cursor = 'pointer';
      noticeEl.style.backgroundColor = '#ffeaa7'; // Light yellow background for missed notifications

      const clickHandler = async () => {
        try {
          // Get the next prompt and show it
          const promptService = (this.plugin as any).promptService;
          if (promptService) {
            const nextPrompt = await promptService.getNextPrompt(pack.id);
            if (nextPrompt) {
              await this.handleNotificationClick(nextPrompt, pack);
            } else {
              new Notice(`No more prompts available in "${pack.name}"`);
            }
          }
        } catch (error) {
          console.error('Daily Prompts: Failed to handle missed notification click:', error);
          new Notice(`Failed to open missed prompt: ${error.message}`);
        }

        notice.hide();
        noticeEl.removeEventListener('click', clickHandler);
      };

      noticeEl.addEventListener('click', clickHandler);

      // Add dismiss button
      const dismissButton = noticeEl.createEl('button', {
        text: '✕',
        cls: 'daily-prompts-dismiss-btn'
      });
      dismissButton.style.cssText = `
        position: absolute;
        top: 5px;
        right: 5px;
        background: none;
        border: none;
        font-size: 16px;
        cursor: pointer;
        opacity: 0.7;
        padding: 2px 6px;
      `;

      dismissButton.addEventListener('click', (e) => {
        e.stopPropagation();
        notice.hide();
      });

      // Auto-dismiss after 60 seconds (longer for missed notifications)
      setTimeout(() => {
        if (notice.noticeEl.parentNode) {
          notice.hide();
        }
      }, 60000);

      console.log(`Daily Prompts: Showed missed notification for pack "${pack.name}"`);
    } catch (error) {
      console.error('Daily Prompts: Failed to show missed notification:', error);
    }
  }

  /**
   * Get information about scheduled notifications
   */
  getScheduledNotifications(): Array<{ packId: string; nextNotificationTime: Date }> {
    return Array.from(this.scheduledNotifications.values()).map(scheduled => ({
      packId: scheduled.packId,
      nextNotificationTime: scheduled.nextNotificationTime
    }));
  }

  /**
   * Check if notifications are supported in the current environment
   */
  isNotificationSupported(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window;
  }

  /**
   * Get current notification permission status
   */
  getPermissionStatus(): { granted: boolean; requested: boolean; supported: boolean } {
    return {
      granted: this.permissionState.granted,
      requested: this.permissionState.requested,
      supported: this.isNotificationSupported()
    };
  }

  /**
   * Request notification permissions (public method)
   */
  async requestPermissions(): Promise<boolean> {
    return await this.requestNotificationPermission();
  }

  /**
   * Clean up resources when the service is destroyed
   */
  destroy(): void {
    // Cancel all scheduled notifications
    this.scheduledNotifications.forEach((_, packId) => {
      this.cancelNotification(packId);
    });

    // Clear the periodic check interval
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    console.log('Daily Prompts: Notification service destroyed');
  }
}