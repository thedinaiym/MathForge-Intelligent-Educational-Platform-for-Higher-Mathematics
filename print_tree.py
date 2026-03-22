from pathlib import Path

def print_tree(directory, prefix="", exclude_dirs=None):
    # Папки, которые мы не хотим видеть в нашей структуре
    if exclude_dirs is None:
        exclude_dirs = {'venv', '.git', '__pycache__', 'node_modules', '.idea'}

    path = Path(directory)
    
    try:
        # Получаем все элементы в папке и фильтруем их
        items = list(path.iterdir())
        items = [i for i in items if i.name not in exclude_dirs]
        
        # Сортируем: сначала папки, потом файлы (по алфавиту)
        items.sort(key=lambda x: (x.is_file(), x.name.lower()))

        for index, item in enumerate(items):
            is_last = index == len(items) - 1
            connector = "└── " if is_last else "├── "
            
            print(f"{prefix}{connector}{item.name}")
            
            # Если это папка, рекурсивно заходим в нее
            if item.is_dir():
                extension = "    " if is_last else "│   "
                print_tree(item, prefix=prefix + extension, exclude_dirs=exclude_dirs)
                
    except PermissionError:
        # Если нет прав на чтение какой-то папки, просто пропускаем
        pass

# Запускаем скрипт для текущей директории (корня проекта)
print("📦 Мой проект (MathForge):")
print_tree(".")