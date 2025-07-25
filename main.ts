import { Plugin } from 'obsidian';
import { PluginSettings, GlobalSettings } from './src/types';

const DEFAULT_SETTINGS: PluginSettings = {
  promptPacks: [],
  globalSettings: {
    defaultNotificationTime: '09:00',
    defaultZenMode: false,
    dailyNoteFolder: '',
    dailyNoteTemplate: '',
    linkHandling: 'direct'
  }
};

export default class DailyPromptsPlugin extends Plugin {
  settings: PluginSettings;

  async onload() {
    await this.loadSettings();

    // Plugin initialization will be implemented in later tasks
    console.log('Daily Prompts plugin loaded');
  }

  onunload() {
    // Cleanup will be implemented in later tasks
    console.log('Daily Prompts plugin unloaded');
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}