const gtfsService = require('./services/gtfsService');

(async () => {
  console.log('Testing gtfsService.getStops()...');
  const stops = await gtfsService.getStops();
  
  console.log('Type of stops:', typeof stops);
  console.log('Is array?', Array.isArray(stops));
  console.log('Length:', stops?.length);
  console.log('Stops keys (if object):', Object.keys(stops || {}).slice(0, 5));
  
  if (stops) {
    if (Array.isArray(stops)) {
      console.log('First item:', stops[0]);
    } else {
      const firstKey = Object.keys(stops)[0];
      console.log('First value:', stops[firstKey]);
    }
  }
})().catch(console.error);
