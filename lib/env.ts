import { z } from "zod";

const serverSchema = z.object({
  MONGODB_URI: z.string().min(1),
  MONGODB_DB: z.string().min(1).default("vips_library"),
  SESSION_SECRET: z.string().min(32),
  DEVICE_ENROLLMENT_KEY: z.string().min(24),
  CRON_SECRET: z.string().min(16),
});

let parsed: z.infer<typeof serverSchema> | null = null;

export function env() {
  if (!parsed) parsed = serverSchema.parse(process.env);
  return parsed;
}

export const publicConfig = {
  institutionName: process.env.NEXT_PUBLIC_INSTITUTION_NAME || "VIPS Library",
  capacity: Number(process.env.NEXT_PUBLIC_LIBRARY_CAPACITY || "100") || 100,
};
