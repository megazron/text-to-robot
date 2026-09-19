"""Exercise all 17 designs in Chromium with third-party requests blocked.
Developer check: pip install playwright; playwright install chromium.
TTR_CHROMIUM may select an existing Chromium executable.
"""
import hashlib,json,os,subprocess,tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as td:
    server=subprocess.Popen(['node','apps/api/src/server.ts'],cwd=root,env={**os.environ,'PORT':'0','TTR_DATA_DIR':td},stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    try:
        line=server.stdout.readline();origin=line.split('http://')[1].split()[0];url='http://'+origin
        external=[];errors=[];responses=[];rows=[]
        with sync_playwright() as p:
            opts={'headless':True,'args':['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}
            if os.getenv('TTR_CHROMIUM'):opts['executable_path']=os.environ['TTR_CHROMIUM']
            browser=p.chromium.launch(**opts);page=browser.new_page(viewport={'width':1500,'height':950})
            def route(r):
                if r.request.url.startswith(url+'/') or r.request.url.startswith('data:'):r.continue_()
                else:external.append(r.request.url);r.abort()
            page.route('**/*',route)
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.on('response',lambda r:responses.append({'url':r.url.replace(url,''),'status':r.status}) if r.status>=400 else None)
            page.goto(url);page.wait_for_function('window.__ttr?.robot?.links.length>0')
            shots=root/'docs/img/web';shots.mkdir(exist_ok=True)
            for folder in sorted((root/'examples').glob('[0-9][0-9]_*')):
                prompt=(folder/'prompt.txt').read_text();spec=json.loads((folder/'robot.json').read_text());expected=spec['robot_name']
                page.fill('#prompt',prompt)
                with page.expect_response(lambda r:r.url.endswith('/api/robots/generate')) as request:page.click('#genbtn')
                assert request.value.status==200,(folder.name,request.value.text())
                page.wait_for_function('!document.querySelector("#genbtn").disabled');page.wait_for_load_state('networkidle')
                actual=page.evaluate('({name:window.__ttr.robot.robot_name,links:window.__ttr.robot.links.length,joints:window.__ttr.robot.joints.length})')
                assert actual['name']==expected,(folder.name,actual)
                assert actual['links']==len(spec['links']) and actual['joints']==len(spec['joints']),(folder.name,actual)
                rows.append({'example':folder.name,'pass':True,'source_robot_sha256':hashlib.sha256((folder/'robot.json').read_bytes()).hexdigest(),**actual})
                if folder.name in ['02_arm_6dof','07_mecanum','14_iron_man_mark_43','16_eva']:
                    page.screenshot(path=str(shots/(folder.name+'.png')))
            shared=page.url;page.reload();page.wait_for_function('window.__ttr?.robot?.links.length>0');page.wait_for_load_state('networkidle')
            assert page.evaluate('window.__ttr.robot.robot_name')==expected
            assert not external and not errors and not responses,(external,errors,responses)
            browser.close()
        report={'scope':'Chromium generation of all 17 examples with external network blocked; shared URL reload; not physical validation',
                'external_requests':external,'page_errors':errors,'failed_responses':responses,'shared_reload_pass':True,'examples':rows,
                'web_source_sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in (root/'apps/web/public').glob('*') if p.is_file()}}
        (root/'examples/web_validation.json').write_text(json.dumps(report,indent=2)+'\n')
        print(f'PASS: {len(rows)} designs, shared reload, no external requests or browser errors')
    finally:
        server.terminate();server.wait(timeout=10)
