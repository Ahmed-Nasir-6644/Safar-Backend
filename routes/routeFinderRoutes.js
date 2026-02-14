const express = require('express');
const routeFinderController = require('../controllers/routeFinderController');

const router = express.Router();

// Initialize graph (call once on startup)
router.post('/init', routeFinderController.initializeGraph.bind(routeFinderController));

// Initialize graph and get all stops (combined - call this first)
router.get('/init-and-get-stops', routeFinderController.initAndGetAllStops.bind(routeFinderController));

// Find route between two stops (by ID)
router.post('/find', routeFinderController.findRoute.bind(routeFinderController));

// Find route between two stops (by name) - MAIN ENDPOINT FOR FRONTEND
router.post('/find/by-name', routeFinderController.findRouteByNames.bind(routeFinderController));

// Find stop by name
router.get('/stop/by-name', routeFinderController.findStopByName.bind(routeFinderController));

// Find nearby stops (POST with body params)
router.post('/nearby', routeFinderController.findNearby.bind(routeFinderController));

// Get all stops
router.get('/stops', routeFinderController.getAllStops.bind(routeFinderController));

// Search stops by name (GET with query param)
router.get('/search', routeFinderController.searchStops.bind(routeFinderController));

// Get graph statistics
router.get('/stats', routeFinderController.getStats.bind(routeFinderController));

// Rebuild graph
router.post('/rebuild', routeFinderController.rebuildGraph.bind(routeFinderController));

module.exports = router;
