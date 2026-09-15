// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { ReviewForm } from './review-form';

/**
 * The rating control shows stars rather than the words "1 star … 5 stars", so
 * these tests hold the line that the words are still there for a screen reader
 * and that the control is still a native radio group.
 */
describe('ReviewForm rating', () => {
  const renderForm = () =>
    render(<ReviewForm businessId="b1" businessName="Runtime Check Cafe" turnstileSiteKey="1x00000000000000000000AA" guidelinesHref="/review-guidelines" />);

  it('offers one named radio per star and fills the stars up to the choice', async () => {
    const { container } = renderForm();
    const four = screen.getByRole('radio', { name: '4 stars' });
    expect(screen.getByRole('radio', { name: '1 star' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(5);

    fireEvent.click(four);
    expect(four).toBeChecked();
    // Filled stars are the visual state; the text beside them says the same thing.
    expect(container.querySelectorAll('label svg.fill-current')).toHaveLength(4);
    expect(screen.getByText('4 of 5')).toBeInTheDocument();

    const results = await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } });
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });
});

describe('ReviewForm acknowledgement link (SRS PRIV 001)', () => {
  it('links to the guidelines page once it is published', () => {
    render(<ReviewForm businessId="b1" businessName="Runtime Check Cafe" turnstileSiteKey="1x00000000000000000000AA" guidelinesHref="/review-guidelines" />);
    expect(screen.getByRole('link', { name: /review guidelines and privacy notice/i })).toHaveAttribute('href', '/review-guidelines');
  });

  it('keeps the wording but drops the link while the guidelines page is unpublished', () => {
    render(<ReviewForm businessId="b1" businessName="Runtime Check Cafe" turnstileSiteKey="1x00000000000000000000AA" guidelinesHref={null} />);
    expect(screen.queryByRole('link', { name: /review guidelines and privacy notice/i })).toBeNull();
    expect(screen.getByText(/review guidelines and privacy notice/i)).toBeInTheDocument();
  });
});
