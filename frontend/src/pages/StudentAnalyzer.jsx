import React, { useState } from 'react';
import axios from 'axios';
import { BlockMath } from 'react-katex';
import { Loader2, Send, BrainCircuit, CheckCircle2, XCircle, Star, Lightbulb } from 'lucide-react';
import Confetti from 'react-confetti';
import { useTranslation } from 'react-i18next';
import 'katex/dist/katex.min.css';

export default function StudentAnalyzer() {
  const { t } = useTranslation();
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState('');
  const [verdict, setVerdict] = useState(null);
  const [checking, setChecking] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const [hint, setHint] = useState('');
  
  const [streak, setStreak] = useState(0); 
  const [showConfetti, setShowConfetti] = useState(false);
  const TARGET_STREAK = 3;

  const fetchTask = async () => {
    setLoading(true); setVerdict(null); setAnswer(''); setHint(''); setShowConfetti(false);
    try {
      const response = await axios.get('http://127.0.0.1:8000/api/tasks/generate-matrix');
      setTask(response.data);
    } catch (error) {
      alert("Ошибка API. Проверьте FastAPI.");
    } finally {
      setLoading(false);
    }
  };

  const getHint = () => {
    // В будущем здесь будет запрос к Gemini API
    setHint("Обрати внимание на формулу: a*d - b*c. Возможно, ты ошибся при умножении отрицательных чисел.");
  };

  const submitAnswer = async () => {
    if (!answer) return;
    setChecking(true);
    
    setTimeout(() => {
      if (parseInt(answer) === task.answer) {
        setVerdict({ status: 'correct', message: t('correct') });
        const newStreak = streak + 1;
        setStreak(newStreak);
        if (newStreak >= TARGET_STREAK) setShowConfetti(true);
      } else {
        setIsShaking(true);
        setTimeout(() => setIsShaking(false), 500); // Выключаем анимацию тряски
        setVerdict({ status: 'wrong', message: 'Ошибка вычислений. Попробуй еще раз или возьми подсказку.' });
        setStreak(0);
      }
      setChecking(false);
    }, 1000);
  };

  const progressPercentage = (streak / TARGET_STREAK) * 100;

  return (
    <div className="max-w-3xl mx-auto w-full relative pb-20">
      {showConfetti && <Confetti recycle={false} numberOfPieces={500} gravity={0.2} />}

      <header className="mb-10 text-center">
        <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">{t('analyzer_title')}</h1>
        <p className="text-slate-500 mt-2 text-lg">{t('analyzer_subtitle')}</p>
      </header>

      {!task ? (
        <div className="bg-white p-16 rounded-[2.5rem] border border-amber-100 text-center shadow-xl shadow-amber-50/50 hover:shadow-2xl transition-shadow">
          <div className="w-24 h-24 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-8 shadow-lg shadow-orange-200 animate-bounce">
            <BrainCircuit className="text-white" size={48} />
          </div>
          <h2 className="text-3xl font-bold mb-8 text-slate-800">{t('choose_topic')}</h2>
          <button onClick={fetchTask} disabled={loading} className="bg-slate-900 text-white px-10 py-5 rounded-2xl font-bold hover:bg-slate-800 transition-all transform hover:scale-105 flex items-center justify-center gap-3 mx-auto text-lg">
            {loading ? <Loader2 className="animate-spin" /> : t('start_matrix')}
          </button>
        </div>
      ) : (
        <div className="space-y-6 animate-in zoom-in-95 duration-500">
          
          {/* Progress Bar (Khan Academy Style) */}
          <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
            <div className="flex justify-between items-center mb-3">
              <span className="font-bold text-slate-600 text-sm uppercase tracking-wider">{t('progress')}</span>
              <span className="font-black text-amber-500">{streak} / {TARGET_STREAK} <Star className="inline pb-1" size={20}/></span>
            </div>
            <div className="h-4 w-full bg-slate-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-700 ease-out"
                style={{ width: `${progressPercentage}%` }}
              ></div>
            </div>
          </div>

          <div className="bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-lg shadow-slate-100 relative">
            <h3 className="font-bold text-2xl mb-4 text-slate-800">{task.title}</h3>
            <p className="text-slate-600 mb-8 text-lg">{task.task_text}</p>
            
            <div className="bg-amber-50 p-10 rounded-[2rem] border border-amber-100 flex justify-center mb-10 text-2xl shadow-inner">
              <BlockMath math={task.matrix_latex} />
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <input 
                type="number" 
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder={t('your_answer')}
                disabled={showConfetti || verdict?.status === 'correct'}
                className={`flex-1 bg-slate-50 border-2 rounded-2xl px-6 py-4 text-xl focus:outline-none focus:ring-4 font-mono font-bold transition-all ${isShaking ? 'animate-shake border-red-400 ring-red-100' : 'border-slate-200 focus:border-amber-400 focus:ring-amber-100'} disabled:opacity-50`}
              />
              <button 
                onClick={submitAnswer}
                disabled={checking || !answer || showConfetti || verdict?.status === 'correct'}
                className="bg-amber-500 text-white px-10 py-4 rounded-2xl font-bold hover:bg-amber-600 transition-all flex items-center justify-center gap-3 disabled:opacity-50 text-lg shadow-lg shadow-amber-200"
              >
                {checking ? <Loader2 className="animate-spin" /> : <Send size={24} />}
                {t('check_btn')}
              </button>
            </div>

            {/* AI Hint Button */}
            {!hint && verdict?.status !== 'correct' && (
              <button onClick={getHint} className="mt-6 flex items-center gap-2 text-amber-600 font-bold hover:text-orange-600 transition-colors mx-auto">
                <Lightbulb size={20} className="animate-pulse" /> {t('need_hint')}
              </button>
            )}

            {hint && (
              <div className="mt-6 p-6 bg-orange-50 border border-orange-200 rounded-2xl flex gap-4 animate-in slide-in-from-top-4">
                <BrainCircuit className="text-orange-500 flex-shrink-0" size={28}/>
                <div>
                  <h4 className="font-bold text-orange-900 mb-1">{t('hint_title')}</h4>
                  <p className="text-orange-800 leading-relaxed">{hint}</p>
                </div>
              </div>
            )}
          </div>

          {/* Вердикт */}
          {verdict && (
            <div className={`p-8 rounded-[2rem] border-2 flex items-center justify-between gap-4 animate-in slide-in-from-bottom-4 ${
              verdict.status === 'correct' ? 'bg-green-50 border-green-400 text-green-900' : 'bg-red-50 border-red-300 text-red-900'
            }`}>
              <div className="flex items-center gap-4">
                {verdict.status === 'correct' ? <CheckCircle2 className="text-green-500" size={36} /> : <XCircle className="text-red-500" size={36} />}
                <div>
                  <h4 className="font-black text-xl mb-1">{verdict.message}</h4>
                  {showConfetti && <p className="text-green-700 font-bold">{t('mastery_reached')}</p>}
                </div>
              </div>
              
              {verdict.status === 'correct' && !showConfetti && (
                <button onClick={fetchTask} className="bg-green-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-green-700 transition shadow-lg shadow-green-200">
                  {t('next_task')}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}