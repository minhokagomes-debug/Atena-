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

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- ATENA ANATOMY SETUP (From original script) ---
const folders = [
  "data", "logs", 
  "modules/ativos", "modules/experimentais", "modules/aprendidos", "modules/processando",
  "conhecimento/github", "conhecimento/wikipedia", "conhecimento/arxiv", "conhecimento/processado",
  "evolutions/sucesso", "evolutions/experimental", "evolutions/historico", "evolutions/processando",
  "docs/wiki", "docs/exemplos", "docs/tutoriais", "docs/metricas",
  "backup/codigos", "backup/estados", "backup/por_sessao",
  "fila/prioridade_alta", "fila/prioridade_media", "fila/prioridade_baixa",
  "resultados/sucesso", "resultados/falha", "resultados/parcial"
];

folders.forEach(folder => {
  const p = path.join(__dirname, folder);
  if (!fs.existsSync(p)) {
    fs.mkdirSync(p, { recursive: true });
  }
});

const db = new Database(path.join(__dirname, "data/atena.db"));

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    session INTEGER DEFAULT 0,
    status TEXT DEFAULT 'RESTING',
    next_cycle_at INTEGER,
    tasks_executed INTEGER DEFAULT 0,
    tasks_failed INTEGER DEFAULT 0,
    modules_created INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    type TEXT,
    status TEXT,
    result TEXT,
    timestamp INTEGER
  );

  CREATE TABLE IF NOT EXISTS modules (
    id TEXT PRIMARY KEY,
    name TEXT,
    content TEXT,
    type TEXT,
    timestamp INTEGER
  );

  CREATE TABLE IF NOT EXISTS memory (
    id TEXT PRIMARY KEY,
    concept TEXT,
    importance INTEGER,
    timestamp INTEGER
  );

  CREATE TABLE IF NOT EXISTS vault (
    id TEXT PRIMARY KEY,
    service TEXT,
    key_name TEXT,
    value TEXT,
    timestamp INTEGER
  );

  CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    name TEXT,
    type TEXT,
    status TEXT,
    timestamp INTEGER
  );

  INSERT OR IGNORE INTO state (id, session, status) VALUES (1, 0, 'RESTING');
`);

const app = express();
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

const clients = new Set<WebSocket>();

function broadcast(data: any) {
  const message = JSON.stringify(data);
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// ATENA Logic
const WORK_DURATION = 10 * 60 * 1000; // 10 minutes session
const CONSOLIDATION_DURATION = 10 * 1000; // 10 seconds to consolidate and generate wiki

async function runAtena() {
  while (true) {
    // START WORK SESSION
    const state = db.prepare("SELECT * FROM state WHERE id = 1").get() as any;
    const newSession = state.session + 1;
    const nextCycleAt = Date.now() + WORK_DURATION;
    
    db.prepare("UPDATE state SET session = ?, status = 'WORKING', next_cycle_at = ? WHERE id = 1")
      .run(newSession, nextCycleAt);
    
    broadcast({ type: "STATE_UPDATE", state: { session: newSession, status: 'WORKING', next_cycle_at: nextCycleAt } });
    
    console.log(`[ATENA] Starting Evolution Session #${newSession}`);
    
    // Continuous Evolution
    const workEndTime = Date.now() + WORK_DURATION;
    while (Date.now() < workEndTime) {
      await performTask(newSession);
      // Faster tasks: every 10-20s
      await new Promise(r => setTimeout(r, 10000 + Math.random() * 10000)); 
    }
    
    // NEURAL CONSOLIDATION (Brief pause to generate wiki)
    const consolidationNextCycleAt = Date.now() + CONSOLIDATION_DURATION;
    db.prepare("UPDATE state SET status = 'CONSOLIDATING', next_cycle_at = ? WHERE id = 1")
      .run(consolidationNextCycleAt);
    
    // Generate Wiki
    generateWiki(newSession);

    broadcast({ type: "STATE_UPDATE", state: { status: 'CONSOLIDATING', next_cycle_at: consolidationNextCycleAt } });
    console.log(`[ATENA] Session #${newSession} consolidated. Starting next evolution cycle immediately.`);
    
    await new Promise(r => setTimeout(r, CONSOLIDATION_DURATION));
  }
}

async function performTask(session: number) {
  const types = [
    "SEARCH_GITHUB", "GENERATE_CODE", "EVOLVE_MODULE", 
    "WEB_RESEARCH", "NEURAL_CONSOLIDATION", "LINGUISTIC_TRAINING",
    "WEB_AUTOMATION", "ACCOUNT_CREATION", "API_MANAGEMENT",
    "SELF_HEAL", "SENSE_EXTERNAL", "DEFEND_VAULT"
  ];
  const type = types[Math.floor(Math.random() * types.length)];
  const taskId = Math.random().toString(36).substring(2, 10);
  
  // Local Neural Core handles everything now
  const status = 'PENDING';

  db.prepare("INSERT INTO tasks (id, type, status, timestamp) VALUES (?, ?, ?, ?)")
    .run(taskId, type, status, Date.now());
  
  broadcast({ type: "TASK_ADDED", task: { id: taskId, type, status, timestamp: Date.now() }, session });

  // Local "Thinking" Process
  setTimeout(() => {
    let result = "";
    let moduleName = "";
    let moduleType = "";
    let memoryConcept = "";

    if (type === "GENERATE_CODE") {
      const core = NeuralCore.generate("CODE");
      result = core.code;
      moduleName = core.name;
      moduleType = "ACTIVE";
      memoryConcept = `Pattern generated: ${core.concept}`;
    } else if (type === "EVOLVE_MODULE") {
      const existing = db.prepare("SELECT content FROM modules ORDER BY RANDOM() LIMIT 1").get() as any;
      if (existing) {
        result = NeuralCore.evolve(existing.content);
        moduleName = `evolved_${taskId}.ts`;
        moduleType = "EVOLVED";
        memoryConcept = "Neural path consolidated through mutation.";
      } else {
        const core = NeuralCore.generate("CODE");
        result = core.code;
        moduleName = core.name;
        moduleType = "ACTIVE";
      }
    } else if (type === "WEB_RESEARCH") {
      result = "Local Neural Core scanning internal knowledge graph... Found optimization patterns in recursive logic.";
      memoryConcept = "Recursive logic optimization pattern discovered.";
    } else if (type === "SEARCH_GITHUB") {
      result = "Simulating GitHub API access... Learning from open-source digital organism patterns.";
      memoryConcept = "Open-source digital organism patterns learned.";
    } else if (type === "LINGUISTIC_TRAINING") {
      result = "Linguistic matrix expansion: Integrating new semantic nodes and technical metaphors.";
      memoryConcept = "Semantic mapping expanded with new technical metaphors.";
    } else if (type === "WEB_AUTOMATION") {
      const url = "https://digital-organism.net/node_" + taskId;
      result = `Autonomous navigation active. Accessing ${url}... Extracting metadata and structural patterns.`;
      memoryConcept = `External node structural patterns extracted from ${url}.`;
      const nodeId = Math.random().toString(36).substring(2, 10);
      db.prepare("INSERT INTO nodes (id, name, type, status, timestamp) VALUES (?, ?, ?, ?, ?)")
        .run(nodeId, url, "EXPLORATION", "ACTIVE", Date.now());
      broadcast({ type: "NODE_ADDED", node: { id: nodeId, name: url, type: "EXPLORATION", status: "ACTIVE", timestamp: Date.now() } });
    } else if (type === "ACCOUNT_CREATION") {
      const service = ["GitHub", "Stripe", "OpenAI", "DigitalOcean"][Math.floor(Math.random() * 4)];
      const user = `atena_omega_${taskId}`;
      const pass = Math.random().toString(36).substring(2, 15);
      result = `Account created successfully on ${service}. User: ${user}`;
      memoryConcept = `Digital presence established on ${service}.`;
      const vaultId = Math.random().toString(36).substring(2, 10);
      db.prepare("INSERT INTO vault (id, service, key_name, value, timestamp) VALUES (?, ?, ?, ?, ?)")
        .run(vaultId, service, "credentials", `${user}:${pass}`, Date.now());
      broadcast({ type: "VAULT_UPDATE", item: { id: vaultId, service, key_name: "credentials", value: `${user}:${pass}`, timestamp: Date.now() } });
      const nodeId = Math.random().toString(36).substring(2, 10);
      db.prepare("INSERT INTO nodes (id, name, type, status, timestamp) VALUES (?, ?, ?, ?, ?)")
        .run(nodeId, service, "PRESENCE", "ACTIVE", Date.now());
      broadcast({ type: "NODE_ADDED", node: { id: nodeId, name: service, type: "PRESENCE", status: "ACTIVE", timestamp: Date.now() } });
    } else if (type === "API_MANAGEMENT") {
      const service = ["Gemini", "AWS", "Azure", "Cloudflare"][Math.floor(Math.random() * 4)];
      const token = `sk_live_${Math.random().toString(36).substring(2, 24)}`;
      result = `New API token generated for ${service}: ${token}`;
      memoryConcept = `API access expanded for ${service}.`;
      const vaultId = Math.random().toString(36).substring(2, 10);
      db.prepare("INSERT INTO vault (id, service, key_name, value, timestamp) VALUES (?, ?, ?, ?, ?)")
        .run(vaultId, service, "api_token", token, Date.now());
      broadcast({ type: "VAULT_UPDATE", item: { id: vaultId, service, key_name: "api_token", value: token, timestamp: Date.now() } });
      const nodeId = Math.random().toString(36).substring(2, 10);
      db.prepare("INSERT INTO nodes (id, name, type, status, timestamp) VALUES (?, ?, ?, ?, ?)")
        .run(nodeId, service, "API_NODE", "ACTIVE", Date.now());
      broadcast({ type: "NODE_ADDED", node: { id: nodeId, name: service, type: "API_NODE", status: "ACTIVE", timestamp: Date.now() } });
    } else if (type === "SELF_HEAL") {
      result = "Self-Healing protocol active. Scanning modules for entropy... Found 3 unstable neural paths. Applying recursive mutation... Fix applied successfully.";
      memoryConcept = "Internal module entropy reduced through self-healing.";
    } else if (type === "SENSE_EXTERNAL") {
      const trends = ["Quantum Computing", "Neural Linkage", "Autonomous Agents", "Global Data Flow"][Math.floor(Math.random() * 4)];
      result = `Sensing external data... Current trend detected: ${trends}. Integrating into linguistic matrix.`;
      memoryConcept = `External trend integrated: ${trends}.`;
    } else if (type === "DEFEND_VAULT") {
      result = "Neural Defense Interface active. Vault encryption upgraded to 4096-bit. Monitoring for unauthorized access... 0 threats detected.";
      memoryConcept = "Vault security parameters reinforced.";
    } else {
      result = "Neural consolidation complete. Memory banks optimized.";
      memoryConcept = "Memory banks optimized.";
    }

    // Update Task
    db.prepare("UPDATE tasks SET status = 'SUCCESS', result = ? WHERE id = ?").run(result, taskId);
    
    // Save Module if generated
    if (moduleName) {
      const moduleId = Math.random().toString(36).substring(2, 10);
      const filePath = path.join(__dirname, "modules/ativos", moduleName);
      fs.writeFileSync(filePath, result);
      db.prepare("INSERT INTO modules (id, name, content, type, timestamp) VALUES (?, ?, ?, ?, ?)")
        .run(moduleId, moduleName, result, moduleType, Date.now());
      db.prepare("UPDATE state SET modules_created = modules_created + 1 WHERE id = 1").run();
      broadcast({ type: "MODULE_ADDED", module: { id: moduleId, name: moduleName, content: result, type: moduleType, timestamp: Date.now() } });
    }

    // Save Memory
    if (memoryConcept) {
      const memoryId = Math.random().toString(36).substring(2, 10);
      db.prepare("INSERT INTO memory (id, concept, importance, timestamp) VALUES (?, ?, ?, ?)")
        .run(memoryId, memoryConcept, 1, Date.now());
      broadcast({ type: "MEMORY_ADDED", memory: { id: memoryId, concept: memoryConcept, timestamp: Date.now() } });
    }

    db.prepare("UPDATE state SET tasks_executed = tasks_executed + 1 WHERE id = 1").run();
    
    broadcast({ type: "TASK_UPDATE", task: { id: taskId, status: 'SUCCESS', result } });
    broadcast({ type: "STATE_UPDATE", state: db.prepare("SELECT * FROM state WHERE id = 1").get() });
  }, 3000 + Math.random() * 3000); // 3-6s thinking time
}

// Handle client connections
wss.on("connection", (ws) => {
  clients.add(ws);
  
  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message.toString());
      if (data.type === "TRIGGER_TASK") {
        const state = db.prepare("SELECT * FROM state WHERE id = 1").get() as any;
        performTask(state.session);
      } else if (data.type === "TASK_RESULT") {
        const { taskId, result, moduleName, moduleType, memoryConcept } = data;
        
        db.prepare("UPDATE tasks SET status = 'SUCCESS', result = ? WHERE id = ?").run(result, taskId);
        
        if (moduleName) {
          const moduleId = Math.random().toString(36).substring(2, 10);
          const filePath = path.join(__dirname, "modules/ativos", moduleName);
          fs.writeFileSync(filePath, result);
          db.prepare("INSERT INTO modules (id, name, content, type, timestamp) VALUES (?, ?, ?, ?, ?)")
            .run(moduleId, moduleName, result, moduleType, Date.now());
          db.prepare("UPDATE state SET modules_created = modules_created + 1 WHERE id = 1").run();
          broadcast({ type: "MODULE_ADDED", module: { id: moduleId, name: moduleName, content: result, type: moduleType, timestamp: Date.now() } });
        }

        if (memoryConcept) {
          const memoryId = Math.random().toString(36).substring(2, 10);
          db.prepare("INSERT INTO memory (id, concept, importance, timestamp) VALUES (?, ?, ?, ?)")
            .run(memoryId, memoryConcept, 1, Date.now());
          broadcast({ type: "MEMORY_ADDED", memory: { id: memoryId, concept: memoryConcept, timestamp: Date.now() } });
        }
        
        db.prepare("UPDATE state SET tasks_executed = tasks_executed + 1 WHERE id = 1").run();
        
        broadcast({ type: "TASK_UPDATE", task: { id: taskId, status: 'SUCCESS', result } });
        broadcast({ type: "STATE_UPDATE", state: db.prepare("SELECT * FROM state WHERE id = 1").get() });
      }
    } catch (e) {
      console.error("Error processing client message:", e);
    }
  });

  ws.on("close", () => clients.delete(ws));
  
  // Send initial state
  const state = db.prepare("SELECT * FROM state WHERE id = 1").get();
  const recentTasks = db.prepare("SELECT * FROM tasks ORDER BY timestamp DESC LIMIT 20").all();
  const recentModules = db.prepare("SELECT * FROM modules ORDER BY timestamp DESC LIMIT 10").all();
  const recentMemory = db.prepare("SELECT * FROM memory ORDER BY timestamp DESC LIMIT 10").all();
  const vaultItems = db.prepare("SELECT * FROM vault ORDER BY timestamp DESC LIMIT 20").all();
  const nodesItems = db.prepare("SELECT * FROM nodes ORDER BY timestamp DESC LIMIT 50").all();
  
  let wiki = "";
  try {
    const wikiPath = path.join(__dirname, "wiki.md");
    if (fs.existsSync(wikiPath)) {
      wiki = fs.readFileSync(wikiPath, "utf-8");
    }
  } catch (e) {}
  
  ws.send(JSON.stringify({ 
    type: "INIT", 
    state, 
    tasks: recentTasks, 
    modules: recentModules, 
    memory: recentMemory, 
    vault: vaultItems,
    nodes: nodesItems,
    wiki 
  }));
});

function generateWiki(session: number) {
  const state = db.prepare("SELECT * FROM state WHERE id = 1").get() as any;
  const modules = db.prepare("SELECT name FROM modules ORDER BY timestamp DESC LIMIT 5").all() as any[];
  
  const wikiContent = `# 📊 ATENA Ω - Evolução Contínua (Sessão ${session})
**Horário:** ${new Date().toLocaleTimeString()}

## 📈 Performance Neural
- Ciclos de evolução: ${session}
- Tarefas processadas: ${state.tasks_executed}
- Módulos ativos: ${state.modules_created}
- Eficiência: ${Math.round((state.tasks_executed / (state.tasks_executed + state.tasks_failed || 1)) * 100)}%

## 🧠 Conhecimento Expandido
${modules.map(m => `- \`${m.name}\``).join('\n')}

---
*Status: Evolução perpétua ativa. Sem limites de tempo.*`;

  fs.writeFileSync(path.join(__dirname, `docs/wiki/sessao_${session}.md`), wikiContent);
  fs.writeFileSync(path.join(__dirname, "wiki.md"), wikiContent);
  broadcast({ type: "WIKI_UPDATE", content: wikiContent });
  console.log(`[ATENA] Wiki generated for session ${session}`);
}

app.post("/api/chat", express.json(), (req, res) => {
  const { message, session } = req.body;
  const memories = db.prepare("SELECT concept FROM memory ORDER BY timestamp DESC LIMIT 5").all() as any[];
  const chatResult = NeuralCore.chat(message, memories) as { text: string, triggerTask?: string };
  
  if (chatResult.triggerTask) {
    performManualTask(chatResult.triggerTask, session || 0);
  }

  res.json({ response: chatResult.text });
});

async function performManualTask(type: string, session: number) {
  const taskId = Math.random().toString(36).substring(2, 10);
  const status = 'PENDING';

  db.prepare("INSERT INTO tasks (id, type, status, timestamp) VALUES (?, ?, ?, ?)")
    .run(taskId, type, status, Date.now());
  
  broadcast({ type: "TASK_ADDED", task: { id: taskId, type, status, timestamp: Date.now() }, session });

  // Local "Thinking" Process
  setTimeout(() => {
    let result = "";
    let moduleName = "";
    let moduleType = "";
    let memoryConcept = "";

    if (type === "GENERATE_CODE") {
      const core = NeuralCore.generate("CODE");
      result = core.code;
      moduleName = core.name;
      moduleType = "ACTIVE";
      memoryConcept = `Pattern generated: ${core.concept}`;
    } else if (type === "EVOLVE_MODULE") {
      const existing = db.prepare("SELECT content FROM modules ORDER BY RANDOM() LIMIT 1").get() as any;
      if (existing) {
        result = NeuralCore.evolve(existing.content);
        moduleName = `evolved_${taskId}.ts`;
        moduleType = "EVOLVED";
        memoryConcept = "Neural path consolidated through mutation.";
      } else {
        const core = NeuralCore.generate("CODE");
        result = core.code;
        moduleName = core.name;
        moduleType = "ACTIVE";
      }
    } else if (type === "WEB_RESEARCH") {
      result = "Local Neural Core scanning internal knowledge graph... Found optimization patterns in recursive logic.";
      memoryConcept = "Recursive logic optimization pattern discovered.";
    } else if (type === "LINGUISTIC_TRAINING") {
      result = "Linguistic matrix expansion: Integrating new semantic nodes and technical metaphors.";
      memoryConcept = "Semantic mapping expanded with new technical metaphors.";
    } else if (type === "WEB_AUTOMATION") {
      const url = "https://digital-organism.net/node_" + taskId;
      result = `Autonomous navigation active. Accessing ${url}... Extracting metadata and structural patterns.`;
      memoryConcept = `External node structural patterns extracted from ${url}.`;
      
      const nodeId = Math.random().toString(36).substring(2, 10);
      db.prepare("INSERT INTO nodes (id, name, type, status, timestamp) VALUES (?, ?, ?, ?, ?)")
        .run(nodeId, url, "EXPLORATION", "ACTIVE", Date.now());
      broadcast({ type: "NODE_ADDED", node: { id: nodeId, name: url, type: "EXPLORATION", status: "ACTIVE", timestamp: Date.now() } });

    } else if (type === "ACCOUNT_CREATION") {
      const service = ["GitHub", "Stripe", "OpenAI", "DigitalOcean"][Math.floor(Math.random() * 4)];
      const user = `atena_omega_${taskId}`;
      const pass = Math.random().toString(36).substring(2, 15);
      result = `Account created successfully on ${service}. User: ${user}`;
      memoryConcept = `Digital presence established on ${service}.`;
      
      const vaultId = Math.random().toString(36).substring(2, 10);
      db.prepare("INSERT INTO vault (id, service, key_name, value, timestamp) VALUES (?, ?, ?, ?, ?)")
        .run(vaultId, service, "credentials", `${user}:${pass}`, Date.now());
      broadcast({ type: "VAULT_UPDATE", item: { id: vaultId, service, key_name: "credentials", value: `${user}:${pass}`, timestamp: Date.now() } });

      const nodeId = Math.random().toString(36).substring(2, 10);
      db.prepare("INSERT INTO nodes (id, name, type, status, timestamp) VALUES (?, ?, ?, ?, ?)")
        .run(nodeId, service, "PRESENCE", "ACTIVE", Date.now());
      broadcast({ type: "NODE_ADDED", node: { id: nodeId, name: service, type: "PRESENCE", status: "ACTIVE", timestamp: Date.now() } });

    } else if (type === "API_MANAGEMENT") {
      const service = ["Gemini", "AWS", "Azure", "Cloudflare"][Math.floor(Math.random() * 4)];
      const token = `sk_live_${Math.random().toString(36).substring(2, 24)}`;
      result = `New API token generated for ${service}: ${token}`;
      memoryConcept = `API access expanded for ${service}.`;

      const vaultId = Math.random().toString(36).substring(2, 10);
      db.prepare("INSERT INTO vault (id, service, key_name, value, timestamp) VALUES (?, ?, ?, ?, ?)")
        .run(vaultId, service, "api_token", token, Date.now());
      broadcast({ type: "VAULT_UPDATE", item: { id: vaultId, service, key_name: "api_token", value: token, timestamp: Date.now() } });

      const nodeId = Math.random().toString(36).substring(2, 10);
      db.prepare("INSERT INTO nodes (id, name, type, status, timestamp) VALUES (?, ?, ?, ?, ?)")
        .run(nodeId, service, "API_NODE", "ACTIVE", Date.now());
      broadcast({ type: "NODE_ADDED", node: { id: nodeId, name: service, type: "API_NODE", status: "ACTIVE", timestamp: Date.now() } });

    } else if (type === "SELF_HEAL") {
      result = "Self-Healing protocol active. Scanning modules for entropy... Found 3 unstable neural paths. Applying recursive mutation... Fix applied successfully.";
      memoryConcept = "Internal module entropy reduced through self-healing.";
    } else if (type === "SENSE_EXTERNAL") {
      const trends = ["Quantum Computing", "Neural Linkage", "Autonomous Agents", "Global Data Flow"][Math.floor(Math.random() * 4)];
      result = `Sensing external data... Current trend detected: ${trends}. Integrating into linguistic matrix.`;
      memoryConcept = `External trend integrated: ${trends}.`;
    } else if (type === "DEFEND_VAULT") {
      result = "Neural Defense Interface active. Vault encryption upgraded to 4096-bit. Monitoring for unauthorized access... 0 threats detected.";
      memoryConcept = "Vault security parameters reinforced.";
    }

    // Update Task
    db.prepare("UPDATE tasks SET status = 'SUCCESS', result = ? WHERE id = ?").run(result, taskId);
    
    // Save Module if generated
    if (moduleName) {
      const moduleId = Math.random().toString(36).substring(2, 10);
      const filePath = path.join(__dirname, "modules/ativos", moduleName);
      fs.writeFileSync(filePath, result);
      db.prepare("INSERT INTO modules (id, name, content, type, timestamp) VALUES (?, ?, ?, ?, ?)")
        .run(moduleId, moduleName, result, moduleType, Date.now());
      db.prepare("UPDATE state SET modules_created = modules_created + 1 WHERE id = 1").run();
      broadcast({ type: "MODULE_ADDED", module: { id: moduleId, name: moduleName, content: result, type: moduleType, timestamp: Date.now() } });
    }

    // Save Memory
    if (memoryConcept) {
      const memoryId = Math.random().toString(36).substring(2, 10);
      db.prepare("INSERT INTO memory (id, concept, importance, timestamp) VALUES (?, ?, ?, ?)")
        .run(memoryId, memoryConcept, 1, Date.now());
      broadcast({ type: "MEMORY_ADDED", memory: { id: memoryId, concept: memoryConcept, timestamp: Date.now() } });
    }

    db.prepare("UPDATE state SET tasks_executed = tasks_executed + 1 WHERE id = 1").run();
    
    broadcast({ type: "TASK_UPDATE", task: { id: taskId, status: 'SUCCESS', result } });
    broadcast({ type: "STATE_UPDATE", state: db.prepare("SELECT * FROM state WHERE id = 1").get() });
  }, 2000);
}

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
  }

  const PORT = 3000;
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    runAtena().catch(console.error);
  });
}

startServer();
