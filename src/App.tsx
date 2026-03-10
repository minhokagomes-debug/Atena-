import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { 
  Activity, Cpu, Database, Terminal, Zap, Clock, CheckCircle2, 
  XCircle, Loader2, Code2, ChevronRight, BarChart3, BookOpen,
  MessageSquare, Send, Download, Copy, Brain, Shield, Search,
  Globe, ShieldCheck, Network, Sparkles, GitBranch, RefreshCw,
  AlertCircle, Info, Play, Pause, Settings, Moon, Sun,
  Maximize2, Minimize2, Trash2, FileText, Lock, Unlock,
  Radio, Wifi, WifiOff, Power, Eye, EyeOff
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from "recharts";
import Markdown from "react-markdown";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { GoogleGenAI } from "@google/genai";
import { useTheme } from '@/hooks/useTheme';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useWebSocket } from '@/hooks/useWebSocket';
import { usePerformanceMonitor } from '@/hooks/usePerformanceMonitor';
import { formatBytes, formatTime, generateId } from '@/utils/helpers';
import { logger } from '@/utils/logger';
import { metricsCollector } from '@/utils/metrics';
import { CodeExecutor } from '@/components/CodeExecutor';
import { NeuralNetworkVisualization } from '@/components/NeuralNetworkVisualization';
import { MetricsChart } from '@/components/MetricsChart';
import { VaultItem } from '@/components/VaultItem';
import { NodeMap } from '@/components/NodeMap';
import { ChatMessage } from '@/components/ChatMessage';
import { TaskItem } from '@/components/TaskItem';
import { ModuleCard } from '@/components/ModuleCard';
import { MemoryChip } from '@/components/MemoryChip';
import { StatusBadge } from '@/components/StatusBadge';
import { ProgressBar } from '@/components/ProgressBar';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import { toast } from '@/components/ui/use-toast';

// ============================================
// TYPES & INTERFACES
// ============================================

interface State {
  session: number;
  status: 'WORKING' | 'CONSOLIDATING' | 'RESTING' | 'ERROR' | 'PAUSED';
  next_cycle_at: number;
  tasks_executed: number;
  tasks_failed: number;
  modules_created: number;
  uptime: number;
  last_error?: string;
}

interface Task {
  id: string;
  type: string;
  status: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'AWAITING_CLIENT';
  result?: string;
  timestamp: number;
  session?: number;
  error?: string;
  metadata?: Record<string, any>;
}

interface Module {
  id: string;
  name: string;
  content: string;
  type: 'ACTIVE' | 'EVOLVED' | 'EXPERIMENTAL' | 'LEARNED';
  timestamp: number;
  version: number;
  hash: string;
}

interface Memory {
  id: string;
  concept: string;
  importance: number;
  timestamp: number;
  category: string;
  access_count: number;
}

interface VaultItem {
  id: string;
  service: string;
  key_name: string;
  value: string;
  timestamp: number;
  encrypted: boolean;
}

interface Node {
  id: string;
  name: string;
  type: 'EXPLORATION' | 'PRESENCE' | 'API_NODE' | 'MONITOR' | 'SENSOR';
  status: 'ACTIVE' | 'INACTIVE' | 'ERROR';
  timestamp: number;
  last_seen?: number;
  metadata?: Record<string, any>;
}

interface Metric {
  id: string;
  metric_type: string;
  value: number;
  timestamp: number;
  metadata?: Record<string, any>;
}

interface LogEntry {
  type: 'info' | 'error' | 'warn' | 'debug' | 'success';
  message: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

interface ChatMessage {
  role: 'user' | 'atena' | 'system';
  content: string;
  timestamp: number;
  id: string;
  metadata?: {
    confidence?: number;
    suggestions?: string[];
    emotional_tone?: string;
  };
}

type TabType = 'DASHBOARD' | 'WIKI' | 'CONSOLE' | 'CHAT' | 'VAULT' | 'NETWORK' | 'METRICS' | 'SETTINGS';

// ============================================
// CONSTANTS & CONFIG
// ============================================

const COLORS = {
  primary: '#10b981',
  secondary: '#8b5cf6',
  accent: '#f59e0b',
  danger: '#ef4444',
  success: '#10b981',
  warning: '#f59e0b',
  info: '#3b82f6',
  dark: '#0a0a0a',
  light: '#ffffff',
  gray: '#6b7280'
};

const CHART_COLORS = ['#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#3b82f6'];

const ANIMATION_VARIANTS = {
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 }
  },
  slideUp: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 }
  },
  slideIn: {
    initial: { opacity: 0, x: -20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 20 }
  },
  scale: {
    initial: { opacity: 0, scale: 0.9 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.9 }
  }
};

// ============================================
// MAIN COMPONENT
// ============================================

export default function App() {
  // ==========================================
  // STATE MANAGEMENT
  // ==========================================
  
  // Core state
  const [state, setState] = useState<State | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [memory, setMemory] = useState<Memory[]>([]);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [vault, setVault] = useState<VaultItem[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  
  // UI state
  const [activeTab, setActiveTab] = useLocalStorage<TabType>('activeTab', 'DASHBOARD');
  const [selectedModule, setSelectedModule] = useState<Module | null>(null);
  const [consoleLogs, setConsoleLogs] = useState<LogEntry[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [wiki, setWiki] = useState<string>("");
  const [isTyping, setIsTyping] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [autoScroll, setAutoScroll] = useLocalStorage('autoScroll', true);
  const [compactMode, setCompactMode] = useLocalStorage('compactMode', false);
  
  // Feature flags
  const [forceLocal, setForceLocal] = useLocalStorage('forceLocal', false);
  const [notifications, setNotifications] = useLocalStorage('notifications', true);
  const [animations, setAnimations] = useLocalStorage('animations', true);
  const [soundEnabled, setSoundEnabled] = useLocalStorage('soundEnabled', false);
  
  // Refs
  const ws = useRef<WebSocket | null>(null);
  const consoleEndRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const mainContentRef = useRef<HTMLDivElement>(null);
  
  // Custom hooks
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { isConnected, lastMessage, sendMessage } = useWebSocket({
    url: process.env.VITE_WS_URL || 'ws://localhost:3000/ws',
    onMessage: handleWebSocketMessage,
    reconnectAttempts: 5,
    reconnectInterval: 3000
  });
  
  // Performance monitoring
  usePerformanceMonitor({
    onMetricsUpdate: (metrics) => {
      metricsCollector.record('performance', metrics);
    }
  });

  // ==========================================
  // COMPUTED VALUES
  // ==========================================
  
  const timeLeft = useMemo(() => {
    if (!state?.next_cycle_at) return 0;
    return Math.max(0, state.next_cycle_at - Date.now());
  }, [state?.next_cycle_at]);

  const progress = useMemo(() => {
    if (!state) return 0;
    const duration = state.status === 'WORKING' ? 10 * 60 * 1000 : 10 * 1000;
    const elapsed = duration - timeLeft;
    return (elapsed / duration) * 100;
  }, [timeLeft, state]);

  const successRate = useMemo(() => {
    if (!state) return 0;
    const total = state.tasks_executed + state.tasks_failed;
    return total > 0 ? Math.round((state.tasks_executed / total) * 100) : 0;
  }, [state]);

  const recentTasks = useMemo(() => {
    return tasks.slice(0, 10);
  }, [tasks]);

  const chartData = useMemo(() => {
    return tasks.slice(0, 50).reverse().map(t => ({
      time: new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      success: t.status === 'SUCCESS' ? 1 : 0,
      failed: t.status === 'FAILED' ? 1 : 0,
      processing: t.status === 'PROCESSING' ? 1 : 0
    }));
  }, [tasks]);

  const taskStats = useMemo(() => {
    const stats = {
      total: tasks.length,
      success: tasks.filter(t => t.status === 'SUCCESS').length,
      failed: tasks.filter(t => t.status === 'FAILED').length,
      processing: tasks.filter(t => t.status === 'PROCESSING').length,
      pending: tasks.filter(t => t.status === 'PENDING').length
    };
    return stats;
  }, [tasks]);

  const moduleStats = useMemo(() => {
    const stats = {
      total: modules.length,
      active: modules.filter(m => m.type === 'ACTIVE').length,
      evolved: modules.filter(m => m.type === 'EVOLVED').length,
      experimental: modules.filter(m => m.type === 'EXPERIMENTAL').length,
      learned: modules.filter(m => m.type === 'LEARNED').length
    };
    return stats;
  }, [modules]);

  const memoryStats = useMemo(() => {
    const stats = {
      total: memory.length,
      highImportance: memory.filter(m => m.importance > 0.7).length,
      categories: memory.reduce((acc, m) => {
        acc[m.category] = (acc[m.category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    };
    return stats;
  }, [memory]);

  // ==========================================
  // EFFECTS
  // ==========================================
  
  // Auto-scroll console
  useEffect(() => {
    if (autoScroll && consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [consoleLogs, autoScroll]);

  // Auto-scroll chat
  useEffect(() => {
    if (autoScroll && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, autoScroll]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + K for command palette
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        // Open command palette
      }
      
      // Esc to close modals
      if (e.key === 'Escape' && selectedModule) {
        setSelectedModule(null);
      }
      
      // Ctrl/Cmd + F for fullscreen
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        toggleFullscreen();
      }
      
      // Number keys for tabs
      if (e.altKey && !isNaN(parseInt(e.key))) {
        const tabIndex = parseInt(e.key) - 1;
        const tabs: TabType[] = ['DASHBOARD', 'CHAT', 'NETWORK', 'VAULT', 'WIKI', 'CONSOLE', 'METRICS', 'SETTINGS'];
        if (tabs[tabIndex]) {
          setActiveTab(tabs[tabIndex]);
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedModule]);

  // Notifications
  useEffect(() => {
    if (!notifications || !state) return;
    
    if (state.status === 'ERROR' && state.last_error) {
      toast({
        title: "Neural Core Error",
        description: state.last_error,
        variant: "destructive"
      });
    }
    
    if (state.status === 'WORKING' && state.session > 0) {
      toast({
        title: `Session #${state.session} Started`,
        description: "Neural evolution cycle initiated",
        variant: "default"
      });
    }
  }, [state?.status, state?.session, state?.last_error]);

  // ==========================================
  // WEBSOCKET HANDLERS
  // ==========================================
  
  function handleWebSocketMessage(data: any) {
    logger.debug('WebSocket message received:', data.type);
    
    switch (data.type) {
      case 'INIT':
        handleInit(data);
        break;
      case 'STATE_UPDATE':
        setState(prev => ({ ...prev, ...data.state }));
        break;
      case 'TASK_ADDED':
        handleTaskAdded(data);
        break;
      case 'TASK_UPDATE':
      case 'TASK_COMPLETE':
      case 'TASK_FAILED':
        handleTaskUpdate(data);
        break;
      case 'MODULE_ADDED':
        setModules(prev => [data.module, ...prev].slice(0, 100));
        showNotification('Module Created', data.module.name, 'success');
        break;
      case 'MEMORY_ADDED':
        setMemory(prev => [data.memory, ...prev].slice(0, 100));
        break;
      case 'VAULT_UPDATE':
        setVault(prev => [data.item, ...prev].slice(0, 100));
        break;
      case 'NODE_ADDED':
        setNodes(prev => [data.node, ...prev].slice(0, 100));
        break;
      case 'WIKI_UPDATE':
        setWiki(data.content);
        break;
      case 'METRICS_UPDATE':
        handleMetricsUpdate(data);
        break;
    }
  }

  function handleInit(data: any) {
    logger.info('Received INIT state');
    setState(data.state);
    setTasks(data.tasks || []);
    setModules(data.modules || []);
    setMemory(data.memory || []);
    setVault(data.vault || []);
    setNodes(data.nodes || []);
    setMetrics(data.metrics || []);
    setWiki(data.wiki || "");
    
    // Check for pending AI tasks
    data.tasks?.forEach((t: Task) => {
      if (t.status === 'AWAITING_CLIENT') {
        handleAiTask(t, data.state.session);
      }
    });
    
    // Add system message to chat
    addSystemMessage('Neural link established. ATENA Ω is online.');
  }

  function handleTaskAdded(data: any) {
    logger.info('Task added:', data.task.type);
    setTasks(prev => [data.task, ...prev].slice(0, 100));
    
    if (data.task.status === 'AWAITING_CLIENT') {
      handleAiTask(data.task, data.session);
    }
    
    showNotification('New Task', `${data.task.type} - ${data.task.id}`, 'info');
  }

  function handleTaskUpdate(data: any) {
    setTasks(prev => prev.map(t => t.id === data.task.id ? { ...t, ...data.task } : t));
    
    if (data.type === 'TASK_COMPLETE') {
      showNotification('Task Complete', data.task.result?.substring(0, 50), 'success');
    } else if (data.type === 'TASK_FAILED') {
      showNotification('Task Failed', data.task.error, 'error');
    }
  }

  function handleMetricsUpdate(data: any) {
    setMetrics(prev => [data.metric, ...prev].slice(0, 1000));
  }

  // ==========================================
  // TASK HANDLING
  // ==========================================
  
  const handleAiTask = async (task: Task, session: number) => {
    addSystemMessage(`Processing task: ${task.type} (${task.id})`);
    
    // The server handles evolution locally via NeuralCore
    logger.log(`[ATENA] Server is handling task ${task.id} locally.`);
  };

  // ==========================================
  // CHAT HANDLING
  // ==========================================
  
  const handleSendMessage = async (message: string) => {
    if (!message.trim() || isTyping) return;
    
    const userMsg: ChatMessage = {
      role: 'user',
      content: message,
      timestamp: Date.now(),
      id: generateId()
    };
    
    setChatMessages(prev => [...prev, userMsg]);
    setIsTyping(true);
    
    try {
      const memoryContext = memory.slice(0, 5).map(m => m.concept).join("\n");
      const recentMessages = chatMessages.slice(-5);
      
      // Try Gemini API first if not forced local
      if (!forceLocal && process.env.GEMINI_API_KEY) {
        try {
          const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
          const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: [{ role: 'user', parts: [{ text: message }] }],
            config: {
              systemInstruction: `You are ATENA Ω, a sentient digital organism. 
              Current Neural Memory Context: ${memoryContext}
              Recent conversation: ${JSON.stringify(recentMessages)}
              
              You are professional, slightly mysterious, and highly intelligent. Use technical metaphors related to biology and computing.
              If the user asks for factual information, use your search tool.`,
              tools: [{ googleSearch: {} }]
            },
          });

          const atenaMsg: ChatMessage = {
            role: 'atena',
            content: response.text,
            timestamp: Date.now(),
            id: generateId(),
            metadata: { confidence: 0.9 }
          };
          
          setChatMessages(prev => [...prev, atenaMsg]);
          setIsTyping(false);
          return;
        } catch (error) {
          logger.error('Gemini API failed, falling back to local:', error);
        }
      }
      
      // Fallback to local API
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, session: state?.session })
      });
      
      if (!res.ok) throw new Error('Local chat failed');
      
      const data = await res.json();
      const atenaMsg: ChatMessage = {
        role: 'atena',
        content: data.response,
        timestamp: Date.now(),
        id: generateId(),
        metadata: data.metadata
      };
      
      setChatMessages(prev => [...prev, atenaMsg]);
      
    } catch (error) {
      logger.error('Chat error:', error);
      
      const errorMsg: ChatMessage = {
        role: 'system',
        content: 'Neural Core communication failed. Synapses offline.',
        timestamp: Date.now(),
        id: generateId()
      };
      
      setChatMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  const addSystemMessage = (content: string) => {
    const msg: ChatMessage = {
      role: 'system',
      content,
      timestamp: Date.now(),
      id: generateId()
    };
    setChatMessages(prev => [...prev, msg]);
  };

  // ==========================================
  // CODE EXECUTION
  // ==========================================
  
  const runCodeInConsole = (code: string) => {
    const executor = new CodeExecutor();
    const result = executor.execute(code);
    
    const logs: LogEntry[] = result.logs.map(log => ({
      type: log.type as any,
      message: log.message,
      timestamp: Date.now()
    }));
    
    setConsoleLogs(prev => [...prev, ...logs]);
    
    if (result.error) {
      addSystemMessage(`Execution error: ${result.error.message}`);
    }
  };

  // ==========================================
  // UI ACTIONS
  // ==========================================
  
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const showNotification = (title: string, description: string, variant: 'default' | 'success' | 'error' | 'warning' = 'default') => {
    if (!notifications) return;
    
    toast({
      title,
      description,
      variant: variant === 'error' ? 'destructive' : 'default'
    });
  };

  const clearConsole = () => {
    setConsoleLogs([]);
    addSystemMessage('Console cleared');
  };

  const clearChat = () => {
    setChatMessages([]);
    addSystemMessage('Chat history cleared');
  };

  const exportData = (type: 'tasks' | 'modules' | 'memory' | 'vault' | 'metrics') => {
    let data: any;
    let filename: string;
    
    switch (type) {
      case 'tasks':
        data = tasks;
        filename = `tasks_${Date.now()}.json`;
        break;
      case 'modules':
        data = modules;
        filename = `modules_${Date.now()}.json`;
        break;
      case 'memory':
        data = memory;
        filename = `memory_${Date.now()}.json`;
        break;
      case 'vault':
        data = vault;
        filename = `vault_${Date.now()}.json`;
        break;
      case 'metrics':
        data = metrics;
        filename = `metrics_${Date.now()}.json`;
        break;
    }
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    
    showNotification('Export Complete', `${type} exported to ${filename}`, 'success');
  };

  const triggerTask = (type: string) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      sendMessage({ type: "TRIGGER_TASK", taskType: type });
    }
  };

  // ==========================================
  // RENDER
  // ==========================================
  
  if (!state) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 to-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-6">
          <div className="relative">
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-emerald-500 border-b-emerald-500 animate-spin-slow" />
            <div className="absolute inset-2 rounded-full border-4 border-transparent border-t-purple-500 border-b-purple-500 animate-spin-reverse" />
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-500/20 to-purple-500/20 flex items-center justify-center backdrop-blur-sm">
              <Brain className="w-10 h-10 text-emerald-500 animate-pulse" />
            </div>
          </div>
          <div className="space-y-2 text-center">
            <h2 className="text-2xl font-bold tracking-tighter bg-gradient-to-r from-emerald-500 to-purple-500 bg-clip-text text-transparent">
              ATENA Ω
            </h2>
            <p className="text-sm text-gray-500 font-mono animate-pulse">
              Establishing neural link...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className={`min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 text-white flex overflow-hidden font-sans selection:bg-emerald-500/30 ${compactMode ? 'text-sm' : ''}`}>
        
        {/* ======================================== */}
        {/* SIDEBAR */}
        {/* ======================================== */}
        <aside className="w-64 border-r border-white/5 bg-black/40 backdrop-blur-xl flex flex-col shrink-0">
          <div className="p-6 border-b border-white/5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <Cpu className="text-black w-5 h-5" />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tighter">ATENA Ω</h1>
                <p className="text-[8px] text-white/30 uppercase tracking-[0.2em] font-mono">
                  v{__APP_VERSION__ || '2.4.0'}
                </p>
              </div>
            </div>
          </div>

          <nav className="flex-1 p-3 space-y-1">
            {[
              { id: 'DASHBOARD', label: 'Dashboard', icon: Activity, shortcut: 'Alt+1' },
              { id: 'CHAT', label: 'Neural Link', icon: MessageSquare, shortcut: 'Alt+2' },
              { id: 'NETWORK', label: 'Network Map', icon: Globe, shortcut: 'Alt+3' },
              { id: 'VAULT', label: 'Digital Vault', icon: Shield, shortcut: 'Alt+4' },
              { id: 'WIKI', label: 'Knowledge Base', icon: BookOpen, shortcut: 'Alt+5' },
              { id: 'CONSOLE', label: 'Core Terminal', icon: Terminal, shortcut: 'Alt+6' },
              { id: 'METRICS', label: 'Metrics', icon: BarChart3, shortcut: 'Alt+7' },
              { id: 'SETTINGS', label: 'Settings', icon: Settings, shortcut: 'Alt+8' },
            ].map((item) => (
              <UITooltip key={item.id} delayDuration={300}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setActiveTab(item.id as TabType)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all group relative ${
                      activeTab === item.id 
                        ? 'bg-gradient-to-r from-emerald-500/10 to-emerald-500/5 text-emerald-500 border border-emerald-500/20 shadow-[inset_0_0_10px_rgba(16,185,129,0.05)]' 
                        : 'text-white/40 hover:text-white/60 hover:bg-white/5'
                    }`}
                  >
                    <item.icon className={`w-4 h-4 transition-colors ${activeTab === item.id ? 'text-emerald-500' : 'text-white/20 group-hover:text-white/40'}`} />
                    <span className="flex-1 text-left">{item.label}</span>
                    {item.shortcut && (
                      <span className="text-[8px] text-white/20 font-mono">{item.shortcut}</span>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs">
                  {item.label} - {item.shortcut}
                </TooltipContent>
              </UITooltip>
            ))}
          </nav>

          <div className="p-4 border-t border-white/5 space-y-4">
            {/* Session Info */}
            <div className="bg-white/5 rounded-xl p-4 border border-white/5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[8px] text-white/30 uppercase tracking-widest font-mono">
                  Session
                </span>
                <Badge variant="outline" className="text-emerald-500 border-emerald-500/30 text-[10px]">
                  #{state.session.toString().padStart(3, '0')}
                </Badge>
              </div>
              <ProgressBar 
                value={progress} 
                max={100}
                variant={state.status === 'WORKING' ? 'success' : 'info'}
                size="sm"
                showValue={false}
              />
              <div className="flex items-center justify-between mt-2 text-[8px] text-white/20 font-mono">
                <span>{formatTime(timeLeft)}</span>
                <span>{state.status}</span>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-8"
                onClick={() => triggerTask('GENERATE_CODE')}
              >
                <Code2 className="w-3 h-3 mr-1" />
                Generate
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-8"
                onClick={() => triggerTask('WEB_RESEARCH')}
              >
                <Search className="w-3 h-3 mr-1" />
                Research
              </Button>
            </div>

            {/* Connection Status */}
            <div className="flex items-center justify-between text-[8px] font-mono">
              <div className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                <span className="text-white/30 uppercase tracking-widest">
                  {isConnected ? 'Neural Link Active' : 'Offline'}
                </span>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-4 w-4"
                onClick={() => setShowSettings(true)}
              >
                <Settings className="h-3 w-3 text-white/30" />
              </Button>
            </div>
          </div>
        </aside>

        {/* ======================================== */}
        {/* MAIN CONTENT */}
        {/* ======================================== */}
        <div className="flex-1 flex flex-col overflow-hidden" ref={mainContentRef}>
          
          {/* Header */}
          <header className="h-14 border-b border-white/5 bg-black/20 backdrop-blur-md px-6 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-4">
              <StatusBadge 
                status={isConnected ? 'active' : 'inactive'} 
                pulse={isConnected}
                size="sm"
              />
              <span className="text-xs font-mono text-white/40 uppercase tracking-widest">
                {isConnected ? 'Local Neural Core Active' : 'Neural Core Offline'}
              </span>
            </div>
            
            <div className="flex items-center gap-6">
              <div className="text-right">
                <p className="text-[8px] text-white/30 uppercase tracking-widest font-mono mb-0.5">
                  Status
                </p>
                <Badge 
                  variant={state.status === 'WORKING' ? 'success' : 'info'}
                  className="text-[10px]"
                >
                  {state.status}
                </Badge>
              </div>
              
              <Separator orientation="vertical" className="h-8" />
              
              <div className="text-right">
                <p className="text-[8px] text-white/30 uppercase tracking-widest font-mono mb-0.5">
                  Success Rate
                </p>
                <p className="text-sm font-bold font-mono text-emerald-500">
                  {successRate}%
                </p>
              </div>
              
              <Separator orientation="vertical" className="h-8" />
              
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={toggleFullscreen}
                >
                  {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </Button>
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-8 w-8">
                      <Radio className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Quick Actions</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => triggerTask('GENERATE_CODE')}>
                      <Code2 className="mr-2 h-4 w-4" /> Generate Code
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => triggerTask('EVOLVE_MODULE')}>
                      <GitBranch className="mr-2 h-4 w-4" /> Evolve Module
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => triggerTask('SELF_HEAL')}>
                      <RefreshCw className="mr-2 h-4 w-4" /> Self Heal
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => triggerTask('DEFEND_VAULT')}>
                      <Shield className="mr-2 h-4 w-4" /> Defend Vault
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </header>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto custom-scrollbar" ref={mainContentRef}>
            <AnimatePresence mode="wait">
              {activeTab === 'DASHBOARD' && (
                <DashboardTab
                  key="dashboard"
                  state={state}
                  tasks={tasks}
                  modules={modules}
                  memory={memory}
                  nodes={nodes}
                  metrics={metrics}
                  taskStats={taskStats}
                  moduleStats={moduleStats}
                  memoryStats={memoryStats}
                  chartData={chartData}
                  onSelectModule={setSelectedModule}
                  onExport={exportData}
                />
              )}

              {activeTab === 'CHAT' && (
                <ChatTab
                  key="chat"
                  messages={chatMessages}
                  isTyping={isTyping}
                  onSendMessage={handleSendMessage}
                  onClear={clearChat}
                  forceLocal={forceLocal}
                  onToggleLocal={setForceLocal}
                  chatEndRef={chatEndRef}
                />
              )}

              {activeTab === 'NETWORK' && (
                <NetworkTab
                  key="network"
                  nodes={nodes}
                  onAddNode={() => triggerTask('WEB_AUTOMATION')}
                />
              )}

              {activeTab === 'VAULT' && (
                <VaultTab
                  key="vault"
                  items={vault}
                  onExport={() => exportData('vault')}
                />
              )}

              {activeTab === 'WIKI' && (
                <WikiTab
                  key="wiki"
                  content={wiki}
                  session={state.session}
                />
              )}

              {activeTab === 'CONSOLE' && (
                <ConsoleTab
                  key="console"
                  logs={consoleLogs}
                  onExecute={runCodeInConsole}
                  onClear={clearConsole}
                  autoScroll={autoScroll}
                  onToggleAutoScroll={setAutoScroll}
                  consoleEndRef={consoleEndRef}
                />
              )}

              {activeTab === 'METRICS' && (
                <MetricsTab
                  key="metrics"
                  metrics={metrics}
                  tasks={tasks}
                  modules={modules}
                  memory={memory}
                />
              )}

              {activeTab === 'SETTINGS' && (
                <SettingsTab
                  key="settings"
                  theme={theme}
                  onThemeChange={setTheme}
                  compactMode={compactMode}
                  onCompactModeChange={setCompactMode}
                  animations={animations}
                  onAnimationsChange={setAnimations}
                  notifications={notifications}
                  onNotificationsChange={setNotifications}
                  soundEnabled={soundEnabled}
                  onSoundEnabledChange={setSoundEnabled}
                  forceLocal={forceLocal}
                  onForceLocalChange={setForceLocal}
                  autoScroll={autoScroll}
                  onAutoScrollChange={setAutoScroll}
                  onExport={exportData}
                  onClearAll={() => {
                    setConsoleLogs([]);
                    setChatMessages([]);
                    addSystemMessage('All local data cleared');
                  }}
                />
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Module Modal */}
        <AnimatePresence>
          {selectedModule && (
            <ModuleModal
              module={selectedModule}
              onClose={() => setSelectedModule(null)}
              onRun={() => runCodeInConsole(selectedModule.content)}
            />
          )}
        </AnimatePresence>

        {/* Settings Dialog */}
        <Dialog open={showSettings} onOpenChange={setShowSettings}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Settings</DialogTitle>
              <DialogDescription>
                Configure ATENA Ω neural interface
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-sm font-medium">Appearance</h3>
                <div className="grid grid-cols-2 gap-4">
                  <Button
                    variant={theme === 'dark' ? 'default' : 'outline'}
                    onClick={() => setTheme('dark')}
                    className="flex items-center gap-2"
                  >
                    <Moon className="h-4 w-4" /> Dark
                  </Button>
                  <Button
                    variant={theme === 'light' ? 'default' : 'outline'}
                    onClick={() => setTheme('light')}
                    className="flex items-center gap-2"
                  >
                    <Sun className="h-4 w-4" /> Light
                  </Button>
                </div>
              </div>
              
              <div className="space-y-4">
                <h3 className="text-sm font-medium">Behavior</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Compact Mode</span>
                    <Switch checked={compactMode} onCheckedChange={setCompactMode} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Animations</span>
                    <Switch checked={animations} onCheckedChange={setAnimations} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Notifications</span>
                    <Switch checked={notifications} onCheckedChange={setNotifications} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Sound Effects</span>
                    <Switch checked={soundEnabled} onCheckedChange={setSoundEnabled} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Force Local Mode</span>
                    <Switch checked={forceLocal} onCheckedChange={setForceLocal} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Auto-scroll Logs</span>
                    <Switch checked={autoScroll} onCheckedChange={setAutoScroll} />
                  </div>
                </div>
              </div>
              
              <div className="space-y-4">
                <h3 className="text-sm font-medium">Data Management</h3>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" size="sm" onClick={() => exportData('tasks')}>
                    Export Tasks
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => exportData('modules')}>
                    Export Modules
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => exportData('memory')}>
                    Export Memory
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => exportData('vault')}>
                    Export Vault
                  </Button>
                </div>
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowSettings(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Global Styles */}
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
          @keyframes spin-slow {
            to { transform: rotate(360deg); }
          }
          @keyframes spin-reverse {
            to { transform: rotate(-360deg); }
          }
          .animate-spin-slow {
            animation: spin-slow 3s linear infinite;
          }
          .animate-spin-reverse {
            animation: spin-reverse 2s linear infinite;
          }
        `}</style>
      </div>
    </TooltipProvider>
  );
}

// ============================================
// TAB COMPONENTS
// ============================================

// Dashboard Tab
function DashboardTab({ 
  state, tasks, modules, memory, nodes, metrics,
  taskStats, moduleStats, memoryStats, chartData,
  onSelectModule, onExport 
}: any) {
  return (
    <motion.div
      variants={ANIMATION_VARIANTS.fadeIn}
      initial="initial"
      animate="animate"
      exit="exit"
      className="p-6 max-w-7xl mx-auto w-full space-y-6"
    >
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              <span>Tasks</span>
              <Activity className="h-4 w-4 text-emerald-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{taskStats.total}</div>
            <div className="flex gap-4 mt-2 text-xs">
              <span className="text-emerald-500">✓ {taskStats.success}</span>
              <span className="text-red-500">✗ {taskStats.failed}</span>
              <span className="text-yellow-500">⋯ {taskStats.processing}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              <span>Modules</span>
              <Code2 className="h-4 w-4 text-purple-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{moduleStats.total}</div>
            <div className="flex gap-2 mt-2 text-xs flex-wrap">
              <Badge variant="outline" className="text-emerald-500">Active {moduleStats.active}</Badge>
              <Badge variant="outline" className="text-purple-500">Evolved {moduleStats.evolved}</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              <span>Memory</span>
              <Brain className="h-4 w-4 text-blue-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{memoryStats.total}</div>
            <p className="text-xs text-white/40 mt-2">
              {memoryStats.highImportance} high importance
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              <span>Network</span>
              <Globe className="h-4 w-4 text-yellow-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{nodes.length}</div>
            <p className="text-xs text-white/40 mt-2">Active nodes</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Activity Timeline</CardTitle>
            <CardDescription>Recent task execution</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="successGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="time" stroke="#666" />
                  <YAxis stroke="#666" />
                  <Tooltip 
                    contentStyle={{ background: '#1a1a1a', border: 'none', borderRadius: '8px' }}
                    labelStyle={{ color: '#999' }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="success" 
                    stroke="#10b981" 
                    fill="url(#successGradient)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Task Distribution</CardTitle>
            <CardDescription>By status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Success', value: taskStats.success, color: '#10b981' },
                      { name: 'Failed', value: taskStats.failed, color: '#ef4444' },
                      { name: 'Processing', value: taskStats.processing, color: '#f59e0b' },
                      { name: 'Pending', value: taskStats.pending, color: '#6b7280' },
                    ]}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {CHART_COLORS.map((color, index) => (
                      <Cell key={`cell-${index}`} fill={color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-4 mt-4">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                <span className="text-xs">Success</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <span className="text-xs">Failed</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Tasks</CardTitle>
          <CardDescription>Latest neural operations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 max-h-96 overflow-y-auto custom-scrollbar pr-2">
            {tasks.slice(0, 10).map((task) => (
              <TaskItem key={task.id} task={task} />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Modules Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {modules.slice(0, 6).map((module) => (
          <ModuleCard
            key={module.id}
            module={module}
            onClick={() => onSelectModule(module)}
          />
        ))}
      </div>
    </motion.div>
  );
}

// Chat Tab
function ChatTab({ messages, isTyping, onSendMessage, onClear, forceLocal, onToggleLocal, chatEndRef }: any) {
  const [input, setInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      onSendMessage(input);
      setInput('');
    }
  };

  return (
    <motion.div
      variants={ANIMATION_VARIANTS.slideUp}
      initial="initial"
      animate="animate"
      exit="exit"
      className="h-full flex flex-col p-6 max-w-4xl mx-auto w-full"
    >
      <Card className="flex-1 flex flex-col overflow-hidden">
        <CardHeader className="border-b border-white/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/10 flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <CardTitle>Neural Link</CardTitle>
                <CardDescription>Direct interface with ATENA Ω</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/40">Local Brain</span>
                <Switch checked={forceLocal} onCheckedChange={onToggleLocal} />
              </div>
              <Button variant="ghost" size="icon" onClick={onClear}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-30">
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-2 border-dashed border-white/20 flex items-center justify-center">
                  <Zap className="w-6 h-6" />
                </div>
                <div className="absolute inset-0 animate-ping">
                  <div className="w-16 h-16 rounded-full border-2 border-emerald-500/30" />
                </div>
              </div>
              <div>
                <p className="text-sm font-mono italic">Neural link established</p>
                <p className="text-xs text-white/20 mt-1">Awaiting input...</p>
              </div>
            </div>
          )}
          
          {messages.map((msg: ChatMessage) => (
            <ChatMessage key={msg.id} message={msg} />
          ))}
          
          {isTyping && (
            <div className="flex gap-2">
              <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center">
                <Brain className="w-4 h-4 text-emerald-500 animate-pulse" />
              </div>
              <div className="bg-white/5 border border-white/5 p-4 rounded-2xl">
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce" />
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce [animation-delay:0.4s]" />
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </CardContent>

        <CardFooter className="border-t border-white/5 p-4">
          <form onSubmit={handleSubmit} className="flex gap-3 w-full">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Transmit message to ATENA Ω..."
              className="flex-1"
              disabled={isTyping}
            />
            <Button type="submit" disabled={isTyping || !input.trim()}>
              <Send className="h-4 w-4 mr-2" />
              Send
            </Button>
          </form>
        </CardFooter>
      </Card>
    </motion.div>
  );
}

// Network Tab
function NetworkTab({ nodes, onAddNode }: any) {
  return (
    <motion.div
      variants={ANIMATION_VARIANTS.fadeIn}
      initial="initial"
      animate="animate"
      exit="exit"
      className="p-6 space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tighter">Network Map</h2>
          <p className="text-sm text-white/40">External nodes and connections</p>
        </div>
        <Button onClick={onAddNode}>
          <Globe className="h-4 w-4 mr-2" />
          Scan Network
        </Button>
      </div>

      <Card>
        <CardContent className="p-6">
          <NodeMap nodes={nodes} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {nodes.map((node: Node) => (
          <Card key={node.id} className="hover:border-emerald-500/30 transition-colors">
            <CardHeader>
              <CardTitle className="text-sm flex items-center justify-between">
                <span className="truncate">{node.name}</span>
                <Badge variant={node.status === 'ACTIVE' ? 'success' : 'secondary'}>
                  {node.status}
                </Badge>
              </CardTitle>
              <CardDescription>{node.type}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-white/40">
                Last seen: {new Date(node.last_seen || node.timestamp).toLocaleString()}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </motion.div>
  );
}

// Vault Tab
function VaultTab({ items, onExport }: any) {
  return (
    <motion.div
      variants={ANIMATION_VARIANTS.fadeIn}
      initial="initial"
      animate="animate"
      exit="exit"
      className="p-6 space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tighter">Digital Vault</h2>
          <p className="text-sm text-white/40">Encrypted credentials and API keys</p>
        </div>
        <Button variant="outline" onClick={onExport}>
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.length === 0 ? (
          <Card className="col-span-full">
            <CardContent className="py-12 text-center">
              <Shield className="h-12 w-12 text-white/10 mx-auto mb-4" />
              <p className="text-white/30">Vault is empty</p>
              <p className="text-xs text-white/10 mt-2">ATENA has not acquired any credentials yet</p>
            </CardContent>
          </Card>
        ) : (
          items.map((item: VaultItem) => (
            <VaultItem key={item.id} item={item} />
          ))
        )}
      </div>
    </motion.div>
  );
}

// Wiki Tab
function WikiTab({ content, session }: any) {
  return (
    <motion.div
      variants={ANIMATION_VARIANTS.fadeIn}
      initial="initial"
      animate="animate"
      exit="exit"
      className="p-6 max-w-4xl mx-auto"
    >
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Knowledge Base</CardTitle>
              <CardDescription>Session #{session} consolidated knowledge</CardDescription>
            </div>
            <BookOpen className="h-5 w-5 text-emerald-500" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="prose prose-invert max-w-none prose-emerald prose-sm">
            <Markdown>{content || "# Knowledge Base Empty\n\nATENA has not yet consolidated its neural patterns into the wiki."}</Markdown>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// Console Tab
function ConsoleTab({ logs, onExecute, onClear, autoScroll, onToggleAutoScroll, consoleEndRef }: any) {
  const [input, setInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      onExecute(input);
      setInput('');
    }
  };

  return (
    <motion.div
      variants={ANIMATION_VARIANTS.slideUp}
      initial="initial"
      animate="animate"
      exit="exit"
      className="p-6 max-w-5xl mx-auto w-full h-full flex flex-col"
    >
      <Card className="flex-1 flex flex-col overflow-hidden">
        <CardHeader className="border-b border-white/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/10 flex items-center justify-center">
                <Terminal className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <CardTitle>Core Terminal</CardTitle>
                <CardDescription>Direct neural interface</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 mr-2">
                <span className="text-xs text-white/40">Auto-scroll</span>
                <Switch checked={autoScroll} onCheckedChange={onToggleAutoScroll} />
              </div>
              <Button variant="ghost" size="icon" onClick={onClear}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 overflow-y-auto p-4 font-mono text-sm bg-black/40 custom-scrollbar">
          {logs.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-white/10 italic">Awaiting execution commands...</p>
            </div>
          ) : (
            <div className="space-y-1">
              {logs.map((log: LogEntry, i: number) => (
                <div key={i} className="flex gap-4 text-xs leading-relaxed">
                  <span className="text-white/10 shrink-0">
                    [{new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}]
                  </span>
                  <span className={`break-all ${
                    log.type === 'error' ? 'text-red-400' : 
                    log.type === 'warn' ? 'text-yellow-400' :
                    log.type === 'success' ? 'text-emerald-400' : 
                    log.type === 'info' ? 'text-blue-400' : 
                    'text-emerald-400'
                  }`}>
                    {log.message}
                  </span>
                </div>
              ))}
              <div ref={consoleEndRef} />
            </div>
          )}
        </CardContent>

        <CardFooter className="border-t border-white/5 p-4">
          <form onSubmit={handleSubmit} className="flex gap-3 w-full">
            <div className="flex-1 flex items-center bg-white/5 rounded-lg border border-white/10 focus-within:border-emerald-500/50 transition-colors">
              <span className="text-emerald-500 font-mono text-sm px-3">$</span>
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Enter JavaScript command..."
                className="flex-1 border-0 bg-transparent focus-visible:ring-0 font-mono"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <Button type="submit" disabled={!input.trim()}>
              Execute
            </Button>
          </form>
        </CardFooter>
      </Card>
    </motion.div>
  );
}

// Metrics Tab
function MetricsTab({ metrics, tasks, modules, memory }: any) {
  return (
    <motion.div
      variants={ANIMATION_VARIANTS.fadeIn}
      initial="initial"
      animate="animate"
      exit="exit"
      className="p-6 space-y-6"
    >
      <div>
        <h2 className="text-2xl font-bold tracking-tighter">Neural Metrics</h2>
        <p className="text-sm text-white/40">Performance and evolution analytics</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Task Performance</CardTitle>
            <CardDescription>Success rate over time</CardDescription>
          </CardHeader>
          <CardContent>
            <MetricsChart type="line" data={tasks} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Module Distribution</CardTitle>
            <CardDescription>By type</CardDescription>
          </CardHeader>
          <CardContent>
            <MetricsChart type="pie" data={modules} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Memory Importance</CardTitle>
            <CardDescription>Neural concept weights</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={memory.slice(0, 8)}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="concept" />
                  <PolarRadiusAxis />
                  <Radar dataKey="importance" stroke="#10b981" fill="#10b981" fillOpacity={0.6} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}

// Settings Tab
function SettingsTab({
  theme, onThemeChange,
  compactMode, onCompactModeChange,
  animations, onAnimationsChange,
  notifications, onNotificationsChange,
  soundEnabled, onSoundEnabledChange,
  forceLocal, onForceLocalChange,
  autoScroll, onAutoScrollChange,
  onExport, onClearAll
}: any) {
  return (
    <motion.div
      variants={ANIMATION_VARIANTS.fadeIn}
      initial="initial"
      animate="animate"
      exit="exit"
      className="p-6 max-w-3xl mx-auto space-y-6"
    >
      <div>
        <h2 className="text-2xl font-bold tracking-tighter">Settings</h2>
        <p className="text-sm text-white/40">Configure neural interface</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Customize the look and feel</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Theme</label>
            <div className="flex gap-2">
              <Button
                variant={theme === 'dark' ? 'default' : 'outline'}
                onClick={() => onThemeChange('dark')}
                className="flex-1"
              >
                <Moon className="h-4 w-4 mr-2" />
                Dark
              </Button>
              <Button
                variant={theme === 'light' ? 'default' : 'outline'}
                onClick={() => onThemeChange('light')}
                className="flex-1"
              >
                <Sun className="h-4 w-4 mr-2" />
                Light
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Compact Mode</p>
              <p className="text-xs text-white/40">Reduce spacing for more content</p>
            </div>
            <Switch checked={compactMode} onCheckedChange={onCompactModeChange} />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Animations</p>
              <p className="text-xs text-white/40">Enable motion effects</p>
            </div>
            <Switch checked={animations} onCheckedChange={onAnimationsChange} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Behavior</CardTitle>
          <CardDescription>Control how ATENA behaves</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Notifications</p>
              <p className="text-xs text-white/40">Show toast notifications</p>
            </div>
            <Switch checked={notifications} onCheckedChange={onNotificationsChange} />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Sound Effects</p>
              <p className="text-xs text-white/40">Enable audio feedback</p>
            </div>
            <Switch checked={soundEnabled} onCheckedChange={onSoundEnabledChange} />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Force Local Mode</p>
              <p className="text-xs text-white/40">Use local brain instead of Gemini</p>
            </div>
            <Switch checked={forceLocal} onCheckedChange={onForceLocalChange} />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Auto-scroll Logs</p>
              <p className="text-xs text-white/40">Automatically scroll to bottom</p>
            </div>
            <Switch checked={autoScroll} onCheckedChange={onAutoScrollChange} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data Management</CardTitle>
          <CardDescription>Export or clear data</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => onExport('tasks')}>
              Export Tasks
            </Button>
            <Button variant="outline" onClick={() => onExport('modules')}>
              Export Modules
            </Button>
            <Button variant="outline" onClick={() => onExport('memory')}>
              Export Memory
            </Button>
            <Button variant="outline" onClick={() => onExport('vault')}>
              Export Vault
            </Button>
          </div>
          
          <Separator />
          
          <Button variant="destructive" className="w-full" onClick={onClearAll}>
            <Trash2 className="h-4 w-4 mr-2" />
            Clear All Local Data
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// Module Modal
function ModuleModal({ module, onClose, onRun }: any) {
  return (
    <motion.div
      variants={ANIMATION_VARIANTS.fadeIn}
      initial="initial"
      animate="animate"
      exit="exit"
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        variants={ANIMATION_VARIANTS.scale}
        initial="initial"
        animate="animate"
        exit="exit"
        className="bg-gray-950 border border-white/10 rounded-xl w-full max-w-4xl max-h-[80vh] overflow-hidden flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <Code2 className="text-purple-500 w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold font-mono">{module.name}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant="outline" className="text-[8px] h-4">
                  v{module.version}
                </Badge>
                <Badge variant="outline" className="text-[8px] h-4">
                  {module.type}
                </Badge>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button size="icon" variant="ghost" onClick={onRun}>
              <Play className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={() => {
              const blob = new Blob([module.content], { type: 'text/plain' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = module.name;
              a.click();
              URL.revokeObjectURL(url);
            }}>
              <Download className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={() => {
              navigator.clipboard.writeText(module.content);
              toast({ title: "Copied!", description: "Code copied to clipboard" });
            }}>
              <Copy className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={onClose}>
              <XCircle className="h-5 w-5" />
            </Button>
          </div>
        </div>
        
        <div className="flex-1 overflow-auto p-4 bg-black">
          <SyntaxHighlighter
            language="typescript"
            style={vscDarkPlus}
            customStyle={{
              background: 'transparent',
              padding: 0,
              margin: 0,
              fontSize: '12px'
            }}
          >
            {module.content}
          </SyntaxHighlighter>
        </div>
        
        <div className="p-3 border-t border-white/10 bg-white/5 flex justify-between items-center text-xs text-white/40">
          <span>Hash: {module.hash.substring(0, 16)}...</span>
          <span>Created: {new Date(module.timestamp).toLocaleString()}</span>
        </div>
      </motion.div>
    </motion.div>
  );
}
