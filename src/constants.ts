import { Hospital, Ambulance } from "./types";

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
    lat: 40.7128,
    lng: -74.0060,
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
        id: "d1", name: "Dr. Sarah Chen", specialty: "Cardiology", isAvailable: true, nextAvailableSlot: "14:00",
        slots: [{ time: "14:00", available: true }, { time: "15:00", available: false }, { time: "16:00", available: true }]
      },
      { 
        id: "d2", name: "Dr. Michael Ross", specialty: "Neurology", isAvailable: false, nextAvailableSlot: "Tomorrow 09:00",
        slots: [{ time: "09:00", available: false }, { time: "10:00", available: false }]
      }
    ],
    equipment: ["3T MRI Scanner", "Cardiac Cath Lab", "Advanced Ventilators"],
    reviews: [
      { id: "r1", author: "John D.", rating: 5, comment: "Exceptional care and very fast response.", date: "2024-03-15" },
      { id: "r2", author: "Maria S.", rating: 4, comment: "Professional staff, though the waiting area was crowded.", date: "2024-03-10" }
    ]
  },
  {
    id: "2",
    name: "Fortis Memorial Hospital",
    lat: 40.7306,
    lng: -73.9352,
    beds: 12,
    icuBeds: 4,
    specialties: ["Pediatrics", "Emergency", "Oncology"],
    rating: 4.5,
    grade: "A",
    facilities: ["Neonatal ICU", "Oncology Center"],
    avgAmbulanceResponseTime: 9,
    serviceQuality: 92,
    coordinationScore: 89,
    facilityScore: 94,
    availabilityScore: 88,
    specialists: ["Dr. James Wilson (Oncology)", "Dr. Lisa Cuddy (Pediatrics)"],
    doctors: [
      { 
        id: "d3", name: "Dr. James Wilson", specialty: "Oncology", isAvailable: true, nextAvailableSlot: "11:30",
        slots: [{ time: "11:30", available: true }, { time: "12:30", available: true }]
      },
      { 
        id: "d4", name: "Dr. Lisa Cuddy", specialty: "Pediatrics", isAvailable: true, nextAvailableSlot: "15:00",
        slots: [{ time: "15:00", available: true }, { time: "16:00", available: true }]
      }
    ],
    equipment: ["Linear Accelerator", "Pediatric Ventilators"],
    reviews: [
      { id: "r3", author: "Robert K.", rating: 5, comment: "The pediatric team is amazing.", date: "2024-03-12" }
    ]
  },
  {
    id: "3",
    name: "Max Super Specialty",
    lat: 40.7589,
    lng: -73.9851,
    beds: 5,
    icuBeds: 2,
    specialties: ["General Medicine", "Family Practice", "Trauma"],
    rating: 3.9,
    grade: "B",
    facilities: ["Diagnostic Lab", "Ambulance Fleet"],
    avgAmbulanceResponseTime: 14,
    serviceQuality: 78,
    coordinationScore: 75,
    facilityScore: 72,
    availabilityScore: 68,
    specialists: ["Dr. Gregory House (Diagnostics)", "Dr. Eric Foreman (Neurology)"],
    doctors: [
      { 
        id: "d5", name: "Dr. Gregory House", specialty: "Diagnostics", isAvailable: false, nextAvailableSlot: "Indefinite",
        slots: [{ time: "09:00", available: false }]
      },
      { 
        id: "d6", name: "Dr. Eric Foreman", specialty: "Neurology", isAvailable: true, nextAvailableSlot: "10:00",
        slots: [{ time: "10:00", available: true }, { time: "11:00", available: true }]
      }
    ],
    equipment: ["CT Scanner", "X-Ray Machine"],
    reviews: [
      { id: "r4", author: "Linda P.", rating: 3, comment: "Decent care, but wait times were long.", date: "2024-03-08" }
    ]
  },
  {
    id: "4",
    name: "Apollo Emergency Care",
    lat: 40.7829,
    lng: -73.9654,
    beds: 80,
    icuBeds: 25,
    specialties: ["Emergency", "Trauma", "Surgery"],
    rating: 4.9,
    grade: "A+",
    facilities: ["Level 1 Trauma Center", "Heliport", "Robotic Surgery"],
    avgAmbulanceResponseTime: 5,
    serviceQuality: 99,
    coordinationScore: 97,
    facilityScore: 100,
    availabilityScore: 98,
    specialists: ["Dr. Robert Chase (Surgery)", "Dr. Allison Cameron (Immunology)"],
    doctors: [
      { 
        id: "d7", name: "Dr. Robert Chase", specialty: "Surgery", isAvailable: true, nextAvailableSlot: "08:00",
        slots: [{ time: "08:00", available: true }, { time: "09:00", available: true }]
      },
      { 
        id: "d8", name: "Dr. Allison Cameron", specialty: "Immunology", isAvailable: true, nextAvailableSlot: "13:00",
        slots: [{ time: "13:00", available: true }]
      }
    ],
    equipment: ["Da Vinci Robotic System", "Hybrid OR"],
    reviews: [
      { id: "r5", author: "David W.", rating: 5, comment: "Best emergency facility in the city.", date: "2024-03-20" }
    ]
  },
  {
    id: "5",
    name: "Medanta Medicity",
    lat: 40.7069,
    lng: -74.0113,
    beds: 25,
    icuBeds: 8,
    specialties: ["Orthopedics", "Rehabilitation", "Emergency"],
    rating: 4.2,
    grade: "A",
    facilities: ["Rehab Gym", "Sports Medicine"],
    avgAmbulanceResponseTime: 11,
    serviceQuality: 85,
    coordinationScore: 82,
    facilityScore: 88,
    availabilityScore: 80,
    specialists: ["Dr. Chris Taub (Plastic Surgery)", "Dr. Remy Hadley (Internal Medicine)"],
    doctors: [
      { 
        id: "d9", name: "Dr. Chris Taub", specialty: "Plastic Surgery", isAvailable: true, nextAvailableSlot: "16:00",
        slots: [{ time: "16:00", available: true }]
      },
      { 
        id: "d10", name: "Dr. Remy Hadley", specialty: "Internal Medicine", isAvailable: false, nextAvailableSlot: "Next Week",
        slots: [{ time: "09:00", available: false }]
      }
    ],
    equipment: ["Rehabilitation Robotics", "Hydrotherapy Pool"],
    reviews: [
      { id: "r6", author: "Susan M.", rating: 4, comment: "Great rehab facilities.", date: "2024-03-18" }
    ]
  },
];

export const MOCK_AMBULANCES: Ambulance[] = [
  {
    id: "amb-1",
    number: "AMB-001",
    status: "available",
    responseTime: 8,
    efficiency: 95,
    grade: "A+",
    lat: 40.7128,
    lng: -74.0060,
  },
  {
    id: "amb-2",
    number: "AMB-002",
    status: "busy",
    responseTime: 12,
    efficiency: 88,
    grade: "A",
    lat: 40.7306,
    lng: -73.9352,
  },
  {
    id: "amb-3",
    number: "AMB-003",
    status: "available",
    responseTime: 15,
    efficiency: 82,
    grade: "B",
    lat: 40.7589,
    lng: -73.9851,
  },
];
