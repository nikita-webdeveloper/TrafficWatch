import { createFileRoute } from '@tanstack/react-router';
import { AnalyticsPage } from '@/components/traffic/TrafficPages';
export const Route = createFileRoute('/analytics')({
 head: () => ({ meta: [{ title: 'Traffic Analytics | TrafficWatch' }, { name: 'description', content: 'Analyze historical speeds, congestion, and traffic patterns from recorded observations.' }, { property: 'og:title', content: 'Traffic Analytics | TrafficWatch' }, { property: 'og:description', content: 'Analyze historical speeds, congestion, and traffic patterns from recorded observations.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' }] }),
 component: AnalyticsPage,
});
