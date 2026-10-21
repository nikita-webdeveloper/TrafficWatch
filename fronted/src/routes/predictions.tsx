import { createFileRoute } from '@tanstack/react-router';
import { PredictionsPage } from '@/components/traffic/TrafficPages';
export const Route = createFileRoute('/predictions')({
 head: () => ({ meta: [{ title: 'Predictions | TrafficWatch' }, { name: 'description', content: 'Traffic forecasting and model information when real prediction data is connected.' }, { property: 'og:title', content: 'Predictions | TrafficWatch' }, { property: 'og:description', content: 'Traffic forecasting and model information when real prediction data is connected.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' }] }),
 component: PredictionsPage,
});
