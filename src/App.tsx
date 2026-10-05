import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Activity,
  Ambulance,
  Hospital as HospitalIcon,
  MapPin,
  Navigation,
  Stethoscope,
  AlertCircle,
  Clock,
  CheckCircle2,
  ChevronRight,
  ArrowRight,
  HeartPulse,
  Bed,
  ShieldCheck,
  Shield,
  BarChart3,
  Menu,
  X,
  Map as MapIcon,
  Users,
  Thermometer,
  Wind,
  Droplets,
  Zap,
  Star,
  MessageSquare,
  Wrench,
  Calendar,
  User,
  Plus,
  Crosshair,
  ExternalLink,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import Map from "./components/Map";
import { Hospital, TriageResult, UserLocation, Ambulance as AmbulanceType } from "./types";
import {
  MOCK_HOSPITALS,
  MOCK_AMBULANCES,
  PREDEFINED_SYMPTOMS,
  DEFAULT_LOCATION,
  localizeHospitalsToUser,
  localizeAmbulancesToUser,
} from "./constants";
import { calculateDistance, cn } from "./lib/utils";

type ViewState = "home" | "patient" | "ambulance" | "hospital" | "map";

interface RoutingInfo {
  distance: number; // in meters
  duration: number; // in seconds
  steps: any[]; // navigation steps
}

const CITY_PRESETS: { label: string; lat: number; lng: number }[] = [
  { label: "New Delhi", lat: 28.5672, lng: 77.2100 },
  { label: "Hyderabad", lat: 17.3850, lng: 78.4867 },
  { label: "Mumbai", lat: 19.0760, lng: 72.8777 },
  { label: "Bengaluru", lat: 12.9716, lng: 77.5946 },
  { label: "Chennai", lat: 13.0827, lng: 80.2707 },
];

export function calculateHospitalGrade(
  serviceQuality: number,
  coordinationScore: number,
  facilityScore: number,
  availabilityScore: number,
  avgAmbulanceResponseTime: number
): "A+" | "A" | "B" | "C" {
  const avgScore = (serviceQuality + coordinationScore + facilityScore + availabilityScore) / 4;
  if (avgScore > 92 && avgAmbulanceResponseTime < 8) return "A+";
  if (avgScore > 85 && avgAmbulanceResponseTime < 12) return "A";
  if (avgScore < 70) return "C";
  return "B";
}

export default function App() {
  const [view, setView] = useState<ViewState>("home");
  const [userLocation, setUserLocation] = useState<UserLocation | null>(DEFAULT_LOCATION);
  const [locationLabel, setLocationLabel] = useState<string>("Locating...");
  const [hospitals, setHospitals] = useState<Hospital[]>(() =>
    localizeHospitalsToUser(MOCK_HOSPITALS, DEFAULT_LOCATION)
  );
  const [ambulances, setAmbulances] = useState<AmbulanceType[]>(() =>
    localizeAmbulancesToUser(MOCK_AMBULANCES, DEFAULT_LOCATION)
  );
  const [wsStatus, setWsStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const wsRef = useRef<WebSocket | null>(null);

  const [symptoms, setSymptoms] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isTriageLoading, setIsTriageLoading] = useState(false);
  const [triageResult, setTriageResult] = useState<TriageResult | null>(null);
  const [matchedHospitals, setMatchedHospitals] = useState<Hospital[]>([]);
  const [selectedHospital, setSelectedHospital] = useState<Hospital | null>(null);
  const [routePath, setRoutePath] = useState<[number, number][] | null>(null);
  const [routingInfo, setRoutingInfo] = useState<RoutingInfo | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [isRoutingLoading, setIsRoutingLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [bookedSlots, setBookedSlots] = useState<Record<string, string>>({});
  const [lastSyncTime, setLastSyncTime] = useState<string>(new Date().toLocaleTimeString());

  // Vitals State (Manual Input)
  const [vitals, setVitals] = useState({
    hr: "78",
    spo2: "98",
    bp: "120/80",
    temp: "36.6",
  });

  // Transmitted Vitals (for Hospital Admin)
  const [transmittedVitals, setTransmittedVitals] = useState<typeof vitals | null>(null);
  const [transmittedTriage, setTransmittedTriage] = useState<TriageResult | null>(null);
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [patientStatus, setPatientStatus] = useState<"none" | "pending" | "accepted" | "rejected">("none");

  // Hospital Admin Resources State
  const [hospitalResources, setHospitalResources] = useState({
    name: "AIIMS Medical Center (Admin Node)",
    beds: 14,
    icuBeds: 4,
    doctors: [
      { id: "admin-d1", name: "Dr. Aditi Sharma", specialty: "Cardiology", isAvailable: true },
      { id: "admin-d2", name: "Dr. Rajesh Kumar", specialty: "Trauma Surgery", isAvailable: true },
      { id: "admin-d3", name: "Dr. Meera Iyer", specialty: "Neurology", isAvailable: false },
    ],
    equipment: ["Ventilator x4", "Defibrillator x2", "3T MRI Scanner", "Cardiac Cath Lab"],
    avgAmbulanceResponseTime: 6,
    serviceQuality: 98,
    coordinationScore: 96,
    facilityScore: 99,
    availabilityScore: 95,
    reviews: [
      { id: "r1", author: "Arjun M.", rating: 5.0, comment: "Exceptional care and fast emergency response.", date: "2025-03-24" },
      { id: "r2", author: "Priya S.", rating: 4.6, comment: "Professional trauma staff, very efficient coordination.", date: "2025-03-23" },
    ],
  });

  const [newDoctorName, setNewDoctorName] = useState("");
  const [newDoctorSpecialty, setNewDoctorSpecialty] = useState("");
  const [showAddDoctor, setShowAddDoctor] = useState(false);
  const [newEquipment, setNewEquipment] = useState("");
  const [showAddEquipment, setShowAddEquipment] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3500);
  }, []);

  // Apply user location & localize hospitals/ambulances around user's real country/city
  const applyUserLocation = useCallback((loc: UserLocation, label?: string) => {
    setUserLocation(loc);
    if (label) setLocationLabel(label);
    const localizedHosp = localizeHospitalsToUser(MOCK_HOSPITALS, loc);
    setHospitals(localizedHosp);
    setMatchedHospitals((prev) => (prev.length > 0 ? localizeHospitalsToUser(prev, loc) : localizedHosp));
    setAmbulances((prev) => localizeAmbulancesToUser(prev, loc));
    setSelectedHospital((prev) => {
      if (!prev) return localizedHosp[0] || null;
      return localizedHosp.find((h) => h.id === prev.id) || localizedHosp[0] || prev;
    });

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "SET_USER_LOCATION", data: loc }));
    }
  }, []);

  // Detect user's real location (Browser GPS -> IP Geolocation fallback -> India Default)
  const detectUserLocation = useCallback(() => {
    setLocationLabel("Detecting GPS...");
    const fetchIpFallback = async () => {
      try {
        const res = await fetch("https://get.geojs.io/v1/ip/geo.json");
        if (res.ok) {
          const data = await res.json();
          const lat = parseFloat(data.latitude);
          const lng = parseFloat(data.longitude);
          if (!isNaN(lat) && !isNaN(lng)) {
            const cityLabel = [data.city, data.country_code].filter(Boolean).join(", ");
            applyUserLocation({ lat, lng }, cityLabel || `${lat.toFixed(3)}, ${lng.toFixed(3)}`);
            return;
          }
        }
      } catch {
        // Fallback to default Indian coordinates
      }
      applyUserLocation(DEFAULT_LOCATION, "New Delhi, IN");
    };

    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const loc = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          applyUserLocation(loc, `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`);
        },
        () => {
          fetchIpFallback();
        },
        { enableHighAccuracy: true, timeout: 6000, maximumAge: 60000 }
      );
    } else {
      fetchIpFallback();
    }
  }, [applyUserLocation]);

  useEffect(() => {
    detectUserLocation();
  }, [detectUserLocation]);

  // Real-time Availability Simulation (HIS Sync)
  useEffect(() => {
    const interval = setInterval(() => {
      setLastSyncTime(new Date().toLocaleTimeString());
      setMatchedHospitals((prev) =>
        prev.map((h) => {
          if (!h.doctors) return h;
          return {
            ...h,
            doctors: h.doctors.map((d) => {
              const shouldToggle = Math.random() < 0.12;
              if (!shouldToggle) return d;
              const newAvailable = !d.isAvailable;
              return {
                ...d,
                isAvailable: newAvailable,
                nextAvailableSlot: newAvailable ? "Now" : Math.random() > 0.5 ? "45m" : "1.5h",
              };
            }),
          };
        })
      );

      setHospitalResources((prev) => ({
        ...prev,
        beds: Math.max(0, prev.beds + (Math.random() > 0.75 ? (Math.random() > 0.5 ? 1 : -1) : 0)),
        icuBeds: Math.max(0, prev.icuBeds + (Math.random() > 0.9 ? (Math.random() > 0.5 ? 1 : -1) : 0)),
      }));
    }, 8000);

    return () => clearInterval(interval);
  }, []);

  // WebSocket Connection for Live Ambulance Telemetry & Vitals Sync
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}`;
    let ws: WebSocket;
    let reconnectTimeout: ReturnType<typeof setTimeout>;

    const connect = () => {
      setWsStatus("connecting");
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsStatus("connected");
        if (userLocation) {
          ws.send(JSON.stringify({ type: "SET_USER_LOCATION", data: userLocation }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === "AMBULANCE_UPDATE") {
            const updates = message.data;
            setAmbulances((prev) =>
              prev.map((amb) => {
                const update = updates.find((u: any) => u.id === amb.id);
                return update ? { ...amb, lat: update.lat, lng: update.lng } : amb;
              })
            );
          } else if (message.type === "VITALS_TRANSMITTED" && message.data) {
            setTransmittedVitals(message.data.vitals);
            setTransmittedTriage(message.data.triage);
            setPatientStatus(message.data.status || "accepted");
          } else if (message.type === "PATIENT_STATUS_UPDATE" && message.data) {
            setPatientStatus(message.data.status);
          }
        } catch (err) {
          console.error("Failed to parse WebSocket message:", err);
        }
      };

      ws.onclose = () => {
        setWsStatus("disconnected");
        reconnectTimeout = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      ws.close();
      clearTimeout(reconnectTimeout);
    };
  }, []);

  // Critical alert sound when incoming patient is Critical
  useEffect(() => {
    if (transmittedTriage?.severity === "Critical") {
      const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3");
      audio.play().catch(() => {});
    }
  }, [transmittedTriage]);

  const updateResource = (
    key:
      | "beds"
      | "icuBeds"
      | "avgAmbulanceResponseTime"
      | "serviceQuality"
      | "coordinationScore"
      | "facilityScore"
      | "availabilityScore",
    value: number
  ) => {
    const isPercentage =
      key === "serviceQuality" ||
      key === "coordinationScore" ||
      key === "facilityScore" ||
      key === "availabilityScore";
    const clamped = isPercentage ? Math.min(100, Math.max(0, value)) : Math.max(0, value);
    setHospitalResources((prev) => ({ ...prev, [key]: clamped }));
  };

  // Routing Logic: Calculates route on the map without forcefully leaving the active portal unless requested
  const getRouting = useCallback(
    async (hospital: Hospital, navigateToFullMap = false) => {
      setSelectedHospital(hospital);
      if (!userLocation) return;

      if (hospital.lat === 0 && hospital.lng === 0) {
        setRoutePath(null);
        setRoutingInfo(null);
        return;
      }

      setIsRoutingLoading(true);
      try {
        const response = await fetch(
          `https://router.project-osrm.org/route/v1/driving/${userLocation.lng},${userLocation.lat};${hospital.lng},${hospital.lat}?overview=full&geometries=geojson&steps=true`
        );
        const data = await response.json();
        if (data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          const coordinates = route.geometry.coordinates.map((coord: [number, number]) => [
            coord[1],
            coord[0],
          ]);
          setRoutePath(coordinates);
          setRoutingInfo({
            distance: route.distance,
            duration: route.duration,
            steps: route.legs[0].steps,
          });

          if (navigateToFullMap) {
            setIsNavigating(true);
            setView("map");
          }
        }
      } catch (err) {
        console.error("Routing error:", err);
        // Fallback straight-line polyline so routing visualization always works
        const distKm = calculateDistance(userLocation.lat, userLocation.lng, hospital.lat, hospital.lng);
        setRoutePath([
          [userLocation.lat, userLocation.lng],
          [hospital.lat, hospital.lng],
        ]);
        setRoutingInfo({
          distance: distKm * 1000,
          duration: Math.max(60, Math.round((distKm / 40) * 3600)),
          steps: [
            {
              maneuver: { instruction: `Proceed directly toward ${hospital.name}` },
              distance: distKm * 1000,
              duration: Math.max(60, Math.round((distKm / 40) * 3600)),
            },
          ],
        });
        if (navigateToFullMap) {
          setIsNavigating(true);
          setView("map");
        }
      } finally {
        setIsRoutingLoading(false);
      }
    },
    [userLocation]
  );

  // Transmit Vitals Handler
  const handleTransmitVitals = () => {
    if (isTransmitting) return;

    const activeList = matchedHospitals.length > 0 ? matchedHospitals : hospitals;
    const targetHospital = selectedHospital || activeList[0];

    if (!targetHospital) {
      setError("No target hospital available to receive vitals.");
      return;
    }

    if (!selectedHospital) {
      setSelectedHospital(targetHospital);
    }

    setIsTransmitting(true);
    setPatientStatus("pending");
    setError(null);

    const activeTriage: TriageResult = triageResult || {
      condition: "Emergency Paramedic Assessment",
      severity: Number(vitals.spo2) < 92 || Number(vitals.hr) > 120 ? "Critical" : "High",
      recommendedSpecialties: ["Emergency", "Trauma", "Cardiology"],
    };

    setTimeout(() => {
      setTransmittedVitals(vitals);
      setTransmittedTriage(activeTriage);
      setIsTransmitting(false);
      setPatientStatus("accepted");
      updateResource("beds", hospitalResources.beds - 1);

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "TRANSMIT_VITALS",
            data: {
              vitals,
              triage: activeTriage,
              hospitalId: targetHospital.id,
              hospitalName: targetHospital.name,
              status: "accepted",
              timestamp: new Date().toLocaleTimeString(),
            },
          })
        );
      }

      getRouting(targetHospital, false);
      showToast(`Vitals transmitted to ${targetHospital.name}`);
    }, 900);
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  // Server-Side AI Triage Handler
  const handleTriage = async () => {
    const combinedSymptoms = [symptoms, ...selectedTags].filter(Boolean).join(", ");
    if (!combinedSymptoms.trim()) return;

    setIsTriageLoading(true);
    setError(null);
    setPatientStatus("none");
    setTransmittedVitals(null);
    setTransmittedTriage(null);

    try {
      const response = await fetch("/api/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symptoms: combinedSymptoms,
          userLocation,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to analyze symptoms.");
      }

      const result: TriageResult = data.triage;
      setTriageResult(result);

      const baseLoc = userLocation || DEFAULT_LOCATION;
      const groundingHospitals = Array.isArray(data.groundingHospitals) ? data.groundingHospitals : [];

      if (groundingHospitals.length > 0) {
        const offsets = [
          { dLat: 0.011, dLng: 0.014 },
          { dLat: -0.016, dLng: 0.022 },
          { dLat: 0.021, dLng: -0.015 },
          { dLat: -0.019, dLng: -0.021 },
          { dLat: 0.008, dLng: -0.029 },
        ];

        const realHospitals: Hospital[] = groundingHospitals.map((chunk: any, index: number) => {
          const offset = offsets[index % offsets.length];
          const lat = Number((baseLoc.lat + offset.dLat).toFixed(6));
          const lng = Number((baseLoc.lng + offset.dLng).toFixed(6));
          const avgAmbulanceResponseTime = 5 + (index * 2);
          const serviceQuality = Math.min(99, 94 - index * 3);
          const coordinationScore = Math.min(99, 92 - index * 3);
          const facilityScore = Math.min(100, 96 - index * 2);
          const availabilityScore = Math.min(98, 90 - index * 4);
          const grade = calculateHospitalGrade(
            serviceQuality,
            coordinationScore,
            facilityScore,
            availabilityScore,
            avgAmbulanceResponseTime
          );
          const rating = Number((4.9 - index * 0.2).toFixed(1));
          const distance = calculateDistance(baseLoc.lat, baseLoc.lng, lat, lng);

          return {
            id: `real-${index}`,
            name: chunk.title || "Nearby Emergency Hospital",
            lat,
            lng,
            distance,
            beds: Math.max(8, 42 - index * 7),
            icuBeds: Math.max(3, 14 - index * 2),
            specialties: result.recommendedSpecialties,
            mapsUrl: chunk.uri,
            rating,
            grade,
            facilities: ["24/7 Emergency Care", "Diagnostic Imaging", "ICU"],
            avgAmbulanceResponseTime,
            serviceQuality,
            coordinationScore,
            facilityScore,
            availabilityScore,
            specialists: ["On-call Trauma Team", "Emergency Specialists"],
            doctors: [
              {
                id: `d-real-${index}-1`,
                name: "Dr. Aditi Sharma",
                specialty: result.recommendedSpecialties[0] || "Emergency Medicine",
                isAvailable: true,
                nextAvailableSlot: "Now",
                slots: [
                  { time: "10:30", available: true },
                  { time: "11:00", available: true },
                ],
              },
              {
                id: `d-real-${index}-2`,
                name: "Dr. Rajesh Kumar",
                specialty: "Trauma Surgery",
                isAvailable: index % 2 === 0,
                nextAvailableSlot: index % 2 === 0 ? "12:00" : "2h 15m",
                slots: [{ time: "12:00", available: index % 2 === 0 }],
              },
            ],
            equipment: ["Advanced Life Support", "CT / MRI Suite", "Cardiac Monitors"],
            reviews: [
              {
                id: `r-${index}-1`,
                author: "Verified Patient",
                rating,
                comment: "Quick emergency response and professional medical team.",
                date: "2025-03-22",
              },
            ],
          };
        });

        setMatchedHospitals(realHospitals);
        setSelectedHospital(realHospitals[0]);
        getRouting(realHospitals[0], false);
      } else {
        const sortedHospitals = localizeHospitalsToUser(MOCK_HOSPITALS, baseLoc).sort((a, b) => {
          const aMatches = a.specialties.some((s) =>
            result.recommendedSpecialties.some((r) => s.toLowerCase().includes(r.toLowerCase()) || r.toLowerCase().includes(s.toLowerCase()))
          );
          const bMatches = b.specialties.some((s) =>
            result.recommendedSpecialties.some((r) => s.toLowerCase().includes(r.toLowerCase()) || r.toLowerCase().includes(s.toLowerCase()))
          );
          if (aMatches !== bMatches) return aMatches ? -1 : 1;
          return (a.distance || 0) - (b.distance || 0);
        });
        setMatchedHospitals(sortedHospitals);
        if (sortedHospitals[0]) {
          setSelectedHospital(sortedHospitals[0]);
          getRouting(sortedHospitals[0], false);
        }
      }
    } catch (err: any) {
      console.error("Triage error:", err);
      setError(err?.message || "Failed to analyze symptoms.");
    } finally {
      setIsTriageLoading(false);
    }
  };

  const handleToggleAdminDoctor = (docId: string) => {
    setHospitalResources((prev) => ({
      ...prev,
      doctors: prev.doctors.map((d) => (d.id === docId ? { ...d, isAvailable: !d.isAvailable } : d)),
    }));
  };

  const handleAddAdminDoctor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDoctorName.trim() || !newDoctorSpecialty.trim()) return;
    setHospitalResources((prev) => ({
      ...prev,
      doctors: [
        ...prev.doctors,
        {
          id: `admin-d-${Date.now()}`,
          name: newDoctorName.trim(),
          specialty: newDoctorSpecialty.trim(),
          isAvailable: true,
        },
      ],
    }));
    setNewDoctorName("");
    setNewDoctorSpecialty("");
    setShowAddDoctor(false);
    showToast("Specialist added to active roster");
  };

  const handleAddAdminEquipment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEquipment.trim()) return;
    setHospitalResources((prev) => ({
      ...prev,
      equipment: [...prev.equipment, newEquipment.trim()],
    }));
    setNewEquipment("");
    setShowAddEquipment(false);
    showToast("Equipment added to inventory");
  };

  const adminGrade = calculateHospitalGrade(
    hospitalResources.serviceQuality,
    hospitalResources.coordinationScore,
    hospitalResources.facilityScore,
    hospitalResources.availabilityScore,
    hospitalResources.avgAmbulanceResponseTime
  );

  const adminAvgRating =
    hospitalResources.reviews.length > 0
      ? (
          hospitalResources.reviews.reduce((acc, r) => acc + r.rating, 0) /
          hospitalResources.reviews.length
        ).toFixed(1)
      : "4.8";

  const displayedHospitals = matchedHospitals.length > 0 ? matchedHospitals : hospitals;

  const navItems = [
    { id: "home", label: "Home", icon: Activity },
    { id: "patient", label: "Patient", icon: Stethoscope },
    { id: "ambulance", label: "Ambulance", icon: Ambulance },
    { id: "hospital", label: "Hospital Admin", icon: HospitalIcon },
    { id: "map", label: "Live Map", icon: MapIcon },
  ];

  return (
    <div className="min-h-screen bg-[#06070a] flex flex-col font-sans text-white selection:bg-red-600/30">
      {/* Navigation Header */}
      <header className="bg-black/85 backdrop-blur-xl border-b border-white/10 sticky top-0 z-[100]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between gap-4">
          <div
            className="flex items-center gap-3 cursor-pointer group shrink-0"
            onClick={() => setView("home")}
          >
            <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-red-600/30 group-hover:scale-105 transition-transform">
              <Activity size={22} />
            </div>
            <span className="text-xl sm:text-2xl font-black tracking-tight">
              MedCoord<span className="text-red-600">X</span>
            </span>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-8">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setView(item.id as ViewState)}
                className={cn(
                  "text-xs font-bold uppercase tracking-wider transition-all relative py-2 cursor-pointer",
                  view === item.id ? "text-red-500" : "text-white/50 hover:text-white"
                )}
              >
                {item.label}
                {view === item.id && (
                  <motion.div
                    layoutId="nav-underline"
                    className="absolute -bottom-1 left-0 right-0 h-0.5 bg-red-600 rounded-full"
                  />
                )}
              </button>
            ))}
          </nav>

          {/* Location Selector & Mobile Menu Button */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shrink-0" />
              <span className="text-[11px] font-semibold text-white/70 truncate max-w-[120px] sm:max-w-[160px]">
                {locationLabel}
              </span>
              <button
                onClick={detectUserLocation}
                title="Detect My Current Location"
                className="p-1 text-white/50 hover:text-white transition-colors cursor-pointer"
              >
                <Crosshair size={14} />
              </button>
              <select
                aria-label="Select City Region"
                value=""
                onChange={(e) => {
                  const preset = CITY_PRESETS.find((c) => c.label === e.target.value);
                  if (preset) {
                    applyUserLocation({ lat: preset.lat, lng: preset.lng }, `${preset.label}, IN`);
                  }
                }}
                className="bg-transparent text-[10px] font-bold uppercase tracking-wider text-red-400 focus:outline-none cursor-pointer"
              >
                <option value="" disabled className="bg-zinc-900 text-white">
                  City
                </option>
                {CITY_PRESETS.map((city) => (
                  <option key={city.label} value={city.label} className="bg-zinc-900 text-white">
                    {city.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              className="lg:hidden p-2 text-white/70 hover:text-white transition-colors"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="lg:hidden fixed inset-0 top-20 bg-[#06070a] z-[90] p-6 flex flex-col gap-3"
          >
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setView(item.id as ViewState);
                  setIsMenuOpen(false);
                }}
                className={cn(
                  "flex items-center gap-4 p-4 rounded-2xl text-base font-bold transition-colors",
                  view === item.id ? "bg-red-600 text-white" : "text-white/70 hover:bg-white/5"
                )}
              >
                <item.icon size={20} />
                {item.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[120] bg-emerald-600 text-white px-5 py-3 rounded-xl font-bold text-xs uppercase tracking-wider shadow-2xl flex items-center gap-2.5 border border-emerald-400/30"
          >
            <CheckCircle2 size={16} />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="flex-1">
        {/* Global Error Display */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="fixed top-24 left-1/2 -translate-x-1/2 z-[110] w-full max-w-md px-4"
            >
              <div className="bg-red-600 text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between gap-4 border border-red-400/40">
                <div className="flex items-center gap-3 min-w-0">
                  <AlertCircle size={20} className="shrink-0" />
                  <p className="text-xs font-bold leading-snug break-words">{error}</p>
                </div>
                <button
                  onClick={() => setError(null)}
                  className="p-1 hover:bg-white/10 rounded-lg transition-colors shrink-0"
                >
                  <X size={16} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {/* HOME VIEW */}
          {view === "home" && (
            <motion.div
              key="home"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="max-w-7xl mx-auto px-4 sm:px-6 py-14 sm:py-20"
            >
              <div className="text-center max-w-3xl mx-auto mb-16">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full mb-6">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                    System Online • Real-Time Emergency Coordination
                  </span>
                </div>
                <motion.h1
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  className="text-5xl sm:text-7xl md:text-8xl font-black tracking-tighter text-white mb-6"
                >
                  MedCoord<span className="text-red-600">X</span>
                </motion.h1>
                <p className="text-lg sm:text-xl text-white/60 mb-10">
                  Real-Time Hospital Resource & Emergency Routing System
                </p>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: "Hospitals Connected", value: "24" },
                    { label: "Dispatch Latency", value: "< 1.5s" },
                    { label: "Triage Accuracy", value: "98.4%" },
                    { label: "System Uptime", value: "99.9%" },
                  ].map((stat, i) => (
                    <div
                      key={i}
                      className="p-5 bg-zinc-900/70 border border-white/10 rounded-2xl text-center"
                    >
                      <div className="text-2xl font-black text-white mb-1">{stat.value}</div>
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-white/40">
                        {stat.label}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  {
                    id: "patient",
                    title: "Patient Portal",
                    desc: "Enter symptoms for AI-powered clinical triage analysis, specialist slot booking, and smart hospital matching.",
                    icon: Stethoscope,
                    accent: "border-white/10 bg-zinc-900/60 hover:border-white/25",
                  },
                  {
                    id: "ambulance",
                    title: "Ambulance Dashboard",
                    desc: "Transmit patient vitals in real time, view fleet accountability grades, and get live GPS turn-by-turn routing.",
                    icon: Ambulance,
                    accent: "border-red-500/40 bg-red-600/90 hover:bg-red-600",
                  },
                  {
                    id: "hospital",
                    title: "Hospital Admin",
                    desc: "Manage emergency & ICU bed capacity, specialist rosters, performance grades, and incoming ambulance alerts.",
                    icon: HospitalIcon,
                    accent: "border-white/10 bg-zinc-900/60 hover:border-white/25",
                  },
                ].map((card, i) => (
                  <motion.div
                    key={card.id}
                    initial={{ y: 30, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: i * 0.08 }}
                    onClick={() => setView(card.id as ViewState)}
                    className={cn(
                      "group cursor-pointer p-8 rounded-3xl border transition-all hover:-translate-y-1 flex flex-col justify-between",
                      card.accent
                    )}
                  >
                    <div>
                      <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center text-white mb-6">
                        <card.icon size={28} />
                      </div>
                      <h3 className="text-2xl font-bold text-white mb-3 tracking-tight">
                        {card.title}
                      </h3>
                      <p className="text-sm text-white/70 leading-relaxed mb-6">{card.desc}</p>
                    </div>
                    <div className="flex items-center gap-2 text-white font-bold uppercase tracking-wider text-xs">
                      Enter Portal <ArrowRight size={16} />
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* FULL SCREEN LIVE MAP VIEW */}
          {view === "map" && (
            <motion.div
              key="full-map"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 top-20 z-0"
            >
              <Map
                userLocation={userLocation}
                hospitals={displayedHospitals}
                ambulances={ambulances}
                selectedHospital={selectedHospital}
                routePath={routePath}
              />

              <div className="absolute top-4 left-4 right-4 sm:right-auto z-[100] flex flex-col gap-3 max-w-sm">
                <div className="bg-zinc-950/90 backdrop-blur-xl border border-white/10 p-5 rounded-2xl shadow-2xl">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center">
                        <Navigation size={16} />
                      </div>
                      <h3 className="font-bold text-sm">Live Telemetry Status</h3>
                    </div>
                    <span
                      className={cn(
                        "text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border",
                        wsStatus === "connected"
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                      )}
                    >
                      {wsStatus === "connected" ? "Live Sync" : wsStatus}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-white/60">
                    <div>Region: <span className="text-white font-semibold">{locationLabel}</span></div>
                    <div>Fleet Units: <span className="text-white font-semibold">{ambulances.length} Active</span></div>
                  </div>
                </div>

                {routingInfo && selectedHospital && (
                  <motion.div
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    className="bg-zinc-950/95 backdrop-blur-xl border border-red-500/40 p-5 rounded-2xl shadow-2xl"
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-red-400 mb-0.5">
                          Active Route Guidance
                        </div>
                        <div className="text-base font-bold text-white truncate">
                          {selectedHospital.name}
                        </div>
                        <div className="flex items-center gap-2 text-xs font-semibold text-white/70 mt-1">
                          <span className="text-emerald-400">
                            {(routingInfo.distance / 1000).toFixed(1)} km
                          </span>
                          <span>•</span>
                          <span>{Math.max(1, Math.round(routingInfo.duration / 60))} min ETA</span>
                        </div>
                      </div>
                      <button
                        onClick={() => setView("ambulance")}
                        className="p-1.5 bg-white/10 rounded-lg hover:bg-white/20 transition-colors shrink-0"
                        title="Back to Dashboard"
                      >
                        <X size={16} />
                      </button>
                    </div>

                    {isNavigating && routingInfo.steps.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-white/10 space-y-2.5 max-h-60 overflow-y-auto custom-scrollbar">
                        {routingInfo.steps.map((step, i) => (
                          <div key={i} className="flex items-start gap-2.5 text-xs">
                            <div className="w-5 h-5 bg-white/10 rounded flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                              {i + 1}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-white/90 leading-snug break-words">
                                {step.maneuver?.instruction || step.name || "Continue on route"}
                              </div>
                              <div className="text-[10px] text-white/40 mt-0.5">
                                {(step.distance / 1000).toFixed(1)} km • {Math.round(step.duration)}s
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="mt-4 pt-3 border-t border-white/10 flex gap-2">
                      <a
                        href={
                          selectedHospital.mapsUrl ||
                          `https://www.google.com/maps/dir/?api=1&destination=${selectedHospital.lat},${selectedHospital.lng}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold uppercase tracking-wider text-[11px] rounded-xl transition-all flex items-center justify-center gap-1.5"
                      >
                        <ExternalLink size={13} /> Google Maps
                      </a>
                      <button
                        onClick={() => {
                          setRoutePath(null);
                          setRoutingInfo(null);
                          setIsNavigating(false);
                        }}
                        className="px-3 py-2.5 bg-white/10 hover:bg-white/15 text-white/80 font-bold uppercase tracking-wider text-[11px] rounded-xl transition-all"
                      >
                        Clear
                      </button>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {/* PATIENT / AMBULANCE / HOSPITAL ADMIN PORTALS */}
          {(view === "patient" || view === "ambulance" || view === "hospital") && (
            <motion.div
              key="portal"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 15 }}
              className="max-w-7xl mx-auto px-4 sm:px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8"
            >
              {/* Left Column: Controls & Portal Panels */}
              <div className="lg:col-span-6 flex flex-col gap-6 min-w-0">
                {/* PATIENT PORTAL */}
                {view === "patient" && (
                  <div className="space-y-6">
                    <div className="bg-zinc-900/90 border border-white/10 p-6 sm:p-8 rounded-3xl shadow-xl">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 bg-red-600/15 rounded-xl flex items-center justify-center text-red-500 shrink-0">
                          <Stethoscope size={22} />
                        </div>
                        <div className="min-w-0">
                          <h2 className="text-2xl font-bold tracking-tight text-white">
                            Patient Symptom Triage
                          </h2>
                          <p className="text-xs text-white/50">
                            AI-assisted clinical severity evaluation & smart hospital routing
                          </p>
                        </div>
                      </div>

                      <div className="space-y-5 mt-6">
                        <div className="space-y-2">
                          <label className="text-xs font-semibold uppercase tracking-wider text-white/60">
                            Describe Symptoms
                          </label>
                          <textarea
                            value={symptoms}
                            onChange={(e) => setSymptoms(e.target.value)}
                            placeholder="e.g., severe chest pain radiating to left arm, sweating, shortness of breath..."
                            className="w-full h-28 bg-black/60 border border-white/15 rounded-2xl p-4 text-sm text-white placeholder:text-white/25 focus:ring-2 focus:ring-red-600 outline-none transition-all resize-none"
                          />
                        </div>

                        <div className="space-y-2.5">
                          <label className="text-xs font-semibold uppercase tracking-wider text-white/60">
                            Quick Symptom Tags
                          </label>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {PREDEFINED_SYMPTOMS.map((tag) => (
                              <button
                                key={tag}
                                onClick={() => toggleTag(tag)}
                                className={cn(
                                  "px-3 py-2 rounded-xl text-xs font-semibold border transition-all truncate cursor-pointer",
                                  selectedTags.includes(tag)
                                    ? "bg-red-600 border-red-500 text-white"
                                    : "bg-white/5 border-white/10 text-white/60 hover:border-white/25 hover:text-white"
                                )}
                              >
                                {tag}
                              </button>
                            ))}
                          </div>
                        </div>

                        <button
                          onClick={handleTriage}
                          disabled={isTriageLoading || (!symptoms.trim() && selectedTags.length === 0)}
                          className="w-full py-4 bg-red-600 hover:bg-red-700 disabled:bg-white/10 disabled:text-white/30 text-white font-bold uppercase tracking-wider text-xs rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-600/20 cursor-pointer"
                        >
                          {isTriageLoading ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          ) : (
                            <>
                              Analyze Symptoms & Match Hospitals <ArrowRight size={16} />
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    <AnimatePresence>
                      {triageResult && (
                        <motion.div
                          initial={{ opacity: 0, y: 15 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="bg-zinc-900/90 border border-white/10 p-6 rounded-3xl shadow-xl space-y-4"
                        >
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <h3 className="text-lg font-bold tracking-tight">
                              Clinical Triage Assessment
                            </h3>
                            <span
                              className={cn(
                                "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider",
                                triageResult.severity === "Critical"
                                  ? "bg-red-600 text-white"
                                  : triageResult.severity === "High"
                                  ? "bg-orange-600 text-white"
                                  : triageResult.severity === "Moderate"
                                  ? "bg-amber-500 text-black"
                                  : "bg-emerald-600 text-white"
                              )}
                            >
                              {triageResult.severity} Severity
                            </span>
                          </div>

                          <div>
                            <div className="text-xs font-medium text-white/50 mb-1">
                              Suspected Clinical Presentation
                            </div>
                            <div className="text-lg font-bold text-white break-words">
                              {triageResult.condition}
                            </div>
                          </div>

                          <div>
                            <div className="text-xs font-medium text-white/50 mb-2">
                              Recommended Specialties
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {triageResult.recommendedSpecialties.map((s, i) => (
                                <span
                                  key={i}
                                  className="px-3 py-1 bg-white/5 border border-white/10 rounded-lg text-xs font-semibold text-white/80"
                                >
                                  {s}
                                </span>
                              ))}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {/* AMBULANCE DASHBOARD */}
                {view === "ambulance" && (
                  <div className="space-y-6">
                    {/* Active Dispatch Card */}
                    <div className="bg-gradient-to-br from-red-600 to-red-700 p-6 sm:p-7 rounded-3xl shadow-xl">
                      <div className="flex items-center justify-between gap-4 mb-6">
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center shrink-0">
                            <Ambulance size={26} />
                          </div>
                          <div className="min-w-0">
                            <h2 className="text-2xl font-black tracking-tight truncate">
                              Unit ALS-108
                            </h2>
                            <div className="flex items-center gap-2 text-xs font-semibold text-white/80">
                              <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                              Active Paramedic Telemetry
                            </div>
                          </div>
                        </div>
                        <span
                          className={cn(
                            "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider shrink-0",
                            patientStatus === "accepted"
                              ? "bg-emerald-500 text-white"
                              : patientStatus === "pending"
                              ? "bg-amber-400 text-black animate-pulse"
                              : patientStatus === "rejected"
                              ? "bg-zinc-900 text-red-400"
                              : "bg-white/20 text-white"
                          )}
                        >
                          {patientStatus === "none" ? "Standby" : patientStatus}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="p-4 bg-black/25 rounded-2xl border border-white/15 min-w-0">
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-white/70 mb-1">
                            Target Receiving Hospital
                          </label>
                          <select
                            value={selectedHospital?.id || displayedHospitals[0]?.id || ""}
                            onChange={(e) => {
                              const found = displayedHospitals.find((h) => h.id === e.target.value);
                              if (found) getRouting(found, false);
                            }}
                            className="w-full bg-black/40 border border-white/20 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none cursor-pointer"
                          >
                            {displayedHospitals.map((h) => (
                              <option key={h.id} value={h.id} className="bg-zinc-900 text-white">
                                {h.name} ({(h.distance || 0).toFixed(1)} km • Grade {h.grade})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="p-4 bg-black/25 rounded-2xl border border-white/15 flex flex-col justify-between min-w-0">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-white/70">
                            Navigation Action
                          </div>
                          <div className="flex items-center justify-between gap-2 mt-2">
                            <span className="text-xs font-bold truncate">
                              {routingInfo
                                ? `${(routingInfo.distance / 1000).toFixed(1)} km • ${Math.max(
                                    1,
                                    Math.round(routingInfo.duration / 60)
                                  )} min`
                                : "Route Ready"}
                            </span>
                            <button
                              onClick={() => {
                                const target = selectedHospital || displayedHospitals[0];
                                if (target) getRouting(target, true);
                              }}
                              className="px-3 py-1.5 bg-white text-red-600 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-white/90 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
                            >
                              Full Map <Navigation size={12} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Vitals Input & Transmit Card */}
                    <div className="bg-zinc-900/90 border border-white/10 p-6 sm:p-7 rounded-3xl shadow-xl">
                      <div className="flex items-center justify-between gap-3 mb-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-red-600/15 rounded-xl flex items-center justify-center text-red-500">
                            <HeartPulse size={22} />
                          </div>
                          <div>
                            <h3 className="text-xl font-bold tracking-tight">Patient Vitals</h3>
                            <p className="text-xs text-white/50">
                              Live telemetry transmission to receiving emergency bay
                            </p>
                          </div>
                        </div>
                        <div className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                            Monitors Active
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 mb-6">
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-white/60">
                            Pulse Rate (BPM)
                          </label>
                          <div className="relative">
                            <Zap
                              size={16}
                              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-red-500"
                            />
                            <input
                              type="text"
                              value={vitals.hr}
                              onChange={(e) => setVitals({ ...vitals, hr: e.target.value })}
                              className="w-full bg-black/50 border border-white/15 rounded-xl py-3 pl-10 pr-3 text-base font-bold focus:ring-2 focus:ring-red-600 outline-none"
                            />
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-white/60">SpO2 (%)</label>
                          <div className="relative">
                            <Droplets
                              size={16}
                              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-blue-400"
                            />
                            <input
                              type="text"
                              value={vitals.spo2}
                              onChange={(e) => setVitals({ ...vitals, spo2: e.target.value })}
                              className="w-full bg-black/50 border border-white/15 rounded-xl py-3 pl-10 pr-3 text-base font-bold focus:ring-2 focus:ring-red-600 outline-none"
                            />
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-white/60">
                            Blood Pressure (mmHg)
                          </label>
                          <div className="relative">
                            <Wind
                              size={16}
                              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-400"
                            />
                            <input
                              type="text"
                              value={vitals.bp}
                              onChange={(e) => setVitals({ ...vitals, bp: e.target.value })}
                              className="w-full bg-black/50 border border-white/15 rounded-xl py-3 pl-10 pr-3 text-base font-bold focus:ring-2 focus:ring-red-600 outline-none"
                            />
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-white/60">
                            Temperature (°C)
                          </label>
                          <div className="relative">
                            <Thermometer
                              size={16}
                              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-amber-400"
                            />
                            <input
                              type="text"
                              value={vitals.temp}
                              onChange={(e) => setVitals({ ...vitals, temp: e.target.value })}
                              className="w-full bg-black/50 border border-white/15 rounded-xl py-3 pl-10 pr-3 text-base font-bold focus:ring-2 focus:ring-red-600 outline-none"
                            />
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={handleTransmitVitals}
                        disabled={isTransmitting}
                        className={cn(
                          "w-full py-4 text-white font-bold uppercase tracking-wider text-xs rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg cursor-pointer",
                          isTransmitting
                            ? "bg-white/10 cursor-not-allowed"
                            : "bg-red-600 hover:bg-red-700 shadow-red-600/20"
                        )}
                      >
                        {isTransmitting ? (
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <>
                            Transmit Vitals to {(selectedHospital || displayedHospitals[0])?.name || "Hospital"}{" "}
                            <ArrowRight size={16} />
                          </>
                        )}
                      </button>

                      {patientStatus === "accepted" && (selectedHospital || displayedHospitals[0]) && (
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="mt-4 p-4 bg-emerald-500/10 border border-emerald-500/25 rounded-2xl flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                              <CheckCircle2 size={15} />
                              Trauma Bay Confirmed • {(selectedHospital || displayedHospitals[0])?.name}
                            </div>
                            <div className="text-[11px] text-white/60 mt-0.5">
                              Vitals synced with Hospital Admin Portal • Emergency Bed Reserved
                            </div>
                          </div>
                          <button
                            onClick={() => setView("hospital")}
                            className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 rounded-xl text-[11px] font-bold shrink-0 cursor-pointer"
                          >
                            View Admin
                          </button>
                        </motion.div>
                      )}
                    </div>

                    {/* Ambulance Fleet Accountability & Grading */}
                    <div className="bg-zinc-900/90 border border-white/10 p-6 sm:p-7 rounded-3xl shadow-xl">
                      <div className="flex items-center justify-between gap-3 mb-5">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-500/15 rounded-xl flex items-center justify-center text-blue-400">
                            <Activity size={20} />
                          </div>
                          <div>
                            <h3 className="text-lg font-bold tracking-tight">
                              Fleet Performance Grading
                            </h3>
                            <p className="text-xs text-white/50">
                              Real-time GPS response & transport efficiency index
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {ambulances.map((amb) => (
                          <div
                            key={amb.id}
                            className="p-4 bg-black/40 border border-white/10 rounded-2xl flex flex-col gap-3"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center text-white/70 shrink-0">
                                  <Ambulance size={18} />
                                </div>
                                <div className="min-w-0">
                                  <div className="text-sm font-bold text-white truncate">
                                    {amb.number}
                                  </div>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <div
                                      className={cn(
                                        "w-1.5 h-1.5 rounded-full",
                                        amb.status === "available" ? "bg-emerald-500" : "bg-amber-500"
                                      )}
                                    />
                                    <span className="text-[11px] font-medium text-white/50 capitalize">
                                      {amb.status}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div
                                className={cn(
                                  "px-3 py-1 rounded-xl text-xs font-black border shrink-0",
                                  amb.grade === "A+"
                                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                    : amb.grade === "A"
                                    ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
                                    : "bg-amber-500/10 border-amber-500/30 text-amber-400"
                                )}
                              >
                                Grade {amb.grade}
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 pt-1">
                              <div>
                                <div className="flex items-center justify-between text-xs text-white/60 mb-1">
                                  <span>Avg Response</span>
                                  <span className="font-bold text-white">
                                    {amb.responseTime.toFixed(1)} min
                                  </span>
                                </div>
                                <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                                  <div
                                    style={{
                                      width: `${Math.max(15, Math.min(100, 100 - amb.responseTime * 4))}%`,
                                    }}
                                    className={cn(
                                      "h-full rounded-full",
                                      amb.responseTime < 10 ? "bg-emerald-500" : "bg-blue-500"
                                    )}
                                  />
                                </div>
                              </div>

                              <div>
                                <div className="flex items-center justify-between text-xs text-white/60 mb-1">
                                  <span>Efficiency</span>
                                  <span className="font-bold text-white">
                                    {amb.efficiency.toFixed(1)}%
                                  </span>
                                </div>
                                <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                                  <div
                                    style={{ width: `${Math.min(100, amb.efficiency)}%` }}
                                    className={cn(
                                      "h-full rounded-full",
                                      amb.efficiency > 90 ? "bg-emerald-500" : "bg-blue-500"
                                    )}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* HOSPITAL ADMIN DASHBOARD (Clean, Structured, Zero-Overflow Card Design) */}
                {view === "hospital" && (
                  <div className="space-y-6">
                    {/* Card 1: Facility Overview & Capacity */}
                    <div className="bg-zinc-900/90 border border-white/10 p-6 sm:p-7 rounded-3xl shadow-xl space-y-6">
                      {/* Section 1: Basic Info & Dynamic Grade */}
                      <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-white/10">
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className="w-11 h-11 bg-red-600/15 rounded-2xl flex items-center justify-center text-red-500 shrink-0">
                            <HospitalIcon size={22} />
                          </div>
                          <div className="min-w-0">
                            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight truncate">
                              {hospitalResources.name}
                            </h2>
                            <div className="flex items-center gap-2 text-xs text-white/50 mt-0.5">
                              <span>★ {adminAvgRating} Rating</span>
                              <span>•</span>
                              <span className="text-emerald-400 font-medium">
                                Synced {lastSyncTime}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div
                          className={cn(
                            "px-3.5 py-1.5 rounded-xl border text-xs font-black tracking-wider shrink-0",
                            adminGrade === "A+"
                              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                              : adminGrade === "A"
                              ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
                              : adminGrade === "B"
                              ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                              : "bg-red-500/10 border-red-500/30 text-red-400"
                          )}
                        >
                          GRADE {adminGrade}
                        </div>
                      </div>

                      {/* Section 2: Key Bed Capacity Controls */}
                      <div>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-white/50 mb-3">
                          Live Bed Capacity
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="p-4 bg-black/40 rounded-2xl border border-white/10 flex items-center justify-between gap-3">
                            <div>
                              <div className="text-xs font-medium text-white/50">
                                Emergency Beds
                              </div>
                              <div className="text-3xl font-black text-white mt-0.5">
                                {hospitalResources.beds}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => updateResource("beds", hospitalResources.beds - 1)}
                                className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 flex items-center justify-center text-base font-bold cursor-pointer"
                              >
                                -
                              </button>
                              <button
                                onClick={() => updateResource("beds", hospitalResources.beds + 1)}
                                className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 flex items-center justify-center text-base font-bold cursor-pointer"
                              >
                                +
                              </button>
                            </div>
                          </div>

                          <div className="p-4 bg-black/40 rounded-2xl border border-white/10 flex items-center justify-between gap-3">
                            <div>
                              <div className="text-xs font-medium text-white/50">ICU Capacity</div>
                              <div className="text-3xl font-black text-blue-400 mt-0.5">
                                {hospitalResources.icuBeds}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() =>
                                  updateResource("icuBeds", hospitalResources.icuBeds - 1)
                                }
                                className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 flex items-center justify-center text-base font-bold cursor-pointer"
                              >
                                -
                              </button>
                              <button
                                onClick={() =>
                                  updateResource("icuBeds", hospitalResources.icuBeds + 1)
                                }
                                className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 flex items-center justify-center text-base font-bold cursor-pointer"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Section 3: Structured Performance Metrics Grid */}
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-xs font-bold uppercase tracking-wider text-white/50">
                            Performance & Grading Metrics
                          </h3>
                          <span className="text-xs font-semibold text-white/60">
                            Composite:{" "}
                            {(
                              (hospitalResources.serviceQuality +
                                hospitalResources.coordinationScore +
                                hospitalResources.facilityScore +
                                hospitalResources.availabilityScore) /
                              4
                            ).toFixed(1)}
                            %
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                          {[
                            {
                              key: "avgAmbulanceResponseTime" as const,
                              label: "Avg Response",
                              value: `${hospitalResources.avgAmbulanceResponseTime.toFixed(1)}m`,
                              icon: Clock,
                              color: "text-red-400",
                            },
                            {
                              key: "serviceQuality" as const,
                              label: "Service Quality",
                              value: `${hospitalResources.serviceQuality.toFixed(1)}%`,
                              icon: ShieldCheck,
                              color: "text-emerald-400",
                            },
                            {
                              key: "coordinationScore" as const,
                              label: "Coordination",
                              value: `${hospitalResources.coordinationScore.toFixed(1)}%`,
                              icon: BarChart3,
                              color: "text-blue-400",
                            },
                            {
                              key: "facilityScore" as const,
                              label: "Facility Score",
                              value: `${hospitalResources.facilityScore.toFixed(1)}%`,
                              icon: Shield,
                              color: "text-amber-400",
                            },
                            {
                              key: "availabilityScore" as const,
                              label: "Availability",
                              value: `${hospitalResources.availabilityScore.toFixed(1)}%`,
                              icon: Activity,
                              color: "text-purple-400",
                            },
                          ].map((metric) => (
                            <div
                              key={metric.key}
                              className="p-3.5 bg-black/40 rounded-2xl border border-white/10 flex items-center justify-between gap-2 min-w-0"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 text-xs text-white/50 truncate">
                                  <metric.icon size={13} className={metric.color} />
                                  <span className="truncate">{metric.label}</span>
                                </div>
                                <div className="text-base font-bold text-white mt-1">
                                  {metric.value}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={() =>
                                    updateResource(metric.key, hospitalResources[metric.key] - 1)
                                  }
                                  className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/15 text-xs font-bold flex items-center justify-center cursor-pointer"
                                >
                                  -
                                </button>
                                <button
                                  onClick={() =>
                                    updateResource(metric.key, hospitalResources[metric.key] + 1)
                                  }
                                  className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/15 text-xs font-bold flex items-center justify-center cursor-pointer"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Section 4: Specialist Roster & Equipment */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-white/10">
                        {/* Specialist Roster */}
                        <div className="p-4 bg-black/40 rounded-2xl border border-white/10 space-y-3 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold uppercase tracking-wider text-white/60">
                              On-Call Specialists
                            </span>
                            <button
                              onClick={() => setShowAddDoctor(!showAddDoctor)}
                              className="text-xs font-bold text-red-400 hover:text-red-300 flex items-center gap-1 cursor-pointer"
                            >
                              <Plus size={13} /> Add
                            </button>
                          </div>

                          {showAddDoctor && (
                            <form onSubmit={handleAddAdminDoctor} className="space-y-2 pt-1">
                              <input
                                type="text"
                                placeholder="Doctor Name"
                                value={newDoctorName}
                                onChange={(e) => setNewDoctorName(e.target.value)}
                                className="w-full bg-white/5 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none"
                              />
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  placeholder="Specialty"
                                  value={newDoctorSpecialty}
                                  onChange={(e) => setNewDoctorSpecialty(e.target.value)}
                                  className="flex-1 bg-white/5 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none min-w-0"
                                />
                                <button
                                  type="submit"
                                  className="px-3 py-1.5 bg-red-600 rounded-lg text-xs font-bold text-white shrink-0 cursor-pointer"
                                >
                                  Save
                                </button>
                              </div>
                            </form>
                          )}

                          <div className="space-y-2">
                            {hospitalResources.doctors.map((doc) => (
                              <div
                                key={doc.id}
                                onClick={() => handleToggleAdminDoctor(doc.id)}
                                className="flex items-center justify-between gap-2 p-2.5 bg-white/5 hover:bg-white/10 rounded-xl border border-white/5 cursor-pointer transition-colors"
                              >
                                <div className="min-w-0">
                                  <div className="text-xs font-bold text-white truncate">
                                    {doc.name}
                                  </div>
                                  <div className="text-[11px] text-white/50 truncate">
                                    {doc.specialty}
                                  </div>
                                </div>
                                <span
                                  className={cn(
                                    "px-2 py-0.5 rounded-md text-[10px] font-bold uppercase shrink-0",
                                    doc.isAvailable
                                      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                                      : "bg-red-500/15 text-red-400 border border-red-500/30"
                                  )}
                                >
                                  {doc.isAvailable ? "In Clinic" : "Off Duty"}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Equipment & Patient Reviews Summary */}
                        <div className="space-y-4 min-w-0">
                          <div className="p-4 bg-black/40 rounded-2xl border border-white/10 space-y-3">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-bold uppercase tracking-wider text-white/60">
                                Critical Equipment
                              </span>
                              <button
                                onClick={() => setShowAddEquipment(!showAddEquipment)}
                                className="text-xs font-bold text-red-400 hover:text-red-300 flex items-center gap-1 cursor-pointer"
                              >
                                <Plus size={13} /> Add
                              </button>
                            </div>

                            {showAddEquipment && (
                              <form onSubmit={handleAddAdminEquipment} className="flex gap-2">
                                <input
                                  type="text"
                                  placeholder="e.g., ECMO Unit x1"
                                  value={newEquipment}
                                  onChange={(e) => setNewEquipment(e.target.value)}
                                  className="flex-1 bg-white/5 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none min-w-0"
                                />
                                <button
                                  type="submit"
                                  className="px-3 py-1.5 bg-red-600 rounded-lg text-xs font-bold text-white shrink-0 cursor-pointer"
                                >
                                  Add
                                </button>
                              </form>
                            )}

                            <div className="flex flex-wrap gap-1.5">
                              {hospitalResources.equipment.map((eq, i) => (
                                <span
                                  key={i}
                                  className="px-2.5 py-1 bg-white/5 border border-white/10 rounded-lg text-xs font-medium text-white/80"
                                >
                                  {eq}
                                </span>
                              ))}
                            </div>
                          </div>

                          <div className="p-4 bg-black/40 rounded-2xl border border-white/10 space-y-2.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold uppercase tracking-wider text-white/60">
                                Recent Feedback
                              </span>
                              <span className="text-xs font-bold text-amber-400">
                                ★ {adminAvgRating}
                              </span>
                            </div>
                            {hospitalResources.reviews.slice(0, 2).map((review) => (
                              <div
                                key={review.id}
                                className="p-2.5 bg-white/5 rounded-xl border border-white/5 text-xs"
                              >
                                <div className="flex items-center justify-between text-white/70 mb-1">
                                  <span className="font-bold text-white">{review.author}</span>
                                  <span className="text-amber-400 font-semibold">
                                    ★ {review.rating.toFixed(1)}
                                  </span>
                                </div>
                                <p className="text-white/60 line-clamp-2 italic">
                                  "{review.comment}"
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Card 2: Incoming Patient Telemetry */}
                    <div
                      className={cn(
                        "bg-zinc-900/90 border p-6 sm:p-7 rounded-3xl shadow-xl transition-all",
                        transmittedTriage?.severity === "Critical"
                          ? "border-red-500 shadow-red-900/30"
                          : "border-white/10"
                      )}
                    >
                      <div className="flex items-center justify-between gap-3 mb-5">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-red-600/15 rounded-xl flex items-center justify-center text-red-500">
                            <Users size={20} />
                          </div>
                          <div>
                            <h3 className="text-lg font-bold tracking-tight">
                              Incoming Ambulance Telemetry
                            </h3>
                            <p className="text-xs text-white/50">
                              Real-time pre-arrival vitals & triage handoff
                            </p>
                          </div>
                        </div>
                        {transmittedVitals && (
                          <span
                            className={cn(
                              "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider",
                              transmittedTriage?.severity === "Critical"
                                ? "bg-red-600 text-white animate-pulse"
                                : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                            )}
                          >
                            {transmittedTriage?.severity || "Incoming"} Alert
                          </span>
                        )}
                      </div>

                      {transmittedVitals ? (
                        <div className="space-y-4">
                          <div className="p-4 bg-black/40 rounded-2xl border border-white/10">
                            <div className="text-xs text-white/50">Suspected Condition</div>
                            <div className="text-base font-bold text-white mt-0.5">
                              {transmittedTriage?.condition}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="p-3.5 bg-black/40 rounded-2xl border border-white/10 text-center">
                              <div className="text-xs text-white/50">Pulse</div>
                              <div className="text-xl font-black text-white mt-0.5">
                                {transmittedVitals.hr} <span className="text-xs font-normal">bpm</span>
                              </div>
                            </div>
                            <div className="p-3.5 bg-black/40 rounded-2xl border border-white/10 text-center">
                              <div className="text-xs text-white/50">SpO2</div>
                              <div className="text-xl font-black text-blue-400 mt-0.5">
                                {transmittedVitals.spo2}%
                              </div>
                            </div>
                            <div className="p-3.5 bg-black/40 rounded-2xl border border-white/10 text-center">
                              <div className="text-xs text-white/50">BP</div>
                              <div className="text-xl font-black text-emerald-400 mt-0.5">
                                {transmittedVitals.bp}
                              </div>
                            </div>
                            <div className="p-3.5 bg-black/40 rounded-2xl border border-white/10 text-center">
                              <div className="text-xs text-white/50">Temp</div>
                              <div className="text-xl font-black text-amber-400 mt-0.5">
                                {Number(transmittedVitals.temp).toFixed(1)}°C
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                            <div className="text-xs font-semibold text-white/70">
                              Handoff Status:{" "}
                              <span
                                className={cn(
                                  "font-bold uppercase",
                                  patientStatus === "accepted"
                                    ? "text-emerald-400"
                                    : patientStatus === "rejected"
                                    ? "text-red-400"
                                    : "text-amber-400"
                                )}
                              >
                                {patientStatus}
                              </span>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  setPatientStatus("accepted");
                                  wsRef.current?.send(
                                    JSON.stringify({
                                      type: "PATIENT_STATUS_UPDATE",
                                      data: { status: "accepted" },
                                    })
                                  );
                                  showToast("Trauma Bay Prepared & Confirmed");
                                }}
                                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold cursor-pointer"
                              >
                                Confirm Bay
                              </button>
                              <button
                                onClick={() => {
                                  setPatientStatus("rejected");
                                  wsRef.current?.send(
                                    JSON.stringify({
                                      type: "PATIENT_STATUS_UPDATE",
                                      data: { status: "rejected" },
                                    })
                                  );
                                  showToast("Unit Notified to Divert");
                                }}
                                className="px-4 py-2 bg-white/10 hover:bg-red-600/30 text-white/80 rounded-xl text-xs font-bold cursor-pointer"
                              >
                                Divert Unit
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="p-8 text-center bg-black/30 border border-dashed border-white/10 rounded-2xl">
                          <p className="text-xs font-semibold text-white/40">
                            No active incoming ambulance transmissions. Transmit vitals from the
                            Ambulance Dashboard to test live handoff.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* RECOMMENDED FACILITIES / HOSPITAL CARDS LIST (Clean, Structured, 1-Decimal Formatting) */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-white/50">
                      Medical Facilities ({displayedHospitals.length})
                    </h3>
                    <span className="text-xs text-white/40">Click a card to inspect & route</span>
                  </div>

                  <div className="space-y-3 max-h-[620px] overflow-y-auto pr-1 custom-scrollbar">
                    {displayedHospitals.map((h) => {
                      const isSelected = selectedHospital?.id === h.id;
                      const computedGrade = calculateHospitalGrade(
                        h.serviceQuality,
                        h.coordinationScore,
                        h.facilityScore,
                        h.availabilityScore,
                        h.avgAmbulanceResponseTime
                      );

                      return (
                        <div
                          key={h.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => getRouting(h, false)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              getRouting(h, false);
                            }
                          }}
                          className={cn(
                            "w-full text-left p-5 rounded-2xl border transition-all cursor-pointer overflow-hidden",
                            isSelected
                              ? "bg-zinc-900 border-red-500/60 shadow-lg"
                              : "bg-zinc-900/60 border-white/10 hover:border-white/25"
                          )}
                        >
                          {/* Top Row: Hospital Name, Grade Badge, Expand Icon */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3.5 min-w-0 flex-1">
                              <div
                                className={cn(
                                  "w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-colors",
                                  isSelected
                                    ? "bg-red-600 text-white"
                                    : "bg-white/5 text-white/60"
                                )}
                              >
                                <HospitalIcon size={20} />
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className="font-bold text-base text-white truncate max-w-full">
                                    {h.name}
                                  </h4>
                                  <span
                                    className={cn(
                                      "px-2 py-0.5 rounded-md text-[10px] font-black border shrink-0",
                                      computedGrade === "A+"
                                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                        : computedGrade === "A"
                                        ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
                                        : "bg-amber-500/10 border-amber-500/30 text-amber-400"
                                    )}
                                  >
                                    GRADE {computedGrade}
                                  </span>
                                </div>

                                {/* Key Metrics Bar (1 Decimal Place Formatting) */}
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-white/60 mt-1.5">
                                  <span className="text-amber-400 font-bold">
                                    ★ {Number(h.rating).toFixed(1)}
                                  </span>
                                  <span>•</span>
                                  <span>
                                    <strong className="text-white">{h.beds}</strong> Beds
                                  </span>
                                  <span>•</span>
                                  <span className="text-blue-400">
                                    <strong>{h.icuBeds}</strong> ICU
                                  </span>
                                  <span>•</span>
                                  <span className="text-emerald-400 font-semibold">
                                    {(h.distance ?? 0).toFixed(1)} km
                                  </span>
                                  {isSelected && routingInfo && (
                                    <>
                                      <span>•</span>
                                      <span className="text-red-400 font-semibold">
                                        {Math.max(1, Math.round(routingInfo.duration / 60))} min ETA
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            <ChevronRight
                              size={18}
                              className={cn(
                                "transition-transform shrink-0 mt-1",
                                isSelected ? "text-red-500 rotate-90" : "text-white/30"
                              )}
                            />
                          </div>

                          {/* Expanded Structured Sections */}
                          <AnimatePresence>
                            {isSelected && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                className="overflow-hidden"
                              >
                                <div className="mt-5 pt-5 border-t border-white/10 space-y-5">
                                  {/* Section A: Performance Metrics */}
                                  <div>
                                    <div className="text-[11px] font-bold uppercase tracking-wider text-white/40 mb-2.5">
                                      Performance & Accountability
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                                      <div className="p-3 bg-black/40 rounded-xl border border-white/5 text-center">
                                        <div className="text-xs text-white/50">Response</div>
                                        <div className="text-sm font-bold text-white mt-0.5">
                                          {h.avgAmbulanceResponseTime.toFixed(1)}m
                                        </div>
                                      </div>
                                      <div className="p-3 bg-black/40 rounded-xl border border-white/5 text-center">
                                        <div className="text-xs text-white/50">Quality</div>
                                        <div className="text-sm font-bold text-emerald-400 mt-0.5">
                                          {h.serviceQuality.toFixed(1)}%
                                        </div>
                                      </div>
                                      <div className="p-3 bg-black/40 rounded-xl border border-white/5 text-center">
                                        <div className="text-xs text-white/50">Coordination</div>
                                        <div className="text-sm font-bold text-blue-400 mt-0.5">
                                          {h.coordinationScore.toFixed(1)}%
                                        </div>
                                      </div>
                                      <div className="p-3 bg-black/40 rounded-xl border border-white/5 text-center">
                                        <div className="text-xs text-white/50">Availability</div>
                                        <div className="text-sm font-bold text-purple-400 mt-0.5">
                                          {h.availabilityScore.toFixed(1)}%
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Section B: Specialists & Appointment Slot Booking */}
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-2 min-w-0">
                                      <div className="text-[11px] font-bold uppercase tracking-wider text-white/40 flex items-center gap-1.5">
                                        <Stethoscope size={13} className="text-blue-400" />
                                        Specialists & Slots
                                      </div>
                                      <div className="space-y-2">
                                        {h.doctors?.map((doc) => (
                                          <div
                                            key={doc.id}
                                            className="p-3 bg-black/40 border border-white/5 rounded-xl space-y-2"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <div className="flex items-center justify-between gap-2">
                                              <div className="min-w-0">
                                                <div className="text-xs font-bold text-white truncate">
                                                  {doc.name}
                                                </div>
                                                <div className="text-[10px] text-white/50 truncate">
                                                  {doc.specialty}
                                                </div>
                                              </div>
                                              <span
                                                className={cn(
                                                  "px-2 py-0.5 rounded text-[10px] font-bold shrink-0",
                                                  doc.isAvailable
                                                    ? "bg-emerald-500/15 text-emerald-400"
                                                    : "bg-red-500/15 text-red-400"
                                                )}
                                              >
                                                {doc.isAvailable ? "Available" : "Busy"}
                                              </span>
                                            </div>
                                            {doc.slots && doc.slots.length > 0 && (
                                              <div className="flex flex-wrap gap-1.5 pt-1">
                                                {doc.slots.map((slot) => {
                                                  const key = `${doc.id}-${slot.time}`;
                                                  const isBooked = bookedSlots[doc.id] === slot.time;
                                                  return (
                                                    <button
                                                      key={key}
                                                      disabled={!slot.available && !isBooked}
                                                      onClick={() => {
                                                        setBookedSlots((prev) => ({
                                                          ...prev,
                                                          [doc.id]: slot.time,
                                                        }));
                                                        showToast(
                                                          `Slot ${slot.time} reserved with ${doc.name}`
                                                        );
                                                      }}
                                                      className={cn(
                                                        "px-2 py-0.5 rounded text-[10px] font-semibold border transition-colors cursor-pointer",
                                                        isBooked
                                                          ? "bg-emerald-600 border-emerald-500 text-white"
                                                          : slot.available
                                                          ? "bg-white/5 border-white/15 text-white/80 hover:border-white/40"
                                                          : "bg-white/[0.02] border-white/5 text-white/25 cursor-not-allowed"
                                                      )}
                                                    >
                                                      {isBooked ? `Booked ${slot.time}` : slot.time}
                                                    </button>
                                                  );
                                                })}
                                              </div>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </div>

                                    {/* Section C: Equipment & Specialties */}
                                    <div className="space-y-3 min-w-0">
                                      <div>
                                        <div className="text-[11px] font-bold uppercase tracking-wider text-white/40 flex items-center gap-1.5 mb-2">
                                          <Wrench size={13} className="text-amber-400" />
                                          Equipment & Capabilities
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                          {h.equipment?.map((e, i) => (
                                            <span
                                              key={i}
                                              className="px-2.5 py-1 bg-amber-500/10 border border-amber-500/20 rounded-lg text-[11px] font-medium text-amber-300"
                                            >
                                              {e}
                                            </span>
                                          ))}
                                        </div>
                                      </div>

                                      <div>
                                        <div className="text-[11px] font-bold uppercase tracking-wider text-white/40 mb-1.5">
                                          Departments
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                          {h.specialties.map((spec, i) => (
                                            <span
                                              key={i}
                                              className="px-2.5 py-1 bg-white/5 border border-white/10 rounded-lg text-[11px] text-white/70"
                                            >
                                              {spec}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Section D: Actions */}
                                  <div
                                    className="flex flex-wrap gap-2.5 pt-2"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <button
                                      onClick={() => getRouting(h, true)}
                                      className="flex-1 py-3 bg-red-600 hover:bg-red-700 rounded-xl text-xs font-bold uppercase tracking-wider text-white transition-all flex items-center justify-center gap-2 cursor-pointer"
                                    >
                                      <Navigation size={14} /> Start Live Navigation
                                    </button>
                                    <a
                                      href={
                                        h.mapsUrl ||
                                        `https://www.google.com/maps/dir/?api=1&destination=${h.lat},${h.lng}`
                                      }
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/15 rounded-xl text-xs font-bold uppercase tracking-wider text-white transition-all flex items-center justify-center gap-1.5"
                                    >
                                      <ExternalLink size={14} /> Maps
                                    </a>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Right Column: Embedded Live Map & Turn-by-Turn Preview */}
              <div className="lg:col-span-6 flex flex-col gap-6 h-[550px] lg:h-[780px] lg:sticky lg:top-28">
                <div className="bg-zinc-900/90 rounded-3xl border border-white/10 shadow-2xl flex-1 flex flex-col overflow-hidden">
                  <div className="p-5 sm:p-6 flex items-center justify-between gap-4 border-b border-white/10">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 bg-red-600/15 rounded-xl flex items-center justify-center text-red-500 shrink-0">
                        <Navigation size={20} />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-lg font-bold tracking-tight text-white truncate">
                          {selectedHospital
                            ? `Routing to ${selectedHospital.name}`
                            : "Live Emergency Map"}
                        </h2>
                        {routingInfo ? (
                          <div className="flex items-center gap-2 text-xs font-semibold text-white/60 mt-0.5">
                            <span className="text-red-400">
                              {(routingInfo.distance / 1000).toFixed(1)} km
                            </span>
                            <span>•</span>
                            <span className="text-emerald-400">
                              {Math.max(1, Math.round(routingInfo.duration / 60))} min driving ETA
                            </span>
                          </div>
                        ) : (
                          <div className="text-xs text-white/40">
                            Select a hospital card to preview turn-by-turn route
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isRoutingLoading && (
                        <span className="text-xs font-semibold text-red-400 animate-pulse">
                          Routing...
                        </span>
                      )}
                      <button
                        onClick={() => setView("map")}
                        className="px-3 py-1.5 bg-white/5 hover:bg-white/15 border border-white/10 rounded-xl text-xs font-bold text-white/80 transition-colors cursor-pointer"
                      >
                        Expand Map
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 relative bg-black">
                    <Map
                      userLocation={userLocation}
                      hospitals={displayedHospitals}
                      ambulances={ambulances}
                      selectedHospital={selectedHospital}
                      routePath={routePath}
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="bg-black/80 border-t border-white/10 py-8 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-red-600 rounded-lg flex items-center justify-center text-white">
              <Activity size={15} />
            </div>
            <span className="text-sm font-bold tracking-tight text-white">
              MedCoord<span className="text-red-600">X</span>
            </span>
          </div>
          <div className="text-xs text-white/40">
            &copy; 2026 MedCoordX • Real-Time Emergency Hospital Resource Routing
          </div>
        </div>
      </footer>
    </div>
  );
}
