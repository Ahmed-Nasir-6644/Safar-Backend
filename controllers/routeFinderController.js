const routeFinderService = require('../services/routeFinderService');

class RouteFinderController {
  /**
   * Initialize the route graph
   */
  async initializeGraph(req, res) {
    try {
      await routeFinderService.initializeGraph();
      const stops = await routeFinderService.getAllStops();
      const stopNames = Array.isArray(stops)
        ? stops
            .map((stop) => stop?.stop_name)
            .filter((name) => typeof name === 'string' && name.trim().length > 0)
        : [];
      console.log('📍 /routes/init stop names', stopNames);
      res.status(200).json({
        success: true,
        message: `Route graph initialized successfully (${stopNames.length} stops)`,
        data: stopNames,
      });
    } catch (error) {
      console.error('❌ Initialize graph error:', error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * Find route between two stops (by ID)
   */
  async findRoute(req, res) {
    try {
      const { startStopId, endStopId } = req.body;

      if (!startStopId || !endStopId) {
        return res.status(400).json({
          success: false,
          message: 'startStopId and endStopId are required',
        });
      }

      const route = await routeFinderService.findRoute(startStopId, endStopId);

      res.status(200).json({
        success: true,
        message: 'Route found successfully',
        data: route,
      });
    } catch (error) {
      console.error('❌ Find route error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * Find route between two stops (by name)
   */
  async findRouteByNames(req, res) {
    try {
      const { startStopName, endStopName, maxRoutes } = req.body;

      if (!startStopName || !endStopName) {
        return res.status(400).json({
          success: false,
          message: 'startStopName and endStopName are required',
        });
      }

      const result = await routeFinderService.findRouteByNames(
        startStopName,
        endStopName,
        maxRoutes
      );

      res.status(200).json({
        success: true,
        message: 'Routes found successfully',
        data: result,
      });
    } catch (error) {
      console.error('❌ Find route by names error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * Find stop by name
   */
  async findStopByName(req, res) {
    try {
      const { stopName } = req.query;

      if (!stopName) {
        return res.status(400).json({
          success: false,
          message: 'stopName query parameter is required',
        });
      }

      const stop = await routeFinderService.findStopByName(stopName);

      res.status(200).json({
        success: true,
        message: 'Stop found',
        data: stop,
      });
    } catch (error) {
      console.error('❌ Find stop by name error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * Find nearby stops
   */
  async findNearby(req, res) {
    try {
      const { stopId, radiusKm = 5 } = req.body;

      if (!stopId) {
        return res.status(400).json({
          success: false,
          message: 'stopId is required',
        });
      }

      const nearby = await routeFinderService.findNearby(
        stopId,
        parseFloat(radiusKm)
      );

      res.status(200).json({
        success: true,
        message: `Found ${nearby.length} nearby stops`,
        data: nearby,
      });
    } catch (error) {
      console.error('❌ Find nearby error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * Get all stops
   */
  async getAllStops(req, res) {
    try {
      console.log('📍 Fetching all stops...');
      const stops = await routeFinderService.getAllStops();

      res.status(200).json({
        success: true,
        message: `Retrieved ${stops.length} stops`,
        data: stops,
      });
    } catch (error) {
      console.error('❌ Get all stops error:', error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * Search stops by name
   */
  async searchStops(req, res) {
    try {
      const { query } = req.query;

      if (!query) {
        return res.status(400).json({
          success: false,
          message: 'Search query is required',
        });
      }

      const stops = await routeFinderService.searchStops(query);

      res.status(200).json({
        success: true,
        message: `Found ${stops.length} stops matching "${query}"`,
        data: stops,
      });
    } catch (error) {
      console.error('❌ Search stops error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * Get graph statistics
   */
  async getStats(req, res) {
    try {
      const stats = await routeFinderService.getGraphStats();

      res.status(200).json({
        success: true,
        message: 'Graph statistics retrieved',
        data: stats,
      });
    } catch (error) {
      console.error('❌ Get stats error:', error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * Rebuild the graph
   */
  async rebuildGraph(req, res) {
    try {
      const result = await routeFinderService.rebuildGraph();

      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      console.error('❌ Rebuild graph error:', error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * Initialize graph and get all stops (combined endpoint)
   */
  async initAndGetAllStops(req, res) {
    try {
      console.log('📍 Initializing graph and fetching all stops...');
      await routeFinderService.initializeGraph();
      const stops = await routeFinderService.getAllStops();

      console.log(`✓ Sending ${stops.length} stops to frontend`);
      console.log('📋 All stops:', JSON.stringify(stops, null, 2));
      res.status(200).json({
        success: true,
        message: `Graph initialized and retrieved ${stops.length} stops`,
        data: stops,
      });
    } catch (error) {
      console.error('❌ Init and get all stops error:', error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
}

module.exports = new RouteFinderController();
