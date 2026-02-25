(async () => {
  const localRes = await fetch('http://localhost:5000/routes/find/by-name', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startStopName: 'Aabpara',
      endStopName: 'F-11 Markaz',
      maxRoutes: 1,
    }),
  });

  const local = await localRes.json();

  const from = '33.7057267,73.0879408';
  const to = '33.6825768,72.9889853';
  const extUrl = `https://www.safar.fyi/api/routes?fromCoords=${encodeURIComponent(from)}&toCoords=${encodeURIComponent(to)}`;

  const extRes = await fetch(extUrl);
  const ext = await extRes.json();

  const extTop = (ext.routes || [])[0] || {};
  const localTop = local || {};

  const comparison = {
    localStatus: localRes.status,
    local: {
      duration: localTop.duration,
      durationMinutes: localTop.durationMinutes,
      transferCount: localTop.transferCount,
      busesUsed: localTop.busesUsed,
      busSequence: localTop.busSequence,
      segmentCount: localTop.routeSegments?.length,
      tripLegs: localTop.tripLegs?.length,
    },
    deployedStatus: extRes.status,
    deployed: {
      duration: extTop.duration,
      transfers: extTop.transfers,
      stops: extTop.stops,
      name: extTop.name,
      segmentCount: (extTop.segments || []).filter((segment) => segment.type === 'transit').length,
    },
  };

  console.log(JSON.stringify(comparison, null, 2));
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
