import mongoose from "mongoose";
import { characterCount } from "../utils/validators.js";

const messageSchema = new mongoose.Schema(
  {
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["text", "image"], default: "text" },
    content: { type: String, default: "", trim: true, required: function () {
      const update = this.getUpdate?.();
      return (this.type || update?.$set?.type || update?.$setOnInsert?.type) !== "image";
    }, validate: value => characterCount(value || "") <= 2000 },
    caption: { type: String, default: "", validate: value => characterCount(value || "") <= 1000 },
    attachments: { type: [{ _id: false, key: { type: String, required: true }, thumbKey: String, mime: { type: String, required: true }, size: { type: Number, required: true }, width: Number, height: Number }],
      default: [], validate: { validator: value => value.length <= 10, message: "At most ten images" } },
    tempId: { type: String, maxlength: 100 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

messageSchema.index({ conversation: 1, createdAt: -1 });
messageSchema.index(
  { conversation: 1, sender: 1, tempId: 1 },
  { unique: true, partialFilterExpression: { tempId: { $type: "string" } } }
);

export default mongoose.model("Message", messageSchema);
