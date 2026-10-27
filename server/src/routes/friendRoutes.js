import { Router } from "express";
import { protect } from "../middleware/auth.js";
import { friendRateLimit } from "../middleware/friendRateLimit.js";
import { sendRequest, listRequests, acceptRequest, declineRequest, cancelRequest, listFriends, unfriend } from "../controllers/friendController.js";

const router = Router();
router.use(protect);
router.post("/requests", friendRateLimit, sendRequest);
router.get("/requests", listRequests);
router.post("/requests/:id/accept", acceptRequest);
router.post("/requests/:id/decline", declineRequest);
router.delete("/requests/:id", cancelRequest);
router.get("/", listFriends);
router.delete("/:userId", unfriend);
export default router;
