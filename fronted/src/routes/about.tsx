import { createFileRoute } from '@tanstack/react-router';
import { AboutPage } from '@/components/traffic/TrafficPages';
export const Route = createFileRoute('/about')({
 head: () => ({ meta: [{ title: 'About & Data | TrafficWatch' }, { name: 'description', content: 'Learn about TrafficWatch data sources, congestion calculations, privacy, and limitations.' }, { property: 'og:title', content: 'About & Data | TrafficWatch' }, { property: 'og:description', content: 'Learn about TrafficWatch data sources, congestion calculations, privacy, and limitations.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' }] }),
 component: AboutPage,
});
