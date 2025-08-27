import mongoose from "mongoose";
const { Schema } = mongoose;

const friendListSchema = new Schema(
  {
    user: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User", 
      required: true,
      unique: true 
    },
    friends: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }]
  },
  { timestamps: true }
);

friendListSchema.index({ user: 1 }, { unique: true });

export const FriendList = mongoose.model("FriendList", friendListSchema);