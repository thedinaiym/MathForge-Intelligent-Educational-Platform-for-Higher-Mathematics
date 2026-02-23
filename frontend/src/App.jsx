import React, { useState, useEffect } from 'react';
import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { Calculator, Home, GraduationCap, Briefcase, LogOut, LogIn, User } from 'lucide-react';
import { supabase } from './lib/supabase';
import { useTranslation } from 'react-i18next';

import HomePage from './pages/HomePage';
import StudentAnalyzer from './pages/StudentAnalyzer';
import TeacherGenerator from './pages/TeacherGenerator';
import AuthPage from './pages/AuthPage';
import ProfilePage from './pages/ProfilePage';

export default function App() {
  const location = useLocation();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const { t, i18n } = useTranslation();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => { setSession(session); setLoading(false); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { setSession(session); });
    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => await supabase.auth.signOut();
  const changeLanguage = (lng) => i18n.changeLanguage(lng);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-amber-500 font-bold text-xl">Загрузка MathForge...</div>;

  const userRole = session?.user?.user_metadata?.role;

  return (
    <div className="min-h-screen flex bg-[#fdfaf6] text-slate-900 font-sans">
      <aside className="w-72 bg-white border-r border-amber-100 p-8 flex flex-col fixed h-full shadow-lg shadow-amber-50 z-10">
        <Link to="/" className="flex items-center gap-3 mb-12 text-amber-500 hover:text-orange-500 transition-colors">
          <div className="p-2 bg-amber-100 rounded-xl"><Calculator size={28} strokeWidth={2.5} className="text-amber-600" /></div>
          <span className="text-3xl font-black tracking-tighter text-slate-800">MathForge</span>
        </Link>
        
        <nav className="space-y-3 flex-1">
          <div className="px-4 py-2 text-xs font-black text-amber-300 uppercase tracking-widest">{t('menu')}</div>
          
          <Link to="/" className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl font-bold transition-all ${location.pathname === '/' ? 'bg-amber-500 text-white shadow-md shadow-amber-200' : 'text-slate-500 hover:bg-amber-50 hover:text-amber-600'}`}>
            <Home size={22} /> {t('home')}
          </Link>
          
          {session && userRole !== 'teacher' && (
            <Link to="/student" className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl font-bold transition-all ${location.pathname === '/student' ? 'bg-amber-500 text-white shadow-md shadow-amber-200' : 'text-slate-500 hover:bg-amber-50 hover:text-amber-600'}`}>
              <GraduationCap size={22} /> {t('analyzer')}
            </Link>
          )}

          {session && userRole === 'teacher' && (
            <Link to="/teacher" className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl font-bold transition-all ${location.pathname === '/teacher' ? 'bg-amber-500 text-white shadow-md shadow-amber-200' : 'text-slate-500 hover:bg-amber-50 hover:text-amber-600'}`}>
              <Briefcase size={22} /> {t('generator')}
            </Link>
          )}

          {session && (
            <Link to="/profile" className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl font-bold transition-all mt-6 ${location.pathname === '/profile' ? 'bg-amber-500 text-white shadow-md shadow-amber-200' : 'text-slate-500 hover:bg-amber-50 hover:text-amber-600'}`}>
              <User size={22} /> {t('profile')}
            </Link>
          )}
        </nav>

        <div className="flex justify-center gap-2 mb-8 mt-auto bg-slate-50 p-2 rounded-xl border border-slate-100">
          <button onClick={() => changeLanguage('ru')} className={`flex-1 text-xs font-bold py-2 rounded-lg transition-all ${i18n.language === 'ru' ? 'bg-white text-amber-500 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>RU</button>
          <button onClick={() => changeLanguage('en')} className={`flex-1 text-xs font-bold py-2 rounded-lg transition-all ${i18n.language === 'en' ? 'bg-white text-amber-500 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>EN</button>
          <button onClick={() => changeLanguage('ky')} className={`flex-1 text-xs font-bold py-2 rounded-lg transition-all ${i18n.language === 'ky' ? 'bg-white text-amber-500 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>KY</button>
        </div>

        <div className="pt-6 border-t border-amber-100">
          {session ? (
            <div className="flex flex-col gap-4">
              <div className="px-4 py-3 bg-white rounded-2xl flex items-center gap-3 border border-amber-100 shadow-sm">
                <img src={session.user.user_metadata.avatar_url || 'https://via.placeholder.com/150'} alt="Avatar" className="w-10 h-10 rounded-full border-2 border-amber-200" />
                <div className="flex flex-col overflow-hidden">
                  <span className="text-sm font-bold truncate text-slate-800">{session.user.user_metadata.full_name || session.user.email.split('@')[0]}</span>
                  <span className="text-[10px] uppercase font-black text-amber-500 tracking-wider">{userRole === 'teacher' ? t('role_teacher') : t('role_student')}</span>
                </div>
              </div>
              <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 px-4 py-3 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl font-bold transition-all">
                <LogOut size={18} /> {t('logout')}
              </button>
            </div>
          ) : (
            <Link to="/auth" className="w-full flex items-center justify-center gap-2 px-4 py-4 bg-amber-500 text-white rounded-2xl font-bold hover:bg-orange-500 transition-all shadow-lg shadow-amber-200">
              <LogIn size={20} /> {t('login')}
            </Link>
          )}
        </div>
      </aside>

      <main className="flex-1 ml-72 p-12 relative flex flex-col min-h-screen">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/auth" element={session ? <Navigate to="/profile" /> : <AuthPage />} />
          <Route path="/profile" element={session ? <ProfilePage session={session} /> : <Navigate to="/auth" />} />
          <Route path="/student" element={session ? <StudentAnalyzer /> : <Navigate to="/auth" />} />
          <Route path="/teacher" element={session ? <TeacherGenerator /> : <Navigate to="/auth" />} />
        </Routes>
      </main>
    </div>
  );
}