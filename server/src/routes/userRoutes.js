import { Router } from "express";
import { searchUsers } from "../controllers/userController.js";
import { protect } from "../middleware/auth.js";
import { blockUser, listBlocked, unblockUser } from "../controllers/chatManagementController.js";
import { updateProfile } from "../controllers/profileController.js";

const router = Router();
router.get("/", protect, searchUsers);
router.get("/blocked", protect, listBlocked);
router.patch("/me", protect, updateProfile);
router.post("/:id/block", protect, blockUser);
router.delete("/:id/block", protect, unblockUser);
export default router;
