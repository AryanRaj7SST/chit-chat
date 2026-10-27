import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { characterCount } from "../utils/validators.js";
import { decrypt, protectedString } from "../security/encryption.js";
import { passwordError } from "../security/passwords.js";
import { settingsSchema } from "../security/settings.js";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, "Name is required"], trim: true, minlength: 2, maxlength: 50 },
    email: { type: String, required: [true, "Email is required"], unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 8, select: false },
    tokenVersion: { type: Number, default: 0, select: false },
    isBot: { type: Boolean, default: false },
    settings: { type: settingsSchema, default: () => ({}) },
    deleting: { type: Boolean, default: false },
    about: { ...protectedString, default: "", validate: value => characterCount(decrypt(value)) <= 140 },
    avatar: { key: String, thumbKey: String, mime: String, size: Number, width: Number, height: Number },
    lastSeenAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, toJSON: { getters: true }, toObject: { getters: true } }
);

userSchema.index({ name: 1 });

userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  const error = passwordError(this.password); if (error) throw new Error(error);
  this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.matchPassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

userSchema.methods.toPublic = function () {
  return { _id: this._id, name: this.name, email: this.email, createdAt: this.createdAt, isBot: this.isBot, settings: this.settings, about: this.about, avatar: this.avatar, lastSeenAt: this.lastSeenAt };
};

export default mongoose.model("User", userSchema);
