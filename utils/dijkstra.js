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
    const firstStopId = first.stop_id ?? first['\uFEFFstop_id'];
    const firstStopName = first.stop_name ?? first['\uFEFFstop_name'];
    console.log(`  📍 First stop.stop_id: "${firstStopId}"`);
    console.log(`  📍 First stop.stop_name: "${firstStopName}"`);
  }

  stops.forEach((stop) => {
    let stopId = stop?.stop_id ?? stop?.['\uFEFFstop_id'];
    const stopName = stop?.stop_name ?? stop?.['\uFEFFstop_name'];
    const stopLat = stop?.stop_lat ?? stop?.['\uFEFFstop_lat'];
    const stopLon = stop?.stop_lon ?? stop?.['\uFEFFstop_lon'];

    // Trim stop_id to handle whitespace issues
    if (stopId && typeof stopId === 'string') {
      stopId = stopId.trim();
    }

    if (stopId && stopName) {
      graph[stopId] = {
        stop_id: stopId,
        stop_name: stopName,
        stop_lat: parseFloat(stopLat),
        stop_lon: parseFloat(stopLon),
        neighbors: [],
      };
    } else {
      console.log(`  ⚠️ Skipping stop with missing data: stop_id="${stopId}", stop_name="${stopName}"`);
    }
  });

  console.log(`✓ buildStopGraph: Added ${Object.keys(graph).length} stops`);
  return graph;
};

/**
 * Add nearby transfer edges within a radius (walking transfers).
 * @param {Array} stops - Array of stops from GTFS
 * @param {Object} graph - Graph object with stops
 * @param {number} radiusKm - Radius in kilometers
 * @param {number} transferPenaltyKm - Optional penalty to discourage transfers
 */
const addNearbyTransferEdges = (
  stops,
  graph,
  radiusKm = 0.2,
  transferPenaltyKm = 0
) => {
  if (!Array.isArray(stops) || stops.length === 0) {
    console.log('✓ addNearbyTransferEdges: No stops provided');
    return graph;
  }

  let addedEdges = 0;

  for (let i = 0; i < stops.length; i += 1) {
    const fromId = stops[i]?.stop_id;
    const fromStop = fromId ? graph[fromId] : null;
    if (!fromStop) {
      continue;
    }

    for (let j = i + 1; j < stops.length; j += 1) {
      const toId = stops[j]?.stop_id;
      const toStop = toId ? graph[toId] : null;
      if (!toStop) {
        continue;
      }

      const distance =
        calculateDistance(
          fromStop.stop_lat,
          fromStop.stop_lon,
          toStop.stop_lat,
          toStop.stop_lon
        ) + transferPenaltyKm;

      if (!Number.isFinite(distance) || distance > radiusKm) {
        continue;
      }

      const hasEdge = fromStop.neighbors.some((n) => n.stop_id === toId);
      if (!hasEdge) {
        fromStop.neighbors.push({
          stop_id: toId,
          distance,
          trip_id: 'TRANSFER_NEARBY',
        });
        addedEdges += 1;
      }

      const hasReverse = toStop.neighbors.some((n) => n.stop_id === fromId);
      if (!hasReverse) {
        toStop.neighbors.push({
          stop_id: fromId,
          distance,
          trip_id: 'TRANSFER_NEARBY',
        });
        addedEdges += 1;
      }
    }
  }

  console.log(`✓ addNearbyTransferEdges: Added ${addedEdges} transfer edges`);
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
  const tripSequences = new Map();

  stopTimes.forEach((stopTime) => {
    const tripId = stopTime?.trip_id;
    if (!tripId) {
      return;
    }

    if (!tripSequences.has(tripId)) {
      tripSequences.set(tripId, []);
    }
    tripSequences.get(tripId).push(stopTime);
  });

  console.log(`✓ buildAdjacencyList: Found ${tripSequences.size} unique trips`);

  const neighborMaps = new Map();
  const getNeighborMap = (stopId) => {
    if (!neighborMaps.has(stopId)) {
      neighborMaps.set(stopId, new Map());
    }
    return neighborMaps.get(stopId);
  };

  // Seed neighbor maps with any existing neighbors (e.g., transfer edges)
  Object.keys(graph).forEach((stopId) => {
    const neighbors = graph[stopId]?.neighbors || [];
    const map = getNeighborMap(stopId);
    neighbors.forEach((neighbor) => {
      if (!neighbor?.stop_id) {
        return;
      }
      const existing = map.get(neighbor.stop_id);
      if (!existing || neighbor.distance < existing.distance) {
        map.set(neighbor.stop_id, { ...neighbor });
      }
    });
  });

  // For each trip, connect consecutive stops
  let skippedStops = 0;
  let addedEdges = 0;
  const missingStops = new Set();
  
  tripSequences.forEach((sequence, tripId) => {
    // Sort by stop_sequence if available
    sequence.sort((a, b) => {
      const seqA = parseInt(a.stop_sequence || 0, 10);
      const seqB = parseInt(b.stop_sequence || 0, 10);
      return seqA - seqB;
    });

    // Connect consecutive stops in the trip
    for (let i = 0; i < sequence.length - 1; i++) {
      let currentStopId = sequence[i]?.stop_id;
      let nextStopId = sequence[i + 1]?.stop_id;

      // Trim stop IDs to handle whitespace issues
      if (currentStopId && typeof currentStopId === 'string') {
        currentStopId = currentStopId.trim();
      }
      if (nextStopId && typeof nextStopId === 'string') {
        nextStopId = nextStopId.trim();
      }

      if (!currentStopId || !nextStopId) {
        continue;
      }

      if (!graph[currentStopId]) {
        missingStops.add(currentStopId);
        skippedStops++;
        continue;
      }
      
      if (!graph[nextStopId]) {
        missingStops.add(nextStopId);
        skippedStops++;
        continue;
      }

      if (graph[currentStopId] && graph[nextStopId]) {
        const currentStop = graph[currentStopId];
        const nextStop = graph[nextStopId];

        const distance = calculateDistance(
          currentStop.stop_lat,
          currentStop.stop_lon,
          nextStop.stop_lat,
          nextStop.stop_lon
        );

        if (!Number.isFinite(distance)) {
          continue;
        }

        const map = getNeighborMap(currentStopId);
        const existing = map.get(nextStopId);
        if (!existing || distance < existing.distance) {
          map.set(nextStopId, {
            stop_id: nextStopId,
            distance: distance,
            trip_id: sequence[i].trip_id,
          });
          addedEdges++;
        }
      }
    }
  });

  if (skippedStops > 0) {
    console.log(`  ⚠️ Skipped ${skippedStops} stop connections due to missing stops in stops.txt:`);
    console.log(`     Missing stops: ${Array.from(missingStops).join(', ')}`);
  }

  // Write neighbor maps back to graph
  let totalEdges = 0;
  neighborMaps.forEach((neighbors, stopId) => {
    graph[stopId].neighbors = Array.from(neighbors.values());
    totalEdges += neighbors.size;
  });

  console.log(`✓ buildAdjacencyList: Added ${totalEdges} edges from ${tripSequences.size} trips`);

  return graph;
};

/**
 * Add transfer edges based on GTFS transfers.txt.
 * @param {Array} transfers - Array of transfers from GTFS
 * @param {Object} graph - Graph object with stops
 * @param {number} transferPenaltyKm - Optional penalty to discourage transfers
 */
const addTransferEdges = (transfers, graph, transferPenaltyKm = 0) => {
  if (!Array.isArray(transfers) || transfers.length === 0) {
    console.log('✓ addTransferEdges: No transfers provided');
    return graph;
  }

  let addedEdges = 0;

  transfers.forEach((transfer) => {
    const fromId = transfer?.from_stop_id;
    const toId = transfer?.to_stop_id;

    if (!fromId || !toId) {
      return;
    }

    const fromStop = graph[fromId];
    const toStop = graph[toId];

    if (!fromStop || !toStop) {
      return;
    }

    const distance =
      calculateDistance(
        fromStop.stop_lat,
        fromStop.stop_lon,
        toStop.stop_lat,
        toStop.stop_lon
      ) + transferPenaltyKm;

    if (!Number.isFinite(distance)) {
      return;
    }

    const hasEdge = fromStop.neighbors.some((n) => n.stop_id === toId);
    if (!hasEdge) {
      fromStop.neighbors.push({
        stop_id: toId,
        distance,
        trip_id: 'TRANSFER',
      });
      addedEdges += 1;
    }
  });

  console.log(`✓ addTransferEdges: Added ${addedEdges} transfer edges`);
  return graph;
};

/**
 * Add automatic bidirectional transfers between stops at the same location
 * Recognizes stops with _up/_down suffixes as same physical location
 * @param {Object} graph - Graph object with stops
 */
const addSameLocationTransfers = (graph) => {
  if (!graph || Object.keys(graph).length === 0) {
    console.log('✓ addSameLocationTransfers: No graph provided');
    return graph;
  }

  let addedEdges = 0;
  const stops = Object.values(graph);

  // Create a map of base name -> list of stops with that base name
  const baseNameMap = new Map();

  stops.forEach((stop) => {
    let stopId = stop.stop_id;
    
    // Trim stop_id to handle whitespace
    if (stopId && typeof stopId === 'string') {
      stopId = stopId.trim();
    }
    
    let baseName = stopId;

    // Remove _up or _down suffix to get base name
    if (stopId.endsWith('_up')) {
      baseName = stopId.slice(0, -3);
    } else if (stopId.endsWith('_down')) {
      baseName = stopId.slice(0, -5);
    }

    if (!baseNameMap.has(baseName)) {
      baseNameMap.set(baseName, []);
    }
    baseNameMap.get(baseName).push(stop);
  });

  // For each base name with multiple stops (up/down variants), add bidirectional transfers
  baseNameMap.forEach((stopsAtLocation, baseName) => {
    if (stopsAtLocation.length < 2) {
      return; // No transfer needed for single stop
    }

    console.log(`  🔄 Adding transfers for ${baseName}: ${stopsAtLocation.map(s => s.stop_id).join(' ↔ ')}`);

    // Add bidirectional transfers between all stops at this location
    for (let i = 0; i < stopsAtLocation.length; i++) {
      for (let j = i + 1; j < stopsAtLocation.length; j++) {
        const stop1 = stopsAtLocation[i];
        const stop2 = stopsAtLocation[j];

        // Add edge from stop1 to stop2
        const hasEdge1 = stop1.neighbors.some((n) => n.stop_id === stop2.stop_id);
        if (!hasEdge1) {
          stop1.neighbors.push({
            stop_id: stop2.stop_id,
            distance: 0.001, // Minimal distance for same-location transfers
            trip_id: 'TRANSFER_SAME_LOCATION',
          });
          addedEdges += 1;
        }

        // Add edge from stop2 to stop1
        const hasEdge2 = stop2.neighbors.some((n) => n.stop_id === stop1.stop_id);
        if (!hasEdge2) {
          stop2.neighbors.push({
            stop_id: stop1.stop_id,
            distance: 0.001, // Minimal distance for same-location transfers
            trip_id: 'TRANSFER_SAME_LOCATION',
          });
          addedEdges += 1;
        }
      }
    }
  });

  console.log(`✓ addSameLocationTransfers: Added ${addedEdges} transfer edges between _up/_down pairs`);
  return graph;
};

/**
 * Dijkstra's algorithm to find shortest path between two stops
 * @param {Object} graph - Graph with stops and adjacency
 * @param {string} startStopId - Start stop ID
 * @param {string} endStopId - End stop ID
 * @param {Object} options - Optional constraints
 * @param {Set<string>} options.blockedNodes - Stop IDs to skip
 * @param {Set<string>} options.blockedEdges - Edge keys in form "from->to"
 * @returns {Object} Path information with distance and route
 */
const dijkstraShortestPath = (
  graph,
  startStopId,
  endStopId,
  options = {}
) => {
  const blockedNodes = options.blockedNodes || new Set();
  const blockedEdges = options.blockedEdges || new Set();

  // Validate stops
  if (!graph[startStopId] || !graph[endStopId]) {
    return {
      success: false,
      message: 'Invalid stop IDs',
    };
  }

  if (blockedNodes.has(startStopId) || blockedNodes.has(endStopId)) {
    return {
      success: false,
      message: 'Start or end stop is blocked',
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
    if (currentStopId === endStopId) {
      break;
    }
    
    if (minDistance === Infinity) {
      // No path found - log diagnostic info
      console.log(`  ⚠️ No path exists from ${startStopId} to ${endStopId}`);
      const startStop = graph[startStopId];
      const endStop = graph[endStopId];
      console.log(`  📍 Start stop neighbors: ${startStop?.neighbors?.length || 0}`);
      if (startStop?.neighbors && startStop.neighbors.length > 0) {
        console.log(`     Neighbors: ${startStop.neighbors.map(n => `${n.stop_id} (${n.trip_id})`).join(', ')}`);
      }
      console.log(`  📍 End stop neighbors: ${endStop?.neighbors?.length || 0}`);
      if (endStop?.neighbors && endStop.neighbors.length > 0) {
        console.log(`     Neighbors: ${endStop.neighbors.map(n => `${n.stop_id} (${n.trip_id})`).join(', ')}`);
      }
      break;
    }

    unvisited.delete(currentStopId);

    // Check neighbors
    const currentStop = graph[currentStopId];
    currentStop.neighbors.forEach((neighbor) => {
      if (!neighbor?.stop_id) {
        return;
      }

      if (blockedNodes.has(neighbor.stop_id)) {
        return;
      }

      const edgeKey = `${currentStopId}->${neighbor.stop_id}`;
      if (blockedEdges.has(edgeKey)) {
        return;
      }

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
  const edges = [];
  let current = endStopId;

  while (current !== null) {
    path.unshift({
      stop_id: current,
      stop_name: graph[current].stop_name,
      stop_lat: graph[current].stop_lat,
      stop_lon: graph[current].stop_lon,
    });

    if (previous[current]) {
      edges.unshift({
        from_stop_id: previous[current].stopId,
        to_stop_id: current,
        distance: previous[current].distance,
        trip_id: previous[current].tripId,
      });
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
    routeEdges: edges,
    numberOfStops: path.length,
  };
};

const getEdgeDistance = (graph, fromId, toId) => {
  const fromStop = graph[fromId];
  if (!fromStop || !Array.isArray(fromStop.neighbors)) {
    return Infinity;
  }

  const edge = fromStop.neighbors.find((n) => n.stop_id === toId);
  return edge ? edge.distance : Infinity;
};

const pathDistance = (graph, pathIds) => {
  let total = 0;
  for (let i = 0; i < pathIds.length - 1; i += 1) {
    const distance = getEdgeDistance(graph, pathIds[i], pathIds[i + 1]);
    if (!Number.isFinite(distance)) {
      return Infinity;
    }
    total += distance;
  }
  return total;
};

const buildRouteFromIds = (graph, pathIds, totalDistance) => {
  const routeStops = pathIds.map((id) => ({
    stop_id: id,
    stop_name: graph[id].stop_name,
    stop_lat: graph[id].stop_lat,
    stop_lon: graph[id].stop_lon,
  }));

  // Build edges for fare calculation
  const routeEdges = [];
  for (let i = 0; i < pathIds.length - 1; i += 1) {
    const fromStop = graph[pathIds[i]];
    if (fromStop && fromStop.neighbors) {
      const edge = fromStop.neighbors.find((n) => n.stop_id === pathIds[i + 1]);
      if (edge) {
        routeEdges.push({
          from_stop_id: pathIds[i],
          to_stop_id: pathIds[i + 1],
          distance: edge.distance,
          trip_id: edge.trip_id,
        });
      }
    }
  }

  return {
    success: true,
    startStop: graph[pathIds[0]],
    endStop: graph[pathIds[pathIds.length - 1]],
    totalDistance,
    routeKey: pathIds.join('>'),
    routeStops,
    routeEdges,
    numberOfStops: routeStops.length,
  };
};

/**
 * Yen's algorithm to find K shortest loopless paths
 * @param {Object} graph - Graph with stops and adjacency
 * @param {string} startStopId - Start stop ID
 * @param {string} endStopId - End stop ID
 * @param {number} k - Max number of paths
 * @returns {Array} Array of route objects
 */
const kShortestPaths = (graph, startStopId, endStopId, k = 3) => {
  const first = dijkstraShortestPath(graph, startStopId, endStopId);
  if (!first.success) {
    return [];
  }

  const shortestPaths = [first];
  const candidates = [];
  const usedKeys = new Set([
    first.routeStops.map((s) => s.stop_id).join('>'),
  ]);

  for (let pathIndex = 0; pathIndex < k - 1; pathIndex += 1) {
    const basePath = shortestPaths[pathIndex];
    const baseIds = basePath.routeStops.map((s) => s.stop_id);

    for (let i = 0; i < baseIds.length - 1; i += 1) {
      const spurNode = baseIds[i];
      const rootPathIds = baseIds.slice(0, i + 1);

      const blockedNodes = new Set(rootPathIds.slice(0, -1));
      const blockedEdges = new Set();

      shortestPaths.forEach((path) => {
        const pathIds = path.routeStops.map((s) => s.stop_id);
        const isSameRoot = rootPathIds.every(
          (id, idx) => pathIds[idx] === id
        );
        if (isSameRoot && pathIds.length > i + 1) {
          blockedEdges.add(`${pathIds[i]}->${pathIds[i + 1]}`);
        }
      });

      const spurPath = dijkstraShortestPath(graph, spurNode, endStopId, {
        blockedNodes,
        blockedEdges,
      });

      if (!spurPath.success) {
        continue;
      }

      const spurIds = spurPath.routeStops.map((s) => s.stop_id);
      const combinedIds = rootPathIds.concat(spurIds.slice(1));
      const totalDistance = pathDistance(graph, combinedIds);

      if (!Number.isFinite(totalDistance)) {
        continue;
      }
      const key = combinedIds.join('>');

      if (!usedKeys.has(key)) {
        candidates.push(buildRouteFromIds(graph, combinedIds, totalDistance));
        usedKeys.add(key);
      }
    }

    if (candidates.length === 0) {
      break;
    }

    candidates.sort((a, b) => a.totalDistance - b.totalDistance);
    shortestPaths.push(candidates.shift());
  }

  return shortestPaths;
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
  addTransferEdges,
  addSameLocationTransfers,
  addNearbyTransferEdges,
  dijkstraShortestPath,
  kShortestPaths,
  findNearbyStops,
};
