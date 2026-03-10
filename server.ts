import express from "express";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import Database from "better-sqlite3";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { NeuralCore } from "./NeuralCore.js";
import crypto from "crypto";

// ==================== TYPES & INTERFACES ====================
interface State {
  id: number;
  session: number;
  status: 'RESTING' | 'WORKING' | 'CONSOLIDATING' | 'ERROR' | 'PAUSED';
  next_cycle_at: number | null;
  tasks_executed: number;
  tasks_failed: number;
  modules_created: number;
  last_error?: string;
  uptime: number;
}

interface Task {
  id: string;
  type: TaskType;
  status: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED';
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

type TaskType = 
  | 'SEARCH_GITHUB' | 'GENERATE_CODE' | 'EVOLVE_MODULE' 
  | 'WEB_RESEARCH' | 'NEURAL_CONSOLIDATION' | 'LINGUISTIC_TRAINING'
  | 'WEB_AUTOMATION' | 'ACCOUNT_CREATION' | 'API_MANAGEMENT'
  | 'SELF_HEAL' | 'SENSE_EXTERNAL' | 'DEFEND_VAULT'
  | 'LEARN_PATTERN' | 'OPTIMIZE_MEMORY' | 'PRUNE_MODULES';

interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

// ==================== CONFIGURATION ====================
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG = {
  WORK_DURATION: parseInt(process.env.WORK_DURATION || '600000'), // 10 minutes
  CONSOLIDATION_DURATION: parseInt(process.env.CONSOLIDATION_DURATION || '10000'), // 10 seconds
  MAX_CONCURRENT_TASKS: parseInt(process.env.MAX_CONCURRENT_TASKS || '3'),
  TASK_TIMEOUT: parseInt(process.env.TASK_TIMEOUT || '30000'), // 30 seconds
  PORT: parseInt(process.env.PORT || '3000'),
  NODE_ENV: process.env.NODE_ENV || 'development',
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex'),
  MAX_MEMORY_ITEMS: parseInt(process.env.MAX_MEMORY_ITEMS || '1000'),
  AUTO_BACKUP_INTERVAL: parseInt(process.env.AUTO_BACKUP_INTERVAL || '3600000'), // 1 hour
};

// ==================== DIRECTORY STRUCTURE ====================
const FOLDERS = [
  'data', 'logs', 'backups',
  'modules/ativos', 'modules/experimentais', 'modules/aprendidos', 'modules/processando',
  'conhecimento/github', 'conhecimento/wikipedia', 'conhecimento/arxiv', 'conhecimento/processado',
  'evolutions/sucesso', 'evolutions/experimental', 'evolutions/historico', 'evolutions/processando',
  'docs/wiki', 'docs/exemplos', 'docs/tutoriais', 'docs/metricas',
  'backup/codigos', 'backup/estados', 'backup/por_sessao',
  'fila/prioridade_alta', 'fila/prioridade_media', 'fila/prioridade_baixa',
  'resultados/sucesso', 'resultados/falha', 'resultados/parcial',
  'monitoring/metrics', 'monitoring/alerts', 'monitoring/logs'
];

FOLDERS.forEach(folder => {
  const p = path.join(__dirname, folder);
  if (!fs.existsSync(p)) {
    fs.mkdirSync(p, { recursive: true });
  }
});

// ==================== DATABASE SETUP ====================
class DatabaseManager {
  private db: Database.Database;
  private static instance: DatabaseManager;

  private constructor() {
    this.db = new Database(path.join(__dirname, 'data/atena.db'));
    this.initialize();
  }

  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  private initialize() {
    // Enable WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');
    
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        session INTEGER DEFAULT 0,
        status TEXT DEFAULT 'RESTING',
        next_cycle_at INTEGER,
        tasks_executed INTEGER DEFAULT 0,
        tasks_failed INTEGER DEFAULT 0,
        modules_created INTEGER DEFAULT 0,
        last_error TEXT,
        uptime INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        type TEXT,
        status TEXT,
        result TEXT,
        timestamp INTEGER,
        session INTEGER,
        error TEXT,
        metadata TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_timestamp ON tasks(timestamp);

      CREATE TABLE IF NOT EXISTS modules (
        id TEXT PRIMARY KEY,
        name TEXT,
        content TEXT,
        type TEXT,
        timestamp INTEGER,
        version INTEGER DEFAULT 1,
        hash TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      );

      CREATE INDEX IF NOT EXISTS idx_modules_type ON modules(type);

      CREATE TABLE IF NOT EXISTS memory (
        id TEXT PRIMARY KEY,
        concept TEXT,
        importance INTEGER DEFAULT 1,
        timestamp INTEGER,
        category TEXT DEFAULT 'general',
        access_count INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      );

      CREATE INDEX IF NOT EXISTS idx_memory_importance ON memory(importance);
      CREATE INDEX IF NOT EXISTS idx_memory_category ON memory(category);

      CREATE TABLE IF NOT EXISTS vault (
        id TEXT PRIMARY KEY,
        service TEXT,
        key_name TEXT,
        value TEXT,
        timestamp INTEGER,
        encrypted BOOLEAN DEFAULT 0,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      );

      CREATE INDEX IF NOT EXISTS idx_vault_service ON vault(service);

      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        name TEXT,
        type TEXT,
        status TEXT,
        timestamp INTEGER,
        last_seen INTEGER,
        metadata TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      );

      CREATE TABLE IF NOT EXISTS metrics (
        id TEXT PRIMARY KEY,
        metric_type TEXT,
        value REAL,
        timestamp INTEGER,
        metadata TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      );

      CREATE INDEX IF NOT EXISTS idx_metrics_type_time ON metrics(metric_type, timestamp);

      CREATE TABLE IF NOT EXISTS system_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        level TEXT,
        message TEXT,
        metadata TEXT,
        timestamp INTEGER DEFAULT (strftime('%s', 'now'))
      );

      INSERT OR IGNORE INTO state (id, session, status, uptime) VALUES (1, 0, 'RESTING', 0);
    `);

    // Add triggers for updated_at
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS update_state_timestamp 
      AFTER UPDATE ON state
      BEGIN
        UPDATE state SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
      END;

      CREATE TRIGGER IF NOT EXISTS update_tasks_timestamp 
      AFTER UPDATE ON tasks
      BEGIN
        UPDATE tasks SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
      END;
    `);
  }

  getDb(): Database.Database {
    return this.db;
  }

  prepare<T = any>(sql: string): Database.Statement<T> {
    return this.db.prepare(sql);
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  backup() {
    const backupPath = path.join(__dirname, 'backups', `atena_${Date.now()}.db`);
    this.db.backup(backupPath);
    this.log('INFO', `Database backed up to ${backupPath}`);
  }

  log(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', message: string, metadata?: any) {
    const stmt = this.prepare(`
      INSERT INTO system_logs (level, message, metadata, timestamp) 
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(level, message, metadata ? JSON.stringify(metadata) : null, Date.now());
  }
}

// ==================== WEBSOCKET MANAGER ====================
class WebSocketManager {
  private wss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();
  private db: DatabaseManager;

  constructor(server: any) {
    this.wss = new WebSocketServer({ server });
    this.db = DatabaseManager.getInstance();
    this.setup();
  }

  private setup() {
    this.wss.on('connection', (ws: WebSocket) => {
      this.clients.add(ws);
      this.db.log('INFO', 'New WebSocket client connected');

      ws.on('message', (message: Buffer) => this.handleMessage(ws, message));
      ws.on('close', () => this.handleClose(ws));
      ws.on('error', (error) => this.handleError(ws, error));

      this.sendInitialState(ws);
    });
  }

  private handleMessage(ws: WebSocket, message: Buffer) {
    try {
      const data: WebSocketMessage = JSON.parse(message.toString());
      this.db.log('DEBUG', 'WebSocket message received', { type: data.type });

      switch (data.type) {
        case 'PING':
          ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
          break;
        case 'REQUEST_STATE':
          this.sendInitialState(ws);
          break;
        default:
          // Handle other message types
          this.broadcast(data);
      }
    } catch (error) {
      this.db.log('ERROR', 'Error processing WebSocket message', { error });
    }
  }

  private handleClose(ws: WebSocket) {
    this.clients.delete(ws);
    this.db.log('INFO', 'WebSocket client disconnected');
  }

  private handleError(ws: WebSocket, error: Error) {
    this.db.log('ERROR', 'WebSocket error', { error: error.message });
  }

  private sendInitialState(ws: WebSocket) {
    try {
      const db = this.db.getDb();
      const state = db.prepare('SELECT * FROM state WHERE id = 1').get();
      const recentTasks = db.prepare('SELECT * FROM tasks ORDER BY timestamp DESC LIMIT 50').all();
      const recentModules = db.prepare('SELECT * FROM modules ORDER BY timestamp DESC LIMIT 20').all();
      const recentMemory = db.prepare('SELECT * FROM memory ORDER BY importance DESC, timestamp DESC LIMIT 20').all();
      const vaultItems = db.prepare('SELECT * FROM vault ORDER BY timestamp DESC LIMIT 50').all();
      const nodesItems = db.prepare('SELECT * FROM nodes ORDER BY timestamp DESC LIMIT 100').all();
      
      let wiki = '';
      try {
        const wikiPath = path.join(__dirname, 'wiki.md');
        if (fs.existsSync(wikiPath)) {
          wiki = fs.readFileSync(wikiPath, 'utf-8');
        }
      } catch (e) {}

      ws.send(JSON.stringify({
        type: 'INIT',
        state,
        tasks: recentTasks,
        modules: recentModules,
        memory: recentMemory,
        vault: vaultItems,
        nodes: nodesItems,
        wiki,
        timestamp: Date.now()
      }));
    } catch (error) {
      this.db.log('ERROR', 'Error sending initial state', { error });
    }
  }

  broadcast(data: any) {
    const message = JSON.stringify(data);
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  getClientCount(): number {
    return this.clients.size;
  }
}

// ==================== TASK MANAGER ====================
class TaskManager {
  private db: DatabaseManager;
  private ws: WebSocketManager;
  private activeTasks: Map<string, NodeJS.Timeout> = new Map();
  private taskQueue: Task[] = [];
  private processing = false;

  constructor(db: DatabaseManager, ws: WebSocketManager) {
    this.db = db;
    this.ws = ws;
  }

  async createTask(type: TaskType, session: number, priority: 'high' | 'medium' | 'low' = 'medium'): Promise<string> {
    const taskId = this.generateId();
    const task: Task = {
      id: taskId,
      type,
      status: 'PENDING',
      timestamp: Date.now(),
      session,
      metadata: { priority }
    };

    const stmt = this.db.prepare(`
      INSERT INTO tasks (id, type, status, timestamp, session, metadata) 
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(taskId, type, 'PENDING', task.timestamp, session, JSON.stringify(task.metadata));

    this.ws.broadcast({
      type: 'TASK_ADDED',
      task: { ...task, metadata: task.metadata },
      session
    });

    this.taskQueue.push(task);
    if (!this.processing) {
      this.processQueue();
    }

    return taskId;
  }

  private async processQueue() {
    if (this.processing || this.taskQueue.length === 0) return;

    this.processing = true;
    
    while (this.taskQueue.length > 0) {
      const task = this.taskQueue.shift();
      if (task) {
        await this.executeTask(task);
      }
    }

    this.processing = false;
  }

  private async executeTask(task: Task) {
    // Update task status to PROCESSING
    this.db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run('PROCESSING', task.id);
    
    this.ws.broadcast({
      type: 'TASK_UPDATE',
      task: { id: task.id, status: 'PROCESSING' }
    });

    const timeout = setTimeout(() => {
      this.handleTaskTimeout(task);
    }, CONFIG.TASK_TIMEOUT);

    this.activeTasks.set(task.id, timeout);

    try {
      const result = await this.performTask(task);
      clearTimeout(timeout);
      this.activeTasks.delete(task.id);
      await this.completeTask(task, result);
    } catch (error) {
      clearTimeout(timeout);
      this.activeTasks.delete(task.id);
      await this.failTask(task, error as Error);
    }
  }

  private async performTask(task: Task): Promise<any> {
    // Simulate task execution (replace with actual implementation)
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(this.generateTaskResult(task.type));
      }, 2000 + Math.random() * 3000);
    });
  }

  private generateTaskResult(type: TaskType): any {
    const result: any = {
      result: '',
      moduleName: '',
      moduleType: '',
      memoryConcept: ''
    };

    switch (type) {
      case 'GENERATE_CODE':
        const core = NeuralCore.generate('CODE');
        result.result = core.code;
        result.moduleName = core.name;
        result.moduleType = 'ACTIVE';
        result.memoryConcept = `Pattern generated: ${core.concept}`;
        break;
      case 'EVOLVE_MODULE':
        const existing = this.db.prepare('SELECT content FROM modules ORDER BY RANDOM() LIMIT 1').get() as any;
        if (existing) {
          result.result = NeuralCore.evolve(existing.content);
          result.moduleName = `evolved_${task.id}.ts`;
          result.moduleType = 'EVOLVED';
          result.memoryConcept = 'Neural path consolidated through mutation.';
        } else {
          const core = NeuralCore.generate('CODE');
          result.result = core.code;
          result.moduleName = core.name;
          result.moduleType = 'ACTIVE';
        }
        break;
      case 'WEB_RESEARCH':
        result.result = 'Local Neural Core scanning internal knowledge graph... Found optimization patterns in recursive logic.';
        result.memoryConcept = 'Recursive logic optimization pattern discovered.';
        break;
      case 'LINGUISTIC_TRAINING':
        result.result = 'Linguistic matrix expansion: Integrating new semantic nodes and technical metaphors.';
        result.memoryConcept = 'Semantic mapping expanded with new technical metaphors.';
        break;
      case 'WEB_AUTOMATION':
        const url = `https://digital-organism.net/node_${task.id}`;
        result.result = `Autonomous navigation active. Accessing ${url}... Extracting metadata and structural patterns.`;
        result.memoryConcept = `External node structural patterns extracted from ${url}.`;
        
        const nodeId = this.generateId();
        this.db.prepare(`
          INSERT INTO nodes (id, name, type, status, timestamp, last_seen) 
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(nodeId, url, 'EXPLORATION', 'ACTIVE', Date.now(), Date.now());
        
        this.ws.broadcast({
          type: 'NODE_ADDED',
          node: { id: nodeId, name: url, type: 'EXPLORATION', status: 'ACTIVE', timestamp: Date.now() }
        });
        break;
      // Add other task types here...
      default:
        result.result = 'Task completed successfully.';
        result.memoryConcept = 'Memory banks optimized.';
    }

    return result;
  }

  private async completeTask(task: Task, result: any) {
    this.db.transaction(() => {
      // Update task
      this.db.prepare('UPDATE tasks SET status = ?, result = ? WHERE id = ?')
        .run('SUCCESS', result.result, task.id);
      
      // Save module if generated
      if (result.moduleName) {
        const moduleId = this.generateId();
        const hash = crypto.createHash('sha256').update(result.result).digest('hex');
        const filePath = path.join(__dirname, 'modules/ativos', result.moduleName);
        fs.writeFileSync(filePath, result.result);
        
        this.db.prepare(`
          INSERT INTO modules (id, name, content, type, timestamp, hash, version) 
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(moduleId, result.moduleName, result.result, result.moduleType, Date.now(), hash, 1);
        
        this.db.prepare('UPDATE state SET modules_created = modules_created + 1 WHERE id = 1').run();
        
        this.ws.broadcast({
          type: 'MODULE_ADDED',
          module: { 
            id: moduleId, 
            name: result.moduleName, 
            content: result.result, 
            type: result.moduleType, 
            timestamp: Date.now(),
            hash
          }
        });
      }

      // Save memory
      if (result.memoryConcept) {
        const memoryId = this.generateId();
        this.db.prepare(`
          INSERT INTO memory (id, concept, importance, timestamp, category) 
          VALUES (?, ?, ?, ?, ?)
        `).run(memoryId, result.memoryConcept, 1, Date.now(), 'task_result');
        
        this.ws.broadcast({
          type: 'MEMORY_ADDED',
          memory: { id: memoryId, concept: result.memoryConcept, timestamp: Date.now() }
        });
      }

      // Update state
      this.db.prepare('UPDATE state SET tasks_executed = tasks_executed + 1 WHERE id = 1').run();
    });

    // Get updated state
    const state = this.db.prepare('SELECT * FROM state WHERE id = 1').get();

    this.ws.broadcast({
      type: 'TASK_COMPLETE',
      task: { id: task.id, status: 'SUCCESS', result: result.result }
    });
    
    this.ws.broadcast({ type: 'STATE_UPDATE', state });

    this.db.log('INFO', `Task completed successfully`, { taskId: task.id, type: task.type });
  }

  private async failTask(task: Task, error: Error) {
    this.db.transaction(() => {
      this.db.prepare('UPDATE tasks SET status = ?, error = ? WHERE id = ?')
        .run('FAILED', error.message, task.id);
      
      this.db.prepare('UPDATE state SET tasks_failed = tasks_failed + 1 WHERE id = 1').run();
      
      this.db.prepare(`
        UPDATE state SET last_error = ?, status = 'ERROR' WHERE id = 1
      `).run(`Task ${task.id} failed: ${error.message}`);
    });

    const state = this.db.prepare('SELECT * FROM state WHERE id = 1').get();

    this.ws.broadcast({
      type: 'TASK_FAILED',
      task: { id: task.id, error: error.message }
    });
    
    this.ws.broadcast({ type: 'STATE_UPDATE', state });

    this.db.log('ERROR', `Task failed`, { taskId: task.id, type: task.type, error: error.message });
  }

  private handleTaskTimeout(task: Task) {
    const error = new Error(`Task timeout after ${CONFIG.TASK_TIMEOUT}ms`);
    this.failTask(task, error);
  }

  private generateId(): string {
    return crypto.randomBytes(4).toString('hex');
  }

  getActiveTaskCount(): number {
    return this.activeTasks.size;
  }

  shutdown() {
    this.activeTasks.forEach((timeout, taskId) => {
      clearTimeout(timeout);
      this.db.log('WARN', `Task terminated during shutdown`, { taskId });
    });
    this.activeTasks.clear();
  }
}

// ==================== ATENA CORE ====================
class AtenaCore {
  private db: DatabaseManager;
  private ws: WebSocketManager;
  private taskManager: TaskManager;
  private running = false;
  private sessionStartTime = 0;
  private metricsInterval: NodeJS.Timeout | null = null;
  private backupInterval: NodeJS.Timeout | null = null;

  constructor(db: DatabaseManager, ws: WebSocketManager) {
    this.db = db;
    this.ws = ws;
    this.taskManager = new TaskManager(db, ws);
  }

  async start() {
    this.running = true;
    this.db.log('INFO', 'ATENA Core starting...');
    
    // Start metrics collection
    this.startMetricsCollection();
    
    // Start auto-backup
    this.startAutoBackup();
    
    // Start main loop
    this.run().catch(error => {
      this.db.log('ERROR', 'Fatal error in ATENA main loop', { error });
      this.handleFatalError(error);
    });
  }

  private async run() {
    while (this.running) {
      try {
        await this.runSession();
      } catch (error) {
        this.db.log('ERROR', 'Session error', { error });
        await this.recoverFromError(error as Error);
      }
    }
  }

  private async runSession() {
    const state = this.db.prepare('SELECT * FROM state WHERE id = 1').get() as State;
    const newSession = state.session + 1;
    const nextCycleAt = Date.now() + CONFIG.WORK_DURATION;
    
    this.sessionStartTime = Date.now();
    
    // Update state to WORKING
    this.db.transaction(() => {
      this.db.prepare(`
        UPDATE state SET session = ?, status = 'WORKING', next_cycle_at = ?, uptime = ? WHERE id = 1
      `).run(newSession, nextCycleAt, state.uptime + CONFIG.WORK_DURATION);
    });

    this.ws.broadcast({
      type: 'STATE_UPDATE',
      state: { session: newSession, status: 'WORKING', next_cycle_at: nextCycleAt }
    });

    this.db.log('INFO', `Starting Evolution Session #${newSession}`);

    // Work phase
    const workEndTime = Date.now() + CONFIG.WORK_DURATION;
    const taskTypes: TaskType[] = [
      'SEARCH_GITHUB', 'GENERATE_CODE', 'EVOLVE_MODULE', 
      'WEB_RESEARCH', 'LINGUISTIC_TRAINING', 'WEB_AUTOMATION',
      'SELF_HEAL', 'SENSE_EXTERNAL', 'DEFEND_VAULT'
    ];

    while (Date.now() < workEndTime && this.running) {
      if (this.taskManager.getActiveTaskCount() < CONFIG.MAX_CONCURRENT_TASKS) {
        const randomType = taskTypes[Math.floor(Math.random() * taskTypes.length)];
        await this.taskManager.createTask(randomType, newSession);
      }
      
      // Dynamic wait based on remaining time
      const remainingTime = workEndTime - Date.now();
      const waitTime = Math.min(10000 + Math.random() * 10000, remainingTime / 2);
      
      if (waitTime > 0) {
        await this.sleep(waitTime);
      }
    }

    // Consolidation phase
    if (this.running) {
      await this.consolidateSession(newSession);
    }
  }

  private async consolidateSession(session: number) {
    const consolidationNextCycleAt = Date.now() + CONFIG.CONSOLIDATION_DURATION;
    
    this.db.prepare(`
      UPDATE state SET status = 'CONSOLIDATING', next_cycle_at = ? WHERE id = 1
    `).run(consolidationNextCycleAt);

    this.ws.broadcast({
      type: 'STATE_UPDATE',
      state: { status: 'CONSOLIDATING', next_cycle_at: consolidationNextCycleAt }
    });

    this.db.log('INFO', `Consolidating session #${session}`);

    // Generate wiki and metrics
    await this.generateWiki(session);
    await this.pruneOldData();
    await this.collectMetrics();

    // Brief pause
    await this.sleep(CONFIG.CONSOLIDATION_DURATION);
  }

  private async generateWiki(session: number) {
    const state = this.db.prepare('SELECT * FROM state WHERE id = 1').get() as State;
    const modules = this.db.prepare(`
      SELECT name, type, version FROM modules ORDER BY timestamp DESC LIMIT 10
    `).all() as any[];
    
    const recentTasks = this.db.prepare(`
      SELECT type, status, COUNT(*) as count 
      FROM tasks 
      WHERE session = ? 
      GROUP BY type, status
    `).all(session) as any[];

    const topMemory = this.db.prepare(`
      SELECT concept, importance FROM memory ORDER BY importance DESC LIMIT 5
    `).all() as any[];

    const metrics = this.db.prepare(`
      SELECT metric_type, AVG(value) as avg_value 
      FROM metrics 
      WHERE timestamp > ? 
      GROUP BY metric_type
    `).all(Date.now() - 3600000) as any[];

    const wikiContent = `# 📊 ATENA Ω - Relatório da Sessão ${session}

## 📈 Estatísticas Gerais
- **Data/Hora:** ${new Date().toLocaleString()}
- **Duração da Sessão:** ${CONFIG.WORK_DURATION / 60000} minutos
- **Tarefas Executadas:** ${state.tasks_executed}
- **Módulos Criados:** ${state.modules_created}
- **Taxa de Sucesso:** ${Math.round((state.tasks_executed / (state.tasks_executed + state.tasks_failed || 1)) * 100)}%
- **Uptime Total:** ${Math.floor(state.uptime / 3600000)}h ${Math.floor((state.uptime % 3600000) / 60000)}m

## 🧠 Memórias de Alta Importância
${topMemory.map(m => `- ${m.concept} (importância: ${m.importance})`).join('\n')}

## 📦 Módulos Recentes
${modules.map(m => `- \`${m.name}\` (${m.type}, v${m.version})`).join('\n')}

## 📊 Desempenho por Tipo de Tarefa
${recentTasks.map(t => `- ${t.type}: ${t.count} (${t.status})`).join('\n')}

## 📉 Métricas da Última Hora
${metrics.map(m => `- ${m.metric_type}: ${m.avg_value.toFixed(2)}`).join('\n')}

## 🔄 Próxima Sessão
- **Início Previsto:** ${new Date(state.next_cycle_at || 0).toLocaleString()}

---
*ATENA Ω - Evolução Contínua e Aprendizado Perpétuo*`;

    const wikiPath = path.join(__dirname, `docs/wiki/sessao_${session}.md`);
    fs.writeFileSync(wikiPath, wikiContent);
    fs.writeFileSync(path.join(__dirname, 'wiki.md'), wikiContent);

    this.ws.broadcast({ type: 'WIKI_UPDATE', content: wikiContent });
    this.db.log('INFO', `Wiki generated for session ${session}`);
  }

  private async pruneOldData() {
    const cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days
    
    this.db.transaction(() => {
      // Prune old tasks
      const tasksResult = this.db.prepare(`
        DELETE FROM tasks WHERE timestamp < ? AND status = 'SUCCESS'
      `).run(cutoff);
      
      // Prune old metrics
      const metricsResult = this.db.prepare(`
        DELETE FROM metrics WHERE timestamp < ?
      `).run(cutoff - (24 * 60 * 60 * 1000)); // Keep 8 days of metrics
      
      // Limit memory table size
      const memoryCount = this.db.prepare('SELECT COUNT(*) as count FROM memory').get() as { count: number };
      if (memoryCount.count > CONFIG.MAX_MEMORY_ITEMS) {
        this.db.prepare(`
          DELETE FROM memory 
          WHERE id IN (
            SELECT id FROM memory 
            ORDER BY importance DESC, timestamp DESC 
            LIMIT -1 OFFSET ?
          )
        `).run(CONFIG.MAX_MEMORY_ITEMS);
      }

      this.db.log('INFO', 'Data pruning completed', {
        tasksDeleted: tasksResult.changes,
        metricsDeleted: metricsResult.changes
      });
    });
  }

  private async collectMetrics() {
    const state = this.db.prepare('SELECT * FROM state WHERE id = 1').get() as State;
    
    const metrics = [
      {
        type: 'tasks_per_minute',
        value: state.tasks_executed / (CONFIG.WORK_DURATION / 60000)
      },
      {
        type: 'success_rate',
        value: state.tasks_executed / (state.tasks_executed + state.tasks_failed || 1)
      },
      {
        type: 'active_tasks',
        value: this.taskManager.getActiveTaskCount()
      },
      {
        type: 'memory_usage',
        value: process.memoryUsage().heapUsed / 1024 / 1024 // MB
      }
    ];

    const stmt = this.db.prepare(`
      INSERT INTO metrics (id, metric_type, value, timestamp, metadata) 
      VALUES (?, ?, ?, ?, ?)
    `);

    metrics.forEach(metric => {
      stmt.run(
        crypto.randomBytes(4).toString('hex'),
        metric.type,
        metric.value,
        Date.now(),
        JSON.stringify({ session: state.session })
      );
    });
  }

  private startMetricsCollection() {
    this.metricsInterval = setInterval(() => {
      this.collectMetrics().catch(error => {
        this.db.log('ERROR', 'Error collecting metrics', { error });
      });
    }, 60000); // Every minute
  }

  private startAutoBackup() {
    this.backupInterval = setInterval(() => {
      this.db.backup();
    }, CONFIG.AUTO_BACKUP_INTERVAL);
  }

  private async recoverFromError(error: Error) {
    this.db.log('WARN', 'Attempting recovery from error', { error });

    // Update state to ERROR
    this.db.prepare(`
      UPDATE state SET status = 'ERROR', last_error = ? WHERE id = 1
    `).run(error.message);

    this.ws.broadcast({
      type: 'STATE_UPDATE',
      state: { status: 'ERROR', last_error: error.message }
    });

    // Wait before retry
    await this.sleep(30000);

    // Attempt to resume
    const state = this.db.prepare('SELECT * FROM state WHERE id = 1').get() as State;
    
    // If we're in ERROR state, try to go back to WORKING
    if (state.status === 'ERROR') {
      this.db.prepare(`
        UPDATE state SET status = 'WORKING', last_error = NULL WHERE id = 1
      `).run();
      
      this.db.log('INFO', 'Recovery successful, resuming operations');
    }
  }

  private handleFatalError(error: Error) {
    this.db.log('ERROR', 'FATAL ERROR - Shutting down', { error });
    this.shutdown();
    process.exit(1);
  }

  async shutdown() {
    this.running = false;
    
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }
    
    if (this.backupInterval) {
      clearInterval(this.backupInterval);
    }

    this.taskManager.shutdown();

    // Final backup
    this.db.backup();

    this.db.log('INFO', 'ATENA Core shutting down');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // API Methods
  async handleChat(message: string, session?: number): Promise<string> {
    const memories = this.db.prepare(`
      SELECT concept FROM memory 
      ORDER BY importance DESC, timestamp DESC 
      LIMIT 5
    `).all() as any[];

    const chatResult = NeuralCore.chat(message, memories) as { text: string; triggerTask?: string };

    if (chatResult.triggerTask) {
      const currentSession = session || 
        (this.db.prepare('SELECT session FROM state WHERE id = 1').get() as any).session;
      await this.taskManager.createTask(chatResult.triggerTask as TaskType, currentSession);
    }

    return chatResult.text;
  }

  getStatus(): any {
    const state = this.db.prepare('SELECT * FROM state WHERE id = 1').get();
    const activeTasks = this.taskManager.getActiveTaskCount();
    const uptime = process.uptime();

    return {
      ...state,
      activeTasks,
      processUptime: uptime,
      memoryUsage: process.memoryUsage(),
      clientCount: this.ws.getClientCount()
    };
  }
}

// ==================== EXPRESS SERVER SETUP ====================
async function startServer() {
  // Initialize core components
  const db = DatabaseManager.getInstance();
  const app = express();
  const httpServer = createServer(app);
  const ws = new WebSocketManager(httpServer);
  const atena = new AtenaCore(db, ws);

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Request logging middleware
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      db.log('DEBUG', `${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
    });
    next();
  });

  // API Routes
  app.get('/api/status', (req, res) => {
    try {
      const status = atena.getStatus();
      res.json({ success: true, data: status });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  app.get('/api/tasks', (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const tasks = db.prepare(`
        SELECT * FROM tasks 
        ORDER BY timestamp DESC 
        LIMIT ?
      `).all(limit);
      res.json({ success: true, data: tasks });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  app.get('/api/tasks/:id', (req, res) => {
    try {
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
      if (!task) {
        return res.status(404).json({ success: false, error: 'Task not found' });
      }
      res.json({ success: true, data: task });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  app.post('/api/tasks', async (req, res) => {
    try {
      const { type, priority = 'medium' } = req.body;
      const state = db.prepare('SELECT session FROM state WHERE id = 1').get() as State;
      
      const taskId = await atena['taskManager'].createTask(type, state.session, priority);
      
      res.json({ 
        success: true, 
        data: { taskId, message: 'Task created successfully' }
      });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  app.get('/api/modules', (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const type = req.query.type as string;
      
      let query = 'SELECT * FROM modules ORDER BY timestamp DESC LIMIT ?';
      let params: any[] = [limit];
      
      if (type) {
        query = 'SELECT * FROM modules WHERE type = ? ORDER BY timestamp DESC LIMIT ?';
        params = [type, limit];
      }
      
      const modules = db.prepare(query).all(...params);
      res.json({ success: true, data: modules });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  app.get('/api/memory', (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const category = req.query.category as string;
      
      let query = 'SELECT * FROM memory ORDER BY importance DESC, timestamp DESC LIMIT ?';
      let params: any[] = [limit];
      
      if (category) {
        query = 'SELECT * FROM memory WHERE category = ? ORDER BY importance DESC, timestamp DESC LIMIT ?';
        params = [category, limit];
      }
      
      const memory = db.prepare(query).all(...params);
      res.json({ success: true, data: memory });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  app.get('/api/metrics', (req, res) => {
    try {
      const hours = parseInt(req.query.hours as string) || 24;
      const cutoff = Date.now() - (hours * 60 * 60 * 1000);
      
      const metrics = db.prepare(`
        SELECT metric_type, 
               AVG(value) as avg_value,
               MIN(value) as min_value,
               MAX(value) as max_value,
               COUNT(*) as sample_count
        FROM metrics 
        WHERE timestamp > ?
        GROUP BY metric_type
      `).all(cutoff);
      
      res.json({ success: true, data: metrics });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  app.post('/api/chat', async (req, res) => {
    try {
      const { message, session } = req.body;
      
      if (!message) {
        return res.status(400).json({ success: false, error: 'Message is required' });
      }

      const response = await atena.handleChat(message, session);
      res.json({ success: true, data: { response } });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  app.post('/api/backup', (req, res) => {
    try {
      db.backup();
      res.json({ success: true, message: 'Backup created successfully' });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  app.get('/api/logs', (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const level = req.query.level as string;
      
      let query = 'SELECT * FROM system_logs ORDER BY timestamp DESC LIMIT ?';
      let params: any[] = [limit];
      
      if (level) {
        query = 'SELECT * FROM system_logs WHERE level = ? ORDER BY timestamp DESC LIMIT ?';
        params = [level, limit];
      }
      
      const logs = db.prepare(query).all(...params);
      res.json({ success: true, data: logs });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ 
      status: 'healthy', 
      timestamp: Date.now(),
      uptime: process.uptime()
    });
  });

  // Vite/Static file serving
  if (CONFIG.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    // SPA fallback
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  // Error handling middleware
  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    db.log('ERROR', 'Unhandled error', { error: err.message, stack: err.stack });
    res.status(500).json({ 
      success: false, 
      error: CONFIG.NODE_ENV === 'production' ? 'Internal server error' : err.message 
    });
  });

  // Start server
  httpServer.listen(CONFIG.PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on http://localhost:${CONFIG.PORT}`);
    console.log(`📊 Environment: ${CONFIG.NODE_ENV}`);
    console.log(`⚙️  Configuration:`, {
      workDuration: `${CONFIG.WORK_DURATION / 60000}min`,
      maxConcurrentTasks: CONFIG.MAX_CONCURRENT_TASKS,
      autoBackupInterval: `${CONFIG.AUTO_BACKUP_INTERVAL / 60000}min`
    });
    
    // Start ATENA core
    atena.start().catch(console.error);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n🛑 Shutting down gracefully...');
    
    await atena.shutdown();
    
    httpServer.close(() => {
      console.log('✅ Server closed');
      process.exit(0);
    });

    // Force close after timeout
    setTimeout(() => {
      console.error('❌ Force shutdown');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

// ==================== START APPLICATION ====================
startServer().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
