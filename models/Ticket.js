/**
 * Ticket Model
 *
 * Stores bus ticket bookings. The `payment` sub-document is
 * always present but `qrCodeImage` and `qrPayload` are only
 * populated for digital payment methods.
 */

const mongoose = require('mongoose');
const { PaymentMethod } = require('../constants/paymentMethod');

const paymentSubSchema = new mongoose.Schema(
  {
    method: {
      type:     String,
      enum:     Object.values(PaymentMethod),
      required: true,
      default:  PaymentMethod.PAY_ON_STOP,
    },
    status: {
      type:     String,
      enum:     ['pending_manual', 'pending_qr', 'paid', 'cancelled'],
      required: true,
      default:  'pending_manual',
    },
    qrCodeImage: {
      type:    String,
      default: null,
    },
    qrPayload: {
      type:    mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  { _id: false }
);

const ticketSchema = new mongoose.Schema(
  {
    ticketNumber: {
      type:     String,
      required: true,
      unique:   true,
      index:    true,
    },
    userId: {
      type:  mongoose.Schema.Types.ObjectId,
      ref:   'User',
      index: true,
    },
    startStop: {
      type:     String,
      required: true,
    },
    endStop: {
      type:     String,
      required: true,
    },
    busSequence: {
      type:    [String],
      default: [],
    },
    fare: {
      type:     Number,
      required: true,
      min:      0,
    },
    currency: {
      type:    String,
      default: 'PKR',
    },
    payment: {
      type:     paymentSubSchema,
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Ticket', ticketSchema);
