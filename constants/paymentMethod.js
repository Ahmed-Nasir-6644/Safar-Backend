/**
 * PaymentMethod enum
 *
 * EASYPAISA   – digital QR payment via Easypaisa (demo only)
 * JAZZCASH    – digital QR payment via JazzCash  (demo only)
 * PAY_ON_STOP – pay in cash when boarding        (default)
 *
 * TODO: replace demo QR with real payment gateway
 */

const PaymentMethod = Object.freeze({
  EASYPAISA:   'easypaisa',
  JAZZCASH:    'jazzcash',
  PAY_ON_STOP: 'pay_on_stop',
});

/** All valid enum values as a Set – used for O(1) validation */
const VALID_PAYMENT_METHODS = new Set(Object.values(PaymentMethod));

/**
 * Return true if the given string is a valid PaymentMethod value.
 * @param {string} value
 * @returns {boolean}
 */
function isValidPaymentMethod(value) {
  return VALID_PAYMENT_METHODS.has(value);
}

module.exports = { PaymentMethod, VALID_PAYMENT_METHODS, isValidPaymentMethod };
