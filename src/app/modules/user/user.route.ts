import express from "express";
import { auth } from "../../middleware/auth";
import { UserController } from "./user.controller";

const router = express.Router();

// GET /api/v1/user/all
// Admin → can see everyone
router.get("/all", auth("admin"), UserController.getAllUsers);

// ─── Push device token (host/cleaner mobile app) ──────────────────────────────
// POST /api/v1/user/device-token  { playerId }  — register on login/permission
router.post("/device-token", auth(), UserController.registerDeviceToken);
// DELETE /api/v1/user/device-token  — unregister on logout
router.delete("/device-token", auth(), UserController.removeDeviceToken);

export const UserRoutes = router;
