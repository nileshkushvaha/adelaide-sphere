// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { PageMotion } from './page-motion';
import { MotionHeading } from './motion-heading';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

let intersect: IntersectionObserverCallback;
let reduced = false;
const cancel = vi.fn();
const observe = vi.fn();
const disconnect = vi.fn();
function entry(target: Element): IntersectionObserverEntry {
  const rect = target.getBoundingClientRect();
  return { target, isIntersecting: true, intersectionRatio: 1, boundingClientRect: rect, intersectionRect: rect, rootBounds: null, time: 0 };
}
const animate = vi.fn(() => ({ cancel, finished: new Promise(() => {}) }));

beforeEach(() => {
  reduced = false;
  vi.clearAllMocks();
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: IntersectionObserverCallback) { intersect = callback; }
    observe = observe;
    unobserve = vi.fn();
    disconnect = disconnect;
  });
  vi.stubGlobal('matchMedia', () => ({ matches: reduced, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  Element.prototype.animate = animate as unknown as typeof Element.prototype.animate;
});
afterEach(() => { vi.unstubAllGlobals(); delete (Element.prototype as { animate?: unknown }).animate; });

it('keeps the heading accessible and plays its character entrance only on intersection', () => {
  render(<><PageMotion /><main><h2><MotionHeading text="Local stories" /></h2></main></>);
  const heading = screen.getByRole('heading', { name: 'Local stories' });
  expect(animate).not.toHaveBeenCalled();
  act(() => intersect([entry(heading)], {} as IntersectionObserver));
  expect(animate).toHaveBeenCalledTimes(12);
  expect(animate.mock.calls[0]).toEqual(expect.arrayContaining([expect.objectContaining({ duration: 900 })]));
});

it('leaves content visible without scheduling animations for reduced motion', () => {
  reduced = true;
  render(<><PageMotion /><main><h2>Visible heading</h2></main></>);
  expect(screen.getByRole('heading')).toBeVisible();
  expect(observe).not.toHaveBeenCalled();
});

it('cancels movement on keyboard focus and disconnects on unmount', () => {
  const view = render(<><PageMotion /><main><h2>Heading</h2><button>Continue</button></main></>);
  act(() => intersect([entry(screen.getByRole('heading'))], {} as IntersectionObserver));
  fireEvent.focusIn(screen.getByRole('button'));
  expect(cancel).toHaveBeenCalled();
  view.unmount();
  expect(disconnect).toHaveBeenCalled();
});
