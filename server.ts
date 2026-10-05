import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

function inferFallbackTriage(symptomsText: string) {
  const lower = symptomsText.toLowerCase();
  if (
    lower.includes("chest pain") ||
    lower.includes("shortness of breath") ||
    lower.includes("seizure") ||
    lower.includes("difficulty speaking") ||
    lower.includes("unconscious") ||
    lower.includes("stroke") ||
    lower.includes("heart")
  ) {
    return {
      condition: lower.includes("chest pain") || lower.includes("heart")
        ? "Suspected Acute Coronary Syndrome / Cardiac Emergency"
        : "Critical Neurological / Respiratory Emergency",
      severity: "Critical" as const,
      recommendedSpecialties: ["Emergency", "Cardiology", "Neurology", "Trauma"],
    };
  }
  if (
    lower.includes("palpitation") ||
    lower.includes("numbness") ||
    lower.includes("blurred vision") ||
    lower.includes("abdominal pain") ||
    lower.includes("bleeding")
  ) {
    return {
      condition: "Acute Clinical Presentation Requiring Urgent Evaluation",
      severity: "High" as const,
      recommendedSpecialties: ["Emergency", "Cardiology", "General Medicine"],
    };
  }
  if (
    lower.includes("fever") ||
    lower.includes("dizziness") ||
    lower.includes("vomiting") ||
    lower.includes("nausea") ||
    lower.includes("back pain")
  ) {
    return {
      condition: "Moderate Systemic / Febrile Syndrome",
      severity: "Moderate" as const,
      recommendedSpecialties: ["General Medicine", "Internal Medicine", "Emergency"],
    };
  }
  return {
    condition: "General Outpatient Clinical Assessment",
    severity: "Low" as const,
    recommendedSpecialties: ["General Medicine", "Family Practice"],
  };
}

async function startServer() {
  const app = express();
  app.use(express.json());

  const server = createServer(app);
  const wss = new WebSocketServer({ server });
  const PORT = 3000;

  // Base coordinates (New Delhi, India by default, dynamically updated when client shares GPS)
  let baseLocation = { lat: 28.5672, lng: 77.2100 };

  let ambulances = [
    { id: "amb-1", lat: 28.5720, lng: 77.2150 },
    { id: "amb-2", lat: 28.5500, lng: 77.2500 },
    { id: "amb-3", lat: 28.5350, lng: 77.2050 },
  ];

  // Shared incoming patient state across portals
  let activeTransmission: any = null;

  // API Endpoint: Server-Side Gemini Triage + Maps Grounding
  app.post("/api/triage", async (req, res) => {
    const { symptoms, userLocation } = req.body || {};
    if (!symptoms || typeof symptoms !== "string" || !symptoms.trim()) {
      return res.status(400).json({ error: "Please provide symptoms for analysis." });
    }

    const fallback = inferFallbackTriage(symptoms);

    if (!process.env.GEMINI_API_KEY) {
      return res.json({
        triage: fallback,
        groundingHospitals: [],
      });
    }

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: `You are an emergency clinical triage system. Analyze the following patient symptoms: "${symptoms}".
Provide a JSON block with this exact structure:
{
  "condition": "Concise likely medical condition",
  "severity": "Low" | "Moderate" | "High" | "Critical",
  "recommendedSpecialties": ["Specialty 1", "Specialty 2"]
}
Also identify real nearby emergency hospitals capable of treating this condition.`,
        config: {
          tools: [{ googleMaps: {} }],
          toolConfig: userLocation?.lat && userLocation?.lng
            ? {
                retrievalConfig: {
                  latLng: {
                    latitude: Number(userLocation.lat),
                    longitude: Number(userLocation.lng),
                  },
                },
              }
            : undefined,
        },
      });

      const text = response.text || "";
      let triage = { ...fallback };

      try {
        const jsonMatch = text.match(/\{[\s\S]*?\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          const validSeverities = ["Low", "Moderate", "High", "Critical"];
          triage = {
            condition: parsed.condition || fallback.condition,
            severity: validSeverities.includes(parsed.severity) ? parsed.severity : fallback.severity,
            recommendedSpecialties:
              Array.isArray(parsed.recommendedSpecialties) && parsed.recommendedSpecialties.length > 0
                ? parsed.recommendedSpecialties
                : fallback.recommendedSpecialties,
          };
        }
      } catch {
        // Keep fallback triage if markdown response didn't contain strict JSON
      }

      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const groundingHospitals = groundingChunks
        .filter((chunk: any) => chunk.maps?.uri && chunk.maps?.title)
        .map((chunk: any) => ({
          title: chunk.maps.title,
          uri: chunk.maps.uri,
        }));

      return res.json({
        triage,
        groundingHospitals,
      });
    } catch (error: any) {
      console.error("Server Gemini triage error:", error?.message || error);
      // Return resilient fallback so emergency workflow never blocks
      return res.json({
        triage: fallback,
        groundingHospitals: [],
        warning: "Used clinical rule engine fallback.",
      });
    }
  });

  // Update ambulance positions periodically around active base location
  setInterval(() => {
    ambulances = ambulances.map((amb) => ({
      ...amb,
      lat: Number((amb.lat + (Math.random() - 0.5) * 0.0008).toFixed(6)),
      lng: Number((amb.lng + (Math.random() - 0.5) * 0.0008).toFixed(6)),
    }));

    const message = JSON.stringify({ type: "AMBULANCE_UPDATE", data: ambulances });
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }, 1500);

  wss.on("connection", (ws) => {
    ws.send(JSON.stringify({ type: "AMBULANCE_UPDATE", data: ambulances }));
    if (activeTransmission) {
      ws.send(JSON.stringify({ type: "VITALS_TRANSMITTED", data: activeTransmission }));
    }

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "SET_USER_LOCATION" && msg.data?.lat && msg.data?.lng) {
          const newLat = Number(msg.data.lat);
          const newLng = Number(msg.data.lng);
          const dist = Math.hypot(newLat - baseLocation.lat, newLng - baseLocation.lng);
          if (dist > 0.25) {
            baseLocation = { lat: newLat, lng: newLng };
            ambulances = [
              { id: "amb-1", lat: Number((newLat + 0.006).toFixed(6)), lng: Number((newLng + 0.008).toFixed(6)) },
              { id: "amb-2", lat: Number((newLat - 0.011).toFixed(6)), lng: Number((newLng + 0.014).toFixed(6)) },
              { id: "amb-3", lat: Number((newLat + 0.014).toFixed(6)), lng: Number((newLng - 0.010).toFixed(6)) },
            ];
            const updateMsg = JSON.stringify({ type: "AMBULANCE_UPDATE", data: ambulances });
            wss.clients.forEach((c) => {
              if (c.readyState === WebSocket.OPEN) c.send(updateMsg);
            });
          }
        } else if (msg.type === "TRANSMIT_VITALS") {
          activeTransmission = msg.data;
          const broadcast = JSON.stringify({ type: "VITALS_TRANSMITTED", data: activeTransmission });
          wss.clients.forEach((c) => {
            if (c.readyState === WebSocket.OPEN) c.send(broadcast);
          });
        } else if (msg.type === "PATIENT_STATUS_UPDATE") {
          if (activeTransmission) {
            activeTransmission = { ...activeTransmission, status: msg.data.status };
          }
          const broadcast = JSON.stringify({ type: "PATIENT_STATUS_UPDATE", data: msg.data });
          wss.clients.forEach((c) => {
            if (c.readyState === WebSocket.OPEN) c.send(broadcast);
          });
        }
      } catch (e) {
        console.error("WS message error:", e);
      }
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
