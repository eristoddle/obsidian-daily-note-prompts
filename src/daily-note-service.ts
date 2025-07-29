/**
 * Daily Note Service for the Daily Prompts plugin
 * Handles daily note creation, opening, and prompt insertion
 */

import { App, TFile, Vault, Workspace, moment, normalizePath } from 'obsidian';
import { IDailyNoteService } from './interfaces';
import { Prompt, GlobalSettings } from './types';
import { ErrorHandler, ErrorType, ErrorSeverity } from './error-handler';

/**
 * Service for managing daily note integration and zen mode
 */
export class DailyNoteService implements IDailyNoteService {
  private app: App;
  private vault: Vault;
  private workspace: Workspace;
  private globalSettings: GlobalSettings;
  private errorHandler?: ErrorHandler;
  private zenModeState: {
    isActive: boolean;
    previousState: {
      leftSidebarVisible: boolean;
      rightSidebarVisible: boolean;
      statusBarVisible: boolean;
    };
  };
  private fallbackMode = false; // Track if we're using fallback methods

  constructor(app: App, globalSettings: GlobalSettings) {
    this.app = app;
    this.vault = app.vault;
    this.workspace = app.workspace;
    this.globalSettings = globalSettings;
    this.zenModeState = {
      isActive: false,
      previousState: {
        leftSidebarVisible: true,
        rightSidebarVisible: true,
        statusBarVisible: true
      }
    };
  }

  /**
   * Set the error handler for comprehensive error handling
   */
  setErrorHandler(errorHandler: ErrorHandler): void {
    this.errorHandler = errorHandler;
  }

  /**
   * Create or open the daily note for the specified date
   * Integrates with Obsidian's daily notes plugin when available
   */
  async createOrOpenDailyNote(date?: Date): Promise<TFile> {
    const targetDate = date || new Date();
    const context = this.errorHandler?.createContext('daily_note_creation', 'daily-note-service', { date: targetDate });

    try {
      // First, try to use the daily notes plugin if available
      if (!this.fallbackMode) {
        const dailyNotesPlugin = this.getDailyNotesPlugin();
        if (dailyNotesPlugin) {
          return await this.createOrOpenWithDailyNotesPlugin(targetDate, dailyNotesPlugin);
        }
      }

      // Fallback to manual daily note creation
      return await this.createOrOpenManually(targetDate);
    } catch (error) {
      if (this.errorHandler && context) {
        try {
          const result = await this.errorHandler.handleError(error as Error, context, {
            attemptRecovery: true,
            notifyUser: true,
            severity: ErrorSeverity.HIGH
          });

          // If recovery provided alternative method, use it
          if (result && result.useManualNoteCreation) {
            this.fallbackMode = true;
            return await this.createOrOpenManually(targetDate);
          }
        } catch (handlerError) {
          console.warn('Error handler failed for daily note creation:', handlerError);
        }
      }

      console.error('Error creating/opening daily note:', error);
      // Final fallback - create a basic daily note
      return await this.createBasicDailyNote(targetDate);
    }
  }

  /**
   * Insert a prompt into the specified daily note file
   */
  async insertPrompt(prompt: Prompt, file: TFile): Promise<void> {
    const context = this.errorHandler?.createContext('prompt_insertion', 'daily-note-service', {
      promptId: prompt.id,
      fileName: file.name
    });

    try {
      const content = await this.vault.read(file);
      const formattedPrompt = this.formatPrompt(prompt);
      const insertionPoint = this.findInsertionPoint(content);

      const newContent = this.insertAtPosition(content, formattedPrompt, insertionPoint);
      await this.vault.modify(file, newContent);

      // Open the file in the active leaf
      await this.workspace.getLeaf().openFile(file);

      // Position cursor after the inserted prompt if possible
      this.positionCursorAfterPrompt(file, formattedPrompt);
    } catch (error) {
      if (this.errorHandler && context) {
        try {
          await this.errorHandler.handleError(error as Error, context, {
            attemptRecovery: true,
            notifyUser: true,
            severity: ErrorSeverity.HIGH
          });
        } catch (handlerError) {
          console.warn('Error handler failed for prompt insertion:', handlerError);
        }
      }

      console.error('Error inserting prompt into daily note:', error);
      throw new Error(`Failed to insert prompt: ${(error as Error).message}`);
    }
  }

  /**
   * Enable zen mode for focused writing
   */
  enableZenMode(): void {
    if (this.zenModeState.isActive) {
      return; // Already in zen mode
    }

    const context = this.errorHandler?.createContext('zen_mode_enable', 'daily-note-service');

    try {
      // Store current state
      this.zenModeState.previousState = {
        leftSidebarVisible: !this.workspace.leftSplit.collapsed,
        rightSidebarVisible: !this.workspace.rightSplit.collapsed,
        statusBarVisible: document.body.classList.contains('hide-status-bar') === false
      };

      // Hide UI elements with error handling for each step
      try {
        this.workspace.leftSplit.collapse();
      } catch (leftSplitError) {
        console.warn('Failed to collapse left split:', leftSplitError);
      }

      try {
        this.workspace.rightSplit.collapse();
      } catch (rightSplitError) {
        console.warn('Failed to collapse right split:', rightSplitError);
      }

      // Hide status bar by adding CSS class
      try {
        document.body.classList.add('daily-prompts-zen-mode');
      } catch (cssError) {
        console.warn('Failed to add zen mode CSS class:', cssError);
      }

      // Add custom CSS for zen mode
      try {
        this.addZenModeStyles();
      } catch (styleError) {
        console.warn('Failed to add zen mode styles:', styleError);
      }

      this.zenModeState.isActive = true;

      // Log instructions for exiting zen mode
      console.log('Daily Prompts: Zen mode enabled. Use Command Palette (Ctrl/Cmd+P) and search for "Disable Zen Mode" to exit.');
    } catch (error) {
      if (this.errorHandler && context) {
        this.errorHandler.handleError(error as Error, context, {
          attemptRecovery: true,
          notifyUser: false, // Zen mode failure is not critical
          severity: ErrorSeverity.LOW
        }).then(result => {
          if (result && result.skipZenMode) {
            console.log('Daily Prompts: Zen mode disabled due to API limitations');
          }
        }).catch(handlerError => {
          console.warn('Error handler failed for zen mode enable:', handlerError);
        });
      } else {
        console.error('Error enabling zen mode:', error);
      }
    }
  }

  /**
   * Disable zen mode and restore previous UI state
   */
  disableZenMode(): void {
    if (!this.zenModeState.isActive) {
      return; // Not in zen mode
    }

    const context = this.errorHandler?.createContext('zen_mode_disable', 'daily-note-service');

    try {
      // Restore previous state with individual error handling
      try {
        if (this.zenModeState.previousState.leftSidebarVisible) {
          this.workspace.leftSplit.expand();
        }
      } catch (leftSplitError) {
        console.warn('Failed to expand left split:', leftSplitError);
      }

      try {
        if (this.zenModeState.previousState.rightSidebarVisible) {
          this.workspace.rightSplit.expand();
        }
      } catch (rightSplitError) {
        console.warn('Failed to expand right split:', rightSplitError);
      }

      // Remove zen mode CSS class
      try {
        document.body.classList.remove('daily-prompts-zen-mode');
      } catch (cssError) {
        console.warn('Failed to remove zen mode CSS class:', cssError);
      }

      // Remove custom zen mode styles
      try {
        this.removeZenModeStyles();
      } catch (styleError) {
        console.warn('Failed to remove zen mode styles:', styleError);
      }



      this.zenModeState.isActive = false;
    } catch (error) {
      if (this.errorHandler && context) {
        this.errorHandler.handleError(error as Error, context, {
          attemptRecovery: false, // Don't attempt recovery for zen mode disable
          notifyUser: false,
          severity: ErrorSeverity.LOW
        }).catch(handlerError => {
          console.warn('Error handler failed for zen mode disable:', handlerError);
        });
      } else {
        console.error('Error disabling zen mode:', error);
      }

      // Force reset zen mode state even if errors occurred
      this.zenModeState.isActive = false;
    }
  }

  /**
   * Check if zen mode is currently active
   */
  isZenModeActive(): boolean {
    return this.zenModeState.isActive;
  }

  /**
   * Update global settings reference
   */
  updateGlobalSettings(globalSettings: GlobalSettings): void {
    this.globalSettings = globalSettings;
  }



  /**
   * Add custom CSS styles for zen mode
   */
  private addZenModeStyles(): void {
    const styleId = 'daily-prompts-zen-mode-styles';

    // Remove existing styles if any
    const existingStyle = document.getElementById(styleId);
    if (existingStyle) {
      existingStyle.remove();
    }

    // Create style element
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      /* Hide additional UI elements in zen mode */
      .daily-prompts-zen-mode .status-bar {
        display: none !important;
      }

      .daily-prompts-zen-mode .titlebar {
        display: none !important;
      }

      /* Add a subtle exit hint in the corner */
      .daily-prompts-zen-mode::after {
        content: "Zen Mode - Ctrl/Cmd+P → 'Disable Zen Mode' to exit";
        position: fixed;
        bottom: 10px;
        right: 10px;
        background: rgba(0, 0, 0, 0.6);
        color: white;
        padding: 4px 8px;
        border-radius: 3px;
        font-size: 11px;
        z-index: 1000;
        pointer-events: none;
        opacity: 0.7;
      }
    `;

    document.head.appendChild(style);
  }

  /**
   * Remove custom CSS styles for zen mode
   */
  private removeZenModeStyles(): void {
    const styleId = 'daily-prompts-zen-mode-styles';
    const existingStyle = document.getElementById(styleId);
    if (existingStyle) {
      existingStyle.remove();
    }
  }

  // Private helper methods

  /**
   * Get the daily notes plugin if available
   */
  private getDailyNotesPlugin(): any {
    try {
      // @ts-ignore - Access internal plugin registry
      const plugins = this.app.plugins;

      if (!plugins) {
        return null;
      }

      // Try different ways to access the daily notes plugin
      let dailyNotesPlugin = null;

      if (plugins.getPlugin) {
        dailyNotesPlugin = plugins.getPlugin('daily-notes');
      }

      if (!dailyNotesPlugin && plugins.plugins) {
        dailyNotesPlugin = plugins.plugins['daily-notes'];
      }

      // Check if plugin is enabled
      if (dailyNotesPlugin && !plugins.enabledPlugins?.has('daily-notes')) {
        return null;
      }

      return dailyNotesPlugin;
    } catch (error) {
      console.warn('Daily Prompts: Failed to access daily notes plugin:', error);
      return null;
    }
  }

  /**
   * Create or open daily note using the daily notes plugin
   */
  private async createOrOpenWithDailyNotesPlugin(date: Date, dailyNotesPlugin: any): Promise<TFile> {
    const context = this.errorHandler?.createContext('daily_notes_plugin_usage', 'daily-note-service', { date });

    try {
      // Validate plugin has required methods
      if (!dailyNotesPlugin || typeof dailyNotesPlugin !== 'object') {
        throw new Error('Daily notes plugin is not properly loaded');
      }

      // Use the daily notes plugin API
      const { createDailyNote, getDailyNote, getAllDailyNotes } = dailyNotesPlugin;

      // Check if required methods exist
      if (!createDailyNote || typeof createDailyNote !== 'function') {
        throw new Error('Daily notes plugin createDailyNote method not available');
      }

      // Check if note already exists
      if (getDailyNote && getAllDailyNotes) {
        try {
          const allNotes = getAllDailyNotes();
          const existingNote = getDailyNote(moment(date), allNotes);
          if (existingNote && existingNote instanceof TFile) {
            return existingNote;
          }
        } catch (existingNoteError) {
          console.warn('Failed to check for existing daily note:', existingNoteError);
          // Continue to create new note
        }
      }

      // Create new daily note
      const newNote = await createDailyNote(moment(date));
      if (!newNote || !(newNote instanceof TFile)) {
        throw new Error('Daily notes plugin returned invalid file');
      }

      return newNote;
    } catch (error) {
      if (this.errorHandler && context) {
        try {
          const result = await this.errorHandler.handleError(error as Error, context, {
            attemptRecovery: true,
            notifyUser: false, // We'll fall back silently
            severity: ErrorSeverity.MEDIUM
          });

          if (result && result.useManualNoteCreation) {
            this.fallbackMode = true;
            return await this.createOrOpenManually(date);
          }
        } catch (handlerError) {
          console.warn('Error handler failed for daily notes plugin usage:', handlerError);
        }
      }

      console.error('Error using daily notes plugin:', error);
      this.fallbackMode = true;
      return await this.createOrOpenManually(date);
    }
  }

  /**
   * Create or open daily note manually without plugin
   */
  private async createOrOpenManually(date: Date): Promise<TFile> {
    const context = this.errorHandler?.createContext('manual_daily_note_creation', 'daily-note-service', { date });

    try {
      const fileName = this.generateDailyNoteFileName(date);
      const folderPath = this.globalSettings.dailyNoteFolder || '';
      const fullPath = normalizePath(folderPath ? `${folderPath}/${fileName}` : fileName);

      // Check if file already exists
      const existingFile = this.vault.getAbstractFileByPath(fullPath);
      if (existingFile instanceof TFile) {
        return existingFile;
      }

      // Create the file
      const template = this.globalSettings.dailyNoteTemplate || this.getDefaultDailyNoteTemplate();
      const content = this.processTemplate(template, date);

      // Ensure folder exists
      if (folderPath) {
        try {
          await this.ensureFolderExists(folderPath);
        } catch (folderError) {
          console.warn(`Failed to create folder ${folderPath}, using root:`, folderError);
          // Fall back to root directory
          const rootFileName = this.generateDailyNoteFileName(date);
          return await this.vault.create(rootFileName, content);
        }
      }

      return await this.vault.create(fullPath, content);
    } catch (error) {
      if (this.errorHandler && context) {
        try {
          await this.errorHandler.handleError(error as Error, context, {
            attemptRecovery: true,
            notifyUser: true,
            severity: ErrorSeverity.HIGH
          });
        } catch (handlerError) {
          console.warn('Error handler failed for manual daily note creation:', handlerError);
        }
      }

      console.error('Error creating daily note manually:', error);
      // Final fallback
      return await this.createBasicDailyNote(date);
    }
  }

  /**
   * Create a basic daily note as final fallback
   */
  private async createBasicDailyNote(date: Date): Promise<TFile> {
    const context = this.errorHandler?.createContext('basic_daily_note_creation', 'daily-note-service', { date });

    try {
      const fileName = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}.md`;
      const content = `# ${this.formatDateForTitle(date)}\n\n`;

      try {
        return await this.vault.create(fileName, content);
      } catch (createError) {
        // If file exists, return it
        const existingFile = this.vault.getAbstractFileByPath(fileName);
        if (existingFile instanceof TFile) {
          return existingFile;
        }

        // Try with a unique suffix
        const timestamp = Date.now();
        const uniqueFileName = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}-${timestamp}.md`;
        return await this.vault.create(uniqueFileName, content);
      }
    } catch (error) {
      if (this.errorHandler && context) {
        try {
          await this.errorHandler.handleError(error as Error, context, {
            attemptRecovery: false, // This is the final fallback
            notifyUser: true,
            severity: ErrorSeverity.CRITICAL
          });
        } catch (handlerError) {
          console.warn('Error handler failed for basic daily note creation:', handlerError);
        }
      }

      console.error('Failed to create basic daily note:', error);
      throw new Error(`Unable to create daily note: ${(error as Error).message}`);
    }
  }

  /**
   * Generate daily note file name based on date
   */
  private generateDailyNoteFileName(date: Date): string {
    // Use standard daily note format: YYYY-MM-DD.md
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}.md`;
  }

  /**
   * Get default daily note template
   */
  private getDefaultDailyNoteTemplate(): string {
    return `# {{date:YYYY-MM-DD}}

## Daily Prompt

{{prompt}}

## Notes

`;
  }

  /**
   * Process template with date and placeholder replacement
   */
  private processTemplate(template: string, date: Date): string {
    let processed = template;

    // Replace date placeholders
    processed = processed.replace(/{{date:([^}]+)}}/g, (match, format) => {
      return this.formatDate(date, format);
    });

    // Replace other common placeholders
    processed = processed.replace(/{{title}}/g, this.formatDateForTitle(date));
    processed = processed.replace(/{{date}}/g, this.formatDate(date, 'YYYY-MM-DD'));

    return processed;
  }

  /**
   * Format date according to specified format
   */
  private formatDate(date: Date, format: string): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const monthName = date.toLocaleString('default', { month: 'long' });
    const dayName = date.toLocaleString('default', { weekday: 'long' });

    return format
      .replace(/YYYY/g, String(year))
      .replace(/MM/g, month)
      .replace(/DD/g, day)
      .replace(/MMMM/g, monthName)
      .replace(/dddd/g, dayName);
  }

  /**
   * Format date for title display
   */
  private formatDateForTitle(date: Date): string {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  /**
   * Ensure folder exists, create if necessary
   */
  private async ensureFolderExists(folderPath: string): Promise<void> {
    try {
      const normalizedPath = normalizePath(folderPath);
      const folder = this.vault.getAbstractFileByPath(normalizedPath);

      if (!folder) {
        await this.vault.createFolder(normalizedPath);
      }
    } catch (error) {
      console.error(`Failed to ensure folder exists: ${folderPath}`, error);
      throw new Error(`Cannot create folder ${folderPath}: ${(error as Error).message}`);
    }
  }

  /**
   * Format prompt based on its type
   */
  private formatPrompt(prompt: Prompt): string {
    const timestamp = new Date().toLocaleTimeString();

    switch (prompt.type) {
      case 'link':
        return this.formatLinkPrompt(prompt);
      case 'markdown':
        return this.formatMarkdownPrompt(prompt);
      case 'string':
      default:
        return `## Daily Prompt (${timestamp})

${prompt.content}

---

`;
    }
  }

  /**
   * Format link-type prompt
   */
  private formatLinkPrompt(prompt: Prompt): string {
    const timestamp = new Date().toLocaleTimeString();

    switch (this.globalSettings.linkHandling) {
      case 'embed':
        return `## Daily Prompt (${timestamp})

![[${prompt.content}]]

---

`;
      case 'reference':
        return `## Daily Prompt (${timestamp})

[[${prompt.content}]]

---

`;
      case 'direct':
      default:
        return `## Daily Prompt (${timestamp})

[${prompt.content}](${prompt.content})

---

`;
    }
  }

  /**
   * Format markdown-type prompt
   */
  private formatMarkdownPrompt(prompt: Prompt): string {
    const timestamp = new Date().toLocaleTimeString();

    return `## Daily Prompt (${timestamp})

${prompt.content}

---

`;
  }

  /**
   * Find the best insertion point in the note content
   */
  private findInsertionPoint(content: string): number {
    // Look for existing prompt section
    const promptSectionMatch = content.match(/## Daily Prompt/i);
    if (promptSectionMatch) {
      // Find the end of the existing prompt section
      const startIndex = promptSectionMatch.index!;
      const afterSection = content.substring(startIndex);
      const nextSectionMatch = afterSection.match(/\n## /);

      if (nextSectionMatch) {
        return startIndex + nextSectionMatch.index!;
      } else {
        // Insert at end if no next section
        return content.length;
      }
    }

    // Look for template placeholder
    const placeholderMatch = content.match(/{{prompt}}/i);
    if (placeholderMatch) {
      return placeholderMatch.index!;
    }

    // Look for a good insertion point after title
    const titleMatch = content.match(/^#[^#\n]*\n/m);
    if (titleMatch) {
      return titleMatch.index! + titleMatch[0].length + 1;
    }

    // Default to beginning of file
    return 0;
  }

  /**
   * Insert content at specified position
   */
  private insertAtPosition(content: string, insertion: string, position: number): string {
    // Handle template placeholder replacement
    if (content.includes('{{prompt}}')) {
      return content.replace(/{{prompt}}/i, insertion.trim());
    }

    // Insert at position
    const before = content.substring(0, position);
    const after = content.substring(position);

    // Add appropriate spacing
    let spacing = '';
    if (position > 0 && !before.endsWith('\n')) {
      spacing = '\n';
    }
    if (!insertion.endsWith('\n')) {
      insertion += '\n';
    }

    return before + spacing + insertion + after;
  }

  /**
   * Position cursor after inserted prompt
   */
  private positionCursorAfterPrompt(file: TFile, insertedContent: string): void {
    try {
      // This is a best-effort attempt to position the cursor
      // The exact implementation depends on Obsidian's editor API
      const activeLeaf = this.workspace.activeLeaf;
      if (activeLeaf && activeLeaf.view) {
        // @ts-ignore - Access internal Obsidian view properties
        const view = activeLeaf.view as any;
        if (view.file === file && view.editor) {
          // Find the end of the inserted content and position cursor there
          const content = view.editor.getValue();
          const insertionIndex = content.indexOf(insertedContent);
          if (insertionIndex !== -1) {
            const endIndex = insertionIndex + insertedContent.length;
            const pos = view.editor.offsetToPos(endIndex);
            view.editor.setCursor(pos);
          }
        }
      }
    } catch (error) {
      // Cursor positioning is not critical, so we just log the error
      console.debug('Could not position cursor after prompt insertion:', error);
    }
  }

  /**
   * Add custom CSS styles for zen mode
   */
  private addZenModeStyles(): void {
    const styleId = 'daily-prompts-zen-mode-styles';

    // Remove existing styles if present
    const existingStyle = document.getElementById(styleId);
    if (existingStyle) {
      existingStyle.remove();
    }

    // Add new styles
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .daily-prompts-zen-mode .status-bar {
        display: none !important;
      }

      .daily-prompts-zen-mode .titlebar {
        display: none !important;
      }

      .daily-prompts-zen-mode .workspace-ribbon {
        display: none !important;
      }

      .daily-prompts-zen-mode .workspace-tab-header-container {
        display: none !important;
      }

      .daily-prompts-zen-mode .view-header {
        display: none !important;
      }

      .daily-prompts-zen-mode .workspace-leaf-content {
        border: none !important;
      }

      .daily-prompts-zen-mode .cm-editor {
        padding: 2rem !important;
      }
    `;

    document.head.appendChild(style);
  }

  /**
   * Remove zen mode CSS styles
   */
  private removeZenModeStyles(): void {
    const styleId = 'daily-prompts-zen-mode-styles';
    const existingStyle = document.getElementById(styleId);
    if (existingStyle) {
      existingStyle.remove();
    }
  }
}