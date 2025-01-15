import mongoose from "mongoose";
const { Schema } = mongoose;

const userSchema = new Schema({
  name: { type: String, required: true, trim: true, unique: true },
  email: { type: String, required: true, trim: true, unique: true },
  image: { type: String, trim: true },
  themeIndex: { type: Number, default: 7, required: false },
  password: { type: String, required: true, trim: true },
  is_online: { type: Boolean, default: false },
});

// Add indexes for unique constraints
userSchema.index({ name: 1, email: 1 }, { unique: true });

const userModel = mongoose.model("User", userSchema);

export default userModel;
