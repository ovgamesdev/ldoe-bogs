import { useLanguage } from '@/context/LanguageContext'
import React from 'react'

interface ImageModalProps {
  src: string | null;
  onClose: () => void;
}

const ImageModalComponent: React.FC<ImageModalProps> = ({ src, onClose }) => {
  const { t } = useLanguage();
  if (!src) return null;

  return (
    <div className="image-modal" onClick={onClose}>
      <img src={src} alt={t('loot_fullsize_alt')} onClick={(e) => e.stopPropagation()} />
    </div>
  );
};

export const ImageModal = React.memo(ImageModalComponent);