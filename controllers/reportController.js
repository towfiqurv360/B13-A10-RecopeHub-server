import Report from "../models/Report.js";
import Recipe from "../models/Recipe.js";

export const createReport = async (req, res) => {
  try {
    const { recipeId, reason } = req.body;
    const userId = req.user?.userId || req.user?.id;
    const reporterEmail = req.user?.email;

    if (!recipeId || !reason || !userId || !reporterEmail) {
      return res.status(400).json({ message: "Recipe, reason and authenticated user are required." });
    }

    const recipe = await Recipe.findById(recipeId);
    if (!recipe) return res.status(404).json({ message: "Recipe not found" });

    const duplicate = await Report.findOne({ recipeId, userId, status: "pending" });
    if (duplicate) return res.status(400).json({ message: "You have already reported this recipe." });

    const report = await Report.create({ recipeId, userId, reporterEmail, reason });
    res.status(201).json({ message: "Report submitted successfully", report });
  } catch (error) {
    console.error("Create Report Error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const getAllReports = async (req, res) => {
  try {
    const reports = await Report.find({ status: "pending" })
      .populate("recipeId")
      .populate("userId", "name email")
      .sort({ createdAt: -1 });
    res.status(200).json(reports);
  } catch (error) {
    console.error("Get All Reports Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const dismissReport = async (req, res) => {
  try {
    const report = await Report.findByIdAndUpdate(
      req.params.id,
      { status: "dismissed" },
      { new: true }
    );
    if (!report) return res.status(404).json({ message: "Report not found" });
    res.status(200).json({ message: "Report dismissed", report });
  } catch (error) {
    console.error("Dismiss Report Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const removeReportedRecipe = async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ message: "Report not found" });

    await Recipe.findByIdAndDelete(report.recipeId);
    report.status = "removed";
    await report.save();

    res.status(200).json({ message: "Recipe removed and report closed." });
  } catch (error) {
    console.error("Remove Reported Recipe Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};
