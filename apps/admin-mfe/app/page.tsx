"use client";

import { useAuth } from '@/context/AuthContext';
import Dashboard from '@/components/Dashboard';

export default function Home() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <div className="flex justify-center items-center min-h-screen text-2xl text-slate-400">Loading...</div>;
  }

  if (!isAuthenticated) {
    return null; // The AuthContext will redirect to /login
  }

  return (
    <main>
      <Dashboard />
    </main>
  );
}
