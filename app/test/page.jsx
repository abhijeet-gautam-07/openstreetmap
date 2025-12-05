import { supabase } from "@/lib/supabase";

export default async function TestPage() {
  // Fetch id, title, lat, and lon from the table
  const { data: parcels, error } = await supabase
    .from("parcel_info3")
    .select("*")
    .limit(2000); // Restrict to 5000 records

  if (error) {
    console.error("Supabase Error:", error);
    return <div className="p-6 text-red-500">Failed to load data</div>;
  }

  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold mb-4">Parcel Data Test</h1>
      <p className="mb-4 text-gray-600">
        Showing first {parcels?.length || 0} records
      </p>

      <ul className="space-y-2">
        {parcels?.map((parcel) => (
          <li key={parcel.id} className="border rounded px-4 py-3 bg-white shadow-sm hover:bg-gray-50">
            {/* Display Title */}
            <div className="font-medium text-lg text-gray-800">
              {parcel.title || "Untitled Parcel"}
            </div>
            
            {/* Display Coordinates */}
            <div className="text-sm font-mono text-blue-600 mt-1">
              Lat: {parcel.lat ?? "N/A"} | Lon: {parcel.lon ?? "N/A"}
            </div>
            
            {/* Display Raw ID for debugging */}
            <div className="text-xs text-gray-400 mt-1">
              ID: {parcel.id}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}