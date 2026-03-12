import express from "express";
import { createServer as createViteServer } from "vite";
import session from "express-session";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import archiver from "archiver";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import db from "./src/backend/db.ts";
import { LogService, SSHConfig } from "./src/backend/sshService.ts";
import { LocalFileService } from "./src/backend/localFileService.ts";

const app = express();
const PORT = 3000;
const SECRET = process.env.APP_SECRET || "default-secret";

app.use(express.json());
app.use(cookieParser());
app.use(
  session({
    secret: SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: true, 
        sameSite: 'none',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 
    },
  })
);

const logService = new LogService();
const localFileService = new LocalFileService();

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Auth Middleware
const authenticate = (req: any, res: any, next: any) => {
  const token = req.cookies.token;
  if (!token) {
    console.log("Authentication failed: No token cookie found");
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const decoded = jwt.verify(token, SECRET) as any;
    req.user = decoded;
    next();
  } catch (err) {
    console.log("Authentication failed: Invalid token", err);
    res.status(401).json({ error: "Invalid token" });
  }
};

// API Routes
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  console.log(`Login attempt for user: ${username}`);
  
  try {
    const user: any = db.prepare("SELECT * FROM users WHERE username = ?").get(username);

    if (user && bcrypt.compareSync(password, user.password)) {
      const token = jwt.sign({ id: user.id, username: user.username }, SECRET, {
        expiresIn: "24h",
      });
      res.cookie("token", token, { 
        httpOnly: true,
        secure: true,
        sameSite: 'none'
      });
      console.log(`Login successful for user: ${username}`);
      res.json({ success: true, user: { id: user.id, username: user.username } });
    } else {
      console.log(`Login failed for user: ${username} - Invalid credentials`);
      res.status(401).json({ error: "Invalid credentials" });
    }
  } catch (err: any) {
    console.error(`Login error for user: ${username}:`, err);
    res.status(500).json({ error: "Internal server error during login" });
  }
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: true,
    sameSite: 'none'
  });
  res.json({ success: true });
});

// SSH Connection Management
app.post("/api/ssh/connect", authenticate, async (req: any, res) => {
  const config: SSHConfig = req.body;
  
  try {
    // Test connection
    const logService = new LogService();
    await logService.testConnection(config);
    
    // Store config in session (In production, encrypt this!)
    req.session.sshConfig = config;
    res.json({ success: true, message: "Connected successfully" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/ssh/disconnect", authenticate, (req: any, res) => {
  req.session.sshConfig = null;
  req.session.localMode = false;
  res.json({ success: true });
});

app.post("/api/local/connect", authenticate, (req: any, res) => {
  req.session.localMode = true;
  req.session.sshConfig = null;
  res.json({ success: true, message: "Local mode enabled" });
});

app.get("/api/logs", authenticate, async (req: any, res) => {
  const sshConfig = req.session.sshConfig;
  const localMode = req.session.localMode;
  
  if (!sshConfig && !localMode) {
    return res.status(400).json({ error: "No active connection" });
  }

  const baseDir = (req.query.path as string) || "/";
  
  // Security: Prevent directory traversal
  // We allow absolute paths (starting with / or a drive letter like C:/)
  const isWindowsPath = /^[a-zA-Z]:\//.test(baseDir);
  const isAbsolutePath = baseDir.startsWith("/");
  
  if ((!isAbsolutePath && !isWindowsPath) || baseDir.includes("..")) {
      return res.status(400).json({ error: "Invalid path format. Use absolute paths (e.g. /var/log or C:/logs)" });
  }

  try {
    if (localMode) {
      const logs = await localFileService.listFiles(baseDir);
      res.json(logs);
    } else {
      const logs = await logService.listLogs(sshConfig, baseDir);
      res.json(logs);
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/logs/preview", authenticate, async (req: any, res) => {
  const sshConfig = req.session.sshConfig;
  const localMode = req.session.localMode;
  
  if (!sshConfig && !localMode) {
    return res.status(400).json({ error: "No active connection" });
  }

  const filePath = req.query.path as string;
  if (!filePath || filePath.includes("..")) {
      return res.status(400).json({ error: "Invalid file path" });
  }

  try {
    if (localMode) {
      const preview = await localFileService.getPreview(filePath);
      res.json({ content: preview });
    } else {
      const preview = await logService.getPreview(sshConfig, filePath);
      res.json({ content: preview });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/download-file", authenticate, async (req: any, res) => {
  const sshConfig = req.session.sshConfig;
  const localMode = req.session.localMode;
  
  if (!sshConfig && !localMode) {
    return res.status(400).json({ error: "No active connection" });
  }

  const filePath = req.query.path as string;
  if (!filePath || filePath.includes("..")) {
      return res.status(400).json({ error: "Invalid file path" });
  }

  try {
    let stream;
    if (localMode) {
      stream = localFileService.getFileStream(filePath);
      res.setHeader("Content-Disposition", `attachment; filename="${path.basename(filePath)}"`);
    } else {
      stream = await logService.getFileStream(sshConfig, filePath);
      res.setHeader("Content-Disposition", `attachment; filename="${path.posix.basename(filePath)}"`);
    }
    
    if (stream instanceof Buffer) {
        res.send(stream);
    } else if (typeof stream === 'string') {
        res.send(stream);
    } else {
        stream.pipe(res);
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/download-zip", authenticate, async (req: any, res) => {
  const sshConfig = req.session.sshConfig;
  const localMode = req.session.localMode;
  
  if (!sshConfig && !localMode) {
    return res.status(400).json({ error: "No active connection" });
  }

  const { paths } = req.body;
  if (!Array.isArray(paths) || paths.length === 0) {
    return res.status(400).json({ error: "No paths provided" });
  }

  // Security: Validate all paths
  for (const p of paths) {
      if (typeof p !== 'string' || p.includes("..")) {
          return res.status(400).json({ error: `Invalid path: ${p}` });
      }
  }

  const archive = archiver("zip", { zlib: { level: 9 } });
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", 'attachment; filename="logs.zip"');

  archive.pipe(res);

  try {
    for (const filePath of paths) {
      let stream;
      if (localMode) {
        stream = localFileService.getFileStream(filePath);
        archive.append(stream as any, { name: path.basename(filePath) });
      } else {
        stream = await logService.getFileStream(sshConfig, filePath);
        archive.append(stream as any, { name: path.posix.basename(filePath) });
      }
    }
    await archive.finalize();
  } catch (err: any) {
    console.error("ZIP Error:", err);
    if (!res.headersSent) {
        res.status(500).json({ error: err.message });
    }
  }
});

// Vite middleware for development
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*", (req, res) => {
      res.sendFile(path.resolve("dist/index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
