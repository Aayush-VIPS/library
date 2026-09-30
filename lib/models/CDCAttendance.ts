import mongoose, { Schema, type InferSchemaType } from "mongoose";

const schema = new Schema({
  sessionId: { type: Schema.Types.ObjectId, ref: "CDCSession", required: true, index: true },
  studentId: { type: Schema.Types.ObjectId, ref: "CDCStudent", required: true, index: true },
  cardId: { type: String, required: true, trim: true },
  markedAt: { type: Date, required: true, default: Date.now, index: true },
  capturedAt: { type: Date, index: true },
  eventId: { type: String, trim: true },
  markedBy: { type: Schema.Types.ObjectId, ref: "CDCAdmin" },
  deviceId: { type: Schema.Types.ObjectId, ref: "Device", index: true },
  method: { type: String, enum: ["SCAN", "MANUAL"], default: "SCAN" },
}, { timestamps: true });

schema.index({ sessionId: 1, studentId: 1 }, { unique: true });
schema.index({ eventId: 1 }, { unique: true, sparse: true });
schema.index({ sessionId: 1, markedAt: -1 });

export type CDCAttendanceDoc = InferSchemaType<typeof schema>;
export const CDCAttendance = mongoose.models.CDCAttendance || mongoose.model("CDCAttendance", schema);
