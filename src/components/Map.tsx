import React, { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import { APIProvider, Map as GoogleMap, AdvancedMarker, Pin, InfoWindow } from "@vis.gl/react-google-maps";
import { Hospital, UserLocation, Ambulance } from "../types";
import { DEFAULT_LOCATION } from "../constants";

// Fix for default marker icons in Leaflet with React
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import markerRetina from "leaflet/dist/images/marker-icon-2x.png";

const DefaultIcon = L.icon({
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconRetinaUrl: markerRetina,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41],
});

const getCapacityColor = (beds: number) => {
  if (beds > 50) return "#22c55e"; // green-500
  if (beds > 20) return "#f97316"; // orange-500
  return "#ef4444"; // red-500
};

const getSpecializationIcon = (specialties: string[]) => {
  if (specialties.includes("Cardiology")) return "❤️";
  if (specialties.includes("Emergency")) return "🚨";
  if (specialties.includes("Neurology")) return "🧠";
  if (specialties.includes("Pediatrics")) return "👶";
  return "🏥";
};

const createHospitalIcon = (hospital: Hospital, isSelected: boolean) => {
  const color = getCapacityColor(hospital.beds);
  const icon = getSpecializationIcon(hospital.specialties);
  const size = isSelected ? 38 : 32;

  return L.divIcon({
    className: "custom-hospital-marker",
    html: `
      <div style="
        background-color: ${color};
        width: ${size}px;
        height: ${size}px;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        display: flex;
        align-items: center;
        justify-content: center;
        border: ${isSelected ? "3px solid #ffffff" : "2px solid white"};
        box-shadow: ${isSelected ? "0 0 14px rgba(239,68,68,0.8)" : "0 2px 4px rgba(0,0,0,0.3)"};
      ">
        <div style="
          transform: rotate(45deg);
          font-size: 16px;
          margin-top: -2px;
          margin-left: -2px;
        ">${icon}</div>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  });
};

L.Marker.prototype.options.icon = DefaultIcon;

interface MapProps {
  userLocation: UserLocation | null;
  hospitals: Hospital[];
  ambulances: Ambulance[];
  selectedHospital: Hospital | null;
  routePath: [number, number][] | null;
}

// Component to center map and fix tile layout when container resizes
function ChangeView({ center, zoom = 13 }: { center: [number, number]; zoom?: number }) {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    map.setView(center, zoom);
  }, [center[0], center[1], map, zoom]);
  return null;
}

// Component to fit map to route bounds
function FitRoute({ routePath }: { routePath: [number, number][] | null }) {
  const map = useMap();
  useEffect(() => {
    if (routePath && routePath.length > 0) {
      map.invalidateSize();
      const bounds = L.latLngBounds(routePath);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }, [routePath, map]);
  return null;
}

const createAmbulanceIcon = () => {
  return L.divIcon({
    className: "custom-ambulance-marker",
    html: `
      <div class="relative">
        <div class="absolute inset-0 bg-red-500 rounded-lg animate-ping opacity-20"></div>
        <div style="
          background-color: #ef4444;
          width: 32px;
          height: 32px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2px solid white;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
          position: relative;
          z-index: 10;
        ">
          <div style="color: white; font-size: 16px;">🚑</div>
        </div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
};

export default function Map({ userLocation, hospitals, ambulances, selectedHospital, routePath }: MapProps) {
  const [activeHospital, setActiveHospital] = useState<Hospital | null>(null);
  const googleMapsKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const isGoogleMapsEnabled = Boolean(googleMapsKey && googleMapsKey !== "YOUR_GOOGLE_MAPS_API_KEY");

  const defaultCenter: [number, number] = [DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lng];
  const center: [number, number] = userLocation ? [userLocation.lat, userLocation.lng] : defaultCenter;

  // Filter out any un-geocoded (0, 0) coordinates
  const validHospitals = hospitals.filter((h) => h.lat !== 0 || h.lng !== 0);
  const validAmbulances = ambulances.filter((a) => a.lat !== 0 || a.lng !== 0);

  if (isGoogleMapsEnabled) {
    const googleCenter =
      selectedHospital && (selectedHospital.lat !== 0 || selectedHospital.lng !== 0)
        ? { lat: selectedHospital.lat, lng: selectedHospital.lng }
        : { lat: center[0], lng: center[1] };

    return (
      <div className="w-full h-full min-h-[400px] relative">
        <APIProvider apiKey={googleMapsKey}>
          <GoogleMap
            defaultCenter={googleCenter}
            center={googleCenter}
            defaultZoom={13}
            gestureHandling={"greedy"}
            disableDefaultUI={true}
            mapId={"bf51a910020fa25a"}
          >
            {userLocation && (
              <AdvancedMarker
                position={{ lat: userLocation.lat, lng: userLocation.lng }}
                title="Your Location"
              >
                <Pin background={"#3b82f6"} glyphColor={"#fff"} borderColor={"#1e40af"} />
              </AdvancedMarker>
            )}

            {validHospitals.map((hospital) => {
              const color = getCapacityColor(hospital.beds);
              const glyph = getSpecializationIcon(hospital.specialties);

              return (
                <AdvancedMarker
                  key={hospital.id}
                  position={{ lat: hospital.lat, lng: hospital.lng }}
                  onClick={() => setActiveHospital(hospital)}
                >
                  <Pin background={color} borderColor={"#fff"} glyph={glyph} />
                </AdvancedMarker>
              );
            })}

            {validAmbulances.map((ambulance) => (
              <AdvancedMarker
                key={ambulance.id}
                position={{ lat: ambulance.lat, lng: ambulance.lng }}
                title={ambulance.number}
              >
                <Pin background={"#ef4444"} borderColor={"#fff"} glyph={"🚑"} />
              </AdvancedMarker>
            ))}

            {activeHospital && (
              <InfoWindow
                position={{ lat: activeHospital.lat, lng: activeHospital.lng }}
                onCloseClick={() => setActiveHospital(null)}
              >
                <div className="p-2 text-black">
                  <div className="font-bold text-sm">{activeHospital.name}</div>
                  <div className="text-xs mt-1">
                    Rating: {Number(activeHospital.rating).toFixed(1)} ★ (Grade {activeHospital.grade})
                  </div>
                  <div className="text-xs">Beds: {activeHospital.beds} | ICU: {activeHospital.icuBeds}</div>
                  {activeHospital.mapsUrl && (
                    <a
                      href={activeHospital.mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 text-[10px] mt-2 block hover:underline"
                    >
                      View on Google Maps
                    </a>
                  )}
                </div>
              </InfoWindow>
            )}
          </GoogleMap>
        </APIProvider>
      </div>
    );
  }

  return (
    <div className="w-full h-full min-h-[400px] relative">
      <MapContainer center={center} zoom={13} scrollWheelZoom={true} className="w-full h-full min-h-[400px]">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {userLocation && (
          <>
            <Marker position={[userLocation.lat, userLocation.lng]}>
              <Popup>
                <div className="font-semibold">Your Location</div>
                <div className="text-xs text-gray-400">
                  {userLocation.lat.toFixed(4)}, {userLocation.lng.toFixed(4)}
                </div>
              </Popup>
            </Marker>
            {!routePath && (
              <ChangeView
                center={
                  selectedHospital && (selectedHospital.lat !== 0 || selectedHospital.lng !== 0)
                    ? [selectedHospital.lat, selectedHospital.lng]
                    : [userLocation.lat, userLocation.lng]
                }
              />
            )}
          </>
        )}

        <FitRoute routePath={routePath} />

        {validHospitals.map((hospital) => (
          <Marker
            key={hospital.id}
            position={[hospital.lat, hospital.lng]}
            icon={createHospitalIcon(hospital, selectedHospital?.id === hospital.id)}
          >
            <Popup>
              <div className="font-semibold">{hospital.name}</div>
              <div className="text-xs text-amber-400 font-medium">
                ★ {Number(hospital.rating).toFixed(1)} • Grade {hospital.grade}
              </div>
              <div className="text-xs text-gray-300 mt-1">
                Beds: {hospital.beds} • ICU: {hospital.icuBeds}
              </div>
              <div className="text-xs text-gray-400">
                Specialties: {hospital.specialties.join(", ")}
              </div>
            </Popup>
          </Marker>
        ))}

        {validAmbulances.map((ambulance) => (
          <Marker
            key={ambulance.id}
            position={[ambulance.lat, ambulance.lng]}
            icon={createAmbulanceIcon()}
          >
            <Popup>
              <div className="font-semibold">{ambulance.number}</div>
              <div className="text-xs text-gray-300">Status: {ambulance.status.toUpperCase()}</div>
              <div className="text-xs text-gray-300">
                Efficiency: {ambulance.efficiency.toFixed(1)}% • Grade {ambulance.grade}
              </div>
            </Popup>
          </Marker>
        ))}

        {routePath && routePath.length > 0 && (
          <Polyline
            positions={routePath}
            color="#ef4444"
            weight={4}
            opacity={0.85}
            dashArray="10, 10"
          />
        )}
      </MapContainer>
    </div>
  );
}
