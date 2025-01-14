import dotenv from "dotenv";
dotenv.config();
import express from "express";
import userRouter from "./routes/userRoute.js";
import connectDB from "./db/connectdb.js";

const app = express();
const port = process.env.PORT || "3000";
const DATABASE_URL = process.env.DATABASE_URL;

// JSON Middleware
app.use(express.json());

app.use('/', userRouter);
connectDB(DATABASE_URL);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});