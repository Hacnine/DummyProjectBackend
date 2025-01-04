import userModel from "../models/userModel.js";
import bcrypt from "bcrypt";

const registerLoad = async (req, res) => {
  try {
    res.render('register'); // Render the register.ejs file
  } catch (error) {
    res.status(400).json({ error: error.message });
    console.log(error.message);
  }
}

const register = async (req, res) => {
  try {
    const passwordHash = await bcrypt.hash(req.body.password, 10);

    const user = new userModel({
      name: req.body.name,
      email: req.body.email,
      img: "/images/" + req.file.filename,
      password: passwordHash,
    });
    await user.save();
    res.status(201).json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
    console.log(error.message);
  }
}

export { register, registerLoad };