/**
 * EmergencyContact Model
 *
 * Stores emergency contacts for each user.
 * Mirrors the logical schema:  id | user_id | name | email
 */

const mongoose = require('mongoose');

const emergencyContactSchema = new mongoose.Schema(
  {
    userId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: true,
      index:    true,
    },
    name: {
      type:     String,
      required: true,
      trim:     true,
      maxlength: 100,
    },
    email: {
      type:     String,
      required: true,
      trim:     true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address'],
    },
  },
  { timestamps: true }
);

// Compound index: one user cannot add the same email twice
emergencyContactSchema.index({ userId: 1, email: 1 }, { unique: true });

module.exports = mongoose.model('EmergencyContact', emergencyContactSchema);
