import mongoose, { Schema } from "mongoose";

const schema = new Schema({
  eventId: { type: String, required: true, unique: true, trim: true },
  studentId: { type: Schema.Types.ObjectId, ref: "Student", index: true },
  deviceId: { type: Schema.Types.ObjectId, ref: "Device", required: true, index: true },
  libraryId: { type: String, index: true },
  rfidUid: { type: String, required: true, trim: true, index: true },
  scannedAt: { type: Date, required: true, index: true },
  receivedAt: { type: Date, default: Date.now, required: true },
  direction: { type: String, enum: ["IN", "OUT"] },
  status: {
    type: String,
    enum: ["PENDING", "PROCESSED", "DUPLICATE", "REJECTED", "UNKNOWN_CARD"],
    required: true,
  },
  reasonCode: { type: String },
}, { timestamps: true });

schema.index({ studentId: 1, scannedAt: 1, eventId: 1 });
schema.index({ receivedAt: -1 });
export const ScanEvent = mongoose.models.ScanEvent || mongoose.model("ScanEvent", schema);
