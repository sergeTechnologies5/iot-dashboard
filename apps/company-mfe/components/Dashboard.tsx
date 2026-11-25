"use client";

import { useEffect, useState } from 'react';
import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

export default function Dashboard() {
  const { role, companyId, logout, hasPermission } = useAuth();

  // Permission Checks
  const canCreateCompany = hasPermission('COMPANY_CREATE');
  const canReadCompany = hasPermission('COMPANY_READ');
  const canCreateUser = hasPermission('USER_CREATE');
  const canReadUser = hasPermission('USER_READ');
  const canCreateDevice = hasPermission('DEVICE_CREATE');
  const canReadDevice = hasPermission('DEVICE_READ');
  const canUpdateDevice = hasPermission('DEVICE_UPDATE');
  const canAssignDevice = hasPermission('ASSIGN_DEVICE');
  const canAssignCompany = hasPermission('ASSIGN_COMPANY');
  const canMonitor = canReadDevice;

  // Tabs State
  type Tab = 'monitor' | 'users' | 'assignments';
  const [selectedTab, setActiveTab] = useState<Tab | null>(null);
  const defaultTab: Tab = canReadDevice ? 'monitor'
    : canReadUser ? 'users'
    : canAssignDevice ? 'assignments'
    : 'monitor';
  const activeTab: Tab = selectedTab ?? defaultTab;

  const [users, setUsers] = useState<{ id: string, name: string, role: string }[]>([]);
  const [newUser, setNewUser] = useState({ name: '', role: 'Operator', companyId: companyId || '' });

  const [companies, setCompanies] = useState<{ id: string, name: string }[]>([]);
  const [devices, setDevices] = useState<{ id: string, name: string }[]>([]);

  const [assignments, setAssignments] = useState<{ userId: string, deviceId: string }[]>([]);
  const [newAssignment, setNewAssignment] = useState({ userId: '', deviceId: '' });

  // Web Socket State (only relevant if they have access to d1)
  const [status, setStatus] = useState('--');
  const [temp, setTemp] = useState('--');

  useEffect(() => {
    const token = localStorage.getItem('token') || '';
    const client = new Client({
      webSocketFactory: () => new SockJS(`${process.env.NEXT_PUBLIC_API_URL ?? ""}/ws`),
      connectHeaders: { Authorization: `Bearer ${token}` },
      debug: () => { },
      onConnect: () => {
        client.subscribe("/topic/status", (msg: { body: string }) => setStatus(msg.body));
        client.subscribe("/topic/temp", (msg: { body: string }) => setTemp(msg.body));
      }
    });

    client.activate();
    return () => { if (client.active) client.deactivate(); };
  }, []);

  useEffect(() => {
    if (companyId) {
      api.get('/api/v1/companies').then(res => setCompanies(res.data));
      api.get(`/api/v1/users/company/${companyId}`).then(res => {
        setUsers(res.data.map((u: any) => ({
          id: String(u.id),
          name: u.username,
          role: u.role
        })));
      });
      api.get('/api/v1/devices').then(res => setDevices(res.data));
    }
  }, [companyId]);

  const sendLedCommand = async (state: string) => {
    try {
      await api.post(`/api/v1/devices/led?state=${state}`);
    } catch (err) {
      console.error(err);
    }
  };



  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newUser.name.trim()) {
      try {
        let backendRole = 'COMPANY_VIEWER';
        if (newUser.role === 'Manager') backendRole = 'COMPANY_MANAGER';
        if (newUser.role === 'Viewer') backendRole = 'COMPANY_VIEWER';
        await api.post('/api/v1/auth/register', {
          username: newUser.name,
          password: newUser.name, // Use name as default password structurally initially
          role: backendRole,
          companyId: parseInt(newUser.companyId || companyId || '0')
        });
        setUsers([...users, { id: `u${Date.now()}`, name: newUser.name, role: newUser.role }]);
        setNewUser({ name: '', role: 'Operator', companyId: companyId || '' });
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleAssignUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newAssignment.userId && newAssignment.deviceId) {
      try {
        await api.post(`/api/v1/devices/${newAssignment.deviceId}/assign/${newAssignment.userId}`);
        setAssignments([...assignments, newAssignment]);
      } catch (err) {
        console.error(err);
      }
    }
  };

  return (
    <div className="p-10 max-w-6xl mx-auto w-full animate-in fade-in duration-500">
      <header className="flex justify-between items-center mb-8 border-b border-white/10 pb-6">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">🏢 Company Zone</h1>
          <p className="text-slate-400 mt-2">Logged in as: <b className="text-purple-400">{role?.toUpperCase()}</b></p>
        </div>
        <button
          onClick={logout}
          className="py-2.5 px-5 rounded-lg text-sm font-semibold transition-all bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white"
        >
          Logout
        </button>
      </header>

      <nav className="flex gap-4 mb-8">
        {canMonitor && <button onClick={() => setActiveTab('monitor')} className={`px-4 py-2 rounded-lg font-medium transition-all ${activeTab === 'monitor' ? 'bg-purple-500 text-white shadow-[0_0_15px_rgba(168,85,247,0.3)]' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>My Devices</button>}
        {canReadUser && <button onClick={() => setActiveTab('users')} className={`px-4 py-2 rounded-lg font-medium transition-all ${activeTab === 'users' ? 'bg-purple-500 text-white shadow-[0_0_15px_rgba(168,85,247,0.3)]' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>Users ({users.length})</button>}
        {canAssignDevice && <button onClick={() => setActiveTab('assignments')} className={`px-4 py-2 rounded-lg font-medium transition-all ${activeTab === 'assignments' ? 'bg-purple-500 text-white shadow-[0_0_15px_rgba(168,85,247,0.3)]' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>Access Control</button>}
      </nav>

      {activeTab === 'monitor' && canMonitor && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-bottom-4">
          <div className="bg-slate-800/70 p-6 rounded-2xl border border-white/5">
            <h3 className="text-xl mb-4 text-slate-300 flex items-center gap-2">🌡️ Environmental Data</h3>
            <p className="text-5xl font-bold bg-gradient-to-r from-orange-400 to-red-500 bg-clip-text text-transparent">{temp} °C</p>
            <p className="mt-4 text-sm text-slate-400">Scoped to your {devices.length} active devices.</p>
          </div>
          <div className="bg-slate-800/70 p-6 rounded-2xl border border-white/5">
            <h3 className="text-xl mb-4 text-slate-300 flex items-center gap-2">📡 Status Overview</h3>
            <div className="flex items-center gap-2 text-base text-slate-400 uppercase mt-2">
              Main Device Link:
              <span className={`w-3 h-3 rounded-full transition-all duration-300 ${status === 'ON' ? 'bg-emerald-500 shadow-[0_0_12px_#10b981]' : status === 'OFF' ? 'bg-red-500 shadow-[0_0_12px_#ef4444]' : 'bg-slate-400'}`}></span>
              {status}
            </div>
            {canUpdateDevice && (
              <div className="mt-6 pt-6 border-t border-white/10">
                <h4 className="text-sm font-semibold text-slate-300 mb-3">Hardware Override Control</h4>
                <div className="flex gap-4">
                  <button onClick={() => sendLedCommand('ON')} className="flex-1 py-2 rounded-lg font-semibold bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-white transition-all text-sm">Turn ON</button>
                  <button onClick={() => sendLedCommand('OFF')} className="flex-1 py-2 rounded-lg font-semibold bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white transition-all text-sm">Turn OFF</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'users' && canReadUser && (
        <div className={`grid grid-cols-1 ${canCreateUser ? 'md:grid-cols-2' : ''} gap-8 animate-in slide-in-from-bottom-4`}>
          {canCreateUser && (
            <form onSubmit={handleCreateUser} className="bg-slate-800/70 p-6 rounded-2xl border border-white/5 flex flex-col gap-4">
              <h3 className="text-lg font-semibold border-b border-white/10 pb-2">Create User</h3>
              <input required type="text" placeholder="Full Name" value={newUser.name} onChange={e => setNewUser({ ...newUser, name: e.target.value })} className="p-3 bg-black/30 rounded-lg border border-white/10 outline-none focus:border-purple-500 text-sm" />
              <select value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value })} className="p-3 bg-black/30 rounded-lg border border-white/10 outline-none focus:border-purple-500 text-sm text-white">
                <option value="Operator">Operator</option>
                <option value="Viewer">Viewer</option>
                <option value="Manager">Manager</option>
              </select>
              <select required value={newUser.companyId} onChange={e => setNewUser({ ...newUser, companyId: e.target.value })} className="p-3 bg-black/30 rounded-lg border border-white/10 outline-none focus:border-purple-500 text-sm text-white">
                {companies.length === 0 && <option value="">-- No Companies --</option>}
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button type="submit" className="mt-2 py-3 bg-purple-600 rounded-lg font-semibold hover:bg-purple-500 transition-colors">Add User</button>
            </form>
          )}

          <div className="bg-slate-800/70 p-6 rounded-2xl border border-white/5 overflow-y-auto max-h-[300px]">
            <h3 className="text-lg font-semibold border-b border-white/10 pb-2 mb-4">Personnel</h3>
            <ul className="flex flex-col gap-3">
              {users.map(u => (
                <li key={u.id} className="p-3 bg-black/20 rounded-lg flex justify-between items-center text-sm border-l-2 border-purple-500">
                  <span className="font-semibold">{u.name}</span>
                  <span className="bg-purple-500/20 text-purple-300 px-2 py-1 rounded text-xs">{u.role}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {activeTab === 'assignments' && canAssignDevice && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in slide-in-from-bottom-4">
          <form onSubmit={handleAssignUser} className="bg-slate-800/70 p-6 rounded-2xl border border-white/5 flex flex-col gap-4">
            <h3 className="text-lg font-semibold border-b border-white/10 pb-2">Assign Device Access</h3>
            <label className="text-xs text-slate-400">Select User</label>
            <select required value={newAssignment.userId} onChange={e => setNewAssignment({ ...newAssignment, userId: e.target.value })} className="p-3 bg-black/30 rounded-lg border border-white/10 outline-none focus:border-purple-500 text-sm text-white">
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <label className="text-xs text-slate-400">Select Device</label>
            <select required value={newAssignment.deviceId} onChange={e => setNewAssignment({ ...newAssignment, deviceId: e.target.value })} className="p-3 bg-black/30 rounded-lg border border-white/10 outline-none focus:border-purple-500 text-sm text-white">
              {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <button type="submit" className="mt-2 py-3 bg-purple-600 rounded-lg font-semibold hover:bg-purple-500 transition-colors">Grant Access</button>
          </form>

          <div className="bg-slate-800/70 p-6 rounded-2xl border border-white/5 overflow-y-auto max-h-[300px]">
            <h3 className="text-lg font-semibold border-b border-white/10 pb-2 mb-4">Access Logs</h3>
            <ul className="flex flex-col gap-3">
              {assignments.map((a, i) => {
                const uName = users.find(u => u.id === a.userId)?.name;
                const dName = devices.find(d => d.id === a.deviceId)?.name;
                return (
                  <li key={i} className="p-3 bg-black/20 rounded-lg flex flex-col text-sm border-l-2 border-emerald-500">
                    <span className="font-semibold text-emerald-400">Access Granted</span>
                    <span className="text-slate-400 text-xs mt-1">{uName} ➜ {dName}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
