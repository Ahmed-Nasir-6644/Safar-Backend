/**
 * Ticket Service
 *
 * Handles ticket creation with optional payment method support.
 * Delegates payment simulation to paymentSimulationService.
 *
 * ⚠️  Payment processing is demo-only — no real money flows.
 *
 * TODO: replace demo QR with real payment gateway
 * TODO: add async payment confirmation
 * TODO: add webhook handler
 * TODO: add payment expiry
 */

const crypto = require('crypto');
const Ticket = require('../models/Ticket');
const { PaymentMethod, isValidPaymentMethod } = require('../constants/paymentMethod');
const { processPayment } = require('./paymentSimulationService');

/**
 * Generate a deterministic, unique ticket number.
 * Format: TKT-<timestamp>-<8-char hex>
 *
 * @returns {string}  e.g. "TKT-1708600000000-A1B2C3D4"
 */
function generateTicketNumber() {
  const timestamp = Date.now();
  const random    = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `TKT-${timestamp}-${random}`;
}

/**
 * Create a new ticket with payment simulation.
 *
 * @param {{
 *   userId?:        string,
 *   startStop:      string,
 *   endStop:        string,
 *   busSequence?:   string[],
 *   fare:           number,
 *   currency?:      string,
 *   paymentMethod?: string   one of PaymentMethod values; defaults to PAY_ON_STOP
 * }} params
 *
 * @returns {Promise<{
 *   ticketNumber: string,
 *   userId?:      string,
 *   startStop:    string,
 *   endStop:      string,
 *   busSequence:  string[],
 *   fare:         number,
 *   currency:     string,
 *   payment: {
 *     method:        string,
 *     status:        string,
 *     qrCodeImage?:  string,
 *     qrPayload?:    object
 *   },
 *   createdAt:    Date
 * }>}
 *
 * @throws {Error}  If paymentMethod is an unknown value
 */
async function createTicket({
  userId       = null,
  startStop,
  endStop,
  busSequence  = [],
  fare,
  currency     = 'PKR',
  paymentMethod = PaymentMethod.PAY_ON_STOP,
}) {
  // ── Validation ──────────────────────────────────────────────────────────
  if (!startStop || !endStop) {
    throw new Error('startStop and endStop are required');
  }
  if (typeof fare !== 'number' || fare < 0) {
    throw new Error('fare must be a non-negative number');
  }
  if (!isValidPaymentMethod(paymentMethod)) {
    throw new Error(
      `Invalid paymentMethod "${paymentMethod}". ` +
      `Allowed values: ${Object.values(PaymentMethod).join(', ')}`
    );
  }

  // ── Generate ticket number ───────────────────────────────────────────────
  const ticketNumber = generateTicketNumber();

  // ── Run payment simulation ───────────────────────────────────────────────
  const paymentResult = await processPayment(
    { ticketNumber, fare },
    paymentMethod
  );

  // ── Persist ──────────────────────────────────────────────────────────────
  const ticket = await Ticket.create({
    ticketNumber,
    userId:      userId || undefined,
    startStop,
    endStop,
    busSequence,
    fare,
    currency,
    payment:     paymentResult,
  });

  // ── Return plain object (keeps response contract stable) ─────────────────
  return {
    ticketNumber: ticket.ticketNumber,
    userId:       ticket.userId,
    startStop:    ticket.startStop,
    endStop:      ticket.endStop,
    busSequence:  ticket.busSequence,
    fare:         ticket.fare,
    currency:     ticket.currency,
    payment:      ticket.payment,
    createdAt:    ticket.createdAt,
  };
}

/**
 * Get a ticket by its ticket number.
 *
 * @param {string} ticketNumber
 * @returns {Promise<object|null>}
 */
async function getTicketByNumber(ticketNumber) {
  return Ticket.findOne({ ticketNumber }).lean();
}

/**
 * Get all tickets for a user.
 *
 * @param {string} userId
 * @returns {Promise<object[]>}
 */
async function getTicketsByUser(userId) {
  return Ticket.find({ userId }).sort({ createdAt: -1 }).lean();
}

module.exports = { createTicket, getTicketByNumber, getTicketsByUser, generateTicketNumber };
