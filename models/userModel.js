import mongoose from "mongoose";
const { Schema } = mongoose;

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    email: { type: String, required: true, trim: true, unique: true },
    password: { type: String, required: true, trim: true },
    image: { type: String, trim: true }, // Profile Picture
    cover_image: { type: String, trim: true }, // Cover Photo
    bio: { type: String, trim: true, maxlength: 150 }, // Short bio
    
    friends: [{ type: Schema.Types.ObjectId, ref: "User" }], // Friend list
    blocked_users: [{ type: Schema.Types.ObjectId, ref: "User" }], // Blocked users
    friend_requests: [{ type: Schema.Types.ObjectId, ref: "User" }], // Pending friend requests 
    is_active: { type: Boolean, default: true },
    last_seen: { type: Date, default: null }, // Last seen timestamp

    themeIndex: { type: Number, default: 7, required: false }, // Chat theme preference
    notification_settings: {
      new_message: { type: Boolean, default: true },
      mention: { type: Boolean, default: true },
      sound: { type: Boolean, default: true },
    },

    device_tokens: [{ type: String }], // For push notifications

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

