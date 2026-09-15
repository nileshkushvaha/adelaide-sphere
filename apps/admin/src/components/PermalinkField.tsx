import { useState } from 'react';
import { Button, Input, Space, Typography } from 'antd';
import { brand } from '@/config/theme';

interface Props {
  /** The public path the address sits under, e.g. `/business`. */
  base: string;
  /**
   * The current address segment; empty before one has been chosen. Supplied by
   * `Form.Item` when this is used as a form control.
   */
  value?: string;
  /** What the address will be when it is generated from the title. */
  placeholder?: string;
  disabled?: boolean;
  /**
   * Saves a new address. Resolves when it has been accepted; rejects to keep
   * the editor open with what was typed. The caller decides whether that is a
   * form change or, once published, a move that leaves a redirect behind.
   */
  onSave?: (slug: string) => Promise<void> | void;
  /**
   * Supplied by `Form.Item`. When there is no `onSave`, the address is an
   * ordinary form value and this is how it is written — which also means Ant
   * validates it and renders any error under this row, rather than the error
   * appearing at the top of the page for a field with nowhere to show it.
   */
  onChange?: (slug: string) => void;
  /** Said once, under the field, while it is being edited. */
  note?: string;
  /**
   * What the address is made from, in the caller's own words — "title" for an
   * article, "name" for a category. It appears before one exists, so the
   * sentence has to match the field above it.
   */
  source?: string;
}

const SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The web address of a record, shown the way a CMS shows it: one line under the
 * title, read-only until "Edit" is pressed.
 *
 * The address matters and is worth seeing, but it is not a field an editor
 * fills in — it is made from the title. Presenting it as an ordinary input
 * invited people to type one, and left a "slug" on screens that only needed to
 * show where the page lives.
 */
export function PermalinkField({ base, value = '', placeholder, disabled = false, onSave, onChange, note, source = 'name' }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const shown = value || placeholder || '';

  const start = () => {
    setDraft(value);
    setProblem(null);
    setEditing(true);
  };

  const save = async () => {
    const next = draft.trim().toLowerCase();
    if (next === value) return setEditing(false);
    if (!SHAPE.test(next)) return setProblem('Use lowercase letters, numbers and hyphens.');
    setSaving(true);
    try {
      if (onSave) await onSave(next);
      else onChange?.(next);
      setEditing(false);
      setProblem(null);
    } catch {
      // The caller reports why; the editor stays open with what was typed.
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className="ms-permalink" style={{ marginBottom: 20, display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 8 }}>
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          Address:
        </Typography.Text>
        {shown ? (
          <Typography.Text style={{ fontSize: 13, fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>{`${base}/${shown}`}</Typography.Text>
        ) : (
          <Typography.Text style={{ fontSize: 13, color: brand.textSubtle }}>Made from the {source} when you save</Typography.Text>
        )}
        {!disabled && (
          <Button type="link" size="small" style={{ paddingInline: 0 }} onClick={start}>
            Edit
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="ms-permalink" style={{ marginBottom: 20 }}>
      <Space.Compact style={{ width: '100%', maxWidth: 520 }}>
        <Input
          addonBefore={`${base}/`}
          value={draft}
          autoFocus
          maxLength={140}
          aria-label="Web address"
          aria-invalid={problem !== null}
          onChange={(event) => setDraft(event.target.value)}
          onPressEnter={() => void save()}
        />
        <Button type="primary" loading={saving} onClick={() => void save()}>
          Save
        </Button>
        <Button
          onClick={() => {
            setEditing(false);
            setProblem(null);
          }}
        >
          Cancel
        </Button>
      </Space.Compact>
      <Typography.Paragraph type={problem ? 'danger' : 'secondary'} style={{ fontSize: 12.5, margin: '6px 0 0' }} role={problem ? 'alert' : undefined}>
        {problem ?? note}
      </Typography.Paragraph>
    </div>
  );
}
