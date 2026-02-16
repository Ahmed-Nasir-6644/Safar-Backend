const gtfsService = require('../services/gtfsService');

class GTFSController {
  /**
   * Get all GTFS data
   */
  async getAllData(req, res) {
    try {
      const data = await gtfsService.getAllData();
      res.status(200).json({
        success: true,
        message: 'All GTFS data retrieved successfully',
        data,
      });
    } catch (error) {
      console.error('❌ Get all data error:', error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * Get data by type (stops, routes, trips, etc.)
   */
  async getDataByType(req, res) {
    try {
      const { dataType } = req.params;
      const data = await gtfsService.getDataByType(dataType);
      
      res.status(200).json({
        success: true,
        message: `${dataType} data retrieved successfully`,
        data,
      });
    } catch (error) {
      console.error('❌ Get data by type error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * Get GTFS data statistics
   */
  async getStats(req, res) {
    try {
      const stats = await gtfsService.getDataStats();
      res.status(200).json({
        success: true,
        message: 'GTFS data statistics retrieved successfully',
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

      const stops = await gtfsService.searchStops(query);
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
   * Get routes for a specific stop
   */
  async getRoutesForStop(req, res) {
    try {
      const { stopId } = req.params;

      if (!stopId) {
        return res.status(400).json({
          success: false,
          message: 'Stop ID is required',
        });
      }

      const routes = await gtfsService.getRoutesForStop(stopId);
      res.status(200).json({
        success: true,
        message: `Routes for stop ${stopId} retrieved successfully`,
        data: routes,
      });
    } catch (error) {
      console.error('❌ Get routes for stop error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * Get routes
   */
  async getRoutes(req, res) {
    try {
      const routes = await gtfsService.getRoutes();
      res.status(200).json({
        success: true,
        message: 'Routes retrieved successfully',
        data: routes,
      });
    } catch (error) {
      console.error('❌ Get routes error:', error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * Get stops
   */
  async getStops(req, res) {
    try {
      const stops = await gtfsService.getStops();
      const stopNames = Array.isArray(stops)
        ? stops
            .map((stop) => stop?.stop_name)
            .filter((name) => typeof name === 'string' && name.trim().length > 0)
        : [];
      console.log('📍 getStops: stop names', stopNames);
      res.status(200).json({
        success: true,
        message: 'Stops retrieved successfully',
        data: stopNames,
      });
    } catch (error) {
      console.error('❌ Get stops error:', error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * Export all GTFS data to JSON
   */
  async exportData(req, res) {
    try {
      const filePath = await gtfsService.exportAllData();
      res.status(200).json({
        success: true,
        message: 'GTFS data exported successfully',
        data: { filePath },
      });
    } catch (error) {
      console.error('❌ Export data error:', error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * Load data into cache
   */
  async loadData(req, res) {
    try {
      await gtfsService.loadAllData();
      res.status(200).json({
        success: true,
        message: 'GTFS data loaded into cache successfully',
      });
    } catch (error) {
      console.error('❌ Load data error:', error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
}

module.exports = new GTFSController();
