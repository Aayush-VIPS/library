import mongoose, { Schema, type InferSchemaType } from "mongoose";

const schema = new Schema({
  title: { type: String, required: true, trim: true },
  company: { type: String, trim: true, default: "" },
  venue: { type: String, trim: true, default: "" },
  scheduledAt: { type: Date, required: true, index: true },
  eligibleProgramCodes: { type: [String], default: [] },
  notes: { type: String, trim: true, default: "" },
  status: { type: String, enum: ["OPEN", "CLOSED"], default: "OPEN", index: true },\n  scannerActive: { type: Boolean, default: false, index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: "CDCAdmin", required: true },
  closedAt: { type: Date },
  attendanceVersion: { type: Number, default: 0 },
}, { timestamps: true });

schema.index({ status: 1, scheduledAt: -1 });\nschema.index({ scannerActive: 1 }, { unique: true, partialFilterExpression: { scannerActive: true } });

export type CDCSessionDoc = InferSchemaType<typeof schema>;
export const CDCSession = mongoose.models.CDCSession || mongoose.model("CDCSession", schema);
