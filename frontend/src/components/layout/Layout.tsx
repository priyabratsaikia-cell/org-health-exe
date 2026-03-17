import { Outlet } from 'react-router-dom';
import { useEffect } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import ToastContainer from '../ui/ToastContainer';
import { useApp, useColors } from '@/context/AppContext';
import { api } from '@/api/client';

export default function Layout() {
  const { dispatch } = useApp();
  const C = useColors();

  useEffect(() => {
    api.getSettings().then(s => dispatch({ type: 'SET_SETTINGS', payload: s })).catch(() => {});
    api.getOrgs().then(o => dispatch({ type: 'SET_ORGS', payload: o.orgs })).catch(() => {});
  }, [dispatch]);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: C.gray100 }}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-6">
          <Outlet />
        </main>
      </div>
      <ToastContainer />
    </div>
  );
}
