import mongoose, { Schema } from "mongoose";

const schema = new Schema({
  key: { type: String, required: true, unique: true },
  failures: { type: Number, default: 0 },
  windowStartedAt: { type: Date, default: Date.now },
  blockedUntil: { type: Date },
}, { timestamps: true });

schema.index({ updatedAt: 1 }, { expireAfterSeconds: 86400 });
export const LoginThrottle = mongoose.models.LoginThrottle || mongoose.model("LoginThrottle", schema);
