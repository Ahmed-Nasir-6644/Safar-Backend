/**
 * SOS Email Service
 *
 * Sends emergency alert emails to a user's saved emergency contacts.
 * Reuses the existing SMTP transporter credentials from .env.
 *
 * SMTP env vars consumed:
 *   SMTP_HOST  – e.g. smtp.gmail.com
 *   SMTP_PORT  – e.g. 587
 *   SMTP_USER  – sender address
 *   SMTP_PASS  – app password / SMTP password
 */

'use strict';

const nodemailer = require('nodemailer');

/** Default message when the user does not supply a custom one */
const DEFAULT_SOS_MESSAGE =
  'I need emergency assistance. Please contact me immediately.';

/**
 * Build a Google Maps URL from lat/lng.
 * @param {number} lat
 * @param {number} lng
 * @returns {string}
 */
function buildMapUrl(lat, lng) {
  return `https://maps.google.com/?q=${lat},${lng}`;
}

/**
 * Build the plain-text body for the SOS email.
 * @param {object} params
 * @param {string} params.senderName   Display name of the user triggering SOS
 * @param {string} params.message      Custom or default SOS message
 * @param {number} params.lat
 * @param {number} params.lng
 * @param {string} params.mapUrl       Pre-built Google Maps URL
 * @param {string} params.timestamp    ISO timestamp string
 * @returns {string}
 */
function buildTextBody({ senderName, message, lat, lng, mapUrl, timestamp }) {
  return `
🚨 EMERGENCY SOS ALERT 🚨

${senderName} has triggered an emergency SOS alert.

Message:
"${message}"

Live Location:
Coordinates : ${lat}, ${lng}
Google Maps  : ${mapUrl}

Timestamp: ${timestamp}

---
This is an automated emergency alert from MetroMate.
If this was sent in error, please contact the app user directly.
  `.trim();
}

/**
 * Build the HTML body for the SOS email.
 * @param {object} params  Same as buildTextBody
 * @returns {string}
 */
function buildHtmlBody({ senderName, message, lat, lng, mapUrl, timestamp }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    body        { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 0; }
    .wrapper    { max-width: 600px; margin: 30px auto; background: #fff;
                  border-radius: 8px; overflow: hidden;
                  box-shadow: 0 2px 8px rgba(0,0,0,0.12); }
    .header     { background: #e53e3e; padding: 28px 24px; text-align: center; }
    .header h1  { color: #fff; margin: 0; font-size: 26px; letter-spacing: 1px; }
    .header p   { color: #fed7d7; margin: 8px 0 0; font-size: 14px; }
    .body       { padding: 28px 24px; }
    .alert-box  { background: #fff5f5; border-left: 4px solid #e53e3e;
                  padding: 14px 16px; border-radius: 4px; margin-bottom: 20px; }
    .alert-box p { margin: 0; color: #742a2a; font-size: 15px; line-height: 1.5; }
    .section    { margin-bottom: 20px; }
    .label      { font-size: 12px; font-weight: bold; text-transform: uppercase;
                  color: #718096; margin-bottom: 4px; }
    .value      { font-size: 15px; color: #2d3748; }
    .map-btn    { display: inline-block; margin-top: 10px;
                  background: #3182ce; color: #fff; padding: 10px 20px;
                  border-radius: 6px; text-decoration: none; font-size: 14px;
                  font-weight: bold; }
    .coords     { font-family: monospace; background: #edf2f7; padding: 4px 8px;
                  border-radius: 4px; font-size: 13px; color: #2d3748; }
    .footer     { background: #f7fafc; padding: 14px 24px; text-align: center;
                  font-size: 12px; color: #a0aec0; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>🚨 EMERGENCY SOS ALERT</h1>
      <p>MetroMate Emergency Notification</p>
    </div>
    <div class="body">
      <div class="alert-box">
        <p><strong>${senderName}</strong> has triggered an emergency SOS alert and may need immediate assistance.</p>
      </div>

      <div class="section">
        <div class="label">Message from ${senderName}</div>
        <div class="value">"${message}"</div>
      </div>

      <div class="section">
        <div class="label">Live Location</div>
        <div class="value">
          <span class="coords">${lat}, ${lng}</span><br/>
          <a class="map-btn" href="${mapUrl}" target="_blank">📍 View on Google Maps</a>
        </div>
      </div>

      <div class="section">
        <div class="label">Alert Triggered At</div>
        <div class="value">${timestamp}</div>
      </div>
    </div>
    <div class="footer">
      This is an automated emergency alert from the MetroMate app.<br/>
      If sent in error, contact the user directly.
    </div>
  </div>
</body>
</html>`;
}

// ── Lazy-initialised transporter (created once, reused) ─────────────────────
let _transporter = null;

function getTransporter() {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST || 'smtp.gmail.com',
      port:   Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return _transporter;
}

/**
 * Send a single SOS email to one emergency contact.
 *
 * @param {{
 *   to:          string,   recipient email
 *   toName:      string,   recipient display name
 *   senderName:  string,   user who triggered SOS
 *   message:     string,
 *   lat:         number,
 *   lng:         number,
 *   timestamp:   string
 * }} params
 *
 * @returns {Promise<{ success: boolean, messageId?: string, error?: string }>}
 */
async function sendSosEmail({ to, toName, senderName, message, lat, lng, timestamp }) {
  const mapUrl   = buildMapUrl(lat, lng);
  const textBody = buildTextBody({ senderName, message, lat, lng, mapUrl, timestamp });
  const htmlBody = buildHtmlBody({ senderName, message, lat, lng, mapUrl, timestamp });

  const mailOptions = {
    from:    `"MetroMate SOS" <${process.env.SMTP_USER}>`,
    to:      `"${toName}" <${to}>`,
    subject: `🚨 SOS Alert from ${senderName} – Emergency Assistance Needed`,
    text:    textBody,
    html:    htmlBody,
  };

  try {
    const info = await getTransporter().sendMail(mailOptions);
    console.log(
      `[SOS] ✅ Email sent | to: ${to} | from user: ${senderName} | ` +
      `msgId: ${info.messageId} | ts: ${timestamp}`
    );
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[SOS] ❌ Email failed | to: ${to} | error: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Send SOS emails to a list of emergency contacts.
 *
 * @param {{
 *   senderName:  string,
 *   message:     string,
 *   lat:         number,
 *   lng:         number,
 *   contacts:    Array<{ name: string, email: string }>
 * }} params
 *
 * @returns {Promise<Array<{
 *   name:      string,
 *   email:     string,
 *   success:   boolean,
 *   messageId?: string,
 *   error?:    string
 * }>>}
 */
async function sendSosToContacts({ senderName, message, lat, lng, contacts }) {
  const timestamp = new Date().toISOString();

  // Fire all emails concurrently — one failure does not block others
  const results = await Promise.all(
    contacts.map(async (contact) => {
      const result = await sendSosEmail({
        to:         contact.email,
        toName:     contact.name,
        senderName,
        message,
        lat,
        lng,
        timestamp,
      });
      return {
        name:      contact.name,
        email:     contact.email,
        ...result,
      };
    })
  );

  return results;
}

module.exports = { sendSosToContacts, DEFAULT_SOS_MESSAGE };
