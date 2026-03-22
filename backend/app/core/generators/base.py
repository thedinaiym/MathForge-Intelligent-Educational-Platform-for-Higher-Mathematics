from abc import ABC, abstractmethod
from typing import Dict, Any

class BaseTaskGenerator(ABC):
    """Базовый класс для всех математических генераторов"""
    @abstractmethod
    def generate(self, difficulty: str = "medium") -> Dict[str, Any]:
        """
        Должен возвращать словарь с ключами:
        - condition_latex: Условие в LaTeX
        - title: Название задачи
        - answer: Ответ (строка)
        - json_steps: Пошаговое решение для ИИ
        """
        pass