const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const TempUser = require('../models/TempUser');
const RefreshToken = require('../models/RefreshToken');
const emailService = require('./emailService');

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
  async register(userData, options = {}) {
    try {
      const normalizedEmail = userData.email.toLowerCase().trim();

      // Check if user exists
      const existingUser = await User.findOne({ email: normalizedEmail });
      if (existingUser) {
        throw new Error('User with this email already exists');
      }

      // Replace any previous unverified signup for this email
      await TempUser.deleteMany({ email: normalizedEmail });

      const verificationToken = crypto.randomBytes(32).toString('hex');
      const verificationTokenHash = crypto
        .createHash('sha256')
        .update(verificationToken)
        .digest('hex');

      const tempUser = new TempUser({
        name: userData.name,
        email: normalizedEmail,
        password: userData.password,
        verificationToken: verificationTokenHash,
        verificationTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
      await tempUser.save();

      const backendBaseUrl = options.backendBaseUrl || process.env.BACKEND_URL || 'http://localhost:5000';
      const verificationLink = `${backendBaseUrl}/auth/verify-email?token=${verificationToken}`;

      await emailService.sendVerificationEmail({
        name: userData.name,
        email: normalizedEmail,
        verificationLink,
      });

      return {
        email: normalizedEmail,
        verificationRequired: true,
      };
    } catch (error) {
      console.error('❌ Registration Error:', error);
      throw new Error(`Registration failed: ${error.message}`);
    }
  }

  async verifyEmail(token) {
    try {
      const verificationTokenHash = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');

      const tempUser = await TempUser.findOne({
        verificationToken: verificationTokenHash,
        verificationTokenExpiresAt: { $gt: new Date() },
      });

      if (!tempUser) {
        throw new Error('Verification link is invalid or has expired');
      }

      const existingUser = await User.findOne({ email: tempUser.email });
      if (existingUser) {
        await TempUser.deleteOne({ _id: tempUser._id });
        return { verified: true, alreadyVerified: true };
      }

      const user = new User({
        name: tempUser.name,
        email: tempUser.email,
        password: tempUser.password,
      });
      await user.save();

      await TempUser.deleteOne({ _id: tempUser._id });

      return {
        verified: true,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
        },
      };
    } catch (error) {
      console.error('❌ Verify Email Error:', error);
      throw new Error(`Email verification failed: ${error.message}`);
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
