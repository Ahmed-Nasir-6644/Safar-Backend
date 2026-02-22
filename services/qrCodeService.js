/**
 * QR Code Service
 *
 * Generates deterministic, reproducible QR codes for bus ticket payments.
 * The QR payload is a canonicalised JSON string so the same inputs
 * always produce the same QR image.
 *
 * ⚠️  DEMO ONLY — no real payment gateway is involved.
 *
 * TODO: replace demo QR with real payment gateway
 * TODO: add payment expiry (e.g. QR valid for 10 minutes)
 * TODO: add async payment confirmation webhook
 */

const QRCode = require('qrcode');

/**
 * Build a deterministic, stable QR payload object.
 * Keys are always in the same order so JSON serialisation is identical
 * for the same inputs.
 *
 * @param {string} ticketNumber   Unique ticket identifier
 * @param {string} paymentMethod  "easypaisa" | "jazzcash"
 * @param {number} amount         Fare in PKR
 * @returns {{ type, ticketNo, method, amount }}
 */
function buildQRPayload(ticketNumber, paymentMethod, amount) {
  // Key order is explicit — do not reorder (determinism guarantee)
  return {
    type:     'bus_ticket_payment',
    ticketNo: ticketNumber,
    method:   paymentMethod,
    amount:   amount,
  };
}

/**
 * Generate a QR code image (base64 PNG data-URL) from the payload.
 * Uses qrcode library with fixed options for reproducibility.
 *
 * @param {object} payload  Plain object to encode as JSON
 * @returns {Promise<string>}  base64 PNG data-URL
 */
async function generateQRImage(payload) {
  // JSON.stringify with no replacer and no extra spaces → stable string
  const payloadString = JSON.stringify(payload);

  const base64DataURL = await QRCode.toDataURL(payloadString, {
    errorCorrectionLevel: 'M',
    type:    'image/png',
    margin:  2,
    width:   256,
    color: {
      dark:  '#000000',
      light: '#ffffff',
    },
  });

  return base64DataURL;
}

/**
 * Public API – generate a complete ticket QR code.
 *
 * @param {string} ticketNumber   Unique ticket number (e.g. "TKT-1234567890-ABCD")
 * @param {string} paymentMethod  "easypaisa" | "jazzcash"
 * @param {number} amount         Fare amount in PKR
 * @returns {Promise<{ qrCodeImage: string, qrPayload: object }>}
 */
async function generateTicketQR(ticketNumber, paymentMethod, amount) {
  const qrPayload   = buildQRPayload(ticketNumber, paymentMethod, amount);
  const qrCodeImage = await generateQRImage(qrPayload);

  return { qrCodeImage, qrPayload };
}

module.exports = { generateTicketQR, buildQRPayload };
