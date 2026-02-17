const emailService = require('../services/emailService');

/**
 * Validate email format
 * @param {string} email - Email address to validate
 * @returns {boolean}
 */
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Handle contact form submission
 * POST /contact
 */
const submitContactForm = async (req, res) => {
  try {
    const { fullName, emailAddress, message } = req.body;

    // Validation: Check if all required fields are present
    if (!fullName || !emailAddress || !message) {
      return res.status(400).json({
        error: 'All fields are required',
        details: {
          fullName: !fullName ? 'Full name is required' : null,
          emailAddress: !emailAddress ? 'Email address is required' : null,
          message: !message ? 'Message is required' : null,
        },
      });
    }

    // Validate field types
    if (typeof fullName !== 'string' || typeof emailAddress !== 'string' || typeof message !== 'string') {
      return res.status(400).json({
        error: 'Invalid data types',
        details: 'All fields must be strings',
      });
    }

    // Trim whitespace
    const trimmedFullName = fullName.trim();
    const trimmedEmailAddress = emailAddress.trim();
    const trimmedMessage = message.trim();

    // Check if fields are not empty after trimming
    if (trimmedFullName === '' || trimmedEmailAddress === '' || trimmedMessage === '') {
      return res.status(400).json({
        error: 'All fields must contain valid content',
        details: 'Fields cannot be empty or contain only whitespace',
      });
    }

    // Validate email format
    if (!isValidEmail(trimmedEmailAddress)) {
      return res.status(400).json({
        error: 'Invalid email address',
        details: 'Please provide a valid email address',
      });
    }

    // Validate field lengths
    if (trimmedFullName.length > 100) {
      return res.status(400).json({
        error: 'Full name is too long',
        details: 'Full name must be 100 characters or less',
      });
    }

    if (trimmedMessage.length > 5000) {
      return res.status(400).json({
        error: 'Message is too long',
        details: 'Message must be 5000 characters or less',
      });
    }

    if (trimmedMessage.length < 10) {
      return res.status(400).json({
        error: 'Message is too short',
        details: 'Message must be at least 10 characters',
      });
    }

    // Send email
    await emailService.sendContactEmail({
      fullName: trimmedFullName,
      emailAddress: trimmedEmailAddress,
      message: trimmedMessage,
    });

    // Success response
    res.status(200).json({
      message: 'Email sent successfully',
      details: 'Thank you for contacting MetroMate. We will get back to you soon.',
    });

  } catch (error) {
    console.error('Contact form submission error:', error);

    // Check if it's an email sending error
    if (error.message === 'Failed to send email') {
      return res.status(500).json({
        error: 'Failed to send email',
        details: 'We encountered an issue while sending your message. Please try again later or contact us directly.',
      });
    }

    // Generic error response
    res.status(500).json({
      error: 'Internal server error',
      details: 'An unexpected error occurred. Please try again later.',
    });
  }
};

module.exports = {
  submitContactForm,
};
