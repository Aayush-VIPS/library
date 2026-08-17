import mongoose, { Schema } from "mongoose";

const schema = new Schema({
  studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true, unique: true },
  state: { type: String, enum: ["IN", "OUT"], default: "OUT", required: true },
  currentVisitId: { type: Schema.Types.ObjectId, ref: "LibraryVisit" },
  lastScanAt: { type: Date },
  lastEventId: { type: String },
  version: { type: Number, default: 0, required: true },
}, { timestamps: true });

export const StudentState = mongoose.models.StudentState || mongoose.model("StudentState", schema);
