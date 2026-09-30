import mongoose, { Schema, type InferSchemaType } from "mongoose";

const schema = new Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  passwordHash: { type: String, required: true },
  active: { type: Boolean, default: true },
  sessionVersion: { type: Number, default: 0 },
  lastLoginAt: { type: Date },
}, { timestamps: true });

export type CDCAdminDoc = InferSchemaType<typeof schema>;
export const CDCAdmin = mongoose.models.CDCAdmin || mongoose.model("CDCAdmin", schema);
