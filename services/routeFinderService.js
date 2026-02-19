const gtfsService = require('./gtfsService');
const {
  buildStopGraph,
  buildAdjacencyList,
  addTransferEdges,
  addSameLocationTransfers,
  dijkstraShortestPath,
  kShortestPaths,
  findNearbyStops,
} = require('../utils/dijkstra');

class RouteFinderService {
  constructor() {
    this.graph = null;
    this.graphBuiltTime = null;
    this.averageSpeedKmh = 35;
    this.minutesPerStop = 0.5;
    this.tripToShape = new Map();
    this.tripToRoute = new Map();
    this.shapeIds = new Set();
    this.fareMap = {
      red: 30,
      orange2: 90,
      orange: 50,
      blue: 50,
      green: 50,
      fr_3a: 50,
      fr_4: 50,
      fr_6: 50,
      fr_7: 50,
      fr_8a: 50,
      fr_8c: 50,
      fr_9: 50,
      fr_14: 50,
    };
  }

  estimateMinutes(distanceKm, numberOfStops) {
    const speed = Number.parseFloat(this.averageSpeedKmh);
    const dwell = Number.parseFloat(this.minutesPerStop);
    if (!Number.isFinite(distanceKm) || !Number.isFinite(speed) || speed <= 0) {
      return null;
    }

    const stops = Math.max(0, (Number.parseInt(numberOfStops, 10) || 0) - 1);
    const travelMinutes = (distanceKm / speed) * 60;
    const dwellMinutes = Number.isFinite(dwell) ? dwell * stops : 0;
    return Math.round(travelMinutes + dwellMinutes);
  }

  buildTripShapeIndex(trips, shapes) {
    this.tripToShape = new Map();
    this.tripToRoute = new Map();
    this.shapeIds = new Set();

    if (Array.isArray(shapes)) {
      shapes.forEach((shape) => {
        if (shape?.shape_id) {
          this.shapeIds.add(shape.shape_id);
        }
      });
    }

    if (Array.isArray(trips)) {
      trips.forEach((trip) => {
        if (trip?.trip_id) {
          // Map trip to route_id for fare calculation
          if (trip?.route_id) {
            this.tripToRoute.set(trip.trip_id, trip.route_id);
          }
          // Map trip to shape_id if available
          if (trip?.shape_id) {
            this.tripToShape.set(trip.trip_id, trip.shape_id);
          }
        }
      });
    }

    console.log(`✓ Indexed ${this.tripToRoute.size} trips → routes, ${this.tripToShape.size} trips → shapes`);
  }

  calculateFare(routeEdges) {
    const usedRoutes = new Set();
    const fareDetails = [];

    if (Array.isArray(routeEdges)) {
      routeEdges.forEach((edge) => {
        if (!edge?.trip_id || edge.trip_id === 'TRANSFER' || edge.trip_id === 'TRANSFER_NEARBY' || edge.trip_id === 'TRANSFER_SAME_LOCATION') {
          return;
        }

        const routeId = this.tripToRoute.get(edge.trip_id);
        if (routeId) {
          usedRoutes.add(routeId);
        }
      });
    }

    // Calculate total fare based on routes used
    let totalFare = 0;
    usedRoutes.forEach((routeId) => {
      const fare = this.fareMap[routeId] || 50; // Default to 50 if not in map
      totalFare += fare;
      fareDetails.push({
        route: routeId.toUpperCase(),
        fare: fare,
      });
    });

    return {
      amount: totalFare,
      currency: 'PKR',
      routes: Array.from(usedRoutes).map(r => r.toUpperCase()),
      fareDetails: fareDetails,
    };
  }

  getTransfersAndBuses(routeEdges) {
    const busesUsed = new Set();
    const busSequence = [];
    const tripLegs = []; // Detailed information about each leg of the journey
    let currentBus = null;
    let legStartIndex = 0;

    if (Array.isArray(routeEdges)) {
      routeEdges.forEach((edge, index) => {
        if (!edge?.trip_id) {
          return;
        }

        // Handle transfer edges - they mark a transfer point
        if (edge.trip_id === 'TRANSFER' || edge.trip_id === 'TRANSFER_NEARBY' || edge.trip_id === 'TRANSFER_SAME_LOCATION') {
          // End current leg if there's a bus
          if (currentBus !== null) {
            tripLegs.push({
              bus: currentBus,
              startEdgeIndex: legStartIndex,
              endEdgeIndex: index - 1,
            });
          }
          currentBus = null;
          return;
        }

        // Get route ID for this trip/bus
        const routeId = this.tripToRoute.get(edge.trip_id);
        if (routeId) {
          busesUsed.add(routeId);
          
          // If this is a new bus, record it in sequence and start a new leg
          if (currentBus !== routeId) {
            // End previous leg if exists
            if (currentBus !== null) {
              tripLegs.push({
                bus: currentBus,
                startEdgeIndex: legStartIndex,
                endEdgeIndex: index - 1,
              });
            }
            // Start new leg
            currentBus = routeId;
            legStartIndex = index;
            
            // Add to sequence if different from last bus
            if (busSequence.length === 0 || busSequence[busSequence.length - 1] !== routeId) {
              busSequence.push(routeId);
            }
          }
        }
      });

      // Don't forget the last leg
      if (currentBus !== null) {
        tripLegs.push({
          bus: currentBus,
          startEdgeIndex: legStartIndex,
          endEdgeIndex: routeEdges.length - 1,
        });
      }
    }

    // transferCount = number of buses - 1
    const transferCount = Math.max(0, busSequence.length - 1);

    return {
      transferCount,
      busesUsed: Array.from(busesUsed).map(b => b.toUpperCase()),
      busSequence: busSequence.map(b => b.toUpperCase()),
      tripLegs: tripLegs.map(leg => ({
        bus: leg.bus.toUpperCase(),
        edgeRange: `${leg.startEdgeIndex}-${leg.endEdgeIndex}`,
      })),
    };
  }

  async initializeGraph() {
    try {
      console.log('🔨 Building route graph...');
      
      const stops = await gtfsService.getStops();
      const stopTimes = await gtfsService.getStopTimes();
      const transfers = await gtfsService.getDataByType('transfers').catch(() => []);
      const trips = await gtfsService.getDataByType('trips').catch(() => []);
      const shapes = await gtfsService.getDataByType('shapes').catch(() => []);

      console.log(`📊 Loaded ${stops ? stops.length : 0} stops from GTFS`);
      console.log(`📊 Loaded ${stopTimes ? stopTimes.length : 0} stop times from GTFS`);

      if (!stops || stops.length === 0) {
        throw new Error('No stops data available');
      }

      if (!stopTimes || stopTimes.length === 0) {
        throw new Error('No stop times data available');
      }

      this.graph = buildStopGraph(stops);
      console.log(`📊 Graph after buildStopGraph: ${Object.keys(this.graph).length} stops`);

      // Add transfers from transfers.txt
      addTransferEdges(transfers, this.graph, 0);
      
      // Add automatic transfers between stops with same base name (_up/_down variants)
      addSameLocationTransfers(this.graph);
      
      buildAdjacencyList(stopTimes, this.graph);
      console.log(`📊 Graph after buildAdjacencyList: ${Object.keys(this.graph).length} stops`);
      
      this.buildTripShapeIndex(trips, shapes);
      
      this.graphBuiltTime = new Date();

      console.log(`✓ Graph built with ${Object.keys(this.graph).length} stops`);
      return true;
    } catch (error) {
      console.error('❌ Error building graph:', error);
      throw new Error(`Failed to initialize graph: ${error.message}`);
    }
  }

  async getGraph() {
    if (!this.graph) {
      await this.initializeGraph();
    }
    return this.graph;
  }

  async findStopByName(stopName) {
    try {
      const graph = await this.getGraph();
      const searchTerm = stopName.toLowerCase();

      const exactMatches = Object.values(graph).filter(
        (stop) => stop.stop_name.toLowerCase() === searchTerm
      );

      if (exactMatches.length === 1) {
        return {
          stop_id: exactMatches[0].stop_id,
          stop_name: exactMatches[0].stop_name,
        };
      }

      if (exactMatches.length > 1) {
        return {
          multiple: true,
          matches: exactMatches.map((s) => ({
            stop_id: s.stop_id,
            stop_name: s.stop_name,
          })),
        };
      }

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

  async findRouteByNames(startStopName, endStopName, maxRoutes = 3) {
    try {
      const startStop = await this.findStopByName(startStopName);
      const startCandidates = startStop.multiple
        ? startStop.matches
        : [startStop];

      const endStop = await this.findStopByName(endStopName);
      const endCandidates = endStop.multiple ? endStop.matches : [endStop];

      const limit = Math.max(1, Number.parseInt(maxRoutes, 10) || 3);
      const allRoutes = [];
      const seen = new Set();

      const graph = await this.getGraph();

      console.log(`🔍 Searching routes between ${startCandidates.length} start and ${endCandidates.length} end candidates`);

      for (const startCandidate of startCandidates) {
        for (const endCandidate of endCandidates) {
          console.log(`  🚦 Trying: ${startCandidate.stop_id} → ${endCandidate.stop_id}`);
          
          const routes = kShortestPaths(
            graph,
            startCandidate.stop_id,
            endCandidate.stop_id,
            limit
          );

          console.log(`    ✓ Found ${routes.length} route(s)`);

          routes.forEach((route) => {
            const key = route.routeKey || route.routeStops.map((s) => s.stop_id).join('>');
            if (!seen.has(key)) {
              allRoutes.push(route);
              seen.add(key);
            }
          });
        }
      }

      if (allRoutes.length === 0) {
        throw new Error('No route found between these stops');
      }

      // Sort all routes by distance
      allRoutes.sort((a, b) => a.totalDistance - b.totalDistance);
      
      // Deduplicate by actual route path (stop_id sequence) not just names
      const routeKeyMap = new Map();
      allRoutes.forEach((route) => {
        const routeKey = route.routeKey || route.routeStops.map((s) => s.stop_id).join('>');
        if (!routeKeyMap.has(routeKey)) {
          routeKeyMap.set(routeKey, route);
        }
      });

      // Convert to array and add fare/time estimates
      const uniqueRoutes = Array.from(routeKeyMap.values()).map((route) => {
        const estimatedMinutes = this.estimateMinutes(
          route.totalDistance,
          route.numberOfStops
        );
        const fare = this.calculateFare(route.routeEdges);
        const { transferCount, busesUsed, busSequence } = this.getTransfersAndBuses(route.routeEdges);
        
        console.log(`  📊 Route: ${route.routeStops.length} stops, ${route.totalDistance.toFixed(2)}km, ${estimatedMinutes}min, ${fare.amount} PKR, ${transferCount} transfers, buses: ${busesUsed.join(', ')}`);
        
        return {
          ...route,
          estimatedMinutes,
          fare,
          transferCount,
          busesUsed,
          busSequence,
        };
      });
      
      uniqueRoutes.sort((a, b) => a.totalDistance - b.totalDistance);

      return {
        routes: uniqueRoutes.slice(0, limit),
        farePolicy: {
          currency: 'PKR',
          fares: {
            'Red Line': 30,
            'Orange2 (Airport)': 90,
            'Blue, Green, Orange, FR-3A, FR-4, FR-6, FR-7, FR-8A, FR-8C, FR-9, FR-14': 50,
          },
        },
      };
    } catch (error) {
      console.error('❌ Find route by names error:', error);
      throw new Error(`Failed to find route: ${error.message}`);
    }
  }

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

      const { transferCount, busesUsed, busSequence } = this.getTransfersAndBuses(result.routeEdges);

      return {
        ...result,
        estimatedMinutes: this.estimateMinutes(
          result.totalDistance,
          result.numberOfStops
        ),
        fare: this.calculateFare(result.routeEdges),
        transferCount,
        busesUsed,
        busSequence,
      };
    } catch (error) {
      console.error('❌ Route finding error:', error);
      throw new Error(`Failed to find route: ${error.message}`);
    }
  }

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
