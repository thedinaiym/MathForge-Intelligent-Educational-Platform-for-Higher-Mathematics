import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { User, School, GraduationCap, Save, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function ProfilePage({ session }) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    role: 'student',
    university: '',
  });

  useEffect(() => {
    if (session?.user?.user_metadata) {
      setFormData({
        fullName: session.user.user_metadata.full_name || '',
        role: session.user.user_metadata.role || 'student',
        university: session.user.user_metadata.university || '',
      });
    }
  }, [session]);

  const updateProfile = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: { 
          role: formData.role, 
          university: formData.university,
          full_name: formData.fullName
        }
      });
      if (error) throw error;
      alert("Профиль успешно обновлен!");
    } catch (error) {
      console.error(error);
      alert("Ошибка обновления профиля.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto animate-in fade-in duration-500">
      <header className="mb-10 text-center sm:text-left">
        <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">{t('profile')}</h1>
        <p className="text-slate-500 mt-2 text-lg">Заполните данные, чтобы платформа адаптировалась под вас</p>
      </header>

      <div className="bg-white p-8 sm:p-10 rounded-[2.5rem] border border-amber-100 shadow-xl shadow-amber-50/50 space-y-8">
        
        {/* Имя */}
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
            <User size={18} className="text-orange-500"/> ФИО
          </label>
          <input 
            type="text" 
            value={formData.fullName}
            onChange={(e) => setFormData({...formData, fullName: e.target.value})}
            className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-4 focus:ring-4 focus:ring-amber-100 focus:border-amber-400 outline-none transition-all text-lg font-medium"
          />
        </div>

        {/* Университет */}
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
            <School size={18} className="text-orange-500"/> Университет / Школа
          </label>
          <input 
            type="text" 
            value={formData.university}
            onChange={(e) => setFormData({...formData, university: e.target.value})}
            placeholder="Например: Ала-Тоо (IAAU)"
            className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-4 focus:ring-4 focus:ring-amber-100 focus:border-amber-400 outline-none transition-all text-lg font-medium"
          />
        </div>

        {/* Выбор роли */}
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
            <GraduationCap size={18} className="text-orange-500"/> Ваша роль
          </label>
          <div className="grid grid-cols-2 gap-4">
            <button 
              onClick={() => setFormData({...formData, role: 'student'})}
              className={`p-5 rounded-2xl border-2 font-bold transition-all text-lg ${formData.role === 'student' ? 'border-amber-400 bg-amber-50 text-amber-700 shadow-inner' : 'border-slate-100 text-slate-400 hover:border-slate-200 hover:bg-slate-50'}`}
            >
              {t('role_student')}
            </button>
            <button 
              onClick={() => setFormData({...formData, role: 'teacher'})}
              className={`p-5 rounded-2xl border-2 font-bold transition-all text-lg ${formData.role === 'teacher' ? 'border-amber-400 bg-amber-50 text-amber-700 shadow-inner' : 'border-slate-100 text-slate-400 hover:border-slate-200 hover:bg-slate-50'}`}
            >
              {t('role_teacher')}
            </button>
          </div>
        </div>

        {/* Кнопка сохранения */}
        <button 
          onClick={updateProfile}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-amber-400 to-orange-500 text-white px-6 py-5 rounded-2xl font-bold hover:scale-[1.02] hover:shadow-xl hover:shadow-orange-200 transition-all text-lg disabled:opacity-50 mt-4"
        >
          {loading ? <Loader2 className="animate-spin" size={24} /> : <Save size={24} />}
          Сохранить изменения
        </button>
      </div>
    </div>
  );
}