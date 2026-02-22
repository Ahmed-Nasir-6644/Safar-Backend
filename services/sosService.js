/**
 * SOS Service
 *
 * Orchestrates the full SOS flow:
 *   1. Validate user
 *   2. Fetch emergency contacts
 *   3. Send emails via sosEmailService
 *   4. Return per-contact results
 */

'use strict';

const User             = require('../models/User');
const EmergencyContact = require('../models/EmergencyContact');
const { sendSosToContacts, DEFAULT_SOS_MESSAGE } = require('./sosEmailService');

/**
 * Trigger an SOS alert for a given user.
 *
 * @param {{
 *   userId:    string,
 *   message?:  string,
 *   location:  { lat: number, lng: number }
 * }} params
 *
 * @returns {Promise<{
 *   senderName:  string,
 *   message:     string,
 *   location:    { lat: number, lng: number },
 *   totalSent:   number,
 *   totalFailed: number,
 *   results:     Array<{ name, email, success, messageId?, error? }>
 * }>}
 *
 * @throws {Error}  INVALID_USER | NO_CONTACTS | validation errors
 */
async function triggerSOS({ userId, message, location }) {
  // ── 1. Validate user ─────────────────────────────────────────────────────
  const user = await User.findById(userId).select('name email').lean();
  if (!user) {
    const err = new Error(`User not found: ${userId}`);
    err.code  = 'INVALID_USER';
    throw err;
  }

  // ── 2. Resolve message ───────────────────────────────────────────────────
  const resolvedMessage = (message && message.trim()) ? message.trim() : DEFAULT_SOS_MESSAGE;

  // ── 3. Fetch emergency contacts ──────────────────────────────────────────
  const contacts = await EmergencyContact
    .find({ userId })
    .select('name email')
    .lean();

  if (!contacts || contacts.length === 0) {
    const err = new Error('No emergency contacts found for this user.');
    err.code  = 'NO_CONTACTS';
    throw err;
  }

  // ── 4. Send emails ───────────────────────────────────────────────────────
  const results = await sendSosToContacts({
    senderName: user.name,
    message:    resolvedMessage,
    lat:        location.lat,
    lng:        location.lng,
    contacts,
  });

  const totalSent   = results.filter(r => r.success).length;
  const totalFailed = results.filter(r => !r.success).length;

  console.log(
    `[SOS] Triggered by userId=${userId} (${user.name}) | ` +
    `contacts=${contacts.length} | sent=${totalSent} | failed=${totalFailed}`
  );

  return {
    senderName:  user.name,
    message:     resolvedMessage,
    location:    { lat: location.lat, lng: location.lng },
    totalSent,
    totalFailed,
    results,
  };
}

/**
 * Add an emergency contact for a user.
 * Rejects duplicate emails per user (enforced by DB index as well).
 *
 * @param {{ userId: string, name: string, email: string }} params
 * @returns {Promise<object>}  Saved contact document
 */
async function addEmergencyContact({ userId, name, email }) {
  // Verify user exists
  const user = await User.findById(userId).lean();
  if (!user) {
    const err = new Error(`User not found: ${userId}`);
    err.code  = 'INVALID_USER';
    throw err;
  }

  const contact = await EmergencyContact.create({ userId, name, email });
  return contact.toObject();
}

/**
 * Get all emergency contacts for a user.
 *
 * @param {string} userId
 * @returns {Promise<object[]>}
 */
async function getEmergencyContacts(userId) {
  return EmergencyContact.find({ userId }).sort({ createdAt: 1 }).lean();
}

/**
 * Delete an emergency contact by its _id (only if it belongs to userId).
 *
 * @param {string} contactId
 * @param {string} userId
 * @returns {Promise<boolean>}  true if deleted, false if not found
 */
async function deleteEmergencyContact(contactId, userId) {
  const result = await EmergencyContact.deleteOne({ _id: contactId, userId });
  return result.deletedCount === 1;
}

module.exports = {
  triggerSOS,
  addEmergencyContact,
  getEmergencyContacts,
  deleteEmergencyContact,
};
