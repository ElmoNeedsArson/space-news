import { App, PluginSettingTab, Setting } from 'obsidian';
import type SpaceLaunches from './main';
import { PROVIDERS, LOCATIONS, DEFAULT_EVENT_TYPES } from './filters';

export interface SpaceLaunchesSettings {
	notificationsEnabled: boolean;
	showLaunches: boolean;
	showEvents: boolean;
	enabledProviders: string[];
	enabledLocations: string[];
	enabledEventTypes: string[];
}

export const DEFAULT_SETTINGS: SpaceLaunchesSettings = {
	notificationsEnabled: true,
	showLaunches: true,
	showEvents: true,
	enabledProviders: [...PROVIDERS],
	enabledLocations: [...LOCATIONS],
	enabledEventTypes: [...DEFAULT_EVENT_TYPES],
};

export class SpaceLaunchesSettingTab extends PluginSettingTab {
	plugin: SpaceLaunches;

	constructor(app: App, plugin: SpaceLaunches) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Launch notifications')
			.setDesc('Show a notice 15 minutes before any tracked launch.')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.notificationsEnabled)
					.onChange(async (value) => {
						this.plugin.settings.notificationsEnabled = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Show upcoming launches')
			.setDesc('Display launch cards and stats in the sidebar.')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showLaunches)
					.onChange(async (value) => {
						this.plugin.settings.showLaunches = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Show upcoming events')
			.setDesc('Display the events strip at the bottom of the sidebar.')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showEvents)
					.onChange(async (value) => {
						this.plugin.settings.showEvents = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
