import { ItemView, WorkspaceLeaf, setIcon } from 'obsidian';
import type { LL2Client, Launch, SpaceEvent } from './api';
import type { SpaceLaunchesSettings } from './settings';
import { PROVIDERS, LOCATIONS, EVENT_TYPES, applyFilters, applyEventFilters } from './filters';

interface PluginContext {
	client: LL2Client;
	settings: SpaceLaunchesSettings;
	saveSettings(): Promise<void>;
}

export const VIEW_TYPE_SPACE_LAUNCHES = 'space-launches-view';
const POST_LAUNCH_VISIBILITY_MS = 10 * 60 * 1000;

function formatCountdown(netMs: number): string {
	const diff = netMs - Date.now();
	if (diff <= 0) return 'Launched';
	const totalSecs = Math.floor(diff / 1000);
	const d = Math.floor(totalSecs / 86400);
	const h = Math.floor((totalSecs % 86400) / 3600);
	const m = Math.floor((totalSecs % 3600) / 60);
	const s = totalSecs % 60;
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${pad(d)}d ${pad(h)}h ${pad(m)}m ${pad(s)}s`;
}

function formatEventDate(dateStr: string): string {
	const d = new Date(dateStr);
	return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function countWithinHours(launches: Launch[], hours: number): number {
	const now = Date.now();
	const cutoff = Date.now() + hours * 3600_000;
	return launches.filter((l) => {
		const net = new Date(l.net).getTime();
		return net > now && net <= cutoff;
	}).length;
}

function daysToNextCrewedMission(launches: Launch[]): string {
	const now = Date.now();
	const crewed = launches.find((l) =>
		new Date(l.net).getTime() > now && l.mission?.type?.toLowerCase().includes('human'),
	);
	if (!crewed) return '--';
	const days = Math.ceil((new Date(crewed.net).getTime() - now) / 86_400_000);
	return days <= 0 ? 'Today' : `${days}d`;
}

function isWithinLaunchDisplayWindow(launch: Launch): boolean {
	const net = new Date(launch.net).getTime();
	return Number.isFinite(net) && Date.now() - net <= POST_LAUNCH_VISIBILITY_MS;
}

export class SpaceLaunchesView extends ItemView {
	private plugin: PluginContext;
	private allLaunches: Launch[] = [];
	private filtered: Launch[] = [];
	private allEvents: SpaceEvent[] = [];
	private filteredEvents: SpaceEvent[] = [];
	private countdownInterval: number | null = null;
	private filterVisible = false;

	private contentEl2!: HTMLElement;
	private filterPanel!: HTMLElement;
	private featuredCard!: HTMLElement;
	private smallRow!: HTMLElement;
	private statsRow!: HTMLElement;
	private eventsSection!: HTMLElement;
	private eventsRow!: HTMLElement;
	private statusEl!: HTMLElement;
	private countdownEls: HTMLElement[] = [];

	constructor(leaf: WorkspaceLeaf, plugin: PluginContext) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType() {
		return VIEW_TYPE_SPACE_LAUNCHES;
	}

	getDisplayText() {
		return 'Space launches';
	}

	getIcon() {
		return 'rocket';
	}

	async onOpen() {
		this.buildLayout();
		await this.refresh();
		this.countdownInterval = window.setInterval(() => {
			this.tickCountdowns();
		}, 1000);
	}

	async onClose() {
		if (this.countdownInterval !== null) {
			window.clearInterval(this.countdownInterval);
			this.countdownInterval = null;
		}
	}

	async refresh() {
		this.setStatus('Loading...');
		try {
			[this.allLaunches, this.allEvents] = await Promise.all([
				this.plugin.client.fetchUpcoming(),
				this.plugin.client.fetchEvents(),
			]);
			void this.plugin.saveSettings();
			this.applyAndRender();
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			this.setStatus(`Failed to load launches: ${msg}`);
		}
	}

	private applyAndRender() {
		this.filtered = applyFilters(
			this.allLaunches,
			this.plugin.settings.enabledProviders,
			this.plugin.settings.enabledLocations,
		).filter(isWithinLaunchDisplayWindow);
		this.filteredEvents = applyEventFilters(
			this.allEvents,
			this.plugin.settings.enabledEventTypes,
		);
		this.render();
	}

	private buildLayout() {
		const root = this.containerEl.children[1] as HTMLElement;
		root.empty();
		root.addClass('space-launches-root');

		const header = root.createEl('div', { cls: 'sl-header' });
		header.createEl('span', { cls: 'sl-header-title', text: 'Space launches' });
		const filterBtn = header.createEl('button', { cls: 'sl-filter-btn' });
		setIcon(filterBtn, 'sliders-horizontal');
		filterBtn.addEventListener('click', () => this.toggleFilterPanel());

		this.filterPanel = root.createEl('div', { cls: 'sl-filter-panel sl-hidden' });
		this.buildFilterPanel();

		this.statusEl = root.createEl('div', { cls: 'sl-status sl-hidden' });

		this.contentEl2 = root.createEl('div', { cls: 'sl-content' });
		this.featuredCard = this.contentEl2.createEl('div', { cls: 'sl-card sl-card-featured' });
		this.smallRow = this.contentEl2.createEl('div', { cls: 'sl-small-row' });
		this.statsRow = this.contentEl2.createEl('div', { cls: 'sl-stats-row' });

		this.eventsSection = this.contentEl2.createEl('div', { cls: 'sl-events-section' });
		this.eventsSection.createEl('p', { cls: 'sl-events-heading', text: 'Upcoming events' });
		this.eventsRow = this.eventsSection.createEl('div', { cls: 'sl-events-row' });
	}

	private buildFilterPanel() {
		this.filterPanel.empty();

		const makeSection = (
			title: string,
			items: string[],
			enabledKey: 'enabledProviders' | 'enabledLocations' | 'enabledEventTypes',
		) => {
			const section = this.filterPanel.createEl('div', { cls: 'sl-filter-section' });
			section.createEl('p', { cls: 'sl-filter-heading', text: title });
			const grid = section.createEl('div', { cls: 'sl-filter-grid' });

			for (const item of items) {
				const label = grid.createEl('label', { cls: 'sl-filter-label' });
				const cb = label.createEl('input');
				cb.type = 'checkbox';
				cb.checked = this.plugin.settings[enabledKey].includes(item);
				label.createSpan({ text: item });

				cb.addEventListener('change', () => {
					const list = this.plugin.settings[enabledKey];
					if (cb.checked) {
						if (!list.includes(item)) list.push(item);
					} else {
						const idx = list.indexOf(item);
						if (idx !== -1) list.splice(idx, 1);
					}
					void this.plugin.saveSettings();
					this.applyAndRender();
				});
			}
		};

		makeSection('Launch service providers', PROVIDERS, 'enabledProviders');
		makeSection('Launch locations', LOCATIONS, 'enabledLocations');
		makeSection('Event types', EVENT_TYPES, 'enabledEventTypes');
	}

	private toggleFilterPanel() {
		this.filterVisible = !this.filterVisible;
		if (this.filterVisible) {
			this.buildFilterPanel();
			this.filterPanel.removeClass('sl-hidden');
		} else {
			this.filterPanel.addClass('sl-hidden');
		}
	}

	private render() {
		this.statusEl.addClass('sl-hidden');
		this.contentEl2.removeClass('sl-hidden');
		this.countdownEls = [];

		if (this.plugin.settings.showLaunches) {
			this.featuredCard.removeClass('sl-hidden');
			this.smallRow.removeClass('sl-hidden');
			this.statsRow.removeClass('sl-hidden');

			if (this.filtered.length === 0) {
				this.setStatus('No upcoming launches match your filters.');
				this.contentEl2.addClass('sl-hidden');
				return;
			}

			const featured = this.filtered[0];
			if (!featured) return;
			this.renderFeatured(featured);
			this.renderSmallCards(this.filtered.slice(1, 4));
			this.renderStats();
		} else {
			this.featuredCard.addClass('sl-hidden');
			this.smallRow.addClass('sl-hidden');
			this.statsRow.addClass('sl-hidden');
		}

		if (this.plugin.settings.showEvents) {
			this.renderEvents();
		} else {
			this.eventsSection.addClass('sl-hidden');
		}
	}

	private renderFeatured(launch: Launch) {
		const el = this.featuredCard;
		el.empty();

		const imageUrl = launch.image?.image_url;
		if (imageUrl) {
			const img = el.createEl('img', { cls: 'sl-card-image' });
			img.src = imageUrl;
			img.alt = '';
		}

		const info = el.createEl('div', { cls: 'sl-card-info' });
		info.createEl('div', { cls: 'sl-card-name', text: launch.name });

		const meta = info.createEl('div', { cls: 'sl-card-meta' });
		meta.createEl('span', {
			text: launch.launch_service_provider?.name ?? launch.launch_service_provider?.abbrev ?? 'Unknown',
		});
		meta.createEl('span', { cls: 'sl-meta-sep', text: ' · ' });
		meta.createEl('span', { text: launch.pad?.name ?? '' });

		const statusBadge = info.createEl('span', {
			cls: 'sl-status-badge',
			text: launch.status?.name ?? '',
		});
		if (launch.status?.abbrev === 'Go') statusBadge.addClass('sl-badge-go');

		const countdown = info.createEl('div', { cls: 'sl-countdown' });
		countdown.dataset['net'] = launch.net;
		countdown.textContent = formatCountdown(new Date(launch.net).getTime());
		this.countdownEls.push(countdown);

		el.addEventListener('click', () => {
			window.open(`https://spacelaunchnow.me/launch/${launch.slug}/`, '_blank');
		});
	}

	private renderSmallCards(launches: Launch[]) {
		const row = this.smallRow;
		row.empty();

		for (const launch of launches) {
			const card = row.createEl('div', { cls: 'sl-card sl-card-small' });

			const imageUrl = launch.image?.image_url;
			if (imageUrl) {
				const img = card.createEl('img', { cls: 'sl-card-image-small' });
				img.src = imageUrl;
				img.alt = '';
			}

			const info = card.createEl('div', { cls: 'sl-card-info-small' });
			info.createEl('div', { cls: 'sl-card-name-small', text: launch.name });
			info.createEl('div', {
				cls: 'sl-card-provider-small',
				text: launch.launch_service_provider?.name ?? launch.launch_service_provider?.abbrev ?? '',
			});

			const countdown = info.createEl('div', { cls: 'sl-countdown-small' });
			countdown.dataset['net'] = launch.net;
			countdown.textContent = formatCountdown(new Date(launch.net).getTime());
			this.countdownEls.push(countdown);

			card.addEventListener('click', () => {
				window.open(`https://spacelaunchnow.me/launch/${launch.slug}/`, '_blank');
			});
		}
	}

	private renderStats() {
		const row = this.statsRow;
		row.empty();

		const stats: [string, string][] = [
			['Next 24h', String(countWithinHours(this.filtered, 24))],
			['Next 7 days', String(countWithinHours(this.filtered, 168))],
			['Next 30 days', String(countWithinHours(this.filtered, 720))],
			['Next crewed', daysToNextCrewedMission(this.filtered)],
		];

		for (const [label, value] of stats) {
			const item = row.createEl('div', { cls: 'sl-stat' });
			item.createEl('div', { cls: 'sl-stat-count', text: value });
			item.createEl('div', { cls: 'sl-stat-label', text: label });
		}
	}

	private renderEvents() {
		const row = this.eventsRow;
		row.empty();

		if (this.filteredEvents.length === 0) {
			this.eventsSection.addClass('sl-hidden');
			return;
		}

		this.eventsSection.removeClass('sl-hidden');

		for (const event of this.filteredEvents) {
			const card = row.createEl('div', { cls: 'sl-event-card' });

			const imageUrl = event.image?.image_url;
			if (imageUrl) {
				const img = card.createEl('img', { cls: 'sl-event-image' });
				img.src = imageUrl;
				img.alt = '';
			} else {
				const placeholder = card.createEl('div', { cls: 'sl-event-image sl-event-image-placeholder' });
				setIcon(placeholder, 'star');
			}

			const info = card.createEl('div', { cls: 'sl-event-info' });
			info.createEl('div', { cls: 'sl-event-name', text: event.name });
			info.createEl('div', { cls: 'sl-event-type', text: event.type?.name ?? '' });
			info.createEl('div', { cls: 'sl-event-date', text: formatEventDate(event.date) });

			card.addEventListener('click', () => {
				window.open(`https://spacelaunchnow.me/event/${event.slug}/`, '_blank');
			});
		}
	}

	private tickCountdowns() {
		let shouldRender = false;

		for (const el of this.countdownEls) {
			const net = el.dataset['net'];
			if (!net) continue;

			const netMs = new Date(net).getTime();
			if (Date.now() - netMs > POST_LAUNCH_VISIBILITY_MS) {
				shouldRender = true;
				continue;
			}

			el.textContent = formatCountdown(netMs);
		}

		if (shouldRender) {
			this.applyAndRender();
		}
	}

	private setStatus(msg: string) {
		this.statusEl.textContent = msg;
		this.statusEl.removeClass('sl-hidden');
		this.contentEl2?.addClass('sl-hidden');
	}
}
