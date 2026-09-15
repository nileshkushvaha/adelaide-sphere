import { useState } from 'react';
import type { FormInstance } from 'antd';
import { useOnError } from '@refinedev/core';
import { isApiError } from '@/api/errors';
import { errorMessage, fieldErrors } from './useAsync';

/**
 * The submit half of every record editor, in one place.
 *
 * Each editor screen used to repeat the same six lines: sign the administrator
 * out on an expired session, explain a stale version in words rather than a
 * code, put field errors on the fields the API named, and fall back to one
 * message. Repeated, it drifted — one screen said "Close and reload", another
 * showed the raw envelope message — so the wording is now decided once, next to
 * the reason for it.
 *
 * `submit` runs `validateFields` first and does nothing if the form is invalid,
 * because Ant Design has already marked the fields and a second message on top
 * of that is noise.
 */
export function useRecordEditor<Values>(form: FormInstance<Values>) {
  const { mutate: onAuthError } = useOnError();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * @param work what to do with the validated values; return normally to mean
   *   success, throw to have the error explained on screen.
   * @returns true when `work` completed, so the caller can navigate.
   */
  const submit = async (work: (values: Values) => Promise<void>): Promise<boolean> => {
    setError(null);
    let values: Values;
    try {
      values = await form.validateFields();
    } catch {
      return false;
    }
    setSaving(true);
    try {
      await work(values);
      return true;
    } catch (thrown) {
      if (isApiError(thrown) && thrown.kind === 'unauthorized') {
        onAuthError(thrown);
        return false;
      }
      if (isApiError(thrown) && thrown.code === 'STALE_VERSION') {
        setError('This was changed by someone else. Reload the page and make your change again.');
        return false;
      }
      const errors = fieldErrors(thrown);
      if (Object.keys(errors).length > 0) form.setFields(Object.entries(errors).map(([name, list]) => ({ name, errors: list })) as never);
      setError(Object.values(errors).flat()[0] ?? errorMessage(thrown));
      return false;
    } finally {
      setSaving(false);
    }
  };

  return { saving, error, setError, submit };
}
