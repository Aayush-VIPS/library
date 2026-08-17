import { rm } from "node:fs/promises";

for (const path of [".next/dev", ".next/cache"]) {
  await rm(path, { recursive: true, force: true });
  console.log(`Removed ${path}`);
}
