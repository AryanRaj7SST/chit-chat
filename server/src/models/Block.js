import mongoose from "mongoose";
const schema = new mongoose.Schema({ blocker: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, blocked: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true } }, { timestamps: true });
schema.index({ blocker: 1, blocked: 1 }, { unique: true });
schema.index({ blocked: 1 });
export default mongoose.model("Block", schema);
