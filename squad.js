/* One invite, one remote player. Game data travels directly between the two browsers. */
(() => {
 const VERSION=1;
 const cleanName=name=>String(name||'Friend').replace(/[^\p{L}\p{N} _-]/gu,'').trim().slice(0,16)||'Friend';
 const randomKey=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
 class IronSquad {
  constructor(callbacks={}){this.callbacks=callbacks;this.role=null;this.connected=false;this.status='solo';this.name='You';this.remoteName='Friend';this.peer=null;this.conn=null;this.ticket='';this.link='';this.generation=0;this.busy=false;this.timer=null;this.lastSeen=0;this.ready=false}
  update(status,detail=''){this.status=status;this.detail=detail;this.callbacks.status?.(this)}
  async open(role,name){
   this.leave(false);const generation=++this.generation;this.role=role;this.name=cleanName(name);this.update('connecting','Connecting to the squad service…');
   if(!window.Peer||!window.RTCPeerConnection){this.update('error','This browser cannot connect a squad. Try a current Safari, Chrome or Edge browser.');return false}
   return await new Promise(resolve=>{
    let settled=false;const done=ok=>{if(!settled){settled=true;clearTimeout(timeout);resolve(ok)}};
    const peer=this.peer=new Peer('ironsector-'+randomKey(),{debug:0,secure:true,config:{iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun.cloudflare.com:3478'}]}});
    const timeout=setTimeout(()=>{if(generation===this.generation){peer.destroy();this.update('error','Squad service unavailable. Try again; solo play still works.')}done(false)},12000);
    peer.on('open',()=>{if(generation!==this.generation){peer.destroy();done(false);return}done(true)});
    peer.on('connection',conn=>this.incoming(conn,generation));
    peer.on('error',err=>{if(generation!==this.generation)return;done(false);if(!this.connected)this.update('error',err.type==='peer-unavailable'?'Your friend is offline or this invite expired. Ask them for a new invite.':'Could not connect. Try again or switch networks. Solo play is still available.')});
    peer.on('disconnected',()=>{if(generation!==this.generation||peer.destroyed)return;if(!this.connected)this.update('error','Squad service disconnected. Create or join an invite again.')});
   });
  }
  async host(name){if(!await this.open('host',name))return;this.ticket=randomKey();const url=new URL(location.href);url.hash='squad='+this.peer.id+'.'+this.ticket;this.link=url.href;this.update('waiting','Invite one friend. Keep this tab open while they join.')}
  async join(invite,name){
   let match;try{match=new URL(invite,location.href).hash.match(/^#squad=(ironsector-[a-f0-9]{32})\.([a-f0-9]{32})$/)}catch{}
   if(!match){this.update('error','That invite link is not valid. Paste the complete link your friend shared.');return}
   if(!await this.open('guest',name))return;this.update('joining','Connecting to your friend…');
   const conn=this.peer.connect(match[1],{reliable:true,serialization:'json',metadata:{version:VERSION,ticket:match[2],name:this.name}});this.attach(conn,this.generation,false);
  }
  incoming(conn,generation){
   if(generation!==this.generation){conn.close();return}
   let reason='';
   if(this.role!=='host'||conn.metadata?.version!==VERSION||conn.metadata?.ticket!==this.ticket)reason='This invitation is not valid.';
   else if(this.conn||this.connected)reason='Squad full. Only the host and one friend can join.';
   else if(this.busy)reason='A match is running. Ask your friend to return to the loadout first.';
   if(reason){conn.on('open',()=>{conn.send({type:'reject',reason});setTimeout(()=>conn.close(),200)});setTimeout(()=>conn.close(),5000);return}
   this.remoteName=cleanName(conn.metadata.name);this.attach(conn,generation,true);
  }
  attach(conn,generation,host){
   this.conn=conn;const timeout=setTimeout(()=>{if(this.conn===conn&&!this.connected){this.conn=null;conn.close();this.update('error','Could not reach your friend. Try another network and a new invite.')}},18000);
   conn.on('open',()=>{if(generation!==this.generation)return;if(host){clearTimeout(timeout);this.connected=true;this.ready=false;this.lastSeen=Date.now();conn.send({type:'welcome',version:VERSION,name:this.name});this.update('connected',this.remoteName+' is online · 2/2 players');this.callbacks.joined?.();this.heartbeat()}});
   conn.on('data',data=>{
    if(generation!==this.generation||this.conn!==conn||!data||typeof data!=='object')return;
    this.lastSeen=Date.now();
    if(data.type==='reject'){clearTimeout(timeout);this.conn=null;conn.close();this.update('error',String(data.reason).slice(0,150));return}
    if(data.type==='welcome'&&!host){if(data.version!==VERSION){this.leave();this.update('error','Game versions differ. Both players should refresh.');return}this.connected=true;this.remoteName=cleanName(data.name);this.lastSeen=Date.now();clearTimeout(timeout);this.update('connected',this.remoteName+' is online · 2/2 players');this.heartbeat();this.callbacks.joined?.();return}
    if(!this.connected)return;
    if(data.type==='ping'){this.send({type:'pong'});return}if(data.type==='pong')return;
    this.callbacks.message?.(data);
   });
   const closed=()=>{clearTimeout(timeout);if(generation!==this.generation||this.conn!==conn)return;this.conn=null;const wasConnected=this.connected;this.connected=false;this.ready=false;clearInterval(this.timer);this.update('disconnected',this.remoteName+' disconnected. Solo play is available.');if(wasConnected)this.callbacks.left?.()};
   conn.on('close',closed);conn.on('error',closed);
  }
  heartbeat(){clearInterval(this.timer);this.timer=setInterval(()=>{if(!this.connected)return;if(Date.now()-this.lastSeen>14000){const conn=this.conn;this.conn=null;this.connected=false;this.ready=false;clearInterval(this.timer);conn?.close();this.update('disconnected','Connection lost. Your squad mate went offline.');this.callbacks.left?.();return}this.send({type:'ping'})},2000)}
  send(data){if(!this.connected||!this.conn?.open)return false;try{if(this.conn.bufferSize>32)return false;this.conn.send(data);return true}catch{return false}}
  leave(notify=true){const wasConnected=this.connected,previousRole=this.role;++this.generation;clearInterval(this.timer);const peer=this.peer;this.conn=null;this.peer=null;this.connected=false;this.ready=false;this.role=null;this.link='';this.busy=false;peer?.destroy();if(notify){this.update('solo','Squad closed. You can play solo or invite another friend.');if(wasConnected)this.callbacks.left?.(previousRole)}}
 }
 window.IronSquad=IronSquad;
})();
