import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import path from "path";

async function startServer() {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });
  const PORT = 3000;

  // Mock ambulance positions
  let ambulances = [
    { id: "amb-1", lat: 40.7128, lng: -74.0060 },
    { id: "amb-2", lat: 40.7306, lng: -73.9352 },
    { id: "amb-3", lat: 40.7589, lng: -73.9851 },
  ];

  // Update ambulance positions periodically
  setInterval(() => {
    ambulances = ambulances.map(amb => ({
      ...amb,
      lat: amb.lat + (Math.random() - 0.5) * 0.001,
      lng: amb.lng + (Math.random() - 0.5) * 0.001,
    }));

    const message = JSON.stringify({ type: "AMBULANCE_UPDATE", data: ambulances });
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }, 1000);

  wss.on("connection", (ws) => {
    console.log("Client connected to WebSocket");
    // Send initial positions
    ws.send(JSON.stringify({ type: "AMBULANCE_UPDATE", data: ambulances }));
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
