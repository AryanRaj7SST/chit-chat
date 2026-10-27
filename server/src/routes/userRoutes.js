import { Router } from "express";
import { searchUsers } from "../controllers/userController.js";
import { protect } from "../middleware/auth.js";

const router = Router();
router.get("/", protect, searchUsers);
export default router;
