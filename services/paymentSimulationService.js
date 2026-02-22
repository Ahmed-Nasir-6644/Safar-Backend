/**
 * Payment Simulation Service
 *
 * Processes ticket payments in demo mode.
 * ⚠️  NO real money flows. NO external APIs are called.
 *
 * Supported payment methods:
 *   • pay_on_stop  → paymentStatus = "pending_manual"  (no QR)
 *   • easypaisa    → paymentStatus = "pending_qr"      (QR generated)
 *   • jazzcash     → paymentStatus = "pending_qr"      (QR generated)
 *
 * TODO: replace demo QR with real payment gateway
 * TODO: add async payment confirmation
 * TODO: add webhook handler
 * TODO: add payment expiry
 */

const { PaymentMethod } = require('../constants/paymentMethod');
const { generateTicketQR } = require('./qrCodeService');

/**
 * Process a ticket payment in simulation mode.
 *
 * @param {{ ticketNumber: string, fare: number }} ticket
 *   Minimal ticket object — only ticketNumber and fare are required.
 * @param {string} paymentMethod  One of the PaymentMethod enum values
 * @returns {Promise<{
 *   method:        string,
 *   status:        'pending_manual' | 'pending_qr',
 *   qrCodeImage?:  string,
 *   qrPayload?:    object
 * }>}
 */
async function processPayment(ticket, paymentMethod) {
  switch (paymentMethod) {

    case PaymentMethod.PAY_ON_STOP:
      // Cash payment at the stop — no QR needed
      return {
        method: PaymentMethod.PAY_ON_STOP,
        status: 'pending_manual',
      };

    case PaymentMethod.EASYPAISA:
    case PaymentMethod.JAZZCASH: {
      // Demo QR generation — deterministic, no external call
      const { qrCodeImage, qrPayload } = await generateTicketQR(
        ticket.ticketNumber,
        paymentMethod,
        ticket.fare
      );

      // DO NOT mark as paid here — payment confirmation happens later
      // TODO: add async payment confirmation
      // TODO: add webhook handler
      return {
        method:       paymentMethod,
        status:       'pending_qr',
        qrCodeImage,
        qrPayload,
      };
    }

    default:
      // Defensive fallback — caller should validate before reaching here
      return {
        method: PaymentMethod.PAY_ON_STOP,
        status: 'pending_manual',
      };
  }
}

module.exports = { processPayment };
