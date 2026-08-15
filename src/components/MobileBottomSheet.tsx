'use client'

import { useLanguage } from '@/context/LanguageContext'
import { GroupsKeys } from '@/lib/initial-data'
import React, { useEffect, useRef } from 'react'

interface MobileBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  groups: GroupsKeys[];
  activeFilters: Set<GroupsKeys>;
  onToggleFilter: (group: GroupsKeys) => void;
  onShowAll: () => void;
  onHideAll: () => void;
  onResetAll: () => void;
  // Возвращает подпись группы с счётчиком "(осталось/всего)" — формируется в MainMapClient
  getGroupLabel: (group: GroupsKeys) => string;
  // Возвращает текст подсказки для группы (например, состав случайного спавна на текущей карте)
  getGroupTooltip?: (group: GroupsKeys) => string | undefined;
}

const MobileBottomSheetComponent: React.FC<MobileBottomSheetProps> = ({
  isOpen,
  onClose,
  groups,
  activeFilters,
  onToggleFilter,
  onShowAll,
  onHideAll,
  onResetAll,
  getGroupLabel,
  getGroupTooltip
}) => {
  const { t } = useLanguage()

  const contentRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const deltaY = useRef(0);
  const isDragging = useRef(false);

  // Свайп вниз для закрытия шторки (как в старой версии на ванильном JS).
  // Вешаем нативные слушатели с passive:false, чтобы preventDefault реально
  // блокировал скролл страницы во время перетаскивания.
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const handleTouchStart = (e: TouchEvent) => {
      // Если пользователь скроллит сетку фильтров (она не в самом верху),
      // даём ему скроллить контент, а не тянуть шторку.
      if (gridRef.current && gridRef.current.scrollTop > 0) return;

      startY.current = e.touches[0]?.clientY ?? 0;
      isDragging.current = true;
      content.style.transition = 'none';
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging.current) return;

      const currentY = e.touches[0]?.clientY ?? 0;
      deltaY.current = currentY - startY.current;

      if (deltaY.current > 0) {
        if (e.cancelable) e.preventDefault();
        content.style.transform = `translateY(${deltaY.current}px)`;
      }
    };

    const handleTouchEnd = () => {
      if (!isDragging.current) return;
      isDragging.current = false;

      content.style.transition = '';
      content.style.transform = '';

      if (deltaY.current > 100) {
        onClose();
      }
      deltaY.current = 0;
    };

    content.addEventListener('touchstart', handleTouchStart, { passive: true });
    content.addEventListener('touchmove', handleTouchMove, { passive: false });
    content.addEventListener('touchend', handleTouchEnd);

    return () => {
      content.removeEventListener('touchstart', handleTouchStart);
      content.removeEventListener('touchmove', handleTouchMove);
      content.removeEventListener('touchend', handleTouchEnd);
    };
  }, [onClose]);

  return (
    <div className={`bottom-sheet${isOpen ? ' open' : ''}`}>
      <div className="bottom-sheet-backdrop" onClick={onClose} />
      <div className="bottom-sheet-content" ref={contentRef}>
        <div className="bottom-sheet-drag-handle" />

        <div className="bottom-sheet-header">
          <h3>{t('filters')}</h3>
          <div className="quick-actions" style={{ display: 'flex', gap: 8 }}>
            <button className="btn-text" onClick={onShowAll}>
              ✅ {t('btn_show')}
            </button>
            <button className="btn-text" onClick={onHideAll}>
              ❌ {t('btn_hide')}
            </button>
          </div>
        </div>

        <div className="markers-grid" ref={gridRef}>
          {groups.map((group) => (
            <label key={group} className="marker-item" title={getGroupTooltip?.(group)}>
              <input
                type="checkbox"
                checked={activeFilters.has(group)}
                onChange={() => onToggleFilter(group)}
              />
              <span>{getGroupLabel(group)}</span>
            </label>
          ))}
        </div>

        <div className="bottom-sheet-footer">
          <button className="btn-danger" onClick={onResetAll}>
            ⚠️ {t('reset_all')}
          </button>
          <div className="footer-links">
            <a href="https://www.youtube.com/@UNKER...1" target="_blank" rel="noreferrer">
              🌐 {t('unker_credits')} UNKER
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

// Мемоизация: список фильтров/шторка не должны перестраиваться из-за
// не относящихся к ним изменений состояния (например, движения мыши по карте).
export const MobileBottomSheet = React.memo(MobileBottomSheetComponent);