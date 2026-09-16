import { Modal, Typography } from 'antd';
import type { PageSectionDefinition, PageSectionType } from '@adelaide-sphere/domain/page-sections';
import { SectionIcon } from './SectionIcon';

interface Props {
  open: boolean;
  options: PageSectionDefinition[];
  /** Explains why some types are not offered, e.g. on a policy page. */
  note?: string;
  onPick: (type: PageSectionType) => void;
  onCancel: () => void;
}

/** "Add section": every type this page may use, each with a sentence saying what it is for. */
export function AddSectionDialog({ open, options, note, onPick, onCancel }: Props) {
  return (
    <Modal open={open} title="Add a section" footer={null} onCancel={onCancel} width={720} destroyOnHidden>
      {note && (
        <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
          {note}
        </Typography.Paragraph>
      )}
      <ul className="as-section-gallery">
        {options.map((option) => (
          <li key={option.type}>
            <button type="button" className="as-section-gallery__item" onClick={() => onPick(option.type)}>
              <span className="as-section-gallery__icon">
                <SectionIcon type={option.type} />
              </span>
              <span>
                <span className="as-section-gallery__label">{option.label}</span>
                <span className="as-section-gallery__description">{option.description}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
