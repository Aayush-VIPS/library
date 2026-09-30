import mongoose from "mongoose";
import crypto from "node:crypto";
import { loadEnvFile } from "node:process";

for (const file of [".env.local", ".env"]) {
  try {
    loadEnvFile(file);
    console.log(`Loaded environment from ${file}`);
    break;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "vips_library";
const email = process.env.CDC_ADMIN_EMAIL?.toLowerCase();
const password = process.env.CDC_ADMIN_PASSWORD;
const name = process.env.CDC_ADMIN_NAME || "CDC Administrator";

if (!uri || !email || !password) {
  console.error("Set MONGODB_URI, CDC_ADMIN_EMAIL and CDC_ADMIN_PASSWORD before running this command.");
  process.exit(1);
}
if (password.length < 12) {
  console.error("CDC_ADMIN_PASSWORD must be at least 12 characters.");
  process.exit(1);
}

const salt = crypto.randomBytes(16).toString("hex");
const hash = crypto.scryptSync(password, salt, 64).toString("hex");
const passwordHash = `scrypt$${salt}$${hash}`;

const schema = new mongoose.Schema({
  email: { type: String, unique: true },
  name: String,
  passwordHash: String,
  active: Boolean,
  sessionVersion: Number,
  lastLoginAt: Date,
}, { timestamps: true });

const CDCAdmin = mongoose.models.CDCAdmin || mongoose.model("CDCAdmin", schema);
await mongoose.connect(uri, { dbName });
await CDCAdmin.findOneAndUpdate(
  { email },
  {
    $set: { name, passwordHash, active: true },
    $setOnInsert: { sessionVersion: 0 },
  },
  { upsert: true, returnDocument: "after" },
);
console.log(`CDC admin ready: ${email}`);
await mongoose.disconnect();
