/**
 * Jest setup file for mocking Obsidian API
 */

// Mock Obsidian classes and functions
jest.mock('obsidian', () => ({
  Plugin: class MockPlugin {
    app: any;
    manifest: any;
    constructor(app: any, manifest: any) {
      this.app = app;
      this.manifest = manifest;
    }
    onload() {}
    onunload() {}
    loadData() { return Promise.resolve(null); }
    saveData(data: any) { return Promise.resolve(); }
  },

  TFile: class MockTFile {
    path: string;
    name: string;
    extension: string;
    basename: string;
    stat: { ctime: number; mtime: number; size: number };
    vault: any;
    parent: any;

    constructor(path: string) {
      this.path = path;
      this.name = path.split('/').pop() || '';
      this.extension = this.name.split('.').pop() || '';
      this.basename = this.name.replace(`.${this.extension}`, '');
      this.stat = { ctime: 0, mtime: 0, size: 0 };
      this.vault = null;
      this.parent = null;
    }
  },

  TFolder: class MockTFolder {
    path: string;
    name: string;
    children: any[];
    vault: any;
    parent: any;

    constructor(path: string) {
      this.path = path;
      this.name = path.split('/').pop() || '';
      this.children = [];
      this.vault = null;
      this.parent = null;
    }
  },

  Notice: jest.fn().mockImplementation((message: string, timeout?: number) => ({
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
  })),

  normalizePath: jest.fn((path: string) => path.replace(/\\/g, '/').replace(/\/+/g, '/')),

  moment: jest.fn((date?: Date) => ({
    format: jest.fn(() => '2024-01-15'),
    toDate: jest.fn(() => date || new Date())
  }))
}));

// Mock global APIs
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

Object.defineProperty(global, 'document', {
  value: mockDocument,
  configurable: true
});

// Mock setTimeout/clearTimeout/setInterval/clearInterval
Object.defineProperty(global, 'setTimeout', {
  value: jest.fn(),
  configurable: true
});

Object.defineProperty(global, 'clearTimeout', {
  value: jest.fn(),
  configurable: true
});

Object.defineProperty(global, 'setInterval', {
  value: jest.fn(),
  configurable: true
});

Object.defineProperty(global, 'clearInterval', {
  value: jest.fn(),
  configurable: true
});