import mongoose from "mongoose";

const DB_OPTIONS = {
  dbName: process.env.DB_NAME,
};

const connectDB = (DATABASE_URL) => {
  return mongoose
    .connect(DATABASE_URL, DB_OPTIONS)
    .then(() => {
      console.log("Bismillah! Connected to the database");
    })
    .catch((err) => {
      console.log(err);
    });
};

export default connectDB;