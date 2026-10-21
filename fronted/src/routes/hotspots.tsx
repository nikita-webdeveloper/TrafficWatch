import { createFileRoute } from '@tanstack/react-router';
import { HotspotsPage } from '@/components/traffic/TrafficPages';
export const Route = createFileRoute('/hotspots')({
 head: () => ({ meta: [{ title: 'Congestion Hotspots | TrafficWatch' }, { name: 'description', content: 'Explore road segments ranked by observed congestion from real traffic readings.' }, { property: 'og:title', content: 'Congestion Hotspots | TrafficWatch' }, { property: 'og:description', content: 'Explore road segments ranked by observed congestion from real traffic readings.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' }] }),
 component: HotspotsPage,
});
