const express = require('express');
const { param } = require('express-validator');
const {
  redirectToOriginal,
  getUrlPreview,
  getQRCode,
  bulkUpdateClicks
} = require('../controllers/redirectController');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Validation rules
const shortCodeValidation = [
  param('shortCode')
    .trim()
    .notEmpty()
    .withMessage('Short code is required')
    .isLength({ min: 4, max: 10 })
    .withMessage('Short code must be between 4 and 10 characters')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Short code can only contain letters, numbers, hyphens, and underscores')
];

// @route   GET /:shortCode
// @desc    Redirect to original URL and track analytics
// @access  Public
router.get('/:shortCode', redirectToOriginal);

// @route   GET /api/preview/:shortCode
// @desc    Get URL info without redirecting (for preview)
// @access  Public
router.get('/api/preview/:shortCode', shortCodeValidation, getUrlPreview);

// @route   GET /api/qr/:shortCode
// @desc    Get QR Code for short URL
// @access  Public
router.get('/api/qr/:shortCode', shortCodeValidation, getQRCode);

// @route   POST /api/analytics/bulk-clicks
// @desc    Bulk update clicks (internal use for high-traffic scenarios)
// @access  Private
router.post('/api/analytics/bulk-clicks', auth, bulkUpdateClicks);

module.exports = router;
