import mongoose from 'mongoose';
const { Schema } = mongoose;

const postSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true, trim: true },
    reactions: {
      like: { type: Number, default: 0 },
      love: { type: Number, default: 0 },
      haha: { type: Number, default: 0 },
      wow: { type: Number, default: 0 },
      sad: { type: Number, default: 0 },
      angry: { type: Number, default: 0 },
    },
    comments: [
      {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        text: { type: String, required: true, trim: true },
        replies: [
          {
            user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
            text: { type: String, required: true, trim: true },
            createdAt: { type: Date, default: Date.now },
          },
        ],
      },
    ],
    createdAt: { type: Date, default: Date.now, expires: 86400 },
  },
  { timestamps: true }
);

export default mongoose.model('Post', postSchema);