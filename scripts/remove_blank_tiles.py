import os
from PIL import Image

def is_empty_image(filepath):
    """Проверяет, является ли изображение полностью прозрачным."""
    try:
        with Image.open(filepath) as img:
            # Преобразуем в RGBA, если это не так
            if img.mode != 'RGBA':
                img = img.convert('RGBA')
            
            # Получаем данные о прозрачности (альфа-канал)
            # getextrema() возвращает (min, max) для каждого канала
            # Индекс 3 — это альфа-канал
            alpha_min, alpha_max = img.getextrema()[3]
            
            # Если максимальное значение прозрачности равно 0, значит картинка пустая
            return alpha_max == 0
    except Exception as e:
        print(f"Ошибка при чтении {filepath}: {e}")
        return False

def clean_tiles(root_dir):
    """Рекурсивно обходит папку и удаляет пустые изображения."""
    deleted_count = 0
    total_checked = 0

    print(f"Начинаю сканирование: {root_dir}")

    for root, dirs, files in os.walk(root_dir):
        for file in files:
            if file.lower().endswith(('.png', '.webp')):
                filepath = os.path.join(root, file)
                total_checked += 1
                
                if is_empty_image(filepath):
                    os.remove(filepath)
                    deleted_count += 1
                    print(f"Удален пустой тайл: {filepath}")

    print("-" * 30)
    print(f"Завершено!")
    print(f"Проверено файлов: {total_checked}")
    print(f"Удалено пустых: {deleted_count}")

if __name__ == "__main__":
    # Укажи путь к папке с тайлами. 
    # Судя по твоему коду, это 'public/tiles/swamp_forest', 'public/tiles/wild_bogs' и т.д.
    tiles_path = 'public/tiles' 
    
    if os.path.exists(tiles_path):
        clean_tiles(tiles_path)
    else:
        print(f"Путь {tiles_path} не найден.")