/**
 * SOS Routes
 *
 * Base path (mounted in server.js): /api/sos
 *
 * Routes:
 *   POST   /api/sos                        – Trigger SOS alert         (authenticated)
 *   POST   /api/sos/contacts               – Add emergency contact      (authenticated)
 *   GET    /api/sos/contacts/:userId        – Get all contacts for user  (authenticated)
 *   DELETE /api/sos/contacts/:contactId     – Delete a contact           (authenticated)
 */

'use strict';

const express           = require('express');
const router            = express.Router();
const sosController     = require('../controllers/sosController');
const authenticateToken  = require('../middleware/auth');

// ── SOS Alert ──────────────────────────────────────────────────────────────
router.post('/', authenticateToken, (req, res) => sosController.triggerSOS(req, res));

// ── Emergency Contacts ─────────────────────────────────────────────────────
router.post(  '/contacts',           authenticateToken, (req, res) => sosController.addContact(req, res));
router.get(   '/contacts/:userId',   authenticateToken, (req, res) => sosController.getContacts(req, res));
router.delete('/contacts/:contactId',authenticateToken, (req, res) => sosController.deleteContact(req, res));

module.exports = router;
