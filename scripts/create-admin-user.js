// Script to create an admin user
import mongoose from "mongoose"
import bcrypt from "bcrypt"
import User from "../models/userModel.js"

const createAdminUser = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/chatapp")

    // Check if admin already exists
    const existingAdmin = await User.findOne({ role: "superadmin" })
    if (existingAdmin) {
      console.log("Super admin already exists:", existingAdmin.email)
      return
    }

    // Create admin user
    const adminPassword = "admin123!@#" // Change this in production
    const hashedPassword = await bcrypt.hash(adminPassword, 10)

    const adminUser = new User({
      name: "Super Admin",
      email: "admin@chatapp.com",
      password: hashedPassword,
      gender: "male",
      role: "superadmin",
      is_active: true,
    })

    await adminUser.save()

    console.log("Super admin created successfully!")
    console.log("Email: admin@chatapp.com")
    console.log("Password: admin123!@#")
    console.log("Please change the password after first login.")
  } catch (error) {
    console.error("Error creating admin user:", error)
  } finally {
    await mongoose.disconnect()
  }
}

createAdminUser()
