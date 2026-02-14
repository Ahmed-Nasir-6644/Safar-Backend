const mongoose = require('mongoose');
const dns = require('dns');

// Configure DNS to use Google's public DNS for better reliability
dns.setServers(['8.8.8.8', '8.8.4.4']);

const connectDB = async (retryCount = 0) => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/safar';
    
    console.log('Attempting MongoDB connection...');
    console.log('Connection string (without password):', mongoURI.replace(/:[^:]*@/, ':****@'));
    
    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 60000,
      socketTimeoutMS: 60000,
      connectTimeoutMS: 60000,
      retryWrites: true,
      retryReads: true,
      maxPoolSize: 10,
      minPoolSize: 5,
      family: 4, // Use IPv4
    });
    
    console.log('✓ MongoDB connected successfully');
  } catch (error) {
    console.error('✗ MongoDB connection failed:', error.message);
    
    if (retryCount < 5) {
      console.log(`Retrying connection attempt ${retryCount + 1}/5 in 5 seconds...`);
      setTimeout(() => connectDB(retryCount + 1), 5000);
    } else {
      console.error('\n❌ Max retries reached. Please try one of these solutions:');
      console.error('\n1. INSTALL MONGODB LOCALLY (Recommended):');
      console.error('   - Download: https://www.mongodb.com/try/download/community');
      console.error('   - Install and start MongoDB service');
      console.error('   - Update .env: MONGODB_URI=mongodb://localhost:27017/safar');
      console.error('\n2. FIX MONGODB ATLAS:');
      console.error('   - Go to MongoDB Atlas Console');
      console.error('   - Network Access: Add 0.0.0.0/0 to IP whitelist (already done)');
      console.error('   - Database: Verify username and password are correct');
      console.error('   - Clusters: Ensure cluster is running (not paused)');
      console.error('\n3. CHECK YOUR NETWORK:');
      console.error('   - Test DNS: nslookup cluster0.4gcdqhe.mongodb.net');
      console.error('   - Test connectivity: ping 8.8.8.8');
      process.exit(1);
    }
  }
};

module.exports = connectDB;
