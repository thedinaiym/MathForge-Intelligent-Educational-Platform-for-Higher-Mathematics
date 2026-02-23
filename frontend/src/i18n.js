import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

const resources = {
  ru: {
    translation: {
      "menu": "Меню", "home": "Главная", "analyzer": "Тренажер", "generator": "Генератор",
      "profile": "Мой профиль", "login": "Войти в аккаунт", "logout": "Выйти",
      "role_student": "Ученик", "role_teacher": "Преподаватель",
      "hero_title_1": "Математика без списывания.", "hero_title_2": "Обучение с пониманием.",
      "hero_subtitle": "MathForge — гибридная образовательная платформа. Учителя генерируют уникальные варианты, а ИИ помогает ученикам находить ошибки.",
      "try_analyzer": "Попробовать тренажер", "iam_teacher": "Я преподаватель",
      "open_library_title": "Открытая библиотека", "open_library_desc": "Справочники и формулы доступны без регистрации. Изучайте теорию перед практикой.",
      "ai_title": "Neuro-Symbolic AI", "ai_desc": "Наш ИИ не дает готовых ответов. Он анализирует ваши шаги и мягко подталкивает к верному решению.",
      "analyzer_title": "Тренажер", "analyzer_subtitle": "Решай задачи до 100% автоматизма",
      "activity_heatmap": "Активность за 30 дней", "choose_topic": "Выбери тему для тренировки",
      "start_matrix": "Начать: Определитель 2x2", "your_answer": "Введи свой ответ...",
      "check_btn": "Проверить", "correct": "Верно!", "wrong": "Ошибка",
      "next_task": "Следующая задача", "mastery_reached": "Тема усвоена! Ты молодец!",
      "need_hint": "Нужна подсказка?", "hint_title": "Подсказка от ИИ:", "progress": "Прогресс темы"
    }
  },
  en: {
    translation: {
      "menu": "Menu", "home": "Home", "analyzer": "Analyzer", "generator": "Generator",
      "profile": "My Profile", "login": "Log In", "logout": "Log Out",
      "role_student": "Student", "role_teacher": "Teacher",
      "hero_title_1": "Math without cheating.", "hero_title_2": "Learning with understanding.",
      "hero_subtitle": "MathForge is a hybrid educational platform. Teachers generate unique variants, and AI helps students find their mistakes.",
      "try_analyzer": "Try the Analyzer", "iam_teacher": "I am a Teacher",
      "open_library_title": "Open Library", "open_library_desc": "Reference books and formulas are available without registration. Study theory before practice.",
      "ai_title": "Neuro-Symbolic AI", "ai_desc": "Our AI does not give direct answers. It analyzes your steps and gently guides you to the correct solution.",
      "analyzer_title": "Analyzer", "analyzer_subtitle": "Solve tasks to 100% mastery",
      "activity_heatmap": "Activity over 30 days", "choose_topic": "Choose a topic to practice",
      "start_matrix": "Start: 2x2 Determinant", "your_answer": "Enter your answer...",
      "check_btn": "Check", "correct": "Correct!", "wrong": "Mistake",
      "next_task": "Next task", "mastery_reached": "Topic mastered! Great job!",
      "need_hint": "Need a hint?", "hint_title": "AI Hint:", "progress": "Topic Progress"
    }
  },
  ky: {
    translation: {
      "menu": "Меню", "home": "Башкы бет", "analyzer": "Машыктыргыч", "generator": "Генератор",
      "profile": "Менин профилим", "login": "Кирүү", "logout": "Чыгуу",
      "role_student": "Окуучу", "role_teacher": "Мугалим",
      "hero_title_1": "Көчүрүүсүз математика.", "hero_title_2": "Түшүнүү менен окуу.",
      "hero_subtitle": "MathForge — гибриддик билим берүү платформасы. Мугалимдер уникалдуу варианттарды түзүшөт, ал эми КИ окуучуларга каталарын табууга жардам берет.",
      "try_analyzer": "Машыктыргычты көрүү", "iam_teacher": "Мен мугалиммин",
      "open_library_title": "Ачык китепкана", "open_library_desc": "Маалымдамалар жана формулалар каттосуз жеткиликтүү. Практикадан мурун теорияны окуп чыгыңыз.",
      "ai_title": "Neuro-Symbolic AI", "ai_desc": "Биздин КИ даяр жоопторду бербейт. Ал сиздин кадамдарыңызды анализдеп, туура чечимге акырын багыттайт.",
      "analyzer_title": "Машыктыргыч", "analyzer_subtitle": "Маселелерди 100% автоматизмге чейин чыгар",
      "activity_heatmap": "30 күндүк активдүүлүк", "choose_topic": "Машыгуу үчүн теманы танда",
      "start_matrix": "Баштоо: 2x2 Аныктагыч", "your_answer": "Жообуңду жаз...",
      "check_btn": "Текшерүү", "correct": "Туура!", "wrong": "Ката",
      "next_task": "Кийинки маселе", "mastery_reached": "Тема өздөштүрүлдү! Азаматсың!",
      "need_hint": "Жардам керекпи?", "hint_title": "КИ жардамы:", "progress": "Теманын прогресси"
    }
  }
};

i18n.use(LanguageDetector).use(initReactI18next).init({
  resources, fallbackLng: 'ru', interpolation: { escapeValue: false }
});

export default i18n;