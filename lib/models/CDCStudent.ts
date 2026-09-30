import mongoose, { Schema, type InferSchemaType } from "mongoose";

const schema = new Schema({
  enrollmentNumber: { type: String, required: true, unique: true, trim: true },
  name: { type: String, required: true, trim: true },
  cardId: { type: String, required: true, unique: true, trim: true },
  rollNumber: { type: String, required: true, trim: true },
  instituteCode: { type: String, required: true, trim: true, index: true },
  programCode: { type: String, required: true, trim: true, index: true },
  program: { type: String, required: true, trim: true },
  admissionYear: { type: Number, required: true, index: true },
  department: { type: String, trim: true, default: "" },
  active: { type: Boolean, default: true },
}, { timestamps: true });

schema.index({ name: 1 });
schema.index({ admissionYear: 1, programCode: 1 });

export type CDCStudentDoc = InferSchemaType<typeof schema>;
export const CDCStudent = mongoose.models.CDCStudent || mongoose.model("CDCStudent", schema);
