/**
 * Integration tests for import/export round-trip scenarios
 */

import { ImportExportService } from '../../import-export-service';
import { PromptPack, Prompt, PromptPackSettings, PromptProgress } from '../../models';

// Mock Obsidian Vault
const mockVault = {
  create: jest.fn(),
  read: jest.fn(),
  delete: jest.fn(),
  createFolder: jest.fn(),
  getAbstractFileByPath: jest.fn()
};

describe('Import/Export Round-trip Integration', () => {
  let importExportService: ImportExportService;
  let originalPack: PromptPack;

  beforeEach(() => {
    jest.clearAllMocks();
    importExportService = new ImportExportService(mockVault as any);

    // Create a comprehensive test pack
    originalPack = new PromptPack({
      name: 'Comprehensive Test Pack',
      type: 'Sequential',
      prompts: [
        new Prompt({
          content: 'What are you grateful for today?',
          type: 'string',
          order: 1,
          metadata: { category: 'gratitude', difficulty: 'easy' }
        }),
        new Prompt({
          content: '[[Daily Reflection Template]]',
          type: 'link',
          order: 2,
          metadata: { category: 'reflection', template: true }
        }),
        new Prompt({
          content: '**Deep Thinking Question:**\n\nWhat *three lessons* did you learn this week?\n\n1. \n2. \n3. ',
          type: 'markdown',
          order: 3,
          metadata: { category: 'learning', format: 'list' }
        })
      ],
      settings: new PromptPackSettings({
        notificationEnabled: true,
        notificationTime: '09:30',
        notificationType: 'system',
        zenModeEnabled: true,
        dailyNoteIntegration: true,
        customTemplate: '## Prompt\n{{prompt}}\n\n## Response\n'
      }),
      progress: new PromptProgress({
        completedPrompts: new Set([originalPack.prompts?.[0]?.id].filter(Boolean)),
        currentIndex: 1,
        lastAccessDate: new Date('2024-01-15T10:30:00Z')
      })
    });

    // Add some progress
    if (originalPack.prompts.length > 0) {
      originalPack.progress.completedPrompts.add(originalPack.prompts[0].id);
    }
  });

  describe('basic round-trip scenarios', () => {
    it('should preserve all data through export/import cycle', async () => {
      // Export the pack
      const exportedJson = await importExportService.exportPack(originalPack, {
        includeProgress: true,
        minifyJson: false
      });

      // Import the pack
      const importedPack = await importExportService.importPack(exportedJson, {
        preserveIds: true
      });

      // Verify all data is preserved
      expect(importedPack.id).toBe(originalPack.id);
      expect(importedPack.name).toBe(originalPack.name);
      expect(importedPack.type).toBe(originalPack.type);
      expect(importedPack.prompts).toHaveLength(originalPack.prompts.length);

      // Verify prompts
      for (let i = 0; i < originalPack.prompts.length; i++) {
        const original = originalPack.prompts[i];
        const imported = importedPack.prompts[i];

        expect(imported.id).toBe(original.id);
        expect(imported.content).toBe(original.content);
        expect(imported.type).toBe(original.type);
        expect(imported.order).toBe(original.order);
        expect(imported.metadata).toEqual(original.metadata);
      }

      // Verify settings
      expect(importedPack.settings.notificationEnabled).toBe(originalPack.settings.notificationEnabled);
      expect(importedPack.settings.notificationTime).toBe(originalPack.settings.notificationTime);
      expect(importedPack.settings.notificationType).toBe(originalPack.settings.notificationType);
      expect(importedPack.settings.zenModeEnabled).toBe(originalPack.settings.zenModeEnabled);
      expect(importedPack.settings.dailyNoteIntegration).toBe(originalPack.settings.dailyNoteIntegration);
      expect(importedPack.settings.customTemplate).toBe(originalPack.settings.customTemplate);

      // Verify progress
      expect(importedPack.progress.completedPrompts.size).toBe(originalPack.progress.completedPrompts.size);
      expect(importedPack.progress.currentIndex).toBe(originalPack.progress.currentIndex);
      expect(importedPack.progress.lastAccessDate.getTime()).toBe(originalPack.progress.lastAccessDate.getTime());
    });

    it('should handle export without progress and import correctly', async () => {
      // Export without progress
      const exportedJson = await importExportService.exportPack(originalPack, {
        includeProgress: false
      });

      const importedPack = await importExportService.importPack(exportedJson);

      // Progress should be reset
      expect(importedPack.progress.completedPrompts.size).toBe(0);
      expect(importedPack.progress.currentIndex).toBe(0);

      // Other data should be preserved
      expect(importedPack.name).toBe(originalPack.name);
      expect(importedPack.prompts).toHaveLength(originalPack.prompts.length);
    });

    it('should generate new IDs when preserveIds is false', async () => {
      const exportedJson = await importExportService.exportPack(originalPack);

      const importedPack = await importExportService.importPack(exportedJson, {
        preserveIds: false
      });

      // IDs should be different
      expect(importedPack.id).not.toBe(originalPack.id);
      expect(importedPack.prompts[0].id).not.toBe(originalPack.prompts[0].id);

      // Content should be the same
      expect(importedPack.name).toBe(originalPack.name);
      expect(importedPack.prompts[0].content).toBe(originalPack.prompts[0].content);

      // Progress should be reset when IDs change
      expect(importedPack.progress.completedPrompts.size).toBe(0);
    });
  });

  describe('different pack types round-trip', () => {
    it('should handle Random pack round-trip', async () => {
      const randomPack = new PromptPack({
        name: 'Random Test Pack',
        type: 'Random',
        prompts: [
          new Prompt({ content: 'Random prompt 1', type: 'string' }),
          new Prompt({ content: 'Random prompt 2', type: 'string' }),
          new Prompt({ content: 'Random prompt 3', type: 'string' })
        ],
        settings: new PromptPackSettings({
          notificationEnabled: false,
          notificationTime: '14:00'
        })
      });

      // Add some used prompts for Random type
      randomPack.progress.usedPrompts = new Set([randomPack.prompts[0].id]);

      const exportedJson = await importExportService.exportPack(randomPack, {
        includeProgress: true
      });

      const importedPack = await importExportService.importPack(exportedJson, {
        preserveIds: true
      });

      expect(importedPack.type).toBe('Random');
      expect(importedPack.progress.usedPrompts?.size).toBe(1);
      expect(importedPack.progress.usedPrompts?.has(randomPack.prompts[0].id)).toBe(true);
    });

    it('should handle Date pack round-trip', async () => {
      const today = new Date('2024-01-15T12:00:00Z');
      const tomorrow = new Date('2024-01-16T12:00:00Z');

      const datePack = new PromptPack({
        name: 'Date Test Pack',
        type: 'Date',
        prompts: [
          new Prompt({
            content: 'Today prompt',
            type: 'string',
            date: today
          }),
          new Prompt({
            content: 'Tomorrow prompt',
            type: 'string',
            date: tomorrow
          })
        ],
        settings: new PromptPackSettings({
          notificationEnabled: true,
          notificationTime: '08:00'
        })
      });

      const exportedJson = await importExportService.exportPack(datePack);
      const importedPack = await importExportService.importPack(exportedJson, {
        preserveIds: true
      });

      expect(importedPack.type).toBe('Date');
      expect(importedPack.prompts[0].date).toBeInstanceOf(Date);
      expect(importedPack.prompts[0].date?.getTime()).toBe(today.getTime());
      expect(importedPack.prompts[1].date?.getTime()).toBe(tomorrow.getTime());
    });
  });

  describe('batch export/import round-trip', () => {
    it('should handle multiple packs batch export/import', async () => {
      const pack1 = originalPack;
      const pack2 = new PromptPack({
        name: 'Second Pack',
        type: 'Random',
        prompts: [
          new Prompt({ content: 'Random prompt', type: 'string' })
        ]
      });

      // Export as batch
      const batchJson = await importExportService.exportMultiplePacks([pack1, pack2]);
      const importedPacks = await importExportService.importMultiplePacks(batchJson);

      expect(importedPacks).toHaveLength(2);
      expect(importedPacks[0].name).toBe('Comprehensive Test Pack');
      expect(importedPacks[1].name).toBe('Second Pack');
      expect(importedPacks[0].type).toBe('Sequential');
      expect(importedPacks[1].type).toBe('Random');
    });

    it('should handle single pack imported as batch', async () => {
      const singlePackJson = await importExportService.exportPack(originalPack);
      const importedPacks = await importExportService.importMultiplePacks(singlePackJson);

      expect(importedPacks).toHaveLength(1);
      expect(importedPacks[0].name).toBe(originalPack.name);
    });
  });

  describe('file operations round-trip', () => {
    it('should export to file and import back correctly', async () => {
      const mockFile = {
        path: 'exports/comprehensive_test_pack_2024-01-15.json',
        extension: 'json',
        stat: { mtime: Date.now() }
      };

      mockVault.create.mockResolvedValue(mockFile);
      mockVault.getAbstractFileByPath.mockReturnValue({ children: [] }); // Folder exists
      mockVault.read.mockResolvedValue(await importExportService.exportPack(originalPack));

      // Export to file
      const exportResult = await importExportService.exportPackToFile(originalPack);
      expect(exportResult.success).toBe(true);
      expect(exportResult.filePath).toBe(mockFile.path);

      // Import from file
      const importResult = await importExportService.importPackFromFile(mockFile.path, []);
      expect(importResult.success).toBe(true);
      expect(importResult.data?.pack.name).toBe(originalPack.name);
    });

    it('should handle batch file export/import', async () => {
      const pack1 = originalPack;
      const pack2 = new PromptPack({
        name: 'Batch Pack 2',
        type: 'Random',
        prompts: [new Prompt({ content: 'Batch prompt', type: 'string' })]
      });

      const mockBatchFile = {
        path: 'exports/batch_export_2024-01-15.json',
        extension: 'json',
        stat: { mtime: Date.now() }
      };

      mockVault.create.mockResolvedValue(mockBatchFile);
      mockVault.getAbstractFileByPath.mockReturnValue({ children: [] });
      mockVault.read.mockResolvedValue(await importExportService.exportMultiplePacks([pack1, pack2]));

      // Export batch to file
      const exportResult = await importExportService.exportBatchToFile([pack1, pack2]);
      expect(exportResult.success).toBe(true);
      expect(exportResult.data?.packCount).toBe(2);

      // Import batch from file
      const importResult = await importExportService.importPackFromFile(mockBatchFile.path, []);
      expect(importResult.success).toBe(true);
      expect(importResult.data?.packs).toHaveLength(2);
    });
  });

  describe('validation round-trip', () => {
    it('should validate exported data correctly', async () => {
      const exportedJson = await importExportService.exportPack(originalPack);

      // Validate the exported data
      const isValid = importExportService.validatePackFormat(exportedJson);
      expect(isValid).toBe(true);

      const validationResults = importExportService.getValidationResults(exportedJson);
      expect(validationResults.isValid).toBe(true);
      expect(validationResults.errors).toHaveLength(0);

      // Import should succeed
      const importedPack = await importExportService.importPack(exportedJson);
      expect(importedPack.name).toBe(originalPack.name);
    });

    it('should provide helpful validation feedback', async () => {
      const exportedJson = await importExportService.exportPack(originalPack);

      const feedback = importExportService.validateImportWithFeedback(exportedJson);
      expect(feedback.isValid).toBe(true);
      expect(feedback.canImport).toBe(true);
      expect(feedback.errors).toHaveLength(0);
      expect(feedback.suggestions).toHaveLength(0);
    });

    it('should detect and report validation issues', async () => {
      // Create invalid JSON by corrupting the export
      const exportedJson = await importExportService.exportPack(originalPack);
      const corruptedJson = exportedJson.replace('"Sequential"', '"InvalidType"');

      const isValid = importExportService.validatePackFormat(corruptedJson);
      expect(isValid).toBe(false);

      const validationResults = importExportService.getValidationResults(corruptedJson);
      expect(validationResults.isValid).toBe(false);
      expect(validationResults.errors.length).toBeGreaterThan(0);
    });
  });

  describe('conflict resolution round-trip', () => {
    it('should handle name conflicts during import', async () => {
      const existingPacks = [originalPack];

      // Create a pack with the same name
      const conflictingPack = new PromptPack({
        name: originalPack.name, // Same name
        type: 'Random',
        prompts: [new Prompt({ content: 'Different content', type: 'string' })]
      });

      const conflictingJson = await importExportService.exportPack(conflictingPack);

      // Check for conflicts
      const conflicts = importExportService.checkImportConflicts(conflictingJson, existingPacks);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].type).toBe('name');

      // Import with conflict resolution
      const result = await importExportService.importPackWithConflictResolution(
        conflictingJson,
        existingPacks
      );

      expect(result.conflicts).toHaveLength(1);
      expect(result.pack.name).toBe(`${originalPack.name} (Imported)`);
      expect(result.pack.id).not.toBe(originalPack.id);
    });

    it('should handle custom conflict resolution', async () => {
      const existingPacks = [originalPack];
      const conflictingJson = await importExportService.exportPack(originalPack);

      const customResolution = {
        action: 'rename' as const,
        newName: 'Custom Renamed Pack'
      };

      const result = await importExportService.importPackWithConflictResolution(
        conflictingJson,
        existingPacks,
        customResolution
      );

      expect(result.pack.name).toBe('Custom Renamed Pack');
    });
  });

  describe('metadata preservation round-trip', () => {
    it('should preserve export metadata', async () => {
      const exportedJson = await importExportService.exportPack(originalPack);
      const exportData = JSON.parse(exportedJson);

      expect(exportData.metadata).toBeDefined();
      expect(exportData.metadata.exportedAt).toBeDefined();
      expect(exportData.metadata.exportedBy).toContain('Daily Prompts Plugin');
      expect(exportData.metadata.version).toBeDefined();

      // Metadata should be preserved through import
      const importedPack = await importExportService.importPack(exportedJson);
      expect(importedPack).toBeDefined(); // Import should succeed
    });

    it('should handle version differences gracefully', async () => {
      const exportedJson = await importExportService.exportPack(originalPack);
      const exportData = JSON.parse(exportedJson);

      // Simulate older version
      exportData.version = '0.9.0';
      const modifiedJson = JSON.stringify(exportData);

      const validationResults = importExportService.getValidationResults(modifiedJson);
      expect(validationResults.warnings.some(w => w.includes('Version mismatch'))).toBe(true);

      // Should still import successfully
      const importedPack = await importExportService.importPack(modifiedJson);
      expect(importedPack.name).toBe(originalPack.name);
    });
  });

  describe('edge cases round-trip', () => {
    it('should handle empty pack round-trip', async () => {
      const emptyPack = new PromptPack({
        name: 'Empty Pack',
        type: 'Sequential',
        prompts: []
      });

      const exportedJson = await importExportService.exportPack(emptyPack);
      const importedPack = await importExportService.importPack(exportedJson);

      expect(importedPack.name).toBe('Empty Pack');
      expect(importedPack.prompts).toHaveLength(0);
    });

    it('should handle pack with special characters', async () => {
      const specialPack = new PromptPack({
        name: 'Pack with "quotes" & <symbols> and émojis 🎉',
        type: 'Sequential',
        prompts: [
          new Prompt({
            content: 'Prompt with "quotes" & <HTML> and émojis 🤔',
            type: 'string'
          })
        ]
      });

      const exportedJson = await importExportService.exportPack(specialPack);
      const importedPack = await importExportService.importPack(exportedJson);

      expect(importedPack.name).toBe('Pack with "quotes" & <symbols> and émojis 🎉');
      expect(importedPack.prompts[0].content).toBe('Prompt with "quotes" & <HTML> and émojis 🤔');
    });

    it('should handle large pack round-trip', async () => {
      const largePrompts = Array.from({ length: 100 }, (_, i) =>
        new Prompt({
          content: `Prompt ${i + 1}: ${'A'.repeat(1000)}`, // Large content
          type: 'string',
          order: i + 1
        })
      );

      const largePack = new PromptPack({
        name: 'Large Pack',
        type: 'Sequential',
        prompts: largePrompts
      });

      const exportedJson = await importExportService.exportPack(largePack);
      const importedPack = await importExportService.importPack(exportedJson);

      expect(importedPack.prompts).toHaveLength(100);
      expect(importedPack.prompts[0].content).toContain('Prompt 1:');
      expect(importedPack.prompts[99].content).toContain('Prompt 100:');
    });
  });

  describe('performance round-trip', () => {
    it('should handle minified export/import efficiently', async () => {
      const startTime = Date.now();

      const minifiedJson = await importExportService.exportPack(originalPack, {
        minifyJson: true
      });

      const importedPack = await importExportService.importPack(minifiedJson);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete reasonably quickly (less than 1 second)
      expect(duration).toBeLessThan(1000);

      // Data should be preserved
      expect(importedPack.name).toBe(originalPack.name);
      expect(importedPack.prompts).toHaveLength(originalPack.prompts.length);

      // Minified JSON should be smaller
      const regularJson = await importExportService.exportPack(originalPack, {
        minifyJson: false
      });
      expect(minifiedJson.length).toBeLessThan(regularJson.length);
    });
  });
});