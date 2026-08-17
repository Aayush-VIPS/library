import mongoose, { Schema, type InferSchemaType } from "mongoose";

const schema = new Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  passwordHash: { type: String, required: true },
  role: {
    type: String,
    enum: ["ADMIN", "SUPER_ADMIN", "LIBRARY_MANAGER", "STAFF", "VIEWER"],
    default: "STAFF",
    required: true,
  },
  assignedLibraryIds: { type: [String], default: [] },
  active: { type: Boolean, default: true },
  sessionVersion: { type: Number, default: 0 },
  lastLoginAt: { type: Date },
}, { timestamps: true });

export type AdminDoc = InferSchemaType<typeof schema>;
export const Admin = mongoose.models.Admin || mongoose.model("Admin", schema);
