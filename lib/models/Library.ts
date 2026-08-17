import mongoose, { Schema, type InferSchemaType } from "mongoose";

const schema = new Schema({
  libraryId: { type: String, required: true, unique: true, lowercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  location: { type: String, trim: true, default: "" },
  active: { type: Boolean, default: true },
}, { timestamps: true });

schema.index({ name: 1 });

export type LibraryDoc = InferSchemaType<typeof schema>;
export const Library = mongoose.models.Library || mongoose.model("Library", schema);
