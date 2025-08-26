const express = require('express');

const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Import routes
const authRoutes = require('./routes/auth');
const urlRoutes = require('./routes/url');
const redirectRoutes = require('./routes/redirect');

// Import database config
const connectDB = require('./config/database');

const app = express();

// Connect to database
connectDB();

// Middleware - CORS configuration for production
// const allowedOrigins = [
//   'http://localhost:3000',
//   'https://short-url-frontend-ebon.vercel.app',
//   process.env.CLIENT_URL
// ].filter(Boolean);

app.use(cors());

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Database connection middleware
app.use((req, res, next) => {
  if (req.path.startsWith('/api/') && req.path !== '/api/health') {
    const dbState = require('mongoose').connection.readyState;
    if (dbState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database connection unavailable',
        error: 'Service temporarily unavailable'
      });
    }
  }
  next();
});

// Enhanced health check endpoint with database status
app.get('/api/health', (req, res) => {
  const mongoose = require('mongoose');
  const dbState = mongoose.connection.readyState;

  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };

  const healthStatus = {
    status: dbState === 1 ? 'OK' : 'WARNING',
    message: 'URL Shortener API',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    database: {
      status: states[dbState] || 'unknown',
      readyState: dbState,
      host: mongoose.connection.host || 'unknown',
      name: mongoose.connection.name || 'unknown'
    },
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.version
  };

  const statusCode = dbState === 1 ? 200 : 503;
  res.status(statusCode).json(healthStatus);
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/urls', urlRoutes);

// Redirect routes LAST (catch-all for short codes)
app.use('/', redirectRoutes);

// Error handling middleware
app.use((err, req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
});

module.exports = app;
