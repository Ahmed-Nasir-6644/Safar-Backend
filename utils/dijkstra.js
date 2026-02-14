/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} Distance in kilometers
 */
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Build a graph from GTFS stops data
 * @param {Array} stops - Array of stops from GTFS
 * @returns {Object} Graph object with stops and adjacency information
 */
const buildStopGraph = (stops) => {
  const graph = {};

  console.log(`🔨 buildStopGraph: Received ${stops.length} stops`);
  
  if (stops.length > 0) {
    const first = stops[0];
    console.log(`  📍 First stop keys: ${Object.keys(first).join(', ')}`);
    console.log(`  📍 First stop.stop_id: "${first.stop_id}"`);
    console.log(`  📍 First stop.stop_name: "${first.stop_name}"`);
  }

  stops.forEach((stop) => {
    if (stop && stop.stop_id && stop.stop_name) {
      graph[stop.stop_id] = {
        stop_id: stop.stop_id,
        stop_name: stop.stop_name,
        stop_lat: parseFloat(stop.stop_lat),
        stop_lon: parseFloat(stop.stop_lon),
        neighbors: [],
      };
    }
  });

  console.log(`✓ buildStopGraph: Added ${Object.keys(graph).length} stops`);
  return graph;
};

/**
 * Build adjacency list from stop_times using trip sequences
 * Each trip represents a route through multiple stops
 * @param {Array} stopTimes - Array of stop_times from GTFS
 * @param {Object} graph - Graph object with stops
 */
const buildAdjacencyList = (stopTimes, graph) => {
  console.log(`🔨 buildAdjacencyList: Processing ${stopTimes.length} stop times with ${Object.keys(graph).length} stops in graph`);
  
  // Group stop_times by trip_id and sort by sequence
  const tripSequences = {};

  stopTimes.forEach((stopTime) => {
    if (!tripSequences[stopTime.trip_id]) {
      tripSequences[stopTime.trip_id] = [];
    }
    tripSequences[stopTime.trip_id].push(stopTime);
  });

  console.log(`✓ buildAdjacencyList: Found ${Object.keys(tripSequences).length} unique trips`);

  // For each trip, connect consecutive stops
  Object.values(tripSequences).forEach((sequence) => {
    // Sort by stop_sequence if available
    sequence.sort((a, b) => {
      const seqA = parseInt(a.stop_sequence || 0);
      const seqB = parseInt(b.stop_sequence || 0);
      return seqA - seqB;
    });

    // Connect consecutive stops in the trip
    for (let i = 0; i < sequence.length - 1; i++) {
      const currentStopId = sequence[i].stop_id;
      const nextStopId = sequence[i + 1].stop_id;

      if (graph[currentStopId] && graph[nextStopId]) {
        const currentStop = graph[currentStopId];
        const nextStop = graph[nextStopId];

        // Calculate distance
        const distance = calculateDistance(
          currentStop.stop_lat,
          currentStop.stop_lon,
          nextStop.stop_lat,
          nextStop.stop_lon
        );

        // Check if neighbor already exists
        const existingNeighbor = currentStop.neighbors.find(
          (n) => n.stop_id === nextStopId
        );

        if (existingNeighbor) {
          existingNeighbor.distance = Math.min(existingNeighbor.distance, distance);
        } else {
          currentStop.neighbors.push({
            stop_id: nextStopId,
            distance: distance,
            trip_id: sequence[i].trip_id,
          });
        }
      }
    }
  });

  return graph;
};

/**
 * Dijkstra's algorithm to find shortest path between two stops
 * @param {Object} graph - Graph with stops and adjacency
 * @param {string} startStopId - Start stop ID
 * @param {string} endStopId - End stop ID
 * @returns {Object} Path information with distance and route
 */
const dijkstraShortestPath = (graph, startStopId, endStopId) => {
  // Validate stops
  if (!graph[startStopId] || !graph[endStopId]) {
    return {
      success: false,
      message: 'Invalid stop IDs',
    };
  }

  const distances = {};
  const previous = {};
  const unvisited = new Set();

  // Initialize distances and unvisited set
  Object.keys(graph).forEach((stopId) => {
    distances[stopId] = stopId === startStopId ? 0 : Infinity;
    previous[stopId] = null;
    unvisited.add(stopId);
  });

  while (unvisited.size > 0) {
    // Find unvisited node with minimum distance
    let currentStopId = null;
    let minDistance = Infinity;

    for (const stopId of unvisited) {
      if (distances[stopId] < minDistance) {
        minDistance = distances[stopId];
        currentStopId = stopId;
      }
    }

    // If we reached the end or no path exists
    if (currentStopId === endStopId || minDistance === Infinity) {
      break;
    }

    unvisited.delete(currentStopId);

    // Check neighbors
    const currentStop = graph[currentStopId];
    currentStop.neighbors.forEach((neighbor) => {
      const newDistance = distances[currentStopId] + neighbor.distance;

      if (newDistance < distances[neighbor.stop_id]) {
        distances[neighbor.stop_id] = newDistance;
        previous[neighbor.stop_id] = {
          stopId: currentStopId,
          distance: neighbor.distance,
          tripId: neighbor.trip_id,
        };
      }
    });
  }

  // Reconstruct path
  const path = [];
  let current = endStopId;

  while (current !== null) {
    path.unshift({
      stop_id: current,
      stop_name: graph[current].stop_name,
      stop_lat: graph[current].stop_lat,
      stop_lon: graph[current].stop_lon,
    });

    if (previous[current]) {
      current = previous[current].stopId;
    } else {
      break;
    }
  }

  // Check if path was found
  if (path.length === 0 || distances[endStopId] === Infinity) {
    return {
      success: false,
      message: 'No route found between these stops',
    };
  }

  return {
    success: true,
    startStop: graph[startStopId],
    endStop: graph[endStopId],
    totalDistance: distances[endStopId],
    routeStops: path,
    numberOfStops: path.length,
  };
};

/**
 * Find all nearby stops within a given radius
 * @param {Object} graph - Graph with stops
 * @param {string} stopId - Center stop ID
 * @param {number} radiusKm - Radius in kilometers
 * @returns {Array} Array of nearby stops
 */
const findNearbyStops = (graph, stopId, radiusKm = 5) => {
  if (!graph[stopId]) {
    return [];
  }

  const centerStop = graph[stopId];
  const nearbyStops = [];

  Object.values(graph).forEach((stop) => {
    if (stop.stop_id !== stopId) {
      const distance = calculateDistance(
        centerStop.stop_lat,
        centerStop.stop_lon,
        stop.stop_lat,
        stop.stop_lon
      );

      if (distance <= radiusKm) {
        nearbyStops.push({
          ...stop,
          distance: distance.toFixed(2),
        });
      }
    }
  });

  // Sort by distance
  nearbyStops.sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance));

  return nearbyStops;
};

module.exports = {
  calculateDistance,
  buildStopGraph,
  buildAdjacencyList,
  dijkstraShortestPath,
  findNearbyStops,
};
