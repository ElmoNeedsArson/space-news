import { requestUrl } from 'obsidian';

const LL2_BASE = 'https://ll.thespacedevs.com/2.3.0';
const CACHE_TTL_MS = 20 * 60 * 1000;
const MAX_CACHE_BYTES = 5 * 1024 * 1024;

export interface LaunchStatus {
	id: number;
	name: string;
	abbrev: string;
}

export interface LaunchProvider {
	id: number;
	name: string;
	abbrev: string;
}

export interface RocketConfiguration {
	id: number;
	name: string;
	full_name: string;
}

export interface Rocket {
	id: number;
	configuration: RocketConfiguration;
}

export interface Orbit {
	id: number;
	name: string;
	abbrev: string;
}

export interface Mission {
	id: number;
	name: string;
	description: string;
	type: string;
	orbit: Orbit | null;
}

export interface Country {
	id: number;
	name: string;
	alpha_2_code: string;
}

export interface PadLocation {
	id: number;
	name: string;
	country: Country | null;
}

export interface Pad {
	id: number;
	name: string;
	location: PadLocation;
}

export interface Launch {
	id: string;
	slug: string;
	name: string;
	net: string;
	status: LaunchStatus;
	launch_service_provider: LaunchProvider;
	rocket: Rocket;
	mission: Mission | null;
	pad: Pad;
	image: { image_url: string | null } | null;
	webcast_live: boolean;
}

export interface EventType {
	id: number;
	name: string;
}

export interface SpaceEvent {
	id: number;
	slug: string;
	name: string;
	date: string;
	type: EventType;
	description: string;
	location: string;
	image: { image_url: string | null } | null;
}

interface LL2Response {
	count: number;
	results: Launch[];
}

interface LL2EventResponse {
	count: number;
	results: SpaceEvent[];
}

interface LaunchCacheEntry {
	fetchedAt: number;
	launches: Launch[];
}

interface EventCacheEntry {
	fetchedAt: number;
	events: SpaceEvent[];
}

export interface SerializableCache {
	launches: LaunchCacheEntry | null;
	events: EventCacheEntry | null;
}

export class LL2Client {
	private launchCache: LaunchCacheEntry | null = null;
	private eventCache: EventCacheEntry | null = null;

	setCache(cache: SerializableCache | null) {
		this.launchCache = cache?.launches
			? {
				fetchedAt: cache.launches.fetchedAt,
				launches: cache.launches.launches.map(compactLaunch),
			}
			: null;
		this.eventCache = cache?.events
			? {
				fetchedAt: cache.events.fetchedAt,
				events: cache.events.events.map(compactEvent),
			}
			: null;
	}

	getSerializableCache(): SerializableCache {
		const cache = { launches: this.launchCache, events: this.eventCache };
		return cacheSize(cache) <= MAX_CACHE_BYTES ? cache : { launches: null, events: null };
	}

	private isCacheValid(entry: { fetchedAt: number } | null): boolean {
		if (!entry) return false;
		return Date.now() - entry.fetchedAt < CACHE_TTL_MS;
	}

	async fetchUpcoming(): Promise<Launch[]> {
		if (this.isCacheValid(this.launchCache) && this.launchCache) {
			return this.launchCache.launches;
		}

		const response = await requestUrl({
			url: `${LL2_BASE}/launches/upcoming/?limit=50&ordering=net`,
			method: 'GET',
			headers: { 'Accept': 'application/json' },
			throw: false,
		});

		if (response.status < 200 || response.status >= 300) {
			throw new Error(`LL2 API returned status ${response.status}`);
		}

		const data = response.json as LL2Response;
		const launches = data.results.map(compactLaunch);
		this.launchCache = { fetchedAt: Date.now(), launches };
		return launches;
	}

	async fetchEvents(): Promise<SpaceEvent[]> {
		if (this.isCacheValid(this.eventCache) && this.eventCache) {
			return this.eventCache.events;
		}

		const response = await requestUrl({
			url: `${LL2_BASE}/events/upcoming/?limit=50&ordering=date`,
			method: 'GET',
			headers: { 'Accept': 'application/json' },
			throw: false,
		});

		if (response.status < 200 || response.status >= 300) {
			throw new Error(`LL2 API returned status ${response.status}`);
		}

		const data = response.json as LL2EventResponse;
		const events = data.results.map(compactEvent);
		this.eventCache = { fetchedAt: Date.now(), events };
		return events;
	}

	clearCache() {
		this.launchCache = null;
		this.eventCache = null;
	}
}

function compactLaunch(launch: Launch): Launch {
	return {
		id: launch.id,
		slug: launch.slug,
		name: launch.name,
		net: launch.net,
		status: {
			id: launch.status?.id ?? 0,
			name: launch.status?.name ?? '',
			abbrev: launch.status?.abbrev ?? '',
		},
		launch_service_provider: {
			id: launch.launch_service_provider?.id ?? 0,
			name: launch.launch_service_provider?.name ?? '',
			abbrev: launch.launch_service_provider?.abbrev ?? '',
		},
		rocket: {
			id: launch.rocket?.id ?? 0,
			configuration: {
				id: launch.rocket?.configuration?.id ?? 0,
				name: launch.rocket?.configuration?.name ?? '',
				full_name: launch.rocket?.configuration?.full_name ?? '',
			},
		},
		mission: launch.mission
			? {
				id: launch.mission.id,
				name: launch.mission.name,
				description: '',
				type: launch.mission.type,
				orbit: launch.mission.orbit,
			}
			: null,
		pad: {
			id: launch.pad?.id ?? 0,
			name: launch.pad?.name ?? '',
			location: {
				id: launch.pad?.location?.id ?? 0,
				name: launch.pad?.location?.name ?? '',
				country: launch.pad?.location?.country
					? {
						id: launch.pad.location.country.id,
						name: launch.pad.location.country.name,
						alpha_2_code: launch.pad.location.country.alpha_2_code,
					}
					: null,
			},
		},
		image: launch.image ? { image_url: launch.image.image_url } : null,
		webcast_live: launch.webcast_live,
	};
}

function compactEvent(event: SpaceEvent): SpaceEvent {
	return {
		id: event.id,
		slug: event.slug,
		name: event.name,
		date: event.date,
		type: {
			id: event.type?.id ?? 0,
			name: event.type?.name ?? '',
		},
		description: '',
		location: event.location,
		image: event.image ? { image_url: event.image.image_url } : null,
	};
}

function cacheSize(cache: SerializableCache): number {
	return new TextEncoder().encode(JSON.stringify(cache)).byteLength;
}
