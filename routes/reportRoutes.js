import express from "express";
import {
  createReport,
  getAllReports,
  dismissReport,
  removeReportedRecipe,
} from "../controllers/reportController.js";
import { verifyToken, verifyAdmin } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/", verifyToken, createReport);
router.get("/", verifyToken, verifyAdmin, getAllReports);
router.patch("/:id/dismiss", verifyToken, verifyAdmin, dismissReport);
router.delete("/:id/recipe", verifyToken, verifyAdmin, removeReportedRecipe);

export default router;
