class TaskRegistry:
    """Реестр всех доступных генераторов задач"""
    _registry = {}

    @classmethod
    def register(cls, topic_id: str, name: str, chapter: str):
        def wrapper(generator_class):
            cls._registry[topic_id] = {
                "class": generator_class,
                "name": name,
                "chapter": chapter
            }
            return generator_class
        return wrapper

    @classmethod
    def get_generator(cls, topic_id: str):
        if topic_id not in cls._registry:
            raise ValueError(f"Тема {topic_id} не найдена в реестре!")
        return cls._registry[topic_id]["class"]()

    @classmethod
    def get_menu(cls):
        """Отдает меню, сгруппированное по главам учебника"""
        menu = {}
        for topic_id, data in cls._registry.items():
            chapter = data["chapter"]
            if chapter not in menu:
                menu[chapter] = []
            menu[chapter].append({"id": topic_id, "name": data["name"]})
        return menu