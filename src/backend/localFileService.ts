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
    const entries = await fs.readdir(baseDir, { withFileTypes: true });
    const items: FileItem[] = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(baseDir, entry.name);
        try {
          const stats = await fs.stat(fullPath);
          return {
            name: entry.name,
            path: fullPath,
            size: stats.size,
            modifyTime: stats.mtimeMs,
            type: entry.isDirectory() ? 'directory' : 'file',
          };
        } catch (err) {
          // Skip files we can't access
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
