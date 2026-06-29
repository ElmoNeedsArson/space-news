import { Notice, Plugin } from 'obsidian';
import { SpaceLaunchesSettings, DEFAULT_SETTINGS, SpaceLaunchesSettingTab } from './settings';
import { LL2Client } from './api';
import { SpaceLaunchesView, VIEW_TYPE_SPACE_LAUNCHES } from './view';
import { applyFilters } from './filters';

export default class SpaceLaunches extends Plugin {
	settings!: SpaceLaunchesSettings;
	client!: LL2Client;
	private notifiedIds = new Set<string>();

	async onload() {
		await this.loadSettings();

		this.client = new LL2Client();

		const saved = (await this.loadData()) as { cache?: unknown } | null;
		if (saved?.cache) {
			this.client.setCache(saved.cache as Parameters<LL2Client['setCache']>[0]);
		}

		this.registerView(
			VIEW_TYPE_SPACE_LAUNCHES,
			(leaf) => new SpaceLaunchesView(leaf, this),
		);

		this.addRibbonIcon('rocket', 'Space launches', () => {
			void this.activateView();
		});

		this.addCommand({
			id: 'open-panel',
			name: 'Open panel',
			callback: () => {
				void this.activateView();
			},
		});

		this.addCommand({
			id: 'refresh-data',
			name: 'Refresh launch data',
			callback: () => {
				this.client.clearCache();
				void this.getView()?.refresh();
			},
		});

		this.addSettingTab(new SpaceLaunchesSettingTab(this.app, this));

		this.registerInterval(
			window.setInterval(() => {
				void this.checkNotifications();
			}, 60_000),
		);
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<SpaceLaunchesSettings>,
		);
	}

	async saveSettings() {
		const cache = this.client?.getSerializableCache();
		await this.saveData({ ...this.settings, cache });
	}

	async activateView() {
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(VIEW_TYPE_SPACE_LAUNCHES)[0];
		if (!leaf) {
			leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf(true);
			await leaf.setViewState({ type: VIEW_TYPE_SPACE_LAUNCHES, active: true });
		}
		void workspace.revealLeaf(leaf);
	}

	private getView(): SpaceLaunchesView | null {
		const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_SPACE_LAUNCHES)[0];
		return leaf ? (leaf.view as SpaceLaunchesView) : null;
	}

	private async checkNotifications() {
		if (!this.settings.notificationsEnabled) return;

		let launches;
		try {
			launches = await this.client.fetchUpcoming();
		} catch {
			return;
		}

		const filtered = applyFilters(
			launches,
			this.settings.enabledProviders,
			this.settings.enabledLocations,
		);

		const now = Date.now();
		for (const launch of filtered) {
			if (this.notifiedIds.has(launch.id)) continue;
			const net = new Date(launch.net).getTime();
			const minsUntil = (net - now) / 60_000;
			if (minsUntil >= 14 && minsUntil < 15) {
				new Notice(`Launching in 15 min: ${launch.name}`, 10_000);
				this.notifiedIds.add(launch.id);
			}
		}
	}
}
