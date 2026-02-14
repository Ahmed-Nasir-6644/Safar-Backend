const {
  parseAllGTFSFiles,
  getGTFSData,
  exportToJSON,
  getGTFSStats,
} = require('../utils/gtfsParser');

class GTFSService {
  constructor() {
    this.cachedData = null;
  }

  /**
   * Load all GTFS data into memory
   */
  async loadAllData() {
    try {
      console.log('Loading all GTFS data...');
      this.cachedData = await parseAllGTFSFiles();
      console.log('✓ All GTFS data loaded successfully');
      return this.cachedData;
    } catch (error) {
      console.error('❌ Error loading GTFS data:', error);
      throw new Error(`Failed to load GTFS data: ${error.message}`);
    }
  }

  /**
   * Get all loaded data or load if not cached
   */
  async getAllData() {
    if (!this.cachedData) {
      await this.loadAllData();
    }
    return this.cachedData;
  }

  /**
   * Get specific GTFS data type
   */
  async getDataByType(dataType) {
    try {
      const allData = await this.getAllData();
      
      if (!allData[dataType]) {
        throw new Error(`Data type '${dataType}' not found`);
      }

      return allData[dataType];
    } catch (error) {
      throw new Error(`Failed to get ${dataType}: ${error.message}`);
    }
  }

  /**
   * Get statistics about all GTFS data
   */
  async getDataStats() {
    try {
      const allData = await this.getAllData();
      return getGTFSStats(allData);
    } catch (error) {
      throw new Error(`Failed to get stats: ${error.message}`);
    }
  }

  /**
   * Search stops by name
   */
  async searchStops(searchTerm) {
    try {
      const stops = await this.getDataByType('stops');
      const searchLower = searchTerm.toLowerCase();
      
      return stops.filter(stop =>
        stop.stop_name.toLowerCase().includes(searchLower)
      );
    } catch (error) {
      throw new Error(`Stop search failed: ${error.message}`);
    }
  }

  /**
   * Get routes
   */
  async getRoutes() {
    try {
      return await this.getDataByType('routes');
    } catch (error) {
      throw new Error(`Failed to get routes: ${error.message}`);
    }
  }

  /**
   * Get stops
   */
  async getStops() {
    try {
      const stops = await this.getDataByType('stops');
      console.log(`📊 getStops:  Array? ${Array.isArray(stops)}, Length: ${stops?.length || 'N/A'}`);
      if (stops && stops.length > 0) {
        console.log(`📊 First stop keys: ${Object.keys(stops[0]).join(', ')}`);
        console.log(`📊 First stop: ${JSON.stringify(stops[0])}`);
      }
      return stops;
    } catch (error) {
      console.error('❌ Failed to get stops:', error);
      throw new Error(`Failed to get stops: ${error.message}`);
    }
  }

  /**
   * Get trips
   */
  async getTrips() {
    try {
      return await this.getDataByType('trips');
    } catch (error) {
      throw new Error(`Failed to get trips: ${error.message}`);
    }
  }

  /**
   * Get stop times
   */
  async getStopTimes() {
    try {
      return await this.getDataByType('stop_times');
    } catch (error) {
      throw new Error(`Failed to get stop times: ${error.message}`);
    }
  }

  /**
   * Export all data to JSON
   */
  async exportAllData() {
    try {
      const allData = await this.getAllData();
      return await exportToJSON('gtfs_data', allData);
    } catch (error) {
      throw new Error(`Export failed: ${error.message}`);
    }
  }

  /**
   * Get routes for a specific stop
   */
  async getRoutesForStop(stopId) {
    try {
      const stopTimes = await this.getDataByType('stop_times');
      const trips = await this.getDataByType('trips');
      const routes = await this.getDataByType('routes');

      // Get all trip IDs for this stop
      const tripIds = [
        ...new Set(
          stopTimes
            .filter(st => st.stop_id === stopId)
            .map(st => st.trip_id)
        ),
      ];

      // Get route IDs from trips
      const routeIds = [
        ...new Set(
          trips
            .filter(trip => tripIds.includes(trip.trip_id))
            .map(trip => trip.route_id)
        ),
      ];

      // Get route details
      return routes.filter(route => routeIds.includes(route.route_id));
    } catch (error) {
      throw new Error(`Failed to get routes for stop: ${error.message}`);
    }
  }
}

module.exports = new GTFSService();
