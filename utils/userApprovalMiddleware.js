// Middleware to handle user approval workflow
import UserApproval from "../models/userApprovalModel.js"
import AdminSettings from "../models/adminSettingsModel.js"

export const createUserApproval = async (userId, req) => {
  try {
    const settings = await AdminSettings.findOne();
    const statusFromFrontend = req.body.status || "pending"; // default fallback
    const isApprovalGloballyDisabled = !settings?.security?.require_admin_approval;

    //  Case: Admin approval is disabled & frontend sent 'pending' → skip
    if (isApprovalGloballyDisabled && statusFromFrontend === "pending") {
      console.log("Skipping approval: Admin approval is disabled and status is 'pending'");
      return null;
    }

    //  Case: Admin approval is disabled & status is approved → skip
    if (isApprovalGloballyDisabled && statusFromFrontend === "approved") {
      return null;
    }

    //  Case: Admin approval is enabled, allow either 'pending' or 'approved'
    // Risk score logic (optional)
    let riskScore = 0;
    const riskFactors = [];

    if (req.body.email?.includes("temp")) {
      riskScore += 20;
      riskFactors.push("Temporary email detected");
    }

    const approval = new UserApproval({
      user: userId,
      status: statusFromFrontend,
      verification_data: {
        user_agent: req.get("User-Agent"),
        registration_source: "web",
        email_verified: false,
        phone_verified: false,
      },
      risk_score: riskScore,
      risk_factors: riskFactors,
      reviewed_at: statusFromFrontend === "approved" ? new Date() : undefined,
      reviewed_by: statusFromFrontend === "approved" && req.user ? req.user._id : undefined,
    });

    await approval.save();
    return approval;
  } catch (error) {
    console.error("Error creating user approval:", error);
    return null;
  }
};


export const checkUserApprovalStatus = async (req, res, next) => {
  try {
    const settings = await AdminSettings.findOne();

    if (!settings || !settings.security.require_admin_approval) {
      return next(); // Approval not required globally
    }

    const user = req.user;
    if (!user || !user.is_active) {
      return res.status(403).json({
        message: "Account not active. Please wait for approval.",
        status: "inactive",
      });
    }

    const approval = await UserApproval.findOne({
      user: user._id,
      status: { $in: ["pending", "approved"] },
    });

    if (!approval || approval.status === "pending") {
      return res.status(403).json({
        message: "Account pending approval",
        status: "pending_approval",
      });
    }

    if (approval.status === "rejected") {
      return res.status(403).json({
        message: "Account access denied",
        status: "rejected",
      });
    }

    next();
  } catch (error) {
    console.error("Approval middleware error:", error);
    res.status(500).json({ message: "Error checking approval status" });
  }
};

