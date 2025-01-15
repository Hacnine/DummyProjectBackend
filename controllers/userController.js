import userModel from "../models/userModel.js";
import bcrypt from "bcrypt";

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


const loadLogin = async (req, res) => {
  try {
  } catch (error) {
    console.log(error.message);
  }
};

const login = async (req, res) => {
  try {
    const email = req.body.email;
    const password = req.body.password;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required." });
    }

    // Check if the user exists
    const userData = await userModel.findOne({ email: email }); // Ensure `userModel` is imported and correct
    if (userData) {
      // Verify the password
      const passwordMatch = await bcrypt.compare(password, userData.password);
      if (passwordMatch) {
        // Create a session or JWT token
        const userResponse = {
          id: userData._id,
          email: userData.email,
          name: userData.name,
        };

        req.session.user = userResponse;
        return res.status(200).json({ message: "success", user: userResponse });
      } else {
        return res
          .status(401)
          .json({ message: "Email or Password is incorrect." });
      }
    } else {
      return res
        .status(401)
        .json({ message: "Email or Password is incorrect." });
    }
  } catch (error) {
    console.error("Error in login function:", error);
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

const logout = async (req, res) => {
  try {
    // Destroy the session
    req.session.destroy((err) => {
      if (err) {
        console.error("Error destroying session:", err);
        return res
          .status(500)
          .json({ message: "Failed to log out. Please try again." });
      }

      // Optional: Clear the cookie (if applicable)
      res.clearCookie("connect.sid"); // Replace 'connect.sid' with your session cookie name if it's different

      // Send a success response
      res.status(200).json({ message: "Logged out successfully." });
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ message: "Internal server error." });
  }
};

const loadDashboard = async (req, res) => {
  try {
    const users = await userModel.find({ _id: { $ne: req.session.user.id } });
    res.send({ user: req.session.user, users: users });
  } catch (error) {
    console.log(error.message);
  }
};
export { register, registerLoad, loadLogin, login, logout, loadDashboard };
