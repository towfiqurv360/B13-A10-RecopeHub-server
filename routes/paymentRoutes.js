import express from "express";
import {
  createCheckoutSession,
  confirmCheckoutSession,
  getPurchasedRecipes,
  getAllPayments,
} from "../controllers/paymentController.js";
import { verifyToken, verifyAdmin } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/create-checkout-session", verifyToken, createCheckoutSession);
router.post("/confirm-checkout-session", verifyToken, confirmCheckoutSession);
router.get("/purchased", verifyToken, getPurchasedRecipes);
router.get("/all", verifyToken, verifyAdmin, getAllPayments);

export default router;
