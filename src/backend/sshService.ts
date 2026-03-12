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
    try {
      await sftp.connect({
        host: config.host,
        port: config.port,
        username: config.username,
        password: config.password,
        privateKey: config.privateKey,
        passphrase: config.passphrase,
        readyTimeout: 20000,
        // Windows OpenSSH often works better with these
        tryKeyboard: true,
        keepaliveInterval: 10000,
        keepaliveCountMax: 3,
      });
      return sftp;
    } catch (err: any) {
      // Provide more context for common errors
      if (err.message.includes('All configured authentication methods failed')) {
        throw new Error('Authentication failed. Please check your username and password/key.');
      }
      if (err.code === 'ETIMEDOUT' || err.message.includes('timed out')) {
        throw new Error('Connection timed out. Ensure the host is reachable and the port is correct.');
      }
      throw err;
    }
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
      const list = await sftp.list(baseDir);
      const items = list.map(item => ({
        name: item.name,
        path: path.posix.join(baseDir, item.name),
        size: item.size,
        modifyTime: item.modifyTime,
        type: item.type === 'd' ? 'directory' : 'file',
      }));
      
      // Sort: directories first, then files, both alphabetically
      return items.sort((a, b) => {
        if (a.type === b.type) {
          return a.name.localeCompare(b.name);
        }
        return a.type === 'directory' ? -1 : 1;
      });
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
