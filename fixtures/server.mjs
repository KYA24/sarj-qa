import http from 'node:http';
import {readFile} from 'node:fs/promises';
const bookings = new Map(); let nextId = 2;
bookings.set('1',{id:'1',guestName:'Demo Guest',checkIn:'2026-12-01',checkOut:'2026-12-03',nights:2});
const server = http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  if(url.pathname==='/health') return send(200,{status:'ok',target:'LOCAL DEMONSTRATION FIXTURE — not Nuzul production'});
  if(url.pathname==='/openapi.json') {res.writeHead(200,{'Content-Type':'application/json'});return res.end(await readFile(new URL('./nuzul.openapi.json',import.meta.url)));}
  if(url.pathname==='/protected') return req.headers.authorization==='Bearer fixture-token'?send(200,{authorized:true}):send(401,{error:'Bearer authentication required'});
  if(url.pathname==='/echo-auth') return send(200,{echo:req.headers.authorization||'',nested:{token:req.headers.authorization||''}});
  if(url.pathname==='/slow') return setTimeout(()=>send(200,{done:true}),12000);
  if(url.pathname==='/redirect') {res.writeHead(302,{Location:'http://169.254.169.254/latest/meta-data/'});return res.end();}
  if(url.pathname==='/bookings' && req.method==='GET') return send(200,[...bookings.values()]);
  const match=url.pathname.match(/^\/bookings\/([^/]+)$/);
  if(match && req.method==='GET') return bookings.has(match[1])?send(200,bookings.get(match[1])):send(404,{error:'Booking not found'});
  if((url.pathname==='/bookings' && req.method==='POST') || (match && ['PUT','PATCH'].includes(req.method))){
    let raw='';try {for await(const chunk of req){raw+=chunk;if(raw.length>65536)return send(413,{error:'Too large'});} const body=JSON.parse(raw);
      const previous=match?bookings.get(match[1]):undefined;if(match&&!previous)return send(404,{error:'Booking not found'});
      const merged={...previous,...body};
      if(!merged.guestName||!merged.checkIn||!merged.checkOut||!Number.isFinite(Date.parse(merged.checkIn))||!Number.isFinite(Date.parse(merged.checkOut))) return send(400,{error:'guestName and valid ISO checkIn/checkOut are required'});
      // INTENTIONAL DEFECT: missing checkOut > checkIn validation. Contract requires 400.
      const booking={...merged,id:match?match[1]:String(nextId++),nights:(Date.parse(merged.checkOut)-Date.parse(merged.checkIn))/86400000};
      bookings.set(booking.id,booking);return send(match?200:201,booking);
    }catch {return send(400,{error:'Malformed JSON'});}
  }
  return send(404,{error:'Not found'});
});
server.listen(Number(process.env.FIXTURE_PORT||5190),'127.0.0.1',()=>console.log('Nuzul LOCAL FIXTURE http://127.0.0.1:'+server.address().port));
