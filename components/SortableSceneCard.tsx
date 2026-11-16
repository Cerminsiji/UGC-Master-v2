'use client';

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { SceneCard, SceneCardProps } from './SceneCard';

interface SortableSceneCardProps extends Omit<SceneCardProps, 'dragHandleRef' | 'dragHandleAttributes' | 'dragHandleListeners' | 'isDragging'> {
  disabled?: boolean;
}

export const SortableSceneCard: React.FC<SortableSceneCardProps> = ({
  scene,
  disabled = false,
  ...cardProps
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: scene.id,
    disabled,
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 40 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      id={`scene-card-${scene.id}`}
      style={style}
      className={isDragging ? 'relative' : undefined}
    >
      <SceneCard
        scene={scene}
        {...cardProps}
        dragHandleRef={setActivatorNodeRef}
        dragHandleAttributes={attributes}
        dragHandleListeners={listeners}
        isDragging={isDragging}
      />
    </div>
  );
};
