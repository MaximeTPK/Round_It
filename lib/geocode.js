const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

export async function geocodeAddress(address) {
  if (!GOOGLE_MAPS_API_KEY) throw new Error("GOOGLE_MAPS_API_KEY is not set");
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== "OK" || !data.results.length) return null;
  const { lat, lng } = data.results[0].geometry.location;
  return { lat, lng };
}

export async function reverseGeocode({ lat, lng }) {
  if (!GOOGLE_MAPS_API_KEY) throw new Error("GOOGLE_MAPS_API_KEY is not set");
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== "OK" || !data.results.length) return null;
  return data.results[0].formatted_address;
}

export const geocode = geocodeAddress;

export async function geocodeAll(stops) {
  const results = [];
  for (const stop of stops) {
    const coords = await geocodeAddress(stop.address);
    if (coords) results.push({ address: stop.address, ...coords });
    await new Promise(r => setTimeout(r, 200));
  }
  return results;
}
