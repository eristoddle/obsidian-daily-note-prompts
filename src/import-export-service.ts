/**
 * Import/Export service for the Daily Prompts plugin
 * Handles JSON serialization, validation, and file operations
 */

import { PromptPack, ValidationError } from './models';
import { ExportedPromptPack } from './types';
import { IImportExportService } from './interfaces';
import { TFile, TFolder, Vault, normalizePath } from 'obsidian';

/**
 * Export metadata interface
 */
interface ExportMetadata {
  exportedAt: string;
  exportedBy: string;
  version: string;
}

/**
 * Import validation result interface
 */
interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Import conflict resolution options
 */
export interface ConflictResolution {
  action: 'rename' | 'replace' | 'skip';
  newName?: string;
}

/**
 * Import conflict information
 */
export interface ImportConflict {
  type: 'name' | 'id';
  conflictingValue: string;
  existingPack?: {
    id: string;
    name: string;
    promptCount: number;
  };
  suggestedResolution: ConflictResolution;
}

/**
 * Export options interface
 */
export interface ExportOptions {
  includeProgress?: boolean;
  includeMetadata?: boolean;
  minifyJson?: boolean;
}

/**
 * Import options interface
 */
export interface ImportOptions {
  validateOnly?: boolean;
  conflictResolution?: ConflictResolution;
  preserveIds?: boolean;
}

/**
 * File operation options interface
 */
export interface FileOperationOptions {
  folder?: string;
  filename?: string;
  showProgress?: boolean;
}

/**
 * Progress callback interface for file operations
 */
export interface ProgressCallback {
  (current: number, total: number, message: string): void;
}

/**
 * File operation result interface
 */
export interface FileOperationResult {
  success: boolean;
  filePath?: string;
  error?: string;
  data?: any;
}

/**
 * Service for handling import/export operations
 */
export class ImportExportService implements IImportExportService {
  private readonly CURRENT_VERSION = '1.0.0';
  private readonly PLUGIN_NAME = 'Daily Prompts Plugin';
  private vault: Vault;

  // Performance optimizations
  private validationCache: Map<string, { result: ValidationResult; timestamp: number }> = new Map();
  private readonly VALIDATION_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_VALIDATION_CACHE_SIZE = 20;
  private streamingThreshold = 1024 * 1024; // 1MB - use streaming for larger files
  private compressionThreshold = 10 * 1024; // 10KB - compress exports larger than this

  constructor(vault: Vault) {
    this.vault = vault;
  }

  /**
   * Export a prompt pack to JSON format
   */
  async exportPack(pack: PromptPack, options: ExportOptions = {}): Promise<string> {
    try {
      // Validate the pack before export
      pack.validate();

      // Create export data structure
      const exportData: ExportedPromptPack = {
        version: this.CURRENT_VERSION,
        pack: this.preparePackForExport(pack, options),
        metadata: this.createExportMetadata()
      };

      // Validate export integrity
      this.validateExportData(exportData);

      // Serialize to JSON
      const jsonString = options.minifyJson
        ? JSON.stringify(exportData)
        : JSON.stringify(exportData, null, 2);

      return jsonString;
    } catch (error) {
      throw new Error(`Failed to export prompt pack: ${error.message}`);
    }
  }

  /**
   * Import a prompt pack from JSON data
   */
  async importPack(jsonData: string, options: ImportOptions = {}): Promise<PromptPack> {
    try {
      // Parse JSON data
      const parsedData = this.parseJsonData(jsonData);

      // Validate format
      const validation = this.validateImportData(parsedData);
      if (!validation.isValid) {
        throw new Error(`Invalid import data: ${validation.errors.join(', ')}`);
      }

      // If validation only, return early
      if (options.validateOnly) {
        return PromptPack.fromJSON(parsedData.pack);
      }

      // Create prompt pack from imported data
      const importedPack = this.createPackFromImport(parsedData, options);

      // Validate the created pack
      importedPack.validate();

      return importedPack;
    } catch (error) {
      throw new Error(`Failed to import prompt pack: ${error.message}`);
    }
  }

  /**
   * Validate pack format without importing
   */
  validatePackFormat(jsonData: string): boolean {
    try {
      const parsedData = this.parseJsonData(jsonData);
      const validation = this.validateImportData(parsedData);
      return validation.isValid;
    } catch {
      return false;
    }
  }

  /**
   * Get detailed validation results with caching
   */
  getValidationResults(jsonData: string): ValidationResult {
    // Create cache key from data hash
    const cacheKey = this.hashString(jsonData);
    const cached = this.validationCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.VALIDATION_CACHE_TTL) {
      return cached.result;
    }

    try {
      const parsedData = this.parseJsonData(jsonData);
      const result = this.validateImportData(parsedData);

      // Cache the result
      this.cacheValidationResult(cacheKey, result);

      return result;
    } catch (error) {
      const result = {
        isValid: false,
        errors: [`JSON parsing failed: ${error.message}`],
        warnings: []
      };

      // Cache error results too (with shorter TTL)
      this.cacheValidationResult(cacheKey, result, this.VALIDATION_CACHE_TTL / 5);

      return result;
    }
  }

  /**
   * Cache validation result with size management
   */
  private cacheValidationResult(key: string, result: ValidationResult, ttl?: number): void {
    // Manage cache size
    if (this.validationCache.size >= this.MAX_VALIDATION_CACHE_SIZE) {
      // Remove oldest entries
      const entries = Array.from(this.validationCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toRemove = entries.slice(0, Math.floor(this.MAX_VALIDATION_CACHE_SIZE * 0.2));
      toRemove.forEach(([key]) => this.validationCache.delete(key));
    }

    this.validationCache.set(key, {
      result,
      timestamp: Date.now()
    });
  }

  /**
   * Generate hash for string (simple hash function)
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString();
  }

  /**
   * Export multiple packs as a batch
   */
  async exportMultiplePacks(packs: PromptPack[], options: ExportOptions = {}): Promise<string> {
    try {
      const exportedPacks = await Promise.all(
        packs.map(pack => this.exportPack(pack, options))
      );

      const batchExport = {
        version: this.CURRENT_VERSION,
        type: 'batch',
        packs: exportedPacks.map(json => JSON.parse(json)),
        metadata: this.createExportMetadata()
      };

      return options.minifyJson
        ? JSON.stringify(batchExport)
        : JSON.stringify(batchExport, null, 2);
    } catch (error) {
      throw new Error(`Failed to export multiple packs: ${error.message}`);
    }
  }

  /**
   * Import multiple packs from batch export
   */
  async importMultiplePacks(jsonData: string, options: ImportOptions = {}): Promise<PromptPack[]> {
    try {
      const parsedData = this.parseJsonData(jsonData);

      // Check if it's a batch export
      if (parsedData.type === 'batch' && Array.isArray(parsedData.packs)) {
        const importedPacks: PromptPack[] = [];

        for (const packData of parsedData.packs) {
          const packJson = JSON.stringify(packData);
          const pack = await this.importPack(packJson, options);
          importedPacks.push(pack);
        }

        return importedPacks;
      } else {
        // Single pack import
        const pack = await this.importPack(jsonData, options);
        return [pack];
      }
    } catch (error) {
      throw new Error(`Failed to import multiple packs: ${error.message}`);
    }
  }

  /**
   * Prepare pack data for export
   */
  private preparePackForExport(pack: PromptPack, options: ExportOptions): any {
    const packData = pack.toJSON();

    // Optionally exclude progress data
    if (!options.includeProgress) {
      packData.progress = {
        completedPrompts: [],
        lastAccessDate: new Date().toISOString()
      };
    }

    return packData;
  }

  /**
   * Create export metadata
   */
  private createExportMetadata(): ExportMetadata {
    return {
      exportedAt: new Date().toISOString(),
      exportedBy: `${this.PLUGIN_NAME} v${this.CURRENT_VERSION}`,
      version: this.CURRENT_VERSION
    };
  }

  /**
   * Parse JSON data with error handling
   */
  private parseJsonData(jsonData: string): any {
    if (!jsonData || typeof jsonData !== 'string') {
      throw new Error('Invalid JSON data: must be a non-empty string');
    }

    try {
      return JSON.parse(jsonData);
    } catch (error) {
      throw new Error(`Invalid JSON format: ${error.message}`);
    }
  }

  /**
   * Validate export data integrity
   */
  private validateExportData(exportData: ExportedPromptPack): void {
    if (!exportData.version || typeof exportData.version !== 'string') {
      throw new Error('Export data must include a valid version');
    }

    if (!exportData.pack || typeof exportData.pack !== 'object') {
      throw new Error('Export data must include pack data');
    }

    if (!exportData.metadata || typeof exportData.metadata !== 'object') {
      throw new Error('Export data must include metadata');
    }

    // Validate pack structure
    const requiredPackFields = ['id', 'name', 'type', 'prompts', 'settings', 'progress'];
    for (const field of requiredPackFields) {
      if (!(field in exportData.pack)) {
        throw new Error(`Pack data missing required field: ${field}`);
      }
    }

    // Validate metadata structure
    const requiredMetadataFields = ['exportedAt', 'exportedBy', 'version'];
    for (const field of requiredMetadataFields) {
      if (!(field in exportData.metadata)) {
        throw new Error(`Metadata missing required field: ${field}`);
      }
    }
  }

  /**
   * Validate import data format and structure
   */
  private validateImportData(data: any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check top-level structure
    if (!data || typeof data !== 'object') {
      errors.push('Import data must be an object');
      return { isValid: false, errors, warnings };
    }

    // Check version
    if (!data.version || typeof data.version !== 'string') {
      errors.push('Missing or invalid version field');
    } else if (data.version !== this.CURRENT_VERSION) {
      warnings.push(`Version mismatch: expected ${this.CURRENT_VERSION}, got ${data.version}`);
    }

    // Check pack data
    if (!data.pack || typeof data.pack !== 'object') {
      errors.push('Missing or invalid pack data');
      return { isValid: false, errors, warnings };
    }

    // Validate pack structure
    const packValidation = this.validatePackStructure(data.pack);
    errors.push(...packValidation.errors);
    warnings.push(...packValidation.warnings);

    // Check metadata (optional but recommended)
    if (!data.metadata) {
      warnings.push('Missing metadata - import may be from an older version');
    } else if (typeof data.metadata !== 'object') {
      warnings.push('Invalid metadata format');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate pack structure in import data
   */
  private validatePackStructure(packData: any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields
    const requiredFields = ['id', 'name', 'type', 'prompts'];
    for (const field of requiredFields) {
      if (!(field in packData)) {
        errors.push(`Pack missing required field: ${field}`);
      }
    }

    // Validate pack type
    if (packData.type && !['Sequential', 'Random', 'Date'].includes(packData.type)) {
      errors.push(`Invalid pack type: ${packData.type}`);
    }

    // Validate prompts array
    if (packData.prompts) {
      if (!Array.isArray(packData.prompts)) {
        errors.push('Prompts must be an array');
      } else {
        // Validate each prompt
        packData.prompts.forEach((prompt: any, index: number) => {
          const promptValidation = this.validatePromptStructure(prompt, index);
          errors.push(...promptValidation.errors);
          warnings.push(...promptValidation.warnings);
        });
      }
    }

    // Validate settings (optional)
    if (packData.settings && typeof packData.settings !== 'object') {
      warnings.push('Invalid settings format - will use defaults');
    }

    // Validate progress (optional)
    if (packData.progress && typeof packData.progress !== 'object') {
      warnings.push('Invalid progress format - will reset progress');
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate individual prompt structure
   */
  private validatePromptStructure(prompt: any, index: number): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!prompt || typeof prompt !== 'object') {
      errors.push(`Prompt at index ${index} must be an object`);
      return { isValid: false, errors, warnings };
    }

    // Required fields
    if (!prompt.id || typeof prompt.id !== 'string') {
      errors.push(`Prompt at index ${index} missing valid ID`);
    }

    if (!prompt.content || typeof prompt.content !== 'string') {
      errors.push(`Prompt at index ${index} missing valid content`);
    }

    // Validate prompt type
    if (prompt.type && !['link', 'string', 'markdown'].includes(prompt.type)) {
      warnings.push(`Prompt at index ${index} has invalid type: ${prompt.type} - will default to 'string'`);
    }

    // Validate date format if present
    if (prompt.date && typeof prompt.date === 'string') {
      const date = new Date(prompt.date);
      if (isNaN(date.getTime())) {
        warnings.push(`Prompt at index ${index} has invalid date format`);
      }
    }

    // Validate order if present
    if (prompt.order !== undefined && (!Number.isInteger(prompt.order) || prompt.order < 0)) {
      warnings.push(`Prompt at index ${index} has invalid order value`);
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  /**
   * Create prompt pack from import data
   */
  private createPackFromImport(importData: any, options: ImportOptions): PromptPack {
    const packData = { ...importData.pack };

    // Handle ID preservation
    if (!options.preserveIds) {
      // Generate new IDs to avoid conflicts
      delete packData.id;
      if (packData.prompts && Array.isArray(packData.prompts)) {
        packData.prompts.forEach((prompt: any) => {
          delete prompt.id;
        });
      }
    }

    // Handle conflict resolution
    if (options.conflictResolution?.action === 'rename' && options.conflictResolution.newName) {
      packData.name = options.conflictResolution.newName;
    }

    // Reset progress if not preserving it
    if (!options.preserveIds) {
      packData.progress = {
        completedPrompts: [],
        lastAccessDate: new Date().toISOString()
      };
    }

    // Create the pack using the model class
    return PromptPack.fromJSON(packData);
  }

  /**
   * Generate a unique name for conflict resolution
   */
  generateUniqueName(baseName: string, existingNames: string[]): string {
    let counter = 1;
    let newName = `${baseName} (Imported)`;

    while (existingNames.includes(newName)) {
      counter++;
      newName = `${baseName} (Imported ${counter})`;
    }

    return newName;
  }

  /**
   * Check if import data contains progress information
   */
  hasProgressData(jsonData: string): boolean {
    try {
      const parsedData = this.parseJsonData(jsonData);
      return !!(parsedData.pack?.progress?.completedPrompts?.length > 0);
    } catch {
      return false;
    }
  }

  /**
   * Extract pack information without full import
   */
  getPackInfo(jsonData: string): { name: string; type: string; promptCount: number; hasProgress: boolean } | null {
    try {
      const parsedData = this.parseJsonData(jsonData);
      if (!parsedData.pack) return null;

      return {
        name: parsedData.pack.name || 'Unknown',
        type: parsedData.pack.type || 'Unknown',
        promptCount: Array.isArray(parsedData.pack.prompts) ? parsedData.pack.prompts.length : 0,
        hasProgress: this.hasProgressData(jsonData)
      };
    } catch {
      return null;
    }
  }

  /**
   * Check for import conflicts with existing packs
   */
  checkImportConflicts(jsonData: string, existingPacks: PromptPack[]): ImportConflict[] {
    const conflicts: ImportConflict[] = [];

    try {
      const parsedData = this.parseJsonData(jsonData);
      if (!parsedData.pack) return conflicts;

      const importPack = parsedData.pack;

      // Check for name conflicts
      const nameConflict = existingPacks.find(pack => pack.name === importPack.name);
      if (nameConflict) {
        conflicts.push({
          type: 'name',
          conflictingValue: importPack.name,
          existingPack: {
            id: nameConflict.id,
            name: nameConflict.name,
            promptCount: nameConflict.prompts.length
          },
          suggestedResolution: {
            action: 'rename',
            newName: this.generateUniqueName(importPack.name, existingPacks.map(p => p.name))
          }
        });
      }

      // Check for ID conflicts (if preserving IDs)
      const idConflict = existingPacks.find(pack => pack.id === importPack.id);
      if (idConflict && importPack.id) {
        conflicts.push({
          type: 'id',
          conflictingValue: importPack.id,
          existingPack: {
            id: idConflict.id,
            name: idConflict.name,
            promptCount: idConflict.prompts.length
          },
          suggestedResolution: {
            action: 'rename',
            newName: this.generateUniqueName(importPack.name, existingPacks.map(p => p.name))
          }
        });
      }

      return conflicts;
    } catch {
      return conflicts;
    }
  }

  /**
   * Resolve import conflicts automatically
   */
  resolveConflictsAutomatically(jsonData: string, existingPacks: PromptPack[]): ImportOptions {
    const conflicts = this.checkImportConflicts(jsonData, existingPacks);

    if (conflicts.length === 0) {
      return { preserveIds: true };
    }

    // Use the first conflict's suggested resolution
    const primaryConflict = conflicts[0];

    return {
      preserveIds: false, // Generate new IDs to avoid conflicts
      conflictResolution: primaryConflict.suggestedResolution
    };
  }

  /**
   * Import pack with automatic conflict resolution
   */
  async importPackWithConflictResolution(
    jsonData: string,
    existingPacks: PromptPack[],
    userResolution?: ConflictResolution
  ): Promise<{ pack: PromptPack; conflicts: ImportConflict[] }> {
    const conflicts = this.checkImportConflicts(jsonData, existingPacks);

    let importOptions: ImportOptions;

    if (conflicts.length === 0) {
      // No conflicts, preserve IDs
      importOptions = { preserveIds: true };
    } else if (userResolution) {
      // User provided resolution
      importOptions = {
        preserveIds: false,
        conflictResolution: userResolution
      };
    } else {
      // Auto-resolve conflicts
      importOptions = this.resolveConflictsAutomatically(jsonData, existingPacks);
    }

    const pack = await this.importPack(jsonData, importOptions);

    return { pack, conflicts };
  }

  /**
   * Validate import and provide user-friendly feedback
   */
  validateImportWithFeedback(jsonData: string): {
    isValid: boolean;
    canImport: boolean;
    errors: string[];
    warnings: string[];
    suggestions: string[];
  } {
    const validation = this.getValidationResults(jsonData);
    const suggestions: string[] = [];

    // Add helpful suggestions based on errors and warnings
    if (validation.errors.some(e => e.includes('JSON parsing failed'))) {
      suggestions.push('Ensure the file is a valid JSON format exported from Daily Prompts plugin');
    }

    if (validation.errors.some(e => e.includes('Missing or invalid version'))) {
      suggestions.push('This file may be from an older version or different plugin');
    }

    if (validation.warnings.some(w => w.includes('Version mismatch'))) {
      suggestions.push('This pack was exported from a different plugin version but should still import correctly');
    }

    if (validation.warnings.some(w => w.includes('Missing metadata'))) {
      suggestions.push('This appears to be an older export format - import will work but some information may be missing');
    }

    // Determine if import can proceed despite warnings
    const canImport = validation.isValid || (
      validation.errors.length === 0 &&
      validation.warnings.length > 0
    );

    return {
      isValid: validation.isValid,
      canImport,
      errors: validation.errors,
      warnings: validation.warnings,
      suggestions
    };
  }

  // File Operations Methods

  /**
   * Export pack to file with file picker integration
   */
  async exportPackToFile(
    pack: PromptPack,
    options: ExportOptions & FileOperationOptions = {},
    progressCallback?: ProgressCallback
  ): Promise<FileOperationResult> {
    try {
      progressCallback?.(0, 100, 'Preparing export data...');

      // Generate JSON data
      const jsonData = await this.exportPack(pack, options);

      progressCallback?.(30, 100, 'Creating file...');

      // Generate filename if not provided
      const filename = options.filename || this.generateExportFilename(pack);
      const folder = options.folder || 'exports';
      const filePath = normalizePath(`${folder}/${filename}`);

      // Ensure export folder exists
      await this.ensureFolderExists(folder);

      progressCallback?.(60, 100, 'Writing file...');

      // Write file to vault
      const file = await this.vault.create(filePath, jsonData);

      progressCallback?.(100, 100, 'Export complete');

      return {
        success: true,
        filePath: file.path,
        data: { pack, exportSize: jsonData.length }
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to export pack to file: ${error.message}`
      };
    }
  }

  /**
   * Import pack from file with file picker integration
   */
  async importPackFromFile(
    filePath: string,
    existingPacks: PromptPack[],
    options: ImportOptions & FileOperationOptions = {},
    progressCallback?: ProgressCallback
  ): Promise<FileOperationResult> {
    try {
      progressCallback?.(0, 100, 'Reading file...');

      // Read file from vault
      const file = this.vault.getAbstractFileByPath(filePath);
      if (!file || !(file instanceof TFile)) {
        throw new Error('File not found or is not a valid file');
      }

      const jsonData = await this.vault.read(file);

      progressCallback?.(30, 100, 'Validating data...');

      // Validate import data
      const validation = this.validateImportWithFeedback(jsonData);
      if (!validation.canImport) {
        throw new Error(`Invalid import file: ${validation.errors.join(', ')}`);
      }

      progressCallback?.(60, 100, 'Processing import...');

      // Import with conflict resolution
      const result = await this.importPackWithConflictResolution(jsonData, existingPacks);

      progressCallback?.(100, 100, 'Import complete');

      return {
        success: true,
        filePath: file.path,
        data: {
          pack: result.pack,
          conflicts: result.conflicts,
          validation
        }
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to import pack from file: ${error.message}`
      };
    }
  }

  /**
   * Export multiple packs to files (batch export)
   */
  async exportMultiplePacksToFiles(
    packs: PromptPack[],
    options: ExportOptions & FileOperationOptions = {},
    progressCallback?: ProgressCallback
  ): Promise<FileOperationResult[]> {
    const results: FileOperationResult[] = [];
    const total = packs.length;

    try {
      for (let i = 0; i < packs.length; i++) {
        const pack = packs[i];
        const packProgress = (i / total) * 100;

        progressCallback?.(packProgress, 100, `Exporting pack ${i + 1} of ${total}: ${pack.name}`);

        // Export individual pack
        const packOptions = {
          ...options,
          filename: options.filename || this.generateExportFilename(pack)
        };

        const result = await this.exportPackToFile(pack, packOptions);
        results.push(result);

        // If any export fails and we're not continuing on error, stop
        if (!result.success && !options.showProgress) {
          break;
        }
      }

      progressCallback?.(100, 100, `Exported ${results.filter(r => r.success).length} of ${total} packs`);

      return results;
    } catch (error) {
      // Add error result for any remaining packs
      while (results.length < total) {
        results.push({
          success: false,
          error: `Batch export failed: ${error.message}`
        });
      }
      return results;
    }
  }

  /**
   * Export all packs as single batch file
   */
  async exportBatchToFile(
    packs: PromptPack[],
    options: ExportOptions & FileOperationOptions = {},
    progressCallback?: ProgressCallback
  ): Promise<FileOperationResult> {
    try {
      progressCallback?.(0, 100, 'Preparing batch export...');

      // Generate batch JSON data
      const jsonData = await this.exportMultiplePacks(packs, options);

      progressCallback?.(50, 100, 'Creating batch file...');

      // Generate filename for batch
      const filename = options.filename || this.generateBatchExportFilename(packs.length);
      const folder = options.folder || 'exports';
      const filePath = normalizePath(`${folder}/${filename}`);

      // Ensure export folder exists
      await this.ensureFolderExists(folder);

      progressCallback?.(80, 100, 'Writing batch file...');

      // Write batch file to vault
      const file = await this.vault.create(filePath, jsonData);

      progressCallback?.(100, 100, 'Batch export complete');

      return {
        success: true,
        filePath: file.path,
        data: {
          packCount: packs.length,
          exportSize: jsonData.length,
          packs: packs.map(p => ({ id: p.id, name: p.name }))
        }
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to export batch to file: ${error.message}`
      };
    }
  }

  /**
   * Import multiple packs from batch file
   */
  async importBatchFromFile(
    filePath: string,
    existingPacks: PromptPack[],
    options: ImportOptions & FileOperationOptions = {},
    progressCallback?: ProgressCallback
  ): Promise<FileOperationResult> {
    try {
      progressCallback?.(0, 100, 'Reading batch file...');

      // Read file from vault
      const file = this.vault.getAbstractFileByPath(filePath);
      if (!file || !(file instanceof TFile)) {
        throw new Error('File not found or is not a valid file');
      }

      const jsonData = await this.vault.read(file);

      progressCallback?.(20, 100, 'Processing batch data...');

      // Import multiple packs
      const importedPacks = await this.importMultiplePacks(jsonData, options);
      const conflicts: ImportConflict[] = [];

      // Check conflicts for each pack
      for (let i = 0; i < importedPacks.length; i++) {
        const pack = importedPacks[i];
        const packProgress = 20 + ((i / importedPacks.length) * 60);

        progressCallback?.(packProgress, 100, `Processing pack ${i + 1} of ${importedPacks.length}: ${pack.name}`);

        // Note: In a real implementation, you'd want to check conflicts before importing
        // This is simplified for the example
      }

      progressCallback?.(100, 100, `Imported ${importedPacks.length} packs from batch`);

      return {
        success: true,
        filePath: file.path,
        data: {
          packs: importedPacks,
          conflicts,
          packCount: importedPacks.length
        }
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to import batch from file: ${error.message}`
      };
    }
  }

  /**
   * List available export files in the vault
   */
  async listExportFiles(folder: string = 'exports'): Promise<TFile[]> {
    try {
      const exportFolder = this.vault.getAbstractFileByPath(folder);
      if (!exportFolder || !(exportFolder instanceof TFolder)) {
        return [];
      }

      const files: TFile[] = [];

      // Recursively find JSON files
      const findJsonFiles = (folder: TFolder) => {
        for (const child of folder.children) {
          if (child instanceof TFile && child.extension === 'json') {
            files.push(child);
          } else if (child instanceof TFolder) {
            findJsonFiles(child);
          }
        }
      };

      findJsonFiles(exportFolder);
      return files.sort((a, b) => b.stat.mtime - a.stat.mtime); // Sort by modification time, newest first
    } catch (error) {
      console.error('Failed to list export files:', error);
      return [];
    }
  }

  /**
   * Delete export file
   */
  async deleteExportFile(filePath: string): Promise<FileOperationResult> {
    try {
      const file = this.vault.getAbstractFileByPath(filePath);
      if (!file || !(file instanceof TFile)) {
        throw new Error('File not found or is not a valid file');
      }

      await this.vault.delete(file);

      return {
        success: true,
        filePath: filePath
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to delete export file: ${error.message}`
      };
    }
  }

  /**
   * Get file information for import preview
   */
  async getImportFileInfo(filePath: string): Promise<{
    isValid: boolean;
    packInfo?: { name: string; type: string; promptCount: number; hasProgress: boolean };
    isBatch?: boolean;
    batchInfo?: { packCount: number; packs: Array<{ name: string; type: string }> };
    validation?: ReturnType<typeof this.validateImportWithFeedback>;
    error?: string;
  }> {
    try {
      const file = this.vault.getAbstractFileByPath(filePath);
      if (!file || !(file instanceof TFile)) {
        return { isValid: false, error: 'File not found or is not a valid file' };
      }

      const jsonData = await this.vault.read(file);
      const parsedData = this.parseJsonData(jsonData);

      // Check if it's a batch file
      if (parsedData.type === 'batch' && Array.isArray(parsedData.packs)) {
        const batchInfo = {
          packCount: parsedData.packs.length,
          packs: parsedData.packs.map((packData: any) => ({
            name: packData.pack?.name || 'Unknown',
            type: packData.pack?.type || 'Unknown'
          }))
        };

        return {
          isValid: true,
          isBatch: true,
          batchInfo
        };
      } else {
        // Single pack file
        const packInfo = this.getPackInfo(jsonData);
        const validation = this.validateImportWithFeedback(jsonData);

        return {
          isValid: validation.canImport,
          packInfo: packInfo || undefined,
          isBatch: false,
          validation
        };
      }
    } catch (error) {
      return {
        isValid: false,
        error: `Failed to read import file: ${error.message}`
      };
    }
  }

  // Helper Methods

  /**
   * Generate export filename for a pack
   */
  private generateExportFilename(pack: PromptPack): string {
    const sanitizedName = pack.name.replace(/[^a-zA-Z0-9\-_]/g, '_');
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return `${sanitizedName}_${timestamp}.json`;
  }

  /**
   * Generate batch export filename
   */
  private generateBatchExportFilename(packCount: number): string {
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return `prompt_packs_batch_${packCount}_${timestamp}.json`;
  }

  /**
   * Ensure folder exists in vault
   */
  private async ensureFolderExists(folderPath: string): Promise<void> {
    const normalizedPath = normalizePath(folderPath);

    if (!this.vault.getAbstractFileByPath(normalizedPath)) {
      await this.vault.createFolder(normalizedPath);
    }
  }

  /**
   * Get file size in human readable format
   */
  getFileSize(bytes: number): string {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Validate file extension for import
   */
  isValidImportFile(filePath: string): boolean {
    return filePath.toLowerCase().endsWith('.json');
  }
}