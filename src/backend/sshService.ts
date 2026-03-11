import Client from 'ssh2-sftp-client';
import { Client as SSHClient } from 'ssh2';
import path from 'path';

export interface SSHConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
}

export class LogService {
  private sftp: Client;

  constructor() {
    this.sftp = new Client();
  }

  private async connect(config: SSHConfig) {
    await this.sftp.connect({
      host: config.host,
      port: config.port,
      username: config.username,
      password: config.password,
      privateKey: config.privateKey,
      passphrase: config.passphrase,
      readyTimeout: 10000,
    });
  }

  async listLogs(config: SSHConfig, baseDir: string = '/u01/app/oracle/orpos') {
    try {
      await this.connect(config);
      
      // Recursive list is heavy, let's do a controlled depth or just flat for now
      // but the requirement says "Recursively scans /var/log"
      // ssh2-sftp-client has a list method but not recursive by default
      
      const files: any[] = [];
      
      const scan = async (dir: string) => {
        const list = await this.sftp.list(dir);
        for (const item of list) {
          const fullPath = path.posix.join(dir, item.name);
          if (item.type === 'd') {
            // Avoid infinite loops or too deep recursion for demo
            // In production, we'd limit this
            try {
              await scan(fullPath);
            } catch (e) {
              // Skip directories we can't access
            }
          } else {
            // Check if it's a log file
            const isLog = item.name.endsWith('.log') || 
                          item.name.endsWith('.out') || 
                          item.name.endsWith('.txt') || 
                          !item.name.includes('.');
            
            if (isLog) {
              files.push({
                name: item.name,
                path: fullPath,
                size: item.size,
                modifyTime: item.modifyTime,
              });
            }
          }
        }
      };

      await scan(baseDir);
      return files;
    } finally {
      await this.sftp.end();
    }
  }

  async getPreview(config: SSHConfig, filePath: string, lines: number = 200) {
    const sftp = new Client();
    try {
      await sftp.connect({
        host: config.host,
        port: config.port,
        username: config.username,
        password: config.password,
        privateKey: config.privateKey,
        passphrase: config.passphrase,
      });

      const stats = await sftp.stat(filePath);
      const size = stats.size;
      
      if (size === 0) return "";

      // Read the last 16KB of the file as a heuristic for 200 lines
      // If the file is smaller, read from the beginning
      const readSize = Math.min(size, 16384); 
      const start = size - readSize;
      const end = size - 1;

      const buffer = await sftp.get(filePath, undefined, { start, end });
      const content = buffer.toString('utf8');
      
      // Split by lines and take the last N
      const allLines = content.split(/\r?\n/);
      return allLines.slice(-lines).join('\n');
    } finally {
      await sftp.end();
    }
  }

  async getFileStream(config: SSHConfig, filePath: string) {
    const sftp = new Client();
    await sftp.connect({
        host: config.host,
        port: config.port,
        username: config.username,
        password: config.password,
        privateKey: config.privateKey,
        passphrase: config.passphrase,
    });
    
    // We need to return the stream and ensure connection closes after stream ends
    // This is tricky with ssh2-sftp-client's get() which returns a stream or buffer
    const stream = await sftp.get(filePath);
    
    // Wrap stream to close sftp on end
    if (typeof stream !== 'string' && !(stream instanceof Buffer)) {
        stream.on('end', () => sftp.end());
        stream.on('error', () => sftp.end());
    } else {
        await sftp.end();
    }
    
    return stream;
  }
}
