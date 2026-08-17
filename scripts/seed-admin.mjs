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
const email = process.env.ADMIN_EMAIL?.toLowerCase();
const password = process.env.ADMIN_PASSWORD;
if (!uri || !email || !password) { console.error("Set MONGODB_URI, ADMIN_EMAIL and ADMIN_PASSWORD before running this command."); process.exit(1) }
if (password.length < 12) { console.error("ADMIN_PASSWORD must be at least 12 characters."); process.exit(1) }
const salt = crypto.randomBytes(16).toString("hex"); const hash = crypto.scryptSync(password, salt, 64).toString("hex"); const passwordHash = `scrypt$${salt}$${hash}`;
const schema = new mongoose.Schema({ email: { type: String, unique: true }, name: String, passwordHash: String, role: String, active: Boolean, sessionVersion: Number }, { timestamps: true });
const Admin = mongoose.models.Admin || mongoose.model("Admin", schema);
await mongoose.connect(uri, { dbName });
await Admin.findOneAndUpdate({ email }, { $set: { name: "Library Administrator", passwordHash, role: "SUPER_ADMIN", active: true }, $setOnInsert: { sessionVersion: 0, assignedLibraryIds: [] } }, { upsert: true, returnDocument: "after" });
console.log(`Admin ready: ${email}`); await mongoose.disconnect();
