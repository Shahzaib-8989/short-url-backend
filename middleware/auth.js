const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware to authenticate and get user from token
const auth = async(req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.header('Authorization');
    console.log('🔍 AUTH DEBUG - Header received:', !!authHeader);

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('❌ AUTH DEBUG - Invalid auth header format');
      return res.status(401).json({
        success: false,
        message: 'No token provided, authorization denied'
      });
    }

    // Extract token from "Bearer TOKEN"
    const token = authHeader.substring(7);
    console.log('🔍 AUTH DEBUG - Token length:', token.length);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided, authorization denied'
      });
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production');
      console.log('✅ AUTH DEBUG - Token decoded, userId:', decoded.id);

      // Get user from token
      const user = await User.findById(decoded.id).select('-password');
      console.log('🔍 AUTH DEBUG - User found:', !!user, user ? user.username : 'NOT_FOUND');

      if (!user) {
        console.log('❌ AUTH DEBUG - User not found in database');
        return res.status(401).json({
          success: false,
          message: 'Token is not valid - user not found'
        });
      }

      if (!user.isActive) {
        console.log('❌ AUTH DEBUG - User account deactivated');
        return res.status(401).json({
          success: false,
          message: 'Account is deactivated'
        });
      }

      // Add user to request object
      req.user = user;
      console.log('✅ AUTH DEBUG - User set on request, proceeding to next()');
      next();

    } catch (jwtError) {
      console.error('JWT Verification Error:', jwtError.message);

      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token has expired'
        });
      }

      if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          message: 'Invalid token'
        });
      }

      return res.status(401).json({
        success: false,
        message: 'Token verification failed'
      });
    }

  } catch (error) {
    console.error('Auth Middleware Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error in authentication'
    });
  }
};

// Middleware for optional authentication (doesn't fail if no token)
const optionalAuth = async(req, res, next) => {
  try {
    const authHeader = req.header('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.user = null;
      return next();
    }

    const token = authHeader.substring(7);

    if (!token) {
      req.user = null;
      return next();
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production');
      const user = await User.findById(decoded.id).select('-password');

      if (user && user.isActive) {
        req.user = user;
      } else {
        req.user = null;
      }

    } catch (jwtError) {
      req.user = null;
    }

    next();

  } catch (error) {
    console.error('Optional Auth Middleware Error:', error);
    req.user = null;
    next();
  }
};

// Utility function to generate JWT token
const generateToken = (userId) => {
  return jwt.sign(
    { id: userId },
    process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production',
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
};

// Utility function to verify JWT token
const verifyToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production');
};

module.exports = {
  auth,
  optionalAuth,
  generateToken,
  verifyToken
};
