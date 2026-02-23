import React from 'react';
import { supabase } from '../lib/supabase';
import { Calculator, Github, Mail } from 'lucide-react';

export default function AuthPage() {
  const handleLogin = async (provider) => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: provider,
        options: {
          redirectTo: window.location.origin // Возвращаемся на сайт после логина
        }
      });
      if (error) throw error;
    } catch (error) {
      console.error('Ошибка авторизации:', error.message);
      alert('Не удалось войти. Проверьте консоль.');
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center animate-in fade-in duration-500">
      <div className="bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-xl max-w-md w-full text-center">
        <div className="flex justify-center mb-6 text-indigo-600">
          <Calculator size={48} strokeWidth={2} />
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-2">Вход в MathForge</h1>
        <p className="text-slate-500 mb-8">Войдите, чтобы сохранять прогресс и генерировать варианты</p>

        <div className="space-y-4">
          {/* Кнопка GitHub */}
          <button
            onClick={() => handleLogin('github')}
            className="w-full flex items-center justify-center gap-3 bg-slate-900 text-white px-6 py-4 rounded-2xl font-bold hover:bg-slate-800 transition shadow-md"
          >
            <Github size={20} />
            Продолжить с GitHub
          </button>

          {/* Кнопка Google */}
          <button
            onClick={() => handleLogin('google')}
            className="w-full flex items-center justify-center gap-3 bg-white text-slate-700 border-2 border-slate-200 px-6 py-4 rounded-2xl font-bold hover:bg-slate-50 hover:border-slate-300 transition shadow-sm"
          >
            <Mail size={20} />
            Продолжить с Google
          </button>
        </div>

        <p className="mt-8 text-sm text-slate-400">
          Продолжая, вы соглашаетесь с правилами платформы.
        </p>
      </div>
    </div>
  );
}