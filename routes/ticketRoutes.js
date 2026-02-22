/**
 * Ticket Routes
 *
 * POST   /tickets          → create ticket (public — guest booking allowed)
 * GET    /tickets/my       → get user's own tickets (authenticated)
 * GET    /tickets/:number  → get ticket by number (public)
 */

const express          = require('express');
const ticketController = require('../controllers/ticketController');
const authenticateToken = require('../middleware/auth');

const router = express.Router();

// Create a new ticket booking (with optional payment method)
router.post('/', ticketController.createTicket.bind(ticketController));

// Get all tickets for the authenticated user
router.get('/my', authenticateToken, ticketController.getMyTickets.bind(ticketController));

// Get a specific ticket by ticket number
router.get('/:ticketNumber', ticketController.getTicket.bind(ticketController));

module.exports = router;
