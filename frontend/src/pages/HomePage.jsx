import React from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Sparkles, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function HomePage() {
  const { t } = useTranslation();

  return (
    <div className="max-w-5xl mx-auto mt-12 animate-in fade-in duration-700">
      <div className="text-center mb-20">
        <h1 className="text-6xl font-black text-slate-900 tracking-tight mb-6 leading-tight">
          {t('hero_title_1')}<br/>
          <span className="bg-gradient-to-r from-amber-500 to-orange-500 text-transparent bg-clip-text">
            {t('hero_title_2')}
          </span>
        </h1>
        <p className="text-xl text-slate-500 mb-10 max-w-2xl mx-auto leading-relaxed">
          {t('hero_subtitle')}
        </p>
        <div className="flex justify-center gap-6">
          <Link to="/student" className="group flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white px-8 py-4 rounded-2xl font-bold hover:scale-105 transition-all shadow-xl shadow-orange-200">
            {t('try_analyzer')} <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform"/>
          </Link>
          <Link to="/teacher" className="flex items-center gap-2 bg-white text-slate-700 border-2 border-slate-200 px-8 py-4 rounded-2xl font-bold hover:border-amber-400 hover:text-amber-600 transition-all shadow-sm">
            {t('iam_teacher')}
          </Link>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="p-10 bg-white rounded-[2.5rem] border border-slate-100 shadow-lg shadow-slate-200/50 hover:-translate-y-2 transition-transform duration-300">
          <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mb-6">
            <BookOpen className="text-amber-600" size={32} />
          </div>
          <h3 className="text-2xl font-bold mb-3">{t('open_library_title')}</h3>
          <p className="text-slate-500 leading-relaxed">{t('open_library_desc')}</p>
        </div>
        <div className="p-10 bg-gradient-to-br from-orange-50 to-amber-50 rounded-[2.5rem] border border-orange-100 shadow-lg shadow-orange-100/50 hover:-translate-y-2 transition-transform duration-300">
          <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mb-6 shadow-sm">
            <Sparkles className="text-orange-500" size={32} />
          </div>
          <h3 className="text-2xl font-bold mb-3 text-slate-800">{t('ai_title')}</h3>
          <p className="text-slate-600 leading-relaxed">{t('ai_desc')}</p>
        </div>
      </div>
    </div>
  );
}