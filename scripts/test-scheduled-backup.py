"""Isolated scheduled-backup control-flow tests; never contact a database or a remote."""
import os, pathlib, subprocess, tempfile, urllib.parse
repo = pathlib.Path(__file__).resolve().parent.parent
script = repo / 'infrastructure/backup/run-scheduled-backup.sh'
failures = []

SHIM = '''#!/usr/bin/env python3
import os,pathlib,sys
name=pathlib.Path(sys.argv[0]).name;a=sys.argv[1:];root=pathlib.Path(os.environ['TEST_ROOT'])
mode=os.environ.get('TEST_MODE','')
if name=='mysqldump':
 open(str(root/'mysqldump-args.txt'),'a').write(' '.join(a)+chr(10))
 if mode=='dump-failure': sys.exit(1)
 sys.stdout.write(os.urandom(4096).hex())
elif name=='age':
 out=a[a.index('--output')+1];open(out,'wb').write(sys.stdin.buffer.read())
elif name=='docker':
 open(str(root/'docker-args.txt'),'a').write(' '.join(a)+chr(10))
 if 'inspect' in a:
  if mode=='container-down': sys.exit(1)
  print('true')
 elif 'mysql' in a and '-e' in a:
  q=a[-1]   # the SQL; docker's own `-e MYSQL_PWD` comes first
  if q=='SELECT @@log_bin': print('0' if mode=='binlog-off' else '1')
  elif q=='SELECT @@log_bin_basename': print('/var/lib/mysql/binlog')
  elif q=='SHOW BINARY LOGS':
   for n in os.environ.get('TEST_BINLOGS','binlog.000001 binlog.000002').split(): print(n+chr(9)+'100'+chr(9)+'No')
 elif 'cat' in a:
  sys.stdout.write('binlog-bytes-for-'+a[-1])
 elif mode=='mirror-failure': sys.exit(1)
elif name=='rclone':
 open(str(root/'rclone-args.txt'),'a').write(' '.join(a)+chr(10))
 if mode=='rclone-failure': sys.exit(1)
'''


def make_root(tmp, offsite='', extra_backup_env=''):
    """A believable /srv/adelaide-sphere, with the env-file quirks the real one has."""
    root = pathlib.Path(tmp)
    for d in ['shared', 'backups/daily', 'backups/weekly', 'bin']:
        (root / d).mkdir(parents=True, exist_ok=True)
    ca = urllib.parse.quote(str(root / 'shared/mysql-ca.pem'), safe='')
    # Unquoted `&`, exactly as docs/operations/deployment-vps.md writes it: this
    # file must be read, not sourced, or DATABASE_URL comes back empty.
    (root / 'shared/api.env').write_text(
        'NODE_ENV=production\n'
        f'DATABASE_URL=mysql://adelaide_sphere:p%40ss%2Fword@127.0.0.1:3317/adelaide_sphere?sslmode=verify-ca&sslca={ca}\n')
    (root / 'shared/mysql-ca.pem').write_text('-- not a real certificate\n')
    (root / 'shared/backup.env').write_text(
        'MYSQL_BACKUP_PASSWORD=not-a-real-password\n'
        + (f'BACKUP_OFFSITE_REMOTE={offsite}\n' if offsite else '')
        + extra_backup_env)
    (root / 'shared/backup-recipient.txt').write_text('age1exampleexampleexampleexample\n')
    for cmd in ['mysqldump', 'age', 'rclone', 'docker']:
        p = root / 'bin' / cmd
        p.write_text(SHIM)
        p.chmod(0o755)
    return root


def run(root, tier, mode='', extra_args=(), drop_from_path=()):
    binpath = str(root / 'bin')
    path = binpath + ':' + os.environ['PATH']
    if drop_from_path:
        # Simulate a tool not being installed, by hiding the shim for it.
        for cmd in drop_from_path:
            (root / 'bin' / cmd).unlink(missing_ok=True)
    env = {**os.environ, 'PATH': path, 'TEST_ROOT': str(root), 'TEST_MODE': mode,
           'BACKUP_ROOT': str(root), 'BACKUP_NO_BINLOG_POSITION': '1'}
    return subprocess.run(['bash', str(script), '--tier', tier, *extra_args],
                          env=env, capture_output=True, text=True)


def check(name, condition, detail=''):
    if condition:
        print(f'{name}: PASS')
    else:
        failures.append(name)
        print(f'{name}: FAIL {detail}')


def state(root, tier):
    text = (root / f'backups/state/{tier}.state').read_text()
    return dict(line.split('=', 1) for line in text.splitlines())


def seed(dir, stamps, size=2048):
    """Backup files named and checksummed the way backup-database.sh writes them."""
    import hashlib
    dir.mkdir(parents=True, exist_ok=True)
    for s in stamps:
        f = dir / f'adelaide_sphere-{s}.sql.gz.age'
        blob = os.urandom(size)
        f.write_bytes(blob)
        # shasum records the path exactly as it was given it.
        (dir / f'{f.name}.sha256').write_text(f'{hashlib.sha256(blob).hexdigest()}  {f}\n')


# --- argument validation ----------------------------------------------------
with tempfile.TemporaryDirectory() as t:
    root = make_root(t)
    r = run(root, 'hourly')
    check('rejects an unknown tier', r.returncode == 2 and 'daily or --tier weekly' in r.stderr, r.stderr)
    r = subprocess.run(['bash', str(script), '--tier', 'daily', '--nonsense'],
                       env={**os.environ, 'BACKUP_ROOT': str(root)}, capture_output=True, text=True)
    check('rejects an unknown flag', r.returncode == 2, r.stderr)

# --- the target comes from DATABASE_URL, not a default ----------------------
with tempfile.TemporaryDirectory() as t:
    root = make_root(t)
    r = run(root, 'daily')
    args = (root / 'mysqldump-args.txt').read_text()
    check('dumps the port from DATABASE_URL, not 3306',
          r.returncode == 0 and '--port=3317' in args and '--port=3306' not in args, args + r.stderr)
    check('logs the derived and effective target',
          'derived=127.0.0.1:3317 effective=127.0.0.1:3317' in r.stdout, r.stdout)
    check('uses the provisioned backup account by default',
          'user=adelaide_sphere_backup' in r.stdout, r.stdout)
    ck = list((root / 'backups/daily').glob('*.sha256'))
    check('the dump checksum names the file, so it verifies after a download',
          ck and '/' not in ck[0].read_text().split()[1], [c.read_text() for c in ck])
    check('writes a backup and a checksum',
          len(list((root / 'backups/daily').glob('*.age'))) == 1
          and len(list((root / 'backups/daily').glob('*.sha256'))) == 1, r.stdout)
    s = state(root, 'daily')
    check('records success in the state file',
          s['last_run_success'] == '1' and int(s['last_success_epoch']) > 0 and int(s['size_bytes']) > 1024, s)
    check('records that off-site is not configured', s['offsite_configured'] == '0', s)

# --- the override wins, for the docker-wrapper case -------------------------
with tempfile.TemporaryDirectory() as t:
    root = make_root(t, extra_backup_env='BACKUP_DB_PORT=3306\nBACKUP_DB_HOST=127.0.0.1\n')
    r = run(root, 'daily')
    args = (root / 'mysqldump-args.txt').read_text()
    check('BACKUP_DB_PORT overrides the derived port',
          r.returncode == 0 and '--port=3306' in args, args + r.stderr)
    check('still logs both targets so the journal shows the swap',
          'derived=127.0.0.1:3317 effective=127.0.0.1:3306' in r.stdout, r.stdout)

# --- a failed dump ----------------------------------------------------------
with tempfile.TemporaryDirectory() as t:
    root = make_root(t)
    r = run(root, 'daily', mode='dump-failure')
    check('a failed dump fails the run', r.returncode != 0, r.stdout)
    check('a failed dump leaves no partial backup behind',
          not list((root / 'backups/daily').glob('*.age')), list((root / 'backups/daily').iterdir()))
    s = state(root, 'daily')
    check('a failed dump records failure with no success time',
          s['last_run_success'] == '0' and s['last_success_epoch'] == '0', s)

# --- a failure after an earlier success preserves the success clock ---------
with tempfile.TemporaryDirectory() as t:
    root = make_root(t)
    run(root, 'daily')
    good = int(state(root, 'daily')['last_success_epoch'])
    r = run(root, 'daily', mode='dump-failure')
    s = state(root, 'daily')
    check('a later failure keeps the previous success time',
          s['last_run_success'] == '0' and int(s['last_success_epoch']) == good, (good, s))
    check('a later failure still moves the run time forward',
          int(s['last_run_epoch']) >= good, s)

# --- --record-failure-only (the OnFailure unit) -----------------------------
with tempfile.TemporaryDirectory() as t:
    root = make_root(t)
    run(root, 'daily')
    good = int(state(root, 'daily')['last_success_epoch'])
    before = len(list((root / 'backups/daily').glob('*.age')))
    r = run(root, 'daily', extra_args=('--record-failure-only',))
    s = state(root, 'daily')
    check('--record-failure-only records a failure without dumping',
          r.returncode == 0 and s['last_run_success'] == '0'
          and int(s['last_success_epoch']) == good
          and len(list((root / 'backups/daily').glob('*.age'))) == before, s)

# --- weekly promotion -------------------------------------------------------
with tempfile.TemporaryDirectory() as t:
    root = make_root(t)
    run(root, 'daily')
    daily = list((root / 'backups/daily').glob('*.age'))[0]
    r = run(root, 'weekly')
    promoted = root / 'backups/weekly' / daily.name
    check('weekly promotes the newest daily', r.returncode == 0 and promoted.exists(), r.stdout + r.stderr)
    check('promotion does not take a second dump',
          (root / 'mysqldump-args.txt').read_text().count(chr(10)) == 1, r.stdout)
    check('promotion hard-links rather than copying',
          promoted.stat().st_ino == daily.stat().st_ino, 'expected a shared inode')
    check('the promoted checksum names the promoted file, not the daily path',
          (promoted.parent / f'{promoted.name}.sha256').read_text().strip().endswith(promoted.name),
          (promoted.parent / f'{promoted.name}.sha256').read_text())
    verify = subprocess.run(['shasum', '-a', '256', '-c', f'{promoted.name}.sha256'],
                            cwd=promoted.parent, capture_output=True, text=True)
    check('the promoted checksum actually verifies', verify.returncode == 0, verify.stdout + verify.stderr)
    r2 = run(root, 'weekly')
    check('promoting twice is harmless', r2.returncode == 0 and 'already holds' in r2.stdout, r2.stdout)

# --- weekly refuses a stale daily -------------------------------------------
with tempfile.TemporaryDirectory() as t:
    root = make_root(t)
    seed(root / 'backups/daily', ['20260101T030000Z'])
    r = run(root, 'weekly')
    check('weekly refuses to promote a daily older than 48h',
          r.returncode != 0 and 'older than 48 hours' in r.stderr, r.stderr)
    check('the refusal is recorded as a failure', state(root, 'weekly')['last_run_success'] == '0', '')

with tempfile.TemporaryDirectory() as t:
    root = make_root(t)
    r = run(root, 'weekly')
    check('weekly with no daily at all fails clearly',
          r.returncode != 0 and 'No daily backup to promote' in r.stderr, r.stderr)

# --- pruning ----------------------------------------------------------------
with tempfile.TemporaryDirectory() as t:
    root = make_root(t)
    daily_dir = root / 'backups/daily'
    # 40 days of history, one per day, oldest first.
    import datetime
    now = datetime.datetime.now(datetime.timezone.utc)
    stamps = [(now - datetime.timedelta(days=d)).strftime('%Y%m%dT%H%M%SZ') for d in range(1, 41)]
    seed(daily_dir, stamps)
    r = run(root, 'daily')
    left = sorted(p.name for p in daily_dir.glob('*.age'))
    # 40 seeded + 1 fresh dump; everything past 30 days old goes.
    check('prunes to the retention window', r.returncode == 0 and 30 <= len(left) <= 32, len(left))
    check('keeps the newest', any(now.strftime('%Y%m%d') in n for n in left), left[-3:])
    check('removes checksums with their backups',
          len(list(daily_dir.glob('*.sha256'))) == len(left), (len(left), len(list(daily_dir.glob('*.sha256')))))

with tempfile.TemporaryDirectory() as t:
    root = make_root(t)
    weekly_dir = root / 'backups/weekly'
    # Two files, both far outside the window: min_keep must save them.
    seed(weekly_dir, ['20200101T030000Z', '20200102T030000Z'])
    seed(root / 'backups/daily', [__import__('datetime').datetime.now(__import__('datetime').timezone.utc).strftime('%Y%m%dT%H%M%SZ')])
    r = run(root, 'weekly')
    check('never prunes below two backups, however old',
          r.returncode == 0 and len(list(weekly_dir.glob('*.age'))) >= 2,
          [p.name for p in weekly_dir.glob('*.age')])

with tempfile.TemporaryDirectory() as t:
    root = make_root(t)
    daily_dir = root / 'backups/daily'
    seed(daily_dir, ['20200101T030000Z', '20200102T030000Z', '20200103T030000Z'])
    odd = daily_dir / 'restored-by-hand.sql.gz.age'
    odd.write_bytes(os.urandom(2048))
    r = run(root, 'daily')
    check('keeps a file whose name has no timestamp, and says so',
          odd.exists() and 'no timestamp in its name' in r.stderr, r.stderr)

with tempfile.TemporaryDirectory() as t:
    root = make_root(t)
    daily_dir = root / 'backups/daily'
    orphan = daily_dir / 'adelaide_sphere-20200101T030000Z.sql.gz.age.sha256'
    orphan.write_text('0' * 64 + '  gone\n')
    r = run(root, 'daily')
    check('sweeps an orphaned checksum', r.returncode == 0 and not orphan.exists(), r.stdout)

# --- off-site ---------------------------------------------------------------
with tempfile.TemporaryDirectory() as t:
    root = make_root(t, offsite='offsite:as-backups/db')
    r = run(root, 'daily')
    args = (root / 'rclone-args.txt').read_text()
    s = state(root, 'daily')
    check('copies the backup and its checksum off-site',
          r.returncode == 0 and args.count('copyto') == 2 and '.sha256' in args, args + r.stderr)
    check('never deletes off-site', 'delete' not in args and 'sync' not in args, args)
    check('records the off-site success',
          s['offsite_configured'] == '1' and int(s['offsite_last_success_epoch']) > 0, s)

with tempfile.TemporaryDirectory() as t:
    root = make_root(t, offsite='offsite:as-backups/db')
    r = run(root, 'daily', mode='rclone-failure')
    check('a broken off-site copy fails the run', r.returncode != 0, r.stdout)
    check('a broken off-site copy is recorded as a failure',
          state(root, 'daily')['last_run_success'] == '0', '')

with tempfile.TemporaryDirectory() as t:
    root = make_root(t, offsite='offsite:as-backups/db')
    r = run(root, 'daily', drop_from_path=('rclone',))
    check('a configured remote with no rclone installed fails loudly',
          r.returncode != 0 and 'rclone is not installed' in r.stderr, r.stderr)

# --- disk space guard -------------------------------------------------------
with tempfile.TemporaryDirectory() as t:
    root = make_root(t, extra_backup_env='BACKUP_MIN_FREE_MB=100000000\n')   # ~95 TB
    r = run(root, 'daily')
    check('refuses to start a backup that could fill the disk',
          r.returncode != 0 and 'Refusing to start a backup' in r.stderr, r.stderr)
    check('the disk guard runs before the dump, not after',
          not (root / 'mysqldump-args.txt').exists(), 'mysqldump was called anyway')
    check('a refusal on disk space is recorded as a failure',
          state(root, 'daily')['last_run_success'] == '0', '')

with tempfile.TemporaryDirectory() as t:
    root = make_root(t)
    r = run(root, 'daily')
    check('records free disk space so it can be alerted on',
          r.returncode == 0 and int(state(root, 'daily')['disk_free_bytes']) > 0, state(root, 'daily'))
    check('reports the free and required space in the journal',
          'disk:' in r.stdout and 'MB free' in r.stdout, r.stdout)

# --- the encryptor must match the recipient ---------------------------------
with tempfile.TemporaryDirectory() as t:
    root = make_root(t)
    (root / 'shared/backup-recipient.txt').write_text('age1exampleexampleexampleexample\n')
    r = run(root, 'daily', drop_from_path=('age',))
    check('refuses an age recipient when age is not installed',
          r.returncode != 0 and 'age is not installed' in r.stderr, r.stderr)
    check('refusing to encrypt writes no backup at all',
          not list((root / 'backups/daily').glob('*')), list((root / 'backups/daily').iterdir()))

# --- a nonsense BACKUP_ROOT is refused before anything is deleted -----------
with tempfile.TemporaryDirectory() as t:
    root = make_root(t)
    env = {**os.environ, 'BACKUP_ROOT': '/', 'PATH': str(root / 'bin') + ':' + os.environ['PATH'],
           'TEST_ROOT': str(root), 'TEST_MODE': ''}
    r = subprocess.run(['bash', str(script), '--tier', 'daily'], env=env, capture_output=True, text=True)
    check('refuses a BACKUP_ROOT that is not a real deployment root',
          r.returncode == 2 and 'absolute path' in r.stderr, r.stderr)

# --- env files are read, never sourced --------------------------------------
with tempfile.TemporaryDirectory() as t:
    root = make_root(t)
    marker = root / 'sourced'
    (root / 'shared/backup.env').write_text(
        'MYSQL_BACKUP_PASSWORD=not-a-real-password\n'
        f'EVIL=$(touch {marker})\n')
    r = run(root, 'daily')
    check('an env file cannot execute code', not marker.exists(), 'the env file was sourced')

# --- media mirror -----------------------------------------------------------
mirror = repo / 'infrastructure/backup/mirror-media.sh'


def run_mirror(root, mode='', env_extra=None):
    env = {**os.environ, 'PATH': str(root / 'bin') + ':' + os.environ['PATH'],
           'TEST_ROOT': str(root), 'TEST_MODE': mode, 'BACKUP_ROOT': str(root), **(env_extra or {})}
    return subprocess.run(['bash', str(mirror)], env=env, capture_output=True, text=True)


with tempfile.TemporaryDirectory() as t:
    root = make_root(t)
    r = run_mirror(root)
    s = state(root, 'media-mirror')
    check('an unconfigured media mirror is a no-op, not a failure',
          r.returncode == 0 and s['offsite_configured'] == '0', r.stdout + r.stderr)
    check('an unconfigured media mirror says the files exist only on this server',
          'BACK 001 unmet' in r.stdout, r.stdout)
    check('an unconfigured media mirror never calls docker',
          not (root / 'docker-args.txt').exists(), 'docker was called')

with tempfile.TemporaryDirectory() as t:
    root = make_root(t)
    (root / 'shared/backup.env').write_text(
        'MYSQL_BACKUP_PASSWORD=not-a-real-password\nMEDIA_MIRROR_TARGET=offsite/as-backups-media\n')
    r = run_mirror(root)
    args = (root / 'docker-args.txt').read_text()
    check('mirrors the media bucket off-site', r.returncode == 0 and 'mc mirror' in args, args + r.stderr)
    check('the mirror never deletes at the far end',
          '--remove' not in args and ' rm ' not in args, args)
    check('records a successful mirror',
          state(root, 'media-mirror')['last_run_success'] == '1', '')

with tempfile.TemporaryDirectory() as t:
    root = make_root(t)
    (root / 'shared/backup.env').write_text(
        'MYSQL_BACKUP_PASSWORD=not-a-real-password\nMEDIA_MIRROR_TARGET=offsite/as-backups-media\n')
    r = run_mirror(root, mode='container-down')
    check('a stopped MinIO container fails the mirror loudly',
          r.returncode != 0 and 'is not running' in r.stderr, r.stderr)
    check('a failed mirror is recorded',
          state(root, 'media-mirror')['last_run_success'] == '0', '')

with tempfile.TemporaryDirectory() as t:
    root = make_root(t)
    (root / 'shared/backup.env').write_text(
        'MYSQL_BACKUP_PASSWORD=not-a-real-password\nMEDIA_MIRROR_TARGET=offsite/as-backups-media\n')
    run_mirror(root)
    good = int(state(root, 'media-mirror')['last_success_epoch'])
    run_mirror(root, mode='mirror-failure')
    s = state(root, 'media-mirror')
    check('a failed mirror keeps the previous success time',
          s['last_run_success'] == '0' and int(s['last_success_epoch']) == good, (good, s))

# --- binlog archive ---------------------------------------------------------
archiver = repo / 'infrastructure/backup/archive-binlogs.sh'


def run_archive(root, mode='', binlogs='binlog.000001 binlog.000002 binlog.000003'):
    env = {**os.environ, 'PATH': str(root / 'bin') + ':' + os.environ['PATH'], 'TEST_ROOT': str(root),
           'TEST_MODE': mode, 'BACKUP_ROOT': str(root), 'TEST_BINLOGS': binlogs}
    return subprocess.run(['bash', str(archiver)], env=env, capture_output=True, text=True)


def ledger(root):
    f = root / 'backups/binlogs/uploaded.list'
    return f.read_text().split() if f.exists() else []


with tempfile.TemporaryDirectory() as t:
    root = make_root(t)
    r = run_archive(root)
    check('an unconfigured binlog archive is a no-op that says the RPO is unmet',
          r.returncode == 0 and 'BACK 001 unmet' in r.stdout and not (root / 'docker-args.txt').exists(), r.stdout + r.stderr)

with tempfile.TemporaryDirectory() as t:
    root = make_root(t, offsite='offsite:as-backups/db')
    r = run_archive(root)
    docker = (root / 'docker-args.txt').read_text()
    uploads = (root / 'rclone-args.txt').read_text()
    check('flushes so the open log closes before copying', r.returncode == 0 and 'FLUSH BINARY LOGS' in docker, r.stderr)
    check('archives every closed log and not the open one',
          ledger(root) == ['binlog.000001', 'binlog.000002'] and 'binlog.000003' not in uploads, (ledger(root), uploads))
    check('uploads each log with its checksum', uploads.count('copyto') == 4 and '.sha256' in uploads, uploads)
    check('never puts the database password on docker\'s command line',
          'not-a-real-password' not in docker, docker)
    sums = sorted((root / 'backups/binlogs').glob('*.sha256'))
    check('checksums name the file, not a server path',
          sums and all('/' not in f.read_text().split()[1] for f in sums), [f.read_text() for f in sums])
    r2 = run_archive(root, binlogs='binlog.000001 binlog.000002 binlog.000003 binlog.000004')
    check('a second run archives only the newly closed log',
          r2.returncode == 0 and ledger(root)[-1] == 'binlog.000003' and '1 log(s) archived' in r2.stdout, r2.stdout)
    check('records success', state(root, 'binlog-archive')['last_run_success'] == '1', '')

with tempfile.TemporaryDirectory() as t:
    root = make_root(t, offsite='offsite:as-backups/db')
    run_archive(root, binlogs='binlog.000001 binlog.000002 binlog.000003')
    r = run_archive(root, binlogs='binlog.000007 binlog.000008')
    check('a log purged before it was archived is reported as a gap',
          r.returncode != 0 and 'Binlog gap' in r.stderr, r.stderr)
    check('a gap is recorded as a failure', state(root, 'binlog-archive')['last_run_success'] == '0', '')

with tempfile.TemporaryDirectory() as t:
    root = make_root(t, offsite='offsite:as-backups/db')
    r = run_archive(root, mode='rclone-failure')
    check('a failed upload is not recorded as archived, so it is retried',
          r.returncode != 0 and ledger(root) == [], ledger(root))
    r = run_archive(root)
    check('the retry archives it', r.returncode == 0 and ledger(root) == ['binlog.000001', 'binlog.000002'], r.stderr)

with tempfile.TemporaryDirectory() as t:
    root = make_root(t, offsite='offsite:as-backups/db')
    r = run_archive(root, mode='binlog-off')
    check('refuses when binary logging is off', r.returncode != 0 and 'Binary logging is OFF' in r.stderr, r.stderr)

with tempfile.TemporaryDirectory() as t:
    root = make_root(t, offsite='offsite:as-backups/db')
    r = run_archive(root, binlogs='binlog.000001 ../../etc/passwd binlog.000003')
    check('refuses a log name that could escape the directory',
          r.returncode != 0 and 'Unexpected binlog name' in r.stderr, r.stderr)

# --- failure notifier -------------------------------------------------------
notifier = repo / 'infrastructure/backup/notify-failure.sh'
with tempfile.TemporaryDirectory() as t:
    root = make_root(t)
    r = subprocess.run(['bash', str(notifier), '--unit', 'adelaide-sphere-backup@daily.service'],
                       env={**os.environ, 'BACKUP_ROOT': str(root)}, capture_output=True, text=True)
    check('the notifier exits 0 with nothing configured, rather than burying the failure',
          r.returncode == 0 and 'BACKUP_ALERT_EMAIL is not set' in r.stderr, r.stderr)

with tempfile.TemporaryDirectory() as t:
    root = make_root(t)
    (root / 'shared/backup.env').write_text(
        'MYSQL_BACKUP_PASSWORD=not-a-real-password\nBACKUP_ALERT_EMAIL=ops@example.com\n')
    (root / 'shared/api.env').write_text(
        (root / 'shared/api.env').read_text()
        + 'MAIL_TRANSPORT=smtp\nSMTP_HOST=127.0.0.1\nSMTP_PORT=1\nMAIL_FROM_ADDRESS=backups@example.com\n')
    r = subprocess.run(['bash', str(notifier), '--unit', 'adelaide-sphere-backup@daily.service'],
                       env={**os.environ, 'BACKUP_ROOT': str(root)}, capture_output=True, text=True)
    check('the notifier still exits 0 when the mail server is unreachable',
          r.returncode == 0 and 'COULD NOT SEND' in r.stderr, r.stderr)
    check('a failed notification says the backup failure still stands',
          'failure itself stands' in r.stderr, r.stderr)

print()
if failures:
    raise SystemExit(f'{len(failures)} check(s) failed: ' + ', '.join(failures))
print('all checks passed')
