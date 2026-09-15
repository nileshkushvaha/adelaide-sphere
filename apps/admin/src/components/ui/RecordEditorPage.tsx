import { useState, type ReactNode } from 'react';
import { Alert, Button, Form, Space, Spin, type FormInstance } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router';
import { PageHeader, type Crumb } from './PageHeader';
import { SectionCard } from './SectionCard';
import { StickyActions } from './StickyActions';
import { useUnsavedChanges } from '@/shared/useUnsavedChanges';

interface Props<Values> {
  /** Breadcrumbs ending at this record; the last crumb is the page itself. */
  crumbs: Crumb[];
  title: string;
  description?: ReactNode;
  /** Where "Back" and a successful save return to. */
  listHref: string;
  listLabel: string;
  form: FormInstance<Values>;
  initialValues?: Partial<Values>;
  /** Rendered inside the form; the fields for this record. */
  children: ReactNode;
  /** Below the form: read-only context such as who approved it and when. */
  aside?: ReactNode;
  loading?: boolean;
  saving?: boolean;
  /** Whole-form error, e.g. a stale version or a failed request. */
  error?: string | null;
  /** Shown in the save bar: version, last edited, unsaved state. */
  status?: ReactNode;
  onSubmit: () => void | Promise<void>;
  /** Extra actions beside Save, e.g. publish or approve. */
  actions?: ReactNode;
  submitLabel?: string;
  /** Set when the record cannot be edited, with the reason. */
  readOnlyReason?: string | null;
  /**
   * Overrides the shell's own tracking, for an editor that decides "changed"
   * some other way. Normally leave it alone: the shell owns the form, so it can
   * see the edits itself and every editor gets the same warning for free.
   */
  dirty?: boolean;
  /**
   * Lay the fields out in as many readable columns as the window allows. Turn
   * it off for an editor whose fields are already arranged by hand.
   */
  columns?: boolean;
}

/**
 * One layout for every record editor in the admin (SRS ADM 002).
 *
 * Editing happens on a page, not in a dialog: a dialog constrains a form to a
 * box, hides the record's context behind it, cannot be linked to or reloaded,
 * and traps focus in a scrolling area. A page can be bookmarked, opened in a
 * new tab, and read at the width the content actually needs, and the save bar
 * stays in view without stealing the screen.
 *
 * Confirmations stay as dialogs: a destructive action needs an interruption,
 * and ADM 002 requires one.
 */
export function RecordEditorPage<Values>({
  crumbs,
  title,
  description,
  listHref,
  listLabel,
  form,
  initialValues,
  children,
  aside,
  loading = false,
  saving = false,
  error = null,
  status,
  onSubmit,
  actions,
  submitLabel = 'Save',
  readOnlyReason = null,
  dirty,
  columns = true,
}: Props<Values>) {
  const navigate = useNavigate();
  const [touched, setTouched] = useState(false);
  const changed = dirty ?? touched;
  // Nothing in this application saves on its own, so leaving with edits in the
  // form loses them.
  useUnsavedChanges(changed && !saving);

  return (
    <div>
      <PageHeader
        crumbs={crumbs}
        title={title}
        description={description}
        actions={
          <Link to={listHref}>
            <Button icon={<ArrowLeftOutlined />}>{listLabel}</Button>
          </Link>
        }
      />

      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} role="alert" />}
      {readOnlyReason && <Alert type="info" showIcon message={readOnlyReason} style={{ marginBottom: 16 }} />}

      <Spin spinning={loading}>
        {/* Two columns only where there is room for both. The column sizes are
            in the stylesheet, not inline, because they change at a breakpoint:
            an inline `1fr 320px` held at every width squeezed the form to zero
            on a phone while the side column pushed the page sideways. */}
        <div className={aside ? 'ms-editor-grid ms-editor-grid--aside' : 'ms-editor-grid'}>
          <SectionCard>
            <Form<Values>
              form={form}
              layout="vertical"
              initialValues={initialValues}
              disabled={saving || Boolean(readOnlyReason)}
              // Submitting with Enter should do what the Save button does.
              onFinish={() => void onSubmit()}
              onValuesChange={() => setTouched(true)}
            >
              <div className={columns ? 'ms-form-grid' : undefined}>{children}</div>
            </Form>
          </SectionCard>
          {/* The side column follows the reader down a long form, the way the
              business editor's publishing panel does — a panel that scrolls out
              of sight is a panel you have to scroll back up to use. It sticks
              only where there are two columns; stacked on a narrow screen it is
              part of the page. */}
          {aside && <div className="ms-editor-sidebar">{aside}</div>}
        </div>

        {!readOnlyReason && (
          <StickyActions status={changed ? 'You have unsaved changes.' : status}>
            <Space wrap>
              {actions}
              <Button onClick={() => navigate(listHref)} disabled={saving}>
                Cancel
              </Button>
              <Button type="primary" loading={saving} onClick={() => void onSubmit()}>
                {submitLabel}
              </Button>
            </Space>
          </StickyActions>
        )}
      </Spin>
    </div>
  );
}
