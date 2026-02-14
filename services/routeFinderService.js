const gtfsService = require('./gtfsService');
const {
  buildStopGraph,
  buildAdjacencyList,
  dijkstraShortestPath,
  findNearbyStops,
} = require('../utils/dijkstra');

class RouteFinderService {
  constructor() {
    this.graph = null;
    this.graphBuiltTime = null;
  }

  /**
   * Initialize and build the route graph
   */
  async initializeGraph() {
    try {
      console.log('🔨 Building route graph...');
      
      // Load GTFS data
      const stops = await gtfsService.getStops();
      const stopTimes = await gtfsService.getStopTimes();

      console.log(`📊 Loaded ${stops ? stops.length : 0} stops from GTFS`);
      console.log(`📊 Loaded ${stopTimes ? stopTimes.length : 0} stop times from GTFS`);

      if (!stops || stops.length === 0) {
        throw new Error('No stops data available');
      }

      if (!stopTimes || stopTimes.length === 0) {
        throw new Error('No stop times data available');
      }

      // Build graph
      this.graph = buildStopGraph(stops);
      console.log(`📊 Graph after buildStopGraph: ${Object.keys(this.graph).length} stops`);
      
      buildAdjacencyList(stopTimes, this.graph);
      console.log(`📊 Graph after buildAdjacencyList: ${Object.keys(this.graph).length} stops`);
      
      this.graphBuiltTime = new Date();

      console.log(`✓ Graph built with ${Object.keys(this.graph).length} stops`);
      return true;
    } catch (error) {
      console.error('❌ Error building graph:', error);
      throw new Error(`Failed to initialize graph: ${error.message}`);
    }
  }

  /**
   * Get or initialize graph
   */
  async getGraph() {
    if (!this.graph) {
      await this.initializeGraph();
    }
    return this.graph;
  }

  /**
   * Find stop ID by stop name (case-insensitive, partial match)
   */
  async findStopByName(stopName) {
    try {
      const graph = await this.getGraph();
      const searchTerm = stopName.toLowerCase();

      // Exact match first
      const exactMatch = Object.values(graph).find(
        (stop) => stop.stop_name.toLowerCase() === searchTerm
      );

      if (exactMatch) {
        return {
          stop_id: exactMatch.stop_id,
          stop_name: exactMatch.stop_name,
        };
      }

      // Partial match
      const partialMatches = Object.values(graph).filter((stop) =>
        stop.stop_name.toLowerCase().includes(searchTerm)
      );

      if (partialMatches.length === 0) {
        throw new Error(`No stop found matching "${stopName}"`);
      }

      if (partialMatches.length === 1) {
        return {
          stop_id: partialMatches[0].stop_id,
          stop_name: partialMatches[0].stop_name,
        };
      }

      // Multiple matches - return all
      return {
        multiple: true,
        matches: partialMatches.map((s) => ({
          stop_id: s.stop_id,
          stop_name: s.stop_name,
        })),
      };
    } catch (error) {
      throw new Error(`Failed to find stop: ${error.message}`);
    }
  }

  /**
   * Find shortest route between two stops (by ID or name)
   */
  async findRouteByNames(startStopName, endStopName) {
    try {
      // Find start stop
      const startStop = await this.findStopByName(startStopName);
      if (startStop.multiple) {
        throw new Error(
          `Multiple matches for "${startStopName}". Please be more specific. Matches: ${startStop.matches
            .map((m) => m.stop_name)
            .join(', ')}`
        );
      }

      // Find end stop
      const endStop = await this.findStopByName(endStopName);
      if (endStop.multiple) {
        throw new Error(
          `Multiple matches for "${endStopName}". Please be more specific. Matches: ${endStop.matches
            .map((m) => m.stop_name)
            .join(', ')}`
        );
      }

      // Find route using IDs
      return await this.findRoute(startStop.stop_id, endStop.stop_id);
    } catch (error) {
      console.error('❌ Find route by names error:', error);
      throw new Error(`Failed to find route: ${error.message}`);
    }
  }

  /**
   * Find shortest route between two stops
   */
  async findRoute(startStopId, endStopId) {
    try {
      const graph = await this.getGraph();

      if (!graph[startStopId]) {
        throw new Error(`Start stop not found: ${startStopId}`);
      }

      if (!graph[endStopId]) {
        throw new Error(`End stop not found: ${endStopId}`);
      }

      const result = dijkstraShortestPath(graph, startStopId, endStopId);

      if (!result.success) {
        throw new Error(result.message);
      }

      return result;
    } catch (error) {
      console.error('❌ Route finding error:', error);
      throw new Error(`Failed to find route: ${error.message}`);
    }
  }

  /**
   * Find nearby stops
   */
  async findNearby(stopId, radiusKm = 5) {
    try {
      const graph = await this.getGraph();

      if (!graph[stopId]) {
        throw new Error(`Stop not found: ${stopId}`);
      }

      const nearby = findNearbyStops(graph, stopId, radiusKm);
      return nearby;
    } catch (error) {
      console.error('❌ Find nearby error:', error);
      throw new Error(`Failed to find nearby stops: ${error.message}`);
    }
  }

  /**
   * Get all stop options (for autocomplete)
   */
  async getAllStops() {
    try {
      const graph = await this.getGraph();
      const stops = Object.values(graph).map((stop) => ({
        stop_id: stop.stop_id,
        stop_name: stop.stop_name,
        stop_lat: stop.stop_lat,
        stop_lon: stop.stop_lon,
      }));

      console.log(`✓ Retrieved ${stops.length} stops from graph`);
      return stops;
    } catch (error) {
      console.error('❌ Get all stops error:', error);
      throw new Error(`Failed to get stops: ${error.message}`);
    }
  }

  /**
   * Search stops by name
   */
  async searchStops(query) {
    try {
      const graph = await this.getGraph();
      const searchLower = query.toLowerCase();

      return Object.values(graph)
        .filter((stop) => stop.stop_name.toLowerCase().includes(searchLower))
        .map((stop) => ({
          stop_id: stop.stop_id,
          stop_name: stop.stop_name,
          stop_lat: stop.stop_lat,
          stop_lon: stop.stop_lon,
        }));
    } catch (error) {
      console.error('❌ Search stops error:', error);
      throw new Error(`Failed to search stops: ${error.message}`);
    }
  }

  /**
   * Get route statistics
   */
  async getGraphStats() {
    try {
      const graph = await this.getGraph();

      let totalConnections = 0;
      let maxConnections = 0;
      let busyStop = null;

      Object.values(graph).forEach((stop) => {
        totalConnections += stop.neighbors.length;
        if (stop.neighbors.length > maxConnections) {
          maxConnections = stop.neighbors.length;
          busyStop = stop.stop_name;
        }
      });

      return {
        totalStops: Object.keys(graph).length,
        totalConnections,
        averageConnectionsPerStop: (
          totalConnections / Object.keys(graph).length
        ).toFixed(2),
        busyStop,
        busyStopConnections: maxConnections,
        graphBuiltAt: this.graphBuiltTime,
      };
    } catch (error) {
      console.error('❌ Get stats error:', error);
      throw new Error(`Failed to get statistics: ${error.message}`);
    }
  }

  /**
   * Rebuild graph (refresh from GTFS data)
   */
  async rebuildGraph() {
    try {
      console.log('🔄 Rebuilding graph...');
      this.graph = null;
      this.graphBuiltTime = null;
      await this.initializeGraph();
      return { success: true, message: 'Graph rebuilt successfully' };
    } catch (error) {
      console.error('❌ Rebuild graph error:', error);
      throw new Error(`Failed to rebuild graph: ${error.message}`);
    }
  }
}

module.exports = new RouteFinderService();
