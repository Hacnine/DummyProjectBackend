import dotenv from "dotenv";
dotenv.config();
import express from "express";
import userRouter from "./routes/userRoute.js";
import connectDB from "./db/connectdb.js";
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const port = process.env.PORT || "3000";
const DATABASE_URL = process.env.DATABASE_URL;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Set up view engine
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use('/', userRouter);
connectDB(DATABASE_URL);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});