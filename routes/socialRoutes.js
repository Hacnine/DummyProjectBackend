import express from 'express';
import Post from '../models/postModel.js';
import { Friendship } from '../models/friendshipModel.js';
import { isLogin } from '../middlewares/auth.middleware.js';
import { FriendList } from '../models/friendListModel.js';

const router = express.Router();

// Create Post
router.post('/posts', isLogin, async (req, res) => {
  const { content } = req.body;
  try {
    const post = new Post({ user: req.user._id, content });
    await post.save();
    const populatedPost = await Post.findById(post._id).populate('user', 'name');
    req.io.emit('newPost', populatedPost);
    res.status(201).json(populatedPost);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Edit Post
router.put('/posts/:postId', isLogin, async (req, res) => {
  const { postId } = req.params;
  const { content } = req.body;
  try {
    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    if (post.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized: You can only edit your own posts' });
    }
    post.content = content;
    await post.save();
    const populatedPost = await Post.findById(postId).populate('user', 'name');
    req.io.emit('postUpdated', populatedPost);
    res.json(populatedPost);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Delete Post
router.delete('/posts/:postId', isLogin, async (req, res) => {
  const { postId } = req.params;
  try {
    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    if (post.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized: You can only delete your own posts' });
    }
    await Post.deleteOne({ _id: postId });
    req.io.emit('postDeleted', postId);
    res.json({ message: 'Post deleted' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Add Reaction
router.post('/posts/:postId/reaction', isLogin, async (req, res) => {
  const { postId } = req.params;
  const { type } = req.body;
  try {
    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    post.reactions[type] = (post.reactions[type] || 0) + 1;
    await post.save();
    const populatedPost = await Post.findById(postId).populate('user', 'name');
    req.io.emit('postUpdated', populatedPost);
    res.json(populatedPost);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Add Comment
router.post('/posts/:postId/comments', isLogin, async (req, res) => {
  const { postId } = req.params;
  const { text } = req.body;
  try {
    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    post.comments.push({ user: req.user._id, text });
    await post.save();
    const populatedPost = await Post.findById(postId).populate('user', 'name').populate('comments.user', 'name');
    req.io.emit('postUpdated', populatedPost);
    res.json(populatedPost);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Add Reply
router.post('/posts/:postId/comments/:commentId/replies', isLogin, async (req, res) => {
  const { postId, commentId } = req.params;
  const { text } = req.body;
  try {
    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    const comment = post.comments.id(commentId);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });
    comment.replies.push({ user: req.user._id, text });
    await post.save();
    const populatedPost = await Post.findById(postId).populate('user', 'name').populate('comments.user', 'name');
    req.io.emit('postUpdated', populatedPost);
    res.json(populatedPost);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Get Posts (Filtered by Friends)
router.get('/posts', isLogin, async (req, res) => {
  try {
    // Get pagination parameters from query, with defaults
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const skip = (page - 1) * limit;

    // Get user's friend list
    const friendList = await FriendList.findOne({ user: req.user._id }).select('friends');
    const friendIds = friendList ? friendList.friends : [];
    
    // Include user's own posts
    friendIds.push(req.user._id);
    
    // Fetch posts from friends and self with pagination
    const posts = await Post.find({ user: { $in: friendIds } })
      .populate('user', 'name')
      .populate('comments.user', 'name')
      .populate('comments.replies.user', 'name') // Populate user in replies
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    // Get total count for pagination metadata
    const totalPosts = await Post.countDocuments({ user: { $in: friendIds } });
    
    res.json({
      posts,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalPosts / limit),
        totalPosts,
        limit
      }
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

export default router;