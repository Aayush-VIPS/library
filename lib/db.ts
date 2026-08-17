import mongoose from "mongoose";
import { env } from "@/lib/env";

type Cache = { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };
const globalForMongo = globalThis as typeof globalThis & { __vipsMongo?: Cache };
const cache = globalForMongo.__vipsMongo ?? { conn: null, promise: null };
globalForMongo.__vipsMongo = cache;

export async function connectDB() {
  if (cache.conn) return cache.conn;
  if (!cache.promise) {
    const { MONGODB_URI, MONGODB_DB } = env();
    cache.promise = mongoose.connect(MONGODB_URI, {
      dbName: MONGODB_DB,
      maxPoolSize: 10,
      minPoolSize: 0,
      serverSelectionTimeoutMS: 10_000,
      socketTimeoutMS: 20_000,
      autoIndex: process.env.NODE_ENV !== "production",
    });
  }
  cache.conn = await cache.promise;
  return cache.conn;
}
