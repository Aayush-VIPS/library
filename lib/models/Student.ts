import mongoose, { Schema, type InferSchemaType } from "mongoose";

const schema = new Schema({
  enrollmentNumber: { type: String, required: true, unique: true, trim: true },
  name: { type: String, required: true, trim: true },
  rfidUid: { type: String, required: true, unique: true, trim: true },
  course: { type: String, trim: true, default: "" },
  batch: { type: String, trim: true, default: "" },
  section: { type: String, trim: true, default: "" },
  active: { type: Boolean, default: true },
}, { timestamps: true });

schema.index({ name: 1 });
export type StudentDoc = InferSchemaType<typeof schema>;
export const Student = mongoose.models.Student || mongoose.model("Student", schema);
