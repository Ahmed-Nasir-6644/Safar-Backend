const authService = require('../services/authService');

class AuthController {
  // Register user
  async register(req, res) {
    try {
      const { name, email, password } = req.body;

      // Validation
      if (!name || !email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Name, email, and password are required',
        });
      }

      const result = await authService.register({
        name,
        email,
        password,
      }, {
        backendBaseUrl: `${req.protocol}://${req.get('host')}`,
      });

      res.status(201).json({
        success: true,
        message: 'Signup successful. Please verify your email address.',
        data: result,
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Verify email for signup
  async verifyEmail(req, res) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const token = req.query.token;
    const verificationRedirectBase = `${frontendUrl}/#/`;

    if (!token) {
      return res.redirect(`${verificationRedirectBase}?emailVerified=failed`);
    }

    try {
      await authService.verifyEmail(token);
      return res.redirect(`${verificationRedirectBase}?emailVerified=success`);
    } catch (error) {
      console.error('❌ Email verification failed:', error.message);
      return res.redirect(`${verificationRedirectBase}?emailVerified=failed`);
    }
  }

  // Login user
  async login(req, res) {
    try {
      const { email, password } = req.body;

      // Validation
      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Email and password are required',
        });
      }

      const result = await authService.login(email, password);

      res.status(200).json({
        success: true,
        message: 'Login successful',
        data: result,
      });
    } catch (error) {
      res.status(401).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Refresh access token
  async refreshToken(req, res) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          message: 'Refresh token is required',
        });
      }

      const result = await authService.refreshAccessToken(refreshToken);

      res.status(200).json({
        success: true,
        message: 'Token refreshed successfully',
        data: result,
      });
    } catch (error) {
      res.status(403).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Logout user
  async logout(req, res) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          message: 'Refresh token is required',
        });
      }

      await authService.logout(refreshToken);

      res.status(200).json({
        success: true,
        message: 'Logout successful',
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }
}

module.exports = new AuthController();
