import mongoose from "mongoose"
const { Schema } = mongoose

const siteSecurityMessageSchema = new Schema(
  {
    goodMessage: { type: String, required: true },
    badMessage: { type: String, required: true },
  },
  { timestamps: true }
)

const SiteSecurityMessage = mongoose.model("SiteSecurityMessage", siteSecurityMessageSchema)
export default SiteSecurityMessage