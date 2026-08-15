import React from 'react'

interface ImageModalProps {
  src: string | null;
  onClose: () => void;
}

const ImageModalComponent: React.FC<ImageModalProps> = ({ src, onClose }) => {
  if (!src) return null;

  return (
    <div className="image-modal" onClick={onClose}>
      <img src={src} alt="Loot Fullsize" onClick={(e) => e.stopPropagation()} />
    </div>
  );
};

export const ImageModal = React.memo(ImageModalComponent);