// 组件 SSR 冒烟测试：用 vite build --ssr 把入口打成 ESM 后运行，验证编单组件无运行时错误
import { build } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { webcrypto } from "node:crypto";
import { rmSync, mkdirSync } from "node:fs";

if (!globalThis.crypto) globalThis.crypto = webcrypto;
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const outDir = resolve(here, ".ssr-tmp");
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

await build({
  root,
  logLevel: "silent",
  configFile: false,
  plugins: [vue()],
  ssr: { noExternal: ["lucide-vue-next"] },
  build: {
    ssr: resolve(here, "ssr-entry.mjs"),
    outDir,
    emptyOutDir: true,
    rollupOptions: { output: { format: "esm", entryFileNames: "ssr.mjs" } },
  },
});

try {
  await import(resolve(outDir, "ssr.mjs"));
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
