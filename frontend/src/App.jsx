import React, { useState } from 'react';
import axios from 'axios';
import { Calculator, BookOpen, Download, Plus, Loader2, Trash2, FileText } from 'lucide-react';
import 'katex/dist/katex.min.css';
import { BlockMath } from 'react-katex';

function App() {
  const [tasks, setTasks] = useState([]); // Список всех задач в текущем варианте
  const [loading, setLoading] = useState(false); // Загрузка для генерации задачи
  const [pdfLoading, setPdfLoading] = useState(false); // Загрузка для генерации PDF

  // 1. Функция добавления новой матрицы с бэкенда
  const addMatrixTask = async () => {
    setLoading(true);
    try {
      const response = await axios.get('http://127.0.0.1:8000/api/tasks/generate-matrix');
      const newTask = { ...response.data, id: Date.now() };
      setTasks([...tasks, newTask]);
    } catch (error) {
      console.error("Ошибка API:", error);
      alert("Не удалось получить задачу. Проверь работу бэкенда (uvicorn).");
    } finally {
      setLoading(false);
    }
  };

  // 2. Функция удаления задачи из списка
  const removeTask = (id) => {
    setTasks(tasks.filter(t => t.id !== id));
  };

  // 3. Функция скачивания PDF
  const downloadPDF = async () => {
    if (tasks.length === 0) {
      alert("Добавьте хотя бы одну задачу в список!");
      return;
    }

    setPdfLoading(true);
    try {
      const response = await axios.post(
        'http://127.0.0.1:8000/api/tasks/export-pdf',
        tasks,
        { responseType: 'blob' } // Указываем, что ждем файл
      );

      // Создаем временную ссылку для скачивания файла
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `MathForge_Variant_${Date.now()}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Ошибка при генерации PDF:", error);
      alert("Ошибка при создании PDF. Проверь бэкенд.");
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-gray-50 text-slate-900 font-sans">
      {/* Sidebar - Боковая панель */}
      <aside className="w-64 bg-white border-r border-gray-200 p-6 flex flex-col fixed h-full shadow-sm">
        <div className="flex items-center gap-2 mb-10 text-blue-600">
          <Calculator size={32} strokeWidth={2.5} />
          <span className="text-2xl font-black tracking-tighter text-slate-800">MathForge</span>
        </div>
        
        <nav className="space-y-2">
          <div className="px-4 py-2 text-xs font-bold text-gray-400 uppercase tracking-widest">Рабочая область</div>
          <button className="w-full flex items-center gap-3 px-4 py-3 bg-blue-50 text-blue-700 rounded-xl font-bold transition-all">
            <FileText size={20} /> Задачи
          </button>
        </nav>

        <div className="mt-auto p-4 bg-slate-50 rounded-2xl border border-slate-100">
          <p className="text-xs text-slate-400 font-medium italic">Дипломный проект: Кузница математических задач</p>
        </div>
      </aside>

      {/* Main Content - Основная область */}
      <main className="flex-1 ml-64 p-10">
        <header className="flex justify-between items-center mb-12">
          <div>
            <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">Конструктор вариантов</h1>
            <p className="text-slate-500 mt-2 text-lg">Сформируйте список заданий для печати</p>
          </div>
          
          <button 
            onClick={downloadPDF}
            disabled={tasks.length === 0 || pdfLoading}
            className="flex items-center gap-2 bg-slate-900 text-white px-8 py-4 rounded-2xl hover:bg-slate-800 transition shadow-xl font-bold disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {pdfLoading ? <Loader2 className="animate-spin" size={20} /> : <Download size={20} />}
            Скачать PDF {tasks.length > 0 && `(${tasks.length})`}
          </button>
        </header>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-10">
          
          {/* Секция выбора модулей */}
          <div className="xl:col-span-4 space-y-6">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest ml-2">Доступные темы</h3>
            
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:border-blue-300 transition-colors group">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-blue-100 text-blue-600 rounded-lg group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <Calculator size={24} />
                </div>
                <div>
                  <h4 className="font-bold text-xl">Линейная алгебра</h4>
                  <p className="text-slate-400 text-xs font-medium uppercase">Матрицы 2x2</p>
                </div>
              </div>
              
              <button 
                onClick={addMatrixTask}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-100 disabled:bg-slate-300"
              >
                {loading ? <Loader2 className="animate-spin" /> : <Plus size={20} />}
                Сгенерировать задачу
              </button>
            </div>
          </div>

          {/* Секция предпросмотра варианта */}
          <div className="xl:col-span-8 space-y-6">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest ml-2">Предпросмотр варианта</h3>
            
            {tasks.length === 0 ? (
              <div className="h-80 border-2 border-dashed border-slate-200 rounded-[2rem] flex flex-col items-center justify-center text-slate-400 bg-white/50 backdrop-blur-sm">
                <div className="bg-slate-100 p-4 rounded-full mb-4">
                  <Plus size={32} />
                </div>
                <p className="text-xl font-bold">Список задач пуст</p>
                <p className="text-sm opacity-70 mt-1">Выберите тему слева, чтобы добавить задание</p>
              </div>
            ) : (
              <div className="space-y-6 animate-in fade-in duration-500">
                {tasks.map((task, index) => (
                  <div key={task.id} className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm relative group hover:shadow-md transition-shadow">
                    
                    {/* Кнопка удаления */}
                    <button 
                      onClick={() => removeTask(task.id)}
                      className="absolute top-6 right-6 p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"
                      title="Удалить из списка"
                    >
                      <Trash2 size={22} />
                    </button>

                    <div className="flex items-center gap-2 mb-4">
                      <span className="bg-blue-600 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-tighter">
                        Задание {index + 1}
                      </span>
                    </div>

                    <h5 className="font-bold text-xl mb-4 text-slate-800">{task.title}</h5>
                    <p className="text-slate-600 mb-8 leading-relaxed">{task.task_text}</p>
                    
                    <div className="bg-slate-50 p-8 rounded-2xl border border-slate-100 flex justify-center items-center shadow-inner overflow-x-auto">
                      <BlockMath math={task.matrix_latex} />
                    </div>

                    {/* Скрытое решение */}
                    <div className="mt-8 pt-6 border-t border-slate-50">
                      <details className="group">
                        <summary className="list-none flex items-center gap-2 cursor-pointer text-sm font-bold text-slate-400 hover:text-blue-600 transition-colors">
                          <span className="w-2 h-2 bg-slate-300 rounded-full group-open:bg-blue-600"></span>
                          Показать ответ и решение
                        </summary>
                        <div className="mt-4 p-6 bg-green-50 rounded-2xl text-green-800 border border-green-100 animate-in slide-in-from-top-2 duration-300">
                          <div className="flex flex-col gap-2">
                            <p className="flex items-center gap-2">
                              <span className="font-black">ОТВЕТ:</span> 
                              <span className="text-lg font-mono tracking-wider">{task.answer}</span>
                            </p>
                            <p className="text-sm font-medium opacity-80 italic">
                              Ход решения: {task.step_by_step}
                            </p>
                          </div>
                        </div>
                      </details>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;