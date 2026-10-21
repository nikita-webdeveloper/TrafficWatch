import { createFileRoute } from '@tanstack/react-router';
import { RoutePlannerPage } from '@/components/traffic/RoutePlanner';

export const Route = createFileRoute('/route-planner')({
  head: () => ({ meta: [
    { title: 'Route Planner | TrafficWatch' },
    { name: 'description', content: 'Compare alternative routes using travel time, distance, and available traffic information.' },
  ] }),
  component: RoutePlannerPage,
});
