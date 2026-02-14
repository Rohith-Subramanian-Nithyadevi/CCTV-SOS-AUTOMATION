import React, { useEffect, useRef, useState } from 'react';
import { Camera, AlertCircle, CheckCircle, X, MapPin, Clock, Calendar, ShieldCheck } from 'lucide-react';

export default function App() {
  const canvasRef = useRef(null);
  
  const [alerts, setAlerts] = useState([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [systemStatus, setSystemStatus] = useState("Connecting...");
  const wsRef = useRef(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const wsUrl = import.meta.env.VITE_WS_URL || "ws://localhost:8000/ws/frontend";
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setSystemStatus("Monitoring Active");
    ws.onclose = () => setSystemStatus("Disconnected");

    ws.onmessage = async (event) => {
      if (event.data instanceof Blob) {
        const arrayBuffer = await event.data.arrayBuffer();
        const dataView = new DataView(arrayBuffer);
        
        // 1. Unpack Header
        const jsonLen = dataView.getUint32(0, false); 
        
        // 2. Read JSON Alerts
        const jsonText = new TextDecoder().decode(arrayBuffer.slice(4, 4 + jsonLen));
        const payload = JSON.parse(jsonText);
        
        // --- UPDATED ALERT LOGIC ---
        if (payload.alerts?.emergency_detected) {
          payload.detections.forEach(det => {
            const className = det.class_name;
            if (["Fire", "Fall", "Accident", "Violence", "Unconsciousness"].includes(className)) {
              
              //  Use the exact integer from the AI layer to match the backend
              const eventId = `evt_${payload.frame_id}_${payload.unix_time}`;
              
              setAlerts(prev => {
                // Prevent UI Spam (only show one active card per hazard type)
                if (prev.some(a => a.class_name === className)) return prev;
                
                return [{
                  id: eventId, 
                  class_name: className, 
                  severity: "HIGH",
                  location: "ROAD 1", 
                  time: new Date(payload.timestamp).toLocaleTimeString('en-US', { hour12: true }),
                  desc: `${className} emergency triggered.`
                }, ...prev];
              });
            }
          });
        }

        // 3. Unpack and Draw Video Image
        const imageBlob = new Blob([arrayBuffer.slice(4 + jsonLen)], { type: "image/jpeg" });
        const imageBitmap = await createImageBitmap(imageBlob);

        requestAnimationFrame(() => {
          const canvas = canvasRef.current;
          if (!canvas) return;
          const ctx = canvas.getContext("2d", { alpha: false });
          
          canvas.width = imageBitmap.width;
          canvas.height = imageBitmap.height;
          ctx.drawImage(imageBitmap, 0, 0); 
          imageBitmap.close(); 
        });
      }
    };

    return () => {
      if (ws.readyState === 1) ws.close();
    };
  }, []);

  const handleResolve = (eventId) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: "resolve", event_id: eventId }));
    }
    setAlerts(prev => prev.filter(alert => alert.id !== eventId));
  };

  const formatDate = (date) => `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
  const formatTime = (date) => date.toLocaleTimeString('en-US', { hour12: true });

  return (
    <div className="h-screen bg-[#0B1120] text-slate-200 flex flex-col font-sans">
      <nav className="px-6 py-4 bg-[#0F172A] border-b border-slate-800 flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-wider text-white">CCTV-SOS-AUTOMATION</h1>
        <div className="flex items-center gap-2 text-sm text-green-400 font-mono">
          <ShieldCheck className="w-5 h-5" /> AI Core Online
        </div>
      </nav>

      <div className="flex flex-1 overflow-hidden p-4 gap-4">
        
        {/* LEFT SIDE: SYSTEM STATUS & VIDEO PANEL */}
        <div className="flex-1 bg-[#111827] border border-slate-800 rounded-xl flex flex-col overflow-hidden relative">
          <div className="flex justify-between items-center p-4 border-b border-slate-800 bg-[#111827] z-10">
            <div className="flex items-center gap-2">
              <Camera className="w-5 h-5 text-blue-500" />
              <span className="font-semibold text-slate-200">CAM-001</span>
              <span className="text-sm text-slate-500 flex items-center gap-1 ml-2">
                <MapPin className="w-4 h-4" /> Lab Block A
              </span>
            </div>
            <div className="text-sm text-slate-400 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              {formatDate(currentTime)}, {formatTime(currentTime)}
            </div>
          </div>

          <div className="flex-1 relative flex items-center justify-center bg-[#0B1120] overflow-hidden">
             <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(to right, #1e293b 1px, transparent 1px), linear-gradient(to bottom, #1e293b 1px, transparent 1px)', backgroundSize: '50px 50px', opacity: 0.3 }}></div>
             
             <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-contain z-20" />

             {systemStatus !== "Monitoring Active" && (
                 <div className="relative z-10 flex flex-col items-center opacity-50 bg-[#0B1120] w-full h-full justify-center">
                    <Camera className="w-16 h-16 text-slate-500 mb-4 animate-pulse" />
                    <h2 className="text-xl font-bold text-slate-400">{systemStatus}</h2>
                 </div>
             )}
          </div>
        </div>

        {/* RIGHT SIDE: ALERTS PANEL */}
        <div className="w-96 bg-[#111827] border border-slate-800 rounded-xl flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-[#0F172A]">
            <div className="flex items-center gap-2 text-red-500 font-bold">
              <AlertCircle className="w-5 h-5" />
              <span>SOS Alerts</span>
            </div>
            <div className="bg-red-600 text-white text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full">
              {alerts.length}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {alerts.length === 0 ? (
              <div className="text-center text-slate-500 mt-10">No active alerts. All clear.</div>
            ) : (
              alerts.map((alert) => (
                <div key={alert.id} className="bg-[#1E293B] border-l-4 border-red-500 rounded-r-lg p-4 shadow-sm">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-white">{alert.class_name}</h3>
                    <span className="bg-red-600 text-white text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider">HIGH</span>
                  </div>
                  <p className="text-xs text-slate-400 mb-3">{alert.desc}</p>
                  <div className="flex items-center gap-4 text-[10px] text-slate-500 mb-4">
                    <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {alert.location}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {alert.time}</span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleResolve(alert.id)} className="flex-1 bg-green-600 hover:bg-green-500 text-white text-xs py-2 rounded flex items-center justify-center gap-1 transition-colors">
                      <CheckCircle className="w-3 h-3" /> Action Taken
                    </button>
                    <button onClick={() => handleResolve(alert.id)} className="flex-1 bg-[#334155] hover:bg-[#475569] text-white text-xs py-2 rounded flex items-center justify-center gap-1 transition-colors">
                      <X className="w-3 h-3" /> Neglect
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}