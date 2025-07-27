/**
 * Modal for creating and editing prompt packs with full prompt management
 */

import { App, Modal, Setting, Notice, TextComponent, DropdownComponent, ButtonComponent } from 'obsidian';
import { SettingsManager } from './settings-manager';
import { PromptPack, Prompt, PromptPackSettings, ValidationError } from './models';
import { PromptPackType, PromptType, NotificationType } from './types';

export class PromptPackModal extends Modal {
  private settingsManager: SettingsManager;
  private pack: PromptPack | null;
  private onSave: () => void;
  private isEditing: boolean;

  // Form elements
  private nameInput: TextComponent;
  private typeDropdown: DropdownComponent;
  private notificationToggle: any;
  private notificationTimeInput: TextComponent;
  private notificationTypeDropdown: DropdownComponent;
  private zenModeToggle: any;
  private dailyNoteToggle: any;
  private customTemplateInput: any;

  // Prompt management
  private promptsContainer: HTMLElement;
  private prompts: Prompt[];
  private draggedElement: HTMLElement | null = null;
  private draggedIndex: number = -1;

  constructor(app: App, settingsManager: SettingsManager, pack: PromptPack | null, onSave: () => void) {
    super(app);
    this.settingsManager = settingsManager;
    this.pack = pack;
    this.onSave = onSave;
    this.isEditing = pack !== null;
    this.prompts = pack ? [...pack.prompts] : [];
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('daily-prompts-modal');
    contentEl.addClass('daily-prompts-pack-modal');

    this.titleEl.setText(this.isEditing ? 'Edit Prompt Pack' : 'Create New Prompt Pack');

    this.createForm();
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }

  /**
   * Create the complete form for pack creation/editing
   */
  private createForm(): void {
    const { contentEl } = this;

    // Basic pack information
    this.createBasicInfoSection(contentEl);

    // Notification settings
    this.createNotificationSection(contentEl);

    // Other settings
    this.createOtherSettingsSection(contentEl);

    // Prompt management
    this.createPromptManagementSection(contentEl);

    // Action buttons
    this.createActionButtons(contentEl);

    // Initial setup
    this.updateNotificationVisibility(this.pack?.settings.notificationEnabled ?? false);
    this.updatePromptTypeVisibility();
  }

  /**
   * Create basic information section
   */
  private createBasicInfoSection(container: HTMLElement): void {
    const basicSection = container.createDiv('daily-prompts-form-section');
    basicSection.createEl('h4', { text: 'Basic Information' });

    // Pack name
    new Setting(basicSection)
      .setName('Pack Name')
      .setDesc('A unique name for this prompt pack')
      .addText(text => {
        this.nameInput = text;
        text
          .setPlaceholder('Enter pack name')
          .setValue(this.pack?.name || '')
          .onChange(() => this.validateForm());
      });

    // Pack type
    new Setting(basicSection)
      .setName('Pack Type')
      .setDesc('How prompts should be delivered')
      .addDropdown(dropdown => {
        this.typeDropdown = dropdown;
        dropdown
          .addOption('Sequential', 'Sequential - Prompts in order')
          .addOption('Random', 'Random - Random selection without repetition')
          .addOption('Date', 'Date - Prompts assigned to specific dates')
          .setValue(this.pack?.type || 'Sequential')
          .onChange(() => {
            this.updatePromptTypeVisibility();
            this.validateForm();
          });
      });
  }

  /**
   * Create notification settings section
   */
  private createNotificationSection(container: HTMLElement): void {
    const notificationSection = container.createDiv('daily-prompts-form-section');
    notificationSection.createEl('h4', { text: 'Notification Settings' });

    // Enable notifications
    new Setting(notificationSection)
      .setName('Enable notifications')
      .setDesc('Show notifications for this prompt pack')
      .addToggle(toggle => {
        this.notificationToggle = toggle;
        toggle
          .setValue(this.pack?.settings.notificationEnabled ?? false)
          .onChange((value) => {
            this.updateNotificationVisibility(value);
          });
      });

    // Notification time
    new Setting(notificationSection)
      .setName('Notification Time')
      .setDesc('Time to show notifications (24-hour format)')
      .addText(text => {
        this.notificationTimeInput = text;
        text
          .setPlaceholder('09:00')
          .setValue(this.pack?.settings.notificationTime || '09:00')
          .onChange(() => this.validateForm());
      });

    // Notification type
    new Setting(notificationSection)
      .setName('Notification Type')
      .setDesc('How notifications should be displayed')
      .addDropdown(dropdown => {
        this.notificationTypeDropdown = dropdown;
        dropdown
          .addOption('obsidian', 'Obsidian Notice')
          .addOption('system', 'System Notification')
          .setValue(this.pack?.settings.notificationType || 'obsidian');
      });
  }

  /**
   * Create other settings section
   */
  private createOtherSettingsSection(container: HTMLElement): void {
    const otherSection = container.createDiv('daily-prompts-form-section');
    otherSection.createEl('h4', { text: 'Display Settings' });

    // Zen mode
    new Setting(otherSection)
      .setName('Enable zen mode')
      .setDesc('Automatically enable zen mode when opening prompts')
      .addToggle(toggle => {
        this.zenModeToggle = toggle;
        toggle.setValue(this.pack?.settings.zenModeEnabled ?? false);
      });

    // Daily note integration
    new Setting(otherSection)
      .setName('Daily note integration')
      .setDesc('Automatically insert prompts into daily notes')
      .addToggle(toggle => {
        this.dailyNoteToggle = toggle;
        toggle.setValue(this.pack?.settings.dailyNoteIntegration ?? true);
      });

    // Custom template
    new Setting(otherSection)
      .setName('Custom Template')
      .setDesc('Custom template for prompt insertion (use {{prompt}} placeholder)')
      .addTextArea(text => {
        this.customTemplateInput = text;
        text
          .setPlaceholder('## Daily Prompt\n{{prompt}}\n\n')
          .setValue(this.pack?.settings.customTemplate || '');
      });
  }

  /**
   * Create prompt management section
   */
  private createPromptManagementSection(container: HTMLElement): void {
    const promptSection = container.createDiv('daily-prompts-form-section');
    const headerDiv = promptSection.createDiv('daily-prompts-section-header');
    headerDiv.createEl('h4', { text: 'Prompts' });

    // Add prompt button
    const addButton = headerDiv.createEl('button', {
      text: 'Add Prompt',
      cls: 'daily-prompts-button primary'
    });
    addButton.addEventListener('click', () => this.addNewPrompt());

    // Prompts container
    this.promptsContainer = promptSection.createDiv('daily-prompts-prompts-container');
    this.renderPrompts();
  }

  /**
   * Create action buttons
   */
  private createActionButtons(container: HTMLElement): void {
    const buttonContainer = container.createDiv('daily-prompts-modal-buttons');

    const cancelButton = buttonContainer.createEl('button', {
      text: 'Cancel',
      cls: 'daily-prompts-button'
    });
    cancelButton.addEventListener('click', () => this.close());

    const saveButton = buttonContainer.createEl('button', {
      text: this.isEditing ? 'Save Changes' : 'Create Pack',
      cls: 'daily-prompts-button primary'
    });
    saveButton.addEventListener('click', () => this.savePack());
  }

  /**
   * Update notification settings visibility
   */
  private updateNotificationVisibility(enabled: boolean): void {
    const settings = this.contentEl.querySelectorAll('.setting-item');
    settings.forEach((setting, index) => {
      const settingEl = setting as HTMLElement;
      const nameEl = settingEl.querySelector('.setting-item-name');
      if (nameEl) {
        const name = nameEl.textContent;
        if (name === 'Notification Time' || name === 'Notification Type') {
          settingEl.style.display = enabled ? 'flex' : 'none';
        }
      }
    });
  }

  /**
   * Update prompt type-specific visibility and requirements
   */
  private updatePromptTypeVisibility(): void {
    const type = this.typeDropdown.getValue() as PromptPackType;

    // Update prompt list to show/hide type-specific fields
    this.renderPrompts();

    // Show type-specific help text
    const existingHelp = this.contentEl.querySelector('.daily-prompts-type-help');
    if (existingHelp) {
      existingHelp.remove();
    }

    const promptSection = this.contentEl.querySelector('.daily-prompts-prompts-container')?.parentElement;
    if (promptSection) {
      const helpEl = promptSection.createDiv('daily-prompts-type-help');

      switch (type) {
        case 'Sequential':
          helpEl.innerHTML = '<strong>Sequential Mode:</strong> Prompts will be delivered in the order shown below. You can drag and drop to reorder.';
          break;
        case 'Random':
          helpEl.innerHTML = '<strong>Random Mode:</strong> Prompts will be selected randomly without repetition until all are used.';
          break;
        case 'Date':
          helpEl.innerHTML = '<strong>Date Mode:</strong> Each prompt must be assigned a specific date. Prompts will be shown on their assigned dates.';
          break;
      }
    }
  }

  /**
   * Render the prompts list
   */
  private renderPrompts(): void {
    this.promptsContainer.empty();

    if (this.prompts.length === 0) {
      const emptyState = this.promptsContainer.createDiv('daily-prompts-empty-prompts');
      emptyState.createEl('p', {
        text: 'No prompts added yet. Click "Add Prompt" to get started.',
        cls: 'daily-prompts-empty-text'
      });
      return;
    }

    const type = this.typeDropdown.getValue() as PromptPackType;

    this.prompts.forEach((prompt, index) => {
      const promptEl = this.createPromptElement(prompt, index, type);
      this.promptsContainer.appendChild(promptEl);
    });
  }

  /**
   * Create a single prompt element
   */
  private createPromptElement(prompt: Prompt, index: number, packType: PromptPackType): HTMLElement {
    const promptEl = document.createElement('div');
    promptEl.className = 'daily-prompts-prompt-item';
    promptEl.draggable = packType === 'Sequential';

    // Drag handle for sequential mode
    if (packType === 'Sequential') {
      const dragHandle = promptEl.createDiv('daily-prompts-drag-handle');
      dragHandle.innerHTML = '⋮⋮';
      dragHandle.title = 'Drag to reorder';

      // Add drag event listeners
      promptEl.addEventListener('dragstart', (e) => this.handleDragStart(e, index));
      promptEl.addEventListener('dragover', (e) => this.handleDragOver(e));
      promptEl.addEventListener('drop', (e) => this.handleDrop(e, index));
      promptEl.addEventListener('dragend', () => this.handleDragEnd());
    }

    // Prompt content section
    const contentSection = promptEl.createDiv('daily-prompts-prompt-content');

    // Prompt type selector
    const typeRow = contentSection.createDiv('daily-prompts-prompt-row');
    typeRow.createEl('label', { text: 'Type:' });

    const typeSelect = typeRow.createEl('select') as HTMLSelectElement;
    typeSelect.className = 'daily-prompts-prompt-type-select';

    const typeOptions = [
      { value: 'string', label: 'Text' },
      { value: 'markdown', label: 'Markdown' },
      { value: 'link', label: 'Link' }
    ];

    typeOptions.forEach(option => {
      const optionEl = typeSelect.createEl('option');
      optionEl.value = option.value;
      optionEl.textContent = option.label;
      optionEl.selected = prompt.type === option.value;
    });

    typeSelect.addEventListener('change', () => {
      prompt.type = typeSelect.value as PromptType;
      this.updatePromptContentInput(contentSection, prompt);
    });

    // Date input for Date-type packs
    if (packType === 'Date') {
      const dateRow = contentSection.createDiv('daily-prompts-prompt-row');
      dateRow.createEl('label', { text: 'Date:' });

      const dateInput = dateRow.createEl('input') as HTMLInputElement;
      dateInput.type = 'date';
      dateInput.className = 'daily-prompts-prompt-date';
      dateInput.value = prompt.date ? prompt.date.toISOString().split('T')[0] : '';
      dateInput.addEventListener('change', () => {
        prompt.date = dateInput.value ? new Date(dateInput.value) : undefined;
      });
    }

    // Prompt content input
    this.updatePromptContentInput(contentSection, prompt);

    // Actions section
    const actionsSection = promptEl.createDiv('daily-prompts-prompt-actions');

    const deleteButton = actionsSection.createEl('button', {
      text: 'Delete',
      cls: 'daily-prompts-button danger'
    });
    deleteButton.addEventListener('click', () => this.deletePrompt(index));

    return promptEl;
  }

  /**
   * Update prompt content input based on type
   */
  private updatePromptContentInput(container: HTMLElement, prompt: Prompt): void {
    // Remove existing content input
    const existingInput = container.querySelector('.daily-prompts-prompt-content-input');
    if (existingInput) {
      existingInput.remove();
    }

    const contentRow = container.createDiv('daily-prompts-prompt-row daily-prompts-prompt-content-input');
    contentRow.createEl('label', { text: 'Content:' });

    let input: HTMLInputElement | HTMLTextAreaElement;

    if (prompt.type === 'markdown') {
      input = contentRow.createEl('textarea') as HTMLTextAreaElement;
      input.rows = 4;
      input.placeholder = 'Enter markdown content...';
    } else {
      input = contentRow.createEl('input') as HTMLInputElement;
      input.type = 'text';
      input.placeholder = prompt.type === 'link' ? 'Enter link or note name...' : 'Enter prompt text...';
    }

    input.className = 'daily-prompts-prompt-content-field';
    input.value = prompt.content;
    input.addEventListener('input', () => {
      prompt.content = input.value;
    });
  }

  /**
   * Add a new prompt
   */
  private addNewPrompt(): void {
    const type = this.typeDropdown.getValue() as PromptPackType;

    // Create prompt with empty content, skipping validation during construction
    const newPrompt = new Prompt({
      content: '',
      type: 'string',
      order: type === 'Sequential' ? this.prompts.length + 1 : undefined,
      date: type === 'Date' ? new Date() : undefined
    }, true); // Skip validation during construction

    this.prompts.push(newPrompt);
    this.renderPrompts();

    // Focus on the new prompt's content field
    setTimeout(() => {
      const promptItems = this.promptsContainer.querySelectorAll('.daily-prompts-prompt-item');
      const newPromptItem = promptItems[promptItems.length - 1];
      const contentField = newPromptItem?.querySelector('.daily-prompts-prompt-content-field') as HTMLInputElement | HTMLTextAreaElement;

      if (contentField) {
        contentField.focus();
        contentField.placeholder = 'Enter your prompt here...';
      }
    }, 50);
  }

  /**
   * Delete a prompt
   */
  private deletePrompt(index: number): void {
    this.prompts.splice(index, 1);

    // Reorder sequential prompts
    const type = this.typeDropdown.getValue() as PromptPackType;
    if (type === 'Sequential') {
      this.prompts.forEach((prompt, i) => {
        prompt.order = i + 1;
      });
    }

    this.renderPrompts();
  }

  /**
   * Handle drag start
   */
  private handleDragStart(e: DragEvent, index: number): void {
    this.draggedElement = e.target as HTMLElement;
    this.draggedIndex = index;

    if (this.draggedElement) {
      this.draggedElement.classList.add('daily-prompts-dragging');
    }

    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
    }
  }

  /**
   * Handle drag over
   */
  private handleDragOver(e: DragEvent): void {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
  }

  /**
   * Handle drop
   */
  private handleDrop(e: DragEvent, targetIndex: number): void {
    e.preventDefault();

    if (this.draggedIndex !== -1 && this.draggedIndex !== targetIndex) {
      // Reorder prompts array
      const draggedPrompt = this.prompts[this.draggedIndex];
      this.prompts.splice(this.draggedIndex, 1);
      this.prompts.splice(targetIndex, 0, draggedPrompt);

      // Update order values
      this.prompts.forEach((prompt, i) => {
        prompt.order = i + 1;
      });

      this.renderPrompts();
    }
  }

  /**
   * Handle drag end
   */
  private handleDragEnd(): void {
    if (this.draggedElement) {
      this.draggedElement.classList.remove('daily-prompts-dragging');
    }
    this.draggedElement = null;
    this.draggedIndex = -1;
  }

  /**
   * Validate the form
   */
  private validateForm(): boolean {
    return this.getValidationErrors().length === 0;
  }

  /**
   * Get detailed validation errors
   */
  private getValidationErrors(): string[] {
    const errors: string[] = [];
    const name = this.nameInput.getValue().trim();
    const notificationTime = this.notificationTimeInput.getValue();

    // Validate name
    if (!name) {
      errors.push('Pack name is required');
    }

    // Check for duplicate names (except when editing the same pack)
    const existingPack = this.settingsManager.getPromptPacks().find(p =>
      p.name === name && (!this.pack || p.id !== this.pack.id)
    );
    if (existingPack) {
      errors.push(`A pack named "${name}" already exists`);
    }

    // Validate notification time format
    if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(notificationTime)) {
      errors.push('Notification time must be in HH:MM format (e.g., 09:00)');
    }

    // Validate prompts
    if (this.prompts.length === 0) {
      errors.push('At least one prompt is required');
    }

    // Type-specific validation
    const type = this.typeDropdown.getValue() as PromptPackType;
    if (type === 'Date') {
      // All prompts must have dates
      const promptsWithoutDates = this.prompts.filter(p => !p.date);
      if (promptsWithoutDates.length > 0) {
        errors.push(`${promptsWithoutDates.length} prompt(s) missing dates (required for Date mode)`);
      }
    }

    // All prompts must have content
    const emptyPrompts = this.prompts.filter(p => !p.content.trim());
    if (emptyPrompts.length > 0) {
      errors.push(`${emptyPrompts.length} prompt(s) have empty content`);
    }

    return errors;
  }

  /**
   * Save the prompt pack
   */
  private async savePack(): Promise<void> {
    const validationResult = this.getValidationErrors();
    if (validationResult.length > 0) {
      new Notice(`Please fix the following issues:\n${validationResult.join('\n')}`, 8000);
      return;
    }

    try {
      const name = this.nameInput.getValue().trim();
      const type = this.typeDropdown.getValue() as PromptPackType;

      const settings = new PromptPackSettings({
        notificationEnabled: this.notificationToggle.getValue(),
        notificationTime: this.notificationTimeInput.getValue(),
        notificationType: this.notificationTypeDropdown.getValue() as NotificationType,
        zenModeEnabled: this.zenModeToggle.getValue(),
        dailyNoteIntegration: this.dailyNoteToggle.getValue(),
        customTemplate: this.customTemplateInput.getValue() || undefined
      });

      // Validate all prompts before saving
      const validatedPrompts = this.prompts.map(prompt => {
        // Create a new prompt with validation to ensure it's valid
        return new Prompt({
          id: prompt.id,
          content: prompt.content,
          type: prompt.type,
          date: prompt.date,
          order: prompt.order,
          metadata: prompt.metadata
        }); // This will validate the prompt
      });

      if (this.isEditing && this.pack) {
        // Update existing pack
        this.pack.name = name;
        this.pack.type = type;
        this.pack.prompts = validatedPrompts;
        this.pack.settings = settings;
        this.pack.updatedAt = new Date();

        await this.settingsManager.saveSettings();
        new Notice(`Updated "${name}"`);
      } else {
        // Create new pack
        const newPack = new PromptPack({
          name,
          type,
          prompts: validatedPrompts,
          settings
        });

        await this.settingsManager.addPromptPack(newPack);
        new Notice(`Created "${name}"`);
      }

      this.onSave();
      this.close();
    } catch (error) {
      new Notice(`Failed to save pack: ${error.message}`);
    }
  }
}