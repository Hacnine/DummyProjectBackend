import QuickMessage from "../models/quickMessageModel.js";

// Get all quick messages for a user
export const getQuickMessages = async (req, res) => {
  try {
    const quickMessages = await QuickMessage.find({ user: req.user._id });
    res.json(quickMessages);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// Add a new quick message
export const addQuickMessage = async (req, res) => {
  try {
    const { title, message } = req.body;
    const quickMessage = new QuickMessage({
      user: req.user._id,
      title,
      message,
    });
    await quickMessage.save();
    res.status(201).json(quickMessage);
  } catch (err) {
    res.status(400).json({ message: "Failed to add quick message" });
  }
};

// Edit a quick message
export const editQuickMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, message } = req.body;
    const quickMessage = await QuickMessage.findOneAndUpdate(
      { _id: id, user: req.user._id },
      { title, message },
      { new: true }
    );
    if (!quickMessage) {
      return res.status(404).json({ message: "Quick message not found" });
    }
    res.json(quickMessage);
  } catch (err) {
    res.status(400).json({ message: "Failed to edit quick message" });
  }
};

// Delete a quick message
export const deleteQuickMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const quickMessage = await QuickMessage.findOneAndDelete({ _id: id, user: req.user._id });
    if (!quickMessage) {
      return res.status(404).json({ message: "Quick message not found" });
    }
    res.json({ message: "Quick message deleted" });
  } catch (err) {
    res.status(400).json({ message: "Failed to delete quick message" });
  }
};