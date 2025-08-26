const Url = require('../models/Url');
const User = require('../models/User');
const QRCode = require('qrcode'); // We'll need to install this
const { validationResult } = require('express-validator');

// @desc    Create shortened URL
// @route   POST /api/urls
// @access  Private
const createShortUrl = async(req, res) => {
  try {
    console.log('🚀 createShortUrl - Request received');
    console.log('🔍 User object:', req.user ? `${req.user.username} (ID: ${req.user._id || req.user.id})` : 'NO_USER');
    console.log('🔍 req.user full object:', JSON.stringify(req.user, null, 2));

    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { originalUrl, customCode, title, description, expiryDate, tags } = req.body;

    // Ensure authenticated user is present
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    // Get userId from the authenticated user
    const userId = req.user._id || req.user.id;

    // Validate URL
    try {
      new URL(originalUrl);
    } catch (urlError) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid URL'
      });
    }

    // Atomic check and create to prevent race conditions for same URL
    const normalizedUrl = originalUrl.trim();

    let shortCode;

    // Handle custom short code
    if (customCode) {
      // Validate custom code format
      if (!/^[a-zA-Z0-9_-]+$/.test(customCode) || customCode.length < 4 || customCode.length > 10) {
        return res.status(400).json({
          success: false,
          message: 'Custom code must be 4-10 characters long and contain only letters, numbers, hyphens, and underscores'
        });
      }

      // Atomic check for custom code availability
      const existingCustomCode = await Url.findOne({ shortCode: customCode });
      if (existingCustomCode) {
        return res.status(400).json({
          success: false,
          message: 'Custom short code is already taken'
        });
      }
      shortCode = customCode;
    } else {
      // Generate unique short code
      shortCode = await Url.generateShortCode();
    }

    // Validate expiry date
    let parsedExpiryDate = null;
    if (expiryDate) {
      parsedExpiryDate = new Date(expiryDate);
      if (parsedExpiryDate <= new Date()) {
        return res.status(400).json({
          success: false,
          message: 'Expiry date must be in the future'
        });
      }
    }

    // Create URL document with race condition protection
    const urlData = {
      originalUrl: normalizedUrl,
      shortCode,
      userId,
      title: title?.trim() || '',
      description: description?.trim() || '',
      expiryDate: parsedExpiryDate,
      tags: tags ? tags.map(tag => tag.trim()).filter(tag => tag.length > 0) : []
    };

    try {
      // Atomic create with duplicate key protection
      const url = await Url.create(urlData);

      // If we reach here, URL was created successfully
      console.log(`✅ Created new URL: ${shortCode} for user ${userId}`);

      // Generate QR Code
      try {
        const qrCodeDataUrl = await QRCode.toDataURL(url.shortUrl);
        url.qrCode = qrCodeDataUrl;
        await url.save();
      } catch (qrError) {
        console.error('QR Code generation failed:', qrError);
        // Continue without QR code - not critical
      }

      return res.status(201).json({
        success: true,
        message: 'URL shortened successfully',
        data: {
          url: {
            id: url._id,
            originalUrl: url.originalUrl,
            shortCode: url.shortCode,
            shortUrl: url.shortUrl,
            title: url.title,
            description: url.description,
            clicks: url.clicks,
            expiryDate: url.expiryDate,
            qrCode: url.qrCode,
            tags: url.tags,
            createdAt: url.createdAt
          }
        }
      });

    } catch (error) {
      // Handle race conditions and duplicate keys
      if (error.code === 11000) {
        const duplicateField = Object.keys(error.keyPattern || {})[0];

        if (duplicateField === 'shortCode') {
          // Short code collision - this is very rare but possible
          console.log(`🔄 Short code collision detected: ${shortCode}, retrying...`);

          // Generate a new short code and retry once
          try {
            const newShortCode = await Url.generateShortCode();
            urlData.shortCode = newShortCode;
            const retryUrl = await Url.create(urlData);

            // Generate QR Code for retry
            try {
              const qrCodeDataUrl = await QRCode.toDataURL(retryUrl.shortUrl);
              retryUrl.qrCode = qrCodeDataUrl;
              await retryUrl.save();
            } catch (qrError) {
              console.error('QR Code generation failed on retry:', qrError);
            }

            return res.status(201).json({
              success: true,
              message: 'URL shortened successfully',
              data: {
                url: {
                  id: retryUrl._id,
                  originalUrl: retryUrl.originalUrl,
                  shortCode: retryUrl.shortCode,
                  shortUrl: retryUrl.shortUrl,
                  title: retryUrl.title,
                  description: retryUrl.description,
                  clicks: retryUrl.clicks,
                  expiryDate: retryUrl.expiryDate,
                  qrCode: retryUrl.qrCode,
                  tags: retryUrl.tags,
                  createdAt: retryUrl.createdAt
                }
              }
            });
          } catch (retryError) {
            console.error('Failed to create URL after retry:', retryError);
            return res.status(500).json({
              success: false,
              message: 'Failed to generate unique short code. Please try again.'
            });
          }
        } else {
          // Check if this user already has this URL (race condition resolution)
          const existingUrl = await Url.findOne({
            userId,
            originalUrl: normalizedUrl,
            isActive: true
          });

          if (existingUrl) {
            console.log(`🔄 Race condition detected - returning existing URL: ${existingUrl.shortCode}`);
            return res.status(200).json({
              success: true,
              message: 'URL already exists',
              data: {
                url: {
                  id: existingUrl._id,
                  originalUrl: existingUrl.originalUrl,
                  shortCode: existingUrl.shortCode,
                  shortUrl: existingUrl.shortUrl,
                  title: existingUrl.title,
                  description: existingUrl.description,
                  clicks: existingUrl.clicks,
                  expiryDate: existingUrl.expiryDate,
                  qrCode: existingUrl.qrCode,
                  tags: existingUrl.tags,
                  createdAt: existingUrl.createdAt
                }
              }
            });
          }
        }
      }

      throw error; // Re-throw if not a handled duplicate key error
    }


  } catch (error) {
    console.error('Create Short URL Error:', error);

    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => ({
        field: err.path,
        message: err.message
      }));

      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while creating short URL'
    });
  }
};

// @desc    Get user's URLs with analytics
// @route   GET /api/urls
// @access  Private
const getUserUrls = async(req, res) => {
  try {
    const userId = req.user.id;
    const {
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      search = '',
      minClicks = 0,
      maxClicks = null,
      tags = '',
      includeInactive = false
    } = req.query;

    // Build query
    const query = { userId };

    if (!includeInactive) {
      query.isActive = true;
      query.$or = [
        { expiryDate: null },
        { expiryDate: { $gt: new Date() } }
      ];
    }

    // Search filter
    if (search) {
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { originalUrl: { $regex: search, $options: 'i' } },
          { title: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          { shortCode: { $regex: search, $options: 'i' } }
        ]
      });
    }

    // Click filters
    if (minClicks > 0) {
      query.clicks = { $gte: parseInt(minClicks, 10) };
    }
    if (maxClicks !== null && maxClicks > 0) {
      query.clicks = { ...query.clicks, $lte: parseInt(maxClicks, 10) };
    }

    // Tags filter
    if (tags) {
      const tagArray = tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
      if (tagArray.length > 0) {
        query.tags = { $in: tagArray };
      }
    }

    // Pagination
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    // Sort options
    const validSortFields = ['createdAt', 'clicks', 'lastClicked', 'originalUrl', 'title'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const sortDir = sortOrder === 'asc' ? 1 : -1;

    // Execute query with pagination
    const [urls, totalCount] = await Promise.all([
      Url.find(query)
        .sort({ [sortField]: sortDir })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Url.countDocuments(query)
    ]);

    // Calculate analytics
    const totalClicks = urls.reduce((sum, url) => sum + url.clicks, 0);
    const activeUrls = urls.filter(url => url.isActive && (!url.expiryDate || url.expiryDate > new Date())).length;

    res.json({
      success: true,
      data: {
        urls: urls.map(url => ({
          id: url._id,
          originalUrl: url.originalUrl,
          shortCode: url.shortCode,
          shortUrl: `${process.env.BASE_URL || 'http://localhost:5001'}/${url.shortCode}`,
          title: url.title,
          description: url.description,
          clicks: url.clicks,
          lastClicked: url.lastClicked,
          isActive: url.isActive,
          expiryDate: url.expiryDate,
          qrCode: url.qrCode,
          tags: url.tags,
          clickRate: url.clickRate,
          createdAt: url.createdAt,
          updatedAt: url.updatedAt
        })),
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(totalCount / limitNum),
          totalCount,
          hasNextPage: pageNum < Math.ceil(totalCount / limitNum),
          hasPrevPage: pageNum > 1
        },
        analytics: {
          totalUrls: totalCount,
          activeUrls,
          inactiveUrls: totalCount - activeUrls,
          totalClicks
        }
      }
    });

  } catch (error) {
    console.error('Get User URLs Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching URLs'
    });
  }
};

// @desc    Get URL analytics
// @route   GET /api/urls/:id/analytics
// @access  Private
const getUrlAnalytics = async(req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const url = await Url.findOne({ _id: id, userId });

    if (!url) {
      return res.status(404).json({
        success: false,
        message: 'URL not found'
      });
    }

    // Calculate daily stats for last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentStats = url.dailyStats
      .filter(stat => stat.date >= thirtyDaysAgo)
      .sort((a, b) => a.date - b.date);

    // Calculate weekly and monthly totals
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const weeklyClicks = url.dailyStats
      .filter(stat => stat.date >= sevenDaysAgo)
      .reduce((sum, stat) => sum + stat.clicks, 0);

    const monthlyClicks = recentStats.reduce((sum, stat) => sum + stat.clicks, 0);

    // Recent clicks analysis
    const recentClicksAnalysis = {
      total: url.recentClicks.length,
      last24Hours: url.recentClicks.filter(click =>
        click.timestamp >= new Date(Date.now() - 24 * 60 * 60 * 1000)
      ).length,
      last7Days: url.recentClicks.filter(click =>
        click.timestamp >= sevenDaysAgo
      ).length
    };

    res.json({
      success: true,
      data: {
        url: {
          id: url._id,
          originalUrl: url.originalUrl,
          shortCode: url.shortCode,
          shortUrl: url.shortUrl,
          title: url.title,
          clicks: url.clicks,
          lastClicked: url.lastClicked,
          createdAt: url.createdAt
        },
        analytics: {
          totalClicks: url.clicks,
          weeklyClicks,
          monthlyClicks,
          clickRate: url.clickRate,
          recentClicks: recentClicksAnalysis,
          dailyStats: recentStats,
          topReferrers: url.recentClicks
            .filter(click => click.referer)
            .reduce((acc, click) => {
              const domain = new URL(click.referer).hostname;
              acc[domain] = (acc[domain] || 0) + 1;
              return acc;
            }, {}),
          isExpired: url.isExpired()
        }
      }
    });

  } catch (error) {
    console.error('Get URL Analytics Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching analytics'
    });
  }
};

// @desc    Update URL
// @route   PUT /api/urls/:id
// @access  Private
const updateUrl = async(req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { originalUrl, title, description, expiryDate, tags, isActive } = req.body;

    const url = await Url.findOne({ _id: id, userId });

    if (!url) {
      return res.status(404).json({
        success: false,
        message: 'URL not found'
      });
    }

    // Validate expiry date
    let parsedExpiryDate = url.expiryDate;
    if (expiryDate !== undefined) {
      if (expiryDate === null || expiryDate === '') {
        parsedExpiryDate = null;
      } else {
        parsedExpiryDate = new Date(expiryDate);
        if (parsedExpiryDate <= new Date()) {
          return res.status(400).json({
            success: false,
            message: 'Expiry date must be in the future'
          });
        }
      }
    }

    // Validate originalUrl if provided
    if (originalUrl !== undefined) {
      if (!originalUrl || !originalUrl.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Original URL is required'
        });
      }

      try {
        new URL(originalUrl);
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid URL'
        });
      }
    }

    // Update fields
    const updateData = {};
    if (originalUrl !== undefined) updateData.originalUrl = originalUrl.trim();
    if (title !== undefined) updateData.title = title?.trim() || '';
    if (description !== undefined) updateData.description = description?.trim() || '';
    if (expiryDate !== undefined) updateData.expiryDate = parsedExpiryDate;
    if (tags !== undefined) {
      updateData.tags = Array.isArray(tags)
        ? tags.map(tag => tag.trim()).filter(tag => tag.length > 0)
        : [];
    }
    if (isActive !== undefined) updateData.isActive = Boolean(isActive);

    const updatedUrl = await Url.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: 'URL updated successfully',
      data: {
        url: {
          id: updatedUrl._id,
          originalUrl: updatedUrl.originalUrl,
          shortCode: updatedUrl.shortCode,
          shortUrl: updatedUrl.shortUrl,
          title: updatedUrl.title,
          description: updatedUrl.description,
          clicks: updatedUrl.clicks,
          lastClicked: updatedUrl.lastClicked,
          isActive: updatedUrl.isActive,
          expiryDate: updatedUrl.expiryDate,
          qrCode: updatedUrl.qrCode,
          tags: updatedUrl.tags,
          createdAt: updatedUrl.createdAt,
          updatedAt: updatedUrl.updatedAt
        }
      }
    });

  } catch (error) {
    console.error('Update URL Error:', error);

    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => ({
        field: err.path,
        message: err.message
      }));

      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while updating URL'
    });
  }
};

// @desc    Delete URL
// @route   DELETE /api/urls/:id
// @access  Private
const deleteUrl = async(req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const url = await Url.findOne({ _id: id, userId });

    if (!url) {
      return res.status(404).json({
        success: false,
        message: 'URL not found'
      });
    }

    await Url.findByIdAndDelete(id);

    // Update user's URL count
    await User.findByIdAndUpdate(userId, { $inc: { urlCount: -1 } });

    res.json({
      success: true,
      message: 'URL deleted successfully'
    });

  } catch (error) {
    console.error('Delete URL Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting URL'
    });
  }
};

module.exports = {
  createShortUrl,
  getUserUrls,
  getUrlAnalytics,
  updateUrl,
  deleteUrl
};
