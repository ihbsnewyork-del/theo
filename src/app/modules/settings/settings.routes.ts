import express from "express";
import { auth } from "../../middleware/auth";
import { SettingsController } from "./settings.controller";

const router = express.Router();

// GET /api/v1/settings — admin: read platform settings
router.get("/", auth("admin"), SettingsController.getSettings);

// PATCH /api/v1/settings — admin: update platform settings
router.patch("/", auth("admin"), SettingsController.updateSettings);

export const SettingsRoutes = router;
