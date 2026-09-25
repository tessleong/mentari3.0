import contentCollections from "@content-collections/vite";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { generateSitemap } from "tanstack-router-sitemap";
import { defineConfig } from "vite";

import { getSitemap } from "./src/utils/sitemap";

const config = defineConfig(() => {
  const generateSourceMaps = Boolean(
    process.env.SENTRY_BUILD_SOURCEMAPS === "1" && process.env.VITE_APP_VERSION,
  );

  return {
    build: {
      sourcemap: generateSourceMaps ? ("hidden" as const) : false,
    },
    plugins: [
      contentCollections(),
      tailwindcss(),
      tanstackStart({
        sitemap: {
          host: "https://mentari.dev",
        },
        prerender: {
          enabled: true,
          concurrency: 3,
          crawlLinks: true,
          autoStaticPathsDiscovery: true,
          filter: ({ path }) => {
            return [
              "/",
              "/download",
              "/download/",
              "/blog",
              "/blog/",
              "/blog/char-is-now-anarlog",
              "/blog/char-is-now-anarlog/",
            ].includes(path);
          },
        },
      }),
      viteReact(),
      generateSitemap(getSitemap()),
      nitro({ preset: "vercel" }),
    ],
    ssr: {
      noExternal: ["posthog-js", "@posthog/react", "react-tweet"],
    },
    resolve: {
      tsconfigPaths: true,
    },
    preview: {
      host: "127.0.0.1",
    },
  };
});

export default config;
