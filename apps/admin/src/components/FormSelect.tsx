import { useCallback, useLayoutEffect, useRef, type Ref } from 'react';
import { Select, type RefSelectProps, type SelectProps } from 'antd';

type Props = SelectProps & { 'aria-required'?: boolean | 'true' | 'false'; ref?: Ref<RefSelectProps> };

/**
 * An Ant Design `Select` for a required form field.
 *
 * `Form.Item` marks its control `aria-required`, and `Select` copies that one
 * prop to two places: the combobox input, where it belongs, and the wrapper
 * `div`, which has no role and may not carry it (axe `aria-allowed-attr`,
 * WCAG 4.1.2). The library offers no way to keep it off the wrapper, so this
 * takes the prop before `Select` sees it and sets it on the combobox itself.
 * Assistive technology is told exactly what it was told before; the invalid
 * copy is gone.
 *
 * Use it wherever a required `Form.Item` wraps a select; everything else about
 * it is `Select`.
 */
export function FormSelect({ 'aria-required': ariaRequired, ref: forwarded, ...props }: Props) {
  const own = useRef<RefSelectProps | null>(null);
  const required = ariaRequired === true || ariaRequired === 'true';
  // Form.Item passes a ref of its own (it uses it to scroll to a failing field),
  // so both are kept rather than one replacing the other.
  const ref = useCallback(
    (instance: RefSelectProps | null) => {
      own.current = instance;
      if (typeof forwarded === 'function') forwarded(instance);
      else if (forwarded) (forwarded as { current: RefSelectProps | null }).current = instance;
    },
    [forwarded],
  );

  // Runs after every render because Select may re-create its input (switching
  // between single and multiple mode, for instance); setting an attribute on an
  // element that already has it costs nothing.
  useLayoutEffect(() => {
    const combobox = own.current?.nativeElement?.querySelector('input[role="combobox"]');
    if (!combobox) return;
    if (required) combobox.setAttribute('aria-required', 'true');
    else combobox.removeAttribute('aria-required');
  });

  return <Select ref={ref} {...props} />;
}
