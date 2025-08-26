const mongoose = require('mongoose');

const clickSchema = new mongoose.Schema({
  timestamp: {
    type: Date,
    default: Date.now
  },
  ip: {
    type: String,
    required: false
  },
  userAgent: {
    type: String,
    required: false
  },
  referer: {
    type: String,
    required: false
  }
}, { _id: false });

const urlSchema = new mongoose.Schema({
  originalUrl: {
    type: String,
    required: [true, 'Original URL is required'],
    trim: true,
    validate: {
      validator: function(url) {
        // Basic URL validation
        try {
          new URL(url);
          return true;
        } catch {
          return false;
        }
      },
      message: 'Please provide a valid URL'
    }
  },
  shortCode: {
    type: String,
    required: [true, 'Short code is required'],
    unique: true,
    trim: true,
    minlength: [4, 'Short code must be at least 4 characters'],
    maxlength: [10, 'Short code cannot exceed 10 characters'],
    match: [/^[a-zA-Z0-9_-]+$/, 'Short code can only contain letters, numbers, hyphens, and underscores']
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [false, 'User ID is required'],
    index: true
  },
  title: {
    type: String,
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters'],
    default: ''
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters'],
    default: ''
  },
  clicks: {
    type: Number,
    default: 0,
    min: 0
  },
  lastClicked: {
    type: Date,
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
  },
  expiryDate: {
    type: Date,
    default: null,
    validate: {
      validator: function(date) {
        return !date || date > new Date();
      },
      message: 'Expiry date must be in the future'
    }
  },
  qrCode: {
    type: String, // Base64 encoded QR code
    default: null
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: [50, 'Tag cannot exceed 50 characters']
  }],
  // Store recent clicks for analytics (limit to last 1000 for performance)
  recentClicks: {
    type: [clickSchema],
    default: [],
    validate: {
      validator: function(clicks) {
        return clicks.length <= 1000;
      },
      message: 'Cannot store more than 1000 recent clicks'
    }
  },
  // Aggregated daily statistics
  dailyStats: [{
    date: { type: Date, required: true },
    clicks: { type: Number, default: 0, min: 0 }
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Compound indexes for better query performance (shortCode unique handled by schema)
urlSchema.index({ userId: 1, createdAt: -1 });
urlSchema.index({ userId: 1, clicks: -1 });
urlSchema.index({ expiryDate: 1 }, { sparse: true });
// Prevent duplicate URLs per user (race condition protection)
urlSchema.index({ userId: 1, originalUrl: 1, isActive: 1 }, { unique: true });

// Virtual for the full short URL
urlSchema.virtual('shortUrl').get(function() {
  const baseUrl = process.env.BASE_URL || 'http://localhost:5001';
  return `${baseUrl}/${this.shortCode}`;
});

// Virtual for click rate (clicks per day since creation)
urlSchema.virtual('clickRate').get(function() {
  const daysSinceCreation = Math.max(1, Math.ceil((Date.now() - this.createdAt) / (1000 * 60 * 60 * 24)));
  return Math.round((this.clicks / daysSinceCreation) * 100) / 100;
});

// Post-save middleware to update URL count in User model
urlSchema.post('save', async function(doc) {
  if (this.isNew && doc.userId) {
    // Use setImmediate to avoid blocking
    setImmediate(async() => {
      try {
        await mongoose.model('User').findByIdAndUpdate(
          doc.userId,
          { $inc: { urlCount: 1 } }
        );
      } catch (error) {
        console.error('Error updating user URL count:', error);
      }
    });
  }
});

// Pre-remove middleware to update URL count in User model
urlSchema.pre('deleteOne', { document: true, query: false }, async function() {
  if (this.userId) {
    setImmediate(async() => {
      try {
        await mongoose.model('User').findByIdAndUpdate(
          this.userId,
          { $inc: { urlCount: -1 } }
        );
      } catch (error) {
        console.error('Error updating user URL count on delete:', error);
      }
    });
  }
});

// Method to check if URL is expired
urlSchema.methods.isExpired = function() {
  return this.expiryDate && this.expiryDate < new Date();
};

// Method to increment click count with analytics
urlSchema.methods.incrementClicks = async function(clickData = {}) {
  try {
    console.log(`🔢 Before increment: ${this.shortCode} has ${this.clicks} clicks`);

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Use atomic update to avoid version conflicts
    const updateData = {
      $inc: { clicks: 1 },
      $set: { lastClicked: now },
      $push: {
        recentClicks: {
          $each: [{
            timestamp: now,
            ip: clickData.ip,
            userAgent: clickData.userAgent,
            referer: clickData.referer
          }],
          $slice: -1000 // Keep only last 1000 clicks
        }
      }
    };

    // Handle daily stats atomically
    const todayStatsIndex = this.dailyStats.findIndex(stat =>
      stat.date.getTime() === today.getTime()
    );

    if (todayStatsIndex >= 0) {
      updateData.$inc[`dailyStats.${todayStatsIndex}.clicks`] = 1;
    } else {
      updateData.$push.dailyStats = {
        $each: [{ date: today, clicks: 1 }],
        $slice: -365 // Keep only last 365 days
      };
    }

    // Perform atomic update
    const result = await this.constructor.findByIdAndUpdate(
      this._id,
      updateData,
      { new: true, runValidators: true }
    );

    console.log(`🔢 After increment: ${this.shortCode} now has ${result.clicks} clicks`);

    // Update user's total clicks (non-blocking)
    setImmediate(async() => {
      try {
        await mongoose.model('User').findByIdAndUpdate(
          this.userId,
          { $inc: { totalClicks: 1 } }
        );
      } catch (userUpdateError) {
        console.error('Failed to update user total clicks:', userUpdateError);
      }
    });

    // Update this instance with new data
    Object.assign(this, result.toObject());

    console.log(`💾 Saved URL ${this.shortCode} with ${result.clicks} clicks`);
    return result;
  } catch (error) {
    console.error('❌ Error incrementing clicks:', error);
    throw error;
  }
};

// Static method to generate unique short code with better collision handling
urlSchema.statics.generateShortCode = async function(length = 6) {
  const characters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-';
  const maxAttempts = 50; // Increased attempts for better collision handling

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let shortCode = '';

    // Use crypto-strong randomness for better distribution
    if (typeof require !== 'undefined') {
      // Node.js environment
      try {
        const crypto = require('crypto');
        const randomBytes = crypto.randomBytes(length);
        for (let i = 0; i < length; i++) {
          shortCode += characters.charAt(randomBytes[i] % characters.length);
        }
      } catch (error) {
        // Fallback to Math.random if crypto is not available
        for (let i = 0; i < length; i++) {
          shortCode += characters.charAt(Math.floor(Math.random() * characters.length));
        }
      }
    } else {
      // Fallback to Math.random
      for (let i = 0; i < length; i++) {
        shortCode += characters.charAt(Math.floor(Math.random() * characters.length));
      }
    }

    // Check if shortCode already exists atomically
    const existing = await this.findOne({ shortCode });
    if (!existing) {
      return shortCode; // Found a unique code
    }

    // Continue to next attempt if code exists
  }

  // Final fallback: use timestamp + random
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  const fallbackCode = (timestamp + random).substring(0, Math.max(length, 8));

  // One final check for the fallback code
  const existingFallback = await this.findOne({ shortCode: fallbackCode });
  if (!existingFallback) {
    return fallbackCode;
  }

  throw new Error('Unable to generate unique short code after all attempts');
};

// Static method to find active URLs by user
urlSchema.statics.findActiveByUser = function(userId, options = {}) {
  const query = { userId, isActive: true };

  // Add expiry filter
  query.$or = [
    { expiryDate: null },
    { expiryDate: { $gt: new Date() } }
  ];

  return this.find(query, null, options).sort({ createdAt: -1 });
};

module.exports = mongoose.model('Url', urlSchema);
