const express = require('express');
const gtfsController = require('../controllers/gtfsController');

const router = express.Router();

// Load data into cache
router.post('/load', gtfsController.loadData.bind(gtfsController));

// Get all GTFS data
router.get('/all', gtfsController.getAllData.bind(gtfsController));

// Get statistics
router.get('/stats', gtfsController.getStats.bind(gtfsController));

// Get specific data type
router.get('/:dataType', gtfsController.getDataByType.bind(gtfsController));

// Search stops by name
router.get('/search/stops', gtfsController.searchStops.bind(gtfsController));

// Get routes for a specific stop
router.get('/routes/stop/:stopId', gtfsController.getRoutesForStop.bind(gtfsController));

// Get all routes
router.get('/', gtfsController.getRoutes.bind(gtfsController));

// Get all stops
router.get('/', gtfsController.getStops.bind(gtfsController));

// Export data to JSON
router.post('/export', gtfsController.exportData.bind(gtfsController));

module.exports = router;
