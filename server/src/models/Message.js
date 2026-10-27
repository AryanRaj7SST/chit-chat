import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    content: { type: String, required: true, trim: true, maxlength: 2000 },
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
