import mongoose from "mongoose"
const { Schema } = mongoose

const userApprovalSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "suspended"],
      default: "pending",
    },
    requested_at: { type: Date, default: Date.now },
    reviewed_at: { type: Date },
    reviewed_by: { type: Schema.Types.ObjectId, ref: "User" },
    rejection_reason: { type: String },
    approval_notes: { type: String },

    // Additional verification data
    verification_data: {
      // ip_address: { type: String },
      user_agent: { type: String },
      registration_source: { type: String },
      email_verified: { type: Boolean, default: false },
      phone_verified: { type: Boolean, default: false },
    },

    // Risk assessment
    risk_score: { type: Number, default: 0, min: 0, max: 100 },
    risk_factors: [{ type: String }],

    // Auto-approval settings
    auto_approved: { type: Boolean, default: false },
    expires_at: { type: Date }, // For temporary approvals
  },
  { timestamps: true },
)

const UserApproval = mongoose.model("UserApproval", userApprovalSchema)
export default UserApproval
