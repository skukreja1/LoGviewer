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

  async listLogs(config: SSHConfig, baseDir: string = '/var/log') {
    try {
      await this.connect(config);
      
      // Recursive list is heavy, let's do a controlled depth or just flat for now
      // but the requirement says "Recursively scans /var/log"
      // ssh2-sftp-client has a list method but not recursive by default
      
      const files: any[] = [];
      
      const scan = async (dir: string) => {
        const list = await this.sftp.list(dir);
        for (const item of list) {
          const fullPath = path.join(dir, item.name);
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
    return new Promise<string>((resolve, reject) => {
      const conn = new SSHClient();
      conn.on('ready', () => {
        // Use 'tail' command for preview
        conn.exec(`tail -n ${lines} "${filePath}"`, (err, stream) => {
          if (err) {
            conn.end();
            return reject(err);
          }
          let data = '';
          stream.on('data', (chunk: Buffer) => {
            data += chunk.toString();
          }).on('close', () => {
            conn.end();
            resolve(data);
          }).stderr.on('data', (data: Buffer) => {
            console.error('STDERR: ' + data);
          });
        });
      }).on('error', (err) => {
        reject(err);
      }).connect({
        host: config.host,
        port: config.port,
        username: config.username,
        password: config.password,
        privateKey: config.privateKey,
        passphrase: config.passphrase,
      });
    });
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
