/**
 * Timeline Feature Test
 * Demonstrates real-time timeline generation for routes
 */

const timelineCalculator = require('../utils/timelineCalculator');

// Mock route segment data for testing
const mockRouteSegments = [
  {
    routeName: 'RED_LINE',
    routeId: 'red',
    stops: [
      {
        stop_id: 'stop_1',
        stop_name: 'Downtown Station',
        stop_lat: 24.8607,
        stop_lon: 67.0011,
      },
      {
        stop_id: 'stop_2',
        stop_name: 'Central Station',
        stop_lat: 24.8667,
        stop_lon: 67.0089,
      },
      {
        stop_id: 'stop_3',
        stop_name: 'Hospital Road',
        stop_lat: 24.8725,
        stop_lon: 67.0156,
      },
      {
        stop_id: 'stop_4',
        stop_name: 'Clifton Market',
        stop_lat: 24.8788,
        stop_lon: 67.0224,
      },
      {
        stop_id: 'stop_5',
        stop_name: 'Central Park',
        stop_lat: 24.8845,
        stop_lon: 67.0289,
      },
    ],
    stopCount: 5,
    distance: 8500, // meters
    duration: '15 min', // optional
    boardingStop: 'Downtown Station',
    alightingStop: 'Central Park',
  },
  {
    routeName: 'BLUE_LINE',
    routeId: 'blue',
    stops: [
      {
        stop_id: 'stop_5',
        stop_name: 'Central Park',
        stop_lat: 24.8845,
        stop_lon: 67.0289,
      },
      {
        stop_id: 'stop_6',
        stop_name: 'Sunset Boulevard',
        stop_lat: 24.8902,
        stop_lon: 67.0356,
      },
      {
        stop_id: 'stop_7',
        stop_name: 'Marina Station',
        stop_lat: 24.8959,
        stop_lon: 67.0423,
      },
      {
        stop_id: 'stop_8',
        stop_name: 'Airport Terminal',
        stop_lat: 24.9016,
        stop_lon: 67.0489,
      },
    ],
    stopCount: 4,
    distance: 6200, // meters
    duration: '12 min', // optional
    boardingStop: 'Central Park',
    alightingStop: 'Airport Terminal',
  },
];

// Test function
function testTimelineGeneration() {
  console.log('🧪 Testing Timeline Generation\n');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Use current time as start time
  const startTime = new Date();
  console.log(`📍 Journey Start Time: ${timelineCalculator.formatTime12Hour(startTime)}\n`);

  // Generate timeline
  const timeline = timelineCalculator.generateTimeline(mockRouteSegments, startTime);

  // Display summary
  console.log('📊 JOURNEY SUMMARY');
  console.log('─────────────────────────────────────────────────────────────');
  console.log(`  Start Time (24h): ${timeline.summary.startTime}`);
  console.log(`  Start Time (12h): ${timeline.summary.startTime12Hour}`);
  console.log(`  End Time (24h):   ${timeline.summary.endTime}`);
  console.log(`  End Time (12h):   ${timeline.summary.endTime12Hour}`);
  console.log(`  Total Duration:   ${timeline.summary.totalDurationFormatted}`);
  console.log(`  Total Duration:   ${timeline.summary.totalDurationMinutes} minutes`);
  console.log(`  Total Waiting:    ${timeline.summary.totalWaitingTimeMinutes} minutes`);
  console.log(`  Journey Stops:    ${timeline.summary.journeyStops}`);
  console.log(`  Transfers:        ${timeline.summary.transfers}`);
  console.log('\n');

  // Display each stop in timeline
  console.log('📍 STOP-BY-STOP TIMELINE');
  console.log('─────────────────────────────────────────────────────────────\n');

  timeline.stops.forEach((stop) => {
    const stopMarker = stop.isFirstStop ? '🚩' : stop.isLastStop ? '🏁' : '📍';
    const busMarker = '🚌';

    console.log(`${stopMarker} Stop ${stop.sequence}: ${stop.stopName}`);
    console.log(`   ${busMarker} Bus: ${stop.bus}`);
    console.log(`   📥 Arrival:    ${stop.arrivalTime}`);
    console.log(`   📤 Departure:  ${stop.departureTime}`);
    console.log(`   ⏱️  Dwell:      ${stop.dwellTimeMinutes} minute(s)`);

    if (stop.waiting && stop.waiting.hasWaiting) {
      console.log(`   ⏳ Wait Time:   ${stop.waiting.timeMinutes} minutes (${stop.waiting.reason})`);
    }

    if (stop.actions && stop.actions.length > 0) {
      console.log(`   ✅ Actions:    ${stop.actions.join(', ')}`);
    }

    console.log('');
  });

  // Display route segments
  console.log('🚌 ROUTE SEGMENTS');
  console.log('─────────────────────────────────────────────────────────────\n');

  mockRouteSegments.forEach((segment, index) => {
    console.log(`Segment ${index + 1}: ${segment.routeName} (${segment.routeId})`);
    console.log(`  From: ${segment.boardingStop}`);
    console.log(`  To:   ${segment.alightingStop}`);
    console.log(`  Stops: ${segment.stopCount}`);
    console.log(`  Distance: ${(segment.distance / 1000).toFixed(2)} km`);
    console.log('');
  });

  console.log('═══════════════════════════════════════════════════════════\n');
  console.log('✅ Timeline generation test completed!\n');

  return timeline;
}

// Test with multiple routes (like API response)
function testMultipleRoutes() {
  console.log('🧪 Testing Multiple Routes Timeline\n');
  console.log('═══════════════════════════════════════════════════════════\n');

  const startTime = new Date();
  const routes = [
    { routeSegments: mockRouteSegments },
    { routeSegments: [mockRouteSegments[0]] }, // Single segment route
  ];

  const routesWithTimeline = timelineCalculator.generateTimelineForExternalRoutes(routes, startTime);

  routesWithTimeline.forEach((route, index) => {
    console.log(`\n🛤️  Route Option ${index + 1}`);
    console.log(`───────────────────────────────────────────────────────────`);
    console.log(`  Real Time Start (24h): ${route.realTimeStart}`);
    console.log(`  Real Time Start (12h): ${route.realTimeStart12Hour}`);
    console.log(`  Summary: ${route.timeline.summary.totalDurationFormatted}`);
    console.log(`  Stops: ${route.timeline.summary.journeyStops}`);
    console.log(`  Transfers: ${route.timeline.summary.transfers}`);
  });

  return routesWithTimeline;
}

// Run tests
if (require.main === module) {
  testTimelineGeneration();
  console.log('\n\n');
  testMultipleRoutes();
}

module.exports = {
  testTimelineGeneration,
  testMultipleRoutes,
  mockRouteSegments,
};
