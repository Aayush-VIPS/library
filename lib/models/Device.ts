import mongoose, { Schema, type InferSchemaType } from "mongoose";
import { DEFAULT_LIBRARY_ID } from "@/lib/libraries";

const schema = new Schema({
  macAddress: { type: String, required: true, unique: true, uppercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  libraryId: { type: String, required: true, default: DEFAULT_LIBRARY_ID, index: true },
  deviceType: { type: String, enum: ["LIBRARY_GATE"], default: "LIBRARY_GATE" },
  secretHash: { type: String, required: true },
  firmwareVersion: { type: String, default: "" },
  active: { type: Boolean, default: true },
  lastSeenAt: { type: Date },
  rssi: { type: Number },
  queueDepth: { type: Number, default: 0 },
  clockReady: { type: Boolean, default: false },
}, { timestamps: true });

schema.index({ lastSeenAt: -1 });
export type DeviceDoc = InferSchemaType<typeof schema>;
export const Device = mongoose.models.Device || mongoose.model("Device", schema);
