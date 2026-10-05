import { Hospital, Ambulance, UserLocation } from "./types";
import { calculateDistance } from "./lib/utils";

// Default fallback coordinates: New Delhi, India (AIIMS / Central NCR)
export const DEFAULT_LOCATION: UserLocation = {
  lat: 28.5672,
  lng: 77.2100,
};

export const PREDEFINED_SYMPTOMS = [
  "Chest Pain",
  "Shortness of Breath",
  "Headache",
  "Dizziness",
  "Nausea",
  "Fever",
  "Abdominal Pain",
  "Back Pain",
  "Numbness",
  "Blurred Vision",
  "Cough",
  "Fatigue",
  "Sweating",
  "Palpitations",
  "Seizures",
  "Difficulty Speaking"
];

export const MOCK_HOSPITALS: Hospital[] = [
  {
    id: "1",
    name: "AIIMS Medical Center",
    lat: 28.5672,
    lng: 77.2100,
    beds: 45,
    icuBeds: 12,
    specialties: ["Emergency", "Cardiology", "Neurology"],
    rating: 4.8,
    grade: "A+",
    facilities: ["Advanced MRI", "24/7 Pharmacy", "Blood Bank"],
    avgAmbulanceResponseTime: 6,
    serviceQuality: 98,
    coordinationScore: 96,
    facilityScore: 99,
    availabilityScore: 95,
    specialists: ["Dr. Sarah Chen (Cardiology)", "Dr. Michael Ross (Neurology)", "Dr. Elena Vance (Emergency)"],
    doctors: [
      { 
        id: "d1", name: "Dr. Aditi Sharma", specialty: "Cardiology", isAvailable: true, nextAvailableSlot: "14:00",
        slots: [{ time: "14:00", available: true }, { time: "15:00", available: false }, { time: "16:00", available: true }]
      },
      { 
        id: "d2", name: "Dr. Rajesh Kumar", specialty: "Neurology", isAvailable: false, nextAvailableSlot: "Tomorrow 09:00",
        slots: [{ time: "09:00", available: false }, { time: "10:00", available: false }]
      }
    ],
    equipment: ["3T MRI Scanner", "Cardiac Cath Lab", "Advanced Ventilators"],
    reviews: [
      { id: "r1", author: "Arjun M.", rating: 5.0, comment: "Exceptional trauma care and very fast ambulance response.", date: "2025-02-15" },
      { id: "r2", author: "Priya S.", rating: 4.5, comment: "Professional medical staff, well-organized emergency triage.", date: "2025-02-10" }
    ]
  },
  {
    id: "2",
    name: "Fortis Memorial Hospital",
    lat: 28.5450,
    lng: 77.2732,
    beds: 18,
    icuBeds: 6,
    specialties: ["Pediatrics", "Emergency", "Oncology"],
    rating: 4.5,
    grade: "A",
    facilities: ["Neonatal ICU", "Oncology Center", "24/7 CT Scan"],
    avgAmbulanceResponseTime: 9,
    serviceQuality: 92,
    coordinationScore: 89,
    facilityScore: 94,
    availabilityScore: 88,
    specialists: ["Dr. Vikram Mehta (Oncology)", "Dr. Neha Kapoor (Pediatrics)"],
    doctors: [
      { 
        id: "d3", name: "Dr. Vikram Mehta", specialty: "Oncology", isAvailable: true, nextAvailableSlot: "11:30",
        slots: [{ time: "11:30", available: true }, { time: "12:30", available: true }]
      },
      { 
        id: "d4", name: "Dr. Neha Kapoor", specialty: "Pediatrics", isAvailable: true, nextAvailableSlot: "15:00",
        slots: [{ time: "15:00", available: true }, { time: "16:00", available: true }]
      }
    ],
    equipment: ["Linear Accelerator", "Pediatric Ventilators", "Digital X-Ray"],
    reviews: [
      { id: "r3", author: "Rohan K.", rating: 4.8, comment: "The pediatric emergency team was responsive and attentive.", date: "2025-02-12" }
    ]
  },
  {
    id: "3",
    name: "Max Super Specialty",
    lat: 28.5284,
    lng: 77.2116,
    beds: 9,
    icuBeds: 3,
    specialties: ["General Medicine", "Family Practice", "Trauma"],
    rating: 4.1,
    grade: "B",
    facilities: ["Diagnostic Lab", "Ambulance Fleet"],
    avgAmbulanceResponseTime: 13,
    serviceQuality: 81,
    coordinationScore: 78,
    facilityScore: 80,
    availabilityScore: 74,
    specialists: ["Dr. संजय Verma (Diagnostics)", "Dr. Ananya Rao (Neurology)"],
    doctors: [
      { 
        id: "d5", name: "Dr. Sanjay Verma", specialty: "Diagnostics", isAvailable: false, nextAvailableSlot: "17:30",
        slots: [{ time: "09:00", available: false }, { time: "17:30", available: true }]
      },
      { 
        id: "d6", name: "Dr. Ananya Rao", specialty: "Neurology", isAvailable: true, nextAvailableSlot: "10:00",
        slots: [{ time: "10:00", available: true }, { time: "11:00", available: true }]
      }
    ],
    equipment: ["CT Scanner", "X-Ray Machine", "Portable Ultrasound"],
    reviews: [
      { id: "r4", author: "Sneha P.", rating: 4.0, comment: "Good diagnostic care, though evening wait times can be busy.", date: "2025-02-08" }
    ]
  },
  {
    id: "4",
    name: "Apollo Emergency Care",
    lat: 28.5366,
    lng: 77.2830,
    beds: 80,
    icuBeds: 25,
    specialties: ["Emergency", "Trauma", "Surgery", "Cardiology"],
    rating: 4.9,
    grade: "A+",
    facilities: ["Level 1 Trauma Center", "Heliport", "Robotic Surgery"],
    avgAmbulanceResponseTime: 5,
    serviceQuality: 99,
    coordinationScore: 97,
    facilityScore: 100,
    availabilityScore: 98,
    specialists: ["Dr. Siddharth Nair (Surgery)", "Dr. Meera Iyer (Immunology)"],
    doctors: [
      { 
        id: "d7", name: "Dr. Siddharth Nair", specialty: "Trauma Surgery", isAvailable: true, nextAvailableSlot: "08:00",
        slots: [{ time: "08:00", available: true }, { time: "09:00", available: true }]
      },
      { 
        id: "d8", name: "Dr. Meera Iyer", specialty: "Cardiology", isAvailable: true, nextAvailableSlot: "13:00",
        slots: [{ time: "13:00", available: true }, { time: "14:30", available: true }]
      }
    ],
    equipment: ["Da Vinci Robotic System", "Hybrid OR", "ECMO Unit"],
    reviews: [
      { id: "r5", author: "Deepak W.", rating: 5.0, comment: "Best emergency trauma facility in the region.", date: "2025-02-20" }
    ]
  },
  {
    id: "5",
    name: "Medanta Medicity",
    lat: 28.5961,
    lng: 77.1695,
    beds: 28,
    icuBeds: 8,
    specialties: ["Orthopedics", "Rehabilitation", "Emergency"],
    rating: 4.4,
    grade: "A",
    facilities: ["Rehab Gym", "Sports Medicine", "Trauma Unit"],
    avgAmbulanceResponseTime: 10,
    serviceQuality: 88,
    coordinationScore: 85,
    facilityScore: 90,
    availabilityScore: 84,
    specialists: ["Dr. Kabir Malhotra (Orthopedics)", "Dr. Kavita Joshi (Internal Medicine)"],
    doctors: [
      { 
        id: "d9", name: "Dr. Kabir Malhotra", specialty: "Orthopedics", isAvailable: true, nextAvailableSlot: "16:00",
        slots: [{ time: "16:00", available: true }, { time: "17:00", available: true }]
      },
      { 
        id: "d10", name: "Dr. Kavita Joshi", specialty: "Internal Medicine", isAvailable: false, nextAvailableSlot: "Tomorrow 10:00",
        slots: [{ time: "09:00", available: false }]
      }
    ],
    equipment: ["Rehabilitation Robotics", "Hydrotherapy Pool", "Digital Arthroscopy"],
    reviews: [
      { id: "r6", author: "Suresh M.", rating: 4.3, comment: "Great orthopedic and rehabilitation facilities.", date: "2025-02-18" }
    ]
  },
];

export const MOCK_AMBULANCES: Ambulance[] = [
  {
    id: "amb-1",
    number: "AMB-108-A",
    status: "available",
    responseTime: 7,
    efficiency: 95,
    grade: "A+",
    lat: 28.5720,
    lng: 77.2150,
  },
  {
    id: "amb-2",
    number: "AMB-108-B",
    status: "busy",
    responseTime: 11,
    efficiency: 88,
    grade: "A",
    lat: 28.5500,
    lng: 77.2500,
  },
  {
    id: "amb-3",
    number: "AMB-108-C",
    status: "available",
    responseTime: 14,
    efficiency: 82,
    grade: "B",
    lat: 28.5350,
    lng: 77.2050,
  },
];

// Offsets around user's real location so hospitals & ambulances are always in the user's actual city/country
const HOSPITAL_OFFSETS = [
  { dLat: 0.012, dLng: 0.015 },
  { dLat: -0.018, dLng: 0.028 },
  { dLat: -0.025, dLng: -0.014 },
  { dLat: 0.024, dLng: -0.022 },
  { dLat: 0.008, dLng: -0.032 },
];

const AMBULANCE_OFFSETS = [
  { dLat: 0.006, dLng: 0.008 },
  { dLat: -0.011, dLng: 0.014 },
  { dLat: 0.014, dLng: -0.010 },
];

export function localizeHospitalsToUser(hospitals: Hospital[], userLocation: UserLocation): Hospital[] {
  const distFromDefault = calculateDistance(
    userLocation.lat,
    userLocation.lng,
    DEFAULT_LOCATION.lat,
    DEFAULT_LOCATION.lng
  );

  return hospitals.map((h, idx) => {
    const offset = HOSPITAL_OFFSETS[idx % HOSPITAL_OFFSETS.length];
    // If user is more than 35km away from default location (or if hospital has 0,0 coordinates), anchor around userLocation
    const shouldRelocate = distFromDefault > 35 || (h.lat === 0 && h.lng === 0);
    const lat = shouldRelocate ? Number((userLocation.lat + offset.dLat).toFixed(6)) : h.lat;
    const lng = shouldRelocate ? Number((userLocation.lng + offset.dLng).toFixed(6)) : h.lng;
    const distance = calculateDistance(userLocation.lat, userLocation.lng, lat, lng);
    return {
      ...h,
      lat,
      lng,
      distance,
    };
  }).sort((a, b) => (a.distance || 0) - (b.distance || 0));
}

export function localizeAmbulancesToUser(ambulances: Ambulance[], userLocation: UserLocation): Ambulance[] {
  const distFromDefault = calculateDistance(
    userLocation.lat,
    userLocation.lng,
    DEFAULT_LOCATION.lat,
    DEFAULT_LOCATION.lng
  );
  if (distFromDefault <= 35) return ambulances;

  return ambulances.map((amb, idx) => {
    const offset = AMBULANCE_OFFSETS[idx % AMBULANCE_OFFSETS.length];
    return {
      ...amb,
      lat: Number((userLocation.lat + offset.dLat).toFixed(6)),
      lng: Number((userLocation.lng + offset.dLng).toFixed(6)),
    };
  });
}
