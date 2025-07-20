import jwt from "jsonwebtoken"
import User from "../models/userModel.js"

export const requireAdmin = async (req, res, next) => {
  try {
    const token = req.cookies.access_token || req.headers.authorization?.split(" ")[1]

    if (!token) {
      return res.status(401).json({ message: "Access token required" })
    }

    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET)
    const user = await User.findById(decoded.id)

    if (!user) {
      return res.status(401).json({ message: "User not found" })
    }

    if (!["admin", "superadmin"].includes(user.role)) {
      return res.status(403).json({ message: "Admin access required" })
    }

    req.user = user
    next()
  } catch (error) {
    res.status(401).json({ message: "Invalid token" })
  }
}

export const requireSuperAdmin = async (req, res, next) => {
  console.log(req?.user?.role );
  try {
    if (req.user.role !== "superadmin") {
      return res.status(403).json({ message: "Super admin access required" })
    }
    next()
  } catch (error) {
    res.status(403).json({ message: "Access denied" })
  }
}
