import { createFileRoute } from '@tanstack/react-router';
import { DashboardPage } from '@/components/traffic/TrafficPages';

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: 'Dashboard | TrafficWatch' },
      { name: 'description', content: 'Real-time traffic conditions, road monitoring, and urban flow intelligence.' },
      { property: 'og:title', content: 'Dashboard | TrafficWatch' },
      { property: 'og:description', content: 'Real-time traffic conditions, road monitoring, and urban flow intelligence.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
  }),
  component: DashboardPage,
});

