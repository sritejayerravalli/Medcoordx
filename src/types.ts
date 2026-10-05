export interface AppointmentSlot {
  time: string;
  available: boolean;
}

export interface Doctor {
  id: string;
  name: string;
  specialty: string;
  isAvailable: boolean;
  nextAvailableSlot?: string;
  slots: AppointmentSlot[];
}

export interface Review {
  id: string;
  author: string;
  rating: number;
  comment: string;
  date: string;
}

export interface Hospital {
  id: string;
  name: string;
  lat: number;
  lng: number;
  beds: number;
  icuBeds: number;
  specialties: string[];
  distance?: number;
  mapsUrl?: string;
  rating: number; // 1-5
  grade: "A+" | "A" | "B" | "C";
  facilities: string[];
  avgAmbulanceResponseTime: number; // in minutes
  serviceQuality: number; // 0-100
  coordinationScore: number; // 0-100
  facilityScore: number; // 0-100
  availabilityScore: number; // 0-100
  specialists?: string[]; // Legacy field, will use doctors instead
  doctors?: Doctor[];
  equipment?: string[];
  reviews?: Review[];
}

export interface Ambulance {
  id: string;
  number: string;
  status: "available" | "busy" | "en-route";
  responseTime: number; // in minutes
  efficiency: number; // 0-100
  grade: "A+" | "A" | "B" | "C";
  lat: number;
  lng: number;
}

export interface TriageResult {
  condition: string;
  severity: "Low" | "Moderate" | "High" | "Critical";
  recommendedSpecialties: string[];
}

export interface UserLocation {
  lat: number;
  lng: number;
}
