const validator = require('validator');

// Custom validation functions
const isValidUrl = (url) => {
  try {
    new URL(url);
    return validator.isURL(url, {
      protocols: ['http', 'https'],
      require_protocol: true
    });
  } catch {
    return false;
  }
};

const isValidShortCode = (code) => {
  return /^[a-zA-Z0-9_-]+$/.test(code) &&
         code.length >= 4 &&
         code.length <= 10;
};

const isValidUsername = (username) => {
  return /^[a-zA-Z0-9_]+$/.test(username) &&
         username.length >= 3 &&
         username.length <= 20;
};

const isStrongPassword = (password) => {
  // At least 6 characters, one lowercase, one uppercase, one digit
  return password.length >= 6 &&
         /[a-z]/.test(password) &&
         /[A-Z]/.test(password) &&
         /\d/.test(password);
};

const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  return input.trim().replace(/[<>]/g, '');
};

const validatePagination = (page, limit) => {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
  return { page: pageNum, limit: limitNum };
};

const formatErrorResponse = (message, errors = null) => {
  return {
    success: false,
    message,
    ...(errors && { errors })
  };
};

const formatSuccessResponse = (message, data = null) => {
  return {
    success: true,
    message,
    ...(data && { data })
  };
};

module.exports = {
  isValidUrl,
  isValidShortCode,
  isValidUsername,
  isStrongPassword,
  sanitizeInput,
  validatePagination,
  formatErrorResponse,
  formatSuccessResponse
};
