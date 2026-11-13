(() => {
  const $ = id => document.getElementById(id);
  function showGate() {
    const welcome=$('welcomeGate'), gate=$('authGate');
    if(welcome) { welcome.style.display='none'; welcome.setAttribute('aria-hidden','true'); }
    if(gate) { gate.style.display='flex'; gate.style.visibility='visible'; gate.style.opacity='1'; gate.style.zIndex='2147483647'; gate.setAttribute('aria-hidden','false'); }
    $('authPhone')?.focus();
  }
  window.openRegister=showGate;
  window.authAction=async function(action) {
    const phone=String($('authPhone')?.value||'').replace(/\D/g,'');
    const password=String($('authPassword')?.value||'');
    const msg=$('authMessage');
    if(!msg)return;
    if(!/^\d{10,15}$/.test(phone)){msg.textContent='Valid phone number country code ke saath enter karein.';return;}
    if(!/^\S{6,64}$/.test(password)){msg.textContent='Password 6-64 characters ka hona chahiye (spaces allowed nahi).';return;}
    const btn=$(action==='login'?'loginButton':'registerButton');
    if(btn){btn.disabled=true;btn.textContent='PLEASE WAIT...';}
    msg.textContent='Server se connect ho raha hai...';
    try {
      const r=await fetch('/api/auth/'+action,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone,password})});
      let d;try{d=await r.json()}catch{throw new Error('Server ka response read nahi hua (HTTP '+r.status+').')}
      msg.textContent=d.message||d.error||('Request complete (HTTP '+r.status+')');
      if(r.ok&&action==='login'){
        if($('authGate'))$('authGate').style.display='none';
        if($('welcomeGate'))$('welcomeGate').style.display='none';
        if(document.querySelector('.wrap'))document.querySelector('.wrap').style.display='block';
        if(typeof window.refreshStatus==='function')window.refreshStatus();
        if(typeof window.loadDisplayName==='function')window.loadDisplayName();
        if(typeof window.loadSupportTickets==='function')window.loadSupportTickets();
      } else if(r.ok&&action==='register') msg.textContent=(d.message||'Registration successful.')+' Ab admin approval ke baad login karein.';
    } catch(e){msg.textContent='Connection error: '+(e?.message||'Network error')+'. Dobara try karein.';}
    finally{if(btn){btn.disabled=false;btn.textContent=action==='login'?'LOGIN':'REGISTER';}}
  };
  window.forgotAccount=async function(){
    const phone=String($('authPhone')?.value||'').replace(/\D/g,'');
    const password=String($('authPassword')?.value||'');
    const msg=$('authMessage');
    if(!/^\d{10,15}$/.test(phone)){if(msg)msg.textContent='Phone number country code ke saath enter karein.';return;}
    if(!/^\S{6,64}$/.test(password)){if(msg)msg.textContent='Account delete karne ke liye password enter karein.';return;}
    if(prompt('Account data permanently delete karne ke liye DELETE type karein:')!=='DELETE')return;
    try{const r=await fetch('/api/auth/forgot',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone,password,confirm:'DELETE'})});const d=await r.json();if(msg)msg.textContent=d.message||d.error||'Request complete';}
    catch(e){if(msg)msg.textContent='Server connection failed: '+(e?.message||'Network error');}
  };
  $('welcomeStartButton')?.addEventListener('click',e=>{e.preventDefault();showGate();});
  $('loginButton')?.addEventListener('click',e=>{e.preventDefault();window.authAction('login');});
  $('registerButton')?.addEventListener('click',e=>{e.preventDefault();window.authAction('register');});
  document.querySelector('#authGate button[onclick="forgotAccount()"]')?.addEventListener('click',e=>{e.preventDefault();window.forgotAccount();});
})();