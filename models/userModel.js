import mongoose from "mongoose";
const { Schema } = mongoose;

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },

    email: { type: String, required: true, trim: true, unique: true },
    password: { type: String, required: true, trim: true },
    gender: { type: String, required: true },
    image: { type: String, required: false, trim: true, default:"/images/avatar/default-avatar.svg" },
    bio: { type: String, trim: true, maxlength: 150 },
    role: {
      type: String,
      enum: ["user", "admin", "superadmin", "moderator", "teacher"],
      default: "user",
    },
    is_active: { type: Boolean, default: false },
    last_seen: { type: Date, default: null },
    themeIndex: { type: Number, default: 0, required: false },
    fileSendingAllowed: { type: Boolean, default: false },
    notification_settings: {
      new_message: { type: Boolean, default: null },
      mention: { type: Boolean, default: null },
      sound: { type: Boolean, default: null },
    },

    device_tokens: [{ type: String, default: null }], // For push notifications

    two_factor_auth: {
      enabled: { type: Boolean, default: false },
      secret: { type: String, default: null }, // For 2FA authentication
    },
  },
  { timestamps: true }
);

userSchema.index({ name: 1, email: 1 }, { unique: true });

const User = mongoose.model("User", userSchema);
export default User;
