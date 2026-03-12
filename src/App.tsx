import React, { useState, useEffect, useMemo } from 'react';
import { 
  LogIn, 
  Server, 
  FileText, 
  Download, 
  Search, 
  RefreshCw, 
  LogOut, 
  ChevronRight, 
  ChevronDown, 
  File, 
  Folder,
  CheckSquare,
  Square,
  Loader2,
  AlertCircle,
  X,
  Eye,
  Home
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface User {
  id: number;
  username: string;
}

interface LogFile {
  name: string;
  path: string;
  size: number;
  modifyTime: number;
  type: 'file' | 'directory';
}

interface SSHConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [sshConfig, setSshConfig] = useState<SSHConfig>({
    host: '',
    port: 22,
    username: '',
    password: '',
  });
  const [isConnected, setIsConnected] = useState(false);
  const [localMode, setLocalMode] = useState(false);
  const [logs, setLogs] = useState<LogFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [previewFile, setPreviewFile] = useState<LogFile | null>(null);
  const [previewContent, setPreviewContent] = useState<string>('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [baseDir, setBaseDir] = useState('/');

  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [serverCwd, setServerCwd] = useState<string>('/');

  // Check auth and server health on mount
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch('/api/health');
        if (res.ok) {
          const data = await res.json();
          setServerStatus('online');
          if (data.cwd) setServerCwd(data.cwd);
        }
        else setServerStatus('offline');
      } catch {
        setServerStatus('offline');
      }
    };
    checkHealth();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm),
      });
      const data = await res.json();
      if (data.success) {
        setUser(data.user);
        setIsLoggedIn(true);
      } else {
        setError(data.error);
      }
    } catch (err: any) {
      setError(err.message || 'Connection failed');
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ssh/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sshConfig),
      });
      const data = await res.json();
      if (data.success) {
        setIsConnected(true);
        fetchLogs();
      } else {
        const msg = data.error || 'Unknown connection error';
        setError(`Connection failed: ${msg}. Please check your host, port, and credentials.`);
      }
    } catch (err) {
      setError('SSH Connection failed: Network error or server unreachable from this environment.');
    } finally {
      setLoading(false);
    }
  };

  const handleLocalConnect = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/local/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success) {
        setIsConnected(true);
        setLocalMode(true);
        fetchLogs();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to enable local mode');
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async (pathOverride?: string) => {
    setLoading(true);
    setError(null);
    const targetPath = pathOverride || baseDir;
    try {
      const res = await fetch(`/api/logs?path=${encodeURIComponent(targetPath)}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setLogs(data);
        if (pathOverride) setBaseDir(pathOverride);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to fetch logs');
    } finally {
      setLoading(false);
    }
  };

  const handleFolderClick = (path: string) => {
    fetchLogs(path);
  };

  const handleGoBack = () => {
    const parts = baseDir.split('/').filter(Boolean);
    if (parts.length > 0) {
      parts.pop();
      const parentPath = '/' + parts.join('/');
      fetchLogs(parentPath || '/');
    }
  };

  const handlePreview = async (file: LogFile) => {
    setPreviewFile(file);
    setPreviewLoading(true);
    setPreviewContent('');
    try {
      const res = await fetch(`/api/logs/preview?path=${encodeURIComponent(file.path)}`);
      const data = await res.json();
      if (data.content) {
        setPreviewContent(data.content);
      } else {
        setPreviewContent('Error: ' + (data.error || 'Could not load preview'));
      }
    } catch (err) {
      setPreviewContent('Error: Failed to fetch preview');
    } finally {
      setPreviewLoading(false);
    }
  };

  const downloadFile = (path: string) => {
    window.location.href = `/api/download-file?path=${encodeURIComponent(path)}`;
  };

  const downloadZip = async () => {
    if (selectedPaths.size === 0) return;
    
    setLoading(true);
    try {
      const res = await fetch('/api/download-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: Array.from(selectedPaths) }),
      });
      
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'logs.zip';
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        const data = await res.json();
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to download ZIP');
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (path: string) => {
    const next = new Set(selectedPaths);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    setSelectedPaths(next);
  };

  const toggleSelectAll = () => {
    const filesOnly = filteredLogs.filter(l => l.type === 'file');
    if (selectedPaths.size === filesOnly.length && filesOnly.length > 0) {
      setSelectedPaths(new Set());
    } else {
      setSelectedPaths(new Set(filesOnly.map(l => l.path)));
    }
  };

  const filteredLogs = useMemo(() => {
    return logs.filter(l => 
      l.name.toLowerCase().includes(search.toLowerCase()) || 
      l.path.toLowerCase().includes(search.toLowerCase())
    );
  }, [logs, search]);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-[#E4E3E0] flex items-center justify-center p-4 font-sans">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-white border border-[#141414] shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] p-8"
        >
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#141414] flex items-center justify-center text-white">
                <LogIn size={24} />
              </div>
              <h1 className="text-2xl font-bold tracking-tight uppercase italic">Secure Log Explorer</h1>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${serverStatus === 'online' ? 'bg-green-500' : serverStatus === 'offline' ? 'bg-red-500' : 'bg-gray-400 animate-pulse'}`} />
              <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">{serverStatus}</span>
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-evenly flex flex-col gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest opacity-50">Username</label>
              <input 
                type="text" 
                required
                className="w-full border-b-2 border-[#141414] py-2 focus:outline-none focus:border-orange-500 transition-colors"
                value={loginForm.username}
                onChange={e => setLoginForm({ ...loginForm, username: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest opacity-50">Password</label>
              <input 
                type="password" 
                required
                className="w-full border-b-2 border-[#141414] py-2 focus:outline-none focus:border-orange-500 transition-colors"
                value={loginForm.password}
                onChange={e => setLoginForm({ ...loginForm, password: e.target.value })}
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 border border-red-200">
                <AlertCircle size={16} />
                <span className="text-sm font-medium">{error}</span>
              </div>
            )}

            {serverStatus === 'offline' && (
              <button 
                type="button"
                onClick={() => window.location.reload()}
                className="text-[10px] font-bold uppercase tracking-widest text-orange-600 hover:underline text-center"
              >
                Server offline. Click to retry connection.
              </button>
            )}

            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-[#141414] text-white py-4 font-bold uppercase tracking-widest hover:bg-orange-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin" size={20} /> : 'Login'}
            </button>
          </form>
          <p className="mt-6 text-xs text-center opacity-40">Default credentials: admin / admin123</p>
        </motion.div>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-[#E4E3E0] p-8 font-sans">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-between items-center mb-12">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#141414] flex items-center justify-center text-white">
                <Server size={24} />
              </div>
              <h1 className="text-3xl font-bold tracking-tighter uppercase italic">Connection Setup</h1>
            </div>
            <div className="flex items-center gap-4">
              <button 
                onClick={handleLocalConnect}
                disabled={loading}
                className="bg-white border border-[#141414] px-4 py-2 text-xs font-bold uppercase tracking-widest hover:bg-gray-100 transition-colors"
              >
                Browse Local Files
              </button>
              <button 
                onClick={() => setIsLoggedIn(false)}
                className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest hover:text-orange-600 transition-colors"
              >
                <LogOut size={16} /> Logout
              </button>
            </div>
          </div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white border border-[#141414] shadow-[12px_12px_0px_0px_rgba(20,20,20,1)] p-10"
          >
            <form onSubmit={handleConnect} className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest opacity-50">Host Address</label>
                  <input 
                    type="text" 
                    placeholder="e.g. 192.168.1.100"
                    required
                    className="w-full border-b-2 border-[#141414] py-2 focus:outline-none focus:border-orange-500"
                    value={sshConfig.host}
                    onChange={e => setSshConfig({ ...sshConfig, host: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest opacity-50">Port</label>
                  <input 
                    type="number" 
                    required
                    className="w-full border-b-2 border-[#141414] py-2 focus:outline-none focus:border-orange-500"
                    value={sshConfig.port}
                    onChange={e => setSshConfig({ ...sshConfig, port: parseInt(e.target.value) })}
                  />
                </div>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest opacity-50">SSH Username</label>
                  <input 
                    type="text" 
                    required
                    className="w-full border-b-2 border-[#141414] py-2 focus:outline-none focus:border-orange-500"
                    value={sshConfig.username}
                    onChange={e => setSshConfig({ ...sshConfig, username: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest opacity-50">Password / Passphrase</label>
                  <input 
                    type="password" 
                    className="w-full border-b-2 border-[#141414] py-2 focus:outline-none focus:border-orange-500"
                    value={sshConfig.password}
                    onChange={e => setSshConfig({ ...sshConfig, password: e.target.value })}
                  />
                </div>
              </div>

              <div className="md:col-span-2 space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest opacity-50">Initial Directory</label>
                <input 
                  type="text" 
                  className="w-full border-b-2 border-[#141414] py-2 focus:outline-none focus:border-orange-500 font-mono"
                  value={baseDir}
                  onChange={e => setBaseDir(e.target.value)}
                />
              </div>

              <div className="md:col-span-2 space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest opacity-50">Private Key (Optional PEM)</label>
                <textarea 
                  className="w-full border-2 border-[#141414] p-4 h-32 font-mono text-sm focus:outline-none focus:border-orange-500"
                  placeholder="-----BEGIN RSA PRIVATE KEY-----"
                  value={sshConfig.privateKey}
                  onChange={e => setSshConfig({ ...sshConfig, privateKey: e.target.value })}
                />
              </div>

              {error && (
                <div className="md:col-span-2 flex items-center gap-2 text-red-600 bg-red-50 p-4 border border-red-200">
                  <AlertCircle size={20} />
                  <span className="font-medium">{error}</span>
                </div>
              )}

              <div className="md:col-span-2">
                <button 
                  type="submit" 
                  disabled={loading}
                  className="w-full bg-[#141414] text-white py-5 font-bold uppercase tracking-[0.2em] hover:bg-orange-600 transition-colors flex items-center justify-center gap-3 disabled:opacity-50"
                >
                  {loading ? <Loader2 className="animate-spin" size={24} /> : (
                    <>
                      <Server size={20} /> Establish Connection
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
          <div className="mt-8 bg-white/50 border border-[#141414]/10 p-4 text-[10px] font-bold uppercase tracking-widest opacity-50">
            Note: This explorer works with any server supporting SFTP (Linux, macOS, Windows with OpenSSH). 
            For Windows, use paths like <code className="bg-gray-200 px-1">C:/Users</code> or <code className="bg-gray-200 px-1">/</code>.
            <br /><br />
            <strong>No SSH?</strong> Use "Browse Local Files" to explore files directly on this server or any network shares mounted to it.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#E4E3E0] flex flex-col font-sans">
      {/* Header */}
      <header className="bg-white border-b border-[#141414] p-6 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-[#141414] flex items-center justify-center text-white">
            <FileText size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tighter uppercase italic leading-none">
              {localMode ? 'Local File Explorer' : 'Log Explorer'}
            </h1>
            <p className="text-xs font-bold opacity-40 uppercase tracking-widest mt-1">
              {localMode ? 'Browsing Server Filesystem' : `${sshConfig.username}@${sshConfig.host}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 opacity-30" size={18} />
            <input 
              type="text" 
              placeholder="Filter logs..."
              className="pl-10 pr-4 py-2 border-b-2 border-[#141414] focus:outline-none focus:border-orange-500 w-64"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          
          <button 
            onClick={fetchLogs}
            disabled={loading}
            className="p-2 hover:bg-gray-100 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={loading ? 'animate-spin' : ''} size={20} />
          </button>

          <button 
            onClick={() => {
              setIsConnected(false);
              setLocalMode(false);
            }}
            className="bg-[#141414] text-white px-6 py-2 font-bold uppercase text-xs tracking-widest hover:bg-orange-600 transition-colors"
          >
            Disconnect
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-8">
        <div className="max-w-7xl mx-auto">
          {/* Controls */}
          <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
            <div className="flex items-center gap-2 flex-1">
              <button 
                onClick={handleGoBack}
                disabled={baseDir === '/' || loading}
                className="bg-white border border-[#141414] p-3 hover:bg-gray-100 disabled:opacity-30"
                title="Go Back"
              >
                <ChevronRight className="rotate-180" size={18} />
              </button>
              <button 
                onClick={() => fetchLogs(serverCwd)}
                disabled={loading}
                className="bg-white border border-[#141414] p-3 hover:bg-gray-100 disabled:opacity-30"
                title="Go to App Root"
              >
                <Home size={18} />
              </button>
              <div className="flex items-center gap-4 bg-white border border-[#141414] p-2 pr-4 flex-1">
                <div className="bg-[#141414] text-white p-2">
                  <Folder size={18} />
                </div>
                <input 
                  type="text" 
                  className="focus:outline-none font-mono text-sm w-full"
                  value={baseDir}
                  onChange={e => setBaseDir(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && fetchLogs()}
                />
              </div>
            </div>

            <div className="flex items-center gap-4">
              <span className="text-xs font-bold uppercase opacity-50">{selectedPaths.size} selected</span>
              <button 
                onClick={downloadZip}
                disabled={selectedPaths.size === 0 || loading}
                className="flex items-center gap-2 bg-white border border-[#141414] px-6 py-3 font-bold uppercase text-xs tracking-widest hover:bg-[#141414] hover:text-white transition-all disabled:opacity-30"
              >
                <Download size={16} /> Download ZIP
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white border border-[#141414] shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] overflow-hidden">
            <div className="grid grid-cols-[48px_1fr_120px_180px_120px] border-bottom border-[#141414] bg-gray-50 text-[10px] font-bold uppercase tracking-widest p-4 opacity-50">
              <div className="flex items-center justify-center">
                <button onClick={toggleSelectAll}>
                  {selectedPaths.size === filteredLogs.length && filteredLogs.length > 0 ? <CheckSquare size={16} /> : <Square size={16} />}
                </button>
              </div>
              <div>File Name / Path</div>
              <div className="text-right">Size</div>
              <div className="text-center">Modified</div>
              <div className="text-center">Actions</div>
            </div>

            <div className="divide-y divide-gray-100 max-h-[60vh] overflow-y-auto">
              {loading && logs.length === 0 ? (
                <div className="p-20 flex flex-col items-center justify-center gap-4 opacity-30">
                  <Loader2 className="animate-spin" size={48} />
                  <span className="font-bold uppercase tracking-widest">Scanning remote filesystem...</span>
                </div>
              ) : filteredLogs.length === 0 ? (
                <div className="p-20 text-center opacity-30 font-bold uppercase tracking-widest">
                  No files or folders found in this directory
                </div>
              ) : (
                filteredLogs.map(log => (
                  <div 
                    key={log.path} 
                    className={`grid grid-cols-[48px_1fr_120px_180px_120px] items-center p-4 hover:bg-orange-50 transition-colors group ${selectedPaths.has(log.path) ? 'bg-orange-50/50' : ''}`}
                  >
                    <div className="flex items-center justify-center">
                      {log.type === 'file' ? (
                        <button onClick={() => toggleSelect(log.path)}>
                          {selectedPaths.has(log.path) ? <CheckSquare size={16} className="text-orange-600" /> : <Square size={16} className="opacity-20 group-hover:opacity-100" />}
                        </button>
                      ) : (
                        <Folder size={16} className="opacity-30" />
                      )}
                    </div>
                    <div className="overflow-hidden">
                      {log.type === 'directory' ? (
                        <button 
                          onClick={() => handleFolderClick(log.path)}
                          className="flex items-center gap-3 hover:text-orange-600 transition-colors text-left w-full"
                        >
                          <Folder size={18} className="text-orange-400 shrink-0" />
                          <div className="truncate font-bold">{log.name}</div>
                        </button>
                      ) : (
                        <div className="flex items-center gap-3">
                          <FileText size={18} className="text-blue-400 shrink-0" />
                          <div className="truncate">
                            <div className="font-bold">{log.name}</div>
                            <div className="text-[10px] opacity-40 font-mono truncate">{log.path}</div>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="text-right font-mono text-xs opacity-60">
                      {log.type === 'directory' ? '--' : `${(log.size / 1024).toFixed(1)} KB`}
                    </div>
                    <div className="text-center text-xs opacity-60">
                      {new Date(log.modifyTime).toLocaleString()}
                    </div>
                    <div className="flex items-center justify-center gap-2">
                      {log.type === 'file' && (
                        <>
                          <button 
                            onClick={() => handlePreview(log)}
                            className="p-2 hover:bg-[#141414] hover:text-white transition-all"
                            title="Preview"
                          >
                            <Eye size={16} />
                          </button>
                          <button 
                            onClick={() => downloadFile(log.path)}
                            className="p-2 hover:bg-[#141414] hover:text-white transition-all"
                            title="Download"
                          >
                            <Download size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Preview Modal */}
      <AnimatePresence>
        {previewFile && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-12">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPreviewFile(null)}
              className="absolute inset-0 bg-[#141414]/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-5xl bg-white border border-[#141414] shadow-[20px_20px_0px_0px_rgba(0,0,0,0.3)] flex flex-col max-h-full"
            >
              <div className="p-6 border-b border-[#141414] flex justify-between items-center bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-[#141414] flex items-center justify-center text-white">
                    <Eye size={18} />
                  </div>
                  <div>
                    <h2 className="font-bold uppercase tracking-tight">{previewFile.name}</h2>
                    <p className="text-[10px] font-mono opacity-40">{previewFile.path}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setPreviewFile(null)}
                  className="p-2 hover:bg-red-50 hover:text-red-600 transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-auto bg-[#141414] text-green-400 p-6 font-mono text-xs leading-relaxed selection:bg-green-400 selection:text-[#141414]">
                {previewLoading ? (
                  <div className="h-64 flex flex-col items-center justify-center gap-4 opacity-50">
                    <Loader2 className="animate-spin" size={32} />
                    <span className="uppercase tracking-widest text-[10px]">Reading last 200 lines...</span>
                  </div>
                ) : (
                  <pre className="whitespace-pre-wrap">{previewContent || 'File is empty'}</pre>
                )}
              </div>

              <div className="p-4 border-t border-[#141414] flex justify-end gap-4 bg-gray-50">
                <button 
                  onClick={() => downloadFile(previewFile.path)}
                  className="bg-[#141414] text-white px-6 py-2 font-bold uppercase text-xs tracking-widest hover:bg-orange-600 transition-colors flex items-center gap-2"
                >
                  <Download size={14} /> Download Full File
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer Status */}
      <footer className="bg-white border-t border-[#141414] px-6 py-2 flex justify-between items-center text-[10px] font-bold uppercase tracking-widest opacity-40">
        <div className="flex items-center gap-4">
          <span>Status: Connected</span>
          <span>Files: {logs.length}</span>
        </div>
        <div>Secure Log Explorer v1.0</div>
      </footer>
    </div>
  );
}
