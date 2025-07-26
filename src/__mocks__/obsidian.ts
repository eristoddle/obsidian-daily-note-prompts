/**
 * Mock implementation of Obsidian API for testing
 */

export class Notice {
  noticeEl: any;

  constructor(public message: string, public timeout?: number) {
    this.noticeEl = {
      style: {},
      createEl: jest.fn().mockReturnValue({
        style: { cssText: '' },
        addEventListener: jest.fn()
      }),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      parentNode: true
    };
  }

  hide() {
    // Mock implementation
  }
}

export class Plugin {
  app: any;
  manifest: any;

  constructor() {
    this.app = {};
    this.manifest = {};
  }

  onload() {
    // Mock implementation
  }

  onunload() {
    // Mock implementation
  }

  addRibbonIcon() {
    // Mock implementation
  }

  addStatusBarItem() {
    // Mock implementation
  }

  addCommand() {
    // Mock implementation
  }

  addSettingTab() {
    // Mock implementation
  }

  registerView() {
    // Mock implementation
  }

  registerHoverLinkSource() {
    // Mock implementation
  }

  registerEditorExtension() {
    // Mock implementation
  }

  registerMarkdownPostProcessor() {
    // Mock implementation
  }

  registerMarkdownCodeBlockProcessor() {
    // Mock implementation
  }

  registerInterval() {
    // Mock implementation
  }

  registerDomEvent() {
    // Mock implementation
  }

  registerEvent() {
    // Mock implementation
  }

  registerObsidianProtocolHandler() {
    // Mock implementation
  }

  registerEditorSuggest() {
    // Mock implementation
  }

  loadData() {
    return Promise.resolve({});
  }

  saveData() {
    return Promise.resolve();
  }
}

export interface TFile {
  path: string;
  name: string;
  extension: string;
}