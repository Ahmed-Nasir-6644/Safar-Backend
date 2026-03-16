const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    // Create reusable transporter
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  /**
   * Send signup verification email
   * @param {Object} verificationData - Verification email data
   * @param {string} verificationData.name - User name
   * @param {string} verificationData.email - User email
   * @param {string} verificationData.verificationLink - Link to verify account
   * @returns {Promise<Object>}
   */
  async sendVerificationEmail(verificationData) {
    const { name, email, verificationLink } = verificationData;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f9f9f9;
            border: 1px solid #ddd;
            border-radius: 5px;
          }
          .content {
            background-color: white;
            padding: 20px;
            border-radius: 5px;
          }
          .btn {
            display: inline-block;
            margin-top: 18px;
            padding: 12px 18px;
            background-color: #f97316;
            color: #fff !important;
            text-decoration: none;
            border-radius: 6px;
            font-weight: bold;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="content">
            <h2>Verify your MetroMate account</h2>
            <p>Hi ${name},</p>
            <p>Thanks for signing up. Please verify your email address to activate your account.</p>
            <a class="btn" href="${verificationLink}">Verify Email</a>
            <p style="margin-top:16px;">If the button does not work, copy and paste this link in your browser:</p>
            <p>${verificationLink}</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const textContent = `
Hi ${name},

Thanks for signing up to MetroMate.
Please verify your email using this link:
${verificationLink}
    `;

    const mailOptions = {
      from: `"MetroMate" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Verify your MetroMate account',
      text: textContent,
      html: htmlContent,
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (error) {
      console.error('Verification email sending error:', error);
      throw new Error('Failed to send verification email');
    }
  }

  /**
   * Send contact form email
   * @param {Object} contactData - Contact form data
   * @param {string} contactData.fullName - User's full name
   * @param {string} contactData.emailAddress - User's email address
   * @param {string} contactData.message - User's message
   * @returns {Promise<Object>} - Email send result
   */
  async sendContactEmail(contactData) {
    const { fullName, emailAddress, message } = contactData;

    // Email HTML template
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f9f9f9;
            border: 1px solid #ddd;
            border-radius: 5px;
          }
          .header {
            background-color: #007bff;
            color: white;
            padding: 20px;
            text-align: center;
            border-radius: 5px 5px 0 0;
          }
          .content {
            background-color: white;
            padding: 20px;
            border-radius: 0 0 5px 5px;
          }
          .field {
            margin-bottom: 15px;
          }
          .label {
            font-weight: bold;
            color: #555;
          }
          .value {
            margin-top: 5px;
            padding: 10px;
            background-color: #f4f4f4;
            border-left: 3px solid #007bff;
          }
          .footer {
            margin-top: 20px;
            text-align: center;
            font-size: 12px;
            color: #888;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>New Contact Form Submission</h2>
            <p>MetroMate Support</p>
          </div>
          <div class="content">
            <div class="field">
              <div class="label">From:</div>
              <div class="value">${fullName}</div>
            </div>
            <div class="field">
              <div class="label">Email Address:</div>
              <div class="value">${emailAddress}</div>
            </div>
            <div class="field">
              <div class="label">Message:</div>
              <div class="value">${message}</div>
            </div>
          </div>
          <div class="footer">
            <p>This email was sent from the MetroMate contact form.</p>
            <p>Reply directly to this email to respond to ${fullName}.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Plain text version
    const textContent = `
New Contact Form Submission - MetroMate

From: ${fullName}
Email: ${emailAddress}

Message:
${message}

---
This email was sent from the MetroMate contact form.
Reply directly to this email to respond to ${fullName}.
    `;

    // Mail options - Send from SMTP_USER to SMTP_USER itself
    const mailOptions = {
      from: `"MetroMate Contact Form" <${process.env.SMTP_USER}>`,
      to: process.env.SUPPORT_EMAIL,
      replyTo: emailAddress,
      subject: `Suggestion/Message from ${fullName}`,
      text: textContent,
      html: htmlContent,
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log('Email sent successfully:', info.messageId);
      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (error) {
      console.error('Email sending error:', error);
      throw new Error('Failed to send email');
    }
  }

  /**
   * Verify SMTP connection
   * @returns {Promise<boolean>}
   */
  async verifyConnection() {
    try {
      await this.transporter.verify();
      console.log('SMTP server is ready to send emails');
      return true;
    } catch (error) {
      console.error('SMTP verification failed:', error);
      return false;
    }
  }
}

module.exports = new EmailService();
