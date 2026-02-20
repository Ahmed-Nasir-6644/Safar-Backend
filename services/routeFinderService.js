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


  getTransfersAndBuses(routeEdges, routeStops) {
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

    // Build detailed route segments with stops for each bus/line
    const routeSegments = tripLegs.map((leg, legIndex) => {
      // Get stops for this leg
      // Each edge connects stop[i] to stop[i+1], so we need stops from startEdgeIndex to endEdgeIndex+1
      const legStops = [];
      if (routeStops && Array.isArray(routeStops)) {
        // Add the starting stop of the first edge
        if (leg.startEdgeIndex < routeStops.length) {
          legStops.push(routeStops[leg.startEdgeIndex]);
        }
        
        // Add all subsequent stops up to and including the end
        for (let i = leg.startEdgeIndex + 1; i <= Math.min(leg.endEdgeIndex + 1, routeStops.length - 1); i++) {
          legStops.push(routeStops[i]);
        }
      }

      // Calculate distance for this leg
      let legDistance = 0;
      for (let i = leg.startEdgeIndex; i <= leg.endEdgeIndex; i++) {
        if (routeEdges[i] && routeEdges[i].distance) {
          legDistance += routeEdges[i].distance;
        }
      }

      return {
        routeName: leg.bus.toUpperCase(),
        routeId: leg.bus,
        stops: legStops,
        stopCount: legStops.length,
        distance: parseFloat(legDistance.toFixed(2)),
        boardingStop: legStops[0]?.stop_name || 'Unknown',
        alightingStop: legStops[legStops.length - 1]?.stop_name || 'Unknown',
      };
    });

    return {
      transferCount,
      busesUsed: Array.from(busesUsed).map(b => b.toUpperCase()),
      busSequence: busSequence.map(b => b.toUpperCase()),
      routeSegments: routeSegments,
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

  // Helper function to remove consecutive duplicate stops based on stop_name
  removeDuplicateStops(routeStops) {
    if (!Array.isArray(routeStops) || routeStops.length === 0) {
      return routeStops;
    }

    const uniqueStops = [routeStops[0]];
    
    for (let i = 1; i < routeStops.length; i++) {
      const prevStopName = uniqueStops[uniqueStops.length - 1].stop_name;
      const currentStopName = routeStops[i].stop_name;
      
      // Only add if the stop name is different from the previous one
      if (prevStopName !== currentStopName) {
        uniqueStops.push(routeStops[i]);
      }
    }
    
    return uniqueStops;
  }

  // Helper function to clean and validate route
  cleanAndValidateRoute(route) {
    // Step 1: Remove duplicate consecutive stops from routeStops
    const cleanedStops = this.removeDuplicateStops(route.routeStops);
    
    // Step 2: Check if we have valid stops
    if (!cleanedStops || cleanedStops.length < 2) {
      return null; // Invalid route
    }
    
    const destinationName = cleanedStops[cleanedStops.length - 1].stop_name;
    
    // Step 3: Get transfer info and segments
    let transferInfo = this.getTransfersAndBuses(route.routeEdges, cleanedStops);
    
    // Step 4: Filter out invalid segments and trim at destination
    let validSegments = [];
    let reachedDestination = false;
    
    for (const segment of transferInfo.routeSegments) {
      // Discard segments with unknown boarding or alighting stops
      if (segment.boardingStop === 'Unknown' || segment.alightingStop === 'Unknown') {
        console.log(`  ⚠️ Discarding segment with unknown stops: ${segment.routeName} (${segment.boardingStop} → ${segment.alightingStop})`);
        continue;
      }
      
      // Discard empty segments
      if (segment.stopCount === 0 || !segment.stops || segment.stops.length === 0) {
        console.log(`  ⚠️ Discarding empty segment: ${segment.routeName}`);
        continue;
      }
      
      validSegments.push(segment);
      
      // Check if this segment reaches the destination
      if (segment.alightingStop === destinationName) {
        reachedDestination = true;
        console.log(`  ✓ Reached destination at segment: ${segment.routeName} → ${destinationName}`);
        break; // Stop processing further segments
      }
    }
    
    // If no valid segments, discard route
    if (validSegments.length === 0) {
      console.log(`  ⚠️ No valid segments found, discarding route`);
      return null;
    }
    
    // Step 5: Rebuild route information from valid segments
    const newBusSequence = validSegments.map(s => s.routeId);
    const newBusesUsed = [...new Set(newBusSequence)];
    const newTransferCount = Math.max(0, newBusSequence.length - 1);
    
    // Rebuild stops from valid segments
    const newRouteStops = [];
    const stopsSeen = new Set();
    
    for (let i = 0; i < validSegments.length; i++) {
      const segment = validSegments[i];
      
      for (const stop of segment.stops) {
        // Add stop only if we haven't seen this stop name before
        const stopKey = `${stop.stop_name}`;
        if (!stopsSeen.has(stopKey)) {
          newRouteStops.push(stop);
          stopsSeen.add(stopKey);
        }
      }
    }
    
    // Recalculate total distance from valid segments
    const newTotalDistance = validSegments.reduce((sum, seg) => sum + seg.distance, 0);
    
    // Recalculate fare from valid segments
    const usedRoutes = new Set(newBusSequence);
    let totalFare = 0;
    const fareDetails = [];
    
    usedRoutes.forEach((routeId) => {
      const fare = this.fareMap[routeId] || 50;
      totalFare += fare;
      fareDetails.push({
        route: routeId.toUpperCase(),
        fare: fare,
      });
    });
    
    const newFare = {
      amount: totalFare,
      currency: 'PKR',
      routes: Array.from(usedRoutes).map(r => r.toUpperCase()),
      fareDetails: fareDetails,
    };
    
    // Recalculate estimated time
    const newEstimatedMinutes = this.estimateMinutes(newTotalDistance, newRouteStops.length);
    
    return {
      ...route,
      routeStops: newRouteStops,
      numberOfStops: newRouteStops.length,
      totalDistance: parseFloat(newTotalDistance.toFixed(2)),
      estimatedMinutes: newEstimatedMinutes,
      fare: newFare,
      transferCount: newTransferCount,
      busesUsed: newBusesUsed.map(b => b.toUpperCase()),
      busSequence: newBusSequence.map(b => b.toUpperCase()),
      routeSegments: validSegments,
    };
  }

  async findRouteByNames(startStopName, endStopName, maxRoutes = 6) {
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
            // Clean and validate the route
            const cleanedRoute = this.cleanAndValidateRoute(route);
            
            // Skip invalid routes
            if (!cleanedRoute) {
              console.log(`  ⚠️ Skipping invalid route`);
              return;
            }
            
            // Create route key based on stop names (after cleaning)
            const nameKey = cleanedRoute.routeStops.map((s) => s.stop_name).join('>');
            
            if (!seen.has(nameKey)) {
              allRoutes.push(cleanedRoute);
              seen.add(nameKey);
            }
          });
        }
      }

      if (allRoutes.length === 0) {
        throw new Error('No route found between these stops');
      }

      allRoutes.sort((a, b) => a.totalDistance - b.totalDistance);
      const routeKeyMap = new Map();
      allRoutes.forEach((route) => {
        // Use stop names for final deduplication
        const nameKey = route.routeStops.map((s) => s.stop_name).join('>');
        if (!routeKeyMap.has(nameKey)) {
          routeKeyMap.set(nameKey, route);
        }
      });

     const uniqueRoutes = Array.from(routeKeyMap.values()).map((route) => {
        console.log(`  📊 Route: ${route.routeStops.length} stops, ${route.totalDistance.toFixed(2)}km, ${route.estimatedMinutes}min, ${route.fare.amount} PKR, ${route.transferCount} transfers, buses: ${route.busesUsed.join(', ')}, bus sequence: ${route.busSequence.join(' → ')}`);

        return route;
      });

      // Filter out routes with duplicate buses in sequence
      const validRoutes = uniqueRoutes.filter((route) => {
        const busSequence = route.busSequence;
        const uniqueBuses = new Set(busSequence);
        
        // If the set size is different from array length, there are duplicates
        const hasDuplicates = uniqueBuses.size !== busSequence.length;
        
        if (hasDuplicates) {
          console.log(`  ⚠️ Discarding route with duplicate buses: ${busSequence.join(' → ')}`);
        }
        
        return !hasDuplicates; // Keep only routes without duplicates
      });

      // Deduplicate routes by bus sequence - keep only the one with least distance
      const busSequenceMap = new Map();
      validRoutes.forEach((route) => {
        const sequenceKey = route.busSequence.join('→');
        const existing = busSequenceMap.get(sequenceKey);
        
        if (!existing || route.totalDistance < existing.totalDistance) {
          if (existing) {
            console.log(`  🔄 Replacing route with same sequence (${sequenceKey}): ${existing.totalDistance.toFixed(2)}km → ${route.totalDistance.toFixed(2)}km`);
          }
          busSequenceMap.set(sequenceKey, route);
        } else {
          console.log(`  ⚠️ Discarding route with same sequence (${sequenceKey}): ${route.totalDistance.toFixed(2)}km (keeping ${existing.totalDistance.toFixed(2)}km)`);
        }
      });

      const finalRoutes = Array.from(busSequenceMap.values());
      finalRoutes.sort((a, b) => a.totalDistance - b.totalDistance);

      return {
        routes: finalRoutes.slice(0, limit),
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
      
      // Remove consecutive duplicate stops
      const cleanedStops = this.removeDuplicateStops(result.routeStops);
      result.routeStops = cleanedStops;
      result.numberOfStops = cleanedStops.length;
      
      const transferInfo = this.getTransfersAndBuses(result.routeEdges, cleanedStops);
      return {
        ...result,
        estimatedMinutes: this.estimateMinutes(
          result.totalDistance,
          result.numberOfStops
        ),
        fare: this.calculateFare(result.routeEdges),
        ...transferInfo,
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
