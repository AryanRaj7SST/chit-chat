import { Router } from "express";
import { searchUsers } from "../controllers/userController.js";
import { protect } from "../middleware/auth.js";
import { blockUser, listBlocked, unblockUser } from "../controllers/chatManagementController.js";
import { updateProfile } from "../controllers/profileController.js";
import { exportAccount, deleteAccount } from "../controllers/accountController.js";

const router = Router();
router.get("/", protect, searchUsers);
router.get("/blocked", protect, listBlocked);
router.patch("/me", protect, updateProfile);
router.get("/me/export", protect, exportAccount);
router.delete("/me", protect, deleteAccount);
router.post("/:id/block", protect, blockUser);
router.delete("/:id/block", protect, unblockUser);
export default router;
