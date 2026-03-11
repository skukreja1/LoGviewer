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
  private async createClient(config: SSHConfig) {
    const sftp = new Client();
    await sftp.connect({
      host: config.host,
      port: config.port,
      username: config.username,
      password: config.password,
      privateKey: config.privateKey,
      passphrase: config.passphrase,
      readyTimeout: 15000, // Increased timeout
    });
    return sftp;
  }

  async testConnection(config: SSHConfig) {
    const sftp = await this.createClient(config);
    try {
      return true;
    } finally {
      await sftp.end();
    }
  }

  async listLogs(config: SSHConfig, baseDir: string = '/u01/app/oracle/orpos') {
    const sftp = await this.createClient(config);
    try {
      const files: any[] = [];
      
      const scan = async (dir: string) => {
        const list = await sftp.list(dir);
        for (const item of list) {
          const fullPath = path.posix.join(dir, item.name);
          if (item.type === 'd') {
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
      await sftp.end();
    }
  }

  async getPreview(config: SSHConfig, filePath: string, lines: number = 200) {
    const sftp = await this.createClient(config);
    try {
      const stats = await sftp.stat(filePath);
      const size = stats.size;
      
      if (size === 0) return "";

      // Read the last 16KB of the file as a heuristic for 200 lines
      const readSize = Math.min(size, 16384); 
      const start = size - readSize;
      const end = size - 1;

      const buffer = await sftp.get(filePath, undefined, { start, end });
      const content = buffer.toString('utf8');
      
      const allLines = content.split(/\r?\n/);
      return allLines.slice(-lines).join('\n');
    } finally {
      await sftp.end();
    }
  }

  async getFileStream(config: SSHConfig, filePath: string) {
    const sftp = await this.createClient(config);
    
    const stream = await sftp.get(filePath);
    
    if (typeof stream !== 'string' && !(stream instanceof Buffer)) {
        stream.on('end', () => sftp.end());
        stream.on('error', () => sftp.end());
    } else {
        await sftp.end();
    }
    
    return stream;
  }
}
