(function(){
  var btn=document.querySelector('.menu-btn'),links=document.querySelector('.links');
  if(btn&&links){btn.addEventListener('click',function(){var o=links.classList.toggle('open');btn.setAttribute('aria-expanded',o)});
    links.addEventListener('click',function(e){if(e.target.tagName==='A')links.classList.remove('open')});}

  // preselect plan in waitlist from pricing buttons
  document.querySelectorAll('[data-plan]').forEach(function(a){a.addEventListener('click',function(){
    var s=document.getElementById('wl-plan');if(s)s.value=a.dataset.plan;
  })});

  // waitlist: no backend yet, opens the visitor's email app with a prefilled message
  var f=document.getElementById('waitlist');
  if(f){f.addEventListener('submit',function(e){
    e.preventDefault();
    var email=f.email.value.trim(),plan=f.plan?f.plan.value:'';
    var msg=document.getElementById('form-msg');
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){msg.textContent='Please enter a valid email address.';return;}
    var body='Please add me to the AbideBot waitlist.%0D%0A%0D%0AEmail: '+encodeURIComponent(email)+'%0D%0APlan of interest: '+encodeURIComponent(plan||'Not sure yet');
    window.location.href='mailto:'+f.dataset.to+'?subject='+encodeURIComponent('AbideBot waitlist')+'&body='+body;
    msg.textContent='Your email app should open with a prefilled request. Send it and you are on the list. No payment is taken.';
  })}
  // munu examples run through a module script and a Worker, which browsers refuse on file:// pages
  if(location.protocol==='file:'){document.querySelectorAll('pre.xcode[data-munu="run"],pre.xcode[data-munu="check"],pre.xcode[data-munu="error"]').forEach(function(p){
    var bar=p.closest('.mx')&&p.closest('.mx').querySelector('.mx-bar');if(!bar)return;
    var n=document.createElement('span');n.className='mx-note';n.textContent='Open this page over http to edit and run it';bar.insertBefore(n,bar.firstChild);
  })}
  var y=document.getElementById('yr');if(y)y.textContent=new Date().getFullYear();
})();
