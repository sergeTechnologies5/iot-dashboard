"use client";

import { useEffect, useState } from 'react';
import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

export default function Dashboard() {
  const { role, logout, hasPermission } = useAuth();
  
  // Permission Checks
  const canCreateCompany = hasPermission('COMPANY_CREATE');
  const canReadCompany = hasPermission('COMPANY_READ');
  const canCreateUser = hasPermission('USER_CREATE');
  const canReadUser = hasPermission('USER_READ');
  const canCreateDevice = hasPermission('DEVICE_CREATE');
  const canReadDevice = hasPermission('DEVICE_READ');
  const canAssignDevice = hasPermission('ASSIGN_DEVICE');
  const canAssignCompany = hasPermission('ASSIGN_COMPANY');
  const isAdminSuper = role === 'ADMIN_SUPER';

  // Tabs State
  type Tab = 'monitor' | 'companies' | 'devices' | 'users';
  const [selectedTab, setActiveTab] = useState<Tab | null>(null);
  const defaultTab: Tab = isAdminSuper ? 'monitor'
    : canReadCompany ? 'companies'
    : canReadUser ? 'users'
    : canReadDevice ? 'devices'
    : 'companies';
  const activeTab: Tab = selectedTab ?? defaultTab;
  
  // Mock Data States
  const [companies, setCompanies] = useState<{id: string, name: string}[]>([]);
  const [newCompany, setNewCompany] = useState('');
  
  const [devices, setDevices] = useState<{id: string, name: string, companyId: string}[]>([]);
  const [newDevice, setNewDevice] = useState({ name: '', companyId: '' });

  const [users, setUsers] = useState<{id: string, username: string, companyId: string}[]>([]);
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'COMPANY_VIEWER', companyId: '' });
  const [assignment, setAssignment] = useState({ deviceId: '', userId: '' });

  // Web Socket State for 'd1' Demo device monitoring
  const [status, setStatus] = useState('--');
  const [temp, setTemp] = useState('--');

  useEffect(() => {
    const token = localStorage.getItem('token') || '';
    const client = new Client({
      webSocketFactory: () => new SockJS(`${process.env.NEXT_PUBLIC_API_URL ?? ""}/ws`),
      connectHeaders: { Authorization: `Bearer ${token}` },
      debug: () => {},
      onConnect: () => {
        client.subscribe("/topic/status", (msg: { body: string }) => setStatus(msg.body));
        client.subscribe("/topic/temp", (msg: { body: string }) => setTemp(msg.body));
      }
    });

    client.activate();
    return () => { if (client.active) client.deactivate(); };
  }, []);

  const sendLedCommand = async (state: string) => {
    try {
      await api.post(`/api/v1/devices/led?state=${state}`);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (activeTab === 'companies' && canReadCompany) {
      api.get('/api/v1/companies').then(res => setCompanies(res.data)).catch(console.error);
    }
  }, [activeTab, canReadCompany]);

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newCompany.trim()) {
      try {
        const res = await api.post('/api/v1/companies', { name: newCompany });
        setCompanies([...companies, { id: res.data.id, name: res.data.name }]);
        setNewCompany('');
      } catch (err) {
        console.error(err);
      }
    }
  };

  useEffect(() => {
    if (activeTab === 'devices' && canReadDevice) {
      api.get('/api/v1/devices').then(res => setDevices(res.data)).catch(console.error);
    }
  }, [activeTab, canReadDevice]);

  const handleCreateDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newDevice.name.trim() && newDevice.companyId) {
      try {
        const res = await api.post('/api/v1/devices', { 
           name: newDevice.name, 
           company: { id: parseInt(newDevice.companyId) } 
        });
        setDevices([...devices, { id: res.data.id, name: res.data.name, companyId: String(res.data.company?.id) }]);
        setNewDevice({ name: '', companyId: companies.length > 0 ? companies[0].id : '' });
      } catch (err) {
        console.error(err);
      }
    }
  };

  useEffect(() => {
    if (activeTab === 'users' && canReadUser) {
        // We'll need an endpoint to get all users or users by company
        // For now, let's assume we can get users if we can create them
        api.get('/api/v1/users/company/1').then(res => setUsers(res.data)).catch(console.error);
    }
  }, [activeTab, canReadUser]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newUser.username.trim() && newUser.password && newUser.companyId && newUser.role) {
        try {
            const res = await api.post('/api/v1/auth/register', {
                username: newUser.username,
                password: newUser.password,
                role: newUser.role,
                companyId: parseInt(newUser.companyId)
            });
            setUsers([...users, { id: `u${Date.now()}`, username: newUser.username, companyId: newUser.companyId }]); 
            setNewUser({ username: '', password: '', role: 'COMPANY_VIEWER', companyId: '' });
        } catch (err) {
            console.error(err);
        }
    }
  };

  const handleAssignDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (assignment.deviceId && assignment.userId) {
        try {
            await api.post(`/api/v1/devices/${assignment.deviceId}/assign/${assignment.userId}`);
            setAssignment({ deviceId: '', userId: '' });
            alert("Device assigned successfully!");
        } catch (err) {
            console.error(err);
        }
    }
  };

  return (
    <div className="p-10 max-w-6xl mx-auto w-full animate-in fade-in duration-500">
      <header className="flex justify-between items-center mb-8 border-b border-white/10 pb-6">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">👑 Admin Zone</h1>
          <p className="text-slate-400 mt-2">Logged in as: <b className="text-blue-300">{role?.toUpperCase()}</b></p>
        </div>
        <button 
          onClick={logout}
          className="py-2.5 px-5 rounded-lg text-sm font-semibold transition-all bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white"
        >
          Logout
        </button>
      </header>

      <nav className="flex gap-4 mb-8">
        {isAdminSuper && <button onClick={() => setActiveTab('monitor')} className={`px-4 py-2 rounded-lg font-medium transition-all ${activeTab === 'monitor' ? 'bg-blue-500 text-white shadow-[0_0_15px_rgba(59,130,246,0.3)]' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>Global Monitor</button>}
        {canReadCompany && <button onClick={() => setActiveTab('companies')} className={`px-4 py-2 rounded-lg font-medium transition-all ${activeTab === 'companies' ? 'bg-blue-500 text-white shadow-[0_0_15px_rgba(59,130,246,0.3)]' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>Companies ({companies.length})</button>}
        {canReadUser && <button onClick={() => setActiveTab('users')} className={`px-4 py-2 rounded-lg font-medium transition-all ${activeTab === 'users' ? 'bg-blue-500 text-white shadow-[0_0_15px_rgba(59,130,246,0.3)]' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>User Management</button>}
        {canReadDevice && <button onClick={() => setActiveTab('devices')} className={`px-4 py-2 rounded-lg font-medium transition-all ${activeTab === 'devices' ? 'bg-blue-500 text-white shadow-[0_0_15px_rgba(59,130,246,0.3)]' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>Devices ({devices.length})</button>}
      </nav>

      {activeTab === 'monitor' && isAdminSuper && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-bottom-4">
          <div className="bg-slate-800/70 p-6 rounded-2xl border border-white/5">
            <h3 className="text-xl mb-4 text-slate-300 flex items-center gap-2">💡 LED Overrides</h3>
            <div className="flex gap-4 mb-4">
              <button onClick={() => sendLedCommand('ON')} className="flex-1 py-3 rounded-lg font-semibold bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-white transition-all">ON</button>
              <button onClick={() => sendLedCommand('OFF')} className="flex-1 py-3 rounded-lg font-semibold bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white transition-all">OFF</button>
            </div>
            <div className="text-sm text-slate-400">Target Device: <b>d1 - Main ESP8266 (Alpha Corp)</b> | Server Output: <b className={status === 'ON' ? 'text-emerald-400' : 'text-red-400'}>{status}</b></div>
          </div>

          <div className="bg-slate-800/70 p-6 rounded-2xl border border-white/5">
            <h3 className="text-xl mb-4 text-slate-300 flex items-center gap-2">🌡️ Global Environment</h3>
            <p className="text-5xl font-bold bg-gradient-to-r from-orange-400 to-red-500 bg-clip-text text-transparent">{temp} °C</p>
            <p className="mt-4 text-sm text-slate-400">Average aggregation across <b>{devices.length}</b> devices.</p>
          </div>
        </div>
      )}

      {activeTab === 'companies' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in slide-in-from-bottom-4">
          {canCreateCompany ? (
            <form onSubmit={handleCreateCompany} className="bg-slate-800/70 p-6 rounded-2xl border border-white/5 flex flex-col gap-4">
              <h3 className="text-lg font-semibold border-b border-white/10 pb-2">Register Company</h3>
              <input required type="text" placeholder="Company Name" value={newCompany} onChange={e => setNewCompany(e.target.value)} className="p-3 bg-black/30 rounded-lg border border-white/10 outline-none focus:border-blue-500 text-sm" />
              <button type="submit" className="mt-2 py-3 bg-blue-600 rounded-lg font-semibold hover:bg-blue-500 transition-colors">Add Company</button>
            </form>
          ) : (
            <div className="bg-slate-800/70 p-6 rounded-2xl border border-white/5 flex flex-col items-center justify-center text-slate-400">
               <span className="text-4xl mb-2">🔒</span>
               <p>Your role ({role}) does not permit company creation.</p>
            </div>
          )}

          <div className="bg-slate-800/70 p-6 rounded-2xl border border-white/5 overflow-y-auto max-h-64">
            <h3 className="text-lg font-semibold border-b border-white/10 pb-2 mb-4">Active Directory</h3>
            <ul className="flex flex-col gap-3">
              {companies.map(c => (
                <li key={c.id} className="p-3 bg-black/20 rounded-lg flex justify-between items-center text-sm">
                  <span className="font-medium text-blue-300">{c.name}</span>
                  <span className="text-slate-500 text-xs">ID: {c.id}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {activeTab === 'users' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in slide-in-from-bottom-4">
          {canCreateUser ? (
            <form onSubmit={handleCreateUser} className="bg-slate-800/70 p-6 rounded-2xl border border-white/5 flex flex-col gap-4">
              <h3 className="text-lg font-semibold border-b border-white/10 pb-2">Register User</h3>
              <input required type="text" placeholder="Username" value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value})} className="p-3 bg-black/30 rounded-lg border border-white/10 outline-none focus:border-blue-500 text-sm" />
              <input required type="password" placeholder="Password" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} className="p-3 bg-black/30 rounded-lg border border-white/10 outline-none focus:border-blue-500 text-sm" />
              <select required value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value})} className="p-3 bg-black/30 rounded-lg border border-white/10 outline-none focus:border-blue-500 text-sm text-white">
                <option value="COMPANY_VIEWER">Company Viewer</option>
                <option value="COMPANY_MANAGER">Company Manager</option>
                <option value="COMPANY_SUPER">Company Super</option>
                <option value="ADMIN_ASSIGNER">Admin Assigner</option>
                <option value="ADMIN_CREATOR">Admin Creator</option>
                <option value="ADMIN_SUPER">Admin Super</option>
              </select>
              <select required value={newUser.companyId} onChange={e => setNewUser({...newUser, companyId: e.target.value})} className="p-3 bg-black/30 rounded-lg border border-white/10 outline-none focus:border-blue-500 text-sm text-white">
                <option value="">-- Select Company --</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button type="submit" className="mt-2 py-3 bg-blue-600 rounded-lg font-semibold hover:bg-blue-500 transition-colors">Add User</button>
            </form>
          ) : (
            <div className="bg-slate-800/70 p-6 rounded-2xl border border-white/5 flex flex-col items-center justify-center text-slate-400">
               <span className="text-4xl mb-2">🔒</span>
               <p>Access Denied: User Creation</p>
            </div>
          )}

          <div className="bg-slate-800/70 p-6 rounded-2xl border border-white/5 overflow-y-auto max-h-64">
            <h3 className="text-lg font-semibold border-b border-white/10 pb-2 mb-4">User Directory</h3>
            <ul className="flex flex-col gap-3">
              {users.map(u => (
                <li key={u.id} className="p-3 bg-black/20 rounded-lg flex justify-between items-center text-sm">
                  <div>
                    <span className="font-medium text-blue-300">{u.username}</span>
                    <div className="text-slate-500 text-xs">ID: {u.id}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {activeTab === 'devices' && (
        <div className="flex flex-col gap-8 animate-in slide-in-from-bottom-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {canCreateDevice ? (
                <form onSubmit={handleCreateDevice} className="bg-slate-800/70 p-6 rounded-2xl border border-white/5 flex flex-col gap-4">
                    <h3 className="text-lg font-semibold border-b border-white/10 pb-2">Provision Device</h3>
                    <input required type="text" placeholder="Device Name (e.g. ESP-Floor2)" value={newDevice.name} onChange={e => setNewDevice({...newDevice, name: e.target.value})} className="p-3 bg-black/30 rounded-lg border border-white/10 outline-none focus:border-blue-500 text-sm" />
                    <select required value={newDevice.companyId} onChange={e => setNewDevice({...newDevice, companyId: e.target.value})} className="p-3 bg-black/30 rounded-lg border border-white/10 outline-none focus:border-blue-500 text-sm text-white">
                    {companies.length === 0 && <option value="">-- No Companies --</option>}
                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <button type="submit" disabled={companies.length === 0} className="mt-2 py-3 bg-blue-600 rounded-lg font-semibold hover:bg-blue-500 transition-colors disabled:opacity-50">Create Device</button>
                </form>
              ) : (
                <div className="bg-slate-800/70 p-6 rounded-2xl border border-white/5 flex flex-col items-center justify-center text-slate-400">
                    <span className="text-4xl mb-2">🔒</span>
                    <p>Device Creation Restricted</p>
                </div>
              )}

              {canAssignDevice ? (
                <form onSubmit={handleAssignDevice} className="bg-slate-800/70 p-6 rounded-2xl border border-white/5 flex flex-col gap-4">
                    <h3 className="text-lg font-semibold border-b border-white/10 pb-2">Assign Device to User</h3>
                    <select required value={assignment.deviceId} onChange={e => setAssignment({...assignment, deviceId: e.target.value})} className="p-3 bg-black/30 rounded-lg border border-white/10 outline-none focus:border-blue-500 text-sm text-white">
                        <option value="">-- Select Device --</option>
                        {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                    <select required value={assignment.userId} onChange={e => setAssignment({...assignment, userId: e.target.value})} className="p-3 bg-black/30 rounded-lg border border-white/10 outline-none focus:border-blue-500 text-sm text-white">
                        <option value="">-- Select User --</option>
                        {users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
                    </select>
                    <button type="submit" className="mt-2 py-3 bg-emerald-600 rounded-lg font-semibold hover:bg-emerald-500 transition-colors">Assign Now</button>
                </form>
              ) : (
                 <div className="bg-slate-800/70 p-6 rounded-2xl border border-white/5 flex flex-col items-center justify-center text-slate-400">
                    <span className="text-4xl mb-2">🔒</span>
                    <p>Assignment Restricted</p>
                </div>
              )}
            </div>

            <div className="bg-slate-800/70 p-6 rounded-2xl border border-white/5 overflow-y-auto max-h-[300px]">
                <h3 className="text-lg font-semibold border-b border-white/10 pb-2 mb-4">Device Registry</h3>
                <ul className="flex flex-col gap-3">
                {devices.map(d => (
                    <li key={d.id} className="p-3 bg-black/20 rounded-lg flex justify-between items-center text-sm border-l-2 border-emerald-500">
                    <div>
                        <div className="font-semibold">{d.name}</div>
                        <div className="text-slate-400 text-xs mt-1">Tenant: {companies.find(c => c.id === d.companyId)?.name}</div>
                    </div>
                    <span className="bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded text-xs">Active</span>
                    </li>
                ))}
                </ul>
            </div>
        </div>
      )}
    </div>
  );
}
