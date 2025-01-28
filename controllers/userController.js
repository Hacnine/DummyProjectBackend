import userModel from "../models/userModel.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { storeToken, getToken, removeToken } from "../utils/localStorageService.js";

const registerLoad = async (req, res) => {
  try {
    // Send a JSON response for loading the registration page
    res.status(200).json({ message: "Register endpoint" });
  } catch (error) {
    res.status(400).json({ error: error.message });
    console.log(error.message);
  }
};

const register = async (req, res) => {
  try {
    // Hash the password
    const passwordHash = await bcrypt.hash(req.body.password, 10);

    // Create a new user instance
    const user = new userModel({
      name: req.body.name,
      email: req.body.email,
      image: req?.file?.filename ? "/images/" + req.file.filename : "",
      password: passwordHash,
    });

    // Save the user
    await user.save();
    res.status(201).json({ message: "User registered successfully", user });
  } catch (error) {
    if (error.code === 11000) {
      // Duplicate key error
      const field = Object.keys(error.keyValue)[0];
      return res
        .status(400)
        .json({ message: `${field} already exists. Please choose another.` });
    }
    // Other errors
    res.status(500).json({ message: "Internal server error", error: error.message });
    console.error("Error in register function:", error);
  }
};



const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required." });
    }
    const user = await userModel.findOne({ email });
    if (user && await bcrypt.compare(password, user.password)) {
      const accessToken = jwt.sign({ id: user._id }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '7m' });
      // console.log("accessToken", accessToken)
      const refreshToken = jwt.sign({ id: user._id }, process.env.REFRESH_TOKEN_SECRET, { expiresIn: '1m' });
      storeToken(res, { access: accessToken, refresh: refreshToken });
      res.status(200).json({ message: "Login successful", user });
    } else {
      res.status(401).json({ message: "Email or Password is incorrect." });
    }
  } catch (error) {
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
};



const logout = async (req, res) => {
  try {
    removeToken(res);
    res.status(200).json({ message: "Logged out successfully." });
  } catch (error) {
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
};



const getLoggedUser = async (req, res) => {
  try {
    const { access_token } = getToken(req);
    if (!access_token) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const decoded = jwt.verify(access_token, process.env.ACCESS_TOKEN_SECRET);
    const user = await userModel.findById(decoded.id);
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

const refreshToken = async (req, res) => {
  try {
    const { refresh_token } = getToken(req);
    if (!refresh_token) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const decoded = jwt.verify(refresh_token, process.env.REFRESH_TOKEN_SECRET);
    const accessToken = jwt.sign({ id: decoded.id }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '15m' });
    storeToken(res, { access: accessToken, refresh: refresh_token });
    res.status(200).json({ accessToken });
  } catch (error) {
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

export { register, login, logout, getLoggedUser, refreshToken };
