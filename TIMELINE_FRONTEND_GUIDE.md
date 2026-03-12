# Timeline Feature - Frontend Implementation Guide

## Quick Reference

### What's New?
Each route now includes a complete real-time timeline with:
- ✅ Current time as journey start
- ✅ Stop-by-stop arrival/departure times
- ✅ Bus transfer waiting times
- ✅ Total journey duration
- ✅ Stop coordinates and metadata

## Using Timeline Data

### 1. Get the Timeline Object
```javascript
// After fetching routes
const response = await fetch('/api/routes/find/by-name', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({
    startStopName: 'Downtown Station',
    endStopName: 'Airport Terminal'
  })
});

const { data } = await response.json();
const route = data.routes[0];
const timeline = route.timeline;
```

### 2. Access Timeline Summary
```javascript
const { summary } = timeline;

// Display journey time
console.log(`Journey: ${summary.startTime12Hour} → ${summary.endTime12Hour}`);
console.log(`Duration: ${summary.totalDurationFormatted}`);
console.log(`Waiting Time: ${summary.totalWaitingTimeMinutes} min`);
console.log(`Stops: ${summary.journeyStops}`);
console.log(`Transfers: ${summary.transfers}`);
```

### 3. Iterate Through Timeline Stops
```javascript
timeline.stops.forEach((stop, index) => {
  console.log(`
    Stop ${stop.sequence}: ${stop.stopName}
    🚌 Bus: ${stop.bus}
    📥 Arrive: ${stop.arrivalTime}
    📤 Leave:  ${stop.departureTime}
    ⏱️  Dwell:  ${stop.dwellTimeMinutes} min
  `);

  if (stop.waiting.hasWaiting) {
    console.log(`  ⏳ Wait ${stop.waiting.timeMinutes} min (${stop.waiting.reason})`);
  }
});
```

### 4. Build a Visual Timeline Component
```jsx
// React example
function TimelineComponent({ route }) {
  const { timeline, realTimeStart12Hour } = route;
  const { summary, stops } = timeline;

  return (
    <div className="timeline-container">
      <div className="timeline-header">
        <h3>Journey Timeline</h3>
        <p>Start: {realTimeStart12Hour}</p>
      </div>

      <div className="timeline-summary">
        <span>📍 {summary.journeyStops} stops</span>
        <span>🔄 {summary.transfers} transfers</span>
        <span>⏱️ {summary.totalDurationFormatted}</span>
      </div>

      <div className="timeline-stops">
        {stops.map((stop) => (
          <TimelineStop key={stop.stopId} stop={stop} />
        ))}
      </div>
    </div>
  );
}

function TimelineStop({ stop }) {
  return (
    <div className={`stop ${stop.isLastStop ? 'final-stop' : ''}`}>
      <div className="stop-header">
        <h4>{stop.stopName}</h4>
        <span className="bus-badge">{stop.bus}</span>
      </div>

      <div className="stop-times">
        <div>Arrive: {stop.arrivalTime}</div>
        <div>Leave: {stop.departureTime}</div>
      </div>

      {stop.waiting.hasWaiting && (
        <div className="waiting-info">
          ⏳ Wait {stop.waiting.timeMinutes} min for transfer
        </div>
      )}

      <div className="actions">
        {stop.actions.map((action, i) => (
          <button key={i}>{action}</button>
        ))}
      </div>
    </div>
  );
}
```

### 5. Format Times for Display
```javascript
// Use the provided formats
const startTime24h = timeline.summary.startTime;      // "14:23:45"
const startTime12h = timeline.summary.startTime12Hour; // "2:23 PM"

// Or convert timestamps to local time
function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
}

stops.forEach(stop => {
  console.log(`Arrive: ${formatTime(stop.arrivalTimeMs)}`);
  console.log(`Leave: ${formatTime(stop.departureTimeMs)}`);
});
```

### 6. Create a Timeline Row in a Table
```javascript
// Display timeline in a table format
function renderTimelineTable(timeline) {
  const { stops } = timeline;

  const rows = stops.map(stop => ({
    sequence: stop.sequence,
    stop: stop.stopName,
    bus: stop.bus,
    arrive: stop.arrivalTime,
    depart: stop.departureTime,
    wait: stop.waiting.hasWaiting ? `${stop.waiting.timeMinutes} min` : '-',
    action: stop.actions[0] || '-'
  }));

  return rows;
}
```

### 7. Calculate Time Until Next Bus
```javascript
// Get the current time comparison
function getTimeUntilStop(stop) {
  const now = new Date();
  const departTime = new Date(stop.departureTimeMs);
  const diffMs = departTime - now;
  const diffMins = Math.floor(diffMs / 60000);

  return diffMins > 0 ? `${diffMins} min` : 'Now';
}

stops.forEach(stop => {
  console.log(`Time to reach ${stop.stopName}: ${getTimeUntilStop(stop)}`);
});
```

### 8. Build a Journey Map with Timeline
```javascript
// Combine timeline with map display
function plotTimelineOnMap(map, timeline) {
  const { stops } = timeline;

  stops.forEach((stop, index) => {
    const marker = new Marker({
      lat: stop.stopLat,
      lng: stop.stopLon,
      title: `${index + 1}. ${stop.stopName} (${stop.arrivalTime})`,
      color: stop.isLastStop ? 'red' : 'blue'
    });

    marker.addTo(map);
    
    // Add popup with timeline info
    marker.bindPopup(`
      <strong>${stop.stopName}</strong><br/>
      Bus: ${stop.bus}<br/>
      Arrive: ${stop.arrivalTime}<br/>
      Leave: ${stop.departureTime}
      ${stop.waiting.hasWaiting ? `<br/>Wait: ${stop.waiting.timeMinutes} min` : ''}
    `);
  });
}
```

## Common Patterns

### Pattern 1: Real-time Updates
```javascript
// Update timeline every minute with fresh data
setInterval(() => {
  const timeElapsed = new Date() - new Date(timeline.summary.startTimeMs);
  updateTimelineUI(timeElapsed);
}, 60000);
```

### Pattern 2: Highlight Current Stop
```javascript
function highlightCurrentStop(timeline) {
  const now = new Date();
  
  const currentStop = timeline.stops.find(stop => {
    const arrive = new Date(stop.arrivalTimeMs);
    const depart = new Date(stop.departureTimeMs);
    return now >= arrive && now <= depart;
  });

  return currentStop;
}
```

### Pattern 3: Show Next Transfer
```javascript
function getNextTransfer(timeline) {
  return timeline.stops.find(stop => stop.waiting.hasWaiting);
}

const nextTransfer = getNextTransfer(timeline);
if (nextTransfer) {
  console.log(`Next transfer at ${nextTransfer.stopName} (${nextTransfer.waiting.timeMinutes} min wait)`);
}
```

### Pattern 4: Calculate Journey Progress
```javascript
function calculateProgress(timeline) {
  const now = new Date();
  const journey = {
    startTime: new Date(timeline.summary.startTimeMs),
    endTime: new Date(timeline.summary.endTimeMs),
    currentTime: now
  };

  const totalDuration = journey.endTime - journey.startTime;
  const elapsed = now - journey.startTime;
  const progress = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));

  return { progress, elapsed, remaining: totalDuration - elapsed };
}
```

## Data Structure Reference

### Timeline Object
```javascript
{
  timeline: [],      // Detailed timeline entries
  summary: {},       // Journey summary with totals
  stops: []         // Sequenced stops with full details
}
```

### Stop Entry
```javascript
{
  sequence: 1,                    // Stop order (1-indexed)
  stopId: "stop_123",             // GTFS stop ID
  stopName: "Downtown Station",   // Human-readable name
  stopLat: 24.8607,              // Latitude
  stopLon: 67.0011,              // Longitude
  bus: "RED_LINE",               // Bus name
  busRouteId: "red",             // Bus route ID
  arrivalTime: "14:23:45",       // Time format HH:MM:SS
  arrivalTimeMs: 1710685425000,  // Unix timestamp
  departureTime: "14:25:45",     // Time format HH:MM:SS
  departureTimeMs: 1710685545000,// Unix timestamp
  dwellTimeMinutes: 2,           // Time at stop
  waiting: {                      // Transfer waiting info
    hasWaiting: false,
    timeMinutes: 0,
    reason: "Final Stop"
  },
  isFirstStop: true,             // First stop marker
  isLastStop: false,             // Last stop marker
  actions: ["Board bus"]         // Suggested actions
}
```

### Summary Entry
```javascript
{
  startTime: "14:23:45",              // 24-hour format
  startTime12Hour: "2:23 PM",         // 12-hour format
  endTime: "14:40:00",                // 24-hour format
  endTime12Hour: "2:40 PM",           // 12-hour format
  totalDurationMinutes: 16,           // Total minutes
  totalDurationFormatted: "16 min",   // Human-readable
  totalWaitingTimeMinutes: 5,         // Total wait time
  journeyStops: 8,                    // Number of stops
  transfers: 1                        // Number of transfers
}
```

## Tips & Best Practices

✅ **Use 24-hour format for precise timing calculations**
✅ **Use 12-hour format for user display**
✅ **Always check `isFirstStop` and `isLastStop` flags**
✅ **Use `waiting` object to show transfer information**
✅ **Cache timeline data to reduce API calls**
✅ **Update UI every minute with fresh data**
✅ **Show real-time progress on maps using `stopLat` and `stopLon`**
✅ **Display suggested actions at each stop**

## Error Handling

```javascript
// Handle missing timeline
if (!route.timeline || !route.timeline.stops) {
  console.error('Timeline data not available');
  return null;
}

// Validate timeline stops
const validStops = route.timeline.stops.filter(stop => 
  stop.stopId && stop.stopName && stop.arrivalTime && stop.departureTime
);

if (validStops.length === 0) {
  console.error('No valid stops in timeline');
  return null;
}
```
