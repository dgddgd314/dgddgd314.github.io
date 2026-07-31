import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://dgddgd314.github.io",
  vite: {
    plugins: [tailwindcss()],
  },
});