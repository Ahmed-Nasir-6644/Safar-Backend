const jwt = require('jsonwebtoken');
const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');

class AuthService {
  // Generate Access Token
  generateAccessToken(userId) {
    return jwt.sign({ userId }, process.env.JWT_ACCESS_SECRET, {
      expiresIn: process.env.JWT_ACCESS_EXPIRE || '15m',
    });
  }

  // Generate Refresh Token
  generateRefreshToken(userId) {
    return jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET, {
      expiresIn: process.env.JWT_REFRESH_EXPIRE || '7d',
    });
  }

  // Register user
  async register(userData) {
    try {
      // Check if user exists
      const existingUser = await User.findOne({ email: userData.email });
      if (existingUser) {
        throw new Error('User with this email already exists');
      }

      // Create new user
      const user = new User(userData);
      await user.save();

      // Return only user data without tokens (user must login separately)
      return {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
        },
      };
    } catch (error) {
      console.error('❌ Registration Error:', error);
      throw new Error(`Registration failed: ${error.message}`);
    }
  }

  // Login user
  async login(email, password) {
    try {
      // Find user by email
      const user = await User.findOne({ email });
      if (!user) {
        throw new Error('Invalid email or password');
      }

      // Check password
      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        throw new Error('Invalid email or password');
      }

      // Generate tokens
      const accessToken = this.generateAccessToken(user._id);
      const refreshToken = this.generateRefreshToken(user._id);

      // Save refresh token to database
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      await RefreshToken.create({
        userId: user._id,
        token: refreshToken,
        expiresAt,
      });
      console.log('✅ User logged in:', user);
      return {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
        },
        accessToken,
        refreshToken,
      };
    } catch (error) {
      console.error('❌ Login Error:', error);
      throw new Error(`Login failed: ${error.message}`);
    }
  }

  // Refresh access token
  async refreshAccessToken(refreshToken) {
    try {
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

      // Check if refresh token exists in database
      const storedToken = await RefreshToken.findOne({
        token: refreshToken,
        userId: decoded.userId,
      });

      if (!storedToken) {
        throw new Error('Refresh token not found or revoked');
      }

      // Generate new access token
      const accessToken = this.generateAccessToken(decoded.userId);

      return { accessToken };
    } catch (error) {
      console.error('❌ Token Refresh Error:', error);
      throw new Error(`Token refresh failed: ${error.message}`);
    }
  }

  // Logout user
  async logout(refreshToken) {
    try {
      // Delete refresh token from database
      await RefreshToken.deleteOne({ token: refreshToken });
      return { message: 'Logout successful' };
    } catch (error) {
      console.error('❌ Logout Error:', error);
      throw new Error(`Logout failed: ${error.message}`);
    }
  }
}

module.exports = new AuthService();
