import { render } from '@testing-library/react';
import { Form } from 'antd';
import { FormSelect } from './FormSelect';

/**
 * A required select must say so on the control assistive technology uses, and
 * only there: the wrapper `div` has no role, so `aria-required` on it is an
 * invalid attribute (axe `aria-allowed-attr`, WCAG 4.1.2).
 */
describe('FormSelect', () => {
  it('marks the combobox required and leaves the wrapper alone', () => {
    const { container } = render(
      <Form>
        <Form.Item label="Severity" name="severity" rules={[{ required: true }]}>
          <FormSelect options={[{ value: 'warning', label: 'Warning' }]} />
        </Form.Item>
      </Form>,
    );
    const marked = [...container.querySelectorAll('[aria-required="true"]')];
    expect(marked).toHaveLength(1);
    expect(marked[0]).toHaveAttribute('role', 'combobox');
  });

  it('marks nothing when the field is optional', () => {
    const { container } = render(
      <Form>
        <Form.Item label="Severity" name="severity">
          <FormSelect options={[{ value: 'warning', label: 'Warning' }]} />
        </Form.Item>
      </Form>,
    );
    expect(container.querySelector('[aria-required]')).toBeNull();
  });
});
