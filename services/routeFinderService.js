const https = require('https');
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
const RouteSearch = require('../models/RouteSearch');
const FavoriteRoute = require('../models/FavoriteRoute');

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

  formatCoordinate(value, fieldName) {
    const numeric = Number.parseFloat(value);
    if (!Number.isFinite(numeric)) {
      throw new Error(`Invalid ${fieldName} coordinate: ${value}`);
    }
    return String(numeric);
  }

  buildExternalRoutesUrl(startStop, endStop) {
    const fromLat = this.formatCoordinate(startStop?.stop_lat, 'fromLat');
    const fromLon = this.formatCoordinate(startStop?.stop_lon, 'fromLon');
    const toLat = this.formatCoordinate(endStop?.stop_lat, 'toLat');
    const toLon = this.formatCoordinate(endStop?.stop_lon, 'toLon');

    const fromCoords = encodeURIComponent(`${fromLat},${fromLon}`);
    const toCoords = encodeURIComponent(`${toLat},${toLon}`);
    console.log(`https://www.safar.fyi/api/routes?fromCoords=${fromCoords}&toCoords=${toCoords}`);
    return `https://www.safar.fyi/api/routes?fromCoords=${fromCoords}&toCoords=${toCoords}`;
  }

  fetchExternalJson(url) {
    return new Promise((resolve, reject) => {
      https
        .get(url, (response) => {
          let body = '';

          response.on('data', (chunk) => {
            body += chunk;
          });

          response.on('end', () => {
            if (response.statusCode < 200 || response.statusCode >= 300) {
              return reject(
                new Error(
                  `External API request failed (${response.statusCode}): ${body.slice(0, 300)}`
                )
              );
            }

            try {
              resolve(JSON.parse(body));
            } catch (error) {
              reject(new Error(`Invalid JSON from external API: ${error.message}`));
            }
          });
        })
        .on('error', (error) => {
          reject(new Error(`External API request error: ${error.message}`));
        });
    });
  }

  extractExternalRoutes(payload) {
    if (Array.isArray(payload)) {
      return payload;
    }

    if (payload && Array.isArray(payload.routes)) {
      return payload.routes;
    }

    if (payload?.data) {
      if (Array.isArray(payload.data)) {
        return payload.data;
      }
      if (Array.isArray(payload.data.routes)) {
        return payload.data.routes;
      }
      if (payload.data.routeSegments || payload.data.busSequence) {
        return [payload.data];
      }
    }

    if (payload && (payload.routeSegments || payload.busSequence)) {
      return [payload];
    }

    return [];
  }

  parseDistanceMeters(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value !== 'string') {
      return 0;
    }

    const numeric = Number.parseFloat(value);
    if (!Number.isFinite(numeric)) {
      return 0;
    }

    return value.toLowerCase().includes('km') ? numeric * 1000 : numeric;
  }

  parseDurationMinutes(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.max(0, Math.round(value));
    }

    if (typeof value !== 'string') {
      return 0;
    }

    const numeric = Number.parseFloat(value);
    if (!Number.isFinite(numeric)) {
      return 0;
    }

    const lower = value.toLowerCase();
    if (lower.includes('hour') || lower.includes('hr')) {
      return Math.max(0, Math.round(numeric * 60));
    }

    return Math.max(0, Math.round(numeric));
  }

  parseFarePkr(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.max(0, Math.round(value));
    }

    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.replace(/,/g, '');
    const match = normalized.match(/(\d+(?:\.\d+)?)/);

    if (!match) {
      return null;
    }

    const numeric = Number.parseFloat(match[1]);
    if (!Number.isFinite(numeric)) {
      return null;
    }

    return Math.max(0, Math.round(numeric));
  }

  getExternalRouteWalkingMeters(route) {
    if (!route || typeof route !== 'object') {
      return Number.POSITIVE_INFINITY;
    }

    if (Number.isFinite(route.totalWalkingDistanceMeters)) {
      return route.totalWalkingDistanceMeters;
    }

    let walkingMeters = 0;

    if (Array.isArray(route.steps)) {
      route.steps
        .filter((step) => step?.type === 'walk')
        .forEach((step) => {
          walkingMeters += this.parseDistanceMeters(step?.distance);
        });
    }

    if (Array.isArray(route.segments)) {
      route.segments
        .filter((segment) => segment?.type === 'walk')
        .forEach((segment) => {
          walkingMeters += this.parseDistanceMeters(segment?.walkingDistance);
        });
    }

    return walkingMeters;
  }

  getExternalRouteTransfers(route) {
    if (Number.isFinite(route?.transfers)) {
      return route.transfers;
    }

    if (Array.isArray(route?.steps)) {
      return Math.max(0, route.steps.filter((step) => step?.type === 'bus').length - 1);
    }

    return Number.MAX_SAFE_INTEGER;
  }

  async fetchBestExternalPayload(startStops, endStops) {
    const evaluated = [];

    for (const startStop of startStops) {
      for (const endStop of endStops) {
        const endpoint = this.buildExternalRoutesUrl(startStop, endStop);
        console.log(`🌐 Trying candidate pair: ${startStop.stop_id} → ${endStop.stop_id}`);
        const payload = await this.fetchExternalJson(endpoint);
        const routes = this.extractExternalRoutes(payload);

        if (!routes.length) {
          continue;
        }

        const primaryRoute = routes[0];
        const walkingMeters = this.getExternalRouteWalkingMeters(primaryRoute);
        const transfers = this.getExternalRouteTransfers(primaryRoute);

        evaluated.push({
          startStop,
          endStop,
          payload,
          walkingMeters,
          transfers,
        });
      }
    }

    if (!evaluated.length) {
      throw new Error('No route found from external API');
    }

    evaluated.sort((a, b) => {
      if (a.walkingMeters !== b.walkingMeters) {
        return a.walkingMeters - b.walkingMeters;
      }
      return a.transfers - b.transfers;
    });

    const best = evaluated[0];
    console.log(
      `✅ Selected candidate pair ${best.startStop.stop_id} → ${best.endStop.stop_id} (walk ${best.walkingMeters.toFixed(2)}m, transfers ${best.transfers})`
    );
    return best;
  }

  normalizeExternalStop(stop) {
    const lat = Number.parseFloat(stop?.stop_lat);
    const lon = Number.parseFloat(stop?.stop_lon);

    return {
      stop_id: stop?.stop_id || '',
      stop_name: stop?.stop_name || '',
      stop_lat: Number.isFinite(lat) ? lat : stop?.stop_lat,
      stop_lon: Number.isFinite(lon) ? lon : stop?.stop_lon,
    };
  }

  normalizeStopLookupName(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/\b(metro|station|stop|terminal)\b/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  makeFallbackStop(stopName) {
    const normalized = this.normalizeStopLookupName(stopName).replace(/\s+/g, '_');
    return {
      stop_id: normalized || 'unknown_stop',
      stop_name: String(stopName || 'Unknown Stop').trim() || 'Unknown Stop',
      stop_lat: null,
      stop_lon: null,
    };
  }

  buildStopNameIndex(graph) {
    const index = new Map();
    Object.values(graph || {}).forEach((stop) => {
      const normalized = this.normalizeStopLookupName(stop?.stop_name);
      if (!normalized) {
        return;
      }

      if (!index.has(normalized)) {
        index.set(normalized, this.normalizeExternalStop(stop));
      }
    });
    return index;
  }

  resolveStopByName(stopName, stopNameIndex) {
    const normalized = this.normalizeStopLookupName(stopName);
    const matched = normalized ? stopNameIndex.get(normalized) : null;

    if (matched) {
      return matched;
    }

    return this.makeFallbackStop(stopName);
  }

  parseStationDetails(rawStationDetails) {
    if (Array.isArray(rawStationDetails)) {
      return rawStationDetails.map((name) => String(name));
    }

    if (typeof rawStationDetails !== 'string' || rawStationDetails.trim().length === 0) {
      return [];
    }

    try {
      const parsed = JSON.parse(rawStationDetails);
      if (Array.isArray(parsed)) {
        return parsed.map((name) => String(name));
      }
      return [];
    } catch (error) {
      console.warn('⚠️ Could not parse stationDetails JSON:', error.message);
      return [];
    }
  }

  getRouteIdFromStep(step) {
    if (typeof step?.lineCode === 'string' && step.lineCode.includes(':')) {
      const parts = step.lineCode.split(':');
      return String(parts[parts.length - 1]).toLowerCase();
    }

    return String(step?.line || '')
      .toLowerCase()
      .replace(/-/g, '_')
      .trim();
  }

  calculateSegmentDistance(stops) {
    if (!Array.isArray(stops) || stops.length < 2) {
      return 0;
    }

    const toRadians = (value) => (value * Math.PI) / 180;
    const earthRadiusKm = 6371;
    let total = 0;

    for (let i = 1; i < stops.length; i++) {
      const prev = stops[i - 1];
      const curr = stops[i];
      const prevLat = Number.parseFloat(prev?.stop_lat);
      const prevLon = Number.parseFloat(prev?.stop_lon);
      const currLat = Number.parseFloat(curr?.stop_lat);
      const currLon = Number.parseFloat(curr?.stop_lon);

      if (
        !Number.isFinite(prevLat) ||
        !Number.isFinite(prevLon) ||
        !Number.isFinite(currLat) ||
        !Number.isFinite(currLon)
      ) {
        continue;
      }

      const dLat = toRadians(currLat - prevLat);
      const dLon = toRadians(currLon - prevLon);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRadians(prevLat)) *
          Math.cos(toRadians(currLat)) *
          Math.sin(dLon / 2) ** 2;
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      total += earthRadiusKm * c;
    }

    return parseFloat(total.toFixed(2));
  }

  normalizeExternalSegment(segment) {
    const normalizedStops = Array.isArray(segment?.stops)
      ? segment.stops.map((stop) => this.normalizeExternalStop(stop))
      : [];

    const parsedDistance = Number.parseFloat(segment?.distance);
    const routeId = String(segment?.routeId || '').toLowerCase();
    const routeName = String(segment?.routeName || routeId).toUpperCase();

    return {
      routeName,
      routeId,
      stops: normalizedStops,
      stopCount: Number.parseInt(segment?.stopCount, 10) || normalizedStops.length,
      distance: Number.isFinite(parsedDistance)
        ? parseFloat(parsedDistance.toFixed(2))
        : 0,
      boardingStop:
        segment?.boardingStop || normalizedStops[0]?.stop_name || 'Unknown',
      alightingStop:
        segment?.alightingStop ||
        normalizedStops[normalizedStops.length - 1]?.stop_name ||
        'Unknown',
    };
  }

  normalizeExternalRoute(route, stopNameIndex) {
    let routeSegments = Array.isArray(route?.routeSegments)
      ? route.routeSegments.map((segment) => this.normalizeExternalSegment(segment))
      : [];

    if (routeSegments.length === 0 && Array.isArray(route?.steps)) {
      const busSteps = route.steps.filter((step) => step?.type === 'bus');
      routeSegments = busSteps.map((step) => {
        const routeId = this.getRouteIdFromStep(step);
        const routeName = String(step?.line || routeId).toUpperCase().replace(/-/g, '_');
        const stationDetails = this.parseStationDetails(step?.stationDetails);
        const stopNames = [step?.from, ...stationDetails, step?.to].filter(
          (value) => typeof value === 'string' && value.trim().length > 0
        );

        const resolvedStops = this.removeDuplicateStops(
          stopNames.map((stopName) => this.resolveStopByName(stopName, stopNameIndex))
        );

        return {
          routeName,
          routeId,
          stops: resolvedStops,
          stopCount: resolvedStops.length,
          distance: this.calculateSegmentDistance(resolvedStops),
          boardingStop: resolvedStops[0]?.stop_name || step?.from || 'Unknown',
          alightingStop:
            resolvedStops[resolvedStops.length - 1]?.stop_name || step?.to || 'Unknown',
        };
      });
    }

    const busesUsed = Array.isArray(route?.busesUsed)
      ? route.busesUsed.map((bus) => String(bus).toUpperCase())
      : [];

    const busSequence =
      Array.isArray(route?.busSequence) && route.busSequence.length > 0
        ? route.busSequence.map((bus) => String(bus).toUpperCase())
        : routeSegments.map((segment) => segment.routeName);

    const transferCount = Number.isInteger(route?.transferCount)
      ? Math.max(0, route.transferCount)
      : Math.max(0, busSequence.length - 1);

    const tripLegs =
      Array.isArray(route?.tripLegs) && route.tripLegs.length > 0
        ? route.tripLegs.map((leg) => ({
            bus: String(leg?.bus || '').toUpperCase(),
            edgeRange: String(leg?.edgeRange || ''),
          }))
        : (() => {
            let edgeStart = 0;
            return routeSegments.map((segment) => {
              const edgesInSegment = Math.max(1, segment.stopCount - 1);
              const leg = {
                bus: segment.routeName,
                edgeRange: `${edgeStart}-${edgeStart + edgesInSegment - 1}`,
              };
              edgeStart += edgesInSegment;
              return leg;
            });
          })();

    const totalStops = Number.parseInt(route?.stops, 10) || routeSegments.reduce(
      (sum, segment) => sum + (Number.parseInt(segment?.stopCount, 10) || 0),
      0
    );
    const durationMinutes = this.parseDurationMinutes(route?.duration);
    const farePkr = this.parseFarePkr(route?.fare);
    const fareText =
      typeof route?.fare === 'string' && route.fare.trim().length > 0
        ? route.fare
        : farePkr !== null
          ? `Rs. ${farePkr}`
          : 'Rs. 0';

    return {
      duration: route?.duration || `${durationMinutes} min`,
      durationMinutes,
      transfers: transferCount,
      totalStops,
      fare: fareText,
      farePkr,
      transferCount,
      busesUsed: busesUsed.length ? busesUsed : [...new Set(busSequence)],
      busSequence,
      routeSegments,
      tripLegs,
    };
  }

  async findRoutesViaExternalApi(startStop, endStop, maxRoutes = 6) {
    const endpoint = this.buildExternalRoutesUrl(startStop, endStop);
    console.log(`🌐 Fetching external routes: ${endpoint}`);

    const payload = await this.fetchExternalJson(endpoint);
    const graph = await this.getGraph();
    const stopNameIndex = this.buildStopNameIndex(graph);
    const routes = this.extractExternalRoutes(payload)
      .map((route) => this.normalizeExternalRoute(route, stopNameIndex))
      .filter((route) => route.routeSegments.length > 0);

    if (routes.length === 0) {
      throw new Error('No route found from external API');
    }

    const limit = Math.max(1, Number.parseInt(maxRoutes, 10) || routes.length);
    return {
      routes: routes.slice(0, limit),
    };
  }

  mapExternalPayloadToRouteFormat(payload, maxRoutes = 6) {
    const graph = this.graph || {};
    const stopNameIndex = this.buildStopNameIndex(graph);
    const routes = this.extractExternalRoutes(payload)
      .map((route) => this.normalizeExternalRoute(route, stopNameIndex))
      .filter((route) => route.routeSegments.length > 0);

    if (routes.length === 0) {
      throw new Error('No route found from external API');
    }

    const limit = Math.max(1, Number.parseInt(maxRoutes, 10) || routes.length);
    return {
      routes: routes.slice(0, limit),
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

      const graph = await this.getGraph();
      const startResolvedCandidates = startCandidates
        .map((candidate) => graph[candidate?.stop_id])
        .filter(Boolean);
      const endResolvedCandidates = endCandidates
        .map((candidate) => graph[candidate?.stop_id])
        .filter(Boolean);

      if (!startResolvedCandidates.length || !endResolvedCandidates.length) {
        throw new Error('Could not resolve stop coordinates for external route API');
      }

      if (startResolvedCandidates.length > 1 || endResolvedCandidates.length > 1) {
        console.log(
          `⚠️ Multiple stop variants found (start: ${startResolvedCandidates.length}, end: ${endResolvedCandidates.length}); selecting best coordinate pair by least walking`
        );
      }

      const bestCandidate = await this.fetchBestExternalPayload(
        startResolvedCandidates,
        endResolvedCandidates
      );

      return this.mapExternalPayloadToRouteFormat(bestCandidate.payload, maxRoutes);
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
      throw new Error(isApiError ? 'Server error. Please restart the server.' : `Failed to find route: ${error.message}`);
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

      const result = await this.findRoutesViaExternalApi(
        graph[startStopId],
        graph[endStopId],
        1
      );

      if (!result.routes.length) {
        throw new Error('No route found between these stops');
      }

      return result.routes[0];
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
      const stops = [];
      const seenBaseStopIds = new Set();

      Object.values(graph).forEach((stop) => {
        const stopId = typeof stop.stop_id === 'string' ? stop.stop_id : '';
        const baseStopId = stopId.replace(/_(up|down)$/i, '');

        if (seenBaseStopIds.has(baseStopId)) {
          return;
        }

        seenBaseStopIds.add(baseStopId);
        stops.push({
          stop_id: stop.stop_id,
          stop_name: stop.stop_name,
          stop_lat: stop.stop_lat,
          stop_lon: stop.stop_lon,
        });
      });

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

  async saveRouteSearchHistory({
    userId,
    startingPoint,
    destination,
    startStopId,
    endStopId,
    searchType,
  }) {
    try {
      if (!userId) {
        throw new Error('userId is required to save route search history');
      }

      if (!startingPoint || !destination) {
        throw new Error('startingPoint and destination are required');
      }

      const savedSearch = await RouteSearch.create({
        userId,
        startingPoint,
        destination,
        startStopId,
        endStopId,
        searchType,
      });

      return savedSearch;
    } catch (error) {
      console.error('❌ Save route search history error:', error);
      throw new Error(`Failed to save route search history: ${error.message}`);
    }
  }

  async getRouteSearchHistory(userId) {
    try {
      if (!userId) {
        throw new Error('userId is required to fetch route search history');
      }

      const history = await RouteSearch.find({ userId })
        .sort({ createdAt: -1 })
        .select('_id startingPoint destination startStopId endStopId searchType createdAt updatedAt');

      return history;
    } catch (error) {
      console.error('❌ Get route search history error:', error);
      throw new Error(`Failed to get route search history: ${error.message}`);
    }
  }

  async saveFavoriteRoute({ userId, startingPoint, destination, tripName, routeData }) {
    try {
      if (!userId) {
        throw new Error('userId is required to save favorite route');
      }

      if (!startingPoint || !destination || !routeData) {
        throw new Error('startingPoint, destination, and routeData are required');
      }

      const favoriteRoute = await FavoriteRoute.create({
        userId,
        startingPoint,
        destination,
        tripName,
        routeData,
      });

      return favoriteRoute;
    } catch (error) {
      console.error('❌ Save favorite route error:', error);
      throw new Error(`Failed to save favorite route: ${error.message}`);
    }
  }

  async getFavoriteRoutes(userId) {
    try {
      if (!userId) {
        throw new Error('userId is required to fetch favorite routes');
      }

      const favorites = await FavoriteRoute.find({ userId })
        .sort({ createdAt: -1 })
        .select('_id startingPoint destination tripName routeData createdAt updatedAt');

      return favorites;
    } catch (error) {
      console.error('❌ Get favorite routes error:', error);
      throw new Error(`Failed to get favorite routes: ${error.message}`);
    }
  }
}

module.exports = new RouteFinderService();
