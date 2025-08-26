const Url = require('../models/Url');

// @desc    Redirect to original URL and track analytics
// @route   GET /:shortCode
// @access  Public
const redirectToOriginal = async(req, res) => {
  try {
    const { shortCode } = req.params;
    console.log(`🔗 Redirect request received for shortCode: ${shortCode}`, req.query.t ? `(cache-bust: ${req.query.t})` : '');

    // Check for validation errors first
    const { validationResult } = require('express-validator');
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log(`❌ Validation errors for ${shortCode}:`, errors.array());
      return res.status(400).json({
        success: false,
        message: 'Invalid short code format',
        errors: errors.array()
      });
    }

    // Find URL by short code - use lean() for better performance
    console.log(`🔍 Searching for URL with shortCode: ${shortCode}`);
    const url = await Url.findOne({
      shortCode,
      isActive: true
    }).lean();

    if (!url) {
      console.log(`❌ Short URL not found: ${shortCode}`);
      return res.status(404).json({
        success: false,
        message: 'Short URL not found'
      });
    }

    console.log(`✅ Found URL: ${url.originalUrl} for shortCode: ${shortCode}`);

    // Check if URL is expired
    if (url.expiryDate && new Date(url.expiryDate) < new Date()) {
      return res.status(410).json({
        success: false,
        message: 'This short URL has expired'
      });
    }

    // Extract analytics data from request
    const clickData = {
      ip: req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for']?.split(',')[0]?.trim(),
      userAgent: req.headers['user-agent'],
      referer: req.headers.referer || req.headers.referrer
    };

    // SYNCHRONOUSLY record click BEFORE redirecting (this ensures every redirect is counted)
    try {
      console.log(`📊 Recording click for ${shortCode} BEFORE redirect...`);

      // Re-fetch the document with full Mongoose functionality for the update
      const urlDoc = await Url.findById(url._id);
      if (urlDoc && urlDoc.isActive) {
        await urlDoc.incrementClicks(clickData);
        console.log(`✅ Click recorded for ${shortCode}, new count: ${urlDoc.clicks}`);
      } else {
        console.log(`⚠️ URL document not found or inactive for ${shortCode}`);
      }
    } catch (analyticsError) {
      console.error('❌ Analytics update failed:', analyticsError);
      // Still redirect even if analytics fail, but log the error
    }

    // Perform the redirect AFTER recording the click
    // Use 302 (temporary) and explicit no-cache headers to avoid browser caching the redirect
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Surrogate-Control': 'no-store'
    });

    console.log(`🔄 Redirecting ${shortCode} to: ${url.originalUrl}`);
    return res.redirect(302, url.originalUrl);

  } catch (error) {
    console.error('Redirect Error:', error);

    // In case of server error, return 500 instead of hanging
    res.status(500).json({
      success: false,
      message: 'Server error during redirect'
    });
  }
};

// @desc    Get URL info without redirecting (for preview)
// @route   GET /api/preview/:shortCode
// @access  Public
const getUrlPreview = async(req, res) => {
  try {
    const { shortCode } = req.params;

    const url = await Url.findOne({
      shortCode,
      isActive: true
    }).lean();

    if (!url) {
      return res.status(404).json({
        success: false,
        message: 'Short URL not found'
      });
    }

    // Check if URL is expired
    const isExpired = url.expiryDate && new Date(url.expiryDate) < new Date();

    res.json({
      success: true,
      data: {
        shortCode: url.shortCode,
        originalUrl: url.originalUrl,
        title: url.title || '',
        description: url.description || '',
        clicks: url.clicks,
        lastClicked: url.lastClicked,
        createdAt: url.createdAt,
        isExpired,
        expiryDate: url.expiryDate,
        qrCode: url.qrCode
      }
    });

  } catch (error) {
    console.error('Preview Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching URL preview'
    });
  }
};

// @desc    Get QR Code for short URL
// @route   GET /api/qr/:shortCode
// @access  Public
const getQRCode = async(req, res) => {
  try {
    const { shortCode } = req.params;

    const url = await Url.findOne({
      shortCode,
      isActive: true
    }).select('qrCode shortCode').lean();

    if (!url) {
      return res.status(404).json({
        success: false,
        message: 'Short URL not found'
      });
    }

    if (!url.qrCode) {
      return res.status(404).json({
        success: false,
        message: 'QR code not available for this URL'
      });
    }

    // Return QR code as image
    const base64Data = url.qrCode.replace(/^data:image\/png;base64,/, '');
    const imgBuffer = Buffer.from(base64Data, 'base64');

    res.set({
      'Content-Type': 'image/png',
      'Content-Length': imgBuffer.length,
      'Cache-Control': 'public, max-age=86400' // Cache for 24 hours
    });

    res.send(imgBuffer);

  } catch (error) {
    console.error('QR Code Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching QR code'
    });
  }
};

// @desc    Bulk redirect analytics (for high-traffic scenarios)
// @route   POST /api/analytics/bulk-clicks
// @access  Private (internal use)
const bulkUpdateClicks = async(req, res) => {
  try {
    // This endpoint can be used for batch processing of analytics
    // when dealing with very high traffic scenarios
    const { clicks } = req.body;

    if (!Array.isArray(clicks) || clicks.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid clicks data'
      });
    }

    // Group clicks by URL ID for efficient processing
    const clicksGrouped = clicks.reduce((acc, click) => {
      if (!acc[click.urlId]) {
        acc[click.urlId] = [];
      }
      acc[click.urlId].push(click);
      return acc;
    }, {});

    const updatePromises = Object.entries(clicksGrouped).map(async([urlId, urlClicks]) => {
      try {
        const url = await Url.findById(urlId);
        if (url && url.isActive) {
          // Process all clicks for this URL
          for (const clickData of urlClicks) {
            await url.incrementClicks(clickData);
          }
        }
      } catch (error) {
        console.error(`Error updating clicks for URL ${urlId}:`, error);
      }
    });

    await Promise.allSettled(updatePromises);

    res.json({
      success: true,
      message: `Processed ${clicks.length} clicks`,
      data: {
        totalClicks: clicks.length,
        urlsUpdated: Object.keys(clicksGrouped).length
      }
    });

  } catch (error) {
    console.error('Bulk Update Clicks Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during bulk update'
    });
  }
};

module.exports = {
  redirectToOriginal,
  getUrlPreview,
  getQRCode,
  bulkUpdateClicks
};
