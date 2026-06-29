import type { Launch, SpaceEvent } from './api';

export const PROVIDERS: string[] = [
	'SpaceX',
	'NASA',
	'Blue Origin',
	'Rocket Lab',
	'Virgin Galactic',
	'Northrop Grumman',
	'United Launch Alliance',
	'Arianespace',
	'Russian Space Agencies',
	'Chinese Space Agencies',
	'Indian Space Research Organisation',
];

export const LOCATIONS: string[] = [
	'California',
	'Florida',
	'Texas',
	'Misc. USA',
	'Russia & Kazakhstan',
	'French Guiana',
	'New Zealand',
	'Japan',
	'India',
	'China',
	'Misc. (Sea, Air, etc.)',
];

export const EVENT_TYPES: string[] = [
	'EVA',
	'Celestial Event',
	'Flyby',
	'Press Event',
	'Docking',
	'Landing',
	'Milestone',
];

export const DEFAULT_EVENT_TYPES: string[] = ['EVA', 'Celestial Event'];

const LOCATION_KEYWORDS: Record<string, string[]> = {
	'California': ['california', 'vandenberg', 'mojave', 'santa barbara'],
	'Florida': ['florida', 'kennedy', 'cape canaveral', 'ksc'],
	'Texas': ['texas', 'boca chica', 'starbase'],
	'Misc. USA': ['usa', 'united states', 'wallops', 'kodiak'],
	'Russia & Kazakhstan': ['russia', 'kazakhstan', 'baikonur', 'plesetsk', 'vostochny'],
	'French Guiana': ['guiana', 'kourou'],
	'New Zealand': ['new zealand', 'mahia'],
	'Japan': ['japan', 'tanegashima', 'uchinoura'],
	'India': ['india', 'satish dhawan', 'sriharikota'],
	'China': ['china', 'jiuquan', 'xichang', 'wenchang', 'taiyuan'],
	'Misc. (Sea, Air, etc.)': ['sea launch', 'ocean', 'air launch', 'stratolaunch'],
};

export function matchesProvider(launch: Launch, enabled: string[]): boolean {
	const name = launch.launch_service_provider?.name ?? '';
	const abbrev = launch.launch_service_provider?.abbrev ?? '';
	const isKnown = PROVIDERS.some(
		(p) => name.toLowerCase().includes(p.toLowerCase()) || abbrev.toLowerCase().includes(p.toLowerCase()),
	);
	if (!isKnown) return true;
	return enabled.some(
		(p) => name.toLowerCase().includes(p.toLowerCase()) || abbrev.toLowerCase().includes(p.toLowerCase()),
	);
}

export function matchesLocation(launch: Launch, enabled: string[]): boolean {
	const locationName = (launch.pad?.location?.name ?? '').toLowerCase();
	const countryName = (launch.pad?.location?.country?.name ?? '').toLowerCase();
	const haystack = `${locationName} ${countryName}`;

	const isKnown = Object.values(LOCATION_KEYWORDS).some((kws) =>
		kws.some((kw) => haystack.includes(kw)),
	);
	if (!isKnown) return true;

	return enabled.some((loc) => {
		const keywords = LOCATION_KEYWORDS[loc];
		if (!keywords) return false;
		return keywords.some((kw) => haystack.includes(kw));
	});
}

export function matchesEventType(event: SpaceEvent, enabled: string[]): boolean {
	return enabled.some((t) => t.toLowerCase() === event.type?.name?.toLowerCase());
}

export function applyFilters(
	launches: Launch[],
	enabledProviders: string[],
	enabledLocations: string[],
): Launch[] {
	return launches.filter(
		(l) => matchesProvider(l, enabledProviders) && matchesLocation(l, enabledLocations),
	);
}

export function applyEventFilters(
	events: SpaceEvent[],
	enabledTypes: string[],
): SpaceEvent[] {
	return events.filter((e) => matchesEventType(e, enabledTypes));
}
