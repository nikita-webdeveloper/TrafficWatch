import { createFileRoute } from '@tanstack/react-router';
import { LiveTrafficPage } from '@/components/traffic/TrafficPages';
export const Route = createFileRoute('/live-traffic')({
 head: () => ({ meta: [{ title: 'Live Traffic | TrafficWatch' }, { name: 'description', content: 'Explore live traffic speeds and congestion on an interactive road map.' }, { property: 'og:title', content: 'Live Traffic | TrafficWatch' }, { property: 'og:description', content: 'Explore live traffic speeds and congestion on an interactive road map.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' }] }),
 component: LiveTrafficPage,
});
