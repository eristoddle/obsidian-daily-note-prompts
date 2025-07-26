/**
 * Unit tests for StorageManager
 */

import { StorageManager, BackupMetadata, StorageOptions } from '../storage-manager';
import { PluginSettings, PromptPack, ValidationError } from '../models';
import { ErrorHandler } from '../error-handler';

// Mock Obsidian API
const mockPlugin = {
  saveData: jest.fn(),
  loadData: jest.fn(),
  app: {
    vault: {
      create: jest.fn(),
      read: jest.fn(),
      modify: jest.fn(),
      delete: jest.fn(),
      createFolder: jest.fn(),
      getAbstractFileByPath: jest.fn()
    }
  }
};

const mockErrorHandler = {
  createContext: jest.fn().mockReturnValue({ id: 'test-context' }),
  handleError: jest.fn()
};

describe('StorageManager', () => {
  let storageManager: StorageManager;

  beforeEach(() => {
    jest.clearAllMocks();
    storageManager = new StorageManager(mockPlugin as any);
    storageManager.setErrorHandler(mockErrorHandler as any);
  });

  describe('saveData', () => {
    const testData = {
      version: '1.0.0',
      promptPacks: [],
      globalSettings: {
        defaultNotificationTime: '09:00',
        defaultZenMode: false,
        dailyNoteFolder: '',
        dailyNoteTemplate: '',
        linkHandling: 'direct'
      }
    };

    it('should save data successfully with default options', async () => {
      mockPlugin.saveData.mockResolvedValue(undefined);
      mockPlugin.loadData.mockResolvedValue(testData);

      await storageManager.saveData(testData);

      expect(mockPlugin.saveData).toHaveBeenCalledWith(testData);
    });

    it('should create backup before saving when createBackup is true', async () => {
      mockPlugin.saveData.mockResolvedValue(undefined);
      mockPlugin.loadData.mockResolvedValue(testData);
      mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(null);
      mockPlugin.app.vault.createFolder.mockResolvedValue(undefined);
      mockPlugin.app.vault.create.mockResolvedValue(undefined);

      await storageManager.saveData(testData, { createBackup: true });

      expect(mockPlugin.app.vault.createFolder).toHaveBeenCalled();
      expect(mockPlugin.app.vault.create).toHaveBeenCalled();
      expect(mockPlugin.saveData).toHaveBeenCalledWith(testData);
    });

    it('should skip backup when createBackup is false', async () => {
      mockPlugin.saveData.mockResolvedValue(undefined);

      await storageManager.saveData(testData, { createBackup: false });

      expect(mockPlugin.app.vault.createFolder).not.toHaveBeenCalled();
      expect(mockPlugin.saveData).toHaveBeenCalledWith(testData);
    });

    it('should validate data when validateData is true', async () => {
      mockPlugin.saveData.mockResolvedValue(undefined);

      const invalidData = { invalid: 'structure' };

      await expect(storageManager.saveData(invalidData, { validateData: true }))
        .rejects.toThrow(ValidationError);

      expect(mockPlugin.saveData).not.toHaveBeenCalled();
    });

    it('should skip validation when validateData is false', async () => {
      mockPlugin.saveData.mockResolvedValue(undefined);

      const invalidData = { invalid: 'structure' };

      await storageManager.saveData(invalidData, { validateData: false });

      expect(mockPlugin.saveData).toHaveBeenCalledWith(invalidData);
    });

    it('should retry on failure when retryOnFailure is true', async () => {
      mockPlugin.saveData
        .mockRejectedValueOnce(new Error('First attempt failed'))
        .mockResolvedValueOnce(undefined);

      await storageManager.saveData(testData, { retryOnFailure: true, createBackup: false });

      expect(mockPlugin.saveData).toHaveBeenCalledTimes(2);
    });

    it('should respect maxRetries setting', async () => {
      mockPlugin.saveData.mockRejectedValue(new Error('Save failed'));

      await expect(storageManager.saveData(testData, {
        retryOnFailure: true,
        maxRetries: 2,
        createBackup: false
      })).rejects.toThrow('Failed to save data after 2 attempts');

      expect(mockPlugin.saveData).toHaveBeenCalledTimes(2);
    });

    it('should use error handler for recovery attempts', async () => {
      mockPlugin.saveData.mockRejectedValue(new Error('Save failed'));
      mockErrorHandler.handleError.mockResolvedValue(undefined);

      await expect(storageManager.saveData(testData, {
        retryOnFailure: false,
        createBackup: false
      })).rejects.toThrow();

      expect(mockErrorHandler.handleError).toHaveBeenCalled();
    });
  });

  describe('loadData', () => {
    it('should load and return data successfully', async () => {
      const testData = {
        version: '1.0.0',
        promptPacks: [],
        globalSettings: {}
      };

      mockPlugin.loadData.mockResolvedValue(testData);

      const result = await storageManager.loadData();

      expect(result).toEqual(testData);
      expect(mockPlugin.loadData).toHaveBeenCalled();
    });

    it('should return null when no data exists', async () => {
      mockPlugin.loadData.mockResolvedValue(null);

      const result = await storageManager.loadData();

      expect(result).toBeNull();
    });

    it('should migrate data when needed', async () => {
      const oldData = {
        version: '0.9.0',
        promptPacks: []
      };

      mockPlugin.loadData.mockResolvedValue(oldData);

      const result = await storageManager.loadData();

      expect(result.version).toBe('1.0.0');
      expect(result.globalSettings).toBeDefined();
    });

    it('should attempt recovery on load failure', async () => {
      mockPlugin.loadData.mockRejectedValue(new Error('Load failed'));
      mockErrorHandler.handleError.mockResolvedValue({ recovered: 'data' });

      const result = await storageManager.loadData();

      expect(result).toEqual({ recovered: 'data' });
      expect(mockErrorHandler.handleError).toHaveBeenCalled();
    });

    it('should fall back to backup recovery when error handler fails', async () => {
      mockPlugin.loadData.mockRejectedValue(new Error('Load failed'));
      mockErrorHandler.handleError.mockRejectedValue(new Error('Handler failed'));

      // Mock backup recovery
      const mockBackupFile = { path: 'backup.json' };
      const backupData = { version: '1.0.0', promptPacks: [] };

      mockPlugin.app.vault.getAbstractFileByPath
        .mockReturnValueOnce({ children: [{ name: 'auto-123.meta.json' }] }) // backup folder
        .mockReturnValueOnce(mockBackupFile); // backup file

      mockPlugin.app.vault.read
        .mockResolvedValueOnce(JSON.stringify({ timestamp: '2024-01-01', type: 'automatic' })) // metadata
        .mockResolvedValueOnce(JSON.stringify(backupData)); // backup data

      const result = await storageManager.loadData();

      expect(result.version).toBe('1.0.0');
    });

    it('should throw error when all recovery methods fail', async () => {
      mockPlugin.loadData.mockRejectedValue(new Error('Load failed'));
      mockErrorHandler.handleError.mockRejectedValue(new Error('Handler failed'));
      mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(null); // No backups

      await expect(storageManager.loadData()).rejects.toThrow(ValidationError);
    });
  });

  describe('backup management', () => {
    describe('createManualBackup', () => {
      it('should create manual backup with description', async () => {
        const testData = { version: '1.0.0', promptPacks: [] };
        mockPlugin.loadData.mockResolvedValue(testData);
        mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(null);
        mockPlugin.app.vault.createFolder.mockResolvedValue(undefined);
        mockPlugin.app.vault.create.mockResolvedValue(undefined);

        const backupId = await storageManager.createManualBackup('Test backup');

        expect(backupId).toMatch(/^manual-/);
        expect(mockPlugin.app.vault.create).toHaveBeenCalledTimes(2); // data + metadata
      });

      it('should throw error when no data to backup', async () => {
        mockPlugin.loadData.mockResolvedValue(null);

        await expect(storageManager.createManualBackup()).rejects.toThrow('No data to backup');
      });
    });

    describe('listBackups', () => {
      it('should list available backups sorted by timestamp', async () => {
        const mockFolder = {
          children: [
            { name: 'backup1.meta.json', path: 'backup1.meta.json' },
            { name: 'backup2.meta.json', path: 'backup2.meta.json' }
          ]
        };

        mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(mockFolder);
        mockPlugin.app.vault.read
          .mockResolvedValueOnce(JSON.stringify({
            timestamp: '2024-01-01T10:00:00Z',
            type: 'manual'
          }))
          .mockResolvedValueOnce(JSON.stringify({
            timestamp: '2024-01-01T09:00:00Z',
            type: 'automatic'
          }));

        const backups = await storageManager.listBackups();

        expect(backups).toHaveLength(2);
        expect(backups[0].id).toBe('backup1'); // Newer first
        expect(backups[1].id).toBe('backup2');
      });

      it('should return empty array when backup folder does not exist', async () => {
        mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(null);

        const backups = await storageManager.listBackups();

        expect(backups).toEqual([]);
      });

      it('should handle corrupted backup metadata gracefully', async () => {
        const mockFolder = {
          children: [
            { name: 'good.meta.json', path: 'good.meta.json' },
            { name: 'bad.meta.json', path: 'bad.meta.json' }
          ]
        };

        mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(mockFolder);
        mockPlugin.app.vault.read
          .mockResolvedValueOnce(JSON.stringify({ timestamp: '2024-01-01', type: 'manual' }))
          .mockRejectedValueOnce(new Error('Corrupted metadata'));

        const backups = await storageManager.listBackups();

        expect(backups).toHaveLength(1);
        expect(backups[0].id).toBe('good');
      });
    });

    describe('restoreFromBackup', () => {
      it('should restore data from backup successfully', async () => {
        const backupData = { version: '1.0.0', promptPacks: [] };
        const mockBackupFile = { path: 'backup.json' };

        mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(mockBackupFile);
        mockPlugin.app.vault.read.mockResolvedValue(JSON.stringify(backupData));
        mockPlugin.saveData.mockResolvedValue(undefined);
        mockPlugin.loadData.mockResolvedValue({}); // For pre-restore backup

        await storageManager.restoreFromBackup('test-backup');

        expect(mockPlugin.app.vault.read).toHaveBeenCalledWith(mockBackupFile);
        expect(mockPlugin.saveData).toHaveBeenCalledWith(backupData);
      });

      it('should throw error when backup file not found', async () => {
        mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(null);

        await expect(storageManager.restoreFromBackup('missing-backup'))
          .rejects.toThrow('Backup missing-backup not found');
      });

      it('should validate backup data before restoring', async () => {
        const invalidBackupData = { invalid: 'data' };
        const mockBackupFile = { path: 'backup.json' };

        mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(mockBackupFile);
        mockPlugin.app.vault.read.mockResolvedValue(JSON.stringify(invalidBackupData));

        await expect(storageManager.restoreFromBackup('test-backup'))
          .rejects.toThrow(ValidationError);
      });
    });

    describe('deleteBackup', () => {
      it('should delete backup and metadata files', async () => {
        const mockBackupFile = { path: 'backup.json' };
        const mockMetadataFile = { path: 'backup.meta.json' };

        mockPlugin.app.vault.getAbstractFileByPath
          .mockReturnValueOnce(mockBackupFile)
          .mockReturnValueOnce(mockMetadataFile);
        mockPlugin.app.vault.delete.mockResolvedValue(undefined);

        await storageManager.deleteBackup('test-backup');

        expect(mockPlugin.app.vault.delete).toHaveBeenCalledWith(mockBackupFile);
        expect(mockPlugin.app.vault.delete).toHaveBeenCalledWith(mockMetadataFile);
      });

      it('should handle missing files gracefully', async () => {
        mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(null);

        // Should not throw
        await expect(storageManager.deleteBackup('missing-backup')).resolves.toBeUndefined();
      });
    });
  });

  describe('data migration', () => {
    it('should migrate data from version 0.x to 1.0.0', async () => {
      const oldData = {
        version: '0.9.0',
        promptPacks: [{
          id: 'pack1',
          name: 'Test Pack',
          type: 'Sequential',
          prompts: [{
            content: 'Test prompt'
          }]
        }]
      };

      mockPlugin.loadData.mockResolvedValue(oldData);

      const result = await storageManager.loadData();

      expect(result.version).toBe('1.0.0');
      expect(result.globalSettings).toBeDefined();
      expect(result.promptPacks[0].progress).toBeDefined();
      expect(result.promptPacks[0].settings).toBeDefined();
      expect(result.promptPacks[0].prompts[0].id).toBeDefined();
      expect(result.promptPacks[0].prompts[0].type).toBe('string');
    });

    it('should handle missing prompt pack fields during migration', async () => {
      const oldData = {
        version: '0.9.0',
        promptPacks: [{
          name: 'Test Pack',
          prompts: []
        }]
      };

      mockPlugin.loadData.mockResolvedValue(oldData);

      const result = await storageManager.loadData();

      const pack = result.promptPacks[0];
      expect(pack.id).toBeDefined();
      expect(pack.type).toBe('Sequential');
      expect(pack.createdAt).toBeDefined();
      expect(pack.updatedAt).toBeDefined();
      expect(pack.progress).toBeDefined();
      expect(pack.settings).toBeDefined();
    });

    it('should not migrate data that is already current version', async () => {
      const currentData = {
        version: '1.0.0',
        promptPacks: [],
        globalSettings: {}
      };

      mockPlugin.loadData.mockResolvedValue(currentData);

      const result = await storageManager.loadData();

      expect(result).toEqual(currentData);
    });
  });

  describe('data validation', () => {
    it('should validate correct data structure', () => {
      const validData = {
        version: '1.0.0',
        promptPacks: [{
          id: 'pack1',
          name: 'Test Pack',
          type: 'Sequential',
          prompts: []
        }],
        globalSettings: {}
      };

      // Should not throw
      expect(() => {
        (storageManager as any).validateDataStructure(validData);
      }).not.toThrow();
    });

    it('should reject non-object data', () => {
      expect(() => {
        (storageManager as any).validateDataStructure('invalid');
      }).toThrow(ValidationError);

      expect(() => {
        (storageManager as any).validateDataStructure(null);
      }).toThrow(ValidationError);
    });

    it('should reject invalid promptPacks structure', () => {
      const invalidData = {
        promptPacks: 'not an array'
      };

      expect(() => {
        (storageManager as any).validateDataStructure(invalidData);
      }).toThrow('promptPacks must be an array');
    });

    it('should reject invalid globalSettings structure', () => {
      const invalidData = {
        globalSettings: 'not an object'
      };

      expect(() => {
        (storageManager as any).validateDataStructure(invalidData);
      }).toThrow('globalSettings must be an object');
    });

    it('should validate individual prompt pack structure', () => {
      const invalidData = {
        promptPacks: [{
          name: 'Test Pack'
          // Missing required fields
        }]
      };

      expect(() => {
        (storageManager as any).validateDataStructure(invalidData);
      }).toThrow('must have a valid ID');
    });

    it('should validate prompt pack type', () => {
      const invalidData = {
        promptPacks: [{
          id: 'pack1',
          name: 'Test Pack',
          type: 'InvalidType'
        }]
      };

      expect(() => {
        (storageManager as any).validateDataStructure(invalidData);
      }).toThrow('must have a valid type');
    });
  });

  describe('storage statistics', () => {
    it('should return storage statistics', async () => {
      const testData = { version: '1.0.0', promptPacks: [] };
      mockPlugin.loadData.mockResolvedValue(testData);

      // Mock backup listing
      const mockFolder = {
        children: [
          { name: 'backup1.meta.json' },
          { name: 'backup2.meta.json' }
        ]
      };

      mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(mockFolder);
      mockPlugin.app.vault.read
        .mockResolvedValueOnce(JSON.stringify({
          timestamp: '2024-01-01T10:00:00Z',
          size: 1000
        }))
        .mockResolvedValueOnce(JSON.stringify({
          timestamp: '2024-01-01T09:00:00Z',
          size: 800
        }));

      const stats = await storageManager.getStorageStats();

      expect(stats.dataSize).toBeGreaterThan(0);
      expect(stats.backupCount).toBe(2);
      expect(stats.totalBackupSize).toBe(1800);
      expect(stats.newestBackup).toBe('2024-01-01T10:00:00Z');
      expect(stats.oldestBackup).toBe('2024-01-01T09:00:00Z');
    });

    it('should handle errors gracefully when getting stats', async () => {
      mockPlugin.loadData.mockRejectedValue(new Error('Load failed'));

      const stats = await storageManager.getStorageStats();

      expect(stats.dataSize).toBe(0);
      expect(stats.backupCount).toBe(0);
      expect(stats.totalBackupSize).toBe(0);
    });
  });

  describe('utility methods', () => {
    it('should compare versions correctly', () => {
      const compareVersions = (storageManager as any).compareVersions;

      expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
      expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
      expect(compareVersions('1.0.1', '1.0.0')).toBe(1);
      expect(compareVersions('1.0.0', '2.0.0')).toBe(-1);
      expect(compareVersions('2.0.0', '1.0.0')).toBe(1);
    });

    it('should handle version comparison with different lengths', () => {
      const compareVersions = (storageManager as any).compareVersions;

      expect(compareVersions('1.0', '1.0.0')).toBe(0);
      expect(compareVersions('1.0.0', '1.0')).toBe(0);
      expect(compareVersions('1.0', '1.0.1')).toBe(-1);
    });

    it('should create folders when they do not exist', async () => {
      mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(null);
      mockPlugin.app.vault.createFolder.mockResolvedValue(undefined);

      await (storageManager as any).ensureFolderExists('test/folder');

      expect(mockPlugin.app.vault.createFolder).toHaveBeenCalledWith('test/folder');
    });

    it('should not create folders when they already exist', async () => {
      mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue({ path: 'test/folder' });

      await (storageManager as any).ensureFolderExists('test/folder');

      expect(mockPlugin.app.vault.createFolder).not.toHaveBeenCalled();
    });

    it('should write to existing files', async () => {
      const mockFile = { path: 'test.txt' };
      mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(mockFile);
      mockPlugin.app.vault.modify.mockResolvedValue(undefined);

      await (storageManager as any).writeFile('test.txt', 'content');

      expect(mockPlugin.app.vault.modify).toHaveBeenCalledWith(mockFile, 'content');
      expect(mockPlugin.app.vault.create).not.toHaveBeenCalled();
    });

    it('should create new files when they do not exist', async () => {
      mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(null);
      mockPlugin.app.vault.create.mockResolvedValue(undefined);

      await (storageManager as any).writeFile('test.txt', 'content');

      expect(mockPlugin.app.vault.create).toHaveBeenCalledWith('test.txt', 'content');
      expect(mockPlugin.app.vault.modify).not.toHaveBeenCalled();
    });
  });
});