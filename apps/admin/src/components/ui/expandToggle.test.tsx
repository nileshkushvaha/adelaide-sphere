import { render, screen } from '@testing-library/react';
import { Table } from 'antd';
import { expandToggle } from './expandToggle';
import { user } from '@/test/render';

interface Row {
  id: string;
  name: string;
}

/** A row's expand control must say what it opens and whether it is open (WCAG 4.1.2). */
describe('expandToggle', () => {
  it('names the row it opens and reports its state', async () => {
    const ui = user();
    render(
      <Table<Row>
        rowKey="id"
        dataSource={[{ id: 'e1', name: 'Priya' }]}
        columns={[{ title: 'Name', dataIndex: 'name' }]}
        expandable={{ expandIcon: expandToggle<Row>((row) => `the enquiry from ${row.name}`), expandedRowRender: () => <p>Details</p> }}
      />,
    );
    const toggle = screen.getByRole('button', { name: 'Show the enquiry from Priya' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await ui.click(toggle);
    expect(screen.getByRole('button', { name: 'Hide the enquiry from Priya' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Details')).toBeInTheDocument();
  });
});
