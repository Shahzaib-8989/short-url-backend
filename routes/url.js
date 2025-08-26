const express = require('express');
const { body, query, param } = require('express-validator');
const {
  createShortUrl,
  getUserUrls,
  getUrlAnalytics,
  updateUrl,
  deleteUrl
} = require('../controllers/urlController');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Validation rules
const createUrlValidation = [
  body('originalUrl')
    .trim()
    .notEmpty()
    .withMessage('Original URL is required')
    .isURL({
      protocols: ['http', 'https'],
      require_protocol: true
    })
    .withMessage('Please provide a valid URL with http:// or https://'),

  body('customCode')
    .optional()
    .trim()
    .isLength({ min: 4, max: 10 })
    .withMessage('Custom code must be between 4 and 10 characters')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Custom code can only contain letters, numbers, hyphens, and underscores'),

  body('title')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Title cannot exceed 200 characters'),

  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters'),

  body('expiryDate')
    .optional()
    .isISO8601()
    .withMessage('Please provide a valid date in ISO 8601 format')
    .custom((value) => {
      if (value && new Date(value) <= new Date()) {
        throw new Error('Expiry date must be in the future');
      }
      return true;
    }),

  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),

  body('tags.*')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Each tag must be between 1 and 50 characters')
];

const getUserUrlsValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),

  query('sortBy')
    .optional()
    .isIn(['createdAt', 'clicks', 'lastClicked', 'originalUrl', 'title'])
    .withMessage('Invalid sort field'),

  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Sort order must be asc or desc'),

  query('minClicks')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Minimum clicks must be a non-negative integer'),

  query('maxClicks')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Maximum clicks must be a non-negative integer')
];

const updateUrlValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid URL ID'),

  body('originalUrl')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Original URL is required')
    .isURL({
      protocols: ['http', 'https'],
      require_protocol: true
    })
    .withMessage('Please provide a valid URL with http:// or https://'),

  body('title')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Title cannot exceed 200 characters'),

  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters'),

  body('expiryDate')
    .optional()
    .custom((value) => {
      if (value === null || value === '') {
        return true; // Allow null/empty to remove expiry
      }
      if (!Date.parse(value)) {
        throw new Error('Please provide a valid date');
      }
      if (new Date(value) <= new Date()) {
        throw new Error('Expiry date must be in the future');
      }
      return true;
    }),

  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),

  body('tags.*')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Each tag must be between 1 and 50 characters'),

  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean value')
];

const mongoIdValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid URL ID')
];

// Apply auth middleware to all routes
router.use(auth);

// @route   POST /api/urls
// @desc    Create shortened URL
// @access  Private
router.post('/', createUrlValidation, createShortUrl);

// @route   GET /api/urls
// @desc    Get user's URLs with analytics
// @access  Private
router.get('/', getUserUrlsValidation, getUserUrls);

// @route   GET /api/urls/:id/analytics
// @desc    Get URL analytics
// @access  Private
router.get('/:id/analytics', mongoIdValidation, getUrlAnalytics);

// @route   PUT /api/urls/:id
// @desc    Update URL
// @access  Private
router.put('/:id', updateUrlValidation, updateUrl);

// @route   DELETE /api/urls/:id
// @desc    Delete URL
// @access  Private
router.delete('/:id', mongoIdValidation, deleteUrl);

module.exports = router;
