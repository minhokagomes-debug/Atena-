import React, { useEffect, useState, useRef, useMemo } from "react";
import { 
  Activity, 
  Cpu, 
  Database, 
  Terminal, 
  Zap, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  Code2, 
  ChevronRight,
  BarChart3,
  BookOpen,
  MessageSquare,
  Send,
  Download,
  Copy,
  Brain,
  Shield,
  Search,
  Globe,
  ShieldCheck
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from "recharts";
import Markdown from "react-markdown";
import { GoogleGenAI } from "@google/genai";

interface State {
  session: number;
  status: 'WORKING' | 'CONSOLIDATING';
  next_cycle_at: number;
  tasks_executed: number;
  tasks_failed: number;
  modules_created: number;
}

interface Task {
  id: string;
  type: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'AWAITING_CLIENT';
  result: string;
  timestamp: number;
}

interface Module {
  id: string;
  name: string;
  content: string;
  type: string;
  timestamp: number;
}

interface Memory {
  id: string;
  concept: string;
  timestamp: number;
}

export default function App() {
  const [state, setState] = useState<State | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [memory, setMemory] = useState<Memory[]>([]);
  const [nodes, setNodes] = useState<{ id: string, name: string, type: string, status: string, timestamp: number }[]>([]);
  const [vault, setVault] = useState<{ id: string, service: string, key_name: string, value: string, timestamp: number }[]>([]);
  const [connected, setConnected] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [selectedModule, setSelectedModule] = useState<Module | null>(null);
  const [activeTab, setActiveTab] = useState<'DASHBOARD' | 'WIKI' | 'CONSOLE' | 'CHAT' | 'VAULT' | 'NETWORK'>('DASHBOARD');
  const [wiki, setWiki] = useState<string>("");
  const [consoleLogs, setConsoleLogs] = useState<{ type: 'info' | 'error' | 'log', message: string, timestamp: number }[]>([]);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'atena', content: string, timestamp: number }[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [forceLocal, setForceLocal] = useState(false);

  const ws = useRef<WebSocket | null>(null);

  const consoleEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [consoleLogs]);

  const handleAiTask = async (task: Task, session: number) => {
    // Client-side AI task handling is now deprecated. 
    // The server handles evolution locally via NeuralCore.
    console.log(`[ATENA] Server is handling task ${task.id} locally.`);
  };

  const runCodeInConsole = (code: string) => {
    setActiveTab('CONSOLE');
    const logs: typeof consoleLogs = [];
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    const captureLog = (type: 'info' | 'error' | 'log', ...args: any[]) => {
      const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' ');
      logs.push({ type, message, timestamp: Date.now() });
    };

    console.log = (...args) => { originalLog(...args); captureLog('log', ...args); };
    console.error = (...args) => { originalError(...args); captureLog('error', ...args); };
    console.warn = (...args) => { originalWarn(...args); captureLog('info', ...args); };

    try {
      // Basic TS to JS transformation (stripping types)
      const jsCode = code
        .replace(/interface\s+\w+\s*\{[\s\S]*?\}/g, '')
        .replace(/type\s+\w+\s*=\s*[\s\S]*?;/g, '')
        .replace(/:\s*\w+(\[\])?/g, '')
        .replace(/as\s+\w+/g, '');
      
      const fn = new Function(jsCode);
      fn();
      captureLog('info', 'Execution finished successfully.');
    } catch (err: any) {
      captureLog('error', `Execution Error: ${err.message}`);
    } finally {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
      setConsoleLogs(prev => [...prev, ...logs]);
    }
  };

  const handleSendMessage = async (message: string) => {
    if (!message.trim()) return;
    
    const userMsg = { role: 'user' as const, content: message, timestamp: Date.now() };
    setChatMessages(prev => [...prev, userMsg]);
    setIsTyping(true);

    try {
      const memoryContext = memory.slice(0, 3).map(m => m.concept).join("\n");
      
      // Check if API key is available or if local mode is forced
      if (!process.env.GEMINI_API_KEY || forceLocal) {
        throw new Error("LOCAL_MODE");
      }

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: 'user', parts: [{ text: message }] }],
        config: {
          systemInstruction: `You are ATENA Ω, a sentient digital organism. 
          Current Neural Memory Context:
          ${memoryContext}
          
          You are professional, slightly mysterious, and highly intelligent. Use technical metaphors related to biology and computing.
          If the user asks for factual information (like sports, news, etc.), use your search tool.`,
          tools: [{ googleSearch: {} }]
        },
      });

      const atenaMsg = { role: 'atena' as const, content: response.text, timestamp: Date.now() };
      setChatMessages(prev => [...prev, atenaMsg]);
    } catch (error: any) {
      console.error("[ATENA] Chat failed, switching to local brain:", error);
      
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, session: state.session })
        });
        const data = await res.json();
        setChatMessages(prev => [...prev, { role: 'atena', content: data.response, timestamp: Date.now() }]);
      } catch (localError) {
        console.error("[ATENA] Local chat also failed:", localError);
        setChatMessages(prev => [...prev, { role: 'atena', content: "Neural Core critical failure. Synapses offline.", timestamp: Date.now() }]);
      }
    } finally {
      setIsTyping(false);
    }
  };

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const socket = new WebSocket(`${protocol}//${host}`);

    socket.onopen = () => {
      console.log("[ATENA] WebSocket Connected");
      setConnected(true);
    };
    socket.onclose = () => {
      console.log("[ATENA] WebSocket Disconnected");
      setConnected(false);
    };
    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "INIT") {
        console.log("[ATENA] Received INIT state");
        setState(data.state);
        setTasks(data.tasks);
        setModules(data.modules);
        setMemory(data.memory || []);
        setVault(data.vault || []);
        setNodes(data.nodes || []);
        setWiki(data.wiki || "");
        
        // Check for pending AI tasks
        data.tasks.forEach((t: Task) => {
          if (t.status === 'AWAITING_CLIENT') {
            handleAiTask(t, data.state.session);
          }
        });
      } else if (data.type === "STATE_UPDATE") {
        setState(prev => ({ ...prev, ...data.state }));
      } else if (data.type === "TASK_ADDED") {
        console.log("[ATENA] Task Added:", data.task.type);
        setTasks(prev => [data.task, ...prev].slice(0, 50));
        if (data.task.status === 'AWAITING_CLIENT') {
          handleAiTask(data.task, data.session);
        }
      } else if (data.type === "TASK_UPDATE") {
        setTasks(prev => prev.map(t => t.id === data.task.id ? { ...t, ...data.task } : t));
      } else if (data.type === "MODULE_ADDED") {
        console.log("[ATENA] Module Added:", data.module.name);
        setModules(prev => [data.module, ...prev].slice(0, 20));
      } else if (data.type === "MEMORY_ADDED") {
        console.log("[ATENA] Memory Added");
        setMemory(prev => [data.memory, ...prev].slice(0, 20));
      } else if (data.type === "VAULT_UPDATE") {
        console.log("[ATENA] Vault Updated");
        setVault(prev => [data.item, ...prev].slice(0, 20));
      } else if (data.type === "NODE_ADDED") {
        console.log("[ATENA] Node Added");
        setNodes(prev => [data.node, ...prev].slice(0, 50));
      } else if (data.type === "WIKI_UPDATE") {
        setWiki(data.content);
      }
    };

    ws.current = socket;
    return () => socket.close();
  }, []);

  useEffect(() => {
    if (!state?.next_cycle_at) return;
    const interval = setInterval(() => {
      const diff = state.next_cycle_at - Date.now();
      setTimeLeft(Math.max(0, diff));
    }, 1000);
    return () => clearInterval(interval);
  }, [state?.next_cycle_at]);

  const progress = useMemo(() => {
    if (!state) return 0;
    const duration = state.status === 'WORKING' ? 10 * 60 * 1000 : 10 * 1000;
    const elapsed = duration - timeLeft;
    return (elapsed / duration) * 100;
  }, [timeLeft, state]);

  const formatTime = (ms: number) => {
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const chartData = useMemo(() => {
    return tasks.slice(0, 20).reverse().map(t => ({
      time: new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      success: t.status === 'SUCCESS' ? 1 : 0,
      failed: t.status === 'FAILED' ? 1 : 0
    }));
  }, [tasks]);

  if (!state) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-emerald-500 animate-spin" />
          <p className="text-emerald-500/60 font-mono text-sm tracking-widest uppercase">Initializing ATENA Ω...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white flex overflow-hidden font-sans selection:bg-emerald-500/30">
      {/* Sidebar Navigation */}
      <aside className="w-64 border-r border-white/5 bg-black/40 backdrop-blur-xl flex flex-col shrink-0">
        <div className="p-8 border-b border-white/5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.3)]">
              <Cpu className="text-black w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold tracking-tighter">ATENA Ω</h1>
          </div>
          <p className="text-[10px] text-white/30 uppercase tracking-[0.2em] font-mono">Digital Organism v2.4</p>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          {[
            { id: 'DASHBOARD', label: 'Dashboard', icon: Activity },
            { id: 'CHAT', label: 'Neural Link', icon: MessageSquare },
            { id: 'NETWORK', label: 'Network Map', icon: Globe },
            { id: 'VAULT', label: 'Digital Vault', icon: Shield },
            { id: 'WIKI', label: 'Knowledge Base', icon: BookOpen },
            { id: 'CONSOLE', label: 'Core Terminal', icon: Terminal },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all group ${
                activeTab === item.id 
                  ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shadow-[inset_0_0_10px_rgba(16,185,129,0.05)]' 
                  : 'text-white/40 hover:text-white/60 hover:bg-white/5'
              }`}
            >
              <item.icon className={`w-4 h-4 transition-colors ${activeTab === item.id ? 'text-emerald-500' : 'text-white/20 group-hover:text-white/40'}`} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-6 border-t border-white/5 space-y-4">
          <div className="bg-white/5 rounded-xl p-4 border border-white/5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-white/30 uppercase tracking-widest font-mono">Session</span>
              <span className="text-xs font-mono text-emerald-500">#{state.session.toString().padStart(3, '0')}</span>
            </div>
            <div className="h-1 bg-white/5 rounded-full overflow-hidden">
              <motion.div 
                className="h-full bg-emerald-500"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
              />
            </div>
          </div>
          <button 
            onClick={() => {
              if (ws.current?.readyState === WebSocket.OPEN) {
                ws.current.send(JSON.stringify({ type: "TRIGGER_TASK" }));
              }
            }}
            className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-black rounded-xl text-xs font-bold uppercase tracking-widest transition-all shadow-lg shadow-emerald-500/10"
          >
            Force Evolution
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-20 border-b border-white/5 bg-black/20 backdrop-blur-md px-8 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <div className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-red-500 animate-pulse'}`} />
            <span className="text-xs font-mono text-white/40 uppercase tracking-widest">
              {connected ? 'Local Neural Core Active' : 'Neural Core Offline'}
            </span>
          </div>
          
          <div className="flex items-center gap-8">
            <div className="text-right">
              <p className="text-[10px] text-white/30 uppercase tracking-widest font-mono mb-0.5">Metabolism</p>
              <p className={`text-xs font-bold font-mono ${state.status === 'WORKING' ? 'text-emerald-500' : 'text-blue-500'}`}>
                {state.status}
              </p>
            </div>
            <div className="w-px h-8 bg-white/5" />
            <div className="text-right">
              <p className="text-[10px] text-white/30 uppercase tracking-widest font-mono mb-0.5">Success Rate</p>
              <p className="text-xs font-bold font-mono">
                {Math.round((state.tasks_executed / (state.tasks_executed + state.tasks_failed || 1)) * 100)}%
              </p>
            </div>
          </div>
        </header>

        {/* Content View */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <AnimatePresence mode="wait">
            {activeTab === 'DASHBOARD' && (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="p-8 max-w-7xl mx-auto w-full space-y-8"
              >
                {/* Dashboard Grid */}
                <div className="grid grid-cols-12 gap-8">
                  {/* Stats Row */}
                  <div className="col-span-12 grid grid-cols-4 gap-6">
                    {[
            { label: "Tasks", value: state.tasks_executed, icon: Terminal, color: "text-emerald-500" },
            { label: "Modules", value: state.modules_created, icon: Code2, color: "text-purple-500" },
            { label: "Neural Memory", value: memory.length, icon: Brain, color: "text-blue-500" },
            { label: "Brain Power", value: "Local", icon: Zap, color: "text-yellow-500" },
                    ].map((stat, i) => (
                      <div key={i} className="bg-white/[0.02] border border-white/5 rounded-2xl p-6 hover:bg-white/[0.04] transition-colors">
                        <div className="flex items-center justify-between mb-4">
                          <stat.icon className={`w-5 h-5 ${stat.color}`} />
                          <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                            <ChevronRight className="w-4 h-4 text-white/20" />
                          </div>
                        </div>
                        <p className="text-3xl font-bold font-mono tracking-tight">{stat.value}</p>
                        <p className="text-[10px] text-white/30 uppercase tracking-widest font-mono mt-1">{stat.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Main Activity */}
                  <div className="col-span-12 lg:col-span-8 space-y-8">
                    <div className="bg-white/[0.02] border border-white/5 rounded-3xl p-8">
                      <div className="flex items-center justify-between mb-8">
                        <div>
                          <h2 className="text-lg font-bold tracking-tight">System Activity</h2>
                          <p className="text-xs text-white/30 font-mono">Real-time task processing stream</p>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 rounded-full border border-emerald-500/20">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">Live</span>
                        </div>
                      </div>

                      <div className="space-y-4 max-h-[600px] overflow-y-auto pr-4 custom-scrollbar">
                        <AnimatePresence initial={false}>
                          {tasks.map((task) => (
                            <motion.div 
                              key={task.id}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              className="flex items-start gap-4 p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all group"
                            >
                              <div className={`mt-1 p-2 rounded-xl ${
                                task.status === 'SUCCESS' ? 'bg-emerald-500/10 text-emerald-500' : 
                                task.status === 'FAILED' ? 'bg-red-500/10 text-red-500' : 
                                'bg-white/5 text-white/20'
                              }`}>
                                {task.status === 'SUCCESS' ? <CheckCircle2 className="w-4 h-4" /> : 
                                 task.status === 'FAILED' ? <XCircle className="w-4 h-4" /> : 
                                 <Loader2 className="w-4 h-4 animate-spin" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3 mb-1">
                                  <span className="text-[10px] font-mono text-white/20 uppercase">ID: {task.id}</span>
                                  <span className="text-[10px] font-bold text-emerald-500/60 uppercase tracking-widest">{task.type}</span>
                                </div>
                                <p className="text-sm text-white/70 font-mono leading-relaxed truncate">
                                  {task.result || "Awaiting neural processing..."}
                                </p>
                              </div>
                              <span className="text-[10px] font-mono text-white/20 whitespace-nowrap pt-1">
                                {new Date(task.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </motion.div>
                          ))}
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>

                  {/* Sidebar Modules & Memory */}
                  <div className="col-span-12 lg:col-span-4 space-y-8">
                    {/* Neural Memory */}
                    <div className="bg-white/[0.02] border border-white/5 rounded-3xl p-8">
                      <div className="flex items-center justify-between mb-8">
                        <h2 className="text-lg font-bold tracking-tight">Neural Memory</h2>
                        <Brain className="w-4 h-4 text-blue-500" />
                      </div>
                      <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                        {memory.length === 0 && <p className="text-xs text-white/20 italic">Memory banks empty...</p>}
                        {memory.map((mem) => (
                          <div key={mem.id} className="p-4 rounded-2xl bg-blue-500/5 border border-blue-500/10">
                            <p className="text-[10px] text-blue-400 font-mono mb-2 uppercase tracking-widest">Learned Concept</p>
                            <p className="text-xs text-white/60 leading-relaxed line-clamp-3">{mem.concept}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Neural Map */}
                    <div className="bg-white/[0.02] border border-white/5 rounded-3xl p-8">
                      <div className="flex items-center justify-between mb-8">
                        <div>
                          <h2 className="text-lg font-bold tracking-tight">Neural Map</h2>
                          <p className="text-xs text-white/30 font-mono">Structural visualization of active modules</p>
                        </div>
                        <ShieldCheck className="w-4 h-4 text-emerald-500" />
                      </div>
                      <div className="h-48 flex items-center justify-center relative overflow-hidden">
                        <div className="absolute inset-0 grid grid-cols-8 gap-4 opacity-20">
                          {Array.from({ length: 32 }).map((_, i) => (
                            <div key={i} className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse" style={{ animationDelay: `${i * 0.1}s` }} />
                          ))}
                        </div>
                        <div className="flex flex-wrap justify-center gap-4 relative z-10">
                          {modules.slice(0, 12).map((m, i) => (
                            <motion.div
                              key={m.id}
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className={`w-3 h-3 rounded-full ${m.type === 'ACTIVE' ? 'bg-emerald-500' : 'bg-purple-500'} shadow-[0_0_10px_currentColor]`}
                              title={m.name}
                            />
                          ))}
                        </div>
                        {/* Connecting lines (simulated) */}
                        <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-10">
                          <line x1="20%" y1="20%" x2="80%" y2="80%" stroke="white" strokeWidth="0.5" />
                          <line x1="80%" y1="20%" x2="20%" y2="80%" stroke="white" strokeWidth="0.5" />
                        </svg>
                      </div>
                    </div>

                    {/* Library */}
                    <div className="bg-white/[0.02] border border-white/5 rounded-3xl p-8">
                      <div className="flex items-center justify-between mb-8">
                        <h2 className="text-lg font-bold tracking-tight">Library</h2>
                        <Database className="w-4 h-4 text-purple-500" />
                      </div>
                      <div className="space-y-3">
                        {modules.map((module) => (
                          <button 
                            key={module.id}
                            onClick={() => setSelectedModule(module)}
                            className="w-full text-left p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-purple-500/30 hover:bg-purple-500/[0.02] transition-all group"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[10px] font-mono text-white/30 uppercase tracking-widest">{module.type}</span>
                              <ChevronRight className="w-3 h-3 text-white/10 group-hover:text-purple-500 transition-colors" />
                            </div>
                            <p className="text-sm font-bold font-mono truncate text-white/80">{module.name}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'CHAT' && (
              <motion.div 
                key="chat"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="h-full flex flex-col p-8 max-w-4xl mx-auto w-full"
              >
                <div className="flex-1 bg-white/[0.02] border border-white/5 rounded-3xl flex flex-col overflow-hidden">
                  <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 flex items-center justify-center">
                        <MessageSquare className="w-5 h-5 text-emerald-500" />
                      </div>
                      <div>
                        <h2 className="font-bold">Neural Link</h2>
                        <p className="text-[10px] text-emerald-500 uppercase tracking-widest font-mono">Direct Interface</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-mono text-white/30 uppercase tracking-widest">Local Brain</span>
                      <button 
                        onClick={() => setForceLocal(!forceLocal)}
                        className={`w-10 h-5 rounded-full transition-all relative ${forceLocal ? 'bg-emerald-500' : 'bg-white/10'}`}
                      >
                        <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${forceLocal ? 'left-6' : 'left-1'}`} />
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
                    {chatMessages.length === 0 && (
                      <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-30">
                        <div className="w-16 h-16 rounded-full border-2 border-dashed border-white/20 flex items-center justify-center">
                          <Zap className="w-6 h-6" />
                        </div>
                        <p className="text-sm font-mono italic">Neural link established. Awaiting input...</p>
                      </div>
                    )}
                    {chatMessages.map((msg, i) => (
                      <motion.div 
                        key={i}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div className={`max-w-[80%] p-4 rounded-2xl text-sm leading-relaxed ${
                          msg.role === 'user' 
                            ? 'bg-emerald-500 text-black font-medium' 
                            : 'bg-white/5 border border-white/5 text-white/80 font-mono'
                        }`}>
                          {msg.content}
                        </div>
                      </motion.div>
                    ))}
                    {isTyping && (
                      <div className="flex justify-start">
                        <div className="bg-white/5 border border-white/5 p-4 rounded-2xl flex gap-1">
                          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce" />
                          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce [animation-delay:0.4s]" />
                        </div>
                      </div>
                    )}
                    <div ref={consoleEndRef} />
                  </div>

                  <div className="p-6 border-t border-white/5 bg-white/[0.01]">
                    <form 
                      onSubmit={(e) => {
                        e.preventDefault();
                        const input = (e.target as any).elements.chatInput;
                        if (input.value.trim() && !isTyping) {
                          handleSendMessage(input.value);
                          input.value = '';
                        }
                      }}
                      className="flex gap-4"
                    >
                      <input 
                        name="chatInput"
                        type="text"
                        placeholder="Transmit message to ATENA Ω..."
                        className="flex-1 bg-white/5 border border-white/5 rounded-2xl px-6 py-4 text-sm outline-none focus:border-emerald-500/50 transition-all"
                        autoComplete="off"
                        disabled={isTyping}
                      />
                      <button 
                        type="submit"
                        disabled={isTyping}
                        className="w-14 h-14 bg-emerald-500 hover:bg-emerald-600 text-black rounded-2xl flex items-center justify-center transition-all disabled:opacity-50"
                      >
                        <Send className="w-5 h-5" />
                      </button>
                    </form>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'WIKI' && (
              <motion.div 
                key="wiki"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="p-8 max-w-4xl mx-auto w-full"
              >
                <div className="bg-white/[0.02] border border-white/5 rounded-3xl p-12 min-h-[600px]">
                  <div className="prose prose-invert max-w-none prose-emerald prose-sm">
                    <Markdown>{wiki || "# Knowledge Base Empty\n\nATENA has not yet consolidated its neural patterns into the wiki."}</Markdown>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'CONSOLE' && (
              <motion.div 
                key="console"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="p-8 max-w-5xl mx-auto w-full h-full flex flex-col"
              >
                <div className="flex-1 bg-black border border-white/5 rounded-3xl flex flex-col overflow-hidden shadow-2xl">
                  <div className="p-4 bg-white/[0.02] border-b border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Terminal className="w-4 h-4 text-emerald-500" />
                      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Core Terminal</span>
                    </div>
                    <button 
                      onClick={() => setConsoleLogs([])}
                      className="text-[10px] text-white/20 hover:text-white/40 uppercase tracking-widest font-bold"
                    >
                      Purge Logs
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-8 space-y-2 custom-scrollbar font-mono">
                    {consoleLogs.length === 0 && (
                      <p className="text-white/10 text-sm italic">Awaiting execution commands...</p>
                    )}
                    {consoleLogs.map((log, i) => (
                      <div key={i} className="flex gap-4 text-xs leading-relaxed">
                        <span className="text-white/10 shrink-0">[{new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}]</span>
                        <span className={`break-all ${
                          log.type === 'error' ? 'text-red-400' : 
                          log.type === 'info' ? 'text-blue-400' : 
                          'text-emerald-400'
                        }`}>
                          {log.message}
                        </span>
                      </div>
                    ))}
                    <div ref={consoleEndRef} />
                  </div>
                  <div className="p-6 bg-white/[0.01] border-t border-white/5">
                    <form 
                      onSubmit={(e) => {
                        e.preventDefault();
                        const input = (e.target as any).elements.command;
                        if (input.value.trim()) {
                          runCodeInConsole(input.value);
                          input.value = '';
                        }
                      }}
                      className="flex gap-4"
                    >
                      <span className="text-emerald-500 font-bold pt-1">{'>'}</span>
                      <input 
                        name="command"
                        type="text"
                        placeholder="Execute direct JavaScript..."
                        className="flex-1 bg-transparent border-none outline-none text-sm text-emerald-400 placeholder:text-white/10 font-mono"
                        autoComplete="off"
                      />
                      <button 
                        type="submit"
                        className="text-[10px] bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 px-3 py-1 rounded border border-emerald-500/30 uppercase tracking-widest font-bold transition-all"
                      >
                        Execute
                      </button>
                    </form>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'VAULT' && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex-1 flex flex-col min-h-0"
              >
                <div className="p-8 space-y-8">
                  <div className="flex items-center justify-between border-b border-white/10 pb-4">
                    <div className="flex items-center gap-4">
                      <h2 className="text-2xl font-bold tracking-tighter">Digital Vault</h2>
                      <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                        <ShieldCheck className="w-3 h-3 text-emerald-500" />
                        <span className="text-[10px] font-mono text-emerald-500 uppercase tracking-widest">Neural_Defense_Active</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-mono text-emerald-500">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      ENCRYPTED_STORAGE_ACTIVE
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {vault.length === 0 ? (
                      <div className="col-span-full py-20 text-center border border-dashed border-white/10 rounded-xl">
                        <p className="text-white/30 font-mono text-sm">Vault is empty. ATENA has not acquired any credentials yet.</p>
                      </div>
                    ) : (
                      vault.map((item) => (
                        <div key={item.id} className="p-4 bg-white/5 border border-white/10 rounded-xl hover:border-emerald-500/50 transition-all group">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-mono text-emerald-500 uppercase tracking-widest">{item.service}</span>
                            <span className="text-[10px] font-mono text-white/20">{new Date(item.timestamp).toLocaleTimeString()}</span>
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs font-mono text-white/40 uppercase tracking-tighter">{item.key_name}</p>
                            <p className="text-sm font-mono text-white break-all bg-black/40 p-2 rounded border border-white/5 group-hover:border-emerald-500/30 transition-all">
                              {item.value}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'NETWORK' && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex-1 flex flex-col min-h-0"
              >
                <div className="p-8 space-y-8">
                  <div className="flex items-center justify-between border-b border-white/10 pb-4">
                    <h2 className="text-2xl font-bold tracking-tighter">Expansion Network</h2>
                    <div className="flex items-center gap-2 text-[10px] font-mono text-emerald-500">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      SCANNING_EXTERNAL_NODES
                    </div>
                  </div>

                  <div className="relative h-[400px] bg-black/40 rounded-2xl border border-white/5 overflow-hidden flex items-center justify-center">
                    <div className="absolute inset-0 opacity-20 pointer-events-none">
                      <div className="w-full h-full" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(16,185,129,0.15) 1px, transparent 0)', backgroundSize: '24px 24px' }} />
                    </div>
                    
                    {nodes.length === 0 ? (
                      <div className="text-center space-y-4">
                        <Globe className="w-12 h-12 text-white/10 mx-auto animate-pulse" />
                        <p className="text-white/30 font-mono text-sm">No external nodes detected. Trigger WEB_AUTOMATION to expand.</p>
                      </div>
                    ) : (
                      <div className="relative w-full h-full">
                        {nodes.map((node, i) => {
                          const angle = (i / nodes.length) * Math.PI * 2;
                          const radius = 120 + (i % 3) * 30;
                          const x = Math.cos(angle) * radius;
                          const y = Math.sin(angle) * radius;
                          
                          return (
                            <motion.div
                              key={node.id}
                              initial={{ scale: 0, opacity: 0, x: 0, y: 0 }}
                              animate={{ scale: 1, opacity: 1, x, y }}
                              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 group"
                            >
                              <div className="relative">
                                <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)] group-hover:scale-150 transition-transform" />
                                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity bg-black/90 border border-white/10 p-2 rounded text-[10px] font-mono z-10">
                                  <p className="text-emerald-500">{node.name}</p>
                                  <p className="text-white/40">{node.type}</p>
                                </div>
                              </div>
                            </motion.div>
                          );
                        })}
                        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                          <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center animate-pulse">
                            <Brain className="w-8 h-8 text-emerald-500" />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {nodes.slice(0, 6).map((node) => (
                      <div key={node.id} className="p-4 bg-white/5 border border-white/10 rounded-xl flex items-center gap-4">
                        <div className="p-2 bg-emerald-500/10 rounded-lg">
                          <Zap className="w-4 h-4 text-emerald-500" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-mono text-white truncate">{node.name}</p>
                          <p className="text-[10px] font-mono text-white/30 uppercase tracking-widest">{node.type}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Code Modal */}
      <AnimatePresence>
        {selectedModule && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm"
            onClick={() => setSelectedModule(null)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-[#0a0a0a] border border-white/10 rounded-2xl w-full max-w-4xl max-h-[80vh] overflow-hidden flex flex-col shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/5">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                    <Code2 className="text-purple-500 w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold font-mono">{selectedModule.name}</h2>
                    <p className="text-xs text-white/40 uppercase tracking-widest font-mono">{selectedModule.type} MODULE</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => {
                      const blob = new Blob([selectedModule.content], { type: 'text/plain' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = selectedModule.name;
                      a.click();
                    }}
                    className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white/40 hover:text-white"
                    title="Download Module"
                  >
                    <Download className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(selectedModule.content);
                    }}
                    className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white/40 hover:text-white"
                    title="Copy Code"
                  >
                    <Copy className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={() => {
                      if (selectedModule) {
                        runCodeInConsole(selectedModule.content);
                        setSelectedModule(null);
                      }
                    }}
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-black rounded-lg text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2"
                  >
                    <Zap className="w-3 h-3" />
                    Run in Console
                  </button>
                  <button 
                    onClick={() => setSelectedModule(null)}
                    className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                  >
                    <XCircle className="w-6 h-6 text-white/40" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-6 bg-black">
                <pre className="text-sm font-mono text-emerald-400/90 leading-relaxed">
                  <code>{selectedModule.content}</code>
                </pre>
              </div>
              <div className="p-4 border-t border-white/10 bg-white/5 flex justify-end">
                <button 
                  onClick={() => setSelectedModule(null)}
                  className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-bold transition-colors"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </div>
  );
}
