import mongoose from "mongoose"
const { Schema } = mongoose

const fileSchema = new Schema(
  {
    filename: { type: String, required: true },
    originalName: { type: String, required: true },
    mimetype: { type: String, required: true },
    size: { type: Number, required: true },
    path: { type: String, required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    classId: { type: Schema.Types.ObjectId, ref: "Conversation" },
    description: { type: String },
    isPublic: { type: Boolean, default: false },
  },
  { timestamps: true },
)

fileSchema.index({ uploadedBy: 1 })
fileSchema.index({ classId: 1 })
fileSchema.index({ createdAt: -1 })

const File = mongoose.model("File", fileSchema)
export default File
