"use client";

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await login(username, password);
    if (!success) {
      setError('Invalid username or password combinations for this zone.');
    }
  };

  return (
    <div className="flex justify-center items-center min-h-screen">
      <div className="bg-slate-800/70 backdrop-blur-md border border-white/10 rounded-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] p-10 w-full max-w-md flex flex-col gap-6 animate-in slide-in-from-bottom-5 duration-500">
        <h1 className="m-0 text-3xl font-bold text-center">🔒 Admin Zone Auth</h1>
        
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label className="text-sm text-slate-400">Network Username</label>
            <input 
              type="text" 
              value={username} 
              onChange={(e) => setUsername(e.target.value)} 
              placeholder="e.g. system_super"
              className="p-3 rounded-lg border border-white/20 bg-black/20 text-white text-base transition-all duration-300 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm text-slate-400">Password Key</label>
            <input 
              type="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              placeholder="Enter encrypted key..."
              className="p-3 rounded-lg border border-white/20 bg-black/20 text-white text-base transition-all duration-300 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
              required
            />
            {error && <span className="text-red-500 text-sm">{error}</span>}
          </div>
          <button type="submit" className="py-3 px-6 rounded-lg border-none text-base font-semibold cursor-pointer transition-all duration-300 bg-blue-500 text-white hover:bg-blue-600 hover:-translate-y-0.5">
            Authenticate Session
          </button>
        </form>
      </div>
    </div>
  );
}
