"""Isolated deployment control-flow tests; never contact the VPS or run real services."""
import os, pathlib, shutil, subprocess, tempfile, urllib.parse
repo=pathlib.Path(__file__).resolve().parent.parent
source=(repo/'scripts/deploy-vps.sh').read_text()
real_node=shutil.which('node') or 'node'
for mode in ['success','build-failure','health-failure','migration-failure','backup-failure']:
 with tempfile.TemporaryDirectory() as t:
  root=pathlib.Path(t); bin=root/'bin';bin.mkdir()
  for d in ['releases/old','shared','backups','services','nvm']: (root/d).mkdir(parents=True,exist_ok=True)
  (root/'current').symlink_to(root/'releases/old')
  for env in ['api','worker','web']: (root/f'shared/{env}.env').write_text('MEDIA_PUBLIC_BASE_URL=https://media.example.com\n')
  # The database is on 3317 and its credentials are percent-encoded: the port is
  # the defect this harness exists to catch, and it must survive the parser.
  ca=urllib.parse.quote(str(root/'shared/mysql-ca.pem'),safe='')
  (root/'shared/api.env').write_text(
   'MEDIA_PUBLIC_BASE_URL=https://media.example.com\n'
   f'DATABASE_URL=mysql://adelaide_sphere:p%40ss%2Fword@127.0.0.1:3317/adelaide_sphere?sslmode=verify-ca&sslca={ca}\n')
  (root/'shared/backup.env').write_text('MYSQL_BACKUP_PASSWORD=not-a-real-password\n')
  (root/'shared/backup-recipient.txt').write_text('age1exampleexampleexampleexample\n')
  (root/'shared/mysql-ca.pem').write_text('-- not a real certificate\n')
  (root/'nvm/nvm.sh').write_text('nvm() { return 0; }\n')
  shim='''#!/usr/bin/env python3
import os,pathlib,shutil,sys
name=pathlib.Path(sys.argv[0]).name;a=sys.argv[1:];root=pathlib.Path(os.environ['TEST_ROOT']);mode=os.environ['TEST_MODE']
if name=='id': print('deploy')
elif name=='node':
 if '-p' in a: print('12.3.4')
 elif any('bootstrap-admin' in x for x in a): pass
 else: os.execv(os.environ['REAL_NODE'],[os.environ['REAL_NODE']]+a)
elif name=='git':
 if 'rev-parse' in a: print('a'*40)
 if 'add' in a:
  p=pathlib.Path(a[-2]);(p/'apps/admin/dist').mkdir(parents=True);(p/'apps/admin/dist/index.html').write_text('ok')
  (p/'apps/web/.next/server/app').mkdir(parents=True);(p/'apps/web/.next/server/app/_not-found.html').write_text('ok')
  (p/'apps/api/dist/cli').mkdir(parents=True);(p/'apps/api/dist/cli/bootstrap-admin.js').write_text('')
  shutil.copytree(os.environ['TEST_REPO']+'/infrastructure/backup',str(p/'infrastructure/backup'))
elif name=='pnpm':
 open(str(root/'pnpm-calls.txt'),'a').write(' '.join(a)+chr(10))
 if '--version' in a: print('12.3.4')
 if mode=='build-failure' and a==['--filter','web','build']: sys.exit(1)
 if mode=='migration-failure' and a==['db:migrate:status']: sys.exit(1)
elif name=='mysqldump':
 # Record the target so the test can prove the port came from DATABASE_URL.
 (root/'mysqldump-args.txt').write_text(' '.join(a))
 if mode=='backup-failure': sys.exit(1)
 sys.stdout.write(os.urandom(4096).hex())   # incompressible, so gzip stays over the size floor
elif name=='age':
 out=a[a.index('--output')+1];open(out,'wb').write(sys.stdin.buffer.read())
elif name=='curl':
 if mode=='health-failure' and (root/'current').resolve()!=(root/'releases/old').resolve(): sys.exit(1)
elif name=='sudo':
 open(str(root/'sudo-calls.txt'),'a').write(' '.join(a)+chr(10))
 if 'docker' in a: print('-- mock database dump')
elif name=='stat': print('deploy')   # GNU `stat -c`; the VPS is Linux, this harness is not
elif name=='sed':                    # GNU `sed -i EXPR FILE`, likewise
 f=pathlib.Path(a[-1]);key=a[-2].strip('/^d').rstrip('=')
 f.write_text(''.join(l for l in f.read_text().splitlines(True) if not l.startswith(key+'=')))
elif name=='mv': os.replace(a[-2],a[-1])
'''
  for cmd in ['id','node','git','pnpm','curl','sudo','mv','flock','chgrp','sleep','mysqldump','age','stat','sed']:
   p=bin/cmd;p.write_text(shim);p.chmod(0o755)
  script=root/'deploy.sh';script.write_text(source.replace('ROOT=/srv/adelaide-sphere',f'ROOT={root}').replace('export NVM_DIR=/home/deploy/.nvm',f'export NVM_DIR={root}/nvm'))
  env={**os.environ,'PATH':str(bin)+':'+os.environ['PATH'],'TEST_ROOT':str(root),'TEST_MODE':mode,'TEST_REPO':str(repo),'REAL_NODE':real_node}
  result=subprocess.run(['bash',str(script)],env=env,capture_output=True,text=True)
  old=(root/'current').resolve()==(root/'releases/old').resolve()
  assert (result.returncode==0)==(mode=='success'),result.stdout+result.stderr
  assert old==(mode!='success'),(mode,result.stdout,result.stderr)
  if mode=='health-failure': assert 'Previous release restored' in result.stderr,result.stderr
  if mode!='build-failure':   # every other mode reaches the backup step
   args=(root/'mysqldump-args.txt').read_text()
   # The whole point of deriving the target from DATABASE_URL, not defaulting to 3306.
   assert '--port=3317' in args and '--host=127.0.0.1' in args,args
   assert 'adelaide_sphere' in args,args
  if mode=='success':
   # nginx must be able to read both release outputs it serves, checked as www-data.
   sudo=(root/'sudo-calls.txt').read_text()
   for f in ['apps/admin/dist/index.html','apps/web/.next/server/app/_not-found.html']:
    assert f'-u www-data test -r ' in sudo and f in sudo,(f,sudo)
   assert list((root/'backups/before-deploy').glob('*.age')),'no backup was written'
   assert 'Backing up adelaide_sphere from 127.0.0.1:3317' in result.stdout,result.stdout
  if mode=='backup-failure':
   # The point of the pre-deploy backup: a failed one must stop before the schema changes.
   calls=(root/'pnpm-calls.txt').read_text()
   assert 'db:migrate:deploy' not in calls,calls
   assert not list((root/'backups/before-deploy').glob('*.age')),'a failed backup left a file behind'
  print(mode+': PASS')
