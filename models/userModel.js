import mongoose, { get } from "mongoose";
const { Schema, Decimal128 } = mongoose;

// Student Schema
const userSchema = new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true }, 
  image: { type: String, trim:true},
  themeIndex: { type: Number, default: 7, required: false },
  password: { type: String, required: true, trim: true },
  is_online: { type: Boolean, default: false },
});

const userModel = mongoose.model("User", userSchema);

export default userModel ;
