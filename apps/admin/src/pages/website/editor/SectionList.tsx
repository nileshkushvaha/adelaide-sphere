import { useState } from 'react';
import { Button, Tag, Tooltip, Typography } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, CopyOutlined, DeleteOutlined, DownOutlined, EyeInvisibleOutlined, EyeOutlined, HolderOutlined, RightOutlined } from '@ant-design/icons';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type Announcements, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PAGE_SECTION_LIMITS, type PageSection } from '@adelaide-sphere/domain/page-sections';
import type { StaticPageReferences } from '@/api/settings';
import { usePrefersReducedMotion } from '@/shared/usePrefersReducedMotion';
import { SectionFields, type ReferenceUpdate } from './SectionFields';
import { SectionIcon } from './SectionIcon';
import { duplicateSection, errorsForSection, moveSection, sectionLabel, sectionSummary, type FieldErrors } from './page-sections-model';

interface Props {
  sections: PageSection[];
  onChange: (sections: PageSection[]) => void;
  onRemove: (index: number) => void;
  expanded: ReadonlySet<string>;
  onToggle: (id: string) => void;
  /** The API's errors for the whole list, keyed `sections[i].field`. */
  errors: FieldErrors;
  references: StaticPageReferences;
  onReference: (update: ReferenceUpdate) => void;
  pageTitle: string;
  disabled: boolean;
}

/**
 * The page's sections, top to bottom. Each can be dragged by its handle (which
 * also works with the space bar and arrow keys) or moved with its up and down
 * buttons, so reordering never needs a pointer (WCAG 2.5.7). Every move is
 * announced. The page header is fixed at the top.
 */
export function SectionList({ sections, onChange, onRemove, expanded, onToggle, errors, references, onReference, pageTitle, disabled }: Props) {
  const reducedMotion = usePrefersReducedMotion();
  const [announcement, setAnnouncement] = useState('');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const labelOf = (id: string | number | undefined) => {
    const index = sections.findIndex((section) => section.id === id);
    return index >= 0 ? `${sectionLabel(sections[index]!)}, section ${index + 1}` : 'section';
  };
  const positionOf = (id: string | number | undefined) => sections.findIndex((section) => section.id === id) + 1;

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${labelOf(active.id)}.`,
    onDragOver: ({ active, over }) => (over ? `${labelOf(active.id)} is over position ${positionOf(over.id)}.` : undefined),
    onDragEnd: ({ active, over }) => (over ? `${labelOf(active.id)} was dropped at position ${positionOf(over.id)}.` : `${labelOf(active.id)} was put back.`),
    onDragCancel: ({ active }) => `Moving ${labelOf(active.id)} was cancelled.`,
  };

  const reorder = (from: number, to: number) => {
    const next = moveSection(sections, from, to);
    if (!next) {
      setAnnouncement('The page header stays at the top of the page.');
      return;
    }
    onChange(next);
    setAnnouncement(`${sectionLabel(sections[from]!)} moved to position ${to + 1} of ${sections.length}.`);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    reorder(
      sections.findIndex((section) => section.id === active.id),
      sections.findIndex((section) => section.id === over.id),
    );
  };

  return (
    <>
      <div className="sr-only" aria-live="polite" role="status">
        {announcement}
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} accessibility={{ announcements }}>
        <SortableContext items={sections.map((section) => section.id)} strategy={verticalListSortingStrategy}>
          <ol className="ms-page-sections">
            {sections.map((section, index) => (
              <SortableSection
                key={section.id}
                section={section}
                index={index}
                count={sections.length}
                previousIsHeader={index > 0 && sections[index - 1]?.type === 'header'}
                reducedMotion={reducedMotion}
                open={expanded.has(section.id)}
                onToggle={() => onToggle(section.id)}
                errors={errorsForSection(errors, index)}
                disabled={disabled}
                onChange={(next) => onChange(sections.map((entry, i) => (i === index ? next : entry)))}
                onMove={(to) => reorder(index, to)}
                onHide={() => {
                  onChange(sections.map((entry, i) => (i === index ? { ...entry, hidden: !entry.hidden } : entry)));
                  setAnnouncement(section.hidden ? `${sectionLabel(section)} is shown on the page again.` : `${sectionLabel(section)} is hidden from visitors.`);
                }}
                onDuplicate={() => {
                  const next = duplicateSection(sections, index);
                  if (next) {
                    onChange(next);
                    setAnnouncement(`${sectionLabel(section)} duplicated as section ${index + 2}.`);
                  }
                }}
                canDuplicate={section.type !== 'header' && sections.length < PAGE_SECTION_LIMITS.sections}
                onRemove={() => onRemove(index)}
                references={references}
                onReference={onReference}
                pageTitle={pageTitle}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
    </>
  );
}

function SortableSection({
  section,
  index,
  count,
  reducedMotion,
  open,
  onToggle,
  errors,
  disabled,
  onChange,
  onMove,
  onHide,
  onDuplicate,
  canDuplicate,
  onRemove,
  references,
  onReference,
  pageTitle,
  previousIsHeader,
}: {
  section: PageSection;
  index: number;
  count: number;
  /** The section above is the page header, which always stays first. */
  previousIsHeader: boolean;
  reducedMotion: boolean;
  open: boolean;
  onToggle: () => void;
  errors: FieldErrors;
  disabled: boolean;
  onChange: (section: PageSection) => void;
  onMove: (to: number) => void;
  onHide: () => void;
  onDuplicate: () => void;
  canDuplicate: boolean;
  onRemove: () => void;
  references: StaticPageReferences;
  onReference: (update: ReferenceUpdate) => void;
  pageTitle: string;
}) {
  const fixed = section.type === 'header';
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: section.id, disabled: disabled || fixed });
  const label = sectionLabel(section);
  const problems = Object.values(errors).flat().length;
  const bodyId = `page-section-body-${section.id}`;

  return (
    <li
      ref={setNodeRef}
      className={`ms-page-section${section.hidden ? ' is-hidden' : ''}${isDragging ? ' is-dragging' : ''}${problems ? ' has-errors' : ''}`}
      style={{ transform: CSS.Translate.toString(transform), transition: reducedMotion ? undefined : transition }}
    >
      <div className="ms-page-section__bar">
        {!disabled && !fixed ? (
          <button type="button" ref={setActivatorNodeRef} className="ms-page-section__handle" aria-label={`Reorder ${label}, section ${index + 1}`} {...attributes} {...listeners}>
            <HolderOutlined aria-hidden="true" />
          </button>
        ) : (
          <span className="ms-page-section__handle is-static" aria-hidden="true" />
        )}
        <button type="button" className="ms-page-section__toggle" aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
          {open ? <DownOutlined aria-hidden="true" /> : <RightOutlined aria-hidden="true" />}
          <span className="ms-page-section__icon">
            <SectionIcon type={section.type} />
          </span>
          <span className="ms-page-section__text">
            <span className="ms-page-section__label">
              {index + 1}. {label}
            </span>
            <Typography.Text type="secondary" className="ms-page-section__summary">
              {sectionSummary(section, pageTitle)}
            </Typography.Text>
          </span>
        </button>
        <span className="ms-page-section__tags">
          {section.hidden && <Tag>Hidden</Tag>}
          {problems > 0 && <Tag color="error">{problems === 1 ? '1 problem' : `${problems} problems`}</Tag>}
        </span>
        {!disabled && (
          <span className="ms-page-section__actions">
            <Tooltip title="Move up">
              <Button type="text" size="small" icon={<ArrowUpOutlined aria-hidden="true" />} aria-label={`Move ${label} up`} disabled={fixed || index === 0 || previousIsHeader} onClick={() => onMove(index - 1)} />
            </Tooltip>
            <Tooltip title="Move down">
              <Button type="text" size="small" icon={<ArrowDownOutlined aria-hidden="true" />} aria-label={`Move ${label} down`} disabled={fixed || index === count - 1} onClick={() => onMove(index + 1)} />
            </Tooltip>
            <Tooltip title={section.hidden ? 'Show on the page' : 'Hide from visitors'}>
              <Button type="text" size="small" icon={section.hidden ? <EyeOutlined aria-hidden="true" /> : <EyeInvisibleOutlined aria-hidden="true" />} aria-label={section.hidden ? `Show ${label}` : `Hide ${label}`} aria-pressed={section.hidden} onClick={onHide} />
            </Tooltip>
            <Tooltip title="Duplicate">
              <Button type="text" size="small" icon={<CopyOutlined aria-hidden="true" />} aria-label={`Duplicate ${label}`} disabled={!canDuplicate} onClick={onDuplicate} />
            </Tooltip>
            <Tooltip title="Remove">
              <Button type="text" size="small" danger icon={<DeleteOutlined aria-hidden="true" />} aria-label={`Remove ${label}`} onClick={onRemove} />
            </Tooltip>
          </span>
        )}
      </div>
      <div id={bodyId} className="ms-page-section__body" hidden={!open}>
        {section.hidden && (
          <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
            Hidden: kept on the page but not shown to visitors.
          </Typography.Paragraph>
        )}
        {open && <SectionFields section={section} index={index} onChange={onChange} errors={errors} references={references} onReference={onReference} pageTitle={pageTitle} disabled={disabled} />}
      </div>
    </li>
  );
}
