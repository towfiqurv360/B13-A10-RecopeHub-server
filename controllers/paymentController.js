import Stripe from "stripe";
import dotenv from "dotenv";
import Payment from "../models/Payment.js";
import User from "../models/User.js";
import Recipe from "../models/Recipe.js";

dotenv.config();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const getClientUrl = () => process.env.CLIENT_URL || "http://localhost:3000";

export const createCheckoutSession = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const user = await User.findById(userId).select("email isPremium");
    if (!user) return res.status(404).json({ message: "User not found" });

    const { paymentType, recipeId } = req.body;
    if (!["recipe", "premium"].includes(paymentType)) {
      return res.status(400).json({ message: "Invalid payment type" });
    }

    let amount;
    let productName;

    if (paymentType === "recipe") {
      const recipe = await Recipe.findById(recipeId);
      if (!recipe) return res.status(404).json({ message: "Recipe not found" });
      amount = 500;
      productName = `Recipe access: ${recipe.recipeName}`;
    } else {
      if (user.isPremium) return res.status(400).json({ message: "You are already a premium member." });
      amount = 2000;
      productName = "RecipeHub Premium Membership";
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: user.email,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: productName },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      metadata: {
        userId: userId.toString(),
        paymentType,
        recipeId: recipeId ? recipeId.toString() : "",
      },
      success_url: `${getClientUrl()}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${getClientUrl()}/dashboard`,
    });

    res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (error) {
    console.error("Stripe Checkout Error:", error);
    res.status(500).json({ message: "Could not create Stripe Checkout session", error: error.message });
  }
};

export const confirmCheckoutSession = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ message: "Session ID is required" });

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") {
      return res.status(400).json({ message: "Payment has not been completed." });
    }

    if (session.metadata?.userId !== userId.toString()) {
      return res.status(403).json({ message: "This payment does not belong to the current user." });
    }

    const transactionId = session.payment_intent || session.id;
    const existing = await Payment.findOne({ transactionId });
    if (existing) {
      const user = await User.findById(userId).select("-password");
      return res.status(200).json({ message: "Payment already recorded", payment: existing, user });
    }

    const paymentType = session.metadata?.paymentType;
    const recipeId = session.metadata?.recipeId || undefined;
    const amount = (session.amount_total || 0) / 100;

    const payment = await Payment.create({
      userEmail: session.customer_email || req.user.email,
      userId,
      amount,
      recipeId: recipeId || undefined,
      paymentType,
      transactionId,
      paymentStatus: "paid",
      paidAt: new Date(),
    });

    if (paymentType === "premium") {
      await User.findByIdAndUpdate(userId, { isPremium: true });
    }

    const user = await User.findById(userId).select("-password");
    res.status(201).json({ message: "Payment verified and saved", payment, user });
  } catch (error) {
    console.error("Confirm Checkout Session Error:", error);
    res.status(500).json({ message: "Could not verify payment", error: error.message });
  }
};

export const getPurchasedRecipes = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const purchases = await Payment.find({ userId, paymentType: "recipe", paymentStatus: "paid" })
      .populate("recipeId")
      .sort({ createdAt: -1 });
    res.status(200).json(purchases);
  } catch (error) {
    console.error("Get Purchased Recipes Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getAllPayments = async (req, res) => {
  try {
    const payments = await Payment.find().populate("userId", "name email").populate("recipeId", "recipeName").sort({ createdAt: -1 });
    res.status(200).json(payments);
  } catch (error) {
    console.error("Get All Payments Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};
