import { loadEnvFile } from "node:process";
import mongoose from "mongoose";

function loadLocalEnv() {
  for (const file of [".env.local", ".env"]) {
    try {
      loadEnvFile(file);
      console.log(`Loaded environment from ${file}`);
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
        throw error;
      }
    }
  }
}

async function main() {
  loadLocalEnv();

  // Import after environment variables are loaded.
  await import("@/lib/models");
  const { connectDB } = await import("@/lib/db");

  await connectDB();

  for (
    const model of Object.values(
      mongoose.models
    ) as mongoose.Model<unknown>[]
  ) {
    process.stdout.write(`Syncing ${model.modelName}... `);

    await model.syncIndexes();

    console.log("done");
  }

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Index sync failed:", error);

  try {
    await mongoose.disconnect();
  } catch {}

  process.exit(1);
});