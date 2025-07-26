/**
 * Unit tests for DataRecoveryService
 */

import { DataRecoveryService, RecoveryReport, DataIntegrityCheck } from '../data-recovery-service';
import { StorageManager } from '../storage-manager';
import { ErrorHandler } from '../error-handler';
import { ValidationError } from '../models';

// Mock Obsidian Notice
global.Notice = jest.fn() as any;

// Mock plugin
const mockPlugin = {
  loadData: jest.fn(),
  app: {
    vault: {
      getAbstractFileByPath: jest.fn(),
      read: jest.fn(),
      delete: jest.fn()
    }
  }
};

// Mock storage manager
const mockStorageManager = {
  saveData: jest.fn(),
  listBackups: jest.fn(),
  createManualBackup: jest.fn()
};

// Mock error handler
const mockErrorHandler = {
  createContext: jest.fn().mockReturnValue({ id: 'test-context' }),
  handleError: jest.fn()
};

describe('DataRecoveryService', () => {
  let dataRecoveryService: DataRecoveryService;

  beforeEach(() => {
    jest.clearAllMocks();
    dataRecoveryService = new DataRecoveryService(
      mockPlugin as any,
      mockStorageManager as any,
      mockErrorHandler as any
    );
  });

  describe('checkDataIntegrity', () => {
    it('should return valid result for correct data structure', async () => {
      const validData = {
        version: '1.0.0',
        promptPacks: [{
          id: 'pack1',
          name: 'Test Pack',
          type: 'Sequential',
          prompts: [{
            id: 'prompt1',
            content: 'Test prompt',
            type: 'string'
          }],
          settings: {
            notificationEnabled: true,
            notificationTime: '09:00',
            notificationType: 'obsidian'
          },
          progress: {
            completedPrompts: [],
            lastAccessDate: '2024-01-01T00:00:00Z'
          },
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z'
        }],
        globalSettings: {
          defaultNotificationTime: '09:00',
          defaultZenMode: false,
          dailyNoteFolder: '',
          dailyNoteTemplate: '',
          linkHandling: 'direct'
        }
      };

      const result = await dataRecoveryService.checkDataIntegrity(validData);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
      expect(result.corruptedPacks).toHaveLength(0);
    });

    it('should detect missing basic structure', async () => {
      const invalidData = {
        version: '1.0.0'
        // Missing promptPacks and globalSettings
      };

      const result = await dataRecoveryService.checkDataIntegrity(invalidData);

      expect(result.isValid).toBe(false);
      expect(result.fixableIssues).toContain('Missing promptPacks array');
      expect(result.fixableIssues).toContain('Missing globalSettings object');
    });

    it('should detect invalid data types', async () => {
      const invalidData = {
        version: '1.0.0',
        promptPacks: 'not an array',
        globalSettings: 'not an object'
      };

      const result = await dataRecoveryService.checkDataIntegrity(invalidData);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('promptPacks is not an array');
      expect(result.errors).toContain('globalSettings is not an object');
    });

    it('should detect version compatibility issues', async () => {
      const futureVersionData = {
        version: '2.0.0',
        promptPacks: [],
        globalSettings: {}
      };

      const result = await dataRecoveryService.checkDataIntegrity(futureVersionData);

      expect(result.warnings.some(w => w.includes('newer than plugin version'))).toBe(true);
    });

    it('should detect old version warnings', async () => {
      const oldVersionData = {
        version: '0.0.1',
        promptPacks: [],
        globalSettings: {}
      };

      const result = await dataRecoveryService.checkDataIntegrity(oldVersionData);

      expect(result.warnings.some(w => w.includes('very old and may need migration'))).toBe(true);
    });

    it('should validate global settings', async () => {
      const invalidGlobalSettings = {
        version: '1.0.0',
        promptPacks: [],
        globalSettings: {
          defaultNotificationTime: '25:00', // Invalid time
          linkHandling: 'invalid' // Invalid option
        }
      };

      const result = await dataRecoveryService.checkDataIntegrity(invalidGlobalSettings);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid default notification time format');
      expect(result.errors).toContain('Invalid link handling setting');
    });

    it('should validate prompt pack structure', async () => {
      const invalidPromptPack = {
        version: '1.0.0',
        promptPacks: [{
          // Missing required fields
          name: 'Test Pack'
        }],
        globalSettings: {}
      };

      const result = await dataRecoveryService.checkDataIntegrity(invalidPromptPack);

      expect(result.isValid).toBe(false);
      expect(result.corruptedPacks).toContain('Test Pack');
      expect(result.errors.some(e => e.includes('Missing field: id'))).toBe(true);
    });

    it('should validate prompt structure', async () => {
      const invalidPrompts = {
        version: '1.0.0',
        promptPacks: [{
          id: 'pack1',
          name: 'Test Pack',
          type: 'Sequential',
          prompts: [{
            // Missing required fields
            content: 'Test prompt'
          }],
          settings: {},
          progress: {}
        }],
        globalSettings: {}
      };

      const result = await dataRecoveryService.checkDataIntegrity(invalidPrompts);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Prompt at index 0 missing ID'))).toBe(true);
    });

    it('should detect duplicate pack IDs', async () => {
      const duplicateIds = {
        version: '1.0.0',
        promptPacks: [
          { id: 'pack1', name: 'Pack 1', type: 'Sequential', prompts: [], settings: {}, progress: {} },
          { id: 'pack1', name: 'Pack 2', type: 'Random', prompts: [], settings: {}, progress: {} }
        ],
        globalSettings: {}
      };

      const result = await dataRecoveryService.checkDataIntegrity(duplicateIds);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Duplicate pack ID found: pack1');
    });

    it('should detect duplicate pack names', async () => {
      const duplicateNames = {
        version: '1.0.0',
        promptPacks: [
          { id: 'pack1', name: 'Test Pack', type: 'Sequential', prompts: [], settings: {}, progress: {} },
          { id: 'pack2', name: 'Test Pack', type: 'Random', prompts: [], settings: {}, progress: {} }
        ],
        globalSettings: {}
      };

      const result = await dataRecoveryService.checkDataIntegrity(duplicateNames);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Duplicate pack name found: Test Pack');
    });

    it('should handle null or undefined data', async () => {
      const result = await dataRecoveryService.checkDataIntegrity(null);

      expect(result.warnings).toContain('No data found - this may be a fresh installation');
    });

    it('should load data when not provided', async () => {
      const testData = { version: '1.0.0', promptPacks: [], globalSettings: {} };
      mockPlugin.loadData.mockResolvedValue(testData);

      const result = await dataRecoveryService.checkDataIntegrity();

      expect(mockPlugin.loadData).toHaveBeenCalled();
      expect(result.isValid).toBe(true);
    });

    it('should handle integrity check errors', async () => {
      mockPlugin.loadData.mockRejectedValue(new Error('Load failed'));

      const result = await dataRecoveryService.checkDataIntegrity();

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Integrity check failed: Load failed');
    });
  });

  describe('repairData', () => {
    it('should repair basic structure issues', async () => {
      const corruptedData = {
        version: '1.0.0'
        // Missing promptPacks and globalSettings
      };

      const { repaired, report } = await dataRecoveryService.repairData(corruptedData);

      expect(repaired.promptPacks).toEqual([]);
      expect(repaired.globalSettings).toBeDefined();
      expect(report.success).toBe(true);
      expect(report.issuesFixed).toContain('Added missing promptPacks array');
      expect(report.issuesFixed).toContain('Added missing globalSettings');
    });

    it('should repair global settings', async () => {
      const corruptedData = {
        version: '1.0.0',
        promptPacks: [],
        globalSettings: {
          defaultNotificationTime: '25:00', // Invalid
          linkHandling: 'invalid' // Invalid
        }
      };

      const { repaired, report } = await dataRecoveryService.repairData(corruptedData);

      expect(repaired.globalSettings.defaultNotificationTime).toBe('09:00');
      expect(repaired.globalSettings.linkHandling).toBe('direct');
      expect(report.issuesFixed).toContain('Fixed invalid default notification time');
      expect(report.issuesFixed).toContain('Fixed invalid link handling setting');
    });

    it('should repair prompt pack structure', async () => {
      const corruptedData = {
        version: '1.0.0',
        promptPacks: [{
          name: 'Test Pack',
          prompts: []
          // Missing required fields
        }],
        globalSettings: {}
      };

      const { repaired, report } = await dataRecoveryService.repairData(corruptedData);

      const pack = repaired.promptPacks[0];
      expect(pack.id).toBeDefined();
      expect(pack.type).toBe('Sequential');
      expect(pack.settings).toBeDefined();
      expect(pack.progress).toBeDefined();
      expect(pack.createdAt).toBeDefined();
      expect(pack.updatedAt).toBeDefined();
      expect(report.issuesFixed.length).toBeGreaterThan(0);
    });

    it('should repair prompt structure', async () => {
      const corruptedData = {
        version: '1.0.0',
        promptPacks: [{
          id: 'pack1',
          name: 'Test Pack',
          type: 'Sequential',
          prompts: [{
            content: 'Test prompt'
            // Missing id and type
          }],
          settings: {},
          progress: {}
        }],
        globalSettings: {}
      };

      const { repaired, report } = await dataRecoveryService.repairData(corruptedData);

      const prompt = repaired.promptPacks[0].prompts[0];
      expect(prompt.id).toBeDefined();
      expect(prompt.type).toBe('string');
      expect(prompt.metadata).toBeDefined();
      expect(report.issuesFixed.some(f => f.includes('Generated missing ID'))).toBe(true);
    });

    it('should remove invalid prompt packs', async () => {
      const corruptedData = {
        version: '1.0.0',
        promptPacks: [
          null, // Invalid pack
          { id: 'pack1', name: 'Valid Pack', type: 'Sequential', prompts: [], settings: {}, progress: {} }
        ],
        globalSettings: {}
      };

      const { repaired, report } = await dataRecoveryService.repairData(corruptedData);

      expect(repaired.promptPacks).toHaveLength(1);
      expect(repaired.promptPacks[0].name).toBe('Valid Pack');
      expect(report.issuesFixed.some(f => f.includes('Removed invalid pack'))).toBe(true);
    });

    it('should handle already valid data', async () => {
      const validData = {
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

      const { repaired, report } = await dataRecoveryService.repairData(validData);

      expect(report.success).toBe(true);
      expect(report.dataRecovered).toBe(true);
      expect(repaired).toEqual(validData);
    });

    it('should handle repair errors', async () => {
      const invalidData = 'not an object';

      await expect(dataRecoveryService.repairData(invalidData)).rejects.toThrow();
    });
  });

  describe('recoverData', () => {
    it('should recover using current data repair', async () => {
      const corruptedData = {
        version: '1.0.0',
        promptPacks: []
        // Missing globalSettings
      };

      mockPlugin.loadData.mockResolvedValue(corruptedData);
      mockStorageManager.saveData.mockResolvedValue(undefined);

      const report = await dataRecoveryService.recoverData();

      expect(report.success).toBe(true);
      expect(report.method).toBe('data_repair');
      expect(report.dataRecovered).toBe(true);
      expect(mockStorageManager.saveData).toHaveBeenCalled();
    });

    it('should recover using backup when current data fails', async () => {
      mockPlugin.loadData.mockRejectedValue(new Error('Load failed'));

      const backupData = {
        version: '1.0.0',
        promptPacks: [],
        globalSettings: {}
      };

      mockStorageManager.listBackups.mockResolvedValue([
        { id: 'backup1', metadata: { timestamp: '2024-01-01' } }
      ]);

      const mockBackupFile = { path: 'backup1.json' };
      mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(mockBackupFile);
      mockPlugin.app.vault.read.mockResolvedValue(JSON.stringify(backupData));
      mockStorageManager.saveData.mockResolvedValue(undefined);

      const report = await dataRecoveryService.recoverData();

      expect(report.success).toBe(true);
      expect(report.method).toBe('backup_recovery');
      expect(report.backupsUsed).toContain('backup1');
    });

    it('should create default data when all else fails', async () => {
      mockPlugin.loadData.mockRejectedValue(new Error('Load failed'));
      mockStorageManager.listBackups.mockResolvedValue([]);
      mockStorageManager.saveData.mockResolvedValue(undefined);

      const report = await dataRecoveryService.recoverData();

      expect(report.success).toBe(true);
      expect(report.method).toBe('default_data');
      expect(report.issuesFixed).toContain('Created fresh default data');
    });

    it('should fail when all recovery methods fail', async () => {
      mockPlugin.loadData.mockRejectedValue(new Error('Load failed'));
      mockStorageManager.listBackups.mockRejectedValue(new Error('Backup list failed'));
      mockStorageManager.saveData.mockRejectedValue(new Error('Save failed'));

      const report = await dataRecoveryService.recoverData();

      expect(report.success).toBe(false);
      expect(report.method).toBe('all_failed');
    });

    it('should try multiple backups if first fails', async () => {
      mockPlugin.loadData.mockRejectedValue(new Error('Load failed'));

      mockStorageManager.listBackups.mockResolvedValue([
        { id: 'backup1', metadata: { timestamp: '2024-01-02' } },
        { id: 'backup2', metadata: { timestamp: '2024-01-01' } }
      ]);

      // First backup fails
      mockPlugin.app.vault.getAbstractFileByPath
        .mockReturnValueOnce(null) // backup1 not found
        .mockReturnValueOnce({ path: 'backup2.json' }); // backup2 found

      mockPlugin.app.vault.read.mockResolvedValue(JSON.stringify({
        version: '1.0.0',
        promptPacks: [],
        globalSettings: {}
      }));

      mockStorageManager.saveData.mockResolvedValue(undefined);

      const report = await dataRecoveryService.recoverData();

      expect(report.success).toBe(true);
      expect(report.backupsUsed).toContain('backup2');
    });
  });

  describe('showRecoveryNotification', () => {
    it('should show success notification', () => {
      const successReport: RecoveryReport = {
        success: true,
        method: 'data_repair',
        dataRecovered: true,
        backupsUsed: [],
        issuesFound: [],
        issuesFixed: ['Fixed 1 issue'],
        timestamp: new Date()
      };

      dataRecoveryService.showRecoveryNotification(successReport);

      expect(global.Notice).toHaveBeenCalledWith(
        expect.stringContaining('Data recovery successful'),
        8000
      );
    });

    it('should show backup usage in notification', () => {
      const backupReport: RecoveryReport = {
        success: true,
        method: 'backup_recovery',
        dataRecovered: true,
        backupsUsed: ['backup1'],
        issuesFound: [],
        issuesFixed: [],
        timestamp: new Date()
      };

      dataRecoveryService.showRecoveryNotification(backupReport);

      expect(global.Notice).toHaveBeenCalledWith(
        expect.stringContaining('Used backup: backup1'),
        8000
      );
    });

    it('should show failure notification', () => {
      const failureReport: RecoveryReport = {
        success: false,
        method: 'all_failed',
        dataRecovered: false,
        backupsUsed: [],
        issuesFound: ['Multiple errors'],
        issuesFixed: [],
        timestamp: new Date()
      };

      dataRecoveryService.showRecoveryNotification(failureReport);

      expect(global.Notice).toHaveBeenCalledWith(
        expect.stringContaining('Data recovery failed'),
        0 // Don't auto-dismiss
      );
    });
  });

  describe('utility methods', () => {
    it('should validate time format correctly', () => {
      const isValidTimeFormat = (dataRecoveryService as any).isValidTimeFormat;

      expect(isValidTimeFormat('09:00')).toBe(true);
      expect(isValidTimeFormat('23:59')).toBe(true);
      expect(isValidTimeFormat('00:00')).toBe(true);

      expect(isValidTimeFormat('25:00')).toBe(false);
      expect(isValidTimeFormat('12:60')).toBe(false);
      expect(isValidTimeFormat('9:00')).toBe(false);
      expect(isValidTimeFormat('invalid')).toBe(false);
    });

    it('should validate date format correctly', () => {
      const isValidDate = (dataRecoveryService as any).isValidDate;

      expect(isValidDate(new Date())).toBe(true);
      expect(isValidDate('2024-01-01T00:00:00Z')).toBe(true);
      expect(isValidDate('2024-01-01')).toBe(true);

      expect(isValidDate('invalid-date')).toBe(false);
      expect(isValidDate(null)).toBe(false);
      expect(isValidDate(undefined)).toBe(false);
      expect(isValidDate(123)).toBe(false);
    });

    it('should compare versions correctly', () => {
      const compareVersions = (dataRecoveryService as any).compareVersions;

      expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
      expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
      expect(compareVersions('1.0.1', '1.0.0')).toBe(1);
      expect(compareVersions('1.0.0', '2.0.0')).toBe(-1);
      expect(compareVersions('2.0.0', '1.0.0')).toBe(1);
    });
  });

  describe('type-specific validation', () => {
    it('should validate Sequential pack prompts', async () => {
      const sequentialPack = {
        version: '1.0.0',
        promptPacks: [{
          id: 'pack1',
          name: 'Sequential Pack',
          type: 'Sequential',
          prompts: [{
            id: 'prompt1',
            content: 'Test',
            type: 'string',
            order: 'invalid' // Should be number
          }],
          settings: {},
          progress: {}
        }],
        globalSettings: {}
      };

      const result = await dataRecoveryService.checkDataIntegrity(sequentialPack);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('invalid order value'))).toBe(true);
    });

    it('should validate Date pack prompts', async () => {
      const datePack = {
        version: '1.0.0',
        promptPacks: [{
          id: 'pack1',
          name: 'Date Pack',
          type: 'Date',
          prompts: [{
            id: 'prompt1',
            content: 'Test',
            type: 'string',
            date: 'invalid-date'
          }],
          settings: {},
          progress: {}
        }],
        globalSettings: {}
      };

      const result = await dataRecoveryService.checkDataIntegrity(datePack);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('invalid date'))).toBe(true);
    });

    it('should validate pack settings', async () => {
      const invalidSettings = {
        version: '1.0.0',
        promptPacks: [{
          id: 'pack1',
          name: 'Test Pack',
          type: 'Sequential',
          prompts: [],
          settings: {
            notificationTime: '25:00', // Invalid
            notificationType: 'invalid' // Invalid
          },
          progress: {}
        }],
        globalSettings: {}
      };

      const result = await dataRecoveryService.checkDataIntegrity(invalidSettings);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid notification time format'))).toBe(true);
      expect(result.errors.some(e => e.includes('Invalid notification type'))).toBe(true);
    });

    it('should validate pack progress', async () => {
      const invalidProgress = {
        version: '1.0.0',
        promptPacks: [{
          id: 'pack1',
          name: 'Test Pack',
          type: 'Sequential',
          prompts: [],
          settings: {},
          progress: {
            completedPrompts: 'not an array',
            usedPrompts: 'not an array',
            lastAccessDate: 'invalid-date'
          }
        }],
        globalSettings: {}
      };

      const result = await dataRecoveryService.checkDataIntegrity(invalidProgress);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Completed prompts is not an array'))).toBe(true);
      expect(result.errors.some(e => e.includes('Used prompts is not an array'))).toBe(true);
      expect(result.errors.some(e => e.includes('Invalid last access date'))).toBe(true);
    });
  });
});