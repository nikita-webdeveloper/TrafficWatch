// Vite & TanStack Start build configuration
// Pre-configured plugins include TanStack Start, React 19, Tailwind CSS v4, tsConfigPaths, and Nitro SSR.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
