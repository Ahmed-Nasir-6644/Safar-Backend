/**
 * SOS Controller
 *
 * Handles HTTP layer for SOS alerts and emergency contact management.
 */

'use strict';

const sosService = require('../services/sosService');

class SosController {

  // ── POST /api/sos ─────────────────────────────────────────────────────────
  /**
   * Trigger an SOS alert.
   *
   * Body:
   * {
   *   userId:    string   (required)
   *   message?:  string   (optional; defaults to standard message)
   *   location: {
   *     lat: number,      (required)
   *     lng: number       (required)
   *   }
   * }
   *
   * Response 200:
   * {
   *   success: true,
   *   message: "SOS alert sent to N contact(s)",
   *   data: {
   *     senderName, message, location,
   *     totalSent, totalFailed,
   *     results: [{ name, email, success, messageId?, error? }]
   *   }
   * }
   */
  async triggerSOS(req, res) {
    try {
      const { userId, message, location } = req.body;

      // ── Input validation ────────────────────────────────────────────────
      if (!userId || typeof userId !== 'string' || !userId.trim()) {
        return res.status(400).json({
          success: false,
          message: 'userId is required',
        });
      }

      if (!location || typeof location !== 'object') {
        return res.status(400).json({
          success: false,
          message: 'location object with lat and lng is required',
        });
      }

      const lat = Number(location.lat);
      const lng = Number(location.lng);

      if (Number.isNaN(lat) || Number.isNaN(lng)) {
        return res.status(400).json({
          success: false,
          message: 'location.lat and location.lng must be valid numbers',
        });
      }

      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return res.status(400).json({
          success: false,
          message: 'location.lat must be -90..90 and location.lng must be -180..180',
        });
      }

      // ── Trigger SOS ──────────────────────────────────────────────────────
      const result = await sosService.triggerSOS({
        userId:   userId.trim(),
        message,
        location: { lat, lng },
      });

      // Determine HTTP status:
      //  - all failed → 502 (upstream SMTP failures)
      //  - partial    → 207 Multi-Status
      //  - all ok     → 200
      let status = 200;
      if (result.totalSent === 0)                            status = 502;
      else if (result.totalFailed > 0)                       status = 207;

      return res.status(status).json({
        success: result.totalSent > 0,
        message: `SOS alert sent to ${result.totalSent} contact(s)` +
                 (result.totalFailed > 0 ? `, ${result.totalFailed} failed` : ''),
        data: result,
      });

    } catch (err) {
      console.error('❌ SOS trigger error:', err);

      if (err.code === 'INVALID_USER') {
        return res.status(404).json({ success: false, message: err.message });
      }
      if (err.code === 'NO_CONTACTS') {
        return res.status(422).json({ success: false, message: err.message });
      }

      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  // ── POST /api/sos/contacts ────────────────────────────────────────────────
  /**
   * Add an emergency contact for a user.
   *
   * Body: { userId, name, email }
   */
  async addContact(req, res) {
    try {
      const { userId, name, email } = req.body;

      if (!userId || !name || !email) {
        return res.status(400).json({
          success: false,
          message: 'userId, name, and email are required',
        });
      }

      if (!/^\S+@\S+\.\S+$/.test(email)) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid email address',
        });
      }

      const contact = await sosService.addEmergencyContact({
        userId: userId.trim(),
        name:   name.trim(),
        email:  email.trim().toLowerCase(),
      });

      return res.status(201).json({
        success: true,
        message: 'Emergency contact added successfully',
        data:    contact,
      });

    } catch (err) {
      console.error('❌ Add contact error:', err);

      if (err.code === 'INVALID_USER') {
        return res.status(404).json({ success: false, message: err.message });
      }
      // MongoDB duplicate key → same email already exists for this user
      if (err.code === 11000) {
        return res.status(409).json({
          success: false,
          message: 'This email is already registered as an emergency contact for this user',
        });
      }

      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  // ── GET /api/sos/contacts/:userId ─────────────────────────────────────────
  /**
   * Get all emergency contacts for a user.
   */
  async getContacts(req, res) {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({ success: false, message: 'userId is required' });
      }

      const contacts = await sosService.getEmergencyContacts(userId);

      return res.status(200).json({
        success: true,
        message: `Retrieved ${contacts.length} emergency contact(s)`,
        data:    contacts,
      });

    } catch (err) {
      console.error('❌ Get contacts error:', err);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  // ── DELETE /api/sos/contacts/:contactId ──────────────────────────────────
  /**
   * Delete an emergency contact.
   * Requires userId in the body for ownership verification.
   */
  async deleteContact(req, res) {
    try {
      const { contactId } = req.params;
      const { userId }    = req.body;

      if (!contactId || !userId) {
        return res.status(400).json({
          success: false,
          message: 'contactId (param) and userId (body) are required',
        });
      }

      const deleted = await sosService.deleteEmergencyContact(contactId, userId);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: 'Contact not found or does not belong to this user',
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Emergency contact deleted successfully',
      });

    } catch (err) {
      console.error('❌ Delete contact error:', err);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
}

module.exports = new SosController();
