/**
 * Timeline Calculator Utility
 * Generates detailed real-time journey timelines with stop-by-stop information
 */

class TimelineCalculator {
  constructor() {
    this.averageWaitingTimeMinutes = 5; // Average waiting time between buses
    this.boardingTimeMinutes = 2; // Time to board a bus
    this.defaultStopDwellTime = 0.5; // Default time at each stop in minutes
  }

  /**
   * Parse duration string from API (e.g., "45 min", "1 hour 30 min")
   */
  parseDurationMinutes(durationStr) {
    if (!durationStr) return 0;
    if (typeof durationStr === 'number') return Math.round(durationStr);

    const str = String(durationStr).toLowerCase();
    let totalMinutes = 0;

    const hourMatch = str.match(/(\d+)\s*(?:hour|hr|h)/);
    if (hourMatch) {
      totalMinutes += parseInt(hourMatch[1]) * 60;
    }

    const minMatch = str.match(/(\d+)\s*(?:min|m)(?!ax)/);
    if (minMatch) {
      totalMinutes += parseInt(minMatch[1]);
    }

    return Math.max(0, totalMinutes);
  }

  /**
   * Calculate distance in km from segment distance (handles various formats)
   */
  parseDistanceKm(distance) {
    if (!distance) return 0;
    if (typeof distance === 'number' && Number.isFinite(distance)) {
      // External sources sometimes send meters and sometimes kilometers.
      // Heuristic: values > 100 are likely meters, otherwise kilometers.
      const kmValue = distance > 100 ? distance / 1000 : distance;
      return parseFloat(kmValue.toFixed(2));
    }

    const str = String(distance).toLowerCase();
    const match = str.match(/(\d+(?:\.\d+)?)/);
    
    if (!match) return 0;
    const value = parseFloat(match[1]);
    
    if (str.includes('km')) return parseFloat(value.toFixed(2));
    if (str.includes('m')) return parseFloat((value / 1000).toFixed(2));
    
    return parseFloat(value.toFixed(2));
  }

  /**
   * Calculate travel time for a segment based on distance and estimated duration
   * Uses either provided duration or calculates based on distance
   */
  calculateSegmentTravelTime(segment, distanceKmPerMinute = 0.583) {
    // If segment has duration info, use it
    if (segment.duration) {
      const parsed = this.parseDurationMinutes(segment.duration);
      if (parsed > 0) {
        return parsed;
      }
    }

    // Otherwise calculate based on distance and average speed
    const distanceKm = this.parseDistanceKm(segment.distance);
    if (distanceKm > 0) {
      // Approximately 35 km/h average speed in cities = 0.583 km/min
      return Math.max(1, Math.round(distanceKm / distanceKmPerMinute));
    }

    // Default: estimate based on stop count (0.5 min per stop)
    const stopCount = segment.stopCount || 2;
    return Math.max(1, Math.round((stopCount - 1) * this.defaultStopDwellTime) + 5); // Base 5 min + dwell time
  }

  getSegmentWeight(segment) {
    const explicitDuration = this.parseDurationMinutes(segment?.duration);
    if (explicitDuration > 0) {
      return explicitDuration;
    }

    const distanceKm = this.parseDistanceKm(segment?.distance);
    if (distanceKm > 0) {
      return distanceKm;
    }

    const stopCount = Number.parseInt(segment?.stopCount, 10) || (Array.isArray(segment?.stops) ? segment.stops.length : 2);
    return Math.max(1, stopCount - 1);
  }

  allocateSegmentTravelMinutes(routeSegments, totalTravelMinutes) {
    const safeTotal = Math.max(0, Math.round(totalTravelMinutes));
    if (!Array.isArray(routeSegments) || routeSegments.length === 0) {
      return [];
    }

    const weights = routeSegments.map((segment) => this.getSegmentWeight(segment));
    const weightSum = weights.reduce((sum, weight) => sum + weight, 0) || routeSegments.length;

    const rawAllocations = weights.map((weight) => (safeTotal * weight) / weightSum);
    const allocations = rawAllocations.map((value) => Math.floor(value));
    let remainder = safeTotal - allocations.reduce((sum, value) => sum + value, 0);

    // Distribute leftover minutes to the segments with largest fractional parts.
    const ranked = rawAllocations
      .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
      .sort((a, b) => b.fraction - a.fraction);

    for (let i = 0; i < remainder; i++) {
      const target = ranked[i % ranked.length];
      allocations[target.index] += 1;
    }

    return allocations;
  }

  /**
   * Distribute travel time across stops proportionally
   */
  distributeTimeAcrossStops(stops, totalTravelTimeMinutes) {
    if (!stops || stops.length < 2) {
      return [];
    }

    const stopTimings = [];
    const timePerStop = totalTravelTimeMinutes / (stops.length - 1);

    stops.forEach((stop, index) => {
      stopTimings.push({
        stop,
        isStart: index === 0,
        isEnd: index === stops.length - 1,
        timeFromPrevious: index === 0 ? 0 : timePerStop,
        cumulativeTime: index * timePerStop,
      });
    });

    return stopTimings;
  }

  /**
   * Create timeline entry for a stop
   */
  createTimelineEntry(stop, arrivalTime, departureTime, busName, busRouteId, isFirstStop, isLastStop, waitingTime = 0) {
    return {
      stopId: stop.stop_id || '',
      stopName: stop.stop_name || 'Unknown Stop',
      stopLat: stop.stop_lat,
      stopLon: stop.stop_lon,
      bus: busName,
      busRouteId: busRouteId,
      arrivalTime: this.formatTime(arrivalTime),
      arrivalTimeMs: arrivalTime.getTime(),
      departureTime: this.formatTime(departureTime),
      departureTimeMs: departureTime.getTime(),
      dwellTimeMinutes: Math.round((departureTime - arrivalTime) / 60000),
      waiting: {
        hasWaiting: waitingTime > 0 && !isLastStop,
        timeMinutes: waitingTime,
        reason: waitingTime > 0 ? 'Transfer' : 'Final Stop',
      },
      isFirstStop,
      isLastStop: isLastStop,
      actions: this.generateStopActions(isLastStop, waitingTime > 0),
    };
  }

  /**
   * Generate suggested actions for each stop
   */
  generateStopActions(isLastStop, hasNextBus) {
    const actions = [];

    if (!isLastStop) {
      actions.push('Board bus');
    }
    if (hasNextBus) {
      actions.push('Wait for next bus');
      actions.push('Find waiting area');
    }
    if (isLastStop) {
      actions.push('Alight bus');
      actions.push('End of journey');
    }

    return actions;
  }

  /**
   * Format time as HH:MM AM/PM
   */
  formatTime(date) {
    if (!(date instanceof Date)) return '';
    
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    return `${hours}:${minutes}:${seconds}`;
  }

  /**
   * Format time in 12-hour format with AM/PM
   */
  formatTime12Hour(date) {
    if (!(date instanceof Date)) return '';
    
    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    
    return `${hours}:${minutes} ${ampm}`;
  }

  /**
   * Generate complete timeline for a route
   */
  generateTimeline(routeSegments, startTime = new Date(), expectedDurationMinutes = null) {
    if (!routeSegments || !Array.isArray(routeSegments) || routeSegments.length === 0) {
      return {
        timeline: [],
        summary: {
          startTime: this.formatTime(startTime),
          endTime: this.formatTime(startTime),
          totalDuration: 0,
          totalWaitingTime: 0,
        },
      };
    }

    const timeline = [];
    let currentTime = new Date(startTime.getTime());

    const transferCount = Math.max(0, routeSegments.length - 1);
    const configuredWaiting = transferCount * this.averageWaitingTimeMinutes;
    const expectedDuration = Number.isFinite(expectedDurationMinutes)
      ? Math.max(0, Math.round(expectedDurationMinutes))
      : null;
    const totalWaitingTime = expectedDuration !== null
      ? Math.min(configuredWaiting, expectedDuration)
      : configuredWaiting;

    const totalTravelMinutes = expectedDuration !== null
      ? Math.max(0, expectedDuration - totalWaitingTime)
      : routeSegments.reduce(
          (sum, segment) => sum + this.calculateSegmentTravelTime(segment),
          0
        );

    const segmentTravelAllocations = this.allocateSegmentTravelMinutes(
      routeSegments,
      totalTravelMinutes
    );

    routeSegments.forEach((segment, segmentIndex) => {
      if (!Array.isArray(segment.stops) || segment.stops.length === 0) {
        return;
      }

      // Use allocated travel time so full timeline matches route duration.
      const travelTimeMinutes = segmentTravelAllocations[segmentIndex] || 0;
      
      // Distribute time across stops
      const stopTimings = this.distributeTimeAcrossStops(
        segment.stops,
        travelTimeMinutes
      );

      let segmentStartTime = new Date(currentTime.getTime());

      // Process each stop in this segment
      stopTimings.forEach((stopTiming, stopIndex) => {
        const stop = stopTiming.stop;
        const isFirstStopOfSegment = stopIndex === 0;
        const isLastStopOfSegment = stopIndex === segment.stops.length - 1;
        const isLastSegment = segmentIndex === routeSegments.length - 1;
        const isLastStop = isLastSegment && isLastStopOfSegment;

        // Calculate arrival and departure times
        const arrivalTime = new Date(
          segmentStartTime.getTime() + stopTiming.cumulativeTime * 60000
        );
        
        // Dwell time at stop (boarding/alighting time)
        const dwellTimeMs = isLastStop
          ? 0
          : isFirstStopOfSegment
            ? this.boardingTimeMinutes * 60000
            : 1000; // Boarding takes longer, final stop has no dwell
        const departureTime = new Date(arrivalTime.getTime() + dwellTimeMs);

        // Waiting time after this stop (for transfer between buses)
        const waitingAfterStop = isLastStop ? 0 : (isLastStopOfSegment ? this.averageWaitingTimeMinutes : 0);

        const timelineEntry = this.createTimelineEntry(
          stop,
          arrivalTime,
          departureTime,
          segment.routeName,
          segment.routeId,
          timeline.length === 0,
          isLastStop,
          waitingAfterStop
        );

        timeline.push(timelineEntry);

        // Update current time for next segment
        if (isLastStopOfSegment) {
          currentTime = new Date(segmentStartTime.getTime() + travelTimeMinutes * 60000);
          if (waitingAfterStop > 0) {
            currentTime = new Date(currentTime.getTime() + waitingAfterStop * 60000);
          }
        }
      });
    });

    const totalDurationMinutes = expectedDuration !== null
      ? expectedDuration
      : Math.round((currentTime.getTime() - startTime.getTime()) / 60000);
    const endTime = new Date(startTime.getTime() + totalDurationMinutes * 60000);

    return {
      timeline,
      summary: {
        startTime: this.formatTime(startTime),
        startTime12Hour: this.formatTime12Hour(startTime),
        endTime: this.formatTime(endTime),
        endTime12Hour: this.formatTime12Hour(endTime),
        totalDurationMinutes,
        totalDurationFormatted: this.formatDuration(totalDurationMinutes),
        totalWaitingTimeMinutes: Math.round(totalWaitingTime),
        journeyStops: timeline.length,
        transfers: transferCount,
      },
      stops: timeline.map((entry, index) => ({
        sequence: index + 1,
        ...entry,
      })),
    };
  }

  /**
   * Format duration in a readable way
   */
  formatDuration(minutes) {
    if (minutes < 60) {
      return `${minutes} min`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }

  /**
   * Calculate timeline for external API routes
   */
  generateTimelineForExternalRoutes(routes, startTime = new Date()) {
    if (!Array.isArray(routes)) {
      return [];
    }

    return routes.map((route) => ({
      ...route,
      timeline: this.generateTimeline(route.routeSegments, startTime),
      realTimeStart: this.formatTime(startTime),
      realTimeStart12Hour: this.formatTime12Hour(startTime),
    }));
  }
}

module.exports = new TimelineCalculator();
