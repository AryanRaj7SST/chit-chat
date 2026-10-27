import mongoose from "mongoose";

// One document per user makes the three-pin cap atomic across server instances.
const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", unique: true, required: true },
  chats: { type: [{ _id: false, conversationId: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true }, pinned: { type: Boolean, default: false }, muted: { type: Boolean, default: false }, archived: { type: Boolean, default: false } }], default: [] },
});
export default mongoose.model("ConversationSettings", schema);
