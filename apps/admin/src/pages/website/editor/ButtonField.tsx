import { useState } from 'react';
import { Button, Form, Input, Radio, Space, Typography } from 'antd';
import { DeleteOutlined, FilePdfOutlined, PlusOutlined } from '@ant-design/icons';
import type { PageButton } from '@adelaide-sphere/domain/page-sections';
import { DocumentPickerDialog } from '@/components/editor/DocumentPickerDialog';
import { emptyButton, firstError, type FieldErrors } from './page-sections-model';

interface Props {
  /** What the button is, e.g. "Main button". */
  label: string;
  value: PageButton | null;
  onChange: (value: PageButton | null) => void;
  /** A required button cannot be removed, only filled in. */
  required?: boolean;
  /** Errors for this button, keyed `label`, `href` and `documentId`. */
  errors: FieldErrors;
  documents: Record<string, { title: string; url: string }>;
  onDocumentChosen: (id: string, document: { title: string; url: string }) => void;
  disabled?: boolean;
  /** Unique within the page, for label and input ids. */
  idPrefix: string;
}

/**
 * A section's button: a label, and where it goes — a page on this site, a web,
 * email or phone address, or a PDF from the media library. Optional buttons
 * start as "Add a button" so an empty section does not look unfinished.
 */
export function ButtonField({ label, value, onChange, required = false, errors, documents, onDocumentChosen, disabled = false, idPrefix }: Props) {
  const [picking, setPicking] = useState(false);

  if (!value) {
    return (
      <Form.Item label={label} style={{ marginBottom: 16 }}>
        <Button icon={<PlusOutlined aria-hidden="true" />} onClick={() => onChange(emptyButton())} disabled={disabled}>
          Add a button
        </Button>
      </Form.Item>
    );
  }

  const destination = value.documentId ? 'document' : 'link';
  const document = value.documentId ? documents[value.documentId] : undefined;
  const set = (patch: Partial<PageButton>) => onChange({ ...value, ...patch });

  return (
    <fieldset className="ms-page-button-field" style={{ border: 0, padding: 0, margin: '0 0 16px' }}>
      <legend style={{ fontWeight: 500, fontSize: 14, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <span>{label}</span>
        {!required && (
          <Button type="text" size="small" icon={<DeleteOutlined aria-hidden="true" />} onClick={() => onChange(null)} disabled={disabled} aria-label={`Remove ${label.toLowerCase()}`}>
            Remove
          </Button>
        )}
      </legend>
      <Form.Item label="Button text" htmlFor={`${idPrefix}-label`} validateStatus={firstError(errors, 'label') ? 'error' : undefined} help={firstError(errors, 'label')} style={{ marginBottom: 8 }}>
        <Input id={`${idPrefix}-label`} value={value.label} maxLength={40} showCount placeholder="e.g. Contact us" onChange={(event) => set({ label: event.target.value })} disabled={disabled} />
      </Form.Item>
      <Radio.Group
        value={destination}
        onChange={(event) => set(event.target.value === 'document' ? { href: null } : { documentId: null })}
        disabled={disabled}
        aria-label={`Where ${label.toLowerCase()} goes`}
        style={{ marginBottom: 8 }}
      >
        <Radio value="link">A page or address</Radio>
        <Radio value="document">A PDF document</Radio>
      </Radio.Group>
      {destination === 'link' ? (
        <Form.Item
          label="Goes to"
          htmlFor={`${idPrefix}-href`}
          validateStatus={firstError(errors, 'href') ? 'error' : undefined}
          help={firstError(errors, 'href') ?? 'A page on this site such as /contact, or a full https://, mailto: or tel: address.'}
          style={{ marginBottom: 0 }}
        >
          <Input id={`${idPrefix}-href`} value={value.href ?? ''} placeholder="/contact" onChange={(event) => set({ href: event.target.value || null })} disabled={disabled} />
        </Form.Item>
      ) : (
        <Form.Item label="Document" validateStatus={firstError(errors, 'documentId') || firstError(errors, 'href') ? 'error' : undefined} help={firstError(errors, 'documentId') ?? firstError(errors, 'href')} style={{ marginBottom: 0 }}>
          <Space wrap>
            {value.documentId && (
              <Typography.Text>
                <FilePdfOutlined aria-hidden="true" /> {document?.title ?? 'The chosen document'}
              </Typography.Text>
            )}
            <Button onClick={() => setPicking(true)} disabled={disabled}>
              {value.documentId ? 'Choose another' : 'Choose a PDF'}
            </Button>
          </Space>
        </Form.Item>
      )}
      {picking && (
        <DocumentPickerDialog
          selectedText={value.label}
          onCancel={() => setPicking(false)}
          onInsert={(link) => {
            onDocumentChosen(link.mediaId, { title: link.text, url: link.href });
            set({ documentId: link.mediaId, href: null, label: value.label || 'Download the PDF' });
            setPicking(false);
          }}
        />
      )}
    </fieldset>
  );
}
