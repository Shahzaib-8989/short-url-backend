const mongoose = require('mongoose');

const connectDB = async() => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/url-shortener';

    console.log('🔄 Attempting to connect to MongoDB...');
    console.log(`📍 MongoDB URI: ${mongoURI.replace(/\/\/.*:.*@/, '//***:***@')}`); // Hide credentials in logs

    // Simplified, compatible connection options
    const options = {
      // Timeout settings for cloud deployment
      connectTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      serverSelectionTimeoutMS: 30000,

      // Connection pool settings
      maxPoolSize: 10,
      minPoolSize: 2,

      // Disable buffering to prevent timeout errors
      bufferCommands: false,

      // Enable retries
      retryWrites: true,
      retryReads: true
    };

    // Set Mongoose settings
    mongoose.set('strictQuery', false);

    const conn = await mongoose.connect(mongoURI, options);

    console.log(`✅ MongoDB Connected Successfully!`);
    console.log(`📦 Host: ${conn.connection.host}`);
    console.log(`🗄️  Database: ${conn.connection.name}`);
    console.log(`🔌 Ready State: ${conn.connection.readyState}`);

    // Enhanced connection event handlers
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('📦 MongoDB disconnected');

      // Attempt to reconnect in production
      if (process.env.NODE_ENV === 'production') {
        console.log('🔄 Attempting to reconnect to MongoDB...');
        setTimeout(() => {
          mongoose.connect(mongoURI, options).catch(console.error);
        }, 5000);
      }
    });

    mongoose.connection.on('reconnected', () => {
      console.log('✅ MongoDB reconnected');
    });

    mongoose.connection.on('timeout', () => {
      console.error('❌ MongoDB connection timeout');
    });

    mongoose.connection.on('close', () => {
      console.log('📦 MongoDB connection closed');
    });

    // Graceful shutdown handlers
    const gracefulShutdown = async(signal) => {
      console.log(`📦 Received ${signal}. Closing MongoDB connection...`);
      try {
        await mongoose.connection.close();
        console.log('📦 MongoDB connection closed through app termination');
        process.exit(0);
      } catch (error) {
        console.error('❌ Error during MongoDB shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2')); // Nodemon restart

  } catch (error) {
    console.error('❌ Database connection failed:', error);

    // More detailed error logging for debugging
    if (error.name === 'MongoNetworkError') {
      console.error('🌐 Network error - Check your MongoDB connection string and network access');
    } else if (error.name === 'MongooseServerSelectionError') {
      console.error('🎯 Server selection error - MongoDB server might be down or unreachable');
    } else if (error.name === 'MongoParseError') {
      console.error('📝 Parse error - Check your MongoDB connection string format');
    } else if (error.name === 'MongoAuthenticationError') {
      console.error('🔐 Authentication error - Check your MongoDB credentials');
    }

    // In production, you might want to implement retry logic
    if (process.env.NODE_ENV === 'production') {
      console.log('🔄 Retrying connection in 10 seconds...');
      setTimeout(() => {
        connectDB();
      }, 10000);
    } else {
      process.exit(1);
    }
  }
};

module.exports = connectDB;
