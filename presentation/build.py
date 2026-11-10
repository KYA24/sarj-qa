from pathlib import Path
import json
import re
root=Path(__file__).parent
logo='<svg class="logo" viewBox="0 0 48 48" aria-hidden="true"><path d="m24 7 18 9-18 9-18-9Z M6 23l18 9 18-9 M6 30l18 9 18-9"/></svg>'
# Approved audience-first content is kept separately for straightforward editing.
from slide_content import slides

manifest={'slides':[{'sceneId':s[0],'notes':s[4],'fragments':[i*10+j for j in sorted({int(n) for n in re.findall(r'data-reveal="(\d+)"',s[3])})]} for i,s in enumerate(slides)]}
island='<script type="application/hyperframes-slideshow+json">'+json.dumps(manifest,ensure_ascii=False)+'</script>'
parts=[]
for i,(id,label,title,body,note,nfr) in enumerate(slides):
    parts.append(f'<section id="{id}" class="slide clip" data-composition-id="{id}" data-start="{i*10}" data-duration="10" data-width="1920" data-height="1080" data-label="{label}"><header class="head"><span class="brand">{logo} SARJ</span><span class="section">{label}</span></header><h1>{title}</h1>{body}</section>')
composition='''<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>سرج · العرض</title><link rel="stylesheet" href="assets/deck.css"><script src="assets/gsap.min.js"></script></head><body>'''+island+'<div data-composition-id="root" data-start="0" data-duration="100" data-width="1920" data-height="1080"></div>'+''.join(parts)+'''<script>
(()=>{const scenes=[...document.querySelectorAll('.slide')];let current=-1;const root=gsap.timeline({paused:true});root.to({},{duration:100});window.__timelines=window.__timelines||{};window.__timelines.root=root;
function show(t){const next=Math.min(scenes.length-1,Math.max(0,Math.floor(t/10)));for(let i=0;i<scenes.length;i++){let active=i===next;scenes[i].classList.toggle('active',active);scenes[i].setAttribute('aria-hidden',String(!active));if(active){scenes[i].querySelectorAll('[data-reveal]').forEach(el=>el.classList.toggle('shown',t>=i*10+Number(el.dataset.reveal)-.01))}}current=next;document.body.dataset.slide=String(next+1);document.body.dataset.time=String(t);}
root.eventCallback('onUpdate',()=>show(root.time()));window.__hfSetTime=show;show(0);const post=()=>parent.postMessage({source:'hf-preview',type:'timeline',durationInFrames:3000,scenes:scenes.map(el=>({id:el.id,start:Number(el.dataset.start),duration:10}))},'*');window.addEventListener('load',()=>setTimeout(post,150));setTimeout(post,300);
})();</script></body></html>'''
composition=composition.replace('data-duration="100"','data-duration="'+str(len(slides)*10)+'"').replace('duration:100','duration:'+str(len(slides)*10)).replace('durationInFrames:3000','durationInFrames:'+str(len(slides)*300))
(root/'composition/index.html').write_text(composition)
wrapper='''<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>سرج QA · عرض المشروع التفاعلي</title><style>@font-face{font-family:Brando;src:url('composition/assets/Brando-Regular.woff2')}*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;background:#0a111a;color:#e6eef5;font-family:Brando,sans-serif}hyperframes-slideshow{display:block;position:relative;width:100vw;height:100dvh;outline:none}hyperframes-player{position:absolute;inset:0}noscript{padding:40px;display:block}</style><script src="composition/assets/hyperframes-player.global.js"></script><script src="composition/assets/hyperframes-slideshow.global.js"></script></head><body><hyperframes-slideshow tabindex="0" notes-storage-key="sarj-qa-evaluator-v2"><hyperframes-player interactive src="composition/index.html"></hyperframes-player>'''+island+'''</hyperframes-slideshow><noscript>يلزم تفعيل JavaScript لتشغيل العرض التفاعلي.</noscript><script>customElements.whenDefined('hyperframes-slideshow').then(()=>{const deck=document.querySelector('hyperframes-slideshow');deck.focus({preventScroll:true})});</script></body></html>'''
(root/'index.html').write_text(wrapper)
(root/'hyperframes.json').write_text(json.dumps({'name':'sarj-qa-presentation','entry':'composition/index.html','width':1920,'height':1080,'fps':30},indent=2))
