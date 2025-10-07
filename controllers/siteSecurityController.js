import SiteSecurityMessage from "../models/siteSecurityMessageModel.js";

// Create a new SiteSecurityMessage
export const createSiteSecurityMessage = async (req, res) => {
  try {
    const { goodMessage, badMessage } = req.body;

    // Validate required fields
    if (!goodMessage || !badMessage) {
      return res.status(400).json({ 
        success: false,
        message: 'Both goodMessage and badMessage are required' 
      });
    }

    // Create new SiteSecurityMessage document
    const newMessage = new SiteSecurityMessage({
      goodMessage,
      badMessage
    });

    // Save to database
    const savedMessage = await newMessage.save();

    res.status(201).json({
      success: true,
      message: 'Site security message created successfully',
      data: savedMessage
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating site security message',
      error: error.message
    });
  }
};

// Verify site security messages
export const verifySiteSecurityMessage = async (req, res) => {
  try {
    const { message } = req.body;

    // Validate input field
    if (!message) {
      return res.status(400).json({
        success: false,
        message: "Message is required for verification",
      });
    }

    // Find matching security message in database
    const storedMessage = await SiteSecurityMessage.findOne({
      $or: [{ goodMessage: message }, { badMessage: message }],
    });

    // Check if message exists
    if (!storedMessage) {
      return res.status(401).json({
        success: false,
        message: "Invalid security message",
      });
    }

    // Determine if the message is good or bad
    const isGoodMessage = storedMessage.goodMessage === message;
    const messageType = isGoodMessage ? "good" : "bad";

    // If verification successful
    res.status(200).json({
      success: true,
      message: "Security message verified successfully",
      data: {
        id: storedMessage._id,
        verifiedAt: new Date(),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error verifying security message",
      error: error.message,
    });
  }
};


// Get site security messages
export const getSiteSecurityMessages = async (req, res) => {
  try {
    const { id } = req.query;

    if (id) {
      // Fetch specific message by ID
      const message = await SiteSecurityMessage.findById(id);
      
      if (!message) {
        return res.status(404).json({
          success: false,
          message: 'Site security message not found'
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Site security message retrieved successfully',
        data: {
          id: message._id,
          goodMessage: message.goodMessage,
          badMessage: message.badMessage,
          createdAt: message.createdAt,
          updatedAt: message.updatedAt
        }
      });
    }

    // Fetch all messages if no ID is provided
    const messages = await SiteSecurityMessage.find();

    res.status(200).json({
      success: true,
      message: 'Site security messages retrieved successfully',
      data: messages.map(msg => ({
        id: msg._id,
        goodMessage: msg.goodMessage,
        badMessage: msg.badMessage,
        createdAt: msg.createdAt,
        updatedAt: msg.updatedAt
      }))
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error retrieving site security messages',
      error: error.message
    });
  }
};