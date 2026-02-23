import React, { useState } from 'react';
import axios from 'axios';
import { Download, Plus, Loader2, Trash2, Calculator, FileText } from 'lucide-react';
import 'katex/dist/katex.min.css';
import { BlockMath } from 'react-katex';

export default function TeacherGenerator() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const addMatrixTask = async () => {
    setLoading(true);
    try {
      const response = await axios.get('http://127.0.0.1:8000/api/tasks/generate-matrix');
      setTasks([...tasks, { ...response.data, id: Date.now() }]);
    } catch (error) {
      console.error(error);
      alert("Ошибка API");
    } finally {
      setLoading(false);
    }
  };

  const removeTask = (id) => setTasks(tasks.filter(t => t.id !== id));

  const downloadPDF = async () => {
    if (tasks.length === 0) return alert("Добавьте задачи!");
    setPdfLoading(true);
    try {
      const response = await axios.post('http://127.0.0.1:8000/api/tasks/export-pdf', tasks, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `MathForge_Variant_${Date.now()}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error(error);
      alert("Ошибка генерации PDF");
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div>
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-6">
        <div>
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">Конструктор вариантов</h1>
          <p className="text-slate-500 mt-2 text-lg">Сформируйте уникальные наборы заданий для печати</p>
        </div>
        <button 
          onClick={downloadPDF}
          disabled={tasks.length === 0 || pdfLoading}
          className="flex items-center justify-center gap-3 bg-slate-900 text-white px-8 py-4 rounded-2xl hover:bg-slate-800 transition-all shadow-xl font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-1 w-full md:w-auto"
        >
          {pdfLoading ? <Loader2 className="animate-spin" size={20} /> : <Download size={20} />}
          Скачать PDF {tasks.length > 0 && <span className="bg-white/20 px-2 py-0.5 rounded-md ml-1">{tasks.length}</span>}
        </button>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-10">
        
        {/* Колонка выбора (левая) */}
        <div className="xl:col-span-4 space-y-6">
          <div className="bg-white p-6 rounded-[2rem] border border-amber-100 shadow-lg shadow-amber-50/50 hover:border-amber-300 transition-colors group">
            <div className="flex items-center gap-4 mb-6">
              <div className="p-3 bg-orange-100 text-orange-500 rounded-2xl group-hover:bg-orange-500 group-hover:text-white transition-colors">
                <Calculator size={28} />
              </div>
              <div>
                <h4 className="font-bold text-xl text-slate-800">Линейная алгебра</h4>
                <p className="text-slate-400 text-xs font-black uppercase tracking-wider mt-1">Матрицы 2x2</p>
              </div>
            </div>
            <button 
              onClick={addMatrixTask} disabled={loading}
              className="w-full flex justify-center items-center gap-2 py-4 bg-amber-500 text-white rounded-2xl font-bold hover:bg-orange-500 transition-all shadow-md shadow-amber-200 hover:shadow-lg disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin" /> : <Plus size={20} />} Добавить задачу
            </button>
          </div>
        </div>

        {/* Колонка предпросмотра (правая) */}
        <div className="xl:col-span-8 space-y-6">
          {tasks.length === 0 ? (
            <div className="h-80 border-2 border-dashed border-slate-200 bg-white/50 rounded-[2.5rem] flex flex-col items-center justify-center text-slate-400">
              <FileText size={48} className="mb-4 text-slate-300" />
              <p className="text-xl font-bold text-slate-500">Список задач пуст</p>
              <p className="text-sm mt-2 opacity-70">Добавьте модули слева, чтобы сформировать вариант</p>
            </div>
          ) : (
            <div className="space-y-6 animate-in slide-in-from-bottom-4">
              {tasks.map((task, i) => (
                <div key={task.id} className="bg-white p-8 sm:p-10 rounded-[2.5rem] border border-slate-200 shadow-sm relative group hover:shadow-md transition-shadow">
                  <button 
                    onClick={() => removeTask(task.id)} 
                    className="absolute top-8 right-8 p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                  >
                    <Trash2 size={24} />
                  </button>
                  
                  <div className="mb-6">
                    <span className="bg-amber-100 text-amber-700 text-[11px] font-black px-4 py-1.5 rounded-full uppercase tracking-wider">
                      Задание {i + 1}
                    </span>
                  </div>
                  
                  <h5 className="font-bold text-2xl mb-4 text-slate-800">{task.title}</h5>
                  <p className="mb-8 text-slate-600 text-lg leading-relaxed">{task.task_text}</p>
                  
                  <div className="bg-slate-50 p-8 rounded-[2rem] flex justify-center border border-slate-100 shadow-inner text-xl">
                    <BlockMath math={task.matrix_latex} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}