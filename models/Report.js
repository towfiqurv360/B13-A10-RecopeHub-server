import mongoose from "mongoose";

const reportSchema = new mongoose.Schema(
  {
    recipeId: { type: mongoose.Schema.Types.ObjectId, ref: "Recipe", required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    reporterEmail: { type: String, required: true },
    reason: {
      type: String,
      required: true,
      enum: ["Spam", "Offensive Content", "Copyright Issue"],
    },
    status: {
      type: String,
      enum: ["pending", "dismissed", "removed"],
      default: "pending",
    },
  },
  { timestamps: true }
);

export default mongoose.model("Report", reportSchema);
