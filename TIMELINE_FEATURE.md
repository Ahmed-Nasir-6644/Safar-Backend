# Real-Time Timeline Feature Documentation

## Overview
The route finder service now includes a comprehensive real-time timeline that shows:
- **Real-time start time** (current system time)
- **Detailed stop-by-stop journey information**
- **Bus arrival and departure times at each stop**
- **Waiting times between buses (transfers)**
- **Total journey duration with formatting**

## Feature Details

### 1. Timeline Generation
Each route returned by the API now includes:
- Real-time start time (HH:MM:SS format and 12-hour format with AM/PM)
- Complete timeline for each stop in the journey
- Summary with journey statistics

### 2. Timeline Entry Structure
Each stop in the timeline contains:

```json
{
  "sequence": 1,
  "stopId": "stop_123",
  "stopName": "Downtown Station",
  "stopLat": 24.8607,
  "stopLon": 67.0011,
  "bus": "RED_LINE",
  "busRouteId": "red",
  "arrivalTime": "14:23:45",
  "arrivalTimeMs": 1647089025000,
  "departureTime": "14:25:45",
  "departureTimeMs": 1647089145000,
  "dwellTimeMinutes": 2,
  "waiting": {
    "hasWaiting": true,
    "timeMinutes": 5,
    "reason": "Transfer"
  },
  "isFirstStop": false,
  "isLastStop": false,
  "actions": [
    "Board bus",
    "Wait for next bus",
    "Find waiting area"
  ]
}
```

### 3. Timeline Summary
Each route includes a summary with:

```json
{
  "summary": {
    "startTime": "14:20:00",
    "startTime12Hour": "2:20 PM",
    "endTime": "15:10:00",
    "endTime12Hour": "3:10 PM",
    "totalDurationMinutes": 50,
    "totalDurationFormatted": "50 min",
    "totalWaitingTimeMinutes": 10,
    "journeyStops": 8,
    "transfers": 1
  }
}
```

## API Response Structure

### Complete Route Response with Timeline

```json
{
  "success": true,
  "message": "Routes found successfully",
  "data": {
    "routes": [
      {
        "duration": "50 min",
        "durationMinutes": 50,
        "transfers": 1,
        "totalStops": 8,
        "fare": "Rs. 90",
        "farePkr": 90,
        "transferCount": 1,
        "busesUsed": ["RED_LINE", "BLUE_LINE"],
        "busSequence": ["RED_LINE", "BLUE_LINE"],
        "routeSegments": [
          {
            "routeName": "RED_LINE",
            "routeId": "red",
            "stops": [...],
            "stopCount": 5,
            "distance": 8.5,
            "boardingStop": "Downtown Station",
            "alightingStop": "Central Park"
          },
          {
            "routeName": "BLUE_LINE",
            "routeId": "blue",
            "stops": [...],
            "stopCount": 4,
            "distance": 6.2,
            "boardingStop": "Central Park",
            "alightingStop": "Airport Terminal"
          }
        ],
        "tripLegs": [
          {
            "bus": "RED_LINE",
            "edgeRange": "0-4"
          },
          {
            "bus": "BLUE_LINE",
            "edgeRange": "5-8"
          }
        ],
        "realTimeStart": "14:20:00",
        "realTimeStart12Hour": "2:20 PM",
        "timeline": {
          "timeline": [...],
          "summary": {
            "startTime": "14:20:00",
            "startTime12Hour": "2:20 PM",
            "endTime": "15:10:00",
            "endTime12Hour": "3:10 PM",
            "totalDurationMinutes": 50,
            "totalDurationFormatted": "50 min",
            "totalWaitingTimeMinutes": 10,
            "journeyStops": 8,
            "transfers": 1
          },
          "stops": [... complete timeline entries ...]
        }
      }
    ]
  }
}
```

## Timeline Features

### 1. Automatic Time Calculation
- **Current time as start**: Uses the system's current time when the route is requested
- **Travel time estimation**: Based on distance and average speed (35 km/h)
- **Stop dwell time**: Calculates boarding/alighting time at each stop
- **Transfer waiting time**: Default 5 minutes between buses

### 2. Detailed Stop Information
For each stop, the timeline provides:
- **Arrival time** (HH:MM:SS format and milliseconds)
- **Departure time** (HH:MM:SS format and milliseconds)
- **Dwell time** (time spent at the stop in minutes)
- **Transfer waiting** (if waiting for next bus)
- **Coordinate information** (latitude/longitude)
- **Suggested actions** (Board, Wait, Alight, Find waiting area)

### 3. Journey Summary
- Total journey duration in multiple formats
- Total waiting time across all transfers
- Number of stops on the journey
- Number of transfers required
- Start and end times in 12-hour and 24-hour formats

## Usage Example

### Frontend Display Example
```
Journey Start: 2:20 PM
═══════════════════════════════════════════════════════════

Stop 1: Downtown Station 🚩
├─ Arrival: 2:20 PM
├─ Departure: 2:22 PM
├─ Bus: RED_LINE
└─ Action: Board the bus

Stop 2: Central Station
├─ Arrival: 2:35 PM
├─ Departure: 2:37 PM
├─ Bus: RED_LINE
└─ Action: Continue journey

Transfer Point: Central Park 🔄
├─ Waiting Time: 5 minutes
├─ Next Bus: BLUE_LINE
└─ Action: Find waiting area

Stop 3: Airport Terminal 🏁
├─ Arrival: 3:10 PM
├─ Departure: 3:10 PM
├─ Bus: BLUE_LINE
└─ Action: Alight bus - Journey Complete

═══════════════════════════════════════════════════════════
Total Duration: 50 min
Total Waiting: 10 min
Route: RED_LINE → BLUE_LINE
```

## Implementation Details

### Time Calculation Algorithm
1. **Start with current system time**
2. **For each route segment:**
   - Calculate travel time based on distance (if available)
   - Distribute travel time across stops proportionally
   - Calculate arrival and departure times for each stop
3. **Handle transfers:**
   - Add default 5-minute waiting time between buses
   - Update current time for next segment
4. **Generate timeline entries** with all relevant information

### Configuration Constants
```javascript
averageWaitingTimeMinutes: 5       // Wait between buses
boardingTimeMinutes: 2             // Time to board bus
defaultStopDwellTime: 0.5          // Time at each stop
averageSpeedKmh: 35                // For time estimation
```

## API Endpoints Returning Timelines

### 1. `/routes/find` (By Stop ID)
- **Method**: POST
- **Auth**: Required
- **Body**: `{ startStopId, endStopId }`
- **Returns**: Single route with timeline

### 2. `/routes/find/by-name` (By Stop Name)
- **Method**: POST
- **Auth**: Required
- **Body**: `{ startStopName, endStopName, maxRoutes }`
- **Returns**: Multiple routes with timelines

## Frontend Integration Guide

### Display Timeline Data
```javascript
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

// Show timeline summary
console.log(`Journey: ${route.realTimeStart12Hour} to ${route.timeline.summary.endTime12Hour}`);
console.log(`Duration: ${route.timeline.summary.totalDurationFormatted}`);

// Display each stop
route.timeline.stops.forEach(stop => {
  console.log(`${stop.stopName} - Arrive: ${stop.arrivalTime}, Leave: ${stop.departureTime}`);
  if (stop.waiting.hasWaiting) {
    console.log(`  ⏳ Wait ${stop.waiting.timeMinutes} min for ${stop.waiting.reason}`);
  }
});
```

## Customization Options

### Adjust Waiting Time
Edit in `utils/timelineCalculator.js`:
```javascript
this.averageWaitingTimeMinutes = 5; // Change this value
```

### Adjust Average Speed
Edit in `services/routeFinderService.js`:
```javascript
this.averageSpeedKmh = 35; // Change this value
```

### Adjust Boarding Time
Edit in `utils/timelineCalculator.js`:
```javascript
this.boardingTimeMinutes = 2; // Change this value
```

## Notes
- Timeline uses the system's current time as the base
- All times are calculated in the server timezone
- Distance-based calculations use Haversine formula for accuracy
- Timeline is regenerated for each API request (always current)
