"""Isolated deployment control-flow tests; never contact the VPS or run real services."""
import os, pathlib, tempfile, subprocess
source=pathlib.Path(__file__).with_name('deploy-vps.sh').read_text()
for mode in ['success','build-failure','health-failure','migration-failure']:
 with tempfile.TemporaryDirectory() as t:
  root=pathlib.Path(t); bin=root/'bin';bin.mkdir()
  for d in ['releases/old','shared','backups','services','nvm']: (root/d).mkdir(parents=True,exist_ok=True)
  (root/'current').symlink_to(root/'releases/old')
  for env in ['api','worker','web']: (root/f'shared/{env}.env').write_text('MEDIA_PUBLIC_BASE_URL=https://media.example.com\n')
  (root/'nvm/nvm.sh').write_text('nvm() { return 0; }\n')
  shim='''#!/usr/bin/env python3
import os,sys,pathlib
name=pathlib.Path(sys.argv[0]).name;a=sys.argv[1:];root=pathlib.Path(os.environ['TEST_ROOT']);mode=os.environ['TEST_MODE']
if name=='id': print('deploy')
elif name=='node': print('12.3.4')
elif name=='git':
 if 'rev-parse' in a: print('a'*40)
 if 'add' in a:
  p=pathlib.Path(a[-2]);(p/'apps/admin/dist').mkdir(parents=True);(p/'apps/admin/dist/index.html').write_text('ok')
elif name=='pnpm':
 if '--version' in a: print('12.3.4')
 if mode=='build-failure' and a==['--filter','web','build']: sys.exit(1)
 if mode=='migration-failure' and a==['db:migrate:status']: sys.exit(1)
elif name=='curl':
 if mode=='health-failure' and (root/'current').resolve()!=(root/'releases/old').resolve(): sys.exit(1)
elif name=='sudo':
 if 'docker' in a: print('-- mock database dump')
elif name=='mv': os.replace(a[-2],a[-1])
'''
  for cmd in ['id','node','git','pnpm','curl','sudo','mv','flock','chgrp','sleep']:
   p=bin/cmd;p.write_text(shim);p.chmod(0o755)
  script=root/'deploy.sh';script.write_text(source.replace('ROOT=/srv/adelaide-sphere',f'ROOT={root}').replace('export NVM_DIR=/home/deploy/.nvm',f'export NVM_DIR={root}/nvm'))
  env={**os.environ,'PATH':str(bin)+':'+os.environ['PATH'],'TEST_ROOT':str(root),'TEST_MODE':mode}
  result=subprocess.run(['bash',str(script)],env=env,capture_output=True,text=True)
  old=(root/'current').resolve()==(root/'releases/old').resolve()
  assert (result.returncode==0)==(mode=='success'),result.stdout+result.stderr
  assert old==(mode!='success'),(mode,result.stdout,result.stderr)
  if mode=='health-failure': assert 'Previous release restored' in result.stderr,result.stderr
  print(mode+': PASS')
