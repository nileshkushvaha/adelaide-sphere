/**
 * Where a session was signed in from.
 *
 * The stored address is evidence and is never rewritten — this only decides how
 * it reads on an ordinary screen. A loopback address means the browser is on the
 * same machine as the server, which is true of a developer's laptop and of
 * nothing else; calling that "this computer" would be a guess about the reader,
 * so it says what it actually knows.
 */
export function readableAddress(value: string | null): string {
  if (!value) return 'Address not recorded';
  // `::ffff:127.0.0.1` is how the stack writes an IPv4 address inside IPv6.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(value);
  const address = mapped ? mapped[1]! : value;
  return address === '127.0.0.1' || address === '::1' ? 'Same machine as the server' : address;
}

/**
 * A user-agent string is not a device name. This reports only the browser and
 * operating-system family — enough for an administrator to recognise their own
 * session, and no more than that. An unrecognised string is reported as
 * unrecognised rather than guessed at.
 */
export function readableClient(value: string | null): string {
  if (!value) return 'Unknown device';
  const browser = /Edg\//.test(value)
    ? 'Edge'
    : /OPR\//.test(value)
      ? 'Opera'
      : /Chrome\//.test(value)
        ? 'Chrome'
        : /Firefox\//.test(value)
          ? 'Firefox'
          : /Safari\//.test(value)
            ? 'Safari'
            : null;
  const platform = /iPhone|iPad/.test(value)
    ? 'iOS'
    : /Android/.test(value)
      ? 'Android'
      : /Macintosh|Mac OS X/.test(value)
        ? 'macOS'
        : /Windows/.test(value)
          ? 'Windows'
          : /Linux/.test(value)
            ? 'Linux'
            : null;
  if (!browser && !platform) return 'Unrecognised device';
  if (!platform) return browser!;
  if (!browser) return `Unrecognised browser on ${platform}`;
  return `${browser} on ${platform}`;
}

