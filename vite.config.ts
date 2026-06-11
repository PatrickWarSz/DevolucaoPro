import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null,
      devOptions: { enabled: false },
      includeAssets: [
        "favicon.ico",
        "favicon-32.png",
        "apple-touch-icon.png",
        "pwa-192.png",
        "pwa-512.png",
        "pwa-192-maskable.png",
        "pwa-512-maskable.png",
      ],
      workbox: {
        navigateFallbackDenylist: [/^\/~oauth/, /^\/api/],
        runtimeCaching: [
          {
            urlPattern: ({ request }: { request: Request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: { cacheName: "html", networkTimeoutSeconds: 3 },
          },
        ],
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: "DevoluçõesPro — VEXO",
        short_name: "DevoluçõesPro",
        description:
          "Gestão de devoluções, logística reversa e disputas — precisão executiva por VEXO.",
        start_url: "/registrar",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        theme_color: "#2563EB",
        background_color: "#0F172A",
        lang: "pt-BR",
        id: "/",
        categories: ["business", "productivity"],
        shortcuts: [
          {
            name: "Registrar devolução",
            short_name: "Registrar",
            description: "Abrir tela de registro de devolução",
            url: "/registrar",
            icons: [{ src: "/pwa-192.png", sizes: "192x192" }],
          },
          {
            name: "Fila do dia",
            short_name: "Fila",
            description: "Ver fila de devoluções do dia",
            url: "/fila",
            icons: [{ src: "/pwa-192.png", sizes: "192x192" }],
          },
          {
            name: "Disputas",
            short_name: "Disputas",
            description: "Ver disputas pendentes",
            url: "/disputas",
            icons: [{ src: "/pwa-192.png", sizes: "192x192" }],
          },
        ],
        icons: [
          { src: "/pwa-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/pwa-192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: "/pwa-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
}));
