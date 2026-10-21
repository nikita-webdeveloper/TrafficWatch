import { createFileRoute } from '@tanstack/react-router';
import { LocationsPage } from '@/components/traffic/TrafficPages';
export const Route = createFileRoute('/locations')({
 head: () => ({ meta: [{ title: 'My Locations | TrafficWatch' }, { name: 'description', content: 'Save and manage your favourite traffic locations in this browser.' }, { property: 'og:title', content: 'My Locations | TrafficWatch' }, { property: 'og:description', content: 'Save and manage your favourite traffic locations in this browser.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' }] }),
 component: LocationsPage,
});
