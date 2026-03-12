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
      const userId = req.user?.userId;

      if (!startStopId || !endStopId) {
        return res.status(400).json({
          success: false,
          message: 'startStopId and endStopId are required',
        });
      }

      const route = await routeFinderService.findRoute(startStopId, endStopId);
      const responsePayload = {
        success: true,
        message: 'Route found successfully',
        data: route,
      };
      console.log('📤 Sending /routes/find response to frontend:', JSON.stringify(responsePayload, null, 2));

      res.status(200).json(responsePayload);
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
      const userId = req.user?.userId;

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
      const responsePayload = {
        success: true,
        message: 'Routes found successfully',
        data: result,
      };
      console.log('📤 Sending /routes/find/by-name response to frontend:', JSON.stringify(responsePayload, null, 2));

      res.status(200).json(responsePayload);
    } catch (error) {
      console.error('❌ Find route by names error:', error);
      const isApiError =
        error.message.includes('External API') ||
        error.message.includes('ENOTFOUND') ||
        error.message.includes('ECONNREFUSED') ||
        error.message.includes('ETIMEDOUT') ||
        error.message.includes('FUNCTION_INVOCATION_TIMEOUT') ||
        error.message.includes('504') ||
        error.message.includes('503') ||
        error.message.includes('502');
      res.status(400).json({
        success: false,
        message: isApiError ? 'Routing error' : error.message,
      });
    }
  }

  /**
   * Get route search history for authenticated user
   */
  async getSearchHistory(req, res) {
    try {
      const userId = req.user?.userId;

      const history = await routeFinderService.getRouteSearchHistory(userId);

      res.status(200).json({
        success: true,
        message: `Retrieved ${history.length} search history item(s)`,
        data: history,
      });
    } catch (error) {
      console.error('❌ Get search history error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * Save route search history for authenticated user
   */
  async saveSearchHistory(req, res) {
    try {
      const userId = req.user?.userId;
      const { startingPoint, destination, startStopId, endStopId, searchType } = req.body;

      if (!startingPoint || !destination) {
        return res.status(400).json({
          success: false,
          message: 'startingPoint and destination are required',
        });
      }

      const savedSearch = await routeFinderService.saveRouteSearchHistory({
        userId,
        startingPoint,
        destination,
        startStopId,
        endStopId,
        searchType,
      });

      res.status(201).json({
        success: true,
        message: 'Route search history saved successfully',
        data: savedSearch,
      });
    } catch (error) {
      console.error('❌ Save search history error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * Save selected generated route as favorite for authenticated user
   */
  async saveFavoriteRoute(req, res) {
    try {
      const userId = req.user?.userId;
      const { startingPoint, destination, tripName, routeData } = req.body;

      if (!startingPoint || !destination || !routeData) {
        return res.status(400).json({
          success: false,
          message: 'startingPoint, destination, and routeData are required',
        });
      }

      const savedFavorite = await routeFinderService.saveFavoriteRoute({
        userId,
        startingPoint,
        destination,
        tripName,
        routeData,
      });

      res.status(201).json({
        success: true,
        message: 'Favorite route saved successfully',
        data: savedFavorite,
      });
    } catch (error) {
      console.error('❌ Save favorite route error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * Get favorite routes for authenticated user
   */
  async getFavoriteRoutes(req, res) {
    try {
      const userId = req.user?.userId;
      const favorites = await routeFinderService.getFavoriteRoutes(userId);

      res.status(200).json({
        success: true,
        message: `Retrieved ${favorites.length} favorite route(s)`,
        data: favorites,
      });
    } catch (error) {
      console.error('❌ Get favorite routes error:', error);
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
      // console.log('📋 Sending all stops to frontend:', JSON.stringify(stops, null, 2));

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
      console.log(`📋 Sending searched stops to frontend for query "${query}":`, JSON.stringify(stops, null, 2));

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
