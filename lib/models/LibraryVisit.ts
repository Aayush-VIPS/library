import mongoose, { Schema } from "mongoose";

const schema = new Schema({
  studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true, index: true },
  inEventId: { type: String, required: true, unique: true },
  outEventId: { type: String, unique: true, sparse: true },
  inLibraryId: { type: String, index: true },
  outLibraryId: { type: String },
  inAt: { type: Date, required: true, index: true },
  outAt: { type: Date, index: true },
  inDeviceId: { type: Schema.Types.ObjectId, ref: "Device", required: true },
  outDeviceId: { type: Schema.Types.ObjectId, ref: "Device" },
  outMethod: { type: String, enum: ["RFID_SCAN", "AUTO_6PM", "ADMIN"] },
}, { timestamps: true });

// Only documents with no outAt field are "open" visits.
schema.index(
  { studentId: 1 },
  { unique: true, partialFilterExpression: { outAt: { $exists: false } }, name: "one_open_visit_per_student" },
);
schema.index({ studentId: 1, inAt: -1 });
export const LibraryVisit = mongoose.models.LibraryVisit || mongoose.model("LibraryVisit", schema);
