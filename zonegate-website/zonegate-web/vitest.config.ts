import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
    test: {
        environment: "node",
        include: ["src/**/*.test.ts"],
    },
    resolve: {
        // Mirrors the `@/*` path alias the app uses, so tests import the same way.
        alias: { "@": path.resolve(__dirname, "src") },
    },
});
