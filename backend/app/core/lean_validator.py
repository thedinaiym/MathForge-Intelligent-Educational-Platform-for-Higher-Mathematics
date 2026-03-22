import os
import tempfile
import subprocess

class LeanValidator:
    """
    Интеграция с компилятором Lean 4 для формальной верификации.
    """
    @staticmethod
    def verify(lean_code: str) -> dict:
        if not lean_code or lean_code.strip() == "":
            return {"status": "skipped", "message": "Lean-код отсутствует в шаблоне."}
        
        try:
            # Создаем изолированную временную директорию
            with tempfile.TemporaryDirectory() as temp_dir:
                lean_file_path = os.path.join(temp_dir, "Theorem.lean")
                
                # Записываем код из JSON в файл Theorem.lean
                with open(lean_file_path, "w", encoding="utf-8") as f:
                    f.write(lean_code)
                
                # Вызываем компилятор Lean 4
                # (предполагается, что lean добавлен в PATH на сервере)
                result = subprocess.run(
                    ["lean", "Theorem.lean"],
                    cwd=temp_dir,
                    capture_output=True,
                    text=True
                )
                
                # Анализируем ответ от компилятора
                if result.returncode == 0 and "error" not in result.stderr.lower():
                    return {
                        "status": "success", 
                        "message": "Теорема доказана (Lean 4 Verified) 🛡️",
                        "output": result.stdout.strip()
                    }
                else:
                    # Если Lean нашел логическую дыру или синтаксическую ошибку
                    error_msg = result.stderr.strip() or result.stdout.strip()
                    # Убираем пути к временным папкам, чтобы не пугать юзера
                    error_msg = error_msg.replace(temp_dir, "").replace("\\", "/")
                    return {
                        "status": "error", 
                        "message": "Lean 4 нашел ошибку в логике!",
                        "output": error_msg
                    }
                    
        except FileNotFoundError:
            return {
                "status": "error", 
                "message": "Компилятор Lean 4 не найден на сервере. Установите elan/lean."
            }
        except Exception as e:
            return {"status": "error", "message": f"Системная ошибка: {str(e)}"}