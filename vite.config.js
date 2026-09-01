import { defineConfig } from "vite";

// GitHub Pages serves this project at https://devniall.github.io/solar-system-sim/
// so all built asset URLs need the repo name as a base path.
export default defineConfig({
  base: "/solar-system-sim/",
});
