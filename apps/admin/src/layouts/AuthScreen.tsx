import type { ReactNode } from 'react';
import { AuditOutlined, ClockCircleOutlined, LockOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { Brand } from '@/components/Brand';
import './auth-screen.css';

const FEATURES = [
  { icon: <AuditOutlined />, text: 'Every change is recorded in the activity log' },
  { icon: <SafetyCertificateOutlined />, text: 'Permissions are enforced by the server, not the screen' },
  { icon: <ClockCircleOutlined />, text: 'Sessions end after 30 minutes of inactivity' },
];

/**
 * The frame every signed-out screen uses: sign-in, the verification step,
 * forgotten password, reset and first-time set-up.
 *
 * It is the only page a visitor sees before they are anyone, so it carries the
 * product: a lit navy ground, the form on a frosted-glass card. The styling and
 * its contrast reasoning live in `auth-screen.css`.
 *
 * The form is first in the document. Screen-reader users and the first Tab land
 * on it directly; on a wide screen the brand panel is drawn to its left by the
 * grid, and on a phone the panel shrinks to the brand and one line so the form
 * is on the first screen.
 */
export function AuthScreen({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="ms-auth">
      <span className="ms-auth-orb ms-auth-orb--sky" aria-hidden="true" />
      <span className="ms-auth-orb ms-auth-orb--teal" aria-hidden="true" />

      <main id="main-content" tabIndex={-1} className="ms-auth-inner">
        <div className="ms-auth-card-wrap">
          {/* A plain container, not a named region: inside <main> a landmark that
              only repeats the page's h1 is noise for a screen reader. */}
          <div className="ms-auth-card">
            <h1 className="ms-auth-title">
              {title}
            </h1>
            {description && <p className="ms-auth-description">{description}</p>}
            {children}
          </div>
          <p className="ms-auth-below">
            <LockOutlined aria-hidden="true" />
            <span>Administrator access only. Sign-in attempts are limited and recorded.</span>
          </p>
        </div>

        <div className="ms-auth-intro">
          <Brand width={320} />
          <p className="ms-auth-headline">
            <span>The workspace behind Adelaide Sphere.</span>
          </p>
          <p className="ms-auth-lede">Listings, articles, moderation and the operational screens that keep the public site accurate.</p>
          <ul className="ms-auth-features" aria-label="How this workspace is protected">
            {FEATURES.map((feature) => (
              <li key={feature.text} className="ms-auth-feature">
                <span className="ms-auth-feature-icon" aria-hidden="true">
                  {feature.icon}
                </span>
                <span>{feature.text}</span>
              </li>
            ))}
          </ul>
          <p className="ms-auth-footnote">Adelaide Sphere · Adelaide only</p>
        </div>
      </main>
    </div>
  );
}
