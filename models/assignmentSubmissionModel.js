import mongoose from "mongoose"
const { Schema } = mongoose

const assignmentSubmissionSchema = new Schema(
  {
    classId: { type: Schema.Types.ObjectId, ref: "Conversation", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    assignmentTitle: { type: String, required: true },
    assignmentDescription: { type: String, required: true, maxlength: 1000 },
    status: {type:String, default: 'pending'},
    file: {
      url: { type: String, required: false },
      name: { type: String, required: false },
      size: { type: Number },
      type: { type: String },
    },
    mark: { type: Number, min: 0, max: 100 },
    markedBy: { type: Schema.Types.ObjectId, ref: "User" },
    markedAt: { type: Date },
    feedback: { type: String },
    submittedAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
)

assignmentSubmissionSchema.index({ classId: 1, userId: 1 })
assignmentSubmissionSchema.index({ submittedAt: -1 })

const AssignmentSubmission = mongoose.model("AssignmentSubmission", assignmentSubmissionSchema)
export default AssignmentSubmission
