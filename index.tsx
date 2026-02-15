
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI } from "@google/genai";
import { 
  Recycle, 
  LogOut, 
  Wifi, 
  WifiOff, 
  Bell, 
  History, 
  Trash2, 
  ShieldCheck,
  Cpu,
  Terminal,
  Activity,
  CheckCircle2,
  AlertCircle,
  Zap,
  Clock,
  Settings,
  Lock,
  Sparkles,
  Loader2
} from 'lucide-react';

// --- Types ---
interface DetectionEvent {
  id: string;
  timestamp: Date;
  label: string;
}

interface SerialLog {
  time: string;
  data: string;
}

// --- App Component ---
const App: React.FC = () => {
  // Session Management
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => {
    return localStorage.getItem('ecoin_session_active') === 'true';
  });
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  
  // Data State
  const [count, setCount] = useState<number>(() => {
    const saved = localStorage.getItem('ecoin_total_count');
    return saved ? parseInt(saved, 10) : 0;
  });
  
  const [logs, setLogs] = useState<DetectionEvent[]>(() => {
    const saved = localStorage.getItem('ecoin_history');
    return saved ? JSON.parse(saved).map((l: any) => ({ ...l, timestamp: new Date(l.timestamp) })) : [];
  });

  // AI State
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);

  // Hardware State
  const [serialLogs, setSerialLogs] = useState<SerialLog[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // WiFi Config State
  const [showWifiConfig, setShowWifiConfig] = useState(false);
  const [ssid, setSsid] = useState('');
  const [wifiPass, setWifiPass] = useState('');

  const portRef = useRef<any>(null);
  const readerRef = useRef<ReadableStreamDefaultReader | null>(null);
  const writerRef = useRef<WritableStreamDefaultWriter | null>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const countRef = useRef(count);

  // Sync count ref for notifications
  useEffect(() => {
    countRef.current = count;
  }, [count]);

  // Real-time Clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Persistence Effects
  useEffect(() => {
    localStorage.setItem('ecoin_total_count', count.toString());
    localStorage.setItem('ecoin_history', JSON.stringify(logs));
  }, [count, logs]);

  useEffect(() => {
    localStorage.setItem('ecoin_session_active', isLoggedIn.toString());
  }, [isLoggedIn]);

  // Auto-scroll terminal
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [serialLogs]);

  // Push Notification Setup
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const addSerialLog = (data: string) => {
    const time = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setSerialLogs(prev => [...prev, { time, data }].slice(-50));
  };

  const processDetection = useCallback(() => {
    const newCountValue = countRef.current + 1;
    setCount(newCountValue);

    const timestamp = new Date();
    const newEvent: DetectionEvent = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp,
      label: `IR Signal Detected`
    };
    
    setLogs(prev => [newEvent, ...prev].slice(0, 100));
    
    // Browser Notification
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("Ecoin Alert", {
        body: `Infrared sensor tripped! Total detections: ${newCountValue}`,
        icon: 'https://cdn-icons-png.flaticon.com/512/3299/3299935.png'
      });
    }
  }, []);

  // AI Generation Logic
  const generateAiInsight = async () => {
    if (logs.length === 0) {
      setError("No telemetry data to analyze yet.");
      return;
    }
    
    setIsGeneratingAi(true);
    setAiInsight(null);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      const logSummary = logs.map(l => l.timestamp.toLocaleTimeString()).join(', ');
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Analyze these infrared detection timestamps: ${logSummary}. Provide a 2-sentence professional insight about the detection patterns and operational efficiency for the Ecoin monitoring system.`,
      });

      setAiInsight(response.text || "Insight generated but empty.");
    } catch (err: any) {
      setError("AI Service unavailable: Check API key.");
      console.error(err);
    } finally {
      setIsGeneratingAi(false);
    }
  };

  // Web Serial Management
  const disconnectHardware = async () => {
    try {
      if (readerRef.current) {
        await readerRef.current.cancel();
        readerRef.current = null;
      }
      if (writerRef.current) {
        await writerRef.current.releaseLock();
        writerRef.current = null;
      }
      if (portRef.current) {
        await portRef.current.close();
        portRef.current = null;
      }
    } catch (e) {
      console.warn("Serial closure error:", e);
    } finally {
      setIsConnected(false);
      addSerialLog("System detached.");
    }
  };

  const connectToHardware = async () => {
    if (!("serial" in navigator)) {
      setError("Web Serial not supported in this browser.");
      return;
    }

    try {
      // @ts-ignore
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200 });
      portRef.current = port;
      setIsConnected(true);
      setError(null);
      addSerialLog("Link Established: 115200 bps");

      const writer = port.writable.getWriter();
      writerRef.current = writer;

      const decoder = new TextDecoderStream();
      port.readable.pipeTo(decoder.writable);
      const reader = decoder.readable.getReader();
      readerRef.current = reader;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          const cleanValue = value.trim();
          addSerialLog(`RX: ${cleanValue}`);
          if (cleanValue.includes("DETECT") || cleanValue === "1") {
            processDetection();
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'NotFoundError' && err.name !== 'AbortError') {
        setError(`Link Error: ${err.message}`);
      }
      setIsConnected(false);
    }
  };

  const sendWifiCredentials = async () => {
    if (!writerRef.current) {
      setError("Device not connected via Serial.");
      return;
    }
    try {
      const encoder = new TextEncoder();
      const data = `SET_WIFI:${ssid},${wifiPass}\n`;
      await writerRef.current.write(encoder.encode(data));
      setSuccess("WiFi credentials sent to ESP32");
      setShowWifiConfig(false);
      addSerialLog(`TX: Setting WiFi to ${ssid}`);
    } catch (err: any) {
      setError(`Failed to send data: ${err.message}`);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.length >= 3 && password.length >= 3) {
      setIsLoggedIn(true);
      setError(null);
    } else {
      setError("Credentials required.");
    }
  };

  const handleLogout = () => {
    disconnectHardware();
    setIsLoggedIn(false);
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-6 font-sans">
        <div className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-2xl p-10 shadow-2xl">
          <div className="flex flex-col items-center mb-10">
            <div className="p-4 bg-emerald-500/10 rounded-2xl mb-4">
              <Recycle className="w-12 h-12 text-emerald-500" />
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tighter">Ecoin</h1>
            <p className="text-neutral-500 text-[10px] mt-1 uppercase tracking-[0.3em] font-black">Operator Access</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <input 
              type="text" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Operator ID"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-5 py-4 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-all"
              required
            />
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Secure Token"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-5 py-4 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-all"
              required
            />
            <button 
              type="submit"
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-xl transition-all active:scale-[0.98]"
            >
              Initialize System
            </button>
          </form>
          
          <div className="mt-12 flex items-center justify-center gap-3 text-neutral-700 text-[9px] uppercase font-black tracking-widest">
            <ShieldCheck className="w-4 h-4" />
            <span>Encrypted Environment</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans p-4 md:p-8">
      <header className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center mb-12 gap-6">
        <div className="flex items-center gap-5">
          <div className="p-3 bg-emerald-500/10 rounded-2xl border border-emerald-500/20">
            <Recycle className="w-8 h-8 text-emerald-500" />
          </div>
          <div>
            <h2 className="text-3xl font-bold text-white tracking-tighter italic">Ecoin</h2>
            <div className="flex items-center gap-3 mt-1">
              <span className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-800'}`} />
              <span className="text-[10px] uppercase tracking-[0.2em] font-black text-neutral-500">
                {isConnected ? 'Telemetry Active' : 'Waiting for Link'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 bg-neutral-900/50 backdrop-blur-md p-2 rounded-2xl border border-neutral-800">
          <div className="hidden sm:flex items-center gap-4 px-5 border-r border-neutral-800">
            <Clock className="w-4 h-4 text-neutral-600" />
            <span className="text-xs font-black tabular-nums text-neutral-400">
              {currentTime.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <button onClick={() => setShowWifiConfig(true)} className="p-3 text-neutral-500 hover:text-emerald-400 transition-colors">
            <Settings className="w-5 h-5" />
          </button>
          <button 
            onClick={isConnected ? disconnectHardware : connectToHardware}
            className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] border ${
              isConnected ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-emerald-600 text-white border-emerald-500/20'
            }`}
          >
            {isConnected ? 'Linked' : 'Pair ESP32'}
          </button>
          <button onClick={handleLogout} className="p-3 text-neutral-600 hover:text-rose-400">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-10 relative overflow-hidden group">
              <p className="text-emerald-500 text-[10px] font-black uppercase tracking-[0.4em] mb-4">Total Unit Throughput</p>
              <div className="flex items-baseline gap-4">
                <span className="text-9xl font-black text-white tabular-nums tracking-tighter leading-none">{count}</span>
                <span className="text-neutral-600 text-[10px] font-black uppercase tracking-[0.3em]">Units</span>
              </div>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-8 flex flex-col">
              <div className="flex items-center justify-between mb-6">
                <h4 className="text-white text-[10px] font-black uppercase tracking-[0.4em] flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-500" />
                  AI Intelligence
                </h4>
                <button 
                  onClick={generateAiInsight}
                  disabled={isGeneratingAi}
                  className="p-2 bg-emerald-500/10 rounded-lg hover:bg-emerald-500/20 disabled:opacity-50 transition-all"
                >
                  {isGeneratingAi ? <Loader2 className="w-4 h-4 animate-spin text-emerald-500" /> : <Zap className="w-4 h-4 text-emerald-500" />}
                </button>
              </div>
              <div className="flex-1 bg-neutral-950 rounded-2xl p-6 border border-neutral-800/50 flex items-center justify-center italic text-neutral-500 text-xs text-center leading-relaxed">
                {aiInsight || (isGeneratingAi ? "Computing log patterns..." : "Click bolt icon to analyze detection trends.")}
              </div>
            </div>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-8">
            <h4 className="text-white text-[10px] font-black uppercase tracking-[0.4em] flex items-center gap-3 mb-6">
              <Terminal className="w-4 h-4 text-emerald-500" />
              Serial Console
            </h4>
            <div className="bg-neutral-950 rounded-2xl p-6 h-[240px] overflow-y-auto font-mono text-[10px] border border-neutral-900 custom-scrollbar">
              {serialLogs.map((log, idx) => (
                <div key={idx} className="mb-2 flex gap-4 border-b border-neutral-900 pb-2">
                  <span className="text-neutral-800 shrink-0 font-bold">[{log.time}]</span>
                  <span className={log.data.startsWith('RX') ? 'text-emerald-500' : 'text-neutral-600'}>{log.data}</span>
                </div>
              ))}
              <div ref={terminalEndRef} />
            </div>
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl flex flex-col h-full max-h-[820px] overflow-hidden">
            <div className="p-8 border-b border-neutral-800 flex items-center justify-between bg-neutral-900/50">
              <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] flex items-center gap-3">
                <History className="w-5 h-5 text-emerald-500" />
                Live Feed
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
              {logs.map((log) => (
                <div key={log.id} className="p-6 bg-neutral-950 border border-neutral-800/50 rounded-2xl group animate-in fade-in slide-in-from-right-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-emerald-500 text-[9px] font-black tracking-[0.2em] uppercase">Sensor_Event</span>
                    <span className="text-[10px] text-neutral-700 font-mono font-bold">{log.timestamp.toLocaleTimeString()}</span>
                  </div>
                  <p className="text-sm font-bold text-neutral-300">{log.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {showWifiConfig && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-[2rem] p-10">
            <h3 className="text-2xl font-bold text-white mb-8 flex items-center gap-3"><Wifi className="w-6 h-6 text-emerald-500" /> WiFi Provisioning</h3>
            <div className="space-y-4">
              <input type="text" value={ssid} onChange={(e) => setSsid(e.target.value)} placeholder="SSID" className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-5 py-4 text-sm text-white" />
              <input type="password" value={wifiPass} onChange={(e) => setWifiPass(e.target.value)} placeholder="Passphrase" className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-5 py-4 text-sm text-white" />
              <div className="flex gap-3 pt-4">
                <button onClick={() => setShowWifiConfig(false)} className="flex-1 bg-neutral-800 text-neutral-400 font-bold py-4 rounded-xl text-[11px] uppercase tracking-widest">Cancel</button>
                <button onClick={sendWifiCredentials} className="flex-1 bg-emerald-600 text-white font-bold py-4 rounded-xl text-[11px] uppercase tracking-widest">Apply</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="fixed bottom-10 left-1/2 -translate-x-1/2 flex flex-col gap-3 z-[150] w-full max-w-xs px-6">
        {error && <div className="bg-rose-500 text-white px-8 py-4 rounded-2xl shadow-2xl flex items-center justify-between gap-4 animate-in slide-in-from-bottom-6"><span className="font-black text-[10px] uppercase tracking-widest leading-tight">{error}</span><button onClick={() => setError(null)}>✕</button></div>}
        {success && <div className="bg-emerald-500 text-white px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-bottom-6"><CheckCircle2 className="w-5 h-5 shrink-0" /><span className="font-black text-[10px] uppercase tracking-widest leading-tight">{success}</span></div>}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@200;300;400;500;600;700;800&display=swap');
        body { font-family: 'Plus Jakarta Sans', sans-serif; background-color: #080808; }
        .custom-scrollbar::-webkit-scrollbar { width: 3px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1c1c1c; border-radius: 10px; }
        .animate-in { animation: 0.5s cubic-bezier(0.16, 1, 0.3, 1) both; }
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slide-in-from-right-4 { from { transform: translateX(1.5rem); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes slide-in-from-bottom-6 { from { transform: translateY(2rem); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
