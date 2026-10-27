import { Router } from "express";
import { register, login, me, logoutAll, changePassword } from "../controllers/authController.js";
import { limitLogin, limitRegister } from "../security/rateLimit.js";
import { protect } from "../middleware/auth.js";

const router = Router();
router.post("/register", limitRegister, register);
router.post("/login", limitLogin, login);
router.get("/me", protect, me);
router.post("/logout-all", protect, logoutAll);
router.post("/change-password", protect, changePassword);
export default router;
