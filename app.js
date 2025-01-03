import dotenv from "dotenv";
dotenv.config();
import express from "express";
import web from "./routes/web.js";
import path from 'path';
import { fileURLToPath } from 'url';
import connectDB from "./db/connectdb.js";
import cookieParser from "cookie-parser";
import session from "express-session";
import MongoStore from "connect-mongo";
import './models/Student.js';

const app = express();
const port = process.env.PORT || "3000";
const DATABASE_URL = process.env.DATABASE_URL || "mongodb://localhost:27017/schooldb2";

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.set('view engine', 'ejs');

app.set('views', path.join(__dirname, 'views'));

const sessionStore = MongoStore.create({ 
  mongoUrl: DATABASE_URL,
  dbName: 'schooldb',
  collectionName: 'sessions',

  ttl: 1000 * 60 * 60 * 24, // 1 day  (default)    
  autoRemove: 'native' // Default  
  });

app.use(session({
  name:'mysession',
  secret:'akey',
  resave: false,
  saveUninitialized: true,
  store: sessionStore,
  cookie: {
    maxAge:200000,
    secure: false 
  }
}))

app.use(cookieParser());
app.use('/', web);
connectDB(DATABASE_URL); 

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
