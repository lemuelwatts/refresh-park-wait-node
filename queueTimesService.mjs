
import 'dotenv/config';
import fetch from 'node-fetch';
import PocketBase from 'pocketbase';
import cron from 'node-cron';

const PARK_IDS = [
  { id: '5', name: 'EPCOT' },
  { id: '6', name: 'Magic Kingdom' },
  { id: '7', name: "Disney's Hollywood Studios" },
  { id: '8', name: "Disney's Animal Kingdom" }
];

const pb = new PocketBase(process.env.PB_URL);

async function ensureAuth() {
  if (!pb.authStore.isValid) {
    try {
      await pb.collection("_superusers").authWithPassword(
        process.env.PB_EMAIL,
        process.env.PB_PASSWORD
      );
      console.log("PocketBase re-authenticated.");
    } catch (err) {
      console.error("PocketBase authentication failed:", err);
      throw err;
    }
  }
}

async function fetchParkData(parkId) {
  const url = `https://queue-times.com/parks/${parkId}/queue_times.json`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch park ${parkId}: ${resp.statusText}`);
  const data = await resp.json();
  if (!data.lands) throw new Error('Invalid API response: missing lands');
  return data;
}

function processRide(ride) {
  const now = new Date().toISOString(); // RFC3339 string
  let lastApiUpdate = now;

  if (typeof ride.last_updated === 'number' && !isNaN(ride.last_updated) && ride.last_updated > 0) {
    lastApiUpdate = new Date(ride.last_updated * 1000).toISOString();
  } else if (typeof ride.last_updated === 'string') {
    const parsed = Date.parse(ride.last_updated);
    if (!isNaN(parsed)) {
      lastApiUpdate = new Date(parsed).toISOString();
    }
  }
  return {
    name: ride.name || 'Unknown Ride',
    wait_time: typeof ride.wait_time === 'number' ? ride.wait_time : 0,
    is_open: !!ride.is_open,
    last_api_update: lastApiUpdate,
    updated_at: now
  };
}

async function getParkRecord(parkId) {
  const records = await pb.collection('parks').getFullList({ filter: `api_id="${parkId}"` });
  return records[0];
}

async function getExistingRides(parkId) {
  return await pb.collection('rides').getFullList({ filter: `park_id="${parkId}"` });
}

function ridesDataChanged(existing, incoming) {
  if (!existing) return true;
  return (
    existing.wait_time !== incoming.wait_time ||
    existing.is_open !== incoming.is_open ||
    existing.name !== incoming.name
  );
}

async function saveRidesBatch(parkRecord, ridesData) {
  const existingRides = await getExistingRides(parkRecord.id);
  const existingMap = Object.fromEntries(existingRides.map(r => [r.name, r]));

  let updated = 0;
  for (const ride of ridesData) {
    const existing = existingMap[ride.name];
    if (ridesDataChanged(existing, ride)) {
      if (existing) {
        await pb.collection('rides').update(existing.id, ride);
      } else {
        await pb.collection('rides').create({ ...ride, park_id: parkRecord.id });
      }
      updated++;
    }
  }
  return updated;
}

async function updateParkWaits(park) {
  console.log(`Fetching park ${park.name} (${park.id}) data…`);
  const data = await fetchParkData(park.id);
  const parkRecord = await getParkRecord(park.id);
  if (!parkRecord) throw new Error(`No park record found for id ${park.id}`);
  const ridesToSave = [];
  for (const land of data.lands) {
    for (const ride of land.rides || []) {
      ridesToSave.push(processRide(ride));
    }
  }
  const savedCount = await saveRidesBatch(parkRecord, ridesToSave);
  console.log(`✔️ ${ridesToSave.length} rides processed, ${savedCount} updated for park ${park.name}`);
  return { park_id: park.id, updated_rides: ridesToSave.length, saved_rides: savedCount, timestamp: new Date().toISOString() };
}

async function updateAllParks() {
  const results = [];
  let totalProcessed = 0, totalSaved = 0, failedParks = [];
  for (const park of PARK_IDS) {
    try {
      const r = await updateParkWaits(park);
      totalProcessed += r.updated_rides;
      totalSaved += r.saved_rides;
      results.push(r);
    } catch (e) {
      console.error(`✗ Park ${park.id} update failed: ${e}`);
      failedParks.push({ park_id: park.id, error: e.message });
    }
  }
  return {
    success: failedParks.length === 0,
    total_processed: totalProcessed,
    total_saved: totalSaved,
    parks_updated: results.length,
    parks_failed: failedParks.length,
    results,
    failures: failedParks,
    timestamp: new Date().toISOString()
  };
}

// Run every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  console.log('Starting scheduled queue-times update...');
  try {
    await ensureAuth();
    await updateAllParks();
  } catch (err) {
    console.error('Scheduled update failed:', err);
  }
});

// For manual run (uncomment to test directly)
// updateAllParks();

export { updateAllParks, updateParkWaits };