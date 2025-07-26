/**
 * Tests for ImportExportService
 */

import { ImportExportService, ConflictResolution, ExportOptions, ImportOptions, FileOperationOptions, ProgressCallback } from '../import-export-service';
import { PromptPack, Prompt, PromptPackSettings, PromptProgress, ValidationError } from '../models';

// Mock Obsidian modules
jest.mock('obsidian', () => ({
  TFile: class TFile {
    path: string;
    extension: string;
    stat: { mtime: number };
    constructor(path: string) {
      this.path = path;
      this.extension = path.split('.').pop() || '';
      this.stat = { mtime: Date.now() };
    }
  },
  TFolder: class TFolder {
    children: any[] = [];
  },
  Vault: class Vault {},
  normalizePath: (path: string) => path.replace(/\\/g, '/').replace(/\/+/g, '/')
}));

import { TFile, TFolder, Vault } from 'obsidian';

describe('ImportExportService', () => {
  let service: ImportExportService;
  let samplePack: PromptPack;
  let mockVault: jest.Mocked<Vault>;

  beforeEach(() => {
    // Create mock vault
    mockVault = {
      create: jest.fn(),
      read: jest.fn(),
      delete: jest.fn(),
      createFolder: jest.fn(),
      getAbstractFileByPath: jest.fn(),
    } as any;

    service = new ImportExportService(mockVault);

    // Create a sample prompt pack for testing
    samplePack = new PromptPack({
      name: 'Test Pack',
      type: 'Sequential',
      prompts: [
        new Prompt({ content: 'What are you grateful for?', type: 'string', order: 1 }),
        new Prompt({ content: 'What did you learn today?', type: 'string', order: 2 }),
        new Prompt({ content: '[[Daily Reflection]]', type: 'link', order: 3 })
      ],
      settings: new PromptPackSettings({
        notificationEnabled: true,
        notificationTime: '09:00',
        zenModeEnabled: true
      })
    });
  });

  describe('exportPack', () => {
    it('should export a valid prompt pack to JSON', async () => {
      const jsonString = await service.exportPack(samplePack);
      const exportData = JSON.parse(jsonString);

      expect(exportData).toHaveProperty('version');
      expect(exportData).toHaveProperty('pack');
      expect(exportData).toHaveProperty('metadata');
      expect(exportData.pack.name).toBe('Test Pack');
      expect(exportData.pack.type).toBe('Sequential');
      expect(exportData.pack.prompts).toHaveLength(3);
    });

    it('should include metadata with export information', async () => {
      const jsonString = await service.exportPack(samplePack);
      const exportData = JSON.parse(jsonString);

      expect(exportData.metadata).toHaveProperty('exportedAt');
      expect(exportData.metadata).toHaveProperty('exportedBy');
      expect(exportData.metadata).toHaveProperty('version');
      expect(exportData.metadata.exportedBy).toContain('Daily Prompts Plugin');
    });

    it('should exclude progress when includeProgress is false', async () => {
      // Mark some prompts as completed
      samplePack.progress.markCompleted(samplePack.prompts[0].id);

      const options: ExportOptions = { includeProgress: false };
      const jsonString = await service.exportPack(samplePack, options);
      const exportData = JSON.parse(jsonString);

      expect(exportData.pack.progress.completedPrompts).toHaveLength(0);
    });

    it('should include progress when includeProgress is true', async () => {
      // Mark some prompts as completed
      samplePack.progress.markCompleted(samplePack.prompts[0].id);

      const options: ExportOptions = { includeProgress: true };
      const jsonString = await service.exportPack(samplePack, options);
      const exportData = JSON.parse(jsonString);

      expect(exportData.pack.progress.completedPrompts).toHaveLength(1);
    });

    it('should minify JSON when minifyJson option is true', async () => {
      const options: ExportOptions = { minifyJson: true };
      const jsonString = await service.exportPack(samplePack, options);

      // Minified JSON should not contain newlines or extra spaces
      expect(jsonString).not.toContain('\n');
      expect(jsonString).not.toContain('  ');
    });

    it('should format JSON with indentation by default', async () => {
      const jsonString = await service.exportPack(samplePack);

      // Formatted JSON should contain newlines and indentation
      expect(jsonString).toContain('\n');
      expect(jsonString).toContain('  ');
    });

    it('should throw error for invalid prompt pack', async () => {
      const invalidPack = { ...samplePack, name: '' } as any;

      await expect(service.exportPack(invalidPack)).rejects.toThrow('Failed to export prompt pack');
    });

    it('should handle Date-type prompts correctly', async () => {
      const datePack = new PromptPack({
        name: 'Date Pack',
        type: 'Date',
        prompts: [
          new Prompt({
            content: 'New Year reflection',
            type: 'string',
            date: new Date('2024-01-01')
          })
        ]
      });

      const jsonString = await service.exportPack(datePack);
      const exportData = JSON.parse(jsonString);

      expect(exportData.pack.prompts[0].date).toBe('2024-01-01T00:00:00.000Z');
    });
  });

  describe('importPack', () => {
    let exportedJson: string;

    beforeEach(async () => {
      exportedJson = await service.exportPack(samplePack);
    });

    it('should import a valid prompt pack from JSON', async () => {
      const importedPack = await service.importPack(exportedJson);

      expect(importedPack.name).toBe('Test Pack');
      expect(importedPack.type).toBe('Sequential');
      expect(importedPack.prompts).toHaveLength(3);
      expect(importedPack.prompts[0].content).toBe('What are you grateful for?');
    });

    it('should preserve prompt order in Sequential packs', async () => {
      const importedPack = await service.importPack(exportedJson);

      expect(importedPack.prompts[0].order).toBe(1);
      expect(importedPack.prompts[1].order).toBe(2);
      expect(importedPack.prompts[2].order).toBe(3);
    });

    it('should preserve prompt types correctly', async () => {
      const importedPack = await service.importPack(exportedJson);

      expect(importedPack.prompts[0].type).toBe('string');
      expect(importedPack.prompts[1].type).toBe('string');
      expect(importedPack.prompts[2].type).toBe('link');
    });

    it('should preserve settings correctly', async () => {
      const importedPack = await service.importPack(exportedJson);

      expect(importedPack.settings.notificationEnabled).toBe(true);
      expect(importedPack.settings.notificationTime).toBe('09:00');
      expect(importedPack.settings.zenModeEnabled).toBe(true);
    });

    it('should generate new IDs when preserveIds is false', async () => {
      const options: ImportOptions = { preserveIds: false };
      const importedPack = await service.importPack(exportedJson, options);

      expect(importedPack.id).not.toBe(samplePack.id);
      expect(importedPack.prompts[0].id).not.toBe(samplePack.prompts[0].id);
    });

    it('should preserve IDs when preserveIds is true', async () => {
      const options: ImportOptions = { preserveIds: true };
      const importedPack = await service.importPack(exportedJson, options);

      expect(importedPack.id).toBe(samplePack.id);
      expect(importedPack.prompts[0].id).toBe(samplePack.prompts[0].id);
    });

    it('should handle conflict resolution with rename', async () => {
      const conflictResolution: ConflictResolution = {
        action: 'rename',
        newName: 'Renamed Test Pack'
      };
      const options: ImportOptions = { conflictResolution };
      const importedPack = await service.importPack(exportedJson, options);

      expect(importedPack.name).toBe('Renamed Test Pack');
    });

    it('should reset progress when not preserving IDs', async () => {
      // Mark some prompts as completed in original
      samplePack.progress.markCompleted(samplePack.prompts[0].id);
      const exportedWithProgress = await service.exportPack(samplePack, { includeProgress: true });

      const options: ImportOptions = { preserveIds: false };
      const importedPack = await service.importPack(exportedWithProgress, options);

      expect(importedPack.progress.completedPrompts.size).toBe(0);
    });

    it('should validate only when validateOnly option is true', async () => {
      const options: ImportOptions = { validateOnly: true };
      const result = await service.importPack(exportedJson, options);

      // Should return a valid pack but not actually import
      expect(result).toBeInstanceOf(PromptPack);
      expect(result.name).toBe('Test Pack');
    });

    it('should throw error for invalid JSON', async () => {
      const invalidJson = '{ invalid json }';

      await expect(service.importPack(invalidJson)).rejects.toThrow('Failed to import prompt pack');
    });

    it('should throw error for missing required fields', async () => {
      const invalidData = JSON.stringify({
        version: '1.0.0',
        pack: { name: 'Test' }, // Missing required fields
        metadata: {}
      });

      await expect(service.importPack(invalidData)).rejects.toThrow('Invalid import data');
    });

    it('should handle Date objects correctly', async () => {
      const testDate = new Date('2024-01-01T12:00:00.000Z'); // Use UTC time to avoid timezone issues
      const datePack = new PromptPack({
        name: 'Date Pack',
        type: 'Date',
        prompts: [
          new Prompt({
            content: 'New Year reflection',
            type: 'string',
            date: testDate
          })
        ]
      });

      const exportedDatePack = await service.exportPack(datePack);
      const importedDatePack = await service.importPack(exportedDatePack);

      expect(importedDatePack.prompts[0].date).toBeInstanceOf(Date);
      expect(importedDatePack.prompts[0].date?.getTime()).toBe(testDate.getTime());
    });
  });

  describe('validatePackFormat', () => {
    it('should return true for valid pack format', async () => {
      const exportedJson = await service.exportPack(samplePack);
      const isValid = service.validatePackFormat(exportedJson);

      expect(isValid).toBe(true);
    });

    it('should return false for invalid JSON', () => {
      const invalidJson = '{ invalid json }';
      const isValid = service.validatePackFormat(invalidJson);

      expect(isValid).toBe(false);
    });

    it('should return false for missing required fields', () => {
      const invalidData = JSON.stringify({
        version: '1.0.0',
        pack: { name: 'Test' } // Missing required fields
      });
      const isValid = service.validatePackFormat(invalidData);

      expect(isValid).toBe(false);
    });

    it('should return false for invalid pack type', () => {
      const invalidData = JSON.stringify({
        version: '1.0.0',
        pack: {
          id: 'test-id',
          name: 'Test Pack',
          type: 'InvalidType',
          prompts: []
        },
        metadata: {}
      });
      const isValid = service.validatePackFormat(invalidData);

      expect(isValid).toBe(false);
    });
  });

  describe('getValidationResults', () => {
    it('should return detailed validation results for valid data', async () => {
      const exportedJson = await service.exportPack(samplePack);
      const results = service.getValidationResults(exportedJson);

      expect(results.isValid).toBe(true);
      expect(results.errors).toHaveLength(0);
    });

    it('should return errors for invalid data', () => {
      const invalidData = JSON.stringify({
        version: '1.0.0',
        pack: { name: 'Test' } // Missing required fields
      });
      const results = service.getValidationResults(invalidData);

      expect(results.isValid).toBe(false);
      expect(results.errors.length).toBeGreaterThan(0);
    });

    it('should return warnings for version mismatch', () => {
      const dataWithOldVersion = JSON.stringify({
        version: '0.9.0',
        pack: {
          id: 'test-id',
          name: 'Test Pack',
          type: 'Sequential',
          prompts: []
        },
        metadata: {}
      });
      const results = service.getValidationResults(dataWithOldVersion);

      expect(results.warnings.length).toBeGreaterThan(0);
      expect(results.warnings[0]).toContain('Version mismatch');
    });

    it('should return warnings for missing metadata', () => {
      const dataWithoutMetadata = JSON.stringify({
        version: '1.0.0',
        pack: {
          id: 'test-id',
          name: 'Test Pack',
          type: 'Sequential',
          prompts: []
        }
      });
      const results = service.getValidationResults(dataWithoutMetadata);

      expect(results.warnings.length).toBeGreaterThan(0);
      expect(results.warnings[0]).toContain('Missing metadata');
    });
  });

  describe('exportMultiplePacks', () => {
    it('should export multiple packs as batch', async () => {
      const pack2 = new PromptPack({
        name: 'Test Pack 2',
        type: 'Random',
        prompts: [new Prompt({ content: 'Random prompt', type: 'string' })]
      });

      const batchJson = await service.exportMultiplePacks([samplePack, pack2]);
      const batchData = JSON.parse(batchJson);

      expect(batchData.type).toBe('batch');
      expect(batchData.packs).toHaveLength(2);
      expect(batchData.packs[0].pack.name).toBe('Test Pack');
      expect(batchData.packs[1].pack.name).toBe('Test Pack 2');
    });

    it('should include batch metadata', async () => {
      const batchJson = await service.exportMultiplePacks([samplePack]);
      const batchData = JSON.parse(batchJson);

      expect(batchData.metadata).toHaveProperty('exportedAt');
      expect(batchData.metadata).toHaveProperty('exportedBy');
      expect(batchData.metadata).toHaveProperty('version');
    });
  });

  describe('importMultiplePacks', () => {
    it('should import batch export correctly', async () => {
      const pack2 = new PromptPack({
        name: 'Test Pack 2',
        type: 'Random',
        prompts: [new Prompt({ content: 'Random prompt', type: 'string' })]
      });

      const batchJson = await service.exportMultiplePacks([samplePack, pack2]);
      const importedPacks = await service.importMultiplePacks(batchJson);

      expect(importedPacks).toHaveLength(2);
      expect(importedPacks[0].name).toBe('Test Pack');
      expect(importedPacks[1].name).toBe('Test Pack 2');
    });

    it('should import single pack as array', async () => {
      const singlePackJson = await service.exportPack(samplePack);
      const importedPacks = await service.importMultiplePacks(singlePackJson);

      expect(importedPacks).toHaveLength(1);
      expect(importedPacks[0].name).toBe('Test Pack');
    });
  });

  describe('utility methods', () => {
    it('should generate unique names for conflicts', () => {
      const existingNames = ['Test Pack', 'Test Pack (Imported)', 'Test Pack (Imported 2)'];
      const uniqueName = service.generateUniqueName('Test Pack', existingNames);

      expect(uniqueName).toBe('Test Pack (Imported 3)');
    });

    it('should detect progress data', async () => {
      samplePack.progress.markCompleted(samplePack.prompts[0].id);
      const exportedWithProgress = await service.exportPack(samplePack, { includeProgress: true });
      const exportedWithoutProgress = await service.exportPack(samplePack, { includeProgress: false });

      expect(service.hasProgressData(exportedWithProgress)).toBe(true);
      expect(service.hasProgressData(exportedWithoutProgress)).toBe(false);
    });

    it('should extract pack info correctly', async () => {
      const exportedJson = await service.exportPack(samplePack);
      const packInfo = service.getPackInfo(exportedJson);

      expect(packInfo).not.toBeNull();
      expect(packInfo!.name).toBe('Test Pack');
      expect(packInfo!.type).toBe('Sequential');
      expect(packInfo!.promptCount).toBe(3);
      expect(packInfo!.hasProgress).toBe(false);
    });

    it('should return null for invalid pack info', () => {
      const invalidJson = '{ invalid }';
      const packInfo = service.getPackInfo(invalidJson);

      expect(packInfo).toBeNull();
    });
  });

  describe('conflict resolution', () => {
    let existingPacks: PromptPack[];
    let conflictingPackJson: string;

    beforeEach(async () => {
      existingPacks = [samplePack];

      // Create a pack with the same name as samplePack
      const conflictingPack = new PromptPack({
        name: 'Test Pack', // Same name as samplePack
        type: 'Random',
        prompts: [new Prompt({ content: 'Conflicting prompt', type: 'string' })]
      });

      conflictingPackJson = await service.exportPack(conflictingPack);
    });

    it('should detect name conflicts', () => {
      const conflicts = service.checkImportConflicts(conflictingPackJson, existingPacks);

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].type).toBe('name');
      expect(conflicts[0].conflictingValue).toBe('Test Pack');
      expect(conflicts[0].existingPack?.name).toBe('Test Pack');
    });

    it('should suggest resolution for name conflicts', () => {
      const conflicts = service.checkImportConflicts(conflictingPackJson, existingPacks);

      expect(conflicts[0].suggestedResolution.action).toBe('rename');
      expect(conflicts[0].suggestedResolution.newName).toBe('Test Pack (Imported)');
    });

    it('should resolve conflicts automatically', () => {
      const resolution = service.resolveConflictsAutomatically(conflictingPackJson, existingPacks);

      expect(resolution.preserveIds).toBe(false);
      expect(resolution.conflictResolution?.action).toBe('rename');
      expect(resolution.conflictResolution?.newName).toBe('Test Pack (Imported)');
    });

    it('should import pack with conflict resolution', async () => {
      const result = await service.importPackWithConflictResolution(conflictingPackJson, existingPacks);

      expect(result.conflicts).toHaveLength(1);
      expect(result.pack.name).toBe('Test Pack (Imported)');
      expect(result.pack.id).not.toBe(samplePack.id); // Should have new ID
    });

    it('should import pack with user-provided resolution', async () => {
      const userResolution = {
        action: 'rename' as const,
        newName: 'My Custom Name'
      };

      const result = await service.importPackWithConflictResolution(
        conflictingPackJson,
        existingPacks,
        userResolution
      );

      expect(result.pack.name).toBe('My Custom Name');
    });

    it('should handle no conflicts', async () => {
      const uniquePack = new PromptPack({
        name: 'Unique Pack Name',
        type: 'Sequential',
        prompts: [new Prompt({ content: 'Unique prompt', type: 'string' })]
      });

      const uniquePackJson = await service.exportPack(uniquePack);
      const result = await service.importPackWithConflictResolution(uniquePackJson, existingPacks);

      expect(result.conflicts).toHaveLength(0);
      expect(result.pack.name).toBe('Unique Pack Name');
    });
  });

  describe('validation with feedback', () => {
    it('should provide user-friendly validation feedback for valid data', async () => {
      const exportedJson = await service.exportPack(samplePack);
      const feedback = service.validateImportWithFeedback(exportedJson);

      expect(feedback.isValid).toBe(true);
      expect(feedback.canImport).toBe(true);
      expect(feedback.errors).toHaveLength(0);
      expect(feedback.suggestions).toHaveLength(0);
    });

    it('should provide helpful suggestions for JSON parsing errors', () => {
      const invalidJson = '{ invalid json }';
      const feedback = service.validateImportWithFeedback(invalidJson);

      expect(feedback.isValid).toBe(false);
      expect(feedback.canImport).toBe(false);
      expect(feedback.suggestions).toContain('Ensure the file is a valid JSON format exported from Daily Prompts plugin');
    });

    it('should provide suggestions for version mismatches', () => {
      const oldVersionData = JSON.stringify({
        version: '0.9.0',
        pack: {
          id: 'test-id',
          name: 'Test Pack',
          type: 'Sequential',
          prompts: []
        },
        metadata: {}
      });

      const feedback = service.validateImportWithFeedback(oldVersionData);

      expect(feedback.canImport).toBe(true); // Should still be importable
      expect(feedback.suggestions).toContain('This pack was exported from a different plugin version but should still import correctly');
    });

    it('should provide suggestions for missing metadata', () => {
      const noMetadataData = JSON.stringify({
        version: '1.0.0',
        pack: {
          id: 'test-id',
          name: 'Test Pack',
          type: 'Sequential',
          prompts: []
        }
      });

      const feedback = service.validateImportWithFeedback(noMetadataData);

      expect(feedback.canImport).toBe(true);
      expect(feedback.suggestions).toContain('This appears to be an older export format - import will work but some information may be missing');
    });

    it('should indicate when import cannot proceed', () => {
      const invalidData = JSON.stringify({
        version: '1.0.0',
        pack: { name: 'Test' } // Missing required fields
      });

      const feedback = service.validateImportWithFeedback(invalidData);

      expect(feedback.isValid).toBe(false);
      expect(feedback.canImport).toBe(false);
      expect(feedback.errors.length).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('should handle export errors gracefully', async () => {
      const invalidPack = null as any;

      await expect(service.exportPack(invalidPack)).rejects.toThrow('Failed to export prompt pack');
    });

    it('should handle import errors gracefully', async () => {
      const invalidJson = 'not json';

      await expect(service.importPack(invalidJson)).rejects.toThrow('Failed to import prompt pack');
    });

    it('should provide meaningful error messages', async () => {
      const emptyJson = '';

      await expect(service.importPack(emptyJson)).rejects.toThrow('must be a non-empty string');
    });

    it('should handle conflicts check errors gracefully', () => {
      const invalidJson = 'invalid';
      const conflicts = service.checkImportConflicts(invalidJson, []);

      expect(conflicts).toHaveLength(0);
    });
  });

  describe('file operations', () => {
    let mockFile: jest.Mocked<TFile>;
    let mockFolder: jest.Mocked<TFolder>;

    beforeEach(() => {
      mockFile = {
        path: 'exports/test_pack_2024-01-01.json',
        extension: 'json',
        stat: { mtime: Date.now() }
      } as any;

      mockFolder = {
        children: [mockFile]
      } as any;
    });

    describe('exportPackToFile', () => {
      it('should export pack to file successfully', async () => {
        mockVault.create.mockResolvedValue(mockFile);
        mockVault.getAbstractFileByPath.mockReturnValue(null); // Folder doesn't exist
        mockVault.createFolder.mockResolvedValue(mockFolder);

        const result = await service.exportPackToFile(samplePack);

        expect(result.success).toBe(true);
        expect(result.filePath).toBe(mockFile.path);
        expect(mockVault.create).toHaveBeenCalled();
        expect(mockVault.createFolder).toHaveBeenCalledWith('exports');
      });

      it('should handle export errors gracefully', async () => {
        mockVault.create.mockRejectedValue(new Error('File creation failed'));

        const result = await service.exportPackToFile(samplePack);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Failed to export pack to file');
      });

      it('should call progress callback during export', async () => {
        mockVault.create.mockResolvedValue(mockFile);
        mockVault.getAbstractFileByPath.mockReturnValue(mockFolder); // Folder exists

        const progressCallback = jest.fn();
        await service.exportPackToFile(samplePack, {}, progressCallback);

        expect(progressCallback).toHaveBeenCalledWith(0, 100, 'Preparing export data...');
        expect(progressCallback).toHaveBeenCalledWith(100, 100, 'Export complete');
      });

      it('should use custom filename and folder', async () => {
        mockVault.create.mockResolvedValue(mockFile);
        mockVault.getAbstractFileByPath.mockReturnValue(mockFolder);

        const options: FileOperationOptions = {
          filename: 'custom_name.json',
          folder: 'custom_folder'
        };

        await service.exportPackToFile(samplePack, options);

        expect(mockVault.create).toHaveBeenCalledWith(
          'custom_folder/custom_name.json',
          expect.any(String)
        );
      });
    });

    describe('importPackFromFile', () => {
      let exportedJson: string;

      beforeEach(async () => {
        exportedJson = await service.exportPack(samplePack);
      });

      it('should import pack from file successfully', async () => {
        mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
        mockVault.read.mockResolvedValue(exportedJson);

        const result = await service.importPackFromFile(mockFile.path, []);

        expect(result.success).toBe(true);
        expect(result.data?.pack.name).toBe('Test Pack');
        expect(mockVault.read).toHaveBeenCalledWith(mockFile);
      });

      it('should handle file not found error', async () => {
        mockVault.getAbstractFileByPath.mockReturnValue(null);

        const result = await service.importPackFromFile('nonexistent.json', []);

        expect(result.success).toBe(false);
        expect(result.error).toContain('File not found');
      });

      it('should handle invalid file content', async () => {
        mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
        mockVault.read.mockResolvedValue('invalid json');

        const result = await service.importPackFromFile(mockFile.path, []);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Failed to import pack from file');
      });

      it('should call progress callback during import', async () => {
        mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
        mockVault.read.mockResolvedValue(exportedJson);

        const progressCallback = jest.fn();
        await service.importPackFromFile(mockFile.path, [], {}, progressCallback);

        expect(progressCallback).toHaveBeenCalledWith(0, 100, 'Reading file...');
        expect(progressCallback).toHaveBeenCalledWith(100, 100, 'Import complete');
      });
    });

    describe('exportMultiplePacksToFiles', () => {
      it('should export multiple packs to separate files', async () => {
        const pack2 = new PromptPack({
          name: 'Test Pack 2',
          type: 'Random',
          prompts: [new Prompt({ content: 'Random prompt', type: 'string' })]
        });

        mockVault.create.mockResolvedValue(mockFile);
        mockVault.getAbstractFileByPath.mockReturnValue(mockFolder);

        const results = await service.exportMultiplePacksToFiles([samplePack, pack2]);

        expect(results).toHaveLength(2);
        expect(results[0].success).toBe(true);
        expect(results[1].success).toBe(true);
        expect(mockVault.create).toHaveBeenCalledTimes(2);
      });

      it('should call progress callback for batch export', async () => {
        mockVault.create.mockResolvedValue(mockFile);
        mockVault.getAbstractFileByPath.mockReturnValue(mockFolder);

        const progressCallback = jest.fn();
        await service.exportMultiplePacksToFiles([samplePack], {}, progressCallback);

        expect(progressCallback).toHaveBeenCalledWith(0, 100, 'Exporting pack 1 of 1: Test Pack');
        expect(progressCallback).toHaveBeenCalledWith(100, 100, 'Exported 1 of 1 packs');
      });
    });

    describe('exportBatchToFile', () => {
      it('should export batch to single file', async () => {
        const pack2 = new PromptPack({
          name: 'Test Pack 2',
          type: 'Random',
          prompts: [new Prompt({ content: 'Random prompt', type: 'string' })]
        });

        mockVault.create.mockResolvedValue(mockFile);
        mockVault.getAbstractFileByPath.mockReturnValue(null);
        mockVault.createFolder.mockResolvedValue(mockFolder);

        const result = await service.exportBatchToFile([samplePack, pack2]);

        expect(result.success).toBe(true);
        expect(result.data?.packCount).toBe(2);
        expect(mockVault.create).toHaveBeenCalledTimes(1);
      });
    });

    describe('listExportFiles', () => {
      it('should list JSON files in export folder', async () => {
        mockVault.getAbstractFileByPath.mockReturnValue(mockFolder);

        const files = await service.listExportFiles('exports');

        expect(files).toHaveLength(1);
        expect(files[0]).toBe(mockFile);
      });

      it('should return empty array if folder not found', async () => {
        mockVault.getAbstractFileByPath.mockReturnValue(null);

        const files = await service.listExportFiles('nonexistent');

        expect(files).toHaveLength(0);
      });
    });

    describe('deleteExportFile', () => {
      it('should delete file successfully', async () => {
        mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
        mockVault.delete.mockResolvedValue();

        const result = await service.deleteExportFile(mockFile.path);

        expect(result.success).toBe(true);
        expect(mockVault.delete).toHaveBeenCalledWith(mockFile);
      });

      it('should handle file not found error', async () => {
        mockVault.getAbstractFileByPath.mockReturnValue(null);

        const result = await service.deleteExportFile('nonexistent.json');

        expect(result.success).toBe(false);
        expect(result.error).toContain('File not found');
      });
    });

    describe('getImportFileInfo', () => {
      let exportedJson: string;

      beforeEach(async () => {
        exportedJson = await service.exportPack(samplePack);
      });

      it('should get info for single pack file', async () => {
        mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
        mockVault.read.mockResolvedValue(exportedJson);

        const info = await service.getImportFileInfo(mockFile.path);

        expect(info.isValid).toBe(true);
        expect(info.isBatch).toBe(false);
        expect(info.packInfo?.name).toBe('Test Pack');
        expect(info.packInfo?.promptCount).toBe(3);
      });

      it('should get info for batch file', async () => {
        const batchJson = await service.exportMultiplePacks([samplePack]);
        mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
        mockVault.read.mockResolvedValue(batchJson);

        const info = await service.getImportFileInfo(mockFile.path);

        expect(info.isValid).toBe(true);
        expect(info.isBatch).toBe(true);
        expect(info.batchInfo?.packCount).toBe(1);
      });

      it('should handle file not found', async () => {
        mockVault.getAbstractFileByPath.mockReturnValue(null);

        const info = await service.getImportFileInfo('nonexistent.json');

        expect(info.isValid).toBe(false);
        expect(info.error).toContain('File not found');
      });
    });

    describe('utility methods', () => {
      it('should validate import file extension', () => {
        expect(service.isValidImportFile('test.json')).toBe(true);
        expect(service.isValidImportFile('test.JSON')).toBe(true);
        expect(service.isValidImportFile('test.txt')).toBe(false);
        expect(service.isValidImportFile('test')).toBe(false);
      });

      it('should format file size correctly', () => {
        expect(service.getFileSize(0)).toBe('0 Bytes');
        expect(service.getFileSize(1024)).toBe('1 KB');
        expect(service.getFileSize(1048576)).toBe('1 MB');
        expect(service.getFileSize(1073741824)).toBe('1 GB');
      });
    });
  });
});