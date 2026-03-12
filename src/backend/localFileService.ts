import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';

export interface FileItem {
  name: string;
  path: string;
  size: number;
  modifyTime: number;
  type: 'file' | 'directory';
}

export class LocalFileService {
  async listFiles(baseDir: string): Promise<FileItem[]> {
    console.log(`Listing local files for directory: ${baseDir}`);
    
    // Check for UNC paths on non-Windows systems
    if ((baseDir.startsWith('\\\\') || baseDir.startsWith('//')) && process.platform !== 'win32') {
      throw new Error(`UNC paths (\\\\hostname) are not natively supported in this Linux environment. Please use the SSH Connection feature to access remote logs.`);
    }

    try {
      const stats = await fs.stat(baseDir);
      if (!stats.isDirectory()) {
        throw new Error(`Path is not a directory: ${baseDir}`);
      }

      const entries = await fs.readdir(baseDir, { withFileTypes: true });
      console.log(`Found ${entries.length} entries in ${baseDir}`);
      const items: FileItem[] = await Promise.all(
        entries.map(async (entry) => {
          const fullPath = path.join(baseDir, entry.name);
          try {
            const entryStats = await fs.stat(fullPath);
            return {
              name: entry.name,
              path: fullPath,
              size: entryStats.size,
              modifyTime: entryStats.mtimeMs,
              type: entry.isDirectory() ? 'directory' : 'file',
            };
          } catch (err) {
            console.warn(`Could not stat file: ${fullPath}`, err);
            return null as any;
          }
        })
      );

      return items
        .filter(item => item !== null)
        .sort((a, b) => {
          if (a.type === b.type) {
            return a.name.localeCompare(b.name);
          }
          return a.type === 'directory' ? -1 : 1;
        });
    } catch (err: any) {
      console.error(`Error listing files in ${baseDir}:`, err);
      if (err.code === 'ENOENT') {
        throw new Error(`Directory does not exist: ${baseDir}`);
      }
      if (err.code === 'EACCES') {
        throw new Error(`Permission denied: ${baseDir}`);
      }
      throw new Error(`Failed to list files in ${baseDir}: ${err.message}`);
    }
  }

  async getPreview(filePath: string, lines: number = 200): Promise<string> {
    const stats = await fs.stat(filePath);
    const size = stats.size;
    if (size === 0) return "";

    const readSize = Math.min(size, 16384);
    const start = Math.max(0, size - readSize);
    
    const buffer = Buffer.alloc(readSize);
    const fileHandle = await fs.open(filePath, 'r');
    try {
      await fileHandle.read(buffer, 0, readSize, start);
      const content = buffer.toString('utf8');
      const allLines = content.split(/\r?\n/);
      return allLines.slice(-lines).join('\n');
    } finally {
      await fileHandle.close();
    }
  }

  getFileStream(filePath: string) {
    return createReadStream(filePath);
  }
}
