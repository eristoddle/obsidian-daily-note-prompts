/**
 * Settings tab interface for the Daily Prompts plugin
 */

import { App, PluginSettingTab, Setting, Notice, Modal, ButtonComponent, TextComponent, DropdownComponent } from 'obsidian';
import { SettingsManager } from './settings-manager';
import { PromptPack, PromptPackSettings, GlobalSettings, ValidationError } from './models';
import { PromptPackType, NotificationType, LinkHandling } from './types';
import { PromptPackModal } from './prompt-pack-modal';

export class DailyPromptsSettingsTab extends PluginSettingTab {
  private settingsManager: SettingsManager;

  constructor(app: App, plugin: any, settingsManager: SettingsManager) {
    super(app, plugin);
    this.settingsManager = settingsManager;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('daily-prompts-settings');

    this.containerEl = containerEl;

    // Add main title
    containerEl.createEl('h2', { text: 'Daily Prompts Settings' });

    // Display global settings
    this.displayGlobalSettings();

    // Display prompt pack management
    this.displayPromptPackManagement();

    // Display statistics
    this.displayStatistics();
  }

  /**
   * Display global settings section
   */
  private displayGlobalSettings(): void {
    const globalSettings = this.settingsManager.getGlobalSettings();

    // Global Settings Section
    const globalSection = this.containerEl.createDiv('daily-prompts-section');
    globalSection.createEl('h3', { text: 'Global Settings' });

    // Default notification time
    let timeValidationTimeout: NodeJS.Timeout;
    new Setting(globalSection)
      .setName('Default notification time')
      .setDesc('Default time for new prompt pack notifications (HH:MM format)')
      .addText(text => {
        text
          .setPlaceholder('09:00')
          .setValue(globalSettings.defaultNotificationTime)
          .onChange(async (value) => {
            // Clear previous timeout
            if (timeValidationTimeout) {
              clearTimeout(timeValidationTimeout);
            }

            // Debounce validation to allow typing
            timeValidationTimeout = setTimeout(async () => {
              try {
                // Only validate if the field is not empty and looks like it might be complete
                if (value.trim() === '') {
                  return; // Allow empty during editing
                }

                // Validate time format
                if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value)) {
                  // Don't show error for partial input (like "1" or "14:")
                  if (value.length >= 4) {
                    this.showError('Invalid time format. Use HH:MM format (e.g., 09:00)');
                  }
                  return;
                }

                await this.settingsManager.updateGlobalSettings({
                  defaultNotificationTime: value
                });

                this.showSuccess('Default notification time updated');
              } catch (error) {
                this.showError(`Failed to update time: ${error.message}`);
              }
            }, 1000); // 1 second delay
          });

        // Add blur event listener manually to the input element
        const inputEl = text.inputEl;
        inputEl.addEventListener('blur', async () => {
          // Clear any pending timeout
          if (timeValidationTimeout) {
            clearTimeout(timeValidationTimeout);
          }

          // Validate on blur (when user leaves the field)
          const value = text.getValue();
          try {
            if (value.trim() === '') {
              // Reset to previous value if empty
              text.setValue(globalSettings.defaultNotificationTime);
              return;
            }

            if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value)) {
              this.showError('Invalid time format. Use HH:MM format (e.g., 09:00)');
              text.setValue(globalSettings.defaultNotificationTime);
              return;
            }

            await this.settingsManager.updateGlobalSettings({
              defaultNotificationTime: value
            });
          } catch (error) {
            this.showError(`Failed to update time: ${error.message}`);
            text.setValue(globalSettings.defaultNotificationTime);
          }
        });
      });

    // Default zen mode
    new Setting(globalSection)
      .setName('Default zen mode')
      .setDesc('Enable zen mode by default for new prompt packs')
      .addToggle(toggle => {
        toggle
          .setValue(globalSettings.defaultZenMode)
          .onChange(async (value) => {
            try {
              await this.settingsManager.updateGlobalSettings({
                defaultZenMode: value
              });
              this.showSuccess('Default zen mode updated');
            } catch (error) {
              this.showError(`Failed to update zen mode: ${error.message}`);
            }
          });
      });

    // Daily note folder
    new Setting(globalSection)
      .setName('Daily note folder')
      .setDesc('Folder path for daily notes (leave empty for vault root)')
      .addText(text => {
        text
          .setPlaceholder('Daily Notes')
          .setValue(globalSettings.dailyNoteFolder)
          .onChange(async (value) => {
            try {
              await this.settingsManager.updateGlobalSettings({
                dailyNoteFolder: value
              });
              this.showSuccess('Daily note folder updated');
            } catch (error) {
              this.showError(`Failed to update folder: ${error.message}`);
            }
          });
      });

    // Daily note template
    new Setting(globalSection)
      .setName('Daily note template')
      .setDesc('Template for daily note creation (supports {{date}}, {{prompt}} placeholders)')
      .addTextArea(text => {
        text
          .setPlaceholder('# {{date}}\n\n## Daily Prompt\n{{prompt}}\n\n')
          .setValue(globalSettings.dailyNoteTemplate)
          .onChange(async (value) => {
            try {
              await this.settingsManager.updateGlobalSettings({
                dailyNoteTemplate: value
              });
              this.showSuccess('Daily note template updated');
            } catch (error) {
              this.showError(`Failed to update template: ${error.message}`);
            }
          });
      });

    // Link handling
    new Setting(globalSection)
      .setName('Link handling')
      .setDesc('How to handle link-type prompts in daily notes')
      .addDropdown(dropdown => {
        dropdown
          .addOption('direct', 'Direct link')
          .addOption('embed', 'Embed content')
          .addOption('reference', 'Reference link')
          .setValue(globalSettings.linkHandling)
          .onChange(async (value: LinkHandling) => {
            try {
              await this.settingsManager.updateGlobalSettings({
                linkHandling: value
              });
              this.showSuccess('Link handling updated');
            } catch (error) {
              this.showError(`Failed to update link handling: ${error.message}`);
            }
          });
      });
  }

  /**
   * Display prompt pack management section
   */
  private displayPromptPackManagement(): void {
    const promptPacks = this.settingsManager.getPromptPacks();

    // Prompt Packs Section
    const packsSection = this.containerEl.createDiv('daily-prompts-section');
    const packsHeader = packsSection.createDiv('daily-prompts-section-header');
    packsHeader.createEl('h3', { text: 'Prompt Packs' });

    // Add new pack button
    const addButton = packsHeader.createEl('button', {
      text: 'Create New Pack',
      cls: 'daily-prompts-button primary'
    });
    addButton.addEventListener('click', () => {
      new PromptPackModal(this.app, this.settingsManager, null, () => {
        this.display(); // Refresh the settings tab
      }).open();
    });

    // Import pack button
    const importButton = packsHeader.createEl('button', {
      text: 'Import Pack',
      cls: 'daily-prompts-button'
    });
    importButton.addEventListener('click', () => {
      this.showImportDialog();
    });

    // Display existing packs
    if (promptPacks.length === 0) {
      const emptyState = packsSection.createDiv('daily-prompts-empty-state');
      emptyState.createEl('p', {
        text: 'No prompt packs created yet. Create your first pack to get started!',
        cls: 'daily-prompts-empty-text'
      });
    } else {
      promptPacks.forEach(pack => {
        this.displayPromptPack(packsSection, pack);
      });
    }
  }

  /**
   * Display a single prompt pack
   */
  private displayPromptPack(container: HTMLElement, pack: PromptPack): void {
    const packEl = container.createDiv('daily-prompts-pack');

    // Pack header
    const header = packEl.createDiv('daily-prompts-pack-header');

    const titleEl = header.createDiv('daily-prompts-pack-title');
    titleEl.createEl('span', { text: pack.name });

    const typeEl = header.createEl('span', {
      text: pack.type,
      cls: 'daily-prompts-pack-type'
    });

    // Completion status badge
    const stats = pack.getStats();
    const statusBadge = header.createEl('span', {
      cls: `daily-prompts-status-badge ${pack.isCompleted() ? 'completed' : 'in-progress'}`
    });
    statusBadge.textContent = pack.isCompleted() ? 'Completed' : 'In Progress';

    // Detailed progress section
    this.displayPackProgress(packEl, pack, stats);

    // Pack settings summary
    const settingsEl = packEl.createDiv('daily-prompts-pack-settings');
    const settingsText = [];

    if (pack.settings.notificationEnabled) {
      settingsText.push(`Notifications: ${pack.settings.notificationTime} (${pack.settings.notificationType})`);
    } else {
      settingsText.push('Notifications: Disabled');
    }

    if (pack.settings.zenModeEnabled) {
      settingsText.push('Zen Mode: Enabled');
    }

    if (pack.settings.dailyNoteIntegration) {
      settingsText.push('Daily Notes: Enabled');
    }

    settingsEl.createEl('div', {
      text: settingsText.join(' • '),
      cls: 'daily-prompts-settings-summary'
    });

    // Pack actions
    const actions = packEl.createDiv('daily-prompts-pack-actions');

    // Edit button
    const editButton = actions.createEl('button', {
      text: 'Edit',
      cls: 'daily-prompts-button'
    });
    editButton.addEventListener('click', () => {
      new PromptPackModal(this.app, this.settingsManager, pack, () => {
        this.display(); // Refresh the settings tab
      }).open();
    });

    // View Progress button
    const progressButton = actions.createEl('button', {
      text: 'View Progress',
      cls: 'daily-prompts-button'
    });
    progressButton.addEventListener('click', () => {
      this.showProgressModal(pack);
    });

    // Export button
    const exportButton = actions.createEl('button', {
      text: 'Export',
      cls: 'daily-prompts-button'
    });
    exportButton.addEventListener('click', () => {
      this.exportPromptPack(pack);
    });

    // Reset progress button
    const resetButton = actions.createEl('button', {
      text: 'Reset Progress',
      cls: 'daily-prompts-button'
    });
    resetButton.addEventListener('click', () => {
      this.resetPackProgress(pack);
    });

    // Archive button (only show for completed packs)
    if (pack.isCompleted()) {
      const archiveButton = actions.createEl('button', {
        text: 'Archive',
        cls: 'daily-prompts-button'
      });
      archiveButton.addEventListener('click', () => {
        this.archivePromptPack(pack);
      });
    }

    // Delete button
    const deleteButton = actions.createEl('button', {
      text: 'Delete',
      cls: 'daily-prompts-button danger'
    });
    deleteButton.addEventListener('click', () => {
      this.deletePromptPack(pack);
    });
  }

  /**
   * Display statistics section
   */
  private displayStatistics(): void {
    const stats = this.settingsManager.getSettingsStats();

    const statsSection = this.containerEl.createDiv('daily-prompts-section');
    statsSection.createEl('h3', { text: 'Statistics' });

    const statsGrid = statsSection.createDiv('daily-prompts-stats-grid');

    // Total packs
    const packsCard = statsGrid.createDiv('daily-prompts-stat-card');
    packsCard.createEl('div', { text: stats.totalPacks.toString(), cls: 'daily-prompts-stat-value' });
    packsCard.createEl('div', { text: 'Total Packs', cls: 'daily-prompts-stat-label' });

    // Total prompts
    const promptsCard = statsGrid.createDiv('daily-prompts-stat-card');
    promptsCard.createEl('div', { text: stats.totalPrompts.toString(), cls: 'daily-prompts-stat-value' });
    promptsCard.createEl('div', { text: 'Total Prompts', cls: 'daily-prompts-stat-label' });

    // Completed prompts
    const completedCard = statsGrid.createDiv('daily-prompts-stat-card');
    completedCard.createEl('div', { text: stats.completedPrompts.toString(), cls: 'daily-prompts-stat-value' });
    completedCard.createEl('div', { text: 'Completed', cls: 'daily-prompts-stat-label' });

    // Overall progress
    const progressCard = statsGrid.createDiv('daily-prompts-stat-card');
    progressCard.createEl('div', { text: `${stats.overallProgress}%`, cls: 'daily-prompts-stat-value' });
    progressCard.createEl('div', { text: 'Overall Progress', cls: 'daily-prompts-stat-label' });
  }

  /**
   * Show import dialog
   */
  private showImportDialog(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (file) {
        try {
          const text = await file.text();
          const data = JSON.parse(text);

          // Validate import format
          if (!data.pack || !data.version) {
            throw new Error('Invalid import format');
          }

          const pack = PromptPack.fromJSON(data.pack);
          await this.settingsManager.addPromptPack(pack);

          this.showSuccess(`Successfully imported "${pack.name}"`);
          this.display(); // Refresh the settings tab
        } catch (error) {
          this.showError(`Failed to import pack: ${error.message}`);
        }
      }
    });
    input.click();
  }

  /**
   * Export a prompt pack
   */
  private async exportPromptPack(pack: PromptPack): Promise<void> {
    try {
      // Use the import/export service to create a clean sharing export
      const { ImportExportService } = await import('./import-export-service');
      const exportService = new ImportExportService(this.app.vault);

      // Export for sharing (removes all personal data)
      const jsonString = await exportService.exportPackForSharing(pack);

      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `${pack.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_shared.json`;
      a.click();

      URL.revokeObjectURL(url);
      this.showSuccess(`Exported "${pack.name}" for sharing (personal data excluded)`);
    } catch (error) {
      this.showError(`Failed to export pack: ${error.message}`);
    }
  }

  /**
   * Reset pack progress
   */
  private resetPackProgress(pack: PromptPack): void {
    const confirmModal = new Modal(this.app);
    confirmModal.titleEl.setText('Reset Progress');
    confirmModal.contentEl.createEl('p', {
      text: `Are you sure you want to reset all progress for "${pack.name}"? This action cannot be undone.`
    });

    const buttonContainer = confirmModal.contentEl.createDiv('daily-prompts-modal-buttons');

    const cancelButton = buttonContainer.createEl('button', {
      text: 'Cancel',
      cls: 'daily-prompts-button'
    });
    cancelButton.addEventListener('click', () => confirmModal.close());

    const confirmButton = buttonContainer.createEl('button', {
      text: 'Reset Progress',
      cls: 'daily-prompts-button danger'
    });
    confirmButton.addEventListener('click', () => {
      pack.resetProgress();
      this.settingsManager.saveSettings();
      this.showSuccess(`Reset progress for "${pack.name}"`);
      this.display(); // Refresh the settings tab
      confirmModal.close();
    });

    confirmModal.open();
  }

  /**
   * Delete a prompt pack
   */
  private deletePromptPack(pack: PromptPack): void {
    const confirmModal = new Modal(this.app);
    confirmModal.titleEl.setText('Delete Prompt Pack');
    confirmModal.contentEl.createEl('p', {
      text: `Are you sure you want to delete "${pack.name}"? This action cannot be undone.`
    });

    const buttonContainer = confirmModal.contentEl.createDiv('daily-prompts-modal-buttons');

    const cancelButton = buttonContainer.createEl('button', {
      text: 'Cancel',
      cls: 'daily-prompts-button'
    });
    cancelButton.addEventListener('click', () => confirmModal.close());

    const deleteButton = buttonContainer.createEl('button', {
      text: 'Delete Pack',
      cls: 'daily-prompts-button danger'
    });
    deleteButton.addEventListener('click', async () => {
      try {
        await this.settingsManager.removePromptPack(pack.id);
        this.showSuccess(`Deleted "${pack.name}"`);
        this.display(); // Refresh the settings tab
        confirmModal.close();
      } catch (error) {
        this.showError(`Failed to delete pack: ${error.message}`);
      }
    });

    confirmModal.open();
  }

  /**
   * Display detailed progress information for a pack
   */
  private displayPackProgress(container: HTMLElement, pack: PromptPack, stats: any): void {
    const progressSection = container.createDiv('daily-prompts-progress-section');

    // Progress stats row
    const statsRow = progressSection.createDiv('daily-prompts-progress-stats');

    // Completion count
    const completionEl = statsRow.createDiv('daily-prompts-progress-stat');
    completionEl.createEl('span', {
      text: `${stats.completed}/${stats.total}`,
      cls: 'daily-prompts-stat-number'
    });
    completionEl.createEl('span', {
      text: 'Completed',
      cls: 'daily-prompts-stat-label'
    });

    // Percentage
    const percentageEl = statsRow.createDiv('daily-prompts-progress-stat');
    percentageEl.createEl('span', {
      text: `${stats.percentage}%`,
      cls: 'daily-prompts-stat-number'
    });
    percentageEl.createEl('span', {
      text: 'Progress',
      cls: 'daily-prompts-stat-label'
    });

    // Last accessed
    const lastAccessed = pack.progress.lastAccessDate;
    const lastAccessedEl = statsRow.createDiv('daily-prompts-progress-stat');
    lastAccessedEl.createEl('span', {
      text: this.formatDate(lastAccessed),
      cls: 'daily-prompts-stat-number'
    });
    lastAccessedEl.createEl('span', {
      text: 'Last Accessed',
      cls: 'daily-prompts-stat-label'
    });

    // Progress bar
    const progressBar = progressSection.createDiv('daily-prompts-progress-bar');
    const progressFill = progressBar.createDiv('daily-prompts-progress-fill');
    progressFill.style.width = `${stats.percentage}%`;

    // Current status for different pack types
    const statusEl = progressSection.createDiv('daily-prompts-current-status');
    this.displayCurrentStatus(statusEl, pack);
  }

  /**
   * Display current status based on pack type
   */
  private displayCurrentStatus(container: HTMLElement, pack: PromptPack): void {
    const statusText = container.createDiv('daily-prompts-status-text');

    if (pack.isCompleted()) {
      statusText.innerHTML = '<strong>Status:</strong> All prompts completed! 🎉';
      statusText.className += ' completed';
      return;
    }

    switch (pack.type) {
      case 'Sequential':
        const currentIndex = pack.progress.currentIndex || 0;
        const nextPrompt = pack.prompts[currentIndex];
        if (nextPrompt) {
          statusText.innerHTML = `<strong>Next:</strong> Prompt ${currentIndex + 1} - "${this.truncateText(nextPrompt.content, 50)}"`;
        }
        break;

      case 'Random':
        const remainingCount = pack.prompts.length - (pack.progress.usedPrompts?.size || 0);
        statusText.innerHTML = `<strong>Status:</strong> ${remainingCount} prompts remaining in current cycle`;
        break;

      case 'Date':
        const todayPrompts = pack.prompts.filter(p =>
          p.date && this.isSameDay(p.date, new Date())
        );
        if (todayPrompts.length > 0) {
          const todayCompleted = todayPrompts.filter(p =>
            pack.progress.completedPrompts.has(p.id)
          ).length;
          statusText.innerHTML = `<strong>Today:</strong> ${todayCompleted}/${todayPrompts.length} prompts completed`;
        } else {
          statusText.innerHTML = '<strong>Today:</strong> No prompts scheduled';
        }
        break;
    }
  }

  /**
   * Show detailed progress modal
   */
  private showProgressModal(pack: PromptPack): void {
    const modal = new Modal(this.app);
    modal.titleEl.setText(`Progress: ${pack.name}`);
    modal.contentEl.addClass('daily-prompts-progress-modal');

    const stats = pack.getStats();

    // Summary section
    const summarySection = modal.contentEl.createDiv('daily-prompts-progress-summary');
    summarySection.createEl('h4', { text: 'Summary' });

    const summaryGrid = summarySection.createDiv('daily-prompts-summary-grid');

    // Total prompts
    const totalCard = summaryGrid.createDiv('daily-prompts-summary-card');
    totalCard.createEl('div', { text: stats.total.toString(), cls: 'daily-prompts-summary-value' });
    totalCard.createEl('div', { text: 'Total Prompts', cls: 'daily-prompts-summary-label' });

    // Completed
    const completedCard = summaryGrid.createDiv('daily-prompts-summary-card');
    completedCard.createEl('div', { text: stats.completed.toString(), cls: 'daily-prompts-summary-value' });
    completedCard.createEl('div', { text: 'Completed', cls: 'daily-prompts-summary-label' });

    // Remaining
    const remainingCard = summaryGrid.createDiv('daily-prompts-summary-card');
    remainingCard.createEl('div', { text: (stats.total - stats.completed).toString(), cls: 'daily-prompts-summary-value' });
    remainingCard.createEl('div', { text: 'Remaining', cls: 'daily-prompts-summary-label' });

    // Progress percentage
    const progressCard = summaryGrid.createDiv('daily-prompts-summary-card');
    progressCard.createEl('div', { text: `${stats.percentage}%`, cls: 'daily-prompts-summary-value' });
    progressCard.createEl('div', { text: 'Complete', cls: 'daily-prompts-summary-label' });

    // Detailed prompt list
    const detailSection = modal.contentEl.createDiv('daily-prompts-progress-detail');
    detailSection.createEl('h4', { text: 'Prompt Details' });

    const promptList = detailSection.createDiv('daily-prompts-detailed-list');

    pack.prompts.forEach((prompt, index) => {
      const promptEl = promptList.createDiv('daily-prompts-detailed-item');
      const isCompleted = pack.progress.completedPrompts.has(prompt.id);

      if (isCompleted) {
        promptEl.addClass('completed');
      }

      // Status icon
      const statusIcon = promptEl.createDiv('daily-prompts-item-status');
      statusIcon.textContent = isCompleted ? '✓' : '○';

      // Prompt info
      const infoEl = promptEl.createDiv('daily-prompts-item-info');

      // Prompt number/order
      const orderEl = infoEl.createDiv('daily-prompts-item-order');
      if (pack.type === 'Sequential') {
        orderEl.textContent = `#${prompt.order || index + 1}`;
      } else if (pack.type === 'Date' && prompt.date) {
        orderEl.textContent = this.formatDate(prompt.date);
      } else {
        orderEl.textContent = `#${index + 1}`;
      }

      // Prompt content
      const contentEl = infoEl.createDiv('daily-prompts-item-content');
      contentEl.textContent = this.truncateText(prompt.content, 80);

      // Prompt type
      const typeEl = infoEl.createDiv('daily-prompts-item-type');
      typeEl.textContent = prompt.type;
      typeEl.className += ` type-${prompt.type}`;
    });

    // Action buttons
    const buttonContainer = modal.contentEl.createDiv('daily-prompts-modal-buttons');

    const resetButton = buttonContainer.createEl('button', {
      text: 'Reset Progress',
      cls: 'daily-prompts-button'
    });
    resetButton.addEventListener('click', () => {
      modal.close();
      this.resetPackProgress(pack);
    });

    if (pack.isCompleted()) {
      const archiveButton = buttonContainer.createEl('button', {
        text: 'Archive Pack',
        cls: 'daily-prompts-button'
      });
      archiveButton.addEventListener('click', () => {
        modal.close();
        this.archivePromptPack(pack);
      });
    }

    const closeButton = buttonContainer.createEl('button', {
      text: 'Close',
      cls: 'daily-prompts-button primary'
    });
    closeButton.addEventListener('click', () => modal.close());

    modal.open();
  }

  /**
   * Archive a completed prompt pack
   */
  private archivePromptPack(pack: PromptPack): void {
    const confirmModal = new Modal(this.app);
    confirmModal.titleEl.setText('Archive Prompt Pack');
    confirmModal.contentEl.createEl('p', {
      text: `Archive "${pack.name}"? This will preserve the pack and its progress but remove it from active use.`
    });

    const buttonContainer = confirmModal.contentEl.createDiv('daily-prompts-modal-buttons');

    const cancelButton = buttonContainer.createEl('button', {
      text: 'Cancel',
      cls: 'daily-prompts-button'
    });
    cancelButton.addEventListener('click', () => confirmModal.close());

    const archiveButton = buttonContainer.createEl('button', {
      text: 'Archive Pack',
      cls: 'daily-prompts-button primary'
    });
    archiveButton.addEventListener('click', async () => {
      try {
        // In a real implementation, you might move this to an archived section
        // For now, we'll just add metadata to indicate it's archived
        if (!pack.metadata) {
          pack.metadata = {};
        }
        pack.metadata.archived = true;
        pack.metadata.archivedAt = new Date().toISOString();

        await this.settingsManager.saveSettings();
        this.showSuccess(`Archived "${pack.name}"`);
        this.display(); // Refresh the settings tab
        confirmModal.close();
      } catch (error) {
        this.showError(`Failed to archive pack: ${error.message}`);
      }
    });

    confirmModal.open();
  }

  /**
   * Helper method to format dates
   */
  private formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
    });
  }

  /**
   * Helper method to check if two dates are the same day
   */
  private isSameDay(date1: Date, date2: Date): boolean {
    return date1.toDateString() === date2.toDateString();
  }

  /**
   * Helper method to truncate text
   */
  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }

  /**
   * Show success message
   */
  private showSuccess(message: string): void {
    new Notice(message);
  }

  /**
   * Show error message
   */
  private showError(message: string): void {
    new Notice(message, 5000);
    console.error('Daily Prompts Settings Error:', message);
  }
}

