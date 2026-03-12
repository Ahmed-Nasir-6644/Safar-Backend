const express = require('express');
const routeFinderController = require('../controllers/routeFinderController');
const authenticateToken = require('../middleware/auth');

const router = express.Router();

// Initialize graph (call once on startup)
router.post('/init', routeFinderController.initializeGraph.bind(routeFinderController));

// Initialize graph and get all stops (combined - call this first)
router.get('/init-and-get-stops', routeFinderController.initAndGetAllStops.bind(routeFinderController));

// Find route between two stops (by ID)
router.post('/find', authenticateToken, routeFinderController.findRoute.bind(routeFinderController));

// Find route between two stops (by name) - MAIN ENDPOINT FOR FRONTEND
router.post('/find/by-name', authenticateToken, routeFinderController.findRouteByNames.bind(routeFinderController));

// Get authenticated user's route search history
router.get('/search-history', authenticateToken, routeFinderController.getSearchHistory.bind(routeFinderController));

// Save route search history for authenticated user
router.post('/search-history', authenticateToken, routeFinderController.saveSearchHistory.bind(routeFinderController));

// Save selected generated route as favorite for authenticated user
router.post('/favorite', authenticateToken, routeFinderController.saveFavoriteRoute.bind(routeFinderController));

// Get authenticated user's favorite routes
router.get('/favorite', authenticateToken, routeFinderController.getFavoriteRoutes.bind(routeFinderController));

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
