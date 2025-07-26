/**
 * Daily Note Service for the Daily Prompts plugin
 * Handles daily note creation, opening, and prompt insertion
 */

import { App, TFile, Vault, Workspace, moment, normalizePath } from 'obsidian';
import { IDailyNoteService } from './interfaces';
import { Prompt, GlobalSettings } from './types';

/**
 * Service for managing daily note integration and zen mode
 */
export class DailyNoteService implements IDailyNoteService {
  private app: App;
  private vault: Vault;
  private workspace: Workspace;
  private globalSettings: GlobalSettings;
  private zenModeState: {
    isActive: boolean;
    previousState: {
      leftSidebarVisible: boolean;
      rightSidebarVisible: boolean;
      statusBarVisible: boolean;
    };
  };

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
   * Create or open the daily note for the specified date
   * Integrates with Obsidian's daily notes plugin when available
   */
  async createOrOpenDailyNote(date?: Date): Promise<TFile> {
    const targetDate = date || new Date();

    try {
      // First, try to use the daily notes plugin if available
      const dailyNotesPlugin = this.getDailyNotesPlugin();
      if (dailyNotesPlugin) {
        return await this.createOrOpenWithDailyNotesPlugin(targetDate, dailyNotesPlugin);
      }

      // Fallback to manual daily note creation
      return await this.createOrOpenManually(targetDate);
    } catch (error) {
      console.error('Error creating/opening daily note:', error);
      // Final fallback - create a basic daily note
      return await this.createBasicDailyNote(targetDate);
    }
  }

  /**
   * Insert a prompt into the specified daily note file
   */
  async insertPrompt(prompt: Prompt, file: TFile): Promise<void> {
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
      console.error('Error inserting prompt into daily note:', error);
      throw new Error(`Failed to insert prompt: ${error.message}`);
    }
  }

  /**
   * Enable zen mode for focused writing
   */
  enableZenMode(): void {
    if (this.zenModeState.isActive) {
      return; // Already in zen mode
    }

    try {
      // Store current state
      this.zenModeState.previousState = {
        leftSidebarVisible: !this.workspace.leftSplit.collapsed,
        rightSidebarVisible: !this.workspace.rightSplit.collapsed,
        statusBarVisible: document.body.classList.contains('hide-status-bar') === false
      };

      // Hide UI elements
      this.workspace.leftSplit.collapse();
      this.workspace.rightSplit.collapse();

      // Hide status bar by adding CSS class
      document.body.classList.add('daily-prompts-zen-mode');

      // Add custom CSS for zen mode
      this.addZenModeStyles();

      this.zenModeState.isActive = true;
    } catch (error) {
      console.error('Error enabling zen mode:', error);
    }
  }

  /**
   * Disable zen mode and restore previous UI state
   */
  disableZenMode(): void {
    if (!this.zenModeState.isActive) {
      return; // Not in zen mode
    }

    try {
      // Restore previous state
      if (this.zenModeState.previousState.leftSidebarVisible) {
        this.workspace.leftSplit.expand();
      }
      if (this.zenModeState.previousState.rightSidebarVisible) {
        this.workspace.rightSplit.expand();
      }

      // Remove zen mode CSS class
      document.body.classList.remove('daily-prompts-zen-mode');

      // Remove custom zen mode styles
      this.removeZenModeStyles();

      this.zenModeState.isActive = false;
    } catch (error) {
      console.error('Error disabling zen mode:', error);
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

  // Private helper methods

  /**
   * Get the daily notes plugin if available
   */
  private getDailyNotesPlugin(): any {
    // @ts-ignore - Access internal plugin registry
    const plugins = this.app.plugins;
    return plugins.getPlugin('daily-notes') || plugins.plugins['daily-notes'];
  }

  /**
   * Create or open daily note using the daily notes plugin
   */
  private async createOrOpenWithDailyNotesPlugin(date: Date, dailyNotesPlugin: any): Promise<TFile> {
    try {
      // Use the daily notes plugin API
      const { createDailyNote, getDailyNote, getAllDailyNotes } = dailyNotesPlugin;

      // Check if note already exists
      const existingNote = getDailyNote ? getDailyNote(moment(date), getAllDailyNotes()) : null;
      if (existingNote) {
        return existingNote;
      }

      // Create new daily note
      if (createDailyNote) {
        return await createDailyNote(moment(date));
      }

      // Fallback if plugin methods not available
      return await this.createOrOpenManually(date);
    } catch (error) {
      console.error('Error using daily notes plugin:', error);
      return await this.createOrOpenManually(date);
    }
  }

  /**
   * Create or open daily note manually without plugin
   */
  private async createOrOpenManually(date: Date): Promise<TFile> {
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
      await this.ensureFolderExists(folderPath);
    }

    return await this.vault.create(fullPath, content);
  }

  /**
   * Create a basic daily note as final fallback
   */
  private async createBasicDailyNote(date: Date): Promise<TFile> {
    const fileName = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}.md`;
    const content = `# ${this.formatDateForTitle(date)}\n\n`;

    try {
      return await this.vault.create(fileName, content);
    } catch (error) {
      // If file exists, return it
      const existingFile = this.vault.getAbstractFileByPath(fileName);
      if (existingFile instanceof TFile) {
        return existingFile;
      }
      throw error;
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
    const normalizedPath = normalizePath(folderPath);
    const folder = this.vault.getAbstractFileByPath(normalizedPath);

    if (!folder) {
      await this.vault.createFolder(normalizedPath);
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