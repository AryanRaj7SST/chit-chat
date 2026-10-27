import { Router } from "express";
import { listConversations, getOrCreateConversation, getMessages } from "../controllers/conversationController.js";
import { protect } from "../middleware/auth.js";
import { requireMembership } from "../middleware/conversationAccess.js";

const router = Router();
router.use(protect);
router.get("/", listConversations);
router.post("/", getOrCreateConversation);
router.get("/:id/messages", requireMembership, getMessages);
export default router;
