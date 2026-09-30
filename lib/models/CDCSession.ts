import mongoose, { Schema, type InferSchemaType } from "mongoose";

const schema = new Schema({
  title: { type: String, required: true, trim: true },
  company: { type: String, trim: true, default: "" },
  venue: { type: String, trim: true, default: "" },
  scheduledAt: { type: Date, required: true, index: true },
  eligibleProgramCodes: { type: [String], default: [] },
  notes: { type: String, trim: true, default: "" },
  status: { type: String, enum: ["OPEN", "CLOSED"], default: "OPEN", index: true },
  scannerActive: { type: Boolean, default: false, index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: "CDCAdmin", required: true },
  closedAt: { type: Date },
  attendanceVersion: { type: Number, default: 0 },
}, { timestamps: true });

schema.index({ status: 1, scheduledAt: -1 });

// Keep the simple scannerActive index for fast reader lookup, but enforce the
// single-active-session invariant with a distinct compound key. This avoids
// conflicting with an existing scannerActive_1 index created by earlier builds.
schema.index(
  { scannerActive: 1, status: 1 },
  {
    name: "cdc_single_active_scanner_session",
    unique: true,
    partialFilterExpression: { scannerActive: true, status: "OPEN" },
  },
);

export type CDCSessionDoc = InferSchemaType<typeof schema>;
export const CDCSession = mongoose.models.CDCSession || mongoose.model("CDCSession", schema);
