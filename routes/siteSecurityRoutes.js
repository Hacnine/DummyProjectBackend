
import express from "express";
import { createSiteSecurityMessage, getSiteSecurityMessages, verifySiteSecurityMessage } from "../controllers/siteSecurityController.js";
import { requireAdmin, requireSuperAdmin } from "../middlewares/adminAuth.js"

const siteSecurityRouter = express.Router()

siteSecurityRouter.post('/create-site-security-messages',requireAdmin, createSiteSecurityMessage);
siteSecurityRouter.get('/get-site-security-messages',requireAdmin, getSiteSecurityMessages);
siteSecurityRouter.post('/verify-site-security-messages', verifySiteSecurityMessage);

export default siteSecurityRouter;