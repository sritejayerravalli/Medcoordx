import React, { useState, useEffect, useCallback, useRef } from "react";
import { GoogleGenAI, Type } from "@google/genai";
import { 
  Activity, 
  Ambulance, 
  Hospital as HospitalIcon, 
  MapPin, 
  Navigation, 
  Phone, 
  Search, 
  Stethoscope, 
  AlertCircle, 
  Clock, 
  CheckCircle2, 
  ChevronRight, 
  ArrowRight, 
  HeartPulse, 
  Bed, 
  ShieldAlert,
  ShieldCheck,
  Shield,
  BarChart3,
  Menu,
  X,
  LayoutDashboard,
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
  User
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import Map from "./components/Map";
import { Hospital, TriageResult, UserLocation, Ambulance as AmbulanceType } from "./types";
import { MOCK_HOSPITALS, MOCK_AMBULANCES, PREDEFINED_SYMPTOMS } from "./constants";
import { calculateDistance, cn } from "./lib/utils";

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

type ViewState = "home" | "patient" | "ambulance" | "hospital" | "map";

interface RoutingInfo {
  distance: number; // in meters
  duration: number; // in seconds
  steps: any[]; // navigation steps
}

export default function App() {
  const [view, setView] = useState<ViewState>("home");
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [ambulances, setAmbulances] = useState<AmbulanceType[]>(MOCK_AMBULANCES);
  const [wsStatus, setWsStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
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
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [detailedHospitalId, setDetailedHospitalId] = useState<string | null>(null);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string | null>(null);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>(new Date().toLocaleTimeString());

  // Real-time Availability Simulation (HIS Sync)
  useEffect(() => {
    const interval = setInterval(() => {
      setLastSyncTime(new Date().toLocaleTimeString());
      // Update patient-side hospitals
      setMatchedHospitals(prev => prev.map(h => {
        if (!h.doctors) return h;
        return {
          ...h,
          doctors: h.doctors.map(d => {
            const shouldToggle = Math.random() < 0.15;
            if (!shouldToggle) return d;
            const newAvailable = !d.isAvailable;
            return {
              ...d,
              isAvailable: newAvailable,
              nextAvailableSlot: newAvailable ? "Now" : (Math.random() > 0.5 ? "45m" : "1.5h")
            };
          })
        };
      }));

      // Update admin-side resources
      setHospitalResources(prev => ({
        ...prev,
        beds: Math.max(0, prev.beds + (Math.random() > 0.7 ? (Math.random() > 0.5 ? 1 : -1) : 0)),
        icuBeds: Math.max(0, prev.icuBeds + (Math.random() > 0.9 ? (Math.random() > 0.5 ? 1 : -1) : 0)),
        doctors: prev.doctors.map(d => {
          const shouldToggle = Math.random() < 0.1;
          if (!shouldToggle) return d;
          return { ...d, isAvailable: !d.isAvailable };
        })
      }));
    }, 8000);

    return () => clearInterval(interval);
  }, []);

  // Vitals State (Manual Input)
  const [vitals, setVitals] = useState({
    hr: "78",
    spo2: "98",
    bp: "120/80",
    temp: "36.6"
  });

  // Transmitted Vitals (for Hospital Admin)
  const [transmittedVitals, setTransmittedVitals] = useState<typeof vitals | null>(null);
  const [transmittedTriage, setTransmittedTriage] = useState<TriageResult | null>(null);
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [patientStatus, setPatientStatus] = useState<"none" | "pending" | "accepted" | "rejected">("none");

  // Hospital Resources State
  const [hospitalResources, setHospitalResources] = useState({
    beds: 14,
    icuBeds: 3,
    doctors: [
      { id: 'admin-d1', name: "Dr. Smith", specialty: "Cardiology", isAvailable: true },
      { id: 'admin-d2', name: "Dr. Jones", specialty: "Trauma Surgery", isAvailable: true }
    ],
    equipment: ["Ventilator x2", "Defibrillator x1"],
    avgAmbulanceResponseTime: 6,
    serviceQuality: 98,
    coordinationScore: 96,
    facilityScore: 99,
    availabilityScore: 95,
    reviews: [
      { id: 'r1', author: "John Doe", rating: 5, comment: "Exceptional care and fast response.", date: "2024-03-24" },
      { id: 'r2', author: "Jane Smith", rating: 4, comment: "Professional staff, very efficient.", date: "2024-03-23" }
    ]
  });

  const handleTransmitVitals = () => {
    if (isTransmitting) return;
    
    if (!selectedHospital) {
      setError("Please select a target hospital from the list below first.");
      return;
    }
    
    setIsTransmitting(true);
    setPatientStatus("pending");
    setError(null);

    setTimeout(() => {
      setTransmittedVitals(vitals);
      // If no triage result, provide a default one for context
      setTransmittedTriage(triageResult || {
        condition: "Emergency Assessment",
        severity: "Moderate",
        recommendedSpecialties: ["Emergency Medicine"]
      });
      setIsTransmitting(false);
      
      // Automated acceptance logic
      setPatientStatus("accepted");
      updateResource('beds', hospitalResources.beds - 1);
      
      // Provide feedback that it worked
      const successMsg = document.createElement('div');
      successMsg.className = "fixed bottom-8 left-1/2 -translate-x-1/2 bg-green-500 text-white px-6 py-3 rounded-full font-black uppercase tracking-widest shadow-2xl z-[100] animate-bounce";
      successMsg.innerText = "Vitals Transmitted Successfully";
      document.body.appendChild(successMsg);
      setTimeout(() => successMsg.remove(), 3000);
    }, 1500);
  };

  useEffect(() => {
    if (transmittedTriage?.severity === "Critical") {
      const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3");
      audio.play().catch(e => console.error("Audio play failed:", e));
    }
  }, [transmittedTriage]);

  const updateResource = (key: 'beds' | 'icuBeds' | 'avgAmbulanceResponseTime' | 'serviceQuality' | 'coordinationScore' | 'facilityScore' | 'availabilityScore', value: number) => {
    setHospitalResources(prev => ({ ...prev, [key]: Math.max(0, value) }));
  };

  // Get user location
  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (err) => {
          console.error("Geolocation error:", err);
          setError("Could not get your location. Using default location.");
          setUserLocation({ lat: 40.7128, lng: -74.0060 });
        }
      );
    } else {
      setError("Geolocation is not supported by your browser.");
      setUserLocation({ lat: 40.7128, lng: -74.0060 });
    }
  }, []);

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}`;
    let ws: WebSocket;
    let reconnectTimeout: NodeJS.Timeout;

    const connect = () => {
      setWsStatus("connecting");
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setWsStatus("connected");
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === "AMBULANCE_UPDATE") {
            const updates = message.data;
            setAmbulances(prev => prev.map(amb => {
              const update = updates.find((u: any) => u.id === amb.id);
              return update ? { ...amb, lat: update.lat, lng: update.lng } : amb;
            }));
          }
        } catch (err) {
          console.error("Failed to parse WebSocket message:", err);
        }
      };

      ws.onclose = () => {
        setWsStatus("disconnected");
        reconnectTimeout = setTimeout(connect, 3000);
      };

      ws.onerror = (err) => {
        console.error("WebSocket error:", err);
        ws.close();
      };
    };

    connect();

    return () => {
      ws.close();
      clearTimeout(reconnectTimeout);
    };
  }, []);

  const handleTriage = async () => {
    const combinedSymptoms = [symptoms, ...selectedTags].filter(Boolean).join(", ");
    if (!combinedSymptoms.trim()) return;
    
    setIsTriageLoading(true);
    setError(null);
    setPatientStatus("none");
    setTransmittedVitals(null);
    setTransmittedTriage(null);
    
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analyze these symptoms and provide a triage result: "${combinedSymptoms}". 
        
        Return your analysis ONLY as a JSON object with the following structure:
        {
          "condition": "Likely medical condition",
          "severity": "Low" | "Moderate" | "High" | "Critical",
          "recommendedSpecialties": ["Specialty 1", "Specialty 2"]
        }
        
        Also, find real hospitals nearby that can handle these symptoms.`,
        config: {
          tools: [{ googleMaps: {} }],
          toolConfig: {
            retrievalConfig: {
              latLng: userLocation ? {
                latitude: userLocation.lat,
                longitude: userLocation.lng
              } : undefined
            }
          }
        },
      });

      // Manually parse JSON from text response as googleMaps doesn't support responseMimeType
      const text = response.text || "";
      let result: TriageResult = {
        condition: "Analysis complete",
        severity: "Moderate",
        recommendedSpecialties: ["General Medicine"]
      };

      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          result = {
            condition: parsed.condition || result.condition,
            severity: parsed.severity || result.severity,
            recommendedSpecialties: parsed.recommendedSpecialties || result.recommendedSpecialties
          };
        }
      } catch (parseErr) {
        console.error("Failed to parse triage JSON:", parseErr);
      }
      
      setTriageResult(result);

      // Extract real hospitals from grounding metadata if available
      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (groundingChunks && groundingChunks.length > 0) {
        const realHospitals: Hospital[] = groundingChunks
          .filter(chunk => chunk.maps?.uri)
          .map((chunk, index) => {
            const avgAmbulanceResponseTime = 5 + Math.floor(Math.random() * 10);
            const serviceQuality = 80 + Math.floor(Math.random() * 20);
            const coordinationScore = 75 + Math.floor(Math.random() * 25);
            const facilityScore = 85 + Math.floor(Math.random() * 15);
            const availabilityScore = 70 + Math.floor(Math.random() * 30);
            
            const avgScore = (serviceQuality + coordinationScore + facilityScore + availabilityScore) / 4;
            let grade: "A+" | "A" | "B" | "C" = "B";
            if (avgScore > 92 && avgAmbulanceResponseTime < 8) grade = "A+";
            else if (avgScore > 85 && avgAmbulanceResponseTime < 12) grade = "A";
            else if (avgScore < 70) grade = "C";

            return {
              id: `real-${index}`,
              name: chunk.maps?.title || "Nearby Hospital",
              lat: 0, // We'll need to figure out how to get lat/lng if not provided directly
              lng: 0,
              beds: Math.floor(Math.random() * 50) + 10, // Mocking availability for real hospitals
              icuBeds: Math.floor(Math.random() * 10) + 2,
              specialties: result.recommendedSpecialties,
              mapsUrl: chunk.maps?.uri,
              rating: 4.0 + Math.random(),
              grade,
              facilities: ["Emergency Care", "Diagnostic Imaging"],
              avgAmbulanceResponseTime,
              serviceQuality,
              coordinationScore,
              facilityScore,
              availabilityScore,
              specialists: ["On-call Trauma Team", "Emergency Specialists"],
              doctors: [
                { 
                  id: `d-real-${index}-1`, name: "Dr. Aditi Sharma", specialty: "Emergency Medicine", isAvailable: true, nextAvailableSlot: "Now",
                  slots: [{ time: "10:30", available: true }, { time: "11:00", available: true }]
                },
                { 
                  id: `d-real-${index}-2`, name: "Dr. Rajesh Kumar", specialty: "Trauma Surgery", isAvailable: false, nextAvailableSlot: "2h 15m",
                  slots: [{ time: "14:00", available: false }]
                }
              ],
              equipment: ["Advanced Life Support", "Diagnostic Imaging"],
              reviews: [
                { id: `r-${index}-1`, author: "Verified Patient", rating: 4 + Math.random(), comment: "Quick emergency response and professional staff.", date: "2024-03-22" }
              ]
            };
          });
        
        if (realHospitals.length > 0) {
          setMatchedHospitals(realHospitals);
        } else if (userLocation) {
          // Fallback to mock hospitals if no real ones found
          const sortedHospitals = MOCK_HOSPITALS.map(h => ({
            ...h,
            distance: calculateDistance(userLocation.lat, userLocation.lng, h.lat, h.lng)
          })).sort((a, b) => (a.distance || 0) - (b.distance || 0));
          setMatchedHospitals(sortedHospitals);
        }
      } else if (userLocation) {
        const sortedHospitals = MOCK_HOSPITALS.map(h => ({
          ...h,
          distance: calculateDistance(userLocation.lat, userLocation.lng, h.lat, h.lng)
        })).sort((a, b) => (a.distance || 0) - (b.distance || 0));
        setMatchedHospitals(sortedHospitals);
      }
    } catch (err) {
      console.error("Triage error:", err);
      setError("Failed to analyze symptoms.");
    } finally {
      setIsTriageLoading(false);
    }
  };

  // Routing Logic
  const getRouting = useCallback(async (hospital: Hospital) => {
    setSelectedHospital(hospital);
    
    if (!userLocation) return;
    
    // Guard against hospitals without valid coordinates (e.g., real hospitals from grounding)
    if (hospital.lat === 0 && hospital.lng === 0) {
      setSelectedHospital(hospital);
      setRoutePath(null);
      setRoutingInfo(null);
      if (hospital.mapsUrl) {
        window.open(hospital.mapsUrl, "_blank");
      }
      return;
    }

    setIsRoutingLoading(true);
    setSelectedHospital(hospital);
    try {
      const response = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${userLocation.lng},${userLocation.lat};${hospital.lng},${hospital.lat}?overview=full&geometries=geojson&steps=true`
      );
      const data = await response.json();
      if (data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const coordinates = route.geometry.coordinates.map((coord: [number, number]) => [coord[1], coord[0]]);
        setRoutePath(coordinates);
        setRoutingInfo({
          distance: route.distance,
          duration: route.duration,
          steps: route.legs[0].steps
        });
        
        // Seamless transition: Auto-enable navigation and switch to map view
        setIsNavigating(true);
        setView("map");
      }
    } catch (err) {
      console.error("Routing error:", err);
      setError("Failed to calculate route.");
    } finally {
      setIsRoutingLoading(false);
    }
  }, [userLocation]);

  const navItems = [
    { id: "home", label: "Home", icon: Activity },
    { id: "patient", label: "Patient", icon: Stethoscope },
    { id: "ambulance", label: "Ambulance", icon: Ambulance },
    { id: "hospital", label: "Hospital", icon: HospitalIcon },
    { id: "map", label: "Live Map", icon: MapIcon },
  ];

  return (
    <div className="min-h-screen bg-black flex flex-col font-sans text-white selection:bg-red-600/30">
      {/* Navigation */}
      <header className="bg-black/80 backdrop-blur-xl border-b border-white/5 sticky top-0 z-[100]">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4 cursor-pointer group" onClick={() => setView("home")}>
            <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center text-white shadow-2xl shadow-red-600/40 group-hover:scale-110 transition-transform">
              <Activity size={24} />
            </div>
            <span className="text-2xl font-black tracking-tighter">MedCoord<span className="text-red-600">X</span></span>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-10">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setView(item.id as ViewState)}
                className={cn(
                  "text-[10px] font-black uppercase tracking-[0.2em] transition-all relative py-2",
                  view === item.id ? "text-red-600" : "text-white/30 hover:text-white"
                )}
              >
                {item.label}
                {view === item.id && (
                  <motion.div layoutId="nav-underline" className="absolute -bottom-1 left-0 right-0 h-0.5 bg-red-600 rounded-full" />
                )}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-6">
            <div className="hidden sm:flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-white/40 bg-white/5 px-4 py-2 rounded-full border border-white/10">
              <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
              {userLocation ? `${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)}` : "Locating..."}
            </div>
            <button className="lg:hidden p-2 text-white/60 hover:text-white transition-colors" onClick={() => setIsMenuOpen(!isMenuOpen)}>
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
            className="lg:hidden fixed inset-0 top-20 bg-[#050505] z-[90] p-6 flex flex-col gap-4"
          >
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => { setView(item.id as ViewState); setIsMenuOpen(false); }}
                className={cn(
                  "flex items-center gap-4 p-4 rounded-2xl text-lg font-bold",
                  view === item.id ? "bg-red-600 text-white" : "text-white/60"
                )}
              >
                <item.icon size={24} />
                {item.label}
              </button>
            ))}
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
              <div className="bg-red-600 text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between gap-4 border border-red-500/50 backdrop-blur-xl">
                <div className="flex items-center gap-3">
                  <AlertCircle size={20} />
                  <p className="text-xs font-black uppercase tracking-widest leading-tight">{error}</p>
                </div>
                <button onClick={() => setError(null)} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
                  <X size={16} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {view === "home" && (
            <motion.div
              key="home"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="max-w-7xl mx-auto px-4 py-20"
            >
              <div className="text-center max-w-3xl mx-auto mb-20">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-500/10 border border-green-500/20 rounded-full mb-8">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-green-500">System Online – Real-Time Monitoring Active</span>
                </div>
                <motion.h1 
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  className="text-7xl md:text-9xl font-black tracking-tighter text-white mb-6 leading-[0.85]"
                >
                  MedCoord<span className="text-red-600">X</span>
                </motion.h1>
                <p className="text-xl md:text-2xl font-medium text-white/60 mb-12 tracking-tight">
                  Real-Time Hospital Resource Routing System
                </p>
                
                {/* System Metrics */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-20">
                  {[
                    { label: "Hospitals Connected", value: "24" },
                    { label: "Response Time", value: "< 2s" },
                    { label: "AI Accuracy", value: "98.4%" },
                    { label: "System Uptime", value: "99.9%" }
                  ].map((stat, i) => (
                    <div key={i} className="p-6 bg-white/[0.02] border border-white/5 rounded-3xl">
                      <div className="text-2xl font-black text-white mb-1">{stat.value}</div>
                      <div className="text-[10px] font-black uppercase tracking-widest text-white/30">{stat.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {[
                  {
                    id: "patient",
                    title: "Patient Portal",
                    desc: "Enter symptoms for AI-powered triage analysis and get matched with the nearest suitable hospital.",
                    icon: Stethoscope,
                    color: "bg-white/5",
                    borderColor: "border-white/10"
                  },
                  {
                    id: "ambulance",
                    title: "Ambulance Dashboard",
                    desc: "Transmit patient vitals in real-time and get optimized GPS routing to target hospitals.",
                    icon: Ambulance,
                    color: "bg-red-600",
                    borderColor: "border-red-500"
                  },
                  {
                    id: "hospital",
                    title: "Hospital Admin",
                    desc: "Manage bed availability, specialist schedules, and equipment — all updated in real-time.",
                    icon: HospitalIcon,
                    color: "bg-white/5",
                    borderColor: "border-white/10"
                  }
                ].map((card, i) => (
                  <motion.div
                    key={card.id}
                    initial={{ y: 40, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: i * 0.1 }}
                    onClick={() => setView(card.id as ViewState)}
                    className={cn(
                      "group cursor-pointer p-10 rounded-[3rem] border transition-all hover:-translate-y-2",
                      card.color, card.borderColor
                    )}
                  >
                    <div className="w-16 h-16 rounded-3xl bg-white/10 flex items-center justify-center text-white mb-8 transition-transform group-hover:scale-110">
                      <card.icon size={32} />
                    </div>
                    <h3 className="text-3xl font-black text-white mb-4 tracking-tight">{card.title}</h3>
                    <p className="text-white/50 font-medium leading-relaxed mb-8">{card.desc}</p>
                    <div className="flex items-center gap-2 text-white font-black uppercase tracking-widest text-xs">
                      Enter Portal <ArrowRight size={16} className="text-red-600" />
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

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
                hospitals={MOCK_HOSPITALS}
                ambulances={ambulances}
                selectedHospital={selectedHospital}
                routePath={routePath}
              />
              {/* Overlay Info */}
              <div className="absolute top-6 left-6 z-[100] flex flex-col gap-4">
                <div className="bg-black/80 backdrop-blur-xl border border-white/10 p-6 rounded-3xl shadow-2xl max-w-xs">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center">
                      <Navigation size={18} />
                    </div>
                    <h3 className="font-black tracking-tight">System Status</h3>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-white/40">
                      <span>Network</span>
                      <span className="text-green-500">Online</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-white/40">
                      <span>Tracking</span>
                      <span className={cn(
                        wsStatus === "connected" ? "text-green-500" :
                        wsStatus === "connecting" ? "text-yellow-500 animate-pulse" :
                        "text-red-500"
                      )}>
                        {wsStatus === "connected" ? "Live" : wsStatus}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-white/40">
                      <span>Satellites</span>
                      <span>12 Active</span>
                    </div>
                  </div>
                </div>

                {routingInfo && (
                  <motion.div 
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    className="bg-red-600 p-6 rounded-3xl shadow-2xl shadow-red-900/40 w-80"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-widest opacity-70 mb-1">Active Guidance</div>
                        <div className="text-xl font-black mb-1 truncate max-w-[180px]">{selectedHospital?.name}</div>
                        <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest">
                          <span>{(routingInfo.distance / 1000).toFixed(1)} KM</span>
                          <span>•</span>
                          <span className="text-white/80">{Math.round(routingInfo.duration / 60)} MIN</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => setView("home")}
                          className="p-2 bg-white/10 rounded-xl hover:bg-white/20 transition-all"
                          title="Exit Navigation"
                        >
                          <X size={16} />
                        </button>
                        <button 
                          onClick={() => setIsNavigating(!isNavigating)}
                          className="p-3 bg-white/20 rounded-2xl hover:bg-white/30 transition-all"
                        >
                          <Navigation size={20} className={cn(isNavigating && "rotate-45")} />
                        </button>
                      </div>
                    </div>

                    {isNavigating && (
                      <div className="mt-4 pt-4 border-t border-white/20 space-y-3 max-h-80 overflow-y-auto custom-scrollbar">
                        <div className="flex items-center gap-2 mb-4 px-2 py-1.5 bg-white/10 rounded-lg">
                          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                          <span className="text-[9px] font-black uppercase tracking-widest">Real-Time GPS Active</span>
                        </div>
                        {routingInfo.steps.map((step, i) => (
                          <div key={i} className="flex items-start gap-3 group">
                            <div className="w-6 h-6 bg-white/10 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 group-hover:bg-white/20 transition-colors">
                              {i + 1}
                            </div>
                            <div>
                              <div className="text-xs font-bold leading-tight">{step.maneuver.instruction}</div>
                              <div className="text-[8px] font-black uppercase tracking-widest opacity-60 mt-1">
                                {Math.round(step.distance)}m • {Math.round(step.duration)}s
                              </div>
                            </div>
                          </div>
                        ))}
                        <div className="pt-4 flex flex-col gap-2">
                          <button 
                            onClick={() => {
                              if (selectedHospital?.mapsUrl) {
                                window.open(selectedHospital.mapsUrl, "_blank");
                              } else if (selectedHospital) {
                                window.open(`https://www.google.com/maps/dir/?api=1&destination=${selectedHospital.lat},${selectedHospital.lng}`, "_blank");
                              }
                            }}
                            className="w-full py-3 bg-white text-red-600 font-black uppercase tracking-widest text-[10px] rounded-xl hover:bg-white/90 transition-all flex items-center justify-center gap-2"
                          >
                            <MapPin size={12} /> Open in Google Maps
                          </button>
                          <button 
                            onClick={() => {
                              setRoutePath(null);
                              setRoutingInfo(null);
                              setIsNavigating(false);
                            }}
                            className="w-full py-2 bg-white/10 text-white font-black uppercase tracking-widest text-[8px] rounded-xl hover:bg-white/20 transition-all"
                          >
                            Cancel Route
                          </button>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {(view === "patient" || view === "ambulance" || view === "hospital") && (
            <motion.div
              key="portal"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="max-w-7xl mx-auto px-6 py-12 grid grid-cols-1 lg:grid-cols-12 gap-10"
            >
              {/* Left Panel */}
              <div className="lg:col-span-5 flex flex-col gap-8">
                {view === "patient" && (
                  <div className="space-y-8">
                    <div className="bg-[#0a0a0a] border border-white/5 p-8 rounded-[2.5rem] shadow-2xl">
                      <div className="flex items-center gap-4 mb-2">
                        <div className="w-10 h-10 bg-red-600/10 rounded-xl flex items-center justify-center text-red-600">
                          <Stethoscope size={24} />
                        </div>
                        <h2 className="text-3xl font-black tracking-tighter">Patient Portal</h2>
                      </div>
                      <p className="text-sm font-medium text-white/40 mb-8 tracking-tight">
                        AI-powered symptom analysis & hospital recommendation
                      </p>

                      <div className="space-y-6">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-2">Describe your symptoms</label>
                          <textarea
                            value={symptoms}
                            onChange={(e) => setSymptoms(e.target.value)}
                            placeholder="e.g., chest pain, sweating, shortness of breath..."
                            className="w-full h-32 bg-white/5 border border-white/10 rounded-2xl p-4 text-white placeholder:text-white/10 focus:ring-2 focus:ring-red-600 outline-none transition-all"
                          />
                        </div>

                        <div className="space-y-3">
                          <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-2">Predefined Symptom Selector</label>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {PREDEFINED_SYMPTOMS.map((tag) => (
                              <button
                                key={tag}
                                onClick={() => toggleTag(tag)}
                                className={cn(
                                  "px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all",
                                  selectedTags.includes(tag)
                                    ? "bg-red-600 border-red-600 text-white"
                                    : "bg-white/5 border-white/10 text-white/40 hover:border-white/20"
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
                          className="w-full py-5 bg-red-600 hover:bg-red-700 disabled:bg-white/5 text-white font-black uppercase tracking-[0.2em] rounded-2xl transition-all flex items-center justify-center gap-3 shadow-xl shadow-red-600/20"
                        >
                          {isTriageLoading ? (
                            <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                          ) : (
                            <>Analyze Symptoms <ArrowRight size={20} /></>
                          )}
                        </button>
                      </div>
                    </div>

                    <AnimatePresence>
                      {triageResult && (
                        <motion.div
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="bg-[#0a0a0a] border border-white/5 p-8 rounded-[2.5rem] shadow-2xl"
                        >
                          <div className="flex items-center justify-between mb-8">
                            <h3 className="text-xl font-black tracking-tighter">Analysis Results</h3>
                            <div className={cn(
                              "px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest",
                              triageResult.severity === "Critical" ? "bg-red-600 text-white" :
                              triageResult.severity === "High" ? "bg-orange-600 text-white" :
                              "bg-green-600 text-white"
                            )}>
                              {triageResult.severity} Severity
                            </div>
                          </div>
                          
                          <div className="space-y-6">
                            <div>
                              <div className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-1">Likely Condition</div>
                              <div className="text-2xl font-black tracking-tight">{triageResult.condition}</div>
                            </div>
                            
                            <div>
                              <div className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-2">Recommended Specialties</div>
                              <div className="flex flex-wrap gap-2">
                                {triageResult.recommendedSpecialties.map((s, i) => (
                                  <span key={i} className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[10px] font-black uppercase tracking-widest">
                                    {s}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {view === "ambulance" && (
                  <div className="space-y-6">
                    <div className="bg-red-600 p-8 rounded-[2.5rem] shadow-2xl shadow-red-900/40">
                      <div className="flex items-center gap-4 mb-8">
                        <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                          <Ambulance size={28} />
                        </div>
                        <div>
                          <h2 className="text-3xl font-black tracking-tighter">Unit ALS-402</h2>
                          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest opacity-70">
                            <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                            Active Dispatch
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-5 bg-white/10 rounded-3xl border border-white/10 backdrop-blur-sm">
                          <div className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-1">Destination</div>
                          <div className="text-lg font-black truncate">{selectedHospital?.name || "Unassigned"}</div>
                          {selectedHospital && (
                            <button 
                              onClick={() => {
                                setIsNavigating(true);
                                setView("map");
                              }}
                              className="mt-2 text-[10px] font-black uppercase tracking-widest text-white bg-white/20 px-3 py-1 rounded-full hover:bg-white/30 transition-all flex items-center gap-2"
                            >
                              Route <Navigation size={10} />
                            </button>
                          )}
                        </div>
                        <div className="p-5 bg-white/10 rounded-3xl border border-white/10 backdrop-blur-sm">
                          <div className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-1">Status</div>
                          <div className={cn(
                            "text-lg font-black uppercase tracking-tighter",
                            patientStatus === "accepted" ? "text-green-400" : 
                            patientStatus === "rejected" ? "text-red-400" : 
                            patientStatus === "pending" ? "text-yellow-400 animate-pulse" : "text-white/40"
                          )}>
                            {patientStatus === "none" ? "Idle" : patientStatus}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Vitals Input */}
                    <div className="bg-[#0a0a0a] border border-white/5 p-8 rounded-[2.5rem] shadow-2xl">
                      <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-red-600/10 rounded-xl flex items-center justify-center text-red-600">
                            <HeartPulse size={24} />
                          </div>
                          <h2 className="text-2xl font-black tracking-tighter">Patient Vitals</h2>
                        </div>
                        <div className="px-3 py-1 bg-green-500/10 border border-green-500/20 rounded-full flex items-center gap-2">
                          <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                          <span className="text-[10px] font-black uppercase tracking-widest text-green-500">Live</span>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-6 mb-8">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-2">Pulse Rate (BPM)</label>
                          <div className="relative">
                            <Zap size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-red-500" />
                            <input 
                              type="text" 
                              value={vitals.hr} 
                              onChange={(e) => setVitals({...vitals, hr: e.target.value})}
                              className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-xl font-black focus:ring-2 focus:ring-red-600 outline-none"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-2">SpO2 (%)</label>
                          <div className="relative">
                            <Droplets size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-500" />
                            <input 
                              type="text" 
                              value={vitals.spo2} 
                              onChange={(e) => setVitals({...vitals, spo2: e.target.value})}
                              className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-xl font-black focus:ring-2 focus:ring-red-600 outline-none"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-2">Blood Pressure</label>
                          <div className="relative">
                            <Wind size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-green-500" />
                            <input 
                              type="text" 
                              value={vitals.bp} 
                              onChange={(e) => setVitals({...vitals, bp: e.target.value})}
                              className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-xl font-black focus:ring-2 focus:ring-red-600 outline-none"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-2">Temperature (°C)</label>
                          <div className="relative">
                            <Thermometer size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-orange-500" />
                            <input 
                              type="text" 
                              value={vitals.temp} 
                              onChange={(e) => setVitals({...vitals, temp: e.target.value})}
                              className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-xl font-black focus:ring-2 focus:ring-red-600 outline-none"
                            />
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={handleTransmitVitals}
                        className={cn(
                          "w-full py-5 text-white font-black uppercase tracking-[0.2em] rounded-2xl transition-all flex items-center justify-center gap-3 shadow-xl",
                          isTransmitting ? "bg-white/5 cursor-not-allowed" : "bg-red-600 hover:bg-red-700 shadow-red-600/20"
                        )}
                      >
                        {isTransmitting ? (
                          <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <>Transmit Vitals to Hospital <ArrowRight size={20} /></>
                        )}
                      </button>
                      {!selectedHospital && (
                        <p className="text-[10px] font-black uppercase tracking-widest text-red-500 text-center mt-4">
                          * Select a target hospital from the list to enable transmission
                        </p>
                      )}

                      {patientStatus === "accepted" && selectedHospital && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="mt-6 p-6 bg-green-500/10 border border-green-500/20 rounded-3xl"
                        >
                          <div className="flex items-center gap-3 mb-3">
                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-green-500">Routing Active</span>
                          </div>
                          <div className="text-xl font-black tracking-tighter text-white mb-1">
                            {selectedHospital.name}
                          </div>
                          <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                            Direct Route Established • Automatically Accepted
                          </div>
                        </motion.div>
                      )}
                    </div>

                    {/* Ambulance Performance Grading */}
                    <div className="bg-[#0a0a0a] border border-white/5 p-8 rounded-[2.5rem] shadow-2xl">
                      <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-blue-600/10 rounded-xl flex items-center justify-center text-blue-600">
                            <Activity size={24} />
                          </div>
                          <h2 className="text-2xl font-black tracking-tighter">Fleet Accountability</h2>
                        </div>
                        <div className="text-[8px] font-black uppercase tracking-widest text-white/20">Real-Time Performance Tracking</div>
                      </div>
                      
                      <div className="space-y-4">
                        {MOCK_AMBULANCES.map((amb) => (
                          <div key={amb.id} className="p-6 bg-white/[0.02] border border-white/5 rounded-3xl hover:border-blue-500/30 transition-all group/amb">
                            <div className="flex items-center justify-between mb-6">
                              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center text-white/40 group-hover/amb:bg-blue-600 group-hover/amb:text-white transition-colors">
                                  <Ambulance size={20} />
                                </div>
                                <div>
                                  <div className="text-sm font-black text-white mb-1">{amb.number}</div>
                                  <div className="flex items-center gap-2">
                                    <div className={cn(
                                      "w-1.5 h-1.5 rounded-full animate-pulse",
                                      amb.status === "available" ? "bg-green-500" : "bg-yellow-500"
                                    )} />
                                    <span className="text-[8px] font-black uppercase tracking-widest text-white/30">{amb.status}</span>
                                  </div>
                                </div>
                              </div>
                              <div className={cn(
                                "w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-black border shadow-lg",
                                amb.grade === "A+" ? "bg-green-500/10 border-green-500/20 text-green-500 shadow-green-500/10" :
                                amb.grade === "A" ? "bg-blue-500/10 border-blue-500/20 text-blue-500 shadow-blue-500/10" :
                                "bg-yellow-500/10 border-yellow-500/20 text-yellow-500 shadow-yellow-500/10"
                              )}>
                                {amb.grade}
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <div className="flex items-center justify-between text-[8px] font-black uppercase tracking-widest text-white/20">
                                  <span>Response Time</span>
                                  <span className="text-white">{amb.responseTime}m</span>
                                </div>
                                <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                                  <motion.div 
                                    initial={{ width: 0 }}
                                    animate={{ width: `${Math.max(0, 100 - (amb.responseTime * 4))}%` }}
                                    className={cn("h-full", amb.responseTime < 10 ? "bg-green-500" : "bg-blue-500")}
                                  />
                                </div>
                              </div>
                              <div className="space-y-2">
                                <div className="flex items-center justify-between text-[8px] font-black uppercase tracking-widest text-white/20">
                                  <span>Transport Eff.</span>
                                  <span className="text-white">{amb.efficiency}%</span>
                                </div>
                                <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                                  <motion.div 
                                    initial={{ width: 0 }}
                                    animate={{ width: `${amb.efficiency}%` }}
                                    className={cn("h-full", amb.efficiency > 90 ? "bg-green-500" : "bg-blue-500")}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="mt-8 p-6 bg-blue-600/5 border border-blue-600/10 rounded-3xl">
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-blue-500 mb-2">Grading Logic</h4>
                        <p className="text-[9px] font-bold text-white/30 leading-relaxed uppercase tracking-widest">
                          A+ Units maintain sub-10m response times and {">"}90% transport efficiency. Performance is tracked via GPS and patient handoff logs.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {view === "hospital" && (
                  <div className="space-y-6">
                    <div className="bg-[#0a0a0a] border border-white/5 p-8 rounded-[2.5rem] shadow-2xl">
                      <div className="flex items-center gap-4 mb-8">
                        <div className="w-10 h-10 bg-red-600/10 rounded-xl flex items-center justify-center text-red-600">
                          <HospitalIcon size={24} />
                        </div>
                        <h2 className="text-2xl font-black tracking-tighter">Facility Management</h2>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 mb-8">
                        <div className="p-6 bg-white/[0.02] rounded-[2rem] border border-white/5 flex flex-col items-center">
                          <div className="text-4xl font-black tracking-tighter mb-2">{hospitalResources.beds}</div>
                          <div className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-4">Emergency Beds</div>
                          <div className="flex items-center gap-2">
                            <button onClick={() => updateResource('beds', hospitalResources.beds - 1)} className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center">-</button>
                            <button onClick={() => updateResource('beds', hospitalResources.beds + 1)} className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center">+</button>
                          </div>
                        </div>
                        <div className="p-6 bg-white/[0.02] rounded-[2rem] border border-white/5 flex flex-col items-center">
                          <div className="text-4xl font-black tracking-tighter mb-2">{hospitalResources.icuBeds}</div>
                          <div className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-4">ICU Capacity</div>
                          <div className="flex items-center gap-2">
                            <button onClick={() => updateResource('icuBeds', hospitalResources.icuBeds - 1)} className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center">-</button>
                            <button onClick={() => updateResource('icuBeds', hospitalResources.icuBeds + 1)} className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center">+</button>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="p-4 bg-white/[0.02] rounded-2xl border border-white/5">
                          <div className="flex items-center justify-between mb-4">
                            <div className="text-[10px] font-black uppercase tracking-widest text-white/30">Doctor Availability Sync</div>
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                              <span className="text-[8px] font-black text-blue-500 uppercase tracking-widest">HIS Connected</span>
                            </div>
                          </div>
                          <div className="space-y-3">
                            {hospitalResources.doctors.map((doc) => (
                              <div key={doc.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
                                    <User size={14} />
                                  </div>
                                  <div className="flex flex-col">
                                    <span className="text-[10px] font-bold">{doc.name}</span>
                                    <span className="text-[7px] text-white/30 uppercase tracking-widest">{doc.specialty}</span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className={cn(
                                    "text-[8px] font-black uppercase tracking-widest",
                                    doc.isAvailable ? "text-green-500" : "text-red-500"
                                  )}>
                                    {doc.isAvailable ? "In Clinic" : "Off Duty"}
                                  </span>
                                  <div className={cn(
                                    "w-8 h-4 rounded-full relative transition-colors duration-300",
                                    doc.isAvailable ? "bg-green-500/20" : "bg-red-500/20"
                                  )}>
                                    <motion.div 
                                      animate={{ x: doc.isAvailable ? 16 : 4 }}
                                      className={cn(
                                        "absolute top-1 w-2 h-2 rounded-full",
                                        doc.isAvailable ? "bg-green-500" : "bg-red-500"
                                      )} 
                                    />
                                  </div>
                                </div>
                              </div>
                            ))}
                            <button className="w-full py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[9px] font-black uppercase tracking-widest text-white/40 transition-all">
                              Manual Override / Add Specialist
                            </button>
                          </div>
                        </div>

                        <div className="p-4 bg-white/[0.02] rounded-2xl border border-white/5">
                          <div className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-2">Available Equipment</div>
                          <div className="flex flex-wrap gap-2">
                            {hospitalResources.equipment.map((e, i) => (
                              <span key={i} className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[10px] font-bold">{e}</span>
                            ))}
                            <button className="px-3 py-1 bg-red-600/20 border border-red-600/30 rounded-full text-[10px] font-bold text-red-500">+ Add</button>
                          </div>
                        </div>

                        {/* Performance Accountability */}
                        <div className="p-4 bg-red-600/5 rounded-2xl border border-red-600/10">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-[10px] font-black uppercase tracking-widest text-red-500/50">Performance Accountability</div>
                            <span className="text-[10px] font-black text-red-500">GRADE: A+</span>
                          </div>
                          <p className="text-[9px] text-red-500/40 font-bold uppercase tracking-wider leading-relaxed">
                            Your facility is currently ranked in the top 5%. Maintain response times under 8m to keep your A+ status.
                          </p>
                        </div>

                        {/* Performance Metrics Management */}
                        <div className="p-6 bg-white/[0.02] rounded-[2rem] border border-white/5">
                          <div className="flex items-center justify-between mb-6">
                            <div className="text-[10px] font-black uppercase tracking-widest text-white/30">Performance Metrics</div>
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                              <div className="flex flex-col items-end">
                                <span className="text-[8px] font-black text-green-500 uppercase tracking-widest">Live Updates</span>
                                <span className="text-[6px] font-bold text-white/20 uppercase tracking-widest">Last Synced: {lastSyncTime}</span>
                              </div>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                            <div className="flex flex-col items-center text-center">
                              <div className="w-10 h-10 rounded-xl bg-red-600/10 flex items-center justify-center text-red-600 mb-3">
                                <Clock size={20} />
                              </div>
                              <div className="text-xl font-black tracking-tighter text-white mb-1">{hospitalResources.avgAmbulanceResponseTime}m</div>
                              <div className="text-[8px] font-black uppercase tracking-widest text-white/30 mb-3">Response</div>
                              <div className="flex items-center gap-2">
                                <button onClick={() => updateResource('avgAmbulanceResponseTime', hospitalResources.avgAmbulanceResponseTime - 1)} className="w-6 h-6 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-xs">-</button>
                                <button onClick={() => updateResource('avgAmbulanceResponseTime', hospitalResources.avgAmbulanceResponseTime + 1)} className="w-6 h-6 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-xs">+</button>
                              </div>
                            </div>
                            
                            <div className="flex flex-col items-center text-center">
                              <div className="w-10 h-10 rounded-xl bg-green-600/10 flex items-center justify-center text-green-600 mb-3">
                                <ShieldCheck size={20} />
                              </div>
                              <div className="text-xl font-black tracking-tighter text-white mb-1">{hospitalResources.serviceQuality}%</div>
                              <div className="text-[8px] font-black uppercase tracking-widest text-white/30 mb-3">Quality</div>
                              <div className="flex items-center gap-2">
                                <button onClick={() => updateResource('serviceQuality', hospitalResources.serviceQuality - 1)} className="w-6 h-6 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-xs">-</button>
                                <button onClick={() => updateResource('serviceQuality', hospitalResources.serviceQuality + 1)} className="w-6 h-6 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-xs">+</button>
                              </div>
                            </div>
                            
                            <div className="flex flex-col items-center text-center">
                              <div className="w-10 h-10 rounded-xl bg-blue-600/10 flex items-center justify-center text-blue-600 mb-3">
                                <BarChart3 size={20} />
                              </div>
                              <div className="text-xl font-black tracking-tighter text-white mb-1">{hospitalResources.coordinationScore}%</div>
                              <div className="text-[8px] font-black uppercase tracking-widest text-white/30 mb-3">Coord</div>
                              <div className="flex items-center gap-2">
                                <button onClick={() => updateResource('coordinationScore', hospitalResources.coordinationScore - 1)} className="w-6 h-6 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-xs">-</button>
                                <button onClick={() => updateResource('coordinationScore', hospitalResources.coordinationScore + 1)} className="w-6 h-6 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-xs">+</button>
                              </div>
                            </div>

                            <div className="flex flex-col items-center text-center">
                              <div className="w-10 h-10 rounded-xl bg-orange-600/10 flex items-center justify-center text-orange-600 mb-3">
                                <Shield size={20} />
                              </div>
                              <div className="text-xl font-black tracking-tighter text-white mb-1">{hospitalResources.facilityScore}%</div>
                              <div className="text-[8px] font-black uppercase tracking-widest text-white/30 mb-3">Facility</div>
                              <div className="flex items-center gap-2">
                                <button onClick={() => updateResource('facilityScore', hospitalResources.facilityScore - 1)} className="w-6 h-6 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-xs">-</button>
                                <button onClick={() => updateResource('facilityScore', hospitalResources.facilityScore + 1)} className="w-6 h-6 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-xs">+</button>
                              </div>
                            </div>

                            <div className="flex flex-col items-center text-center">
                              <div className="w-10 h-10 rounded-xl bg-purple-600/10 flex items-center justify-center text-purple-600 mb-3">
                                <Activity size={20} />
                              </div>
                              <div className="text-xl font-black tracking-tighter text-white mb-1">{hospitalResources.availabilityScore}%</div>
                              <div className="text-[8px] font-black uppercase tracking-widest text-white/30 mb-3">Avail</div>
                              <div className="flex items-center gap-2">
                                <button onClick={() => updateResource('availabilityScore', hospitalResources.availabilityScore - 1)} className="w-6 h-6 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-xs">-</button>
                                <button onClick={() => updateResource('availabilityScore', hospitalResources.availabilityScore + 1)} className="w-6 h-6 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-xs">+</button>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Recent Reviews Section */}
                        <div className="p-4 bg-white/[0.02] rounded-2xl border border-white/5">
                          <div className="flex items-center justify-between mb-4">
                            <div className="text-[10px] font-black uppercase tracking-widest text-white/30">Recent Patient Feedback</div>
                            <div className="flex items-center gap-1">
                              <Star size={10} className="text-yellow-500 fill-yellow-500" />
                              <span className="text-[10px] font-black">4.8</span>
                            </div>
                          </div>
                          <div className="space-y-3">
                            {hospitalResources.reviews.map((review) => (
                              <div key={review.id} className="p-3 bg-white/5 rounded-xl border border-white/5">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-[10px] font-bold">{review.author}</span>
                                  <span className="text-[8px] text-white/30">{review.date}</span>
                                </div>
                                <div className="flex gap-0.5 mb-1">
                                  {[...Array(5)].map((_, i) => (
                                    <Star key={i} size={8} className={cn(i < review.rating ? "text-yellow-500 fill-yellow-500" : "text-white/10")} />
                                  ))}
                                </div>
                                <p className="text-[10px] text-white/60 leading-tight line-clamp-2 italic">"{review.comment}"</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Incoming Vitals */}
                    <div className={cn(
                      "bg-[#0a0a0a] border p-8 rounded-[2.5rem] shadow-2xl transition-all duration-500",
                      transmittedTriage?.severity === "Critical" 
                        ? "border-red-600 shadow-[0_0_50px_rgba(220,38,38,0.3)] animate-pulse" 
                        : "border-white/5"
                    )}>
                      <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-red-600/10 rounded-xl flex items-center justify-center text-red-600">
                            <Users size={24} />
                          </div>
                          <h2 className="text-2xl font-black tracking-tighter">Incoming Patient</h2>
                        </div>
                        {transmittedVitals && (
                          <div className={cn(
                            "px-3 py-1 border rounded-full flex items-center gap-2",
                            transmittedTriage?.severity === "Critical" ? "bg-red-600 border-red-600 animate-pulse" : "bg-red-600/10 border-red-600/20"
                          )}>
                            <div className={cn(
                              "w-1.5 h-1.5 rounded-full",
                              transmittedTriage?.severity === "Critical" ? "bg-white" : "bg-red-600 animate-pulse"
                            )} />
                            <span className={cn(
                              "text-[10px] font-black uppercase tracking-widest",
                              transmittedTriage?.severity === "Critical" ? "text-white" : "text-red-500"
                            )}>
                              {transmittedTriage?.severity === "Critical" ? "CRITICAL ALERT" : "Alert"}
                            </span>
                          </div>
                        )}
                      </div>

                      {transmittedVitals ? (
                        <div className="space-y-6">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 bg-white/[0.02] rounded-2xl border border-white/5 text-center col-span-2">
                              <div className={cn(
                                "text-xl font-black tracking-tighter mb-1",
                                transmittedTriage?.severity === "Critical" ? "text-red-500" : 
                                transmittedTriage?.severity === "High" ? "text-orange-500" : "text-white"
                              )}>
                                {transmittedTriage?.severity} Severity
                              </div>
                              <div className="text-[10px] font-black uppercase tracking-widest text-white/30">{transmittedTriage?.condition}</div>
                            </div>
                            <div className="p-4 bg-white/[0.02] rounded-2xl border border-white/5 text-center">
                              <div className="text-2xl font-black">{transmittedVitals.hr}</div>
                              <div className="text-[10px] font-black uppercase tracking-widest text-white/30">Pulse</div>
                            </div>
                            <div className="p-4 bg-white/[0.02] rounded-2xl border border-white/5 text-center">
                              <div className="text-2xl font-black">{transmittedVitals.spo2}%</div>
                              <div className="text-[10px] font-black uppercase tracking-widest text-white/30">SpO2</div>
                            </div>
                            <div className="p-4 bg-white/[0.02] rounded-2xl border border-white/5 text-center">
                              <div className="text-2xl font-black">{transmittedVitals.bp}</div>
                              <div className="text-[10px] font-black uppercase tracking-widest text-white/30">BP</div>
                            </div>
                            <div className="p-4 bg-white/[0.02] rounded-2xl border border-white/5 text-center">
                              <div className="text-2xl font-black">{transmittedVitals.temp}°C</div>
                              <div className="text-[10px] font-black uppercase tracking-widest text-white/30">Temp</div>
                            </div>
                          </div>

                          {patientStatus === "accepted" && (
                            <div className="space-y-4">
                              <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-2xl text-center">
                                <div className="text-green-500 font-black uppercase tracking-[0.2em] text-xs mb-1">
                                  Automatically Accepted
                                </div>
                                <div className="text-[10px] font-bold text-white/50 uppercase tracking-widest">
                                  Emergency Team Notified & Preparing
                                </div>
                              </div>
                              <div className="flex items-center gap-3 p-4 bg-blue-500/10 border border-blue-500/20 rounded-2xl">
                                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                                <div className="text-[10px] font-black uppercase tracking-widest text-blue-500">
                                  Centralized Alert System Active
                                </div>
                              </div>
                            </div>
                          )}

                          {patientStatus === "rejected" && (
                            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-center font-black uppercase tracking-[0.2em] text-xs text-red-500">
                              Patient Rejected
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="p-12 text-center bg-white/[0.01] border border-dashed border-white/10 rounded-3xl">
                          <p className="text-xs font-black uppercase tracking-widest text-white/20">No incoming transmissions</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Hospital List */}
                {(matchedHospitals.length > 0 || view === "map" || view === "ambulance") && (
                  <div className="flex-1 flex flex-col gap-4 min-h-0">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-white/30 px-2">Recommended Facilities</h3>
                    <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                      {(matchedHospitals.length > 0 ? matchedHospitals : MOCK_HOSPITALS).map((h) => (
                        <div
                          key={h.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => getRouting(h)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); getRouting(h); } }}
                          className={cn(
                            "w-full text-left p-6 rounded-[2.5rem] border transition-all flex items-center justify-between group cursor-pointer",
                            selectedHospital?.id === h.id ? "bg-white/10 border-red-600/50" : "bg-white/5 border-white/5 hover:border-white/20"
                          )}
                        >
                          <div className="flex-1">
                            <div className="flex items-center justify-between w-full">
                              <div className="flex items-center gap-4">
                                <div className={cn(
                                  "w-12 h-12 rounded-2xl flex items-center justify-center transition-colors shadow-lg",
                                  selectedHospital?.id === h.id ? "bg-red-600 text-white shadow-red-600/20" : "bg-white/5 text-white/20 group-hover:bg-red-600 group-hover:text-white"
                                )}>
                                  <HospitalIcon size={20} />
                                </div>
                                <div>
                                  <div className="flex items-center gap-3 min-w-0">
                                    <h4 className="font-black text-white tracking-tight truncate">{h.name}</h4>
                                    <span className={cn(
                                      "px-2 py-0.5 rounded text-[8px] font-black border shrink-0",
                                      h.grade === "A+" ? "bg-green-500/10 border-green-500/20 text-green-500" :
                                      h.grade === "A" ? "bg-blue-500/10 border-blue-500/20 text-blue-500" :
                                      "bg-yellow-500/10 border-yellow-500/20 text-yellow-500"
                                    )}>
                                      GRADE {h.grade}
                                    </span>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-bold text-white/30 uppercase tracking-widest mt-1">
                                    <span className="text-yellow-500">★ {h.rating.toFixed(1)}</span>
                                    <span>•</span>
                                    <span>{h.beds} Beds</span>
                                    <span>•</span>
                                    <span className="text-blue-500">{h.icuBeds} ICU</span>
                                    <span>•</span>
                                    <span className={cn(selectedHospital?.id === h.id && "text-red-500")}>{h.distance?.toFixed(1) || "0.0"} km</span>
                                    {selectedHospital?.id === h.id && routingInfo && (
                                      <>
                                        <span>•</span>
                                        <span className="text-green-500">{Math.round(routingInfo.duration / 60)} min</span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <ChevronRight size={20} className={cn("transition-transform", selectedHospital?.id === h.id ? "text-red-600 rotate-90" : "text-white/10")} />
                            </div>

                            <AnimatePresence>
                              {selectedHospital?.id === h.id && (
                                <motion.div 
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: "auto" }}
                                  exit={{ opacity: 0, height: 0 }}
                                  className="overflow-hidden"
                                >
                                  <div className="mt-8 pt-8 border-t border-white/5 space-y-8">
                                    {/* Performance Metrics Section */}
                                    <div className="space-y-4">
                                      <div className="text-[10px] font-black uppercase tracking-widest text-white/30">Performance Metrics</div>
                                      <div className="grid grid-cols-3 gap-4">
                                        <div className="p-4 bg-white/[0.02] rounded-2xl border border-white/5 flex flex-col items-center text-center">
                                          <div className="w-8 h-8 rounded-lg bg-red-600/10 flex items-center justify-center text-red-600 mb-2">
                                            <Clock size={16} />
                                          </div>
                                          <div className="text-lg font-black tracking-tighter text-white">{h.avgAmbulanceResponseTime}m</div>
                                          <div className="text-[8px] font-black uppercase tracking-widest text-white/30">Response</div>
                                        </div>
                                        <div className="p-4 bg-white/[0.02] rounded-2xl border border-white/5 flex flex-col items-center text-center">
                                          <div className="w-8 h-8 rounded-lg bg-green-600/10 flex items-center justify-center text-green-600 mb-2">
                                            <ShieldCheck size={16} />
                                          </div>
                                          <div className="text-lg font-black tracking-tighter text-white">{h.serviceQuality}%</div>
                                          <div className="text-[8px] font-black uppercase tracking-widest text-white/30">Quality</div>
                                        </div>
                                        <div className="p-4 bg-white/[0.02] rounded-2xl border border-white/5 flex flex-col items-center text-center">
                                          <div className="w-8 h-8 rounded-lg bg-blue-600/10 flex items-center justify-center text-blue-600 mb-2">
                                            <BarChart3 size={16} />
                                          </div>
                                          <div className="text-lg font-black tracking-tighter text-white">{h.coordinationScore}%</div>
                                          <div className="text-[8px] font-black uppercase tracking-widest text-white/30">Coord</div>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Detailed Stats Section */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                      <div className="space-y-6">
                                        <div className="text-[10px] font-black uppercase tracking-widest text-white/30 flex items-center gap-2">
                                          <Stethoscope size={12} className="text-blue-500" />
                                          Specialists & Availability
                                        </div>
                                        <div className="space-y-3">
                                          {h.doctors?.map((doc) => (
                                            <div key={doc.id} className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
                                              <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                  <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
                                                    <User size={14} />
                                                  </div>
                                                  <div>
                                                    <div className="text-[11px] font-black text-white">{doc.name}</div>
                                                    <div className="text-[9px] font-bold text-white/30 uppercase tracking-widest">{doc.specialty}</div>
                                                  </div>
                                                </div>
                                                <div className={cn(
                                                  "px-2 py-0.5 rounded text-[8px] font-black border uppercase tracking-widest",
                                                  doc.isAvailable ? "bg-green-500/10 border-green-500/20 text-green-500" : "bg-red-500/10 border-red-500/20 text-red-500"
                                                )}>
                                                  {doc.isAvailable ? "Available" : "Busy"}
                                                </div>
                                              </div>
                                            </div>
                                          )) || <span className="text-[10px] text-white/20 italic">No doctor data</span>}
                                        </div>
                                      </div>

                                      <div className="space-y-6">
                                        <div className="text-[10px] font-black uppercase tracking-widest text-white/30 flex items-center gap-2">
                                          <Wrench size={12} className="text-orange-500" />
                                          Equipment & Resources
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                          {h.equipment?.map((e, i) => (
                                            <span key={i} className="px-3 py-1 bg-orange-500/10 border border-orange-500/20 rounded-full text-[10px] font-bold text-orange-400">
                                              {e}
                                            </span>
                                          )) || <span className="text-[10px] text-white/20 italic">No data</span>}
                                        </div>
                                      </div>
                                    </div>

                                    {/* Patient Feedback Section */}
                                    <div className="space-y-4">
                                      <div className="flex items-center justify-between">
                                        <div className="text-[10px] font-black uppercase tracking-widest text-white/30 flex items-center gap-2">
                                          <MessageSquare size={12} className="text-yellow-500" />
                                          Recent Feedback
                                        </div>
                                        <div className="flex items-center gap-1">
                                          <Star size={10} className="text-yellow-500 fill-yellow-500" />
                                          <span className="text-[10px] font-black">{h.rating.toFixed(1)}</span>
                                        </div>
                                      </div>
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {h.reviews?.slice(0, 2).map((r) => (
                                          <div key={r.id} className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
                                            <div className="flex items-center justify-between mb-2">
                                              <span className="text-[10px] font-black text-white/60 uppercase tracking-widest">{r.author}</span>
                                              <span className="text-[8px] font-bold text-white/20 uppercase tracking-widest">{r.date}</span>
                                            </div>
                                            <p className="text-[11px] leading-relaxed text-white/40 italic line-clamp-2">"{r.comment}"</p>
                                          </div>
                                        )) || <span className="text-[10px] text-white/20 italic">No reviews</span>}
                                      </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex gap-3 pt-4">
                                      {h.mapsUrl && (
                                        <a 
                                          href={h.mapsUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="flex-1 py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white text-center transition-all"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          Maps
                                        </a>
                                      )}
                                      <button 
                                        className="flex-2 py-4 bg-red-600 hover:bg-red-700 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white transition-all shadow-lg shadow-red-600/20"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setIsNavigating(true);
                                        }}
                                      >
                                        Start Navigation
                                      </button>
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right Panel: Map */}
              <div className="lg:col-span-7 flex flex-col gap-6 h-[600px] lg:h-auto">
                <div className="bg-[#0a0a0a] rounded-[3rem] border border-white/5 shadow-2xl flex-1 flex flex-col overflow-hidden">
                  <div className="p-8 flex items-center justify-between border-b border-white/5 bg-white/[0.01]">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-red-600/10 rounded-2xl flex items-center justify-center text-red-600">
                        <Navigation size={24} />
                      </div>
                      <div>
                        <h2 className="text-2xl font-black tracking-tighter text-white">Live Routing</h2>
                        {routingInfo && (
                          <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-white/40 mt-1">
                            <span className="text-red-500">{(routingInfo.distance / 1000).toFixed(1)} KM</span>
                            <span>•</span>
                            <span className="text-green-500">{Math.round(routingInfo.duration / 60)} MIN</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {isRoutingLoading && (
                      <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-red-600">
                        <div className="w-2 h-2 bg-red-600 rounded-full animate-ping" />
                        Calculating
                      </div>
                    )}
                  </div>
                  <div className="flex-1 relative bg-black">
                    <Map 
                      userLocation={userLocation}
                      hospitals={MOCK_HOSPITALS}
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
      <footer className="bg-[#050505] border-t border-white/5 py-12">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/10 rounded-xl flex items-center justify-center text-white">
              <Activity size={18} />
            </div>
            <span className="text-lg font-black tracking-tighter text-white">MedCoord<span className="text-red-600">X</span></span>
          </div>
          <div className="text-[10px] font-black uppercase tracking-widest text-white/20">
            &copy; 2026 MedCoordX • Emergency Resource Routing
          </div>
          <div className="flex items-center gap-8">
            <a href="#" className="text-[10px] font-black uppercase tracking-widest text-white/20 hover:text-white transition-colors">Privacy</a>
            <a href="#" className="text-[10px] font-black uppercase tracking-widest text-white/20 hover:text-white transition-colors">Terms</a>
            <a href="#" className="text-[10px] font-black uppercase tracking-widest text-white/20 hover:text-white transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
