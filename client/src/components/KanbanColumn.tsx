import React from 'react';
import { Droppable } from '@hello-pangea/dnd';

interface KanbanColumnProps {
  label: string;
  count: number;
  color: string;
  children: React.ReactNode;
  droppableId?: string;
}

export default function KanbanColumn({ label, count, color, children, droppableId }: KanbanColumnProps) {
  const innerContent = droppableId ? (
    <Droppable droppableId={droppableId}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.droppableProps}
          className="flex flex-col gap-2 p-3 overflow-y-auto transition-colors"
          style={{
            maxHeight: '70vh',
            minHeight: '60px',
            background: snapshot.isDraggingOver ? 'var(--surface3)' : undefined,
          }}
        >
          {children}
          {provided.placeholder}
        </div>
      )}
    </Droppable>
  ) : (
    <div className="flex flex-col gap-2 p-3 overflow-y-auto" style={{ maxHeight: '70vh' }}>
      {children}
    </div>
  );

  return (
    <div
      className="flex flex-col rounded-xl min-w-[260px] max-w-[300px] flex-shrink-0"
      style={{ background: 'var(--surface2)' }}
    >
      <div
        className="flex items-center gap-2 px-4 py-3"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
        <span className="font-semibold text-sm flex-1" style={{ color: 'var(--text)' }}>{label}</span>
        <span
          className="text-xs font-bold px-1.5 py-0.5 rounded-full"
          style={{ background: 'var(--surface3)', color: 'var(--text2)' }}
        >
          {count}
        </span>
      </div>
      {innerContent}
    </div>
  );
}
