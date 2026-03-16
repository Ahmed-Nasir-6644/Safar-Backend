const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const tempUserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    verificationToken: {
      type: String,
      required: true,
      index: true,
    },
    verificationTokenExpiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true, collection: 'temp_user' }
);

tempUserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }

  if (/^\$2[aby]\$\d{2}\$/.test(this.password)) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

module.exports = mongoose.model('TempUser', tempUserSchema);