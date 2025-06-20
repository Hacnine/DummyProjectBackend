// Middleware to handle user approval workflow
import UserApproval from "../models/userApprovalModel.js"
import AdminSettings from "../models/adminSettingsModel.js"

export const createUserApproval = async (userId, req) => {
  try {
    const settings = await AdminSettings.findOne()

    if (!settings || !settings.security.require_admin_approval) {
      return null // No approval required
    }

    // Calculate risk score based on various factors
    let riskScore = 0
    const riskFactors = []

    // Check for suspicious patterns
    if (req.body.email && req.body.email.includes("temp")) {
      riskScore += 20
      riskFactors.push("Temporary email detected")
    }

    // Create approval request
    const approval = new UserApproval({
      user: userId,
      status: "pending",
      verification_data: {
        ip_address: req.ip,
        user_agent: req.get("User-Agent"),
        registration_source: "web",
        email_verified: false,
        phone_verified: false,
      },
      risk_score: riskScore,
      risk_factors: riskFactors,
    })

    await approval.save()
    return approval
  } catch (error) {
    console.error("Error creating user approval:", error)
    return null
  }
}

export const checkUserApprovalStatus = async (req, res, next) => {
  try {
    const settings = await AdminSettings.findOne()

    if (!settings || !settings.security.require_admin_approval) {
      return next() // No approval required
    }

    const approval = await UserApproval.findOne({
      user: req.user._id,
      status: { $in: ["pending", "approved"] },
    })

    if (!approval || approval.status === "pending") {
      return res.status(403).json({
        message: "Account pending approval",
        status: "pending_approval",
      })
    }

    if (approval.status === "rejected") {
      return res.status(403).json({
        message: "Account access denied",
        status: "rejected",
      })
    }

    next()
  } catch (error) {
    res.status(500).json({ message: "Error checking approval status" })
  }
}
