const mongoose = require('mongoose');

const routeSearchSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    startingPoint: {
      type: String,
      required: true,
      trim: true,
    },
    destination: {
      type: String,
      required: true,
      trim: true,
    },
    startStopId: {
      type: String,
      trim: true,
    },
    endStopId: {
      type: String,
      trim: true,
    },
    searchType: {
      type: String,
      enum: ['by-id', 'by-name'],
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('RouteSearch', routeSearchSchema);